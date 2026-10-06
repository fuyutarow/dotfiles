// The deployed hook path is a symlink into agents/hooks. Bun must resolve shim imports from the
// hook's real path so they continue to reach tools/shared without touching $HOME.
import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const HOOK = join(
  import.meta.dir,
  "..",
  "..",
  "agents",
  "hooks",
  "enforce-repo-bash-deny.ts",
);

function runHook(
  script: string,
  cwd: string,
): { code: number; out: string; err: string } {
  const payload = {
    tool_name: "Bash",
    tool_input: { command: "git status" },
    cwd,
  };
  const result = Bun.spawnSync(["bun", script], {
    cwd,
    stdin: new Blob([JSON.stringify(payload)]),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  return {
    code: result.exitCode ?? -1,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

describe("deployed hook symlink resolves shared shims", () => {
  test("matches direct execution with attempt and zod imports", () => {
    const scratch = mkdtempSync(join(tmpdir(), "hook-shared-symlink-"));
    const cwd = join(scratch, "repo");
    const linkDir = join(scratch, "deployed-hooks");
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    mkdirSync(linkDir);
    writeFileSync(
      join(cwd, ".claude", "settings.json"),
      JSON.stringify({ permissions: { deny: ["Bash(git:*)"] } }),
    );
    const linkedHook = join(linkDir, "enforce-repo-bash-deny.ts");
    symlinkSync(HOOK, linkedHook);

    const direct = runHook(HOOK, cwd);
    const throughLink = runHook(linkedHook, cwd);

    expect(throughLink).toEqual(direct);
    expect(direct.code).toBe(0);
    expect(direct.out).toContain("repo-deny:");
    rmSync(scratch, { recursive: true, force: true });
  });
});
