import { expect, test } from "bun:test";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "lint-no-new-bash.ts");
const lines = (n: number) => "echo ok\n".repeat(n);
function run(cwd: string, cmd: string[]) {
  const env = { ...process.env };
  delete env["PRECOMMIT_VCS"];
  const result = Bun.spawnSync(cmd, {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "lint-bash-"));
  expect(run(root, ["git", "init", "-q"]).code).toBe(0);
  return root;
}
function baseline(root: string) {
  expect(run(root, ["git", "add", "."]).code).toBe(0);
  expect(
    run(root, [
      "git",
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "core.hooksPath=/dev/null",
      "commit",
      "-qm",
      "baseline",
    ]).code,
  ).toBe(0);
}
const lint = (root: string) => run(root, [process.execPath, SCRIPT]);

test("rejects tracked shell growth; legacy unchanged/shrunk scripts pass", () => {
  const root = fixture();
  writeFileSync(join(root, "legacy.sh"), lines(20));
  writeFileSync(join(root, "edge.sh"), lines(12));
  baseline(root);
  expect(lint(root).code).toBe(0);
  writeFileSync(join(root, "legacy.sh"), lines(21));
  expect(lint(root).code).toBe(1);
  writeFileSync(join(root, "legacy.sh"), lines(19));
  expect(lint(root).code).toBe(0);
  writeFileSync(join(root, "edge.sh"), lines(13));
  const result = lint(root);
  expect(result.code).toBe(1);
  expect(result.out).toContain("edge.sh");
});

test("new 13-line script fails; 12-line shell and long non-shell pass", () => {
  const root = fixture();
  writeFileSync(join(root, "new.sh"), lines(13));
  expect(run(root, ["git", "add", "."]).code).toBe(0);
  expect(lint(root).code).toBe(1);
  writeFileSync(join(root, "new.sh"), lines(12));
  writeFileSync(join(root, "notes.txt"), lines(30));
  expect(run(root, ["git", "add", "."]).code).toBe(0);
  expect(lint(root).code).toBe(0);
});

test("multiple new shell files fail as a split; a thin shim plus TypeScript passes", () => {
  const root = fixture();
  writeFileSync(join(root, "one.sh"), lines(8));
  writeFileSync(join(root, "two.sh"), lines(8));
  expect(run(root, ["git", "add", "."]).code).toBe(0);
  const split = lint(root);
  expect(split.code).toBe(1);
  expect(split.out).toContain("16 lines across 2 files");
  expect(split.out).toContain(
    "Splitting a script into several shell files is not a fix.",
  );

  const shimRoot = fixture();
  writeFileSync(
    join(shimRoot, "tool.sh"),
    '#!/bin/sh\n# shim: exec-wrapper\nexec bun tool.ts "$@"\n# thin shim\n# end\n',
  );
  writeFileSync(join(shimRoot, "tool.ts"), "const answer = 42;\n".repeat(30));
  expect(run(shimRoot, ["git", "add", "."]).code).toBe(0);
  expect(lint(shimRoot).code).toBe(0);
});

test("exempts existing bootstrap and vendored header; new bootstrap cannot exempt itself", () => {
  const root = fixture();
  writeFileSync(join(root, "boot.sh"), "# shim: bootstrap\n");
  baseline(root);
  writeFileSync(join(root, "boot.sh"), "# shim: bootstrap\n" + lines(20));
  writeFileSync(join(root, "vendor.sh"), "# managed by herdr\n" + lines(20));
  expect(run(root, ["git", "add", "."]).code).toBe(0);
  expect(lint(root).code).toBe(0);
  writeFileSync(join(root, "new.sh"), "# shim: bootstrap\n" + lines(20));
  expect(run(root, ["git", "add", "."]).code).toBe(0);
  expect(lint(root).code).toBe(1);
});

test("malformed jj context fails closed", () => {
  const root = fixture();
  const result = Bun.spawnSync([process.execPath, SCRIPT], {
    cwd: root,
    env: { ...process.env, PRECOMMIT_VCS: "jj", PRECOMMIT_BASE: "bad" },
    stderr: "pipe",
    timeout: 30_000,
  });
  expect(result.exitCode).toBe(2);
});

test("jj gate judges selected immutable snapshot content, including additions", () => {
  const root = fixture();
  writeFileSync(join(root, "old.sh"), lines(12));
  baseline(root);
  expect(run(root, ["jj", "git", "init", "--colocate"]).code).toBe(0);
  const base = run(root, [
    "jj",
    "log",
    "--no-graph",
    "-r",
    "@-",
    "-T",
    "commit_id",
  ]).out.trim();
  writeFileSync(join(root, "old.sh"), lines(13));
  writeFileSync(join(root, "new.bash"), lines(13));
  const rev = run(root, [
    "jj",
    "log",
    "--no-graph",
    "-r",
    "@",
    "-T",
    "commit_id",
  ]).out.trim();
  const paths = join(tmpdir(), `bash-paths-${crypto.randomUUID()}`);
  writeFileSync(paths, "new.bash\0");
  writeFileSync(join(root, "new.bash"), lines(1));
  const check = () =>
    Bun.spawnSync([process.execPath, SCRIPT], {
      cwd: root,
      env: {
        ...process.env,
        PRECOMMIT_VCS: "jj",
        PRECOMMIT_BASE: base,
        PRECOMMIT_REV: rev,
        PRECOMMIT_PATHS_FILE: paths,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
  const result = check();
  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toContain("new.bash:");
  expect(result.stdout.toString()).not.toContain("old.sh:");
  writeFileSync(paths, "unrelated\0");
  expect(check().exitCode).toBe(0);
});

test("shell symlink compares declaration bytes without counting the target twice", () => {
  const root = fixture();
  writeFileSync(join(root, "legacy.sh"), lines(30));
  symlinkSync("legacy.sh", join(root, "link.sh"));
  baseline(root);
  expect(lint(root).code).toBe(0);
  writeFileSync(join(root, "legacy.sh"), lines(31));
  expect(lint(root).code).toBe(1);
});

test("movedFrom: a file moved under a new prefix maps to its one old path", async () => {
  const { movedFrom } = await import("@dotfiles/scripts/lint-no-new-bash.ts");
  const base = new Set(["tmux/x.sh", "keep.sh", "run.sh", "x/run.sh"]);
  const rev = new Set(["config/tmux/x.sh", "keep.sh", "p/x/run.sh"]);
  const moved = movedFrom(base, rev);
  expect(moved("config/tmux/x.sh")).toBe("tmux/x.sh");
  // Still present in the revision: not a move.
  expect(moved("config/keep.sh")).toBeUndefined();
  // Both run.sh and x/run.sh are gone and both are tails of p/x/run.sh: ambiguous, so no move.
  expect(moved("p/x/run.sh")).toBeUndefined();
  // A different name is never a move.
  expect(moved("config/tmux/y.sh")).toBeUndefined();
});
