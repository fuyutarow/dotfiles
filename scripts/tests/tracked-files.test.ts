import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
setDefaultTimeout(20_000);
const SCRIPT = join(REPO, "scripts", "tracked-files.ts");
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

async function fixture(): Promise<{ root: string; secondary: string }> {
  const temp = await mkdtemp(join(tmpdir(), "tracked-files-"));
  cleanups.push(async () => {
    await rm(temp, { recursive: true, force: true });
  });
  const root = join(temp, "main");
  const secondary = join(temp, "secondary");
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(join(root, "scripts", "main.ts"), "export {};\n");
  await writeFile(join(root, "scripts", "ignored.ts"), "export {};\n");
  await writeFile(
    join(root, "scripts", "ignored.txt"),
    "ignored by selector\n",
  );
  return { root, secondary };
}

async function run(
  command: string[],
  cwd: string,
): Promise<{ code: number; out: string }> {
  const result = await spawn(command, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  return {
    code: result.exitCode ?? 1,
    out: result.stdout.toString() + result.stderr.toString(),
  };
}

async function list(
  cwd: string,
  pathspecs: string[],
): Promise<{ code: number; files: string[]; out: string }> {
  const result = await run(
    ["bun", SCRIPT, "--expect-non-empty", ...pathspecs],
    cwd,
  );
  const files = result.out.split("\0").filter(Boolean);
  return { code: result.code, files, out: result.out };
}

describe("tracked-files.ts", () => {
  test("Git main and jj secondary workspaces list the same tracked files", async () => {
    const { root, secondary } = await fixture();
    const init = await run(["jj", "git", "init", "--colocate", root], root);
    expect(init.code).toBe(0);
    expect(
      (await run(["jj", "new", "-m", "tracked files fixture"], root)).code,
    ).toBe(0);
    expect(
      (
        await run(
          ["jj", "workspace", "add", "--name", "secondary", secondary],
          root,
        )
      ).code,
    ).toBe(0);

    const pathspecs = [":(glob)scripts/*.ts", ":(exclude)scripts/ignored.ts"];
    const main = await list(root, pathspecs);
    const side = await list(secondary, pathspecs);
    expect(main.code).toBe(0);
    expect(side.code).toBe(0);
    expect(main.files.toSorted()).toEqual(side.files.toSorted());
    expect(side.files).toEqual(["scripts/main.ts"]);
    const empty = await list(secondary, [":(glob)no-match/**/*.ts"]);
    expect(empty.code).toBe(2);
    expect(empty.out).toContain("tracked-file selection was empty");
  });

  test("lint:bun's selector is non-empty in a jj secondary workspace", async () => {
    const { root, secondary } = await fixture();
    expect(
      (await run(["jj", "git", "init", "--colocate", root], root)).code,
    ).toBe(0);
    expect(
      (await run(["jj", "new", "-m", "lint selector fixture"], root)).code,
    ).toBe(0);
    expect(
      (
        await run(
          ["jj", "workspace", "add", "--name", "secondary", secondary],
          root,
        )
      ).code,
    ).toBe(0);

    const lintBunPathspecs = [
      ":(glob)scripts/*.ts",
      "android/line-notifications.ts",
      ":(glob)tools/repo-retrieve/src/*.ts",
      ":(glob)agents/claude/*.ts",
      ":(glob)agents/claude/hooks/*.ts",
      ":(glob)agents/hooks/*.ts",
      ":(glob)agents/models/*.ts",
      ":(glob)agents/skills/*/scripts/**/*.ts",
      "agents/goal-kernel/cli.ts",
      ":(glob)tools/agent-resource-run/src/*.ts",
      ":(glob)tools/serena-foreground/src/*.ts",
      ":(glob)tools/smart-open/src/*.ts",
      ":(exclude)agents/claude/hooks/repo-retrieve.ts",
    ];
    const selected = await list(secondary, lintBunPathspecs);
    expect(selected.code).toBe(0);
    expect(selected.files).toContain("scripts/main.ts");
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
