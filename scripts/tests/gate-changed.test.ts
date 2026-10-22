import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { attempt } from "../../agents/hooks/attempt.ts";

const ROOT = resolve(import.meta.dir, "../..");
const SCRIPT = join(ROOT, "scripts/gate-changed.ts");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "gate-changed-test-"));
  await symlink(join(ROOT, "node_modules"), join(root, "node_modules"));
  await symlink(join(ROOT, "presets"), join(root, "presets"));
  for (const path of [".oxlintrc.json", ".oxfmtrc.json"])
    await Bun.write(join(root, path), Bun.file(join(ROOT, path)));
  await mkdir(join(root, "lint"));
  await Bun.write(join(root, "lint/no-sync-baseline.tsv"), "");
  await Bun.write(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ["bun"],
      },
      include: ["*.ts"],
    }),
  );
  return root;
}

async function run(root: string, files: string[]) {
  const expression = `import { gateChanged } from ${JSON.stringify(SCRIPT)}; process.exitCode = await gateChanged(${JSON.stringify(root)}, ${JSON.stringify(files)});`;
  const child = Bun.spawn(["bun", "--eval", expression], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

async function withFixture(check: (root: string) => Promise<void>) {
  const root = await fixture();
  const result = await attempt(() => check(root));
  await rm(root, { recursive: true, force: true });
  if (!result.ok) process.stderr.write(`${String(result.error)}\n`);
  expect(result.ok).toBe(true);
}

test(
  "clean changed TS passes all four checks, ignoring unchanged findings",
  () =>
    withFixture(async (root) => {
      await Bun.write(join(root, "clean file.ts"), "export const value = 1;\n");
      await Bun.write(
        join(root, "unchanged.ts"),
        `import { readFileSync } from "node:fs";
export function read() {return JSON.parse(readFileSync("input", "utf8"))}
`,
      );
      const result = await run(root, [
        "clean file.ts",
        "deleted.ts",
        "clean file.ts",
      ]);
      expect(result.exit, result.stdout + result.stderr).toBe(0);
      for (const name of ["format", "lint:ts", "lint:no-sync", "typecheck"])
        expect(result.stdout).toContain(`${name} ok`);
      expect(result.stdout).toContain("1 existing changed file(s), 1 TS");
    }),
  30_000,
);

test.each([
  ["JSON.parse", 'export const value = JSON.parse("{}");\n', "lint:ts FAIL"],
  ["cast", "export const value = 1 as number;\n", "lint:ts FAIL"],
  ["type error", 'export const value: number = "wrong";\n', "typecheck FAIL"],
  ["format", "export const value=1\n", "format FAIL"],
  [
    "sync",
    `import { readFileSync } from "node:fs";
export function read() {
  return readFileSync("input", "utf8");
}
`,
    "lint:no-sync FAIL",
  ],
])(
  "changed %s is refused and later checks still run",
  (_name, source, failure) =>
    withFixture(async (root) => {
      await Bun.write(join(root, "changed.ts"), source);
      const result = await run(root, ["changed.ts"]);
      expect(result.exit).toBe(1);
      expect(result.stdout).toContain(failure);
      expect(result.stdout).toContain("gate:changed: typecheck");
      expect(result.stdout + result.stderr).toContain("changed.ts");
    }),
  30_000,
);

test("empty/deleted change set exits quickly without invoking tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "gate-changed-empty-"));
  const started = performance.now();
  const empty = await run(root, []);
  const result = await run(root, ["deleted.ts"]);
  await rm(root, { recursive: true, force: true });
  expect(result.exit).toBe(0);
  expect(empty.exit).toBe(0);
  expect(empty.stdout).toBe(result.stdout);
  expect(result.stdout).toBe("gate:changed: no existing changed files; ok\n");
  expect(performance.now() - started).toBeLessThan(2000);
});

test(
  "non-TS changes only require project typecheck",
  () =>
    withFixture(async (root) => {
      await Bun.write(join(root, "note.md"), "changed\n");
      await Bun.write(join(root, "unchanged.ts"), "export const value=1\n");
      const result = await run(root, ["note.md"]);
      expect(result.exit, result.stdout + result.stderr).toBe(0);
      expect(result.stdout).toContain("typecheck ok");
      expect(result.stdout).not.toContain("lint:ts");
      expect(result.stdout).not.toContain("format");
    }),
  30_000,
);

test("invalid injected paths fail closed", async () => {
  const result = await run(ROOT, ["../outside.ts"]);
  expect(result.exit).toBe(2);
  expect(result.stderr).toContain("invalid repo-relative path");
});

test.each([
  { args: ["--help"], exit: 0 },
  { args: ["--unknown"], exit: 1 },
  { args: ["--__proto__"], exit: 2 },
  { args: ["unexpected"], exit: 2 },
])("CLI validates $args before scanning", async ({ args, exit }) => {
  const child = Bun.spawn(["bun", SCRIPT, ...args], {
    cwd: tmpdir(),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [stdout, stderr, status] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(status, stdout + stderr).toBe(exit);
  expect(stdout + stderr).not.toContain("jj diff");
});

test("jj discovers uncommitted workspace changes against trunk with NUL paths", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "gate-changed-jj-"));
  const root = join(temporary, "workspace");
  await mkdir(root);
  const env = { ...process.env, XDG_CONFIG_HOME: join(temporary, "config") };
  const initialized = Bun.spawn(["jj", "git", "init", root], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    initialized.stdout.text(),
    initialized.stderr.text(),
    initialized.exited,
  ]);
  expect(exit, stdout + stderr).toBe(0);
  await Bun.write(
    join(root, ".jj/repo/config.toml"),
    '[revset-aliases]\n"trunk()" = "root()"\n',
  );
  await Bun.write(join(root, "space file.ts"), "export const value = 1;\n");
  await Bun.write(join(root, "line\nbreak.ts"), "export const value = 2;\n");
  const expression = `import { changedFiles } from ${JSON.stringify(SCRIPT)};
const result = await changedFiles(${JSON.stringify(root)});
if (result.ok) process.stdout.write(result.value.join("\\0"));
else { process.stderr.write(String(result.error)); process.exitCode = 2; }`;
  const listing = Bun.spawn(["bun", "--eval", expression], {
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [paths, errors, status] = await Promise.all([
    listing.stdout.text(),
    listing.stderr.text(),
    listing.exited,
  ]);
  await rm(temporary, { recursive: true, force: true });
  expect(status, errors).toBe(0);
  expect(paths.split("\0").toSorted()).toEqual([
    "line\nbreak.ts",
    "space file.ts",
  ]);
}, 30_000);
