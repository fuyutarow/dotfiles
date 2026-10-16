import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { jsonOf, z } from "../../../hooks/zod.ts";

const SCRIPT = resolve(import.meta.dir, "../scripts/fmt-staged.ts");
const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

async function fixture(initialize = true) {
  const dir = await mkdtemp(join(tmpdir(), "fmt-staged-jj-"));
  dirs.push(dir);
  const root = join(dir, "repo");
  const bin = join(dir, "bin");
  await mkdir(root);
  await mkdir(bin);
  const marker = join(dir, "git-called");
  await writeFile(marker, "");
  await writeFile(
    join(bin, "git"),
    `#!${process.execPath}\nawait Bun.write(${JSON.stringify(marker)}, "git called"); process.exit(1);\n`,
    { mode: 0o755 },
  );
  const config = join(dir, "jj.toml");
  await writeFile(
    config,
    '[user]\nname = "Formatter test"\nemail = "fmt@example.invalid"\n[signing]\nbehavior = "drop"\n',
  );
  const formatter = join(dir, "upper.ts");
  await writeFile(
    formatter,
    `import {readFile, writeFile} from "node:fs/promises";
for (const path of process.argv.slice(2)) await writeFile(path, (await readFile(path, "utf8")).toUpperCase());
if (process.env.STRAY) await writeFile("base.md", "strayed\\n");
if (process.env.FAIL_FORMATTER) process.exit(3);
`,
  );
  const env = {
    ...process.env,
    JJ_CONFIG: config,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    PRECOMMIT_VCS: undefined,
    PRECOMMIT_PATHS_FILE: undefined,
    PRECOMMIT_REV: undefined,
    PRECOMMIT_BASE: undefined,
  };
  const execute = async (
    cmd: string[],
    extra: Record<string, string> = {},
    cwd = root,
  ) => {
    const child = Bun.spawn(cmd, {
      cwd,
      env: { ...env, ...extra },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out, err, code };
  };
  const jj = async (...args: string[]) => {
    const result = await execute(["jj", ...args]);
    expect(result.code, result.err).toBe(0);
    return result.out.trim();
  };
  if (initialize) {
    await jj("git", "init", "--no-colocate");
    await writeFile(join(root, "base.md"), "base\n");
    await writeFile(join(root, "deleted.md"), "delete me\n");
    await jj("commit", "-m", "fixture base");
  }
  const run = (
    args: string[] = [],
    extra: Record<string, string> = {},
    cwd = root,
  ) =>
    execute(
      [
        process.execPath,
        SCRIPT,
        "--tool",
        `md=${process.execPath} ${formatter}`,
        ...args,
      ],
      extra,
      cwd,
    );
  const disk = (path: string) => readFile(join(root, path), "utf8");
  const snapshot = async (paths: string[]) => {
    const rev = await jj("log", "--no-graph", "-r", "@", "-T", "commit_id");
    const base = await jj("log", "--no-graph", "-r", "@-", "-T", "commit_id");
    const file = join(dir, "paths");
    await writeFile(file, `${paths.join("\0")}\0`);
    return {
      PRECOMMIT_VCS: "jj",
      PRECOMMIT_REV: rev,
      PRECOMMIT_BASE: base,
      PRECOMMIT_PATHS_FILE: file,
    };
  };
  return { dir, root, marker, run, jj, disk, execute, snapshot };
}

describe("fmt-staged jj", () => {
  test("formats exactly changed regular matching files from a subdirectory without Git", async () => {
    const f = await fixture();
    await mkdir(join(f.root, "notes"));
    for (const path of [
      "base.md",
      "notes/a space.md",
      "notes/line\nbreak.md",
      "notes/literal*.md",
    ]) {
      await writeFile(join(f.root, path), "changed\n");
    }
    await writeFile(join(f.root, "untouched.md"), "unchanged\n");
    await f.jj("file", "track", "untouched.md");
    // Put the unchanged file in the parent without including the target changes.
    await f.jj("squash", "-m", "fixture unchanged file", "--", "untouched.md");
    await writeFile(join(f.root, "other.txt"), "not a matching extension\n");
    await rm(join(f.root, "deleted.md"));
    await symlink("untouched.md", join(f.root, "link.md"));
    const result = await f.run([], {}, join(f.root, "notes"));
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain("formatted 4 of 4 changed file(s)");
    for (const path of [
      "base.md",
      "notes/a space.md",
      "notes/line\nbreak.md",
      "notes/literal*.md",
    ])
      expect(await f.disk(path)).toBe("CHANGED\n");
    expect(await f.disk("untouched.md")).toBe("unchanged\n");
    expect(await f.disk("other.txt")).toBe("not a matching extension\n");
    expect(await readFile(f.marker, "utf8")).toBe("");
  });

  test("requires a jj repository and reports the requirement", async () => {
    const f = await fixture(false);
    const result = await f.run();
    expect(result.code).toBe(2);
    expect(result.err).toContain("requires a jj repository");
    expect(await readFile(f.marker, "utf8")).toBe("");
  });

  test("unchanged or nonmatching files are a no-op", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "other.txt"), "other\n");
    const result = await f.run();
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain("no changed file matches");
    expect(await f.disk("base.md")).toBe("base\n");
  });

  test("excludes matching changed paths", async () => {
    const f = await fixture();
    await mkdir(join(f.root, "archives"));
    await writeFile(join(f.root, "archives/old.md"), "old\n");
    expect((await f.run(["--exclude", "archives/**"])).code).toBe(0);
    expect(await f.disk("archives/old.md")).toBe("old\n");
  });

  test("formatter failure fails the gate", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "a.md"), "hello\n");
    const result = await f.run([], { FAIL_FORMATTER: "1" });
    expect(result.code).toBe(1);
    expect(result.out).toContain("exited 3");
  });

  test("edits outside the file list fail the gate", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "a.md"), "hello\n");
    const result = await f.run([], { STRAY: "1" });
    expect(result.code).toBe(1);
    expect(result.out).toContain("FAIL: the formatter changed base.md");
  });

  test("root-package bin resolves to this helper from another repository", async () => {
    const f = await fixture();
    const pkgResult = jsonOf(
      z.object({ bin: z.record(z.string(), z.string()) }),
    ).safeParse(
      await Bun.file(
        resolve(import.meta.dir, "../../../../package.json"),
      ).text(),
    );
    expect(pkgResult.success).toBe(true);
    if (!pkgResult.success) return;
    const pkg = pkgResult.data;
    const bin = resolve(
      import.meta.dir,
      "../../../..",
      pkg.bin["fmt-staged"] ?? "missing-bin",
    );
    expect(bin).toBe(SCRIPT);
    await symlink(bin, join(f.dir, "fmt-staged"));
    await writeFile(join(f.root, "a.md"), "hello\n");
    const result = await f.execute([
      process.execPath,
      join(f.dir, "fmt-staged"),
      "--tool",
      `md=${process.execPath} ${join(f.dir, "upper.ts")}`,
    ]);
    expect(result.code, result.err).toBe(0);
    expect(await f.disk("a.md")).toBe("HELLO\n");
  });

  test("J1 verifies selected immutable bytes and leaves worktree bytes alone", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "selected.md"), "FORMATTED\n");
    await writeFile(join(f.root, "other.md"), "unselected dirty\n");
    const env = await f.snapshot(["selected.md"]);
    await writeFile(join(f.root, "selected.md"), "later work\n");
    const result = await f.run([], env);
    expect(result.code, result.err).toBe(0);
    expect(result.out).toContain("verified 1 selected file(s)");
    expect(await f.disk("selected.md")).toBe("later work\n");
    expect(await f.disk("other.md")).toBe("unselected dirty\n");
    expect(await readFile(f.marker, "utf8")).toBe("");
  });

  test("J1 refuses snapshot bytes needing formatting without rewriting them", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "selected.md"), "needs formatting\n");
    const result = await f.run([], await f.snapshot(["selected.md"]));
    expect(result.code, result.err).toBe(1);
    expect(result.out).toContain("REFUSE: selected.md needs formatting");
    expect(await f.disk("selected.md")).toBe("needs formatting\n");
  });

  test("malformed J1 context fails closed", async () => {
    const f = await fixture();
    const result = await f.run([], { PRECOMMIT_VCS: "jj" });
    expect(result.code).toBe(2);
    expect(result.err).toContain("jj mode needs");
  });

  test("usage errors exit 2", async () => {
    const f = await fixture();
    expect((await f.execute([process.execPath, SCRIPT])).code).toBe(2);
    expect((await f.run(["--tool", "noequals"])).code).toBe(2);
    expect((await f.run(["--unknown"])).code).not.toBe(0);
  });

  test("source has no Git command path", async () => {
    expect(await readFile(SCRIPT, "utf8")).not.toMatch(/\bgit\b/iu);
  });
});
