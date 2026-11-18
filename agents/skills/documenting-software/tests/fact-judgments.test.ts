// Proves fact-judgments.ts gates check F: a complete record passes; a missing quote, an unjudged
// row, an owner conflict, a forged quote and a path outside the doc set each fail; --closed fails
// while a mismatch remains. The fixtures judge the fact-scan fixture's scan table. Run from the
// repository root:  bun test agents/skills/documenting-software

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DIR = import.meta.dir;
const SCAN = join(DIR, "..", "scripts", "fact-scan.ts");
const JUDGE = join(DIR, "..", "scripts", "fact-judgments.ts");
const SCAN_FIXTURE = join(DIR, "fact-scan-fixture");
const DOCS = join(SCAN_FIXTURE, "docs");
const GLOSSARY = join(SCAN_FIXTURE, "glossary.md");
const JUDGMENTS = join(DIR, "fact-judgments-fixture");

async function bun(args: string[]) {
  const proc = Bun.spawn(["bun", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { stdout, stderr, exitCode: await proc.exited };
}

let work = "";
let scanFile = "";

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "fact-judgments-"));
  scanFile = join(work, "scan.md");
  const scan = await bun([SCAN, DOCS, "--glossary", GLOSSARY]);
  expect(scan.exitCode).toBe(0);
  await writeFile(scanFile, scan.stdout);
});

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

// A checkpoint judgment row for guide.md:3; `context` is the text after its quote-of-location cell.
const checkpointRow = (context: string) =>
  `| checkpoint | checkpoint definition | same | glossary:glossary.md:5 | guide.md:3 | mismatch | A saved state that a restart resumes from. | A checkpoint is a saved position in the log. |${context}`;

const judge = (files: string[], extra: string[] = []) =>
  bun([
    JUDGE,
    "--scan",
    scanFile,
    "--docs",
    DOCS,
    "--glossary",
    GLOSSARY,
    ...extra,
    ...files,
  ]);

const fixture = (name: string) => join(JUDGMENTS, `${name}.md`);

test("complete: every scan row judged with verified quotes, exit 0", async () => {
  const { stdout, exitCode } = await judge([fixture("complete")]);
  expect(exitCode).toBe(0);
  expect(stdout).toContain("judged 6/6 scan rows; 11 judgment rows (1 hand)");
  expect(stdout).toContain("mismatch rows (6):");
  expect(stdout.trimEnd().endsWith("PASS")).toBe(true);
});

