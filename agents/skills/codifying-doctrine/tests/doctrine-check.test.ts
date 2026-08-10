// Proves the floor FIRES. A gate never seen red is decoration, and a green from it is theater.
// Run: bun test tests/doctrine-check.test.ts  (from the skill directory)

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "scripts", "doctrine-check.ts");
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "doctrine-check-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function run(name: string, body: string) {
  const file = join(dir, name);
  await writeFile(file, body, "utf8");
  const proc = Bun.spawn(["bun", SCRIPT, file], { stdout: "pipe", stderr: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  return { stdout, exitCode };
}

const HEADER = [
  "CUSTODIAN: platform lead. review-by: 2027-02-01.",
  "DEVIATION LOG: ops/deviations.md. ADVANCE NON-COMPLIANCE: skipping control 7.3, no enterprise customers.",
  "DIVERGENCE PROBE 2026-08-08: 6 dilemmas, 1 divergence.",
  "",
  "| # | Rule | Defeated value | Binding surface | Retirement trigger |",
  "|---|---|---|---|---|",
].join("\n");

const GOOD_ROW =
  "| 1 | ship weekly > zero regressions | release confidence | NUMBER-TRANSFERS-RIGHT: 2%/mo error budget | budget breached 3 months running |";

test("clean draft passes with exit 0", async () => {
  const { exitCode } = await run("good.md", `${HEADER}\n${GOOD_ROW}\n`);
  expect(exitCode).toBe(0);
});

test("a rule with no A > B trade form FAILS (D1)", async () => {
  const row = "| 1 | We value quality. | none | ADVISORY | never |";
  const { stdout, exitCode } = await run("no-trade.md", `${HEADER}\n${row}\n`);
  expect(exitCode).toBe(1);
  expect(stdout).toContain('no "A > B" trade form');
  expect(stdout).toContain('bare value "quality"');
});

test('a "both A and B" rule FAILS as trade-off erasure (D1)', async () => {
  const row = "| 1 | we prioritize both speed and safety | speed | ADVISORY | never |";
  const { stdout, exitCode } = await run("both.md", `${HEADER}\n${row}\n`);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("trade-off erasure");
});

test("an empty defeated-value cell FAILS (D1)", async () => {
  const row = "| 1 | speed > completeness |  | ADVISORY | never |";
  const { stdout, exitCode } = await run("no-defeated.md", `${HEADER}\n${row}\n`);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("no defeated value named");
});

test("an empty binding-surface cell FAILS (D5)", async () => {
  const row = "| 1 | speed > completeness | completeness |  | never |";
  const { stdout, exitCode } = await run("no-surface.md", `${HEADER}\n${row}\n`);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("no binding surface named");
});

test("a missing custodian, review date, and retirement trigger all FAIL (D2)", async () => {
  const body = [
    "| # | Rule | Defeated value | Binding surface |",
    "|---|---|---|---|",
    "| 1 | speed > completeness | completeness | ADVISORY |",
  ].join("\n");
  const { stdout, exitCode } = await run("bare.md", `${body}\n`);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("no CUSTODIAN named");
  expect(stdout).toContain("no review-by date");
  expect(stdout).toContain("no RETIREMENT TRIGGER");
});

test("a document with no rule table FAILS", async () => {
  const { stdout, exitCode } = await run("prose.md", "CUSTODIAN: x. review-by: 2027. RETIREMENT TRIGGER: y.\n\nWe believe in excellence.\n");
  expect(exitCode).toBe(1);
  expect(stdout).toContain("no rule table found");
});

test("more than seven rules WARNs but does not fail", async () => {
  const rows = Array.from({ length: 8 }, (_, i) =>
    `| ${i + 1} | speed${i} > completeness${i} | completeness${i} | ADVISORY | trigger${i} |`,
  ).join("\n");
  const { stdout, exitCode } = await run("many.md", `${HEADER}\n${rows}\n`);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("8 rules");
});

test("a missing divergence probe WARNs but does not fail", async () => {
  const header = HEADER.replace("DIVERGENCE PROBE 2026-08-08: 6 dilemmas, 1 divergence.", "");
  const { stdout, exitCode } = await run("no-probe.md", `${header}\n${GOOD_ROW}\n`);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("no DIVERGENCE PROBE recorded");
});
