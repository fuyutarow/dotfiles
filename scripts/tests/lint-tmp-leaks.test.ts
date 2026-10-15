import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  leakedBy,
  lintStatic,
  newEntries,
  probeProblems,
  staticFindings,
} from "../lint-tmp-leaks.ts";

const REPO = resolve(import.meta.dir, "../..");

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "lint-tmp-leaks-"));
}

test("newEntries lists only names absent before", () => {
  expect(newEntries(["a", "b"], ["a", "b", "c", "d"])).toEqual(["c", "d"]);
  expect(newEntries(["a"], [])).toEqual([]);
});

test("staticFindings flags literal temp bases that bypass the per-process TMPDIR", () => {
  // Assembled so this file's own source holds no literal temp-path write.
  const name = "tmp";
  const tmp = `/${name}`;
  const bad = [
    `mkdtempSync("${tmp}/coordinator-repo-")`,
    `mkdtempSync(join("/var${tmp}", "x-"))`,
    "await mkdtemp(`" + tmp + "/${name}-`)",
    `writeFileSync("/dev/${name === "tmp" ? "shm" : ""}/probe", "x")`,
    `mkdirSync('${tmp}/fixture', { recursive: true })`,
  ];
  for (const line of bad)
    expect(staticFindings("t.test.ts", line)).toHaveLength(1);
  expect(staticFindings("t.test.ts", bad.join("\n"))).toHaveLength(bad.length);
});

test("staticFindings leaves tmpdir() bases and /tmp fixture data alone", () => {
  const good = [
    `mkdtempSync(join(tmpdir(), "x-"))`,
    `const socket = "/tmp/elsewhere.sock";`,
    `expect(stderr).toContain("/tmp/claude-<uid>/ and $TMPDIR")`,
    `env: { GRAVEYARD: "/tmp/doctor-must-ignore-this-inherited-value" }`,
  ];
  for (const line of good)
    expect(staticFindings("t.test.ts", line)).toEqual([]);
});

test("lintStatic reports file:line for a test under tests/", () => {
  const root = scratch();
  const name = "tmp";
  mkdirSync(join(root, "scripts/tests"), { recursive: true });
  writeFileSync(
    join(root, "scripts/tests/bad.test.ts"),
    `import { mkdtempSync } from "node:fs";\nmkdtempSync("/${name}/bad-");\n`,
  );
  writeFileSync(
    join(root, "scripts/tests/good.test.ts"),
    `mkdtempSync(join(tmpdir(), "good-"));\n`,
  );
  const found = lintStatic(root);
  expect(found).toHaveLength(1);
  expect(found[0]).toContain("scripts/tests/bad.test.ts:2:");
});

test("the repository's own tests pass the static check", () => {
  expect(lintStatic(REPO)).toEqual([]);
});

test("leakedBy names an entry the run leaves and ignores one it removes", () => {
  const root = scratch();
  const leaked = leakedBy(root, () => {
    mkdirSync(join(root, "kept"));
    mkdirSync(join(root, "transient"));
    Bun.spawnSync(["rmdir", join(root, "transient")]);
  });
  expect(leaked).toEqual(["kept"]);
});

test("leakedBy ignores an entry that disappears within the settle window", () => {
  const root = scratch();
  const dir = join(root, "late");
  const leaked = leakedBy(root, () => {
    mkdirSync(dir);
    Bun.spawn(["sh", "-c", `sleep 0.3; rmdir '${dir}'`]);
  });
  expect(leaked).toEqual([]);
});

test("probeProblems fails when the probe command leaves an entry in the system temp dir", () => {
  const systemTmp = scratch();
  const leaker = `require("node:fs").mkdirSync(${JSON.stringify(join(systemTmp, "leaky-fixture"))})`;
  const problems = probeProblems(REPO, {
    command: ["bun", "-e", leaker],
    systemTmp,
    ambientTmp: scratch(),
  });
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("leaky-fixture");
});

test("probeProblems fails when the probe exits nonzero", () => {
  const problems = probeProblems(REPO, {
    command: ["bun", "-e", "process.exit(7)"],
    systemTmp: scratch(),
    ambientTmp: scratch(),
  });
  expect(problems).toHaveLength(1);
  expect(problems[0]).toContain("exited 7");
});

test("probeProblems passes for the real preload probe", () => {
  expect(
    probeProblems(REPO, { systemTmp: scratch(), ambientTmp: scratch() }),
  ).toEqual([]);
});
