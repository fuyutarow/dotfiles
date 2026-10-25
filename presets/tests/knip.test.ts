import { afterAll, expect, test } from "bun:test";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { handleKnipResult } from "../typescript/lint-knip.ts";

const ROOT = resolve(import.meta.dir, "../..");
const PRESET = join(ROOT, "presets/typescript");
const SCRATCH = await mkdtemp(join(tmpdir(), "preset-knip-"));
afterAll(() => rm(SCRATCH, { recursive: true, force: true }));

async function fixture(name: string, clean: boolean): Promise<string> {
  const cwd = join(SCRATCH, name);
  await mkdir(join(cwd, "src"), { recursive: true });
  await mkdir(join(cwd, "tests"), { recursive: true });
  await cp(join(PRESET, "lint-knip.ts"), join(cwd, "lint-knip.ts"));
  await cp(join(PRESET, "zod.ts"), join(cwd, "zod.ts"));
  await cp(join(PRESET, "knip.jsonc"), join(cwd, "knip.jsonc"));
  await symlink(join(ROOT, "node_modules"), join(cwd, "node_modules"));
  await writeFile(
    join(cwd, "package.json"),
    JSON.stringify({
      name: name,
      private: true,
      dependencies: clean ? {} : { "unused-dependency": "1.0.0" },
      devDependencies: {
        knip: "6.42.1",
        oxfmt: "0.67.0",
        oxlint: "1.82.0",
        "oxlint-plugin-eslint": "1.82.0",
        "oxlint-tsgolint": "7.0.2003",
      },
    }),
  );
  await writeFile(
    join(cwd, "knip.jsonc"),
    `{
      "$schema": "https://unpkg.com/knip@6.42.1/schema-jsonc.json",
      "ignoreExportsUsedInFile": true,
      "workspaces": { ".": {
        "entry": ["tests/**/*.test.ts"],
        "project": ["src/**/*.ts", "tests/**/*.test.ts"],
        "ignoreDependencies": ["knip", "oxfmt", "oxlint", "oxlint-plugin-eslint", "oxlint-tsgolint"]
      }}
    }`,
  );
  await writeFile(
    join(cwd, "tests/clean.test.ts"),
    `import { used } from "../src/main.ts";\nvoid used;\n`,
  );
  await writeFile(
    join(cwd, "src/main.ts"),
    clean
      ? "export const used = 1;\n"
      : "export const used = 1;\nexport const unusedExport = 2;\n",
  );
  if (!clean)
    await writeFile(join(cwd, "src/orphan.ts"), "export const orphan = 1;\n");
  return cwd;
}

async function run(
  cwd: string,
): Promise<{ exit: number; stdout: string; stderr: string }> {
  const child = Bun.spawn(["bun", "lint-knip.ts"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exit, stdout, stderr };
}

test("knip reports an unused export, file, and dependency", async () => {
  const cwd = await fixture("findings", false);
  const result = await run(cwd);
  expect(result.exit).toBe(1);
  expect(result.stdout).toContain("exports: unusedExport");
  expect(result.stdout).toContain("files: src/orphan.ts");
  expect(result.stdout).toContain("dependencies: unused-dependency");
  expect(result.stdout).toContain("checked 3 project file(s)");
});

test("knip clean fixture exits zero with a positive checked-file count", async () => {
  const cwd = await fixture("clean", true);
  const result = await run(cwd);
  expect(result.exit).toBe(0);
  expect(result.stdout).toContain("no findings");
  expect(result.stdout).toContain("checked 2 project file(s)");
});

test("TypeScript preset type-aware lint works without knip installed", async () => {
  const cwd = join(SCRATCH, "typescript-without-knip");
  await cp(PRESET, cwd, { recursive: true });
  const packageFile = join(cwd, "package.json");
  const packageJson = jsonOf(
    z.looseObject({
      devDependencies: z.record(z.string(), z.string()),
    }),
  ).safeParse(await readFile(packageFile, "utf8"));
  expect(packageJson.success).toBe(true);
  if (!packageJson.success) return;
  const { knip: _knip, ...devDependencies } = packageJson.data.devDependencies;
  expect(_knip).toBe("6.42.1");
  await writeFile(
    packageFile,
    JSON.stringify({ ...packageJson.data, devDependencies }),
  );
  await writeFile(
    join(cwd, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ESNext",
        lib: ["ESNext"],
        module: "ESNext",
        moduleResolution: "bundler",
        types: ["bun"],
        noEmit: true,
        allowImportingTsExtensions: true,
        strict: true,
      },
      include: ["src/**/*.ts"],
      exclude: ["node_modules"],
    }),
  );
  await mkdir(join(cwd, "src"));
  await writeFile(
    join(cwd, "src/in-scope.ts"),
    "export const included = true;\n",
  );
  const fixtureModules = join(cwd, "node_modules");
  await mkdir(fixtureModules);
  const rootModules = join(ROOT, "node_modules");
  for (const entry of await readdir(rootModules)) {
    if (entry === "knip" || entry === ".bin") continue;
    await symlink(join(rootModules, entry), join(fixtureModules, entry));
  }
  const fixtureBins = join(fixtureModules, ".bin");
  await mkdir(fixtureBins);
  for (const entry of await readdir(join(rootModules, ".bin"))) {
    if (entry === "knip") continue;
    await symlink(join(rootModules, ".bin", entry), join(fixtureBins, entry));
  }
  expect(await Bun.file(join(fixtureModules, "knip")).exists()).toBe(false);
  const files: string[] = [];
  for await (const file of new Bun.Glob("**/*.ts").scan({
    cwd,
    onlyFiles: true,
  }))
    files.push(join(cwd, file));
  const child = Bun.spawn(
    [
      process.execPath,
      "x",
      "--no-install",
      "--bun",
      "oxlint",
      "--type-aware",
      ...files,
    ],
    { cwd, stdout: "pipe", stderr: "pipe", timeout: 60_000 },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, `${stderr}\n${stdout}`).toBe(0);
});

test("empty or malformed knip output fails closed with exit 2", async () => {
  const cwd = await fixture("malformed", true);
  expect(await handleKnipResult("", "", 0, cwd)).toBe(2);
  expect(await handleKnipResult("not json", "", 0, cwd)).toBe(2);
});

test("applying the TypeScript preset creates knip.jsonc and pins Knip", async () => {
  const target = join(SCRATCH, "apply-target");
  await mkdir(target);
  const child = Bun.spawn(
    ["mise", "run", "preset", "--", "apply", "typescript", "--to", target],
    { cwd: ROOT, stdout: "pipe", stderr: "pipe", timeout: 60_000 },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, `${stderr}\n${stdout}`).toBe(0);
  expect(await Bun.file(join(target, "knip.jsonc")).exists()).toBe(true);
  const packageJson = jsonOf(
    z.looseObject({ devDependencies: z.record(z.string(), z.string()) }),
  ).safeParse(await readFile(join(target, "package.json"), "utf8"));
  expect(packageJson.success).toBe(true);
  if (packageJson.success)
    expect(packageJson.data.devDependencies.knip).toBe("6.42.1");
});
