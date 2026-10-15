import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newFailures, parseFailures } from "../src/data.ts";

setDefaultTimeout(60_000);
const entry = join(import.meta.dir, "../src/baseline.ts");
const scratch = mkdtempSync(join(tmpdir(), "baseline-test-"));
const home = join(scratch, "home");
const config = join(scratch, "jj.toml");
const env = { ...process.env, HOME: home, JJ_CONFIG: config, NO_COLOR: "1" };
let sequence = 0;

beforeAll(() => {
  mkdirSync(home);
  writeFileSync(
    config,
    '[user]\nname = "Baseline Fixture"\nemail = "baseline@example.com"\n[snapshot]\nauto-track = "all()"\n',
  );
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

async function run(
  cmd: string[],
  cwd = scratch,
  extra: Record<string, string> = {},
) {
  const child = Bun.spawn(cmd, {
    cwd,
    env: { ...env, ...extra },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [out, error, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, error, exit };
}
const baseline = (
  args: string[],
  cwd = scratch,
  extra: Record<string, string> = {},
) => run([process.execPath, entry, ...args], cwd, extra);
const jj = (args: string[], cwd: string) => run(["jj", ...args], cwd);

async function fixture(files: Record<string, string>) {
  const path = join(scratch, `repo-${++sequence}`);
  expect((await jj(["git", "init", path], scratch)).exit).toBe(0);
  for (const [name, contents] of Object.entries(files))
    writeFileSync(join(path, name), contents);
  const revision = await jj(
    ["log", "--no-graph", "-r", "@", "-T", "commit_id"],
    path,
  );
  expect(revision.exit).toBe(0);
  expect(
    (await jj(["file", "list", "-r", revision.out.trim()], path)).out,
  ).toContain(Object.keys(files).join("\n"));
  return { path, rev: revision.out.trim() };
}

const failures = `import {describe,test,expect} from 'bun:test';
describe('suite',()=>{
  test('zeta',()=>expect(1).toBe(2));
  test('alpha',()=>expect(1).toBe(2));
  test('middle',()=>expect(1).toBe(2));
});`;

const failureFile = (names: string[]) =>
  `import {test,expect} from 'bun:test';\n${names.map((name) => `test('${name}',()=>expect(0).toBe(1));`).join("\n")}`;

/** Each record probe gets a dedicated external temp root; empty means no leaked entry. */
async function recorded(
  path: string,
  args: string[],
  extra: Record<string, string> = {},
) {
  const temp = join(scratch, `tmp-${++sequence}`);
  mkdirSync(temp);
  const before = await jj(["workspace", "list", "-T", 'name ++ "\n"'], path);
  const result = await baseline(args, path, {
    ...extra,
    TMPDIR: temp,
    TMP: temp,
    TEMP: temp,
  });
  expect(readdirSync(temp)).toEqual([]);
  expect(
    (await jj(["workspace", "list", "-T", 'name ++ "\n"'], path)).out,
  ).toBe(before.out);
  return result;
}

test("three real Bun failures yield exactly three sorted data lines from the requested clean revision", async () => {
  const { path, rev } = await fixture({ "sample.test.ts": failures });
  // The caller's dirty checkout now passes; record must still use the captured failing revision.
  writeFileSync(
    join(path, "sample.test.ts"),
    "import {test} from 'bun:test'; test('clean',()=>{});",
  );
  writeFileSync(join(path, "dirty-only.txt"), "caller data");
  const result = await recorded(path, [
    "record",
    rev,
    "--",
    process.execPath,
    "test",
  ]);
  expect(result.exit, result.error).toBe(0);
  expect(result.out).toBe(
    "sample.test.ts\tsuite > alpha\nsample.test.ts\tsuite > middle\nsample.test.ts\tsuite > zeta\n",
  );
  expect(await Bun.file(join(path, "dirty-only.txt")).text()).toBe(
    "caller data",
  );
  expect(await Bun.file(join(path, "sample.test.ts")).text()).toContain(
    "clean",
  );
});

test("diff {a,b} and {b,c} emits only c, exits 1; equal sets exit 0", async () => {
  const base = join(scratch, "base.txt");
  const head = join(scratch, "head.txt");
  writeFileSync(base, "a\nb\n");
  writeFileSync(head, "b\nc\n");
  expect(await baseline(["diff", base, head])).toEqual({
    out: "c\n",
    error: "",
    exit: 1,
  });
  expect(await baseline(["diff", base, base])).toEqual({
    out: "",
    error: "",
    exit: 0,
  });
});

test("diff treats duplicates, unsorted inputs, CRLF and blank lines as sets", () => {
  expect(newFailures("a\r\nb\r\n", "z\nb\nc\nc\n\n")).toEqual(["c", "z"]);
  expect(newFailures("a\nb\n", "b\n")).toEqual([]);
  expect(newFailures("", "")).toEqual([]);
});

test("recorded base and head never report an existing failure as new", async () => {
  const { path, rev } = await fixture({
    "delta.test.ts": failureFile(["a", "b"]),
  });
  const base = await recorded(path, [
    "record",
    rev,
    "--",
    process.execPath,
    "test",
  ]);
  writeFileSync(join(path, "delta.test.ts"), failureFile(["b", "c"]));
  const headRev = await jj(
    ["log", "--no-graph", "-r", "@", "-T", "commit_id"],
    path,
  );
  const head = await recorded(path, [
    "record",
    headRev.out.trim(),
    "--",
    process.execPath,
    "test",
  ]);
  expect(base.exit, base.error).toBe(0);
  expect(head.exit, head.error).toBe(0);
  const basePath = join(scratch, "recorded-base.txt");
  const headPath = join(scratch, "recorded-head.txt");
  writeFileSync(basePath, base.out);
  writeFileSync(headPath, head.out);
  expect(await baseline(["diff", basePath, headPath])).toEqual({
    out: "delta.test.ts\tc\n",
    error: "",
    exit: 1,
  });
});

test("passing runs produce empty stdout and remove child temp files", async () => {
  const { path, rev } = await fixture({
    "pass.test.ts": `import {test} from 'bun:test'; import {writeFileSync} from 'node:fs'; import {join} from 'node:path'; import {tmpdir} from 'node:os'; test('pass',()=>writeFileSync(join(tmpdir(),'child-owned'),'data'));`,
  });
  const result = await recorded(path, [
    "record",
    rev,
    "--",
    process.execPath,
    "test",
    "--timeout",
    "2000",
  ]);
  expect(result.exit, result.error).toBe(0);
  expect(result.out).toBe("");
});

test("unsupported output, non-test failure and bad revision fail closed and clean up", async () => {
  const { path, rev } = await fixture({
    "pass.test.ts": "import {test} from 'bun:test';test('ok',()=>{});",
  });
  for (const args of [
    [],
    ["nonsense"],
    [
      "record",
      rev,
      "--",
      process.execPath,
      "-e",
      "console.log('not a test run')",
    ],
    ["record", rev, "--", process.execPath, "-e", "process.exit(7)"],
    ["record", "no_such_baseline_revision", "--", process.execPath, "test"],
  ]) {
    const result = await recorded(path, args);
    expect(result.exit).toBe(2);
    expect(result.out).toBe("");
    expect(result.error).toContain("FATAL:");
  }
});

test("an import error is not an empty successful baseline", async () => {
  const { path, rev } = await fixture({
    "error.test.ts": "import './missing-file.ts';",
  });
  const result = await recorded(path, [
    "record",
    rev,
    "--",
    process.execPath,
    "test",
  ]);
  expect(result.exit).toBe(2);
  expect(result.out).toBe("");
});

test("parser strips color and timings, deduplicates, keeps file and suite identity", () => {
  const output =
    "a.test.ts:\n\u001B[31m(fail) suite > same [1.25ms]\u001B[0m\n(fail) suite > same [2.00ms]\nb.test.ts:\n(fail) suite > same\n 3 fail\nRan 3 tests across 2 files. [4.00ms]\n";
  const parsed = parseFailures(output, "/repo");
  expect(parsed.isOk() && parsed.value).toEqual([
    "a.test.ts\tsuite > same",
    "b.test.ts\tsuite > same",
  ]);
  expect(
    parseFailures(output.replace("3 fail", "4 fail"), "/repo").isErr(),
  ).toBe(true);
  expect(
    parseFailures(output.replace("a.test.ts", "../a.test.ts"), "/repo").isErr(),
  ).toBe(true);
});

test("CLI help, missing separator, extra arguments, unknown flags and unreadable files", async () => {
  expect((await baseline(["--help"])).exit).toBe(0);
  expect((await baseline(["record", "--help"])).exit).toBe(0);
  expect((await baseline(["diff", "--help"])).exit).toBe(0);
  for (const args of [
    ["record", "alpha", "bun", "test"],
    ["record", "alpha", "--"],
    ["diff", "base", "head", "extra"],
    ["diff", "missing", "missing"],
    ["--unknown"],
    ["--__proto__"],
    ["record", "--__proto__"],
  ])
    expect((await baseline(args)).exit).not.toBe(0);
});

test("SIGTERM cancels the child and removes workspace and scratch before exit", async () => {
  const witness = join(scratch, "started");
  const { path, rev } = await fixture({
    "slow.test.ts": `import {test} from 'bun:test'; test('slow',async()=>{await Bun.write(process.env.BASELINE_WITNESS,'started'); await Bun.sleep(20000);});`,
  });
  const temp = join(scratch, `signal-tmp-${++sequence}`);
  mkdirSync(temp);
  const before = await jj(["workspace", "list"], path);
  const child = Bun.spawn(
    [
      process.execPath,
      entry,
      "record",
      rev,
      "--",
      process.execPath,
      "test",
      "--timeout",
      "30000",
    ],
    {
      cwd: path,
      env: { ...env, TMPDIR: temp, BASELINE_WITNESS: witness },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    },
  );
  const finished = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  for (let tries = 0; tries < 300 && !existsSync(witness); tries++)
    await Bun.sleep(10);
  const started = existsSync(witness);
  child.kill("SIGTERM");
  const [out, , exit] = await finished;
  expect(started).toBe(true);
  expect(exit).toBe(2);
  expect(out).toBe("");
  expect(readdirSync(temp)).toEqual([]);
  expect((await jj(["workspace", "list"], path)).out).toBe(before.out);
});
