import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  chmodSync,
  lstatSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, access, mkdir, readdir, utimes } from "node:fs/promises";
import {
  RUN_DIR_ENV,
  RUN_PREFIX,
  createTestTmp,
  ownerPidOf,
  removeTree,
  sweepStaleRuns,
} from "../src/test-tmp.ts";

const MODULE = join(import.meta.dir, "../src/test-tmp.ts");
const BUN = process.execPath;
const importHome = process.env.HOME;
let previousHome: string | undefined;

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "test-tmp-"));
}

/** Run a script that imports the preload with `root` as the system temp directory. */
function runScript(
  root: string,
  body: string,
  extraEnv: Record<string, string> = {},
) {
  const file = join(root, "..", `script-${crypto.randomUUID()}.ts`);
  writeFileSync(file, `import ${JSON.stringify(MODULE)};\n${body}\n`);
  const env: Record<string, string | undefined> = {
    ...process.env,
    TMPDIR: root,
    ...extraEnv,
  };
  if (extraEnv[RUN_DIR_ENV] === undefined) delete env[RUN_DIR_ENV];
  return Bun.spawnSync([BUN, file], { env, timeout: 30_000 });
}

test("this test process runs with its own TMPDIR under a run parent", () => {
  const parent = process.env[RUN_DIR_ENV] ?? "";
  expect(parent).toContain(RUN_PREFIX);
  expect(tmpdir().startsWith(`${parent}/`)).toBe(true);
  expect(process.env.HOME).toContain("dotfiles-test-");
  expect(importHome?.startsWith(`${parent}/`)).toBe(true);
  expect(importHome).not.toBe(process.env.HOME);
  expect(process.env.CLAUDE_BASH_DURATIONS_DIR).toContain("dotfiles-test-");
  for (const key of [
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "XDG_STATE_HOME",
  ])
    expect(process.env[key]).toContain("dotfiles-test-");
});

test("a test may persist state only in its own home", async () => {
  previousHome = process.env.HOME;
  await writeFile(join(previousHome ?? "", "hidden-state"), "fixture");
});

test("the next test has a fresh home and child processes inherit its paths", async () => {
  expect(process.env.HOME).not.toBe(previousHome);
  expect(
    await access(join(process.env.HOME ?? "", "hidden-state")).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  const child = Bun.spawn(
    [
      BUN,
      "-e",
      "console.log(JSON.stringify([process.env.HOME, process.env.XDG_STATE_HOME, process.env.TMPDIR]))",
    ],
    { env: process.env, stdout: "pipe" },
  );
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(0);
  expect(output.trim()).toBe(
    JSON.stringify([
      process.env.HOME,
      process.env.XDG_STATE_HOME,
      process.env.TMPDIR,
    ]),
  );
});

test("a dir the test forgets to clean is not in the outer temp dir", () => {
  mkdtempSync(join(tmpdir(), "forgotten-"));
  expect(tmpdir()).not.toBe("/tmp");
});

test("ownerPidOf reads only run-parent names", () => {
  expect(ownerPidOf(`${RUN_PREFIX}123-abcDEF`)).toBe(123);
  expect(ownerPidOf("dotfiles-test-run-x-abc")).toBeUndefined();
  expect(ownerPidOf("claude-1000")).toBeUndefined();
});

test("normal exit removes the run parent", () => {
  const root = scratch();
  const result = runScript(
    root,
    `(await import('node:fs')).mkdirSync(process.env.TMPDIR + "/leftover");`,
  );
  expect(result.exitCode).toBe(0);
  expect(readdirSync(root)).toEqual([]);
});

test("normal exit repairs and removes a read-only directory under TMPDIR", () => {
  const root = scratch();
  const result = runScript(
    root,
    [
      `const fs = await import('node:fs');`,
      `const locked = process.env.TMPDIR + "/locked";`,
      `const nested = locked + "/nested";`,
      `fs.mkdirSync(nested, { recursive: true });`,
      `fs.writeFileSync(nested + "/leftover", "fixture");`,
      `fs.chmodSync(nested, 0o555);`,
      `fs.chmodSync(locked, 0o500);`,
      `fs.chmodSync(process.env.TMPDIR, 0o555);`,
    ].join("\n"),
  );
  expect(result.exitCode).toBe(0);
  expect(readdirSync(root)).toEqual([]);
});

test("process.exit with a nonzero code still removes the run parent", () => {
  const root = scratch();
  const result = runScript(
    root,
    `(await import('node:fs')).mkdirSync(process.env.TMPDIR + "/x");\nprocess.exit(3);`,
  );
  expect(result.exitCode).toBe(3);
  expect(readdirSync(root)).toEqual([]);
});

test("SIGTERM removes the run parent where the runtime delivers it", async () => {
  const root = scratch();
  const file = join(root, "..", `sig-${crypto.randomUUID()}.ts`);
  writeFileSync(
    file,
    `import ${JSON.stringify(MODULE)};\nconsole.log("ready");\nawait Bun.sleep(30000);\n`,
  );
  const child = Bun.spawn([BUN, file], {
    env: { ...process.env, TMPDIR: root, [RUN_DIR_ENV]: "" },
    stdout: "pipe",
  });
  const reader = child.stdout.getReader();
  await reader.read();
  expect(readdirSync(root).length).toBe(1);
  child.kill("SIGTERM");
  expect(await child.exited).toBe(143);
  expect(readdirSync(root)).toEqual([]);
});

test("a nested bun test removes its parent even when a fixture forgets to restore 0555", () => {
  const root = scratch();
  const spec = join(root, "..", `leaky-${crypto.randomUUID()}.test.ts`);
  writeFileSync(
    spec,
    [
      `import { test } from "bun:test";`,
      `import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";`,
      `import { tmpdir } from "node:os";`,
      `import { join } from "node:path";`,
      `test("leaks read-only fixture", () => { const dir = mkdtempSync(join(tmpdir(), "leak-")); writeFileSync(join(dir, "data"), "fixture"); chmodSync(dir, 0o555); });`,
    ].join("\n"),
  );
  const env: Record<string, string | undefined> = {
    ...process.env,
    TMPDIR: root,
  };
  delete env[RUN_DIR_ENV];
  const result = Bun.spawnSync([BUN, "test", "--preload", MODULE, spec], {
    env,
    timeout: 60_000,
  });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  expect(readdirSync(root)).toEqual([]);
});

test("temp cleanup does not follow directory symlinks", () => {
  const root = scratch();
  const outside = scratch();
  writeFileSync(join(outside, "keep"), "fixture");
  symlinkSync(outside, join(root, "link"));
  chmodSync(outside, 0o555);
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    chmodSync(outside, 0o700);
  });
  expect(removeTree(root)).toBe(true);
  expect(lstatSync(outside).mode & 0o777).toBe(0o555);
  expect(readdirSync(outside)).toEqual(["keep"]);
});

