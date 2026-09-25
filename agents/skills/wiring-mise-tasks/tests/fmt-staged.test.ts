import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "..", "scripts", "fmt-staged.ts");
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

// A portable "formatter": upper-cases every file it is given, and nothing else.
const fixtures = mkdtempSync(join(tmpdir(), "fmt-staged-fx-"));
dirs.push(fixtures);
const UPPER = join(fixtures, "upper.ts");
writeFileSync(
  UPPER,
  `import { readFileSync, writeFileSync } from "node:fs";
for (const f of process.argv.slice(2)) writeFileSync(f, readFileSync(f, "utf8").toUpperCase());
if (process.env.FAIL_FORMATTER) process.exit(3);
if (process.env.STRAY) writeFileSync(process.env.STRAY, "touched by the formatter\\n");
`,
);
const TOOL = `md=bun ${UPPER}`;

function git(dir: string, ...args: string[]): string {
  const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "fmt-staged-"));
  dirs.push(dir);
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
  git(dir, "config", "commit.gpgsign", "false");
  writeFileSync(join(dir, "base.md"), "base\n");
  git(dir, "add", "base.md");
  git(dir, "commit", "-qm", "base");
  return dir;
}

function run(dir: string, args: string[], env: Record<string, string> = {}) {
  const r = spawnSync("bun", [SCRIPT, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { code: r.status, out: r.stdout ?? "", err: r.stderr ?? "" };
}

const indexed = (dir: string, path: string) => git(dir, "show", `:${path}`);
const onDisk = (dir: string, path: string) =>
  readFileSync(join(dir, path), "utf8");

describe("fmt-staged", () => {
  test("formats a staged file in place and re-stages exactly it", () => {
    const dir = repo();
    writeFileSync(join(dir, "a.md"), "hello\n");
    git(dir, "add", "a.md");
    const r = run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("FORMATTED: a.md");
    expect(indexed(dir, "a.md")).toBe("HELLO\n");
    expect(git(dir, "diff", "--name-only")).toBe(""); // worktree == index
  });

  test("REFUSES a partially staged file and changes nothing", () => {
    const dir = repo();
    writeFileSync(join(dir, "a.md"), "staged\n");
    git(dir, "add", "a.md");
    writeFileSync(join(dir, "a.md"), "staged\nunstaged hunk\n");
    const r = run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("REFUSE: a.md has unstaged changes");
    expect(indexed(dir, "a.md")).toBe("staged\n");
    expect(onDisk(dir, "a.md")).toBe("staged\nunstaged hunk\n");
  });

  test("another session's unstaged and untracked files are neither read, formatted, nor staged", () => {
    const dir = repo();
    writeFileSync(join(dir, "base.md"), "their unstaged wip\n");
    writeFileSync(join(dir, "wip.md"), "their untracked wip\n");
    writeFileSync(join(dir, "mine.md"), "mine\n");
    git(dir, "add", "mine.md");
    const r = run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(0);
    expect(onDisk(dir, "base.md")).toBe("their unstaged wip\n");
    expect(onDisk(dir, "wip.md")).toBe("their untracked wip\n");
    expect(indexed(dir, "base.md")).toBe("base\n");
    expect(git(dir, "status", "--porcelain", "--", "wip.md")).toBe(
      "?? wip.md\n",
    );
  });

  test("nothing staged for the tool's extensions: exit 0, no-op", () => {
    const dir = repo();
    writeFileSync(join(dir, "a.txt"), "x\n");
    git(dir, "add", "a.txt");
    const r = run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("no staged file matches");
    expect(indexed(dir, "a.txt")).toBe("x\n");
  });

  test("--exclude leaves matching staged paths alone", () => {
    const dir = repo();
    mkdirSync(join(dir, "archives"));
    writeFileSync(join(dir, "archives", "old.md"), "old\n");
    git(dir, "add", "archives/old.md");
    const r = run(dir, ["--tool", TOOL, "--exclude", "archives/**"]);
    expect(r.code).toBe(0);
    expect(indexed(dir, "archives/old.md")).toBe("old\n");
  });

  test("a failing formatter fails the gate and re-stages nothing", () => {
    const dir = repo();
    writeFileSync(join(dir, "a.md"), "hello\n");
    git(dir, "add", "a.md");
    const r = run(dir, ["--tool", TOOL], { FAIL_FORMATTER: "1" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("FAIL:");
    expect(indexed(dir, "a.md")).toBe("hello\n");
  });

  test("a formatter that strays outside its file list fails the gate; the stray is not staged", () => {
    const dir = repo();
    writeFileSync(join(dir, "a.md"), "hello\n");
    git(dir, "add", "a.md");
    const r = run(dir, ["--tool", TOOL], { STRAY: join(dir, "base.md") });
    expect(r.code).toBe(1);
    expect(r.out).toContain("FAIL: the formatter changed base.md");
    expect(indexed(dir, "base.md")).toBe("base\n");
    expect(indexed(dir, "a.md")).toBe("hello\n");
  });

  test("a staged deletion is ignored", () => {
    const dir = repo();
    git(dir, "rm", "-q", "base.md");
    const r = run(dir, ["--tool", TOOL]);
    expect(r.code).toBe(0);
  });

  test("usage errors exit 2", () => {
    expect(run(repo(), ["--tool", "noequals"]).code).toBe(2);
    expect(run(repo(), []).code).toBe(2);
  });

  describe("through a real pre-commit hook", () => {
    function hooked(): string {
      const dir = repo();
      mkdirSync(join(dir, ".githooks"));
      writeFileSync(
        join(dir, ".githooks", "pre-commit"),
        `#!/bin/sh\nexec bun ${SCRIPT} --tool '${TOOL}'\n`,
      );
      chmodSync(join(dir, ".githooks", "pre-commit"), 0o755);
      git(dir, "config", "core.hooksPath", ".githooks");
      return dir;
    }

    test("the commit carries the formatted content", () => {
      const dir = hooked();
      writeFileSync(join(dir, "a.md"), "hello\n");
      git(dir, "add", "a.md");
      git(dir, "commit", "-qm", "a");
      expect(git(dir, "show", "HEAD:a.md")).toBe("HELLO\n");
      expect(git(dir, "status", "--porcelain", "--", "a.md")).toBe("");
    });

    test("`git commit -- <path>` (temporary index) commits the formatted content too", () => {
      const dir = hooked();
      writeFileSync(join(dir, "base.md"), "changed\n");
      git(dir, "commit", "-qm", "only", "--", "base.md");
      expect(git(dir, "show", "HEAD:base.md")).toBe("CHANGED\n");
    });

    test("a partially staged file blocks the commit and nothing is committed", () => {
      const dir = hooked();
      writeFileSync(join(dir, "a.md"), "staged\n");
      git(dir, "add", "a.md");
      writeFileSync(join(dir, "a.md"), "staged\nmore\n");
      const r = spawnSync("git", ["-C", dir, "commit", "-qm", "x"], {
        encoding: "utf8",
      });
      expect(r.status).not.toBe(0);
      expect(git(dir, "log", "--format=%s")).toBe("base\n");
    });
  });
});