test("missing-quote: an empty quote leaves the row unjudged, exit 1", async () => {
  const { stdout, exitCode } = await judge([fixture("missing-quote")]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("judged 5/6 scan rows");
  expect(stdout).toContain("location quote missing");
  expect(stdout).toContain(
    "retry_timeout: no complete judgment for guide.md:4",
  );
});

test("unjudged: rows with no judgment are listed by term and location, exit 1", async () => {
  const { stdout, exitCode } = await judge([fixture("unjudged")]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("judged 3/6 scan rows");
  expect(stdout).toContain(
    "export_csv: no complete judgment for guide.md:5, overview.md:5",
  );
  expect(stdout).toContain("lease: no complete judgment for");
});

test("owner-conflict: one location and fact with two owners across files, exit 1", async () => {
  const { stdout, exitCode } = await judge([
    fixture("owner-conflict-a"),
    fixture("owner-conflict-b"),
  ]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("judged 6/6 scan rows");
  expect(stdout).toContain(
    'guide.md:4 fact "retry_timeout default": owners overview.md:4 vs guide.md:4',
  );
  // each file alone has no conflict
  expect((await judge([fixture("owner-conflict-a")])).exitCode).toBe(0);
});

test("a row judged by one location does not cover the other locations of the scan row", async () => {
  const text = await readFile(fixture("complete"), "utf8");
  const partial = text
    .split("\n")
    .filter((l) => !l.includes("overview.md:3 | mismatch"))
    .join("\n");
  const file = join(work, "partial.md");
  await writeFile(file, partial);
  const { stdout, exitCode } = await judge([file]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain(
    "checkpoint: no complete judgment for overview.md:3",
  );
});

test("a quote that does not occur at the cited line is invalid", async () => {
  const text = await readFile(fixture("complete"), "utf8");
  const forged = text.replace(
    "The `retry_timeout` is 60 s by default. |",
    "The `retry_timeout` is 45 s by default. |",
  );
  const file = join(work, "forged.md");
  await writeFile(file, forged);
  const { stdout, exitCode } = await judge([file]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("location quote does not occur at guide.md:4");
  expect(stdout).toContain("judged 5/6 scan rows");
});

test("an unknown verdict, a bad file:line, a short row and an unknown term are invalid", async () => {
  const head = (await readFile(fixture("complete"), "utf8"))
    .split("\n")
    .slice(0, 2)
    .join("\n");
  const rows = [
    "| lease | f | same | glossary:glossary.md:6 | overview.md:7 | looks-fine | A time-bounded right | a lock that never expires | overview.md:1-7 |",
    "| lease | f | same | glossary.md | overview.md:7 | match | A time-bounded right | a lock that never expires | overview.md:1-7 |",
    "| lease | f | same | glossary:glossary.md:6 | overview.md:7 | match |",
    "| nonesuch | f | same | overview.md:4 | guide.md:4 | match | 30 s by default | 60 s by default | guide.md:1-7 |",
  ];
  const file = join(work, "bad.md");
  await writeFile(file, `${head}\n${rows.join("\n")}\n`);
  const { stdout, exitCode } = await judge([file]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain(
    'verdict "looks-fine" is not match / mismatch / qualifier-omitted / to-T',
  );
  expect(stdout).toContain('owner "glossary.md" is not file:line');
  expect(stdout).toContain("expected 9 columns, found 6");
  expect(stdout).toContain('term "nonesuch": is not a row of the scan table');
});

test("the pre-scope seven-column shape is rejected, not read as a judgment", async () => {
  const head = (await readFile(fixture("complete"), "utf8"))
    .split("\n")
    .slice(0, 2)
    .join("\n");
  const row =
    "| lease | f | glossary:glossary.md:6 | overview.md:7 | mismatch | A time-bounded right | a lock that never expires |";
  const file = join(work, "seven.md");
  await writeFile(file, `${head}\n${row}\n`);
  const { stdout, exitCode } = await judge([file]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("expected 9 columns, found 7");
  expect(stdout).toContain("judged 0/6 scan rows");
});

test("scope: an empty scope is invalid, and a mismatch whose scope differs is invalid", async () => {
  const head = (await readFile(fixture("complete"), "utf8"))
    .split("\n")
    .slice(0, 2)
    .join("\n");
  const empty =
    "| lease | f |  | glossary:glossary.md:6 | overview.md:7 | match | A time-bounded right | a lock that never expires | overview.md:1-7 |";
  const differs =
    "| lease | f | differs: v1 / v2 | glossary:glossary.md:6 | overview.md:7 | mismatch | A time-bounded right | a lock that never expires | overview.md:1-7 |";
  const file = join(work, "scope.md");
  await writeFile(file, `${head}\n${empty}\n${differs}\n`);
  const { stdout, exitCode } = await judge([file]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("scope is empty");
  expect(stdout).toContain(
    'verdict mismatch with scope "differs: v1 / v2": scopes that differ are not a mismatch',
  );
  // the same statements with verdict match are not rejected for their scope (the file is partial,
  // so only the scope check is asserted here)
  const ok = join(work, "scope-ok.md");
  await writeFile(
    ok,
    `${head}\n${differs.replace("| mismatch |", "| match |")}\n`,
  );
  const accepted = await judge([ok]);
  expect(accepted.stdout).not.toContain("invalid judgment rows");
  expect(accepted.stdout).not.toContain("scopes that differ");
});

test("context: a row must open a range in its location's file that contains the location line and is readable", async () => {
  const head = (await readFile(fixture("complete"), "utf8"))
    .split("\n")
    .slice(0, 2)
    .join("\n");
  const rows = [
    checkpointRow(" |"), // an empty context cell
    checkpointRow(" overview.md:1-7 |"), // another file
    checkpointRow(" guide.md:4-7 |"), // does not contain line 3
    checkpointRow(" guide.md:7-3 |"), // inverted
    checkpointRow(" guide.md:1-99 |"), // unreadable end
    checkpointRow(" guide.md |"), // no line range
    checkpointRow(" guide.md:1-7 |"), // the only good row
  ];
  const file = join(work, "context.md");
  await writeFile(file, `${head}\n${rows.join("\n")}\n`);
  const { stdout, exitCode } = await judge([file]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("context missing");
  expect(stdout).toContain(
    "context file overview.md is not the location file guide.md",
  );
  expect(stdout).toContain(
    "context guide.md:4-7 does not contain location line 3",
  );
  expect(stdout).toContain(
    "context guide.md:7-3 is an empty or inverted range",
  );
  expect(stdout).toContain("context guide.md:1-99 cannot be read");
  expect(stdout).toContain('context "guide.md" is not file:start-end');
  // every row here is for the checkpoint scan row, which has two locations; the good row covers one of them
  // and the others are bad, so the scan row stays unjudged
  expect(stdout).toContain("judged 0/6 scan rows");
  expect(stdout).toContain(
    "checkpoint: no complete judgment for overview.md:3",
  );
});

test("context: a judgment row with the pre-context eight-column shape is rejected, not read as a judgment", async () => {
  const head = (await readFile(fixture("complete"), "utf8"))
    .split("\n")
    .slice(0, 2)
    .join("\n");
  const row =
    "| lease | f | same | glossary:glossary.md:6 | overview.md:7 | mismatch | A time-bounded right | a lock that never expires |";
  const file = join(work, "eight.md");
  await writeFile(file, `${head}\n${row}\n`);
  const { stdout, exitCode } = await judge([file]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("expected 9 columns, found 8");
  expect(stdout).toContain("judged 0/6 scan rows");
});

test("to-T: a sense difference is a complete judgment, counted and listed, and does not fail --closed", async () => {
  const text = await readFile(fixture("complete"), "utf8");
  const lease =
    "| lease | lease definition | same | glossary:glossary.md:6 | overview.md:7 | mismatch |";
  expect(text).toContain(lease);
  const file = join(work, "to-t.md");
  await writeFile(
    file,
    text
      .replace(lease, lease.replace("| mismatch |", "| to-T |"))
      .replaceAll("| mismatch |", "| match |"),
  );
  const closed = await judge([file], ["--closed"]);
  expect(closed.exitCode).toBe(0);
  expect(closed.stdout).toContain("judged 6/6 scan rows");
  expect(closed.stdout).toContain("to-T rows routed to T: 1");
  expect(closed.stdout).toContain(
    "to-T rows (sense differences, for check T) (1):",
  );
  expect(closed.stdout).toContain(
    "- lease @ overview.md:7 vs owner glossary:glossary.md:6",
  );
  expect(closed.stdout.trimEnd().endsWith("PASS")).toBe(true);
});

test("a cited file outside the doc set cannot be read, so its quote cannot verify", async () => {
  const head = (await readFile(fixture("complete"), "utf8"))
    .split("\n")
    .slice(0, 2)
    .join("\n");
  const row =
    "| (hand) | f | same | ../fact-scan.test.ts:1 | overview.md:7 | mismatch | Proves fact-scan.ts finds | a lock that never expires | overview.md:1-7 |";
  const file = join(work, "escape.md");
  await writeFile(file, `${head}\n${row}\n`);
  const { stdout, exitCode } = await judge([file]);
  expect(exitCode).toBe(1);
  expect(stdout).toContain("owner ../fact-scan.test.ts:1 cannot be read");
});

test("--closed fails while a mismatch remains and passes once every row matches", async () => {
  const open = await judge([fixture("complete")], ["--closed"]);
  expect(open.exitCode).toBe(1);

  const text = await readFile(fixture("complete"), "utf8");
  const file = join(work, "closed.md");
  await writeFile(file, text.replaceAll("| mismatch |", "| match |"));
  const closed = await judge([file], ["--closed"]);
  expect(closed.exitCode).toBe(0);
  expect(closed.stdout).not.toContain("mismatch rows");
});

test("usage and input errors exit 2", async () => {
  expect((await bun([JUDGE])).exitCode).toBe(2);
  expect(
    (await bun([JUDGE, "--scan", scanFile, "--docs", DOCS])).exitCode,
  ).toBe(2);
  const missing = await judge([join(work, "no-such.md")]);
  expect(missing.exitCode).toBe(2);
  expect(missing.stderr).toContain("fact-judgments:");
});

test("a sharded scan is validated against its own judgments", async () => {
  const shard = await bun([
    SCAN,
    DOCS,
    "--glossary",
    GLOSSARY,
    "--max-locations",
    "5",
    "--shard",
    "4",
  ]);
  const file = join(work, "shard3.md");
  await writeFile(file, shard.stdout);
  const ok = await bun([
    JUDGE,
    "--scan",
    file,
    "--docs",
    DOCS,
    "--glossary",
    GLOSSARY,
    fixture("complete"),
  ]);
  // complete.md judges terms outside this shard: they are not rows of the shard's scan table
  expect(ok.exitCode).toBe(1);
  expect(ok.stdout).toContain("judged 1/1 scan rows");
  expect(ok.stdout).toContain("is not a row of the scan table");
});
