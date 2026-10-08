import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(import.meta.dir, "../scripts/jj-push.ts");
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "jj-push-test-"));
  dirs.push(dir);
  const root = join(dir, "repo");
  const bin = join(dir, "bin");
  const remote = join(dir, "remote");
  mkdirSync(root);
  mkdirSync(bin);
  const binaries = [
    ["bun", process.execPath],
    ["jj", Bun.which("jj")],
    ["mise", Bun.which("mise")],
    ["git", Bun.which("git")],
  ] satisfies [string, string | null][];
  for (const [name, binary] of binaries) {
    expect(
      binary,
      `${name} is required for jj push integration tests`,
    ).toBeTruthy();
    if (binary !== null && binary !== undefined)
      symlinkSync(binary, join(bin, name));
  }
  const config = join(dir, "jj.toml");
  writeFileSync(
    config,
    '[user]\nname = "jj push test"\nemail = "push@example.invalid"\n[signing]\nbehavior = "drop"\n',
  );
  const env = {
    ...process.env,
    HOME: dir,
    XDG_CONFIG_HOME: join(dir, "config"),
    JJ_CONFIG: config,
    PATH: `${bin}:/usr/bin:/bin`,
    MISE_TRUSTED_CONFIG_PATHS: root,
    MISE_GLOBAL_CONFIG_FILE: join(dir, "no-global.toml"),
    MISE_USE_TOML: "1",
    MISE_YES: "1",
  };
  const runAt = (
    cwd: string,
    cmd: string[],
    extra: Record<string, string> = {},
  ) =>
    Bun.spawnSync(cmd, {
      cwd,
      env: { ...env, ...extra },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    });
  const run = (cmd: string[], extra: Record<string, string> = {}) =>
    runAt(root, cmd, extra);
  const jj = (...args: string[]) => {
    const result = run(["jj", ...args]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    return result.stdout.toString().trim();
  };
  const jjAt = (cwd: string, ...args: string[]) => {
    const result = runAt(cwd, ["jj", ...args]);
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    return result.stdout.toString().trim();
  };
  writeFileSync(
    join(root, "mise.toml"),
    `[tasks.push]\nrun = ${JSON.stringify(`bun ${SCRIPT}`)}\n`,
  );
  writeFileSync(join(root, "base.txt"), "base\n");
  jj("git", "init", "--no-colocate");
  jj("commit", "-m", "fixture base");
  jj("bookmark", "create", "alpha", "-r", "@-");
  jj("git", "init", "--no-colocate", remote);
  const bare = join(remote, ".jj/repo/store/git");
  jj("git", "remote", "add", "origin", bare);
  jj("git", "push", "-b", "alpha");
  const push = (flags: string[] = []) =>
    run(["mise", "run", "push", "--", ...flags]);
  const remoteHead = () =>
    jj("log", "--no-graph", "-r", "alpha@origin", "-T", "commit_id");
  return {
    dir,
    root,
    remote,
    bare,
    env,
    run,
    runAt,
    jj,
    jjAt,
    push,
    remoteHead,
  };
}

describe("jj push", () => {
  test("prints and pushes commits ahead of alpha@origin", () => {
    const f = fixture();
    writeFileSync(join(f.root, "ahead.txt"), "ahead\n");
    f.jj("describe", "-m", "ahead commit");
    f.jj("bookmark", "set", "alpha", "-r", "@");
    const r = f.push();
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(r.stdout.toString()).toContain("ahead commit");
    expect(f.remoteHead()).toBe(
      f.jj("log", "--no-graph", "-r", "alpha", "-T", "commit_id"),
    );
  });

  test("nothing ahead is a successful no-op", () => {
    const f = fixture();
    const before = f.remoteHead();
    const r = f.push();
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(r.stdout.toString()).toContain("nothing to push");
    expect(f.remoteHead()).toBe(before);
  });

  test("refuses when alpha has diverged from alpha@origin", () => {
    const f = fixture();
    const mirror = join(f.dir, "mirror");
    f.jj("git", "clone", "--no-colocate", f.bare, mirror);
    f.jjAt(mirror, "bookmark", "track", "alpha@origin");
    f.jjAt(mirror, "new", "alpha@origin");
    writeFileSync(join(mirror, "remote.txt"), "remote commit\n");
    f.jjAt(mirror, "describe", "-m", "remote commit");
    f.jjAt(mirror, "bookmark", "set", "alpha", "-r", "@");
    f.jjAt(mirror, "git", "push", "-b", "alpha");
    const remoteExpected = f.jjAt(
      mirror,
      "log",
      "--no-graph",
      "-r",
      "alpha",
      "-T",
      "commit_id",
    );
    writeFileSync(join(f.root, "local.txt"), "local commit\n");
    f.jj("describe", "-m", "local commit");
    f.jj("bookmark", "set", "alpha", "-r", "@");
    const r = f.push();
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("mise run pull");
    expect(f.remoteHead()).toBe(remoteExpected);
  });

  test("dry-run prints the list without pushing", () => {
    const f = fixture();
    writeFileSync(join(f.root, "ahead.txt"), "ahead\n");
    f.jj("describe", "-m", "ahead commit");
    f.jj("bookmark", "set", "alpha", "-r", "@");
    const before = f.remoteHead();
    const r = f.push(["--dry-run"]);
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(r.stdout.toString()).toContain("ahead commit");
    expect(f.remoteHead()).toBe(before);
  });

  test("refuses a conflicted alpha bookmark", () => {
    const f = fixture();
    const rev = f.jj("log", "--no-graph", "-r", "alpha", "-T", "commit_id");
    // Build a conflicted descendant by merging two edits of the same file.
    f.jj("new", rev);
    writeFileSync(join(f.root, "base.txt"), "left\n");
    f.jj("describe", "-m", "left edit");
    const left = f.jj("log", "--no-graph", "-r", "@", "-T", "commit_id");
    f.jj("new", rev);
    writeFileSync(join(f.root, "base.txt"), "right\n");
    f.jj("describe", "-m", "right edit");
    const right = f.jj("log", "--no-graph", "-r", "@", "-T", "commit_id");
    f.jj("new", left, right);
    f.jj("bookmark", "set", "alpha", "-r", "@");
    const r = f.push();
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("unresolved conflicts");
  });
});
