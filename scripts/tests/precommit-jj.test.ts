import { afterAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  jjCandidate,
  type JjPrecommit,
} from "../../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import { findings } from "../config-map.ts";

const ROOT = resolve(import.meta.dir, "../..");
const DISABLE_COMMENT = ["// eslint", "disable\n"].join("-");
const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "precommit-jj-test-"));
  dirs.push(dir);
  const root = join(dir, "repo");
  const bin = join(dir, "bin");
  mkdirSync(root);
  mkdirSync(bin);
  const jj = Bun.which("jj");
  expect(jj).not.toBeNull();
  if (jj !== null) symlinkSync(jj, join(bin, "jj"));
  symlinkSync(process.execPath, join(bin, "bun"));
  const marker = join(dir, "git-called");
  writeFileSync(marker, "");
  writeFileSync(
    join(bin, "git"),
    `#!${process.execPath}\nimport { appendFileSync } from "node:fs"; appendFileSync(${JSON.stringify(marker)}, "called\\n"); process.exit(1);\n`,
    { mode: 0o755 },
  );
  const config = join(dir, "jj.toml");
  writeFileSync(
    config,
    '[user]\nname = "J1 consumer"\nemail = "j1@example.invalid"\n[signing]\nbehavior = "drop"\n',
  );
  const env = {
    ...process.env,
    HOME: dir,
    XDG_CONFIG_HOME: join(dir, "config"),
    JJ_CONFIG: config,
    PATH: `${bin}:/usr/bin:/bin`,
  };
  const write = (path: string, content: string) => {
    const target = join(root, path);
    mkdirSync(resolve(target, ".."), { recursive: true });
    writeFileSync(target, content);
  };
  const command = (...args: string[]) => {
    const r = Bun.spawnSync(["jj", ...args], {
      cwd: root,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    return r.stdout.toString().trim();
  };
  command("git", "init", "--no-colocate");
  write("package.json", '{"name":"j1-fixture","private":true}\n');
  write(
    "scripts/config-registry.ts",
    'export const surfaces = () => [{kind:"in-place",when:"all",sources:["package.json","agents/skills-listing-budget.json"],deployed:"fixture",consumer:"test",writer:"test",verify:"test"}];\n',
  );
  write("scripts/good.ts", "export const value = 1;\n");
  write("selected.txt", "BASE\n");
  write(
    "agents/skills/doing-things/SKILL.md",
    "---\nname: doing-things\ndescription: >-\n  Does a concrete fixture task and verifies its outcome. Use when testing the J1 snapshot consumer interface.\n---\n\n# Doing things\n\nRead the supplied input and report the result.\n",
  );
  write("agents/skills/README.md", "[Doing things](doing-things/)\n");
  write("agents/skills-listing-budget.json", '{"maxListingChars":10000}\n');
  command("commit", "-m", "consumer fixture base");
  const base = command("log", "--no-graph", "-r", "@-", "-T", "commit_id");
  const snapshot = (paths: string[]) => {
    command("status");
    const rev = command("log", "--no-graph", "-r", "@", "-T", "commit_id");
    const file = join(dir, "paths");
    writeFileSync(file, `${paths.join("\0")}\0`);
    const context: JjPrecommit = { root, base, rev, paths };
    const run = (
      script: string,
      args: string[] = [],
      extra: Record<string, string> = {},
    ) =>
      Bun.spawnSync([process.execPath, join(ROOT, script), ...args], {
        cwd: root,
        env: {
          ...env,
          PRECOMMIT_VCS: "jj",
          PRECOMMIT_PATHS_FILE: file,
          PRECOMMIT_REV: rev,
          PRECOMMIT_BASE: base,
          ...extra,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 120_000,
      });
    return { context, run };
  };
  return { dir, root, marker, write, snapshot };
}

describe("J1 dotfiles consumers", () => {
  test("suppression gate reads selected REV bytes and ignores unselected WIP", () => {
    const f = fixture();
    f.write("scripts/good.ts", "export const value = 2;\n");
    f.write("scripts/unselected.ts", DISABLE_COMMENT);
    const good = f.snapshot(["scripts/good.ts"]);
    f.write("scripts/good.ts", DISABLE_COMMENT);
    expect(good.run("scripts/lint-ts-no-disable.ts").exitCode).toBe(0);
    const bad = f.snapshot(["scripts/good.ts"]);
    f.write("scripts/good.ts", "export const value = 3;\n");
    const r = bad.run("scripts/lint-ts-no-disable.ts");
    expect(r.exitCode).toBe(1);
    expect(r.stdout.toString()).toContain("scripts/good.ts:1:");
    expect(readFileSync(f.marker, "utf8")).toBe("");
  });

  test("Bun floor checks selected snapshot scripts and catches a Node entrypoint", () => {
    const f = fixture();
    f.write("scripts/good.ts", "export const value = 2;\n");
    f.write("scripts/unselected.ts", "#!/usr/bin/env node\nprocess.exit(0);\n");
    const good = f.snapshot(["scripts/good.ts"]);
    const pass = good.run("scripts/lint-bun.ts");
    expect(pass.exitCode, pass.stdout.toString() + pass.stderr.toString()).toBe(
      0,
    );
    f.write("scripts/good.ts", "#!/usr/bin/env node\nprocess.exit(0);\n");
    const bad = f.snapshot(["scripts/good.ts"]);
    f.write("scripts/good.ts", "export const value = 3;\n");
    expect(bad.run("scripts/lint-bun.ts").exitCode).toBe(1);
    expect(readFileSync(f.marker, "utf8")).toBe("");
  });

  test("skill collection gates overlay selected changes and exclude an unfinished skill", () => {
    const f = fixture();
    f.write(
      "agents/skills/doing-things/SKILL.md",
      readFileSync(
        join(f.root, "agents/skills/doing-things/SKILL.md"),
        "utf8",
      ) + "\nReport a checked result.\n",
    );
    f.write("agents/skills/unfinished/SKILL.md", "invalid unfinished WIP\n");
    const good = f.snapshot(["agents/skills/doing-things/SKILL.md"]);
    for (const script of [
      "scripts/lint-skills-index.ts",
      "scripts/lint-skills-floor.ts",
    ]) {
      const r = good.run(script);
      expect(r.exitCode, r.stdout.toString() + r.stderr.toString()).toBe(0);
    }
    const bad = f.snapshot(["agents/skills/unfinished/SKILL.md"]);
    expect(bad.run("scripts/lint-skills-index.ts").exitCode).toBe(1);
    expect(bad.run("scripts/lint-skills-floor.ts").exitCode).toBe(1);
    expect(readFileSync(f.marker, "utf8")).toBe("");
  });

  test("jj formatter verifies immutable temporary copies and refuses formatting changes", () => {
    const f = fixture();
    const formatter = join(f.dir, "upper.ts");
    writeFileSync(
      formatter,
      'import { readFileSync, writeFileSync } from "node:fs"; for (const path of process.argv.slice(2)) writeFileSync(path, readFileSync(path, "utf8").toUpperCase());\n',
    );
    const args = ["--tool", `txt=${process.execPath} ${formatter}`];
    f.write("selected.txt", "ALREADY FORMATTED\n");
    const good = f.snapshot(["selected.txt"]);
    f.write("selected.txt", "later worktree bytes\n");
    const pass = good.run(
      "agents/skills/wiring-mise-tasks/scripts/fmt-staged.ts",
      args,
    );
    expect(pass.exitCode, pass.stdout.toString() + pass.stderr.toString()).toBe(
      0,
    );
    expect(readFileSync(join(f.root, "selected.txt"), "utf8")).toBe(
      "later worktree bytes\n",
    );
    const bad = f.snapshot(["selected.txt"]);
    const r = bad.run(
      "agents/skills/wiring-mise-tasks/scripts/fmt-staged.ts",
      args,
    );
    expect(r.exitCode).toBe(1);
    expect(r.stdout.toString()).toContain("needs formatting");
    expect(readFileSync(join(f.root, "selected.txt"), "utf8")).toBe(
      "later worktree bytes\n",
    );
    expect(readFileSync(f.marker, "utf8")).toBe("");
  });

  test("config inventory checks the candidate, including selected deletions", () => {
    const f = fixture();
    f.write("new/config.toml", "x = 1\n");
    rmSync(join(f.root, "selected.txt"));
    const { context } = f.snapshot(["selected.txt"]);
    const paths = [...jjCandidate(context).keys()];
    expect(paths).not.toContain("selected.txt");
    expect(paths).not.toContain("new/config.toml");
    const rows = [
      {
        kind: "in-place",
        when: "all",
        sources: ["selected.txt"],
        deployed: "fixture",
        consumer: "test",
        writer: "test",
        verify: "test",
      },
    ] satisfies Parameters<typeof findings>[0];
    expect(findings(rows, [], (source) => paths.includes(source))).toEqual([
      "missing: selected.txt — a registry row names a source that does not exist",
    ]);
  });

  test("config-map reads its candidate registry and rejects selected unregistered config", () => {
    const f = fixture();
    f.write("scripts/good.ts", "export const value = 2;\n");
    const good = f.snapshot(["scripts/good.ts"]);
    f.write(
      "scripts/config-registry.ts",
      'export const surfaces = () => [{kind:"in-place",when:"all",sources:["unrelated-missing.json"],deployed:"fixture",consumer:"test",writer:"test",verify:"test"}];\n',
    );
    const pass = good.run("scripts/config-map.ts", ["--check"]);
    expect(pass.exitCode, pass.stdout.toString() + pass.stderr.toString()).toBe(
      0,
    );
    f.write("new/config.toml", "x = 1\n");
    const bad = f.snapshot(["new/config.toml"]);
    const r = bad.run("scripts/config-map.ts", ["--check"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout.toString()).toContain("unregistered: new/config.toml");
    expect(readFileSync(f.marker, "utf8")).toBe("");
  });

  test("incomplete jj environment fails closed without trying Git", () => {
    const f = fixture();
    const { run } = f.snapshot(["selected.txt"]);
    const r = run("scripts/lint-ts-no-disable.ts", [], {
      PRECOMMIT_REV: "not-a-commit-id",
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("full commit IDs");
    expect(readFileSync(f.marker, "utf8")).toBe("");
  });
});