test("failed temp removal prints one warning naming the path", () => {
  const root = scratch();
  const result = runScript(
    root,
    [
      `const { removeTree } = await import(${JSON.stringify(MODULE)});`,
      `const fs = await import('node:fs');`,
      `const file = process.env.TMPDIR + "/file";`,
      `fs.writeFileSync(file, "fixture");`,
      `if (removeTree(file + "/child")) process.exitCode = 1;`,
    ].join("\n"),
  );
  expect(result.exitCode).toBe(0);
  const warnings = result.stderr.toString().trim().split("\n");
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatch(
    /^WARNING: could not remove test temp path .*\/file\/child$/u,
  );
  expect(readdirSync(root)).toEqual([]);
});

test("a process with an inherited run parent joins it and leaves it for the owner", () => {
  const root = scratch();
  const parent = join(root, `${RUN_PREFIX}${process.pid}-owner`);
  mkdirSync(parent);
  const result = runScript(
    root,
    `(await import('node:fs')).mkdirSync(process.env.TMPDIR + "/x");`,
    { [RUN_DIR_ENV]: parent },
  );
  expect(result.exitCode).toBe(0);
  expect(readdirSync(root)).toEqual([`${RUN_PREFIX}${process.pid}-owner`]);
  expect(readdirSync(parent)).toEqual([]);
});

test("a SIGKILLed run is removed by the next run, and only that", () => {
  const root = scratch();
  const bystander = join(root, "someone-elses-dir");
  mkdirSync(bystander);
  const killed = runScript(root, `process.kill(process.pid, "SIGKILL");`);
  expect(killed.signalCode).toBe("SIGKILL");
  expect(
    readdirSync(root).filter((n) => n.startsWith(RUN_PREFIX)),
  ).toHaveLength(1);

  const next = runScript(root, "");
  expect(next.exitCode).toBe(0);
  expect(readdirSync(root)).toEqual(["someone-elses-dir"]);
});

test("sweepStaleRuns keeps a live owner's parent and unrelated names", () => {
  const root = scratch();
  const live = `${RUN_PREFIX}${process.pid}-live`;
  mkdirSync(join(root, live));
  mkdirSync(join(root, "claude-1000"));
  mkdirSync(join(root, `${RUN_PREFIX}notapid-x`));
  const dead = Bun.spawnSync(["true"]);
  expect(dead.exitCode).toBe(0);
  const gone = `${RUN_PREFIX}2147483646-dead`;
  mkdirSync(join(root, gone));
  expect(sweepStaleRuns(root)).toEqual([gone]);
  expect(existsSync(join(root, live))).toBe(true);
  expect(readdirSync(root).toSorted()).toEqual(
    [live, "claude-1000", `${RUN_PREFIX}notapid-x`].toSorted(),
  );
});

test("a foreign PID namespace and legacy run cannot be swept by a local dead-PID probe", async () => {
  const root = scratch();
  const names = [
    "dotfiles-test-run-ns-foreign-2147483646-live",
    "dotfiles-test-run-2147483646-legacy",
  ];
  for (const name of names) await mkdir(join(root, name));
  expect(sweepStaleRuns(root)).toEqual([]);
  expect((await readdir(root)).toSorted()).toEqual(names.toSorted());
  const old =
    (Temporal.Now.instant().epochMilliseconds - 13 * 60 * 60 * 1000) / 1000;
  for (const name of names) await utimes(join(root, name), old, old);
  expect(sweepStaleRuns(root).toSorted()).toEqual(names.toSorted());
});

test("createTestTmp exports TMPDIR and the run parent into the given env", () => {
  const root = scratch();
  const env: Record<string, string | undefined> = {};
  const tmp = createTestTmp(env, root);
  expect(env.TMPDIR).toBe(tmp.dir);
  expect(env[RUN_DIR_ENV]).toBe(tmp.parent);
  expect(tmp.ownsParent).toBe(true);
  tmp.cleanup();
  expect(readdirSync(root)).toEqual([]);
});
