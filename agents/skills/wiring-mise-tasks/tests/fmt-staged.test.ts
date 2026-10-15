import { afterAll, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "..", "scripts", "fmt-staged.ts");
const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
});

// A portable "formatter": upper-cases every file it is given, and nothing else.
const fixtures = await mkdtemp(join(tmpdir(), "fmt-staged-fx-"));
dirs.push(fixtures);
const UPPER = join(fixtures, "upper.ts");
await writeFile(
  UPPER,
  `import { readFile, writeFile } from "node:fs/promises";
for (const f of process.argv.slice(2)) await writeFile(f, (await readFile(f, "utf8")).toUpperCase());
if (process.env.FAIL_FORMATTER) process.exit(3);
if (process.env.STRAY) await writeFile(process.env.STRAY, "touched by the formatter\\n");
`,
);
const TOOL = `md=bun ${UPPER}`;

async function execute(
  dir: string,
  cmd: string[],
  env: Record<string, string> = {},
) {
  const child = Bun.spawn(cmd, {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
    timeout: 120_000,
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out, err };
}

async function git(dir: string, ...args: string[]): Promise<string> {
  const r = await execute(dir, ["git", "-C", dir, ...args]);
  expect(r.code, `git ${args.join(" ")}: ${r.err}`).toBe(0);
  return r.out;
}

async function repo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fmt-staged-"));
  dirs.push(dir);
  await git(dir, "init", "-q");
  await git(dir, "config", "user.email", "t@t");
  await git(dir, "config", "user.name", "t");
  await git(dir, "config", "commit.gpgsign", "false");
  await writeFile(join(dir, "base.md"), "base\n");
  await git(dir, "add", "base.md");
  await git(dir, "commit", "-qm", "base");
  return dir;
}

function run(dir: string, args: string[], env: Record<string, string> = {}) {
  return execute(dir, ["bun", SCRIPT, ...args], env);
}

const indexed = (dir: string, path: string) => git(dir, "show", `:${path}`);
const onDisk = (dir: string, path: string) => readFile(join(dir, path), "utf8");

describe("fmt-staged", () => {
  test("formats a staged file in place and re-stages exactly it", async () => {
    const dir = await repo();
    await writeFile(join(dir, "a.md"), "hello\n");
    await git(dir, "add", "a.md");
    const r = await run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("FORMATTED: a.md");
    expect(await indexed(dir, "a.md")).toBe("HELLO\n");
    expect(await git(dir, "diff", "--name-only")).toBe(""); // worktree == index
  });

  test("REFUSES a partially staged file and changes nothing", async () => {
    const dir = await repo();
    await writeFile(join(dir, "a.md"), "staged\n");
    await git(dir, "add", "a.md");
    await writeFile(join(dir, "a.md"), "staged\nunstaged hunk\n");
    const r = await run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("REFUSE: a.md has unstaged changes");
    expect(await indexed(dir, "a.md")).toBe("staged\n");
    expect(await onDisk(dir, "a.md")).toBe("staged\nunstaged hunk\n");
  });

  test("another session's unstaged and untracked files are neither read, formatted, nor staged", async () => {
    const dir = await repo();
    await writeFile(join(dir, "base.md"), "their unstaged wip\n");
    await writeFile(join(dir, "wip.md"), "their untracked wip\n");
    await writeFile(join(dir, "mine.md"), "mine\n");
    await git(dir, "add", "mine.md");
    const r = await run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(0);
    expect(await onDisk(dir, "base.md")).toBe("their unstaged wip\n");
    expect(await onDisk(dir, "wip.md")).toBe("their untracked wip\n");
    expect(await indexed(dir, "base.md")).toBe("base\n");
    expect(await git(dir, "status", "--porcelain", "--", "wip.md")).toBe(
      "?? wip.md\n",
    );
  });

  test("nothing staged for the tool's extensions: exit 0, no-op", async () => {
    const dir = await repo();
    await writeFile(join(dir, "a.txt"), "x\n");
    await git(dir, "add", "a.txt");
    const r = await run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("no staged file matches");
    expect(await indexed(dir, "a.txt")).toBe("x\n");
  });

  test("--exclude leaves matching staged paths alone", async () => {
    const dir = await repo();
    await mkdir(join(dir, "archives"));
    await writeFile(join(dir, "archives", "old.md"), "old\n");
    await git(dir, "add", "archives/old.md");
    const r = await run(dir, ["--tool", TOOL, "--exclude", "archives/**"]);
    expect(r.code).toBe(0);
    expect(await indexed(dir, "archives/old.md")).toBe("old\n");
  });

  test("a failing formatter fails the gate and re-stages nothing", async () => {
    const dir = await repo();
    await writeFile(join(dir, "a.md"), "hello\n");
    await git(dir, "add", "a.md");
    const r = await run(dir, ["--tool", TOOL], { FAIL_FORMATTER: "1" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("FAIL:");
    expect(await indexed(dir, "a.md")).toBe("hello\n");
  });

  test("a formatter that strays outside its file list fails the gate; the stray is not staged", async () => {
    const dir = await repo();
    await writeFile(join(dir, "a.md"), "hello\n");
    await git(dir, "add", "a.md");
    const r = await run(dir, ["--tool", TOOL], { STRAY: join(dir, "base.md") });
    expect(r.code).toBe(1);
    expect(r.out).toContain("FAIL: the formatter changed base.md");
    expect(await indexed(dir, "base.md")).toBe("base\n");
    expect(await indexed(dir, "a.md")).toBe("hello\n");
  });

  test("a staged deletion is ignored", async () => {
    const dir = await repo();
    await git(dir, "rm", "-q", "base.md");
    const r = await run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(0);
  });

  test("usage errors exit 2", async () => {
    expect((await run(await repo(), ["--tool", "noequals"])).code).toBe(2);
    expect((await run(await repo(), [])).code).toBe(2);
  });

  describe("through a real pre-commit hook", () => {
    async function hooked(): Promise<string> {
      const dir = await repo();
      await mkdir(join(dir, ".githooks"));
      await writeFile(
        join(dir, ".githooks", "pre-commit"),
        `#!/bin/sh\nexec bun ${SCRIPT} --tool '${TOOL}'\n`,
      );
      await chmod(join(dir, ".githooks", "pre-commit"), 0o755);
      await git(dir, "config", "core.hooksPath", ".githooks");
      return dir;
    }

    test("the commit carries the formatted content", async () => {
      const dir = await hooked();
      await writeFile(join(dir, "a.md"), "hello\n");
      await git(dir, "add", "a.md");
      await git(dir, "commit", "-qm", "a");
      expect(await git(dir, "show", "HEAD:a.md")).toBe("HELLO\n");
      expect(await git(dir, "status", "--porcelain", "--", "a.md")).toBe("");
    }, 30_000);

    test("`git commit -- <path>` (temporary index) commits the formatted content too", async () => {
      const dir = await hooked();
      await writeFile(join(dir, "base.md"), "changed\n");
      await git(dir, "commit", "-qm", "only", "--", "base.md");
      expect(await git(dir, "show", "HEAD:base.md")).toBe("CHANGED\n");
    });

    test("a partially staged file blocks the commit and nothing is committed", async () => {
      const dir = await hooked();
      await writeFile(join(dir, "a.md"), "staged\n");
      await git(dir, "add", "a.md");
      await writeFile(join(dir, "a.md"), "staged\nmore\n");
      const r = await execute(dir, ["git", "-C", dir, "commit", "-qm", "x"]);
      expect(r.code).not.toBe(0);
      expect(await git(dir, "log", "--format=%s")).toBe("base\n");
    });
  });
});
