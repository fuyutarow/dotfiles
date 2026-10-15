// The deployed hook path is a symlink into agents/hooks. Bun must resolve shim imports from the
// hook's real path so they continue to reach tools/shared without touching $HOME.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
setDefaultTimeout(20_000);

async function runHook(
  script: string,
  cwd: string,
): Promise<{ code: number; out: string; err: string }> {
  const payload = {
    tool_name: "Bash",
    tool_input: { command: "git status" },
    cwd,
  };
  const result = await spawn(["bun", script], {
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
  test("matches direct execution with attempt and zod imports", async () => {
    const scratch = await mkdtemp(join(tmpdir(), "hook-shared-symlink-"));
    const cwd = join(scratch, "repo");
    const linkDir = join(scratch, "deployed-hooks");
    await mkdir(join(cwd, ".claude"), { recursive: true });
    await mkdir(linkDir);
    await writeFile(
      join(cwd, ".claude", "settings.json"),
      JSON.stringify({ permissions: { deny: ["Bash(git:*)"] } }),
    );
    const linkedHook = join(linkDir, "enforce-repo-bash-deny.ts");
    await symlink(HOOK, linkedHook);

    const direct = await runHook(HOOK, cwd);
    const throughLink = await runHook(linkedHook, cwd);

    expect(throughLink).toEqual(direct);
    expect(direct.code).toBe(0);
    expect(direct.out).toContain("repo-deny:");
    await rm(scratch, { recursive: true, force: true });
  });
});

// Drain both pipes while waiting so a child cannot block on a full output buffer.
async function spawn(
  command: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    maxBuffer?: number;
    stdin?: Blob;
    stdout?: "pipe";
    stderr?: "pipe";
  } = {},
) {
  const proc = Bun.spawn(command, {
    ...options,
    stdin: options.stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).arrayBuffer(),
    proc.exited,
  ]);
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}
