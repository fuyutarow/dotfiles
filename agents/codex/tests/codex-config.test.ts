import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..", "..", "..");
const script = join(repo, "agents/codex/codex-config.ts");
const statusLine =
  'status_line = ["model-with-reasoning", "current-dir", "context-remaining", "weekly-limit", "approval-mode", "used-tokens", "task-progress"]';

function run(home: string, args: string[] = []) {
  return Bun.spawnSync([process.execPath, script, ...args], {
    env: {
      ...process.env,
      HOME: home,
      DOTFILES: repo,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(home, "cache"),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

describe("codex:config", () => {
  test.each(["approval_policy", "approvals_reviewer"])(
    "--check detects drift in %s alone without writing",
    (key) => {
      const home = mkdtempSync(join(tmpdir(), "codex-config-approval-check-"));
      mkdirSync(join(home, ".codex"));
      const declared = readFileSync(
        join(repo, "agents/codex/config.declared.toml"),
        "utf8",
      );
      const stale = declared.replace(
        new RegExp(`${key} = "[^"]+"`, "u"),
        `${key} = "stale"`,
      );
      const path = join(home, ".codex/config.toml");
      writeFileSync(path, stale);
      const result = run(home, ["--check"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain(`${key}=stale`);
      expect(readFileSync(path, "utf8")).toBe(stale);
    },
  );

  test.each([
    "",
    "approval_policy = \"never\"\napprovals_reviewer = 'user' # reviewer\n",
  ])(
    "converges approvals, preserves Codex-owned settings, and is idempotent: %s",
    (approvals) => {
      const home = mkdtempSync(join(tmpdir(), "codex-config-approvals-"));
      mkdirSync(join(home, ".codex"));
      const path = join(home, ".codex/config.toml");
      const owned =
        'model = "owner-model" # keep\nsandbox_mode = "read-only"\n\n[profiles.custom]\napproval_policy = "never"\napprovals_reviewer = "user"\n\n[projects."/owner/project"]\ntrust_level = "trusted"\n';
      writeFileSync(path, approvals + owned);
      expect(run(home).exitCode).toBe(0);
      const converged = readFileSync(path, "utf8");
      expect(Bun.TOML.parse(converged)).toMatchObject({
        approval_policy: "on-request",
        approvals_reviewer: "auto_review",
        sandbox_mode: "read-only",
      });
      expect(converged).toContain(
        'model = "owner-model" # keep\nsandbox_mode = "read-only"',
      );
      expect(converged).toContain(
        owned.slice(owned.indexOf("[profiles.custom]")),
      );
      if (approvals.length > 0)
        expect(converged).toContain(
          'approvals_reviewer = "auto_review" # reviewer',
        );
      const second = run(home);
      expect(second.exitCode).toBe(0);
      expect(second.stdout.toString() + second.stderr.toString()).toBe("");
      expect(readFileSync(path, "utf8")).toBe(converged);
      expect(run(home, ["--check"]).exitCode).toBe(0);
    },
  );

  test("--check exits 1 for drift without writing", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-config-check-"));
    mkdirSync(join(home, ".codex"));
    writeFileSync(
      join(home, ".codex/config.toml"),
      "model_context_window = 1\n",
    );
    const result = run(home, ["--check"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("codex:config: drift");
  });

  test("--check exits 0 when converged and prints nothing", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-config-check-"));
    mkdirSync(join(home, ".codex"));
    // The values match agents/codex/config.declared.toml.
    writeFileSync(
      join(home, ".codex/config.toml"),
      `approval_policy = "on-request"\napprovals_reviewer = "auto_review"\nmodel_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n[sandbox_workspace_write]\nnetwork_access = true\n\n# codex-dotfiles-mcp-managed: context7, deepwiki, exa\n\n[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"\n\n[mcp_servers.deepwiki]\nurl = "https://mcp.deepwiki.com/mcp"\n\n[mcp_servers.exa]\nurl = "https://mcp.exa.ai/mcp"\n\n[tui]\n${statusLine}\n`,
    );
    const result = run(home, ["--check"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString() + result.stderr.toString()).toBe("");
  });

  test("--check reports tui.status_line drift when [tui] is absent", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-config-tui-check-"));
    mkdirSync(join(home, ".codex"));
    const path = join(home, ".codex/config.toml");
    writeFileSync(
      path,
      'approval_policy = "on-request"\napprovals_reviewer = "auto_review"\nmodel_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n[sandbox_workspace_write]\nnetwork_access = true\n',
    );
    const result = run(home, ["--check"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("tui.status_line=null");
    expect(readFileSync(path, "utf8")).not.toContain("[tui]");
  });

  test("converges [tui] status_line, keeps other tui keys, and then checks clean", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-config-tui-write-"));
    mkdirSync(join(home, ".codex"));
    const path = join(home, ".codex/config.toml");
    writeFileSync(
      path,
      'approval_policy = "on-request"\napprovals_reviewer = "auto_review"\nmodel_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n[sandbox_workspace_write]\nnetwork_access = true\n[tui]\nanimations = true\nstatus_line = ["git-branch", "five-hour-limit"]\n',
    );
    const written = run(home);
    expect(written.exitCode).toBe(0);
    expect(written.stdout.toString()).toContain("codex:config: updated");
    expect(readFileSync(path, "utf8")).toContain(
      `[tui]\nanimations = true\n${statusLine}\n`,
    );
    expect(run(home, ["--check"]).exitCode).toBe(0);
  });

  test("--check exits 2 for a bad declaration", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-config-check-"));
    const dotfiles = mkdtempSync(join(tmpdir(), "codex-config-declaration-"));
    mkdirSync(join(dotfiles, "agents/codex"), { recursive: true });
    writeFileSync(
      join(dotfiles, "agents/codex/config.declared.toml"),
      "invalid = true\n",
    );
    const result = Bun.spawnSync([process.execPath, script, "--check"], {
      env: {
        ...process.env,
        HOME: home,
        DOTFILES: dotfiles,
        BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(home, "cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("Codex declaration requires");
  });

  test("replaces stale context7 with HTTP, preserves a user server, and is idempotent", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-config-mcp-"));
    mkdirSync(join(home, ".codex"));
    const config = join(home, ".codex/config.toml");
    writeFileSync(
      config,
      'model_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n[sandbox_workspace_write]\nnetwork_access = true\n\n# codex-dotfiles-mcp-managed: context7\n[mcp_servers.context7]\ncommand = "bunx"\nargs = ["-y", "@upstash/context7-mcp"]\n\n[mcp_servers.user-added]\ncommand = "keep-me"\n',
    );
    expect(run(home).exitCode).toBe(0);
    const first = readFileSync(config, "utf8");
    expect(first).toContain(
      '[mcp_servers.context7]\nurl = "https://mcp.context7.com/mcp"',
    );
    expect(first).not.toContain("@upstash/context7-mcp");
    expect(first).toContain('[mcp_servers.user-added]\ncommand = "keep-me"');
    expect(run(home).exitCode).toBe(0);
    const second = readFileSync(config, "utf8");
    expect(second).toBe(first);
  });
});
