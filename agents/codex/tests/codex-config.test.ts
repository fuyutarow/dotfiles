import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dir, "..", "..", "..");
const script = join(repo, "agents/codex/codex-config.ts");

function run(home: string, args: string[] = []) {
  return Bun.spawnSync(["bun", script, ...args], {
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
      "model_context_window = 1000000\nmodel_auto_compact_token_limit = 950000\n[sandbox_workspace_write]\nnetwork_access = true\n",
    );
    const result = run(home, ["--check"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString() + result.stderr.toString()).toBe("");
  });

  test("--check exits 2 for a bad declaration", () => {
    const home = mkdtempSync(join(tmpdir(), "codex-config-check-"));
    const dotfiles = mkdtempSync(join(tmpdir(), "codex-config-declaration-"));
    mkdirSync(join(dotfiles, "agents/codex"), { recursive: true });
    writeFileSync(
      join(dotfiles, "agents/codex/config.declared.toml"),
      "invalid = true\n",
    );
    const result = Bun.spawnSync(["bun", script, "--check"], {
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
});
