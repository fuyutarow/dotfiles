// The declaration is repo-owned; ~/.codex/config.toml remains Codex-owned. Read with Bun's real
// TOML parser, then edit only the declared top-level assignments to preserve every other byte.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { attempt } from "../hooks/attempt.ts";
import { jsonOf, z } from "../hooks/zod.ts";

const RecordSchema = z.record(z.string(), z.unknown());
const ApprovalPolicySchema = z.enum(["on-request", "never"]);
const ApprovalsReviewerSchema = z.enum(["user", "auto_review"]);

function topLevelValues(declared: Declared) {
  return {
    model_context_window: declared.modelContextWindow,
    model_auto_compact_token_limit: declared.modelAutoCompactTokenLimit,
    approval_policy: declared.approvalPolicy,
    approvals_reviewer: declared.approvalsReviewer,
  };
}
const MANAGED_MCP_COMMENT = "# codex-dotfiles-mcp-managed:";
const McpNameSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/u);
const McpEntrySchema = z.object({
  type: z.string().optional(),
  url: z.string().optional(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});
const McpDeclarationSchema = z.object({
  mcpServers: z.record(McpNameSchema, McpEntrySchema),
});

export type McpServer =
  | { type: "http"; url: string }
  | {
      type: "stdio";
      command: string;
      args: string[];
      env: Record<string, string>;
    };

export type Declared = {
  networkAccess: boolean;
  modelContextWindow: number;
  modelAutoCompactTokenLimit: number;
  approvalPolicy: z.output<typeof ApprovalPolicySchema>;
  approvalsReviewer: z.output<typeof ApprovalsReviewerSchema>;
  mcpServers: Record<string, McpServer>;
};
export type Live = {
  contents: string | null;
  networkAccess: boolean | null;
  modelContextWindow: number | null;
  modelAutoCompactTokenLimit: number | null;
  approvalPolicy: string | null;
  approvalsReviewer: string | null;
  mcpServers: Record<string, McpServer>;
  managedMcpNames: string[];
};

function values(parsed: unknown): Omit<Declared, "mcpServers"> | Error {
  const root = RecordSchema.safeParse(parsed);
  if (!root.success) return new Error("not TOML");
  const table = RecordSchema.safeParse(root.data.sandbox_workspace_write);
  const network = z
    .boolean()
    .safeParse(table.success ? table.data.network_access : undefined);
  const context = z.number().int().safeParse(root.data.model_context_window);
  const compact = z
    .number()
    .int()
    .safeParse(root.data.model_auto_compact_token_limit);
  const approval = ApprovalPolicySchema.safeParse(root.data.approval_policy);
  const reviewer = ApprovalsReviewerSchema.safeParse(
    root.data.approvals_reviewer,
  );
  if (
    network.success &&
    context.success &&
    compact.success &&
    approval.success &&
    reviewer.success
  ) {
    return {
      networkAccess: network.data,
      modelContextWindow: context.data,
      modelAutoCompactTokenLimit: compact.data,
      approvalPolicy: approval.data,
      approvalsReviewer: reviewer.data,
    };
  }
  return new Error(
    "Codex declaration requires network_access boolean, integer model limits, approval_policy (on-request|never), and approvals_reviewer (user|auto_review)",
  );
}

async function declaredMcpServers(
  dotfiles: string,
): Promise<Record<string, McpServer> | Error> {
  const path = join(dotfiles, ".mcp.json");
  const parsed = await attempt(() =>
    jsonOf(McpDeclarationSchema).safeParse(readFileSync(path, "utf8")),
  );
  if (!parsed.ok || !parsed.value.success)
    return new Error(`${path}: unreadable or invalid MCP declaration`);
  const servers: Record<string, McpServer> = {};
  for (const [name, entry] of Object.entries(parsed.value.data.mcpServers)) {
    if (entry.type === "http" && entry.url !== undefined) {
      servers[name] = { type: "http", url: entry.url };
      continue;
    }
    if (entry.type === "stdio" && entry.command !== undefined) {
      servers[name] = {
        type: "stdio",
        command: entry.command,
        args: entry.args ?? [],
        env: entry.env ?? {},
      };
      continue;
    }
    return new Error(
      `${path}: ${name} must be http with url or stdio with command`,
    );
  }
  return servers;
}

export async function readDeclared(
  dotfiles: string,
): Promise<Declared | Error> {
  const path = join(dotfiles, "agents/codex/config.declared.toml");
  const parsed = await attempt(() =>
    Bun.TOML.parse(readFileSync(path, "utf8")),
  );
  if (!parsed.ok) return new Error(`${path}: unreadable or not TOML`);
  const result = values(parsed.value);
  if (result instanceof Error) return new Error(`${path}: ${result.message}`);
  const mcpServers = await declaredMcpServers(dotfiles);
  return mcpServers instanceof Error ? mcpServers : { ...result, mcpServers };
}

function liveMcpServer(value: unknown): McpServer | undefined {
  const entry = RecordSchema.safeParse(value);
  if (!entry.success) return undefined;
  const url = z.string().safeParse(entry.data.url);
  if (url.success) return { type: "http", url: url.data };
  const command = z.string().safeParse(entry.data.command);
  if (!command.success) return undefined;
  const args = z.array(z.string()).safeParse(entry.data.args);
  const env = z.record(z.string(), z.string()).safeParse(entry.data.env);
  return {
    type: "stdio",
    command: command.data,
    args: args.success ? args.data : [],
    env: env.success ? env.data : {},
  };
}

function managedMcpNames(contents: string | null): string[] {
  const line = contents
    ?.split("\n")
    .find((candidate) => candidate.startsWith(MANAGED_MCP_COMMENT));
  return line === undefined
    ? []
    : line
        .slice(MANAGED_MCP_COMMENT.length)
        .trim()
        .split(",")
        .map((name) => name.trim())
        .filter((name) => McpNameSchema.safeParse(name).success)
        .toSorted();
}

export async function readLive(home: string): Promise<Live | Error> {
  const path = join(home, ".codex/config.toml");
  if (!existsSync(path)) {
    return {
      contents: null,
      networkAccess: null,
      modelContextWindow: null,
      modelAutoCompactTokenLimit: null,
      approvalPolicy: null,
      approvalsReviewer: null,
      mcpServers: {},
      managedMcpNames: [],
    };
  }
  const read = await attempt(() => readFileSync(path, "utf8"));
  if (!read.ok) return new Error(`${path}: unreadable or not TOML`);
  const parsed = await attempt(() => Bun.TOML.parse(read.value));
  if (!parsed.ok) return new Error(`${path}: unreadable or not TOML`);
  const root = RecordSchema.safeParse(parsed.value);
  if (!root.success) return new Error(`${path}: unreadable or not TOML`);
  const table = RecordSchema.safeParse(root.data.sandbox_workspace_write);
  const network = z
    .boolean()
    .safeParse(table.success ? table.data.network_access : undefined);
  const context = z.number().int().safeParse(root.data.model_context_window);
  const compact = z
    .number()
    .int()
    .safeParse(root.data.model_auto_compact_token_limit);
  const approval = z.string().safeParse(root.data.approval_policy);
  const reviewer = z.string().safeParse(root.data.approvals_reviewer);
  const mcpTable = RecordSchema.safeParse(root.data.mcp_servers);
  const mcpServers = Object.fromEntries(
    Object.entries(mcpTable.success ? mcpTable.data : {}).flatMap(
      ([name, value]) => {
        const server = liveMcpServer(value);
        return server === undefined ? [] : [[name, server] as const];
      },
    ),
  );
  return {
    contents: read.value,
    networkAccess: network.success ? network.data : null,
    modelContextWindow: context.success ? context.data : null,
    modelAutoCompactTokenLimit: compact.success ? compact.data : null,
    approvalPolicy: approval.success ? approval.data : null,
    approvalsReviewer: reviewer.success ? reviewer.data : null,
    mcpServers,
    managedMcpNames: managedMcpNames(read.value),
  };
}

export function drift(declared: Declared, live: Live): string[] {
  const lines = [
    live.approvalPolicy === declared.approvalPolicy
      ? null
      : `approval_policy=${String(live.approvalPolicy)}, declared ${declared.approvalPolicy}`,
    live.approvalsReviewer === declared.approvalsReviewer
      ? null
      : `approvals_reviewer=${String(live.approvalsReviewer)}, declared ${declared.approvalsReviewer}`,
    live.networkAccess === declared.networkAccess
      ? null
      : `sandbox_workspace_write.network_access=${String(live.networkAccess)}, declared ${declared.networkAccess}`,
    live.modelContextWindow === declared.modelContextWindow
      ? null
      : `model_context_window=${String(live.modelContextWindow)}, declared ${declared.modelContextWindow}`,
    live.modelAutoCompactTokenLimit === declared.modelAutoCompactTokenLimit
      ? null
      : `model_auto_compact_token_limit=${String(live.modelAutoCompactTokenLimit)}, declared ${declared.modelAutoCompactTokenLimit}`,
  ];
  const managed = new Set(live.managedMcpNames);
  const mcpLines = Object.entries(declared.mcpServers).flatMap(
    ([name, server]) =>
      JSON.stringify(live.mcpServers[name]) === JSON.stringify(server)
        ? []
        : [`mcp_servers.${name} differs from .mcp.json`],
  );
  const stale = live.managedMcpNames
    .filter(
      (name) =>
        !Object.hasOwn(declared.mcpServers, name) &&
        Object.hasOwn(live.mcpServers, name),
    )
    .map((name) => `mcp_servers.${name} is no longer declared`);
  const unmanagedDeclared = Object.keys(declared.mcpServers)
    .filter(
      (name) => !Object.hasOwn(live.mcpServers, name) && !managed.has(name),
    )
    .map((name) => `mcp_servers.${name} missing from ~/.codex/config.toml`);
  return [
    ...lines.flatMap((line) => (line === null ? [] : [line])),
    ...mcpLines,
    ...stale,
    ...unmanagedDeclared,
  ];
}

function replaceScalar(
  line: string,
  key: string,
  value: number | string,
): string | null {
  const assignment = new RegExp(
    `^(\\s*${key}\\s*=\\s*)(?:"(?:[^"\\\\]|\\\\.)*"|'[^']*'|[+-]?[\\d_]+)(\\s*(?:#.*)?)$`,
    "u",
  ).exec(line);
  return assignment === null
    ? null
    : `${assignment[1]}${JSON.stringify(value)}${assignment[2]}`;
}

function replaceBoolean(line: string, value: boolean): string | null {
  const assignment =
    /^(\s*network_access\s*=\s*)(true|false)(\s*(?:#.*)?)$/u.exec(line);
  return assignment === null
    ? null
    : `${assignment[1]}${value}${assignment[3]}`;
}

function updateTopLevelLine(
  line: string,
  declared: Declared,
): { line: string; key: string } | null {
  for (const [key, value] of Object.entries(topLevelValues(declared))) {
    const changed = replaceScalar(line, key, value);
    if (changed !== null) return { line: changed, key };
  }
  return null;
}

function updateNetworkTable(
  lines: string[],
  start: number,
  limit: number,
  declared: boolean,
): boolean {
  let present = false;
  for (let index = start; index < limit; index += 1) {
    const changed = replaceBoolean(lines[index]!, declared);
    if (changed === null) continue;
    present = true;
    lines[index] = changed;
  }
  return present;
}

function mcpTableName(line: string): string | undefined {
  const match = /^\s*\[mcp_servers\.([a-zA-Z0-9_-]+)\]\s*(?:#.*)?$/u.exec(line);
  return match?.[1];
}

function renderMcpServer(name: string, server: McpServer): string[] {
  if (server.type === "http")
    return [`[mcp_servers.${name}]`, `url = ${JSON.stringify(server.url)}`];
  const env = Object.entries(server.env)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${JSON.stringify(key)} = ${JSON.stringify(value)}`)
    .join(", ");
  return [
    `[mcp_servers.${name}]`,
    `command = ${JSON.stringify(server.command)}`,
    `args = [${server.args.map((arg) => JSON.stringify(arg)).join(", ")}]`,
    ...(env === "" ? [] : [`env = { ${env} }`]),
  ];
}

function updateMcpServers(lines: string[], declared: Declared): string[] {
  const owned = new Set([
    ...managedMcpNames(lines.join("\n")),
    ...Object.keys(declared.mcpServers),
  ]);
  const kept = lines.filter((line) => !line.startsWith(MANAGED_MCP_COMMENT));
  const output: string[] = [];
  for (let index = 0; index < kept.length;) {
    const name = mcpTableName(kept[index]!);
    if (name === undefined || !owned.has(name)) {
      output.push(kept[index]!);
      index += 1;
      continue;
    }
    index += 1;
    while (index < kept.length && !/^\s*\[[^\]]+\]/u.test(kept[index]!))
      index += 1;
  }
  const servers = Object.entries(declared.mcpServers).toSorted(
    ([left], [right]) => left.localeCompare(right),
  );
  if (servers.length === 0) return output;
  while (output.length > 0 && output.at(-1) === "") output.pop();
  if (output.length > 0) output.push("");
  output.push(
    `${MANAGED_MCP_COMMENT} ${servers.map(([name]) => name).join(", ")}`,
    "",
  );
  for (const [index, [name, server]] of servers.entries()) {
    output.push(...renderMcpServer(name, server));
    if (index < servers.length - 1) output.push("");
  }
  return output;
}

/** Edit top-level keys textually; a same-named key inside any table is never considered. */
export function edit(contents: string | null, declared: Declared): string {
  const source = contents ?? "";
  const lines = source.split("\n");
  let firstTable = lines.findIndex((line) => /^\s*\[[^\]]+\]/u.test(line));
  if (firstTable < 0) firstTable = lines.length;
  const found = new Set<string>();
  for (let index = 0; index < firstTable; index += 1) {
    const changed = updateTopLevelLine(lines[index]!, declared);
    if (changed === null) continue;
    found.add(changed.key);
    lines[index] = changed.line;
  }
  const prefix = Object.entries(topLevelValues(declared))
    .filter(([key]) => !found.has(key))
    .map(([key, value]) => `${key} = ${JSON.stringify(value)}`);
  if (prefix.length > 0) {
    const insertion = firstTable;
    if (insertion === 0) lines.splice(insertion, 0, ...prefix, "");
    else if (insertion === 1 && lines[0] === "" && source.length === 0)
      lines.splice(0, 1, ...prefix);
    else {
      const before = lines[insertion - 1] ?? "";
      lines.splice(
        insertion,
        0,
        ...(before === "" ? [...prefix, ""] : ["", ...prefix, ""]),
      );
    }
  }
  const existingTable = lines.findIndex((line) =>
    /^\s*\[sandbox_workspace_write\]\s*(?:#.*)?$/u.test(line),
  );
  let addedTable = false;
  if (existingTable >= 0) {
    const end = lines.findIndex(
      (line, index) => index > existingTable && /^\s*\[[^\]]+\]/u.test(line),
    );
    const limit = end < 0 ? lines.length : end;
    const present = updateNetworkTable(
      lines,
      existingTable + 1,
      limit,
      declared.networkAccess,
    );
    if (!present)
      lines.splice(limit, 0, `network_access = ${declared.networkAccess}`);
  } else {
    if (lines.length > 0 && lines.at(-1) === "") lines.pop();
    if (lines.length > 0 && lines.at(-1) !== "") lines.push("");
    lines.push(
      "[sandbox_workspace_write]",
      `network_access = ${declared.networkAccess}`,
    );
    addedTable = true;
  }
  const result = updateMcpServers(lines, declared).join("\n");
  return (addedTable || Object.keys(declared.mcpServers).length > 0) &&
    (source.endsWith("\n") || source.length === 0)
    ? `${result}\n`
    : result;
}
