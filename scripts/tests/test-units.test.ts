import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultJobs,
  discover,
  failureText,
  runAll,
  runUnit,
  selectUnits,
  summary,
  unitLine,
  unitsOf,
  type Outcome,
} from "../test-units.ts";

const RUNNER = join(import.meta.dir, "..", "test-units.ts");
const HEADER = 'import { expect, test } from "bun:test";\n';

// A synthetic tree: every unit shape the runner discovers, with real `bun test` fixtures.
const fixtures: Record<string, string> = {
  "scripts/tests/pass.test.ts": `${HEADER}test("ok", () => expect(1).toBe(1));\n`,
  "scripts/tests/pass-two.test.ts": `${HEADER}test("ok", () => expect(2).toBe(2));\n`,
  "scripts/tests/fail.test.ts": `${HEADER}test("bad", () => expect("MARKER-from-failing-unit").toBe("other"));\n`,
  "scripts/tests/slow.test.ts": `${HEADER}test("sleeps", async () => { await Bun.sleep(30000); }, 60000);\n`,
  "scripts/tests/group/one.test.ts": `${HEADER}test("one", () => expect(1).toBe(1));\n`,
  "scripts/tests/group/two.test.ts": `${HEADER}test("two", () => expect(2).toBe(2));\n`,
  "scripts/tests/helper.ts": "export const unrelated = 1;\n",
  "tools/demo/tests/tz.test.ts": `${HEADER}test("utc", () => { expect(process.env["TZ"]).toBe("UTC"); expect(new Date(0).getTimezoneOffset()).toBe(0); });\n`,
  "tools/demo/tests/inner/deeper.test.ts": `${HEADER}test("deeper", () => expect(1).toBe(1));\n`,
  "tools/demo/tests/node_modules/dep/skipped.test.ts": `${HEADER}test("never", () => expect(1).toBe(2));\n`,
  "tools/demo/src/not-a-unit.test.ts": `${HEADER}test("never", () => expect(1).toBe(2));\n`,
};

