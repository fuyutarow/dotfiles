// Regression pairs for fact-scan.ts on synthetic fixtures (tests/pair-fixture). Each test names one
// statement shape and asserts that the two locations of a pair land in ONE scan group. A pair that
// is not grouped fails. Run from the repository root:
//   bun test agents/skills/documenting-software

import { expect, test } from "bun:test";
import { join } from "node:path";

const DIR = import.meta.dir;
const SCRIPT = join(DIR, "..", "scripts", "fact-scan.ts");
const PAIRS = join(DIR, "pair-fixture");

async function scan(): Promise<string> {
  const proc = Bun.spawn(["bun", SCRIPT, PAIRS], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  expect(await proc.exited).toBe(0);
  return stdout;
}

// True when one group (table row) lists both locations as statements.
const shareGroup = (stdout: string, a: string, b: string): boolean =>
  stdout
    .split("\n")
    .some(
      (line) =>
        line.startsWith("| ") &&
        line.includes(`${a} — `) &&
        line.includes(`${b} — `),
    );

const out = await scan();

test("status table cell and a status sentence on the same subject share a group", () => {
  expect(shareGroup(out, "cell-status.md:3", "status-sentence.md:1")).toBe(
    true,
  );
});

test("a TOML string status and a sentence on the same subject share a group", () => {
  expect(shareGroup(out, "routes.toml:3", "notes.md:1")).toBe(true);
});

test("a bullet under a status heading and a status sentence share a group", () => {
  expect(shareGroup(out, "plan.md:3", "decided.md:1")).toBe(true);
});

test("a table row with a number in a non-subject cell and its prose counterpart share a group", () => {
  expect(shareGroup(out, "limits.md:3", "limit-prose.md:1")).toBe(true);
});

test("a number with a unit in two files shares a group", () => {
  expect(shareGroup(out, "intervals-a.md:1", "intervals-b.md:1")).toBe(true);
});

test("two status words on the same subject share a group", () => {
  expect(shareGroup(out, "export-a.md:1", "export-b.md:1")).toBe(true);
});

test("two definitions of one term share a group", () => {
  expect(shareGroup(out, "defs-a.md:1", "defs-b.md:1")).toBe(true);
});

test("a stated count that differs from the list after it is a count group", () => {
  const row = out.split("\n").find((l) => l.startsWith("| guide lists |"));
  expect(row).toContain("| count (stated 3, listed 2) |");
  expect(row).toContain("counts.md:1 — ");
  expect(row).toContain("counts.md:3 — ");
});

test("two definitions of one term written in Japanese share a group", () => {
  expect(shareGroup(out, "guarantee-a.md:1", "guarantee-b.md:1")).toBe(true);
});

test("statements about different subjects do not share a group", () => {
  expect(shareGroup(out, "intervals-a.md:1", "export-a.md:1")).toBe(false);
});
