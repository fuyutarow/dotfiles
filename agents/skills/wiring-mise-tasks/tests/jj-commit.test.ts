import { afterAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../../hooks/zod.ts";
import {
  jjCandidate,
  jjChanged,
  jjContent,
  type JjPrecommit,
} from "../scripts/jj-precommit.ts";

const SCRIPT = resolve(import.meta.dir, "../scripts/jj-commit.ts");
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "jj-commit-test-"));
  dirs.push(dir);
  const root = join(dir, "repo");
  const bin = join(dir, "bin");
  mkdirSync(root);
  mkdirSync(bin);
  const binaries = [
    ["bun", process.execPath],
    ["jj", Bun.which("jj")],
    ["mise", Bun.which("mise")],
  ] satisfies [string, string | null][];
  for (const [name, binary] of binaries) {
    expect(binary, `${name} is required for J1 integration tests`).toBeTruthy();
    if (binary !== null && binary !== undefined)
      symlinkSync(binary, join(bin, name));
  }
  const marker = join(dir, "git-called");
  writeFileSync(marker, "");
  writeFileSync(
    join(bin, "git"),
    `#!${process.execPath}\nimport { appendFileSync } from "node:fs"; appendFileSync(${JSON.stringify(marker)}, "git called\\n"); process.exit(1);\n`,
    { mode: 0o755 },
  );
  const config = join(dir, "jj.toml");
  writeFileSync(
    config,
    '[user]\nname = "J1 test"\nemail = "j1@example.invalid"\n[signing]\nbehavior = "drop"\n',
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
    PRECOMMIT_VCS: undefined,
    PRECOMMIT_PATHS_FILE: undefined,
    PRECOMMIT_REV: undefined,
    PRECOMMIT_BASE: undefined,
  };
  const run = (cmd: string[], extra: Record<string, string> = {}) =>
    Bun.spawnSync(cmd, {
      cwd: root,
      env: { ...env, ...extra },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    });
  const jj = (...args: string[]) => {
    const r = run(["jj", ...args]);
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    return r.stdout.toString().trim();
  };
  const recorder = join(dir, "hook.ts");
  const receipt = join(dir, "receipt.json");
  writeFileSync(
    recorder,
    `
import { readFileSync, writeFileSync } from "node:fs";
const { PRECOMMIT_VCS: vcs, PRECOMMIT_PATHS_FILE: file, PRECOMMIT_REV: rev, PRECOMMIT_BASE: base } = process.env;
writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({vcs, file, rev, base, paths: readFileSync(file, "utf8")}));
if (process.env.CHANGE_SELECTED) writeFileSync("selected.txt", "changed during gate\\n");
process.exit(Number(process.env.FAIL_HOOK ?? "0"));
`,
  );
  writeFileSync(
    join(root, "mise.toml"),
    `[tasks.commit]\nrun = ${JSON.stringify(`bun ${SCRIPT}`)}\n[tasks."hook:pre-commit"]\nrun = ${JSON.stringify(`bun ${recorder}`)}\n`,
  );
  writeFileSync(join(root, "selected.txt"), "base selected\n");
  writeFileSync(join(root, "other.txt"), "base other\n");
  jj("git", "init", "--no-colocate");
  jj("commit", "-m", "fixture base");
  const base = jj("log", "--no-graph", "-r", "@-", "-T", "commit_id");
  const commit = (
    paths: string[],
    flags: string[] = [],
    extra: Record<string, string> = {},
  ) =>
    run(
      [
        "mise",
        "run",
        "commit",
        "--",
        "-m",
        "J1 selected commit",
        ...flags,
        "--",
        ...paths,
      ],
      extra,
    );
  return { dir, root, bin, marker, receipt, run, jj, base, commit };
}