let root = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "test-units-"));
  for (const [path, body] of Object.entries(fixtures)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await Bun.write(join(root, path), body);
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

test("unitsOf: one unit per scripts/tests file or sub-directory and per tool tests directory", () => {
  expect(
    unitsOf([
      "scripts/tests/b.test.ts",
      "scripts/tests/a.test.ts",
      "scripts/tests/a.test.ts",
      "scripts/tests/dir/x.test.ts",
      "scripts/tests/dir/y.test.ts",
      "scripts/tests/dir/deep/z.test.ts",
      "scripts/tests/helper.ts",
      "tools/t/tests/p.test.ts",
      "tools/t/tests/sub/q.test.ts",
      "tools/t/tests/node_modules/dep/r.test.ts",
      "tools/t/src/s.test.ts",
      "scripts/other/u.test.ts",
    ]),
  ).toEqual([
    "scripts/tests/a.test.ts",
    "scripts/tests/b.test.ts",
    "scripts/tests/dir",
    "tools/t/tests",
  ]);
});

test("discover finds units from the tree, never from a list", async () => {
  expect(await discover(root)).toEqual([
    "scripts/tests/fail.test.ts",
    "scripts/tests/group",
    "scripts/tests/pass-two.test.ts",
    "scripts/tests/pass.test.ts",
    "scripts/tests/slow.test.ts",
    "tools/demo/tests",
  ]);
});

test("selectUnits keeps units by path prefix and refuses a selector that matches nothing", () => {
  const units = [
    "scripts/tests/land-verdict.test.ts",
    "scripts/tests/land.test.ts",
    "scripts/tests/lint-x.test.ts",
    "tools/smart-copy/tests",
    "tools/smart-open/tests",
  ];
  expect(selectUnits(units, [])).toEqual({ ok: true, units });
  expect(selectUnits(units, ["scripts/tests/land"])).toEqual({
    ok: true,
    units: ["scripts/tests/land-verdict.test.ts", "scripts/tests/land.test.ts"],
  });
  expect(
    selectUnits(units, ["./tools/smart-copy/", "scripts/tests/lint"]),
  ).toEqual({
    ok: true,
    units: ["scripts/tests/lint-x.test.ts", "tools/smart-copy/tests"],
  });
  const missing = selectUnits(units, ["tools/smart-copy", "tools/nothing"]);
  expect(missing.ok).toBe(false);
  expect(!missing.ok && missing.message).toContain("'tools/nothing'");
});

test("defaultJobs is half the cores and never below two", () => {
  expect(defaultJobs(12)).toBe(6);
  expect(defaultJobs(3)).toBe(2);
  expect(defaultJobs(1)).toBe(2);
});

test("a passing unit passes, a failing unit fails with its output, TZ is UTC", async () => {
  const options = { root, timeoutMs: 60_000 };
  const pass = await runUnit("tools/demo/tests", options);
  expect([pass.status, pass.exit]).toEqual(["pass", 0]);
  expect(unitLine(pass)).toMatch(/^PASS \d+\.\ds tools\/demo\/tests$/u);

  const fail = await runUnit("scripts/tests/fail.test.ts", options);
  expect([fail.status, fail.exit]).toEqual(["fail", 1]);
  expect(unitLine(fail)).toMatch(
    /^FAIL \d+\.\ds scripts\/tests\/fail\.test\.ts$/u,
  );
  expect(failureText(fail, 60_000)).toContain("MARKER-from-failing-unit");
});

test("a unit over its time limit is killed and reported as a FAIL naming it", async () => {
  const started = performance.now();
  const slow = await runUnit("scripts/tests/slow.test.ts", {
    root,
    timeoutMs: 1500,
  });
  expect(slow.status).toBe("timeout");
  expect(slow.exit).toBeNull();
  expect(unitLine(slow)).toMatch(
    /^FAIL \d+\.\ds scripts\/tests\/slow\.test\.ts$/u,
  );
  expect(failureText(slow, 1500)).toContain(
    "scripts/tests/slow.test.ts: timed out after 1.5s and killed",
  );
  expect(performance.now() - started).toBeLessThan(15_000);
});

test("runAll runs at most `jobs` units at once, and does run them together", async () => {
  const probe = await mkdtemp(join(root, "probe-"));
  const names = ["a", "b", "c", "d"];
  const body = (name: string) =>
    `import { test } from "bun:test";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
test("probe", async () => {
  const active = join(${JSON.stringify(probe)}, "active");
  await mkdir(active, { recursive: true });
  await Bun.write(join(active, ${JSON.stringify(name)}), "");
  await Bun.sleep(700);
  await Bun.write(join(${JSON.stringify(probe)}, ${JSON.stringify(`seen-${name}`)}), String((await readdir(active)).length));
  await rm(join(active, ${JSON.stringify(name)}));
});
`;
  const units = names.map((name) => `scripts/tests/probe-${name}.test.ts`);
  for (const [index, name] of names.entries())
    await Bun.write(join(root, units[index] ?? ""), body(name));
  const done: string[] = [];
  const outcomes = await runAll(
    units,
    2,
    { root, timeoutMs: 60_000 },
    (outcome) => {
      done.push(outcome.unit);
    },
  );
  expect(outcomes.map((o) => o.status)).toEqual([
    "pass",
    "pass",
    "pass",
    "pass",
  ]);
  expect(done.toSorted()).toEqual(units);
  const seen = await Promise.all(
    names.map(async (name) =>
      Number(await readFile(join(probe, `seen-${name}`), "utf8")),
    ),
  );
  expect(Math.max(...seen)).toBe(2);
  expect(await readdir(join(probe, "active"))).toEqual([]);
  for (const unit of units) await rm(join(root, unit));
});

const outcome = (unit: string, seconds: number, ok = true): Outcome => ({
  unit,
  status: ok ? "pass" : "fail",
  exit: ok ? 0 : 1,
  seconds,
  output: "",
});

test("summary names the slowest five, the failures and the totals", () => {
  const result = summary(
    [1, 2, 3, 4, 5, 6].map((n) => outcome(`u${n}`, n, n !== 6)),
    7.5,
  );
  expect(result.failed).toBe(1);
  expect(result.lines).toEqual([
    "slowest 5:",
    "  6.0s u6",
    "  5.0s u5",
    "  4.0s u4",
    "  3.0s u3",
    "  2.0s u2",
    "failed:",
    "  u6",
    "6 units: 5 passed, 1 failed; 7.5s wall, 21.0s summed",
  ]);
});

async function cli(...args: string[]) {
  const child = Bun.spawn([process.execPath, RUNNER, "--root", root, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
    killSignal: "SIGKILL",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
}

test("the command exits 0 when the selected units pass and prints one line per unit", async () => {
  const run = await cli("--jobs", "2", "scripts/tests/pass", "tools/demo");
  expect(run.exit).toBe(0);
  const lines = run.stdout.split("\n");
  expect(lines.filter((line) => /^PASS \d+\.\ds /u.test(line)).length).toBe(3);
  expect(run.stdout).toContain("slowest 3:");
  expect(run.stdout).toContain("3 units: 3 passed, 0 failed;");
});

test("the command exits 1 when a unit fails and prints that unit's output", async () => {
  const run = await cli("scripts/tests/fail", "scripts/tests/pass.test.ts");
  expect(run.exit).toBe(1);
  expect(run.stdout).toContain("FAIL ");
  expect(run.stdout).toContain("scripts/tests/fail.test.ts");
  expect(run.stdout).toContain("MARKER-from-failing-unit");
  expect(run.stdout).toContain("failed:\n  scripts/tests/fail.test.ts");
});

test("the command exits 1 for a unit that exceeds --timeout, naming it", async () => {
  const run = await cli("--timeout", "1.5", "scripts/tests/slow");
  expect(run.exit).toBe(1);
  expect(run.stdout).toMatch(/FAIL \d+\.\ds scripts\/tests\/slow\.test\.ts/u);
  expect(run.stdout).toContain("timed out after 1.5s and killed");
});

test("--list prints the selected units without running them", async () => {
  const run = await cli("--list", "scripts/tests/group", "tools/demo");
  expect(run.exit).toBe(0);
  expect(run.stdout).toBe("scripts/tests/group\ntools/demo/tests\n");
});

test("usage errors exit 2: unmatched selector, bad --jobs, bad --timeout, unknown option", async () => {
  for (const args of [
    ["tools/nothing"],
    ["--jobs", "0", "scripts/tests/pass"],
    ["--jobs", "65", "scripts/tests/pass"],
    ["--jobs", "1.5", "scripts/tests/pass"],
    ["--timeout", "0", "scripts/tests/pass"],
    ["--definitely-unknown"],
    ["--__proto__"],
  ]) {
    const run = await cli(...args);
    expect({ args, exit: run.exit }).toEqual({ args, exit: 2 });
    expect(run.stdout).not.toContain("PASS");
    expect(run.stderr).toContain("test-units:");
  }
});

test("a root without any unit is a usage error, not a pass", async () => {
  const empty = await mkdtemp(join(root, "empty-"));
  const child = Bun.spawn([process.execPath, RUNNER, "--root", empty], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const exit = await child.exited;
  expect(exit).toBe(2);
});
