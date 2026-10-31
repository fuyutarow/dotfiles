import {
  afterAll,
  beforeAll,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import housePackage from "../typescript/package.json";

const ROOT = resolve(import.meta.dir, "../..");
const scratch = await mkdtemp(join(tmpdir(), "preset-manifests-"));
const fixtureRoot = join(scratch, "dotfiles");
const cliPath = join(fixtureRoot, "standard-presets/src/cli.ts");

// These tests run several real CLI processes, each with its own 30-second deadline.
setDefaultTimeout(60_000);

beforeAll(async () => {
  await mkdir(join(fixtureRoot, "standard-presets"), { recursive: true });
  for (const directory of [
    "src",
    "typescript",
    "python",
    "rust",
    "julia",
    "latex",
  ])
    await cp(
      join(ROOT, "standard-presets", directory),
      join(fixtureRoot, "standard-presets", directory),
      { recursive: true },
    );
  for (const directory of ["agents", "scripts", "node_modules"])
    await symlink(join(ROOT, directory), join(fixtureRoot, directory));
  await mkdir(join(fixtureRoot, "standard-presets/demo"));
  await writeFile(
    join(fixtureRoot, "standard-presets/demo/preset.toml"),
    `name = "demo"
description = "Demo configuration"
files = [{ source = "config.toml", destination = ".config/demo.toml" }]
check = ["bun test standard-presets/demo/tests"]
`,
  );
  await writeFile(
    join(fixtureRoot, "standard-presets/demo/config.toml"),
    "enabled = true\n",
  );
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function run(...args: string[]) {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    cwd: scratch,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

async function target() {
  return mkdtemp(join(scratch, "target-"));
}

describe("manifest preset CLI", () => {
  test("every language applies to an empty repo and immediately has no diff", async () => {
    const languages = ["typescript", "python", "rust", "julia", "latex"];
    const listed = Bun.spawn(
      [process.execPath, join(ROOT, "standard-presets/src/cli.ts"), "list"],
      {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(listed.stdout).text(),
      new Response(listed.stderr).text(),
      listed.exited,
    ]);
    expect(exit).toBe(0);
    expect(stderr).toBe("");
    expect(
      stdout
        .trim()
        .split("\n")
        .map((line) => line.split("\t")[0]),
    ).toEqual(languages);
    for (const language of languages) {
      const repo = await target();
      expect(
        (await run("apply", language, "--to", repo, "--dry-run")).exit,
      ).toBe(0);
      expect((await run("apply", language, "--to", repo)).exit).toBe(0);
      expect((await run("diff", language, "--to", repo)).exit).toBe(0);
    }
  }, 60_000);

  test("default and declared placement emit relative imports", async () => {
    const repo = await target();
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
    expect(
      await Array.fromAsync(new Bun.Glob("*.{ts,js}").scan({ cwd: repo })),
    ).toEqual([]);
    for (const script of ["lint-oxlint.ts", "lint-knip.ts"])
      expect(await Bun.file(join(repo, "tools", script)).text()).toContain(
        '"../src/zod.ts"',
      );
    expect((await run("diff", "typescript", "--to", repo)).exit).toBe(0);
    const custom = await target();
    await writeFile(
      join(fixtureRoot, "standard-presets/consumers.toml"),
      `[[consumers]]\nroot = ${JSON.stringify(custom)}\nplacement = { scripts = "scripts/checks", oxlint = "config/lint", source = "lib" }\n`,
    );
    expect((await run("apply", "typescript", "--to", custom)).exit).toBe(0);
    expect(
      await Bun.file(join(custom, "scripts/checks/lint-knip.ts")).text(),
    ).toContain('"../../lib/zod.ts"');
    expect(await Bun.file(join(custom, ".oxlintrc.json")).text()).toContain(
      "./config/lint/house.oxlintrc.json",
    );
    expect((await run("diff", "typescript", "--to", custom)).exit).toBe(0);
  });

  test("a directory-only demo addition lists, applies, and diffs", async () => {
    const listed = await run("list");
    expect(listed.exit).toBe(0);
    expect(
      listed.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\t")[0]),
    ).toEqual(["typescript", "python", "rust", "julia", "latex", "demo"]);
    const repo = await target();
    expect(await run("apply", "demo", "--to", repo, "--dry-run")).toEqual({
      exit: 0,
      stderr: "",
      stdout: "[log] preset: would write .config/demo.toml\n",
    });
    expect(await Bun.file(join(repo, ".config/demo.toml")).exists()).toBe(
      false,
    );
    expect((await run("diff", "demo", "--to", repo)).exit).toBe(1);
    expect(await run("apply", "demo", "--to", repo)).toEqual({
      exit: 0,
      stderr: "",
      stdout: "[log] preset: wrote .config/demo.toml\n",
    });
    expect(await readFile(join(repo, ".config/demo.toml"), "utf8")).toBe(
      "enabled = true\n",
    );
    expect(await run("diff", "demo", "--to", repo)).toEqual({
      exit: 0,
      stderr: "",
      stdout: "[log] preset: demo is up to date\n",
    });
    expect((await run("diff", "demo", repo)).exit).toBe(0);
    await writeFile(join(repo, ".config/demo.toml"), "enabled = false\n");
    expect(await run("diff", "demo", "--to", repo)).toEqual({
      exit: 1,
      stderr: "",
      stdout:
        "--- .config/demo.toml (target)\n+++ .config/demo.toml (preset)\n@@ -1 +1 @@\n-enabled = false\n+enabled = true\n",
    });
  });

  test("typescript preserves repo ignores and detects managed house rule edits", async () => {
    const repo = await target();
    expect(
      (await run("apply", "typescript", "--to", repo, "--dry-run")).exit,
    ).toBe(0);
    expect(await Bun.file(join(repo, ".oxlintrc.json")).exists()).toBe(false);
    expect(await Bun.file(join(repo, "house.oxlintrc.json")).exists()).toBe(
      false,
    );
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
    const text = await readFile(join(repo, ".oxlintrc.json"), "utf8");
    expect((await lstat(join(repo, ".oxlintrc.json"))).isSymbolicLink()).toBe(
      false,
    );
    expect(text).toContain('"./.oxlint/house.oxlintrc.json"');
    expect(text).not.toContain(ROOT);
    const housePath = join(repo, ".oxlint/house.oxlintrc.json");
    const house = await readFile(housePath, "utf8");
    expect(house).toContain("../node_modules/oxlint/configuration_schema.json");
    expect((await lstat(housePath)).isSymbolicLink()).toBe(false);
    expect(house).not.toContain('"ignorePatterns"');
    expect((await run("diff", "typescript", repo)).exit).toBe(0);
    const local = text.replace(
      '"ignorePatterns": []',
      '"ignorePatterns": ["agents/hooks/vendor"]',
    );
    await writeFile(join(repo, ".oxlintrc.json"), local);
    expect((await run("diff", "typescript", repo)).exit).toBe(0);
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
    expect(await readFile(join(repo, ".oxlintrc.json"), "utf8")).toBe(local);
    await writeFile(
      housePath,
      house.replace(
        '"typescript/no-explicit-any": "error"',
        '"typescript/no-explicit-any": "off"',
      ),
    );
    const drift = await run("diff", "typescript", repo);
    expect(drift.exit).toBe(1);
    expect(drift.stdout).toContain("house.oxlintrc.json (target)");
    await writeFile(join(repo, "package.json"), '{"name":"custom"}\n');
    const synced = await run("sync", "typescript", "--to", repo);
    expect(synced.exit).toBe(1);
    expect(synced.stdout).toContain("devDependencies.oxlint:");
    expect(await readFile(join(repo, "package.json"), "utf8")).toBe(
      '{"name":"custom"}\n',
    );
    expect(await readFile(join(repo, ".oxlintrc.json"), "utf8")).toBe(local);
    expect(await readFile(housePath, "utf8")).toBe(house);
  });

  test("typescript apply does not create a managed mise task fragment", async () => {
    const repo = await target();
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
    expect(await Bun.file(join(repo, "mise-tasks.toml")).exists()).toBe(false);
    expect((await run("diff", "typescript", "--to", repo)).exit).toBe(0);
  });

  test("consumer package identity survives apply, diff and sync with house keys", async () => {
    const repo = await target();
    const consumer = {
      name: "consumer-cli",
      bin: { consumer: "src/cli.ts", worker: "src/worker.ts" },
      workspaces: ["packages/*"],
      type: "module",
      dependencies: { "type-flag": "4.5.0", consola: "3.4.2" },
      devDependencies: { ...housePackage.devDependencies, extra: "1.0.0" },
      engines: { ...housePackage.engines, node: ">=22" },
    };
    const bytes = JSON.stringify(consumer);
    await writeFile(join(repo, "package.json"), bytes);
    for (const action of ["apply", "diff", "sync"]) {
      const result = await run(action, "typescript", "--to", repo);
      expect(result.exit, result.stdout + result.stderr).toBe(0);
      expect(await readFile(join(repo, "package.json"), "utf8")).toBe(bytes);
    }
  });

  for (const key of Object.keys(housePackage.devDependencies)) {
    for (const mode of ["changed", "missing"]) {
      test(`${mode} house devDependency ${key} fails diff and sync`, async () => {
        const repo = await target();
        expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
        const devDependencies: Record<string, string> = {
          ...housePackage.devDependencies,
        };
        if (mode === "changed") devDependencies[key] = "0.0.0";
        else delete devDependencies[key];
        const bytes = JSON.stringify({ ...housePackage, devDependencies });
        await writeFile(join(repo, "package.json"), bytes);
        for (const action of ["diff", "sync"]) {
          const result = await run(action, "typescript", "--to", repo);
          expect(result.exit).toBe(1);
          expect(result.stdout).toContain(`devDependencies.${key}: expected`);
          expect(await readFile(join(repo, "package.json"), "utf8")).toBe(
            bytes,
          );
        }
      });
    }
  }

  for (const engines of [{}, { bun: ">=0.0.0" }, { bun: 143 }]) {
    test(`nonconforming engines.bun ${JSON.stringify(engines)} fails diff and sync`, async () => {
      const repo = await target();
      expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
      const bytes = JSON.stringify({ ...housePackage, engines });
      await writeFile(join(repo, "package.json"), bytes);
      for (const action of ["diff", "sync"]) {
        const result = await run(action, "typescript", "--to", repo);
        expect(result.exit).toBe(1);
        expect(result.stdout).toContain("engines.bun: expected");
        expect(await readFile(join(repo, "package.json"), "utf8")).toBe(bytes);
      }
    });
  }

  test("invalid consumer JSON fails diff and sync as drift", async () => {
    const repo = await target();
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
    await writeFile(join(repo, "package.json"), "{invalid");
    for (const action of ["diff", "sync"]) {
      const result = await run(action, "typescript", "--to", repo);
      expect(result.exit).toBe(1);
      expect(result.stdout).toContain(
        "package.json: missing or invalid JSON object",
      );
    }
  });

  test("invalid requirement sources fail discovery before any target writes", async () => {
    const source = join(
      fixtureRoot,
      "standard-presets/typescript/package.json",
    );
    const original = await readFile(source, "utf8");
    for (const [bytes, diagnostic] of [
      ["{invalid", "requiredJsonKeys needs a JSON object"],
      ["{}", "missing required JSON key: dependencies.consola"],
    ] as const) {
      const repo = await target();
      await writeFile(source, bytes);
      const result = await run("apply", "typescript", "--to", repo);
      await writeFile(source, original);
      expect(result.exit).toBe(2);
      expect(result.stderr).toContain(diagnostic);
      expect(await Bun.file(join(repo, "house-plugin.js")).exists()).toBe(
        false,
      );
    }
  });

  test("apply and sync refuse consumer symlinks before writing any files", async () => {
    const repo = await target();
    const outside = join(scratch, "outside.json");
    await writeFile(outside, "outside bytes\n");
    await symlink(outside, join(repo, ".oxlintrc.json"));
    for (const action of ["apply", "sync"]) {
      const result = await run(action, "typescript", "--to", repo);
      expect(result.exit).toBe(2);
      expect(result.stderr).toContain("consumer symlink");
    }
    expect(await readFile(outside, "utf8")).toBe("outside bytes\n");
    expect(await Bun.file(join(repo, "package.json")).exists()).toBe(false);
  });

  test("delivered config and plugin lint using only consumer-owned configuration files", async () => {
    const repo = await target();
    expect((await run("apply", "typescript", "--to", repo)).exit).toBe(0);
    await mkdir(join(repo, "node_modules"));
    await cp(
      join(ROOT, "node_modules/oxlint-plugin-eslint"),
      join(repo, "node_modules/oxlint-plugin-eslint"),
      { recursive: true, dereference: true },
    );
    await writeFile(join(repo, "clean.ts"), "export const value = 1;\n");
    const lint = (file: string) =>
      Bun.spawnSync(
        [
          process.execPath,
          join(ROOT, "node_modules/oxlint/bin/oxlint"),
          "--format=json",
          file,
        ],
        { cwd: repo, timeout: 60_000 },
      );
    const good = lint("clean.ts");
    expect(good.exitCode, good.stderr.toString()).toBe(0);
    expect(good.stdout.toString()).toContain('"number_of_files": 1');
    await writeFile(join(repo, "bad.ts"), "export const value = Date.now();\n");
    const bad = lint("bad.ts");
    expect(bad.exitCode, bad.stderr.toString()).toBe(1);
    expect(bad.stdout.toString()).toContain("Date is banned");
    await writeFile(
      join(repo, ".oxlint/house-plugin.js"),
      "// consumer edit\n",
    );
    const drift = await run("diff", "typescript", repo);
    expect(drift.exit).toBe(1);
    expect(drift.stdout).toContain("house-plugin.js (target)");
  }, 60_000);

  test("missing source reports its path and prevents writes", async () => {
    const path = join(fixtureRoot, "standard-presets/demo/config.toml");
    await rm(path);
    const repo = await target();
    const result = await run("apply", "demo", "--to", repo);
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain(`missing source: ${path}`);
    expect(await Bun.file(join(repo, ".config/demo.toml")).exists()).toBe(
      false,
    );
    await writeFile(path, "enabled = true\n");
  });

  for (const args of [
    ["list", "typescript"],
    ["diff", "demo", "--dry-run"],
    ["apply", "unknown"],
    ["apply", "demo"],
    ["diff", "demo", "a", "--to", "b"],
    ["apply", "demo", "a", "--to", "b"],
    ["list", "--__proto__"],
  ]) {
    test(`rejects invalid arguments: ${JSON.stringify(args)}`, async () => {
      expect((await run(...args)).exit).not.toBe(0);
    });
  }
});

test("TypeScript apply delivers the single Bun engines declaration", async () => {
  const consumer = await target();
  expect((await run("apply", "typescript", "--to", consumer)).exit).toBe(0);
  const delivered = await readFile(join(consumer, "package.json"), "utf8");
  const source = await readFile(
    join(ROOT, "standard-presets/typescript/package.json"),
    "utf8",
  );
  expect(delivered).toBe(source);
  expect(delivered.match(/"bun"\s*:/gu)).toHaveLength(1);
  expect(delivered).toContain('"bun": ">=1.4.3"');
});
