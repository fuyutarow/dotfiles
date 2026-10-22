import { expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { attempt, errorMessage } from "../../agents/hooks/attempt.ts";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

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

async function run(root: string, files?: string[], env = process.env) {
  const expression = `import { gateChanged } from ${JSON.stringify(SCRIPT)}; process.exitCode = await gateChanged(${JSON.stringify(root)}, ${files === undefined ? "undefined" : JSON.stringify(files)});`;
  const child = Bun.spawn(["bun", "--eval", expression], {
    cwd: root,
    env,
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
  const configured = Bun.spawn(
    ["jj", "config", "set", "--repo", 'revset-aliases."trunk()"', "root()"],
    { cwd: root, env, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  const [configOut, configErr, configExit] = await Promise.all([
    configured.stdout.text(),
    configured.stderr.text(),
    configured.exited,
  ]);
  expect(configExit, configOut + configErr).toBe(0);
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

async function withRepository(
  check: (
    root: string,
    env: NodeJS.ProcessEnv,
    jj: (args: string[]) => Promise<string>,
  ) => Promise<void>,
) {
  await withFixture(async (root) => {
    const env = {
      ...process.env,
      JJ_CONFIG: "",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    };
    const jj = async (args: string[]) => {
      const child = Bun.spawn(
        [
          "jj",
          "--config",
          "user.name=Fixture",
          "--config",
          "user.email=fixture@example.invalid",
          ...args,
        ],
        { cwd: root, env, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
      );
      const [stdout, stderr, exit] = await Promise.all([
        child.stdout.text(),
        child.stderr.text(),
        child.exited,
      ]);
      expect(exit, stderr).toBe(0);
      return stdout.trim();
    };
    await jj(["git", "init", "--no-colocate", root]);
    await Bun.write(
      join(root, ".gitignore"),
      ".jj/\nnode_modules\npresets\nignored/\n*.ignored.ts\n",
    );
    await Bun.write(join(root, "tracked.ts"), "export const value = 1;\n");
    await Bun.write(join(root, "deleted.ts"), "export const deleted = 1;\n");
    await jj(["new"]);
    // Initialize native secure config before denying writes. Writing the legacy
    // config file directly would require a config migration on the first read.
    await jj(["config", "set", "--repo", 'revset-aliases."trunk()"', "@-"]);
    await check(root, env, jj);
  });
}

async function discover(root: string, env: NodeJS.ProcessEnv) {
  const child = Bun.spawn(
    [
      "bun",
      "--eval",
      `
import { changedFiles } from ${JSON.stringify(SCRIPT)};
const result = await changedFiles(${JSON.stringify(root)});
if (!result.ok) throw new Error(String(result.error));
console.log(JSON.stringify(result.value.toSorted()));
`,
    ],
    { cwd: root, env, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  const [stdout, stderr, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(exit, stderr).toBe(0);
  const parsed = jsonOf(z.array(z.string())).safeParse(stdout);
  expect(parsed.success, stdout).toBe(true);
  return parsed.success ? parsed.data : [];
}

test(
  "live comparison includes tracked, added and deleted paths with exact ignore rules",
  () =>
    withRepository(async (root, env, jj) => {
      // A snapshotted addition that is now ignored must still be checked.
      await Bun.write(
        join(root, "snapshot.ts"),
        "export const snapshot = 1;\n",
      );
      await jj(["status"]);
      await Bun.write(
        join(root, ".gitignore"),
        ".jj/\nnode_modules\npresets\nignored/\n*.ignored.ts\nsnapshot.ts\n",
      );
      await Bun.write(join(root, "tracked.ts"), "export const value = 2;\n");
      await rm(join(root, "deleted.ts"));
      await Bun.write(join(root, "space file.ts"), "export const added = 1;\n");
      await Bun.write(
        join(root, "line\nbreak.ts"),
        "export const added = 1;\n",
      );
      await Bun.write(join(root, "bad.ignored.ts"), "ignored\n");
      await mkdir(join(root, "ignored"));
      await Bun.write(join(root, "ignored/bad.ts"), "ignored\n");
      await mkdir(join(root, "nested"));
      await Bun.write(join(root, "nested/.gitignore"), "*.ts\n!keep.ts\n");
      await Bun.write(join(root, "nested/skip.ts"), "ignored\n");
      await Bun.write(join(root, "nested/keep.ts"), "export const keep = 1;\n");
      // Ripgrep-specific ignore rules must not hide files from this gate.
      await Bun.write(join(root, ".ignore"), "visible.ts\n");
      await Bun.write(join(root, "visible.ts"), "export const visible = 1;\n");
      const gitDir = await jj([
        "--ignore-working-copy",
        "--at-operation=@",
        "git",
        "root",
      ]);
      await Bun.write(join(gitDir, "info/exclude"), "excluded.ts\n");
      await Bun.write(join(root, "excluded.ts"), "ignored\n");
      const expected = [
        ".gitignore",
        ".ignore",
        "deleted.ts",
        "line\nbreak.ts",
        "nested/.gitignore",
        "nested/keep.ts",
        "snapshot.ts",
        "space file.ts",
        "tracked.ts",
        "visible.ts",
      ].toSorted();
      expect(await discover(root, env)).toEqual(expected);
      // The ordinary writable-store behavior selects the same files after snapshot.
      await jj(["status"]);
      expect(await discover(root, env)).toEqual(expected);
    }),
  30_000,
);

test(
  "advanced trunk cannot hide a worker's committed TS lint error",
  () =>
    withRepository(async (root, env, jj) => {
      const log = [
        "--ignore-working-copy",
        "--at-operation=@",
        "log",
        "--no-graph",
        "-T",
        "commit_id",
      ];
      const base = await jj([...log, "-r", "@-"]);
      const badSource = "export const worker = 1 as number;\n";
      await Bun.write(join(root, "worker.ts"), badSource);
      await jj(["new"]);
      const worker = await jj([...log, "-r", "@-"]);
      await jj(["new", base]);
      // Trunk independently acquired identical content: diffing directly against
      // current trunk would hide worker.ts and count the unrelated trunk-only file.
      await Bun.write(join(root, "worker.ts"), badSource);
      await Bun.write(
        join(root, "trunk-only.ts"),
        "export const upstream = 1;\n",
      );
      await jj(["new"]);
      const trunk = await jj([...log, "-r", "@-"]);
      await jj(["new", worker]);
      await jj(["config", "set", "--repo", 'revset-aliases."trunk()"', trunk]);
      await Bun.write(join(root, "tracked.ts"), "export const value = 2;\n");
      expect(await discover(root, env)).toEqual(["tracked.ts", "worker.ts"]);
      const result = await run(root, undefined, env);
      expect(result.exit, result.stdout + result.stderr).toBe(1);
      expect(result.stdout).toContain("lint:ts FAIL");
      expect(result.stdout + result.stderr).toContain("worker.ts");
      expect(result.stdout).toContain("2 existing changed file(s), 2 TS");
    }),
  30_000,
);

test(
  "an unsnapshotted edit restoring fork contents is still selected",
  () =>
    withRepository(async (root, env, jj) => {
      await Bun.write(join(root, "tracked.ts"), "export const value = 2;\n");
      await jj(["status"]);
      await Bun.write(join(root, "tracked.ts"), "export const value = 1;\n");
      expect(await discover(root, env)).toEqual(["tracked.ts"]);
    }),
  30_000,
);

async function storeFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [path];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await storeFiles(child)));
    else files.push(child);
  }
  return files;
}

test(
  "unwritable jj store: empty passes quickly, clean edit passes, unsnapshotted lint error fails",
  () =>
    withRepository(async (root, env, jj) => {
      // A shared Git index must never escape the disposable index directory.
      const gitDir = await jj([
        "--ignore-working-copy",
        "--at-operation=@",
        "git",
        "root",
      ]);
      const config = join(gitDir, "config");
      await Bun.write(
        config,
        `${await Bun.file(config).text()}\n[core]\n\tsplitIndex = true\n`,
      );
      const paths = await storeFiles(join(root, ".jj/repo"));
      const original = await Promise.all(
        paths.map(async (path) => {
          const info = await stat(path);
          return {
            path,
            mode: info.mode,
            directory: info.isDirectory(),
            contents: info.isFile() ? await Bun.file(path).bytes() : undefined,
          };
        }),
      );
      const checked = await attempt(async () => {
        for (const entry of original)
          await chmod(entry.path, entry.directory ? 0o555 : 0o444);
        const start = performance.now();
        const empty = await run(root, undefined, env);
        expect(empty.exit, empty.stdout + empty.stderr).toBe(0);
        expect(empty.stdout).toContain("no existing changed files");
        expect(performance.now() - start).toBeLessThan(2000);
        await Bun.write(join(root, "tracked.ts"), "export const value = 2;\n");
        const clean = await run(root, undefined, env);
        expect(clean.exit, clean.stdout + clean.stderr).toBe(0);
        expect(clean.stdout).toContain("1 existing changed file(s), 1 TS");
        await Bun.write(
          join(root, "tracked.ts"),
          "export const value = 2 as number;\n",
        );
        const bad = await run(root, undefined, env);
        expect(bad.exit, bad.stdout + bad.stderr).toBe(1);
        expect(bad.stdout).toContain("lint:ts FAIL");
        expect(bad.stdout + bad.stderr).toContain("tracked.ts");
        expect((await storeFiles(join(root, ".jj/repo"))).toSorted()).toEqual(
          paths.toSorted(),
        );
        for (const entry of original) {
          if (entry.contents !== undefined)
            expect(await Bun.file(entry.path).bytes()).toEqual(entry.contents);
        }
      });
      for (const entry of original) await chmod(entry.path, entry.mode);
      expect(checked.ok, checked.ok ? "" : errorMessage(checked.error)).toBe(
        true,
      );
    }),
  30_000,
);