function recorded(f: ReturnType<typeof fixture>) {
  // Test fixture JSON is compared at its byte boundary; Bun's typed decoder is unnecessary here.
  return Bun.file(f.receipt)
    .text()
    .then((text) => {
      const parsed = jsonOf(
        z.object({
          vcs: z.string(),
          file: z.string(),
          rev: z.string(),
          base: z.string(),
          paths: z.string(),
        }),
      ).safeParse(text);
      expect(parsed.success).toBe(true);
      if (!parsed.success) process.exit(2);
      return parsed.data;
    });
}

describe("jj gated commit (J1)", () => {
  test("passes the snapshot interface and preserves selected paths exactly", async () => {
    const f = fixture();
    mkdirSync(join(f.root, "notes"));
    writeFileSync(join(f.root, "notes", "a space.txt"), "new\n");
    writeFileSync(join(f.root, "selected.txt"), "selected edit\n");
    const paths = ["notes/a space.txt", "selected.txt", "notes/a space.txt"];
    const r = f.commit(paths);
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    const receipt = await recorded(f);
    expect(receipt.vcs).toBe("jj");
    expect(receipt.paths).toBe(`${paths.join("\0")}\0`);
    expect(receipt.rev).toMatch(/^[a-f0-9]{40}$/u);
    expect(receipt.base).toBe(f.base);
    expect(f.jj("file", "show", "-r", receipt.rev, "--", "selected.txt")).toBe(
      "selected edit",
    );
    expect(existsSync(receipt.file)).toBe(false);
  });

  test("a failed hook creates no commit and does not move alpha", async () => {
    const f = fixture();
    f.jj("bookmark", "set", "alpha", "-r", "@-");
    writeFileSync(join(f.root, "selected.txt"), "edit\n");
    const r = f.commit(["selected.txt"], [], { FAIL_HOOK: "7" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("nothing committed");
    expect(f.jj("log", "--no-graph", "-r", "@-", "-T", "commit_id")).toBe(
      f.base,
    );
    expect(f.jj("log", "--no-graph", "-r", "alpha", "-T", "commit_id")).toBe(
      f.base,
    );
    expect(f.jj("log", "--no-graph", "-r", "@", "-T", "description")).toBe("");
    expect(existsSync((await recorded(f)).file)).toBe(false);
  });

  test("records only selected paths and leaves other dirty paths in @", () => {
    const f = fixture();
    writeFileSync(join(f.root, "selected.txt"), "selected edit\n");
    writeFileSync(join(f.root, "other.txt"), "other dirty\n");
    writeFileSync(join(f.root, "unselected.txt"), "unselected addition\n");
    const r = f.commit(["selected.txt"]);
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(f.jj("diff", "-r", "@-", "--name-only")).toBe("selected.txt");
    expect(f.jj("diff", "-r", "@", "--name-only").split("\n")).toEqual([
      "other.txt",
      "unselected.txt",
    ]);
    expect(f.jj("file", "show", "-r", "@-", "--", "other.txt")).toBe(
      "base other",
    );
    expect(f.jj("log", "--no-graph", "-r", "alpha", "-T", "commit_id")).toBe(
      f.jj("log", "--no-graph", "-r", "@-", "-T", "commit_id"),
    );
  });

  test("NO-GIT PROOF: no index and a failing marker git on PATH", () => {
    const f = fixture();
    expect(existsSync(join(f.root, ".git"))).toBe(false);
    expect(existsSync(join(f.root, ".jj/repo/store/git/index"))).toBe(false);
    writeFileSync(join(f.root, "selected.txt"), "no git needed\n");
    const r = f.commit(["selected.txt"]);
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect(readFileSync(f.marker, "utf8")).toBe("");
  });

  test("--push lands alpha on a temporary bare remote through jj git push", () => {
    const f = fixture();
    const remote = join(f.dir, "remote");
    f.jj("git", "init", "--no-colocate", remote);
    const bare = join(remote, ".jj/repo/store/git");
    expect(readFileSync(join(bare, "config"), "utf8")).toContain("bare = true");
    f.jj("git", "remote", "add", "origin", bare);
    // This jj build uses Git's subprocess transport for push/clone. Only this transport test
    // exposes the real binary; the separate NO-GIT proof keeps the failing marker in place.
    const transport = Bun.which("git");
    expect(transport).not.toBeNull();
    rmSync(join(f.bin, "git"));
    if (transport !== null) symlinkSync(transport, join(f.bin, "git"));
    writeFileSync(join(f.root, "selected.txt"), "pushed\n");
    const r = f.commit(["selected.txt"], ["--push"]);
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    f.jj("git", "clone", "--no-colocate", bare, join(f.dir, "mirror"));
    expect(
      f.jj(
        "-R",
        join(f.dir, "mirror"),
        "log",
        "--no-graph",
        "-r",
        "alpha@origin",
        "-T",
        "commit_id",
      ),
    ).toBe(f.jj("log", "--no-graph", "-r", "alpha", "-T", "commit_id"));
    expect(readFileSync(f.marker, "utf8")).toBe("");
  });

  test("literal directories, newlines, deletion and fileset metacharacters stay in scope", async () => {
    const f = fixture();
    mkdirSync(join(f.root, "notes"));
    for (const name of ["literal*.txt", "line\nbreak.txt"])
      writeFileSync(join(f.root, "notes", name), "new\n");
    rmSync(join(f.root, "selected.txt"));
    writeFileSync(join(f.root, "other.txt"), "dirty\n");
    const r = f.commit(["notes/", "selected.txt"]);
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    expect((await recorded(f)).paths).toBe("notes/\0selected.txt\0");
    expect(f.jj("diff", "-r", "@", "--name-only")).toBe("other.txt");
    expect(f.jj("file", "list", "-r", "@-", "-T", 'path ++ "\\0"')).toContain(
      "notes/line\nbreak.txt\0",
    );
  });

  test("invalid or empty selections fail before running the hook", () => {
    for (const path of ["../outside", "/absolute", ".jj/repo", "missing.txt"]) {
      const f = fixture();
      writeFileSync(join(f.root, "selected.txt"), "edit\n");
      expect(f.commit([path]).exitCode).toBe(2);
      expect(f.commit(["selected.txt", path]).exitCode).toBe(2);
      expect(existsSync(f.receipt)).toBe(false);
      expect(f.jj("log", "--no-graph", "-r", "@-", "-T", "commit_id")).toBe(
        f.base,
      );
    }
  });

  test("selected content rewritten by the hook is refused", () => {
    const f = fixture();
    writeFileSync(join(f.root, "selected.txt"), "before gate\n");
    const r = f.commit(["selected.txt"], [], { CHANGE_SELECTED: "1" });
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toString()).toContain("changed during hook:pre-commit");
    expect(f.jj("log", "--no-graph", "-r", "@-", "-T", "commit_id")).toBe(
      f.base,
    );
  });

  test("candidate consumers read selected snapshot bytes and base bytes for other files", () => {
    const f = fixture();
    writeFileSync(join(f.root, "selected.txt"), "snapshotted\n");
    writeFileSync(join(f.root, "other.txt"), "unselected WIP\n");
    f.jj("status");
    const context: JjPrecommit = {
      root: f.root,
      base: f.base,
      rev: f.jj("log", "--no-graph", "-r", "@", "-T", "commit_id"),
      paths: ["selected.txt"],
    };
    writeFileSync(join(f.root, "selected.txt"), "later worktree bytes\n");
    expect(jjChanged(context)).toEqual(["selected.txt"]);
    expect(jjContent(context, "selected.txt").toString()).toBe("snapshotted\n");
    const view = jjCandidate(context);
    expect(view.get("selected.txt")).toBe(context.rev);
    expect(view.get("other.txt")).toBe(context.base);
    expect(
      jjContent(context, "other.txt", view.get("other.txt")).toString(),
    ).toBe("base other\n");
  });
});
