// Proves fact-scan.ts finds the three drift shapes on a fixture: value (retry_timeout 30 s vs 60 s),
// status (export_csv 未実装 vs available) and term definition (checkpoint, lease), and that it
// reports the qualifier-only link pair without judging it. Run from the repository root:
//   bun test agents/skills/documenting-software

import { expect, test } from "bun:test";
import { join } from "node:path";

const DIR = import.meta.dir;
const SCRIPT = join(DIR, "..", "scripts", "fact-scan.ts");
const FIXTURE = join(DIR, "fact-scan-fixture");

async function run(args: string[]) {
  const proc = Bun.spawn(["bun", SCRIPT, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { stdout, stderr, exitCode: await proc.exited };
}

const rowFor = (stdout: string, term: string) =>
  stdout.split("\n").find((line) => line.startsWith(`| ${term} |`));

test("finds value, status and definition drift across pages and a glossary", async () => {
  const { stdout, exitCode } = await run([
    join(FIXTURE, "docs"),
    "--glossary",
    join(FIXTURE, "glossary.md"),
  ]);
  expect(exitCode).toBe(0);

  // value drift: the same identifier with two different values
  const timeout = rowFor(stdout, "retry_timeout");
  expect(timeout).toContain("| code |");
  expect(timeout).toContain(
    "overview.md:4 — The `retry_timeout` is 30 s by default.",
  );
  expect(timeout).toContain(
    "guide.md:4 — The `retry_timeout` is 60 s by default.",
  );

  // status drift: unimplemented in one page, available in another
  const csv = rowFor(stdout, "export_csv");
  expect(csv).toContain(
    "overview.md:5 — `export_csv` is 未実装 in this release.",
  );
  expect(csv).toContain("guide.md:5 — `export_csv` is available since 1.2.");

  // term-definition drift: glossary headword defined differently on a page
  const checkpoint = rowFor(stdout, "checkpoint");
  expect(checkpoint).toContain("| glossary |");
  expect(checkpoint).toContain("glossary:glossary.md:5");
  expect(checkpoint).toContain("overview.md:3");
  expect(checkpoint).toContain("guide.md:3");
  const lease = rowFor(stdout, "lease");
  expect(lease).toContain(
    "overview.md:7 — A lease is a lock that never expires.",
  );

  // qualifier-only link pair is listed as an occurrence; the scan does not judge it
  const gate = rowFor(stdout, "mise run check");
  expect(gate).toContain("guide.md:6");
  expect(gate).toContain("overview.md:6");

  // a term on a single file is not a row; the glossary heading is not in any page
  expect(rowFor(stdout, "Glossary")).toBeUndefined();
  expect(rowFor(stdout, "compaction")).toBeUndefined();
});

test("without a glossary, shared code identifiers and single-page terms are handled", async () => {
  const { stdout, exitCode } = await run([join(FIXTURE, "docs")]);
  expect(exitCode).toBe(0);
  // no glossary: glossary-only terms are not scanned
  expect(rowFor(stdout, "checkpoint")).toBeUndefined();
  // shared code identifier still found
  expect(rowFor(stdout, "export_csv")).toBeDefined();
  // "30 s" and "planned" each occur on one page only, so neither is a row
  expect(rowFor(stdout, "30 s")).toBeUndefined();
  expect(rowFor(stdout, "planned")).toBeUndefined();
});

test("a set with no shared term prints the empty result and exits 0", async () => {
  const { stdout, exitCode } = await run([join(FIXTURE, "disjoint")]);
  expect(exitCode).toBe(0);
  expect(stdout).toBe("No term appears in two or more files.\n");
});

test("unreadable or missing input exits 2", async () => {
  const missing = await run([join(FIXTURE, "no-such-dir")]);
  expect(missing.exitCode).toBe(2);
  expect(missing.stderr).toContain("fact-scan:");

  const badGlossary = await run([
    join(FIXTURE, "docs"),
    "--glossary",
    join(FIXTURE, "no-such.md"),
  ]);
  expect(badGlossary.exitCode).toBe(2);

  const noArgs = await run([]);
  expect(noArgs.exitCode).toBe(2);
});

test("a directory with no Markdown or TOML files is an input error", async () => {
  const empty = await run([join(FIXTURE, "..", "..", "scripts")]);
  expect(empty.exitCode).toBe(2);
});

const terms = (stdout: string) =>
  stdout
    .split("\n")
    .filter(
      (l) =>
        l.startsWith("| ") &&
        !l.startsWith("| Term |") &&
        !l.startsWith("| ---"),
    )
    .map((l) => l.split(" | ")[0]?.slice(2));

test("--shard k/n splits the rows into contiguous groups and covers each row once", async () => {
  const docs = join(FIXTURE, "docs");
  const glossary = ["--glossary", join(FIXTURE, "glossary.md")];
  const whole = await run([docs, ...glossary]);
  expect(whole.stderr).toContain("fact-scan: 5 rows");

  const shards = await Promise.all(
    [1, 2, 3].map((k) => run([docs, ...glossary, "--shard", `${k}/3`])),
  );
  expect(shards.map((s) => s.exitCode)).toEqual([0, 0, 0]);
  expect(shards.map((s) => terms(s.stdout).length)).toEqual([1, 2, 2]);
  expect(shards.flatMap((s) => terms(s.stdout))).toEqual(terms(whole.stdout));
  expect(shards[1]?.stderr).toContain("shard 2/3: 2 of 5 rows (rows 2-3)");
  expect(shards[0]?.stdout).toContain("| Term | Kinds |");
});

test("--shard with more groups than rows prints the empty result for an empty group", async () => {
  const docs = join(FIXTURE, "disjoint");
  const { stdout, stderr, exitCode } = await run([docs, "--shard", "2/4"]);
  expect(exitCode).toBe(0);
  expect(stdout).toBe("No term appears in two or more files.\n");
  expect(stderr).toContain("0 of 0 rows");
});

test("--shard rejects a malformed or out-of-range group with exit 2", async () => {
  const docs = join(FIXTURE, "docs");
  for (const bad of ["0/3", "4/3", "1/0", "a/b", "2", "1/2/3"]) {
    const { exitCode, stderr } = await run([docs, "--shard", bad]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("--shard expects k/n");
  }
});
