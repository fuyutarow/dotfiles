import { describe, expect, test } from "bun:test";
import { drift, edit, readLive, type Declared } from "../sandbox-network.ts";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readdirSync, readFileSync as readRepoFile } from "node:fs";
import { resolve } from "node:path";

const declared = {
  networkAccess: true,
  modelContextWindow: 1000000,
  modelAutoCompactTokenLimit: 950000,
  approvalPolicy: "on-request",
  approvalsReviewer: "auto_review",
  mcpServers: {},
} satisfies Declared;
const approvals =
  'approval_policy = "on-request"\napprovals_reviewer = "auto_review"\n';

function visit(path: string): string[] {
  const entries = readdirSync(path, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      if ([".git", ".jj", "node_modules"].includes(entry.name)) return [];
      return visit(child);
    }
    return /\.(?:md|toml|ts|json)$/u.test(entry.name) ? [child] : [];
  });
}

describe("Codex settings convergence", () => {
  test("the old task and executable names are absent from repository text", () => {
    const root = resolve(import.meta.dir, "../../..");
    const stale = [
      ["codex", "sandbox-network"].join(":"),
      ["codex", "sandbox-network.ts"].join("-"),
    ];
    const hits = visit(root).flatMap((path) => {
      const body = readRepoFile(path, "utf8");
      return stale
        .filter((name) => body.includes(name))
        .map((name) => `${path}: ${name}`);
    });
    expect(hits).toEqual([]);
  });

  test("inserts missing model settings before tables and preserves other bytes", () => {
    const source =
      '# user comment\nother = "unchanged"\n\n[sandbox_workspace_write]\nnetwork_access = true\n';
    const result = edit(source, declared);
    expect(result).toBe(
      '# user comment\nother = "unchanged"\n\nmodel_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\napproval_policy = "on-request"\napprovals_reviewer = "auto_review"\n\n[sandbox_workspace_write]\nnetwork_access = true\n',
    );
  });

  test("updates wrong values and preserves inline comments", () => {
    const source =
      approvals +
      "model_context_window = 100000\nmodel_auto_compact_token_limit = 900000 # retain\n[sandbox_workspace_write]\nnetwork_access = false\n";
    expect(edit(source, declared)).toBe(
      approvals +
        "model_context_window = 1000000\nmodel_auto_compact_token_limit = 950000 # retain\n[sandbox_workspace_write]\nnetwork_access = true\n",
    );
  });

  test("a converged file is a byte-identical no-op", () => {
    const source =
      approvals +
      "# leading\nmodel_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n[sandbox_workspace_write]\nnetwork_access = true # note\n";
    expect(edit(source, declared)).toBe(source);
    expect(
      drift(declared, {
        contents: source,
        networkAccess: true,
        modelContextWindow: 1000000,
        modelAutoCompactTokenLimit: 950000,
        approvalPolicy: "on-request",
        approvalsReviewer: "auto_review",
        mcpServers: {},
        managedMcpNames: [],
      }),
    ).toEqual([]);
  });

  test("same-named model keys inside tables are not changed", () => {
    const source =
      "[custom]\nmodel_context_window = 123\nmodel_auto_compact_token_limit = 456\n[sandbox_workspace_write]\nnetwork_access = true\n";
    const result = edit(source, declared);
    expect(result).toContain(
      "[custom]\nmodel_context_window = 123\nmodel_auto_compact_token_limit = 456\n",
    );
    expect(result).toContain(
      'model_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\napproval_policy = "on-request"\napprovals_reviewer = "auto_review"\n\n[custom]',
    );
  });

  test("live values are read as TOML top-level keys", async () => {
    const home = mkdtempSync(join(tmpdir(), "codex-settings-"));
    mkdirSync(join(home, ".codex"));
    writeFileSync(
      join(home, ".codex/config.toml"),
      approvals +
        "model_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n[sandbox_workspace_write]\nnetwork_access = true\n",
    );
    const live = await readLive(home);
    expect(live).not.toBeInstanceOf(Error);
    if (!(live instanceof Error)) expect(drift(declared, live)).toEqual([]);
    expect(readFileSync(join(home, ".codex/config.toml"), "utf8")).toContain(
      "model_context_window",
    );
  });

  test("replaces a drifted managed HTTP server, keeps user servers, and is idempotent", () => {
    const mcpDeclared = {
      ...declared,
      mcpServers: {
        context7: {
          type: "http" as const,
          url: "https://mcp.context7.com/mcp",
        },
        local: {
          type: "stdio" as const,
          command: "bunx",
          args: ["-y", "local-mcp"],
          env: { TOKEN_ENV: "TOKEN_ENV" },
        },
      },
    };
    const source = `model_context_window = 1000000
model_auto_compact_token_limit = 950000
[sandbox_workspace_write]
network_access = true

# codex-dotfiles-mcp-managed: context7, retired
[mcp_servers.context7]
command = "bunx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.retired]
url = "https://old.example/mcp"

[mcp_servers.user]
command = "user-server"
`;
    const first = edit(source, mcpDeclared);
    expect(first).toContain(
      '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"',
    );
    expect(first).toContain('[mcp_servers.local]\ncommand = "bunx"');
    expect(first).not.toContain("@upstash/context7-mcp");
    expect(first).not.toContain("[mcp_servers.retired]");
    expect(first).toContain('[mcp_servers.user]\ncommand = "user-server"');
    expect(edit(first, mcpDeclared)).toBe(first);
  });
});
