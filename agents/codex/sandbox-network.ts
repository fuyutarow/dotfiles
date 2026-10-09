// The declaration is repo-owned; ~/.codex/config.toml remains Codex-owned. Read with Bun's real
// TOML parser, then edit only the declared top-level assignments to preserve every other byte.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { attempt } from "../hooks/attempt.ts";
import { z } from "../hooks/zod.ts";

const RecordSchema = z.record(z.string(), z.unknown());
const TOP_LEVEL = [
  "model_context_window",
  "model_auto_compact_token_limit",
] as const;

export type Declared = {
  networkAccess: boolean;
  modelContextWindow: number;
  modelAutoCompactTokenLimit: number;
};
export type Live = {
  contents: string | null;
  networkAccess: boolean | null;
  modelContextWindow: number | null;
  modelAutoCompactTokenLimit: number | null;
};

function values(parsed: unknown): Declared | Error {
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
  if (network.success && context.success && compact.success) {
    return {
      networkAccess: network.data,
      modelContextWindow: context.data,
      modelAutoCompactTokenLimit: compact.data,
    };
  }
  return new Error(
    "Codex declaration requires network_access boolean and integer model limits",
  );
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
  return result instanceof Error
    ? new Error(`${path}: ${result.message}`)
    : result;
}

export async function readLive(home: string): Promise<Live | Error> {
  const path = join(home, ".codex/config.toml");
  if (!existsSync(path)) {
    return {
      contents: null,
      networkAccess: null,
      modelContextWindow: null,
      modelAutoCompactTokenLimit: null,
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
  return {
    contents: read.value,
    networkAccess: network.success ? network.data : null,
    modelContextWindow: context.success ? context.data : null,
    modelAutoCompactTokenLimit: compact.success ? compact.data : null,
  };
}

export function drift(declared: Declared, live: Live): string[] {
  const lines = [
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
  return lines.flatMap((line) => (line === null ? [] : [line]));
}

function replaceInteger(
  line: string,
  key: string,
  value: number,
): string | null {
  const assignment = new RegExp(
    `^(\\s*${key}\\s*=\\s*)([+-]?\\d+)(\\s*(?:#.*)?)$`,
    "u",
  ).exec(line);
  return assignment === null
    ? null
    : `${assignment[1]}${value}${assignment[3]}`;
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
  for (const key of TOP_LEVEL) {
    const changed = replaceInteger(
      line,
      key,
      key === "model_context_window"
        ? declared.modelContextWindow
        : declared.modelAutoCompactTokenLimit,
    );
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
  const prefix = TOP_LEVEL.filter((key) => !found.has(key)).map((key) => {
    const value =
      key === "model_context_window"
        ? declared.modelContextWindow
        : declared.modelAutoCompactTokenLimit;
    return `${key} = ${value}`;
  });
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
  const result = lines.join("\n");
  return addedTable && (source.endsWith("\n") || source.length === 0)
    ? `${result}\n`
    : result;
}
