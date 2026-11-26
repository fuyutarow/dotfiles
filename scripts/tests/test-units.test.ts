import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  changedPaths,
  defaultJobs,
  discover,
  failureText,
  ownedUnits,
  parseKnownRed,
  runAll,
  runUnit,
  selectUnits,
  summary,
  unitLine,
  unitsOf,
  verdictOf,
  type Outcome,
} from "#root/test-units.ts";

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

async function cliIn(dir: string, ...args: string[]) {
  const child = Bun.spawn([process.execPath, RUNNER, "--root", dir, ...args], {
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

const cli = (...args: string[]) => cliIn(root, ...args);

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

const UNITS = [
  "scripts/tests/land-verdict.test.ts",
  "scripts/tests/land.test.ts",
  "scripts/tests/landing.test.ts",
  "scripts/tests/lint-x.test.ts",
  "scripts/tests/group",
  "tools/demo/tests",
  "tools/other/tests",
  "tools/shared/tests",
];

test("ownedUnits: each kind of changed path selects the units that own it", () => {
  const owned = (...changed: string[]) => ownedUnits(changed, UNITS);
  expect(owned("tools/demo/src/a.ts")).toEqual(["tools/demo/tests"]);
  expect(owned("tools/demo/tests/x.test.ts")).toEqual(["tools/demo/tests"]);
  expect(owned("tools/demo/package.json")).toEqual(["tools/demo/tests"]);
  expect(owned("scripts/tests/land.test.ts")).toEqual([
    "scripts/tests/land.test.ts",
  ]);
  expect(owned("scripts/tests/group/deep/z.test.ts")).toEqual([
    "scripts/tests/group",
  ]);
  expect(owned("scripts/land.ts")).toEqual([
    "scripts/tests/land-verdict.test.ts",
    "scripts/tests/land.test.ts",
    "scripts/tests/landing.test.ts",
  ]);
  expect(owned("scripts/lint.ts")).toEqual(["scripts/tests/lint-x.test.ts"]);
  expect(owned("tools/shared/src/zod.ts")).toEqual(UNITS);
  expect(owned("tools/a.txt", "tools/shared")).toEqual([]);
  expect(owned("tools/demo/src/a.ts", "tools/other/src/b.ts")).toEqual([
    "tools/demo/tests",
    "tools/other/tests",
  ]);
});

test("ownedUnits: files owned by no unit select nothing", () => {
  for (const file of [
    "README.md",
    "scripts/lint/test-known-red.toml",
    "scripts/unrelated.ts",
    "scripts/notes.md",
    "scripts/sub/land.ts",
    "scripts/tests/helper.ts",
    "tools/nothing/src/a.ts",
    "config/zsh/aliases.zsh",
  ])
    expect({ file, units: ownedUnits([file], UNITS) }).toEqual({
      file,
      units: [],
    });
  expect(ownedUnits([], UNITS)).toEqual([]);
});

const entry = (path: string) =>
  `[[unit]]\npath = "${path}"\nsince = "2026-11-20"\nreason = "under diagnosis"\n`;

test("parseKnownRed reads entries and refuses a list that is not about units", () => {
  const units = ["scripts/tests/fail.test.ts", "tools/demo/tests"];
  expect(parseKnownRed("", units)).toEqual({ ok: true, known: [] });
  expect(parseKnownRed(entry("tools/demo/tests"), units)).toEqual({
    ok: true,
    known: [
      {
        path: "tools/demo/tests",
        since: "2026-11-20",
        reason: "under diagnosis",
      },
    ],
  });
  const refused = [
    entry("tools/nothing/tests"),
    entry("tools/demo/tests") + entry("tools/demo/tests"),
    entry("tools/demo/tests").replace("2026-11-20", "yesterday"),
    entry("tools/demo/tests").replace("under diagnosis", ""),
    `${entry("tools/demo/tests")}colour = "red"\n`,
    "[[unit]\n",
  ];
  for (const text of refused)
    expect({ text, ok: parseKnownRed(text, units).ok }).toEqual({
      text,
      ok: false,
    });
  const missing = parseKnownRed(entry("tools/nothing/tests"), units);
  expect(!missing.ok && missing.message).toContain("'tools/nothing/tests'");
});

test("a listed unit that fails is KNOWN-RED and passes the run; one that passes fails it", () => {
  const red = new Set(["u-red", "u-fixed"]);
  const fail = { ...outcome("u-red", 1.5, false), output: "boom\n" };
  const fixed = outcome("u-fixed", 2);
  const plain = outcome("u-plain", 3, false);
  expect(verdictOf(fail, red)).toBe("known-red");
  expect(verdictOf(fixed, red)).toBe("stale-red");
  expect(verdictOf(plain, red)).toBe("fail");
  expect(verdictOf(outcome("u-ok", 1), red)).toBe("pass");
  expect(verdictOf({ ...fail, status: "timeout", exit: null }, red)).toBe(
    "known-red",
  );
  expect(unitLine(fail, red)).toBe("KNOWN-RED 1.5s u-red");
  expect(failureText(fail, 1000, red)).toBe("");
  expect(unitLine(fixed, red)).toBe("FAIL 2.0s u-fixed");
  expect(failureText(fixed, 1000, red)).toBe(
    "  u-fixed: passes: remove it from scripts/lint/test-known-red.toml\n",
  );
  expect(summary([fail], 1, red)).toEqual({
    failed: 0,
    lines: [
      "slowest 1:",
      "  1.5s u-red",
      "1 units: 0 passed, 0 failed, 1 known-red; 1.0s wall, 1.5s summed",
    ],
  });
  expect(summary([fail, fixed, plain], 1, red).failed).toBe(2);
});

async function withKnownRed(toml: string, ...args: string[]) {
  const file = join(root, "scripts", "lint", "test-known-red.toml");
  await mkdir(join(root, "scripts", "lint"), { recursive: true });
  await Bun.write(file, toml);
  const run = await cli(...args);
  await rm(file);
  return run;
}

test("the command reports a known-red unit and exits 0, and --strict ignores the list", async () => {
  const list = entry("scripts/tests/fail.test.ts");
  const run = await withKnownRed(list, "scripts/tests/fail", "tools/demo");
  expect(run.exit).toBe(0);
  expect(run.stdout).toMatch(
    /KNOWN-RED \d+\.\ds scripts\/tests\/fail\.test\.ts/u,
  );
  expect(run.stdout).not.toContain("MARKER-from-failing-unit");
  expect(run.stdout).toContain("2 units: 1 passed, 0 failed, 1 known-red;");

  const strict = await withKnownRed(
    list,
    "--strict",
    "scripts/tests/fail",
    "tools/demo",
  );
  expect(strict.exit).toBe(1);
  expect(strict.stdout).toMatch(
    /FAIL \d+\.\ds scripts\/tests\/fail\.test\.ts/u,
  );
});

test("the command fails a known-red unit that passes, naming the line to remove", async () => {
  const run = await withKnownRed(
    entry("scripts/tests/pass.test.ts"),
    "scripts/tests/pass.test.ts",
  );
  expect(run.exit).toBe(1);
  expect(run.stdout).toMatch(/FAIL \d+\.\ds scripts\/tests\/pass\.test\.ts/u);
  expect(run.stdout).toContain(
    "passes: remove it from scripts/lint/test-known-red.toml",
  );
  expect(run.stdout).toContain("failed:\n  scripts/tests/pass.test.ts");
});

test("a known-red path that is not a unit is a usage error even when it is not selected", async () => {
  const run = await withKnownRed(
    entry("tools/nothing/tests"),
    "scripts/tests/pass.test.ts",
  );
  expect(run.exit).toBe(2);
  expect(run.stdout).not.toContain("PASS");
  expect(run.stderr).toContain("'tools/nothing/tests'");
});

test("--changed misuse is a usage error: --base alone, with selectors", async () => {
  for (const args of [
    ["--base", "alpha", "--list"],
    ["--changed", "scripts/tests/pass"],
  ]) {
    const run = await cli(...args);
    expect({ args, exit: run.exit }).toEqual({ args, exit: 2 });
    expect(run.stderr).toContain("test-units:");
  }
});

async function jj(dir: string, ...args: string[]) {
  const child = Bun.spawn(["jj", "--no-pager", ...args], {
    cwd: dir,
    env: { ...process.env, JJ_USER: "tester", JJ_EMAIL: "tester@example.com" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
    killSignal: "SIGKILL",
  });
  const [stderr, exit] = await Promise.all([
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect({ args, exit, stderr: exit === 0 ? "" : stderr }).toEqual({
    args,
    exit: 0,
    stderr: "",
  });
}

test("--changed reads `jj diff` against the base, working copy and rename sources included", async () => {
  const repo = await mkdtemp(join(tmpdir(), "test-units-jj-"));
  const files = {
    "scripts/tests/pass.test.ts": fixtures["scripts/tests/pass.test.ts"] ?? "",
    "scripts/tests/pass-two.test.ts":
      fixtures["scripts/tests/pass-two.test.ts"] ?? "",
    "tools/demo/tests/tz.test.ts": `${HEADER}test("ok", () => expect(1).toBe(1));\n`,
    "tools/demo/src/old.ts": "export const moved = 1;\n",
  };
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(repo, path, ".."), { recursive: true });
    await Bun.write(join(repo, path), body);
  }
  await jj(repo, "git", "init");
  await jj(repo, "bookmark", "create", "alpha", "-r", "@");
  await jj(repo, "new");
  await mkdir(join(repo, "docs"), { recursive: true });
  await Bun.write(
    join(repo, "docs/old.ts"),
    files["tools/demo/src/old.ts"] ?? "",
  );
  await rm(join(repo, "tools/demo/src/old.ts"));
  await Bun.write(join(repo, "scripts/pass.ts"), "export const x = 1;\n");
  await Bun.write(join(repo, "NOTES.md"), "unowned\n");

  expect(await changedPaths(repo, "alpha")).toEqual({
    ok: true,
    paths: [
      "NOTES.md",
      "docs/old.ts",
      "scripts/pass.ts",
      "tools/demo/src/old.ts",
    ],
  });
  const bad = await changedPaths(repo, "no-such-revision");
  expect(!bad.ok && bad.message).toContain("no-such-revision");
  const dashed = await changedPaths(repo, "--from");
  expect(dashed.ok).toBe(false);

  const listed = await cliIn(repo, "--changed", "--list");
  expect(listed.exit).toBe(0);
  expect(listed.stdout).toBe(
    "scripts/tests/pass-two.test.ts\nscripts/tests/pass.test.ts\ntools/demo/tests\n",
  );
  const ran = await cliIn(repo, "--changed", "--jobs", "2");
  expect(ran.exit).toBe(0);
  expect(ran.stdout).toContain(
    "--changed vs alpha selects:\n  scripts/tests/pass-two.test.ts\n",
  );
  expect(ran.stdout).toContain("3 units: 3 passed, 0 failed;");
  const none = await cliIn(repo, "--changed", "--base", "@");
  expect(none.exit).toBe(0);
  expect(none.stdout).toContain("no test unit owns the changed files");
  expect(none.stdout).not.toContain("PASS");
  await rm(repo, { recursive: true, force: true });
});
