import { afterAll, describe, expect, test as bunTest } from "bun:test";
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
import {
  jjCandidate,
  type JjPrecommit,
} from "../../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import { findings } from "../config-map.ts";

const ROOT = resolve(import.meta.dir, "../..");
const DISABLE_COMMENT = ["// eslint", "disable\n"].join("-");
// Full-suite parallel run measured these JJ snapshot fixtures at 5.0–5.5s; keep a local 12s bound.
const SLOW_JJ_FIXTURE_TIMEOUT_MS = 12_000;
function test(
  name: string,
  body: () => void | Promise<void>,
  timeout = SLOW_JJ_FIXTURE_TIMEOUT_MS,
): void {
  bunTest(name, body, timeout);
}
const dirs: string[] = [];
afterAll(async () => {
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "precommit-jj-test-"));
  dirs.push(dir);
  const root = join(dir, "repo");
  const bin = join(dir, "bin");
  await mkdir(root);
  await mkdir(bin);
  const jj = Bun.which("jj");
  expect(jj).not.toBeNull();
  if (jj !== null) await symlink(jj, join(bin, "jj"));
  await symlink(process.execPath, join(bin, "bun"));
  const marker = join(dir, "git-called");
  await writeFile(marker, "");
  await writeFile(
    join(bin, "git"),
    `#!${process.execPath}\nimport { appendFileSync } from "node:fs"; appendFileSync(${JSON.stringify(marker)}, "called\\n"); process.exit(1);\n`,
    { mode: 0o755 },
  );
  const config = join(dir, "jj.toml");
  await writeFile(
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
  const write = async (path: string, content: string) => {
    const target = join(root, path);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, content);
  };
  const command = async (...args: string[]) => {
    const r = await runProcess(["jj", ...args], {
      cwd: root,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
    return r.stdout.toString().trim();
  };
  await command("git", "init", "--no-colocate");
  await write("package.json", '{"name":"j1-fixture","private":true}\n');
  await write(
    "scripts/config-registry.ts",
    'export const surfaces = () => [{kind:"in-place",when:"all",sources:["package.json","agents/skills-listing-budget.json","agents/skills.thirdparty.toml",".claude-plugin/marketplace.json","agents/skills/.claude-plugin/plugin.json"],deployed:"fixture",consumer:"test",writer:"test",verify:"test"}];\n',
  );
  await write("scripts/good.ts", "export const value = 1;\n");
  await write("selected.txt", "BASE\n");
  await write(
    "agents/skills/doing-things/SKILL.md",
    "---\nname: doing-things\ndescription: >-\n  Does a concrete fixture task and verifies its outcome. Use when testing the J1 snapshot consumer interface.\n---\n\n# Doing things\n\nRead the supplied input and report the result.\n",
  );
  await write("agents/skills/README.md", "[Doing things](doing-things/)\n");
  await write(
    ".claude-plugin/marketplace.json",
    `${JSON.stringify({
      name: "dotfiles",
      version: "1.0.0",
      description: "Fixture marketplace",
      owner: { name: "Test" },
      plugins: [{ name: "dotfiles", source: "./agents/skills" }],
    })}\n`,
  );
  await write(
    "agents/skills/.claude-plugin/plugin.json",
    `${JSON.stringify({
      name: "dotfiles",
      version: "1.0.0",
      description: "Fixture plugin",
      author: { name: "Test" },
      skills: ["./"],
    })}\n`,
  );
  await write("agents/skills.thirdparty.toml", 'cli_version = "1.5.22"\n');
  await write(
    "agents/skills-listing-budget.json",
    '{"maxListingChars":10000}\n',
  );
  await command("commit", "-m", "consumer fixture base");
  const base = await command(
    "log",
    "--no-graph",
    "-r",
    "@-",
    "-T",
    "commit_id",
  );
  const snapshot = async (paths: string[]) => {
    await command("status");
    const rev = await command(
      "log",
      "--no-graph",
      "-r",
      "@",
      "-T",
      "commit_id",
    );
    const file = join(dir, "paths");
    await writeFile(file, `${paths.join("\0")}\0`);
    const context: JjPrecommit = { root, base, rev, paths };
    const run = async (
      script: string,
      args: string[] = [],
      extra: Record<string, string> = {},
    ) =>
      runProcess([process.execPath, join(ROOT, script), ...args], {
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
  test("suppression gate reads selected REV bytes and ignores unselected WIP", async () => {
    const f = await fixture();
    await f.write("scripts/good.ts", "export const value = 2;\n");
    await f.write("scripts/unselected.ts", DISABLE_COMMENT);
    const good = await f.snapshot(["scripts/good.ts"]);
    await f.write("scripts/good.ts", DISABLE_COMMENT);
    expect((await good.run("scripts/lint-ts-no-disable.ts")).exitCode).toBe(0);
    const bad = await f.snapshot(["scripts/good.ts"]);
    await f.write("scripts/good.ts", "export const value = 3;\n");
    const r = await bad.run("scripts/lint-ts-no-disable.ts");
    expect(r.exitCode).toBe(1);
    expect(r.stdout.toString()).toContain("scripts/good.ts:1:");
    expect(await readFile(f.marker, "utf8")).toBe("");
  });

  test(
    "Bun floor checks selected snapshot scripts and catches a Node entrypoint",
    async () => {
      const f = await fixture();
      await f.write("scripts/good.ts", "export const value = 2;\n");
      await f.write(
        "scripts/unselected.ts",
        "#!/usr/bin/env node\nprocess.exit(0);\n",
      );
      const good = await f.snapshot(["scripts/good.ts"]);
      const pass = await good.run("scripts/lint-bun.ts");
      expect(
        pass.exitCode,
        pass.stdout.toString() + pass.stderr.toString(),
      ).toBe(0);
      await f.write(
        "scripts/good.ts",
        "#!/usr/bin/env node\nprocess.exit(0);\n",
      );
      const bad = await f.snapshot(["scripts/good.ts"]);
      await f.write("scripts/good.ts", "export const value = 3;\n");
      expect((await bad.run("scripts/lint-bun.ts")).exitCode).toBe(1);
      expect(await readFile(f.marker, "utf8")).toBe("");
    },
    SLOW_JJ_FIXTURE_TIMEOUT_MS,
  );

  test(
    "skill collection gates overlay selected changes and exclude an unfinished skill",
    async () => {
      const f = await fixture();
      await f.write(
        "agents/skills/doing-things/SKILL.md",
        (await readFile(
          join(f.root, "agents/skills/doing-things/SKILL.md"),
          "utf8",
        )) + "\nReport a checked result.\n",
      );
      await f.write(
        "agents/skills/unfinished/SKILL.md",
        "invalid unfinished WIP\n",
      );
      const good = await f.snapshot(["agents/skills/doing-things/SKILL.md"]);
      for (const script of [
        "scripts/lint-skills-index.ts",
        "scripts/lint-skills-floor.ts",
      ]) {
        const r = await good.run(script);
        expect(r.exitCode, r.stdout.toString() + r.stderr.toString()).toBe(0);
      }
      const bad = await f.snapshot(["agents/skills/unfinished/SKILL.md"]);
      expect((await bad.run("scripts/lint-skills-index.ts")).exitCode).toBe(1);
      expect((await bad.run("scripts/lint-skills-floor.ts")).exitCode).toBe(1);
      expect(await readFile(f.marker, "utf8")).toBe("");
    },
    SLOW_JJ_FIXTURE_TIMEOUT_MS,
  );

  test(
    "jj formatter verifies immutable temporary copies and refuses formatting changes",
    async () => {
      const f = await fixture();
      const formatter = join(f.dir, "upper.ts");
      await writeFile(
        formatter,
        'import { readFileSync, writeFileSync } from "node:fs"; for (const path of process.argv.slice(2)) writeFileSync(path, readFileSync(path, "utf8").toUpperCase());\n',
      );
      const args = ["--tool", `txt=${process.execPath} ${formatter}`];
      await f.write("selected.txt", "ALREADY FORMATTED\n");
      const good = await f.snapshot(["selected.txt"]);
      await f.write("selected.txt", "later worktree bytes\n");
      const pass = await good.run(
        "agents/skills/wiring-mise-tasks/scripts/fmt-staged.ts",
        args,
      );
      expect(
        pass.exitCode,
        pass.stdout.toString() + pass.stderr.toString(),
      ).toBe(0);
      expect(await readFile(join(f.root, "selected.txt"), "utf8")).toBe(
        "later worktree bytes\n",
      );
      const bad = await f.snapshot(["selected.txt"]);
      const r = await bad.run(
        "agents/skills/wiring-mise-tasks/scripts/fmt-staged.ts",
        args,
      );
      expect(r.exitCode).toBe(1);
      expect(r.stdout.toString()).toContain("needs formatting");
      expect(await readFile(join(f.root, "selected.txt"), "utf8")).toBe(
        "later worktree bytes\n",
      );
      expect(await readFile(f.marker, "utf8")).toBe("");
    },
    SLOW_JJ_FIXTURE_TIMEOUT_MS,
  );

  test("config inventory checks the candidate, including selected deletions", async () => {
    const f = await fixture();
    await f.write("new/config.toml", "x = 1\n");
    await rm(join(f.root, "selected.txt"));
    const { context } = await f.snapshot(["selected.txt"]);
    const paths = [...(await Promise.resolve(jjCandidate(context))).keys()];
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
    expect(
      await Promise.resolve(
        findings(rows, [], (source) => paths.includes(source)),
      ),
    ).toEqual([
      "missing: selected.txt — a registry row names a source that does not exist",
    ]);
  });

  test("config-map reads its candidate registry and rejects selected unregistered config", async () => {
    const f = await fixture();
    await f.write("scripts/good.ts", "export const value = 2;\n");
    const good = await f.snapshot(["scripts/good.ts"]);
    await f.write(
      "scripts/config-registry.ts",
      'export const surfaces = () => [{kind:"in-place",when:"all",sources:["unrelated-missing.json","agents/skills.thirdparty.toml",".claude-plugin/marketplace.json","agents/skills/.claude-plugin/plugin.json"],deployed:"fixture",consumer:"test",writer:"test",verify:"test"}];\n',
    );
    const pass = await good.run("scripts/config-map.ts", ["--check"]);
    expect(pass.exitCode, pass.stdout.toString() + pass.stderr.toString()).toBe(
      0,
    );
    await f.write("new/config.toml", "x = 1\n");
    const bad = await f.snapshot(["new/config.toml"]);
    const r = await bad.run("scripts/config-map.ts", ["--check"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout.toString()).toContain("unregistered: new/config.toml");
    expect(await readFile(f.marker, "utf8")).toBe("");
  });

  test("incomplete jj environment fails closed without trying Git", async () => {
    const f = await fixture();
    const { run } = await f.snapshot(["selected.txt"]);
    const r = await run("scripts/lint-ts-no-disable.ts", [], {
      PRECOMMIT_REV: "not-a-commit-id",
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr.toString()).toContain("full commit IDs");
    expect(await readFile(f.marker, "utf8")).toBe("");
  });
});

// Drain both pipes while waiting for the bounded subprocess.
async function runProcess(
  argv: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    stdin?: "ignore";
    stdout?: "pipe";
    stderr?: "pipe";
  } = {},
) {
  const child = Bun.spawn(argv, {
    ...options,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeout ?? 120_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
    child.exited,
  ]);
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}
