// Proves fact-scan.ts scans STATEMENTS grouped by subject: value, status (sentence and table cell),
// definition (glossary row, "X is a", "X は…です", "X とは", "X: …") and wrapped-sentence drift are
// found; a glossary headword alone makes no row; --terms lists headword occurrences separately;
// --max-locations packs groups by location count. Run from the repository root:
//   bun test agents/skills/documenting-software

import { expect, test } from "bun:test";
import { join } from "node:path";

const DIR = import.meta.dir;
const SCRIPT = join(DIR, "..", "scripts", "fact-scan.ts");
const FIXTURE = join(DIR, "fact-scan-fixture");
const DOCS = join(FIXTURE, "docs");
const GLOSSARY = ["--glossary", join(FIXTURE, "glossary.md")];
const STATEMENTS = join(FIXTURE, "statements");
const STATEMENTS_GLOSSARY = ["--glossary", join(STATEMENTS, "glossary.md")];

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

const rowFor = (stdout: string, subject: string) =>
  stdout.split("\n").find((line) => line.startsWith(`| ${subject} |`));

const subjects = (stdout: string) =>
  stdout
    .split("\n")
    .filter(
      (l) =>
        l.startsWith("| ") &&
        !l.startsWith("| Subject |") &&
        !l.startsWith("| Term |") &&
        !l.startsWith("| ---"),
    )
    .map((l) => l.split(" | ")[0]?.slice(2));

test("finds value, status and definition drift as statement groups with location counts", async () => {
  const { stdout, stderr, exitCode } = await run([DOCS, ...GLOSSARY]);
  expect(exitCode).toBe(0);
  expect(stderr).toContain("fact-scan: 6 groups, 16 locations");
  expect(stdout).toContain("| Subject | Kinds | Locations |");

  const timeout = rowFor(stdout, "retry_timeout");
  expect(timeout).toContain("| number | 2 |");
  expect(timeout).toContain(
    "overview.md:4 — The `retry_timeout` is 30 s by default.",
  );
  expect(timeout).toContain(
    "guide.md:4 — The `retry_timeout` is 60 s by default.",
  );

  const csv = rowFor(stdout, "export_csv");
  expect(csv).toContain("| status | 2 |");
  expect(csv).toContain(
    "overview.md:5 — `export_csv` is 未実装 in this release.",
  );
  expect(csv).toContain("guide.md:5 — `export_csv` is implemented since 1.2.");

  const checkpoint = rowFor(stdout, "checkpoint");
  expect(checkpoint).toContain("| definition, number | 3 |");
  expect(checkpoint).toContain("glossary:glossary.md:5");
  expect(checkpoint).toContain("overview.md:3");
  expect(checkpoint).toContain("guide.md:3");
  expect(rowFor(stdout, "lease")).toContain(
    "overview.md:7 — A lease is a lock that never expires.",
  );

  // numbers of one unit family meet in one group whatever their noun phrase
  const time = rowFor(stdout, "[unit:time]");
  expect(time).toContain("| number | 5 |");

  // the qualifier-only pair is two statements of one group; the scan does not judge it
  const gate = rowFor(stdout, "mise run check finishes");
  expect(gate).toContain("guide.md:6");
  expect(gate).toContain("overview.md:6");

  // a subject on one file is not a row, and neither is a bare status word
  expect(rowFor(stdout, "compaction")).toBeUndefined();
  expect(rowFor(stdout, "glossary")).toBeUndefined();
});

test("without a glossary, glossary-only subjects are not groups", async () => {
  const { stdout, exitCode } = await run([DOCS]);
  expect(exitCode).toBe(0);
  expect(rowFor(stdout, "lease")).toBeUndefined();
  expect(rowFor(stdout, "export_csv")).toBeDefined();
  expect(rowFor(stdout, "compaction")).toBeUndefined();
});

test("status table cells, table numbers, wrapped sentences, ja definitions and TOML lines are statements", async () => {
  const { stdout, exitCode } = await run([STATEMENTS, ...STATEMENTS_GLOSSARY]);
  expect(exitCode).toBe(0);

  // status table cell 未実装 vs 未確認, and 実装済み vs 未実装, under the row label
  expect(rowFor(stdout, "export_csv")).toContain("| status, number | 2 |");
  expect(rowFor(stdout, "export_csv")).toContain("spec.md:8");
  expect(rowFor(stdout, "export_csv")).toContain("guide.md:7");
  expect(rowFor(stdout, "audit_log")).toContain("spec.md:9");
  expect(rowFor(stdout, "audit_log")).toContain("guide.md:8");

  // a sentence wrapped over two lines is located at the line of its number
  const write = rowFor(stdout, "write completes");
  expect(write).toContain("spec.md:4 —");
  expect(write).toContain("guide.md:3 — A write completes within 500 ms.");

  // Japanese definitions (は…です / とは) join the glossary row of the same term
  const snapshot = rowFor(stdout, "snapshot");
  expect(snapshot).toContain("| definition | 3 |");
  expect(snapshot).toContain("spec.md:11");
  expect(snapshot).toContain("guide.md:10");
  expect(snapshot).toContain("glossary.md:6");

  // "X: …" definition shape and a TOML key = value line
  expect(rowFor(stdout, "retention")).toContain("| definition, number | 2 |");
  expect(rowFor(stdout, "retry_timeout")).toContain(
    'guide.md:14 — retry_timeout = "60s"',
  );
});

test("a glossary headword that only occurs as a word makes no row, and --terms lists it", async () => {
  const scan = await run([STATEMENTS, ...STATEMENTS_GLOSSARY]);
  // "ledger" is a row only through the statements that mention it, never the bare word
  const ledgerRow = rowFor(scan.stdout, "ledger");
  expect(ledgerRow).toContain("spec.md:4");
  expect(ledgerRow).not.toContain("guide.md:17");

  const terms = await run([STATEMENTS, ...STATEMENTS_GLOSSARY, "--terms"]);
  expect(terms.exitCode).toBe(0);
  expect(terms.stderr).toContain("fact-scan: 2 terms, 4 locations");
  expect(terms.stdout).toContain("| Term | Count | Occurrences");
  const ledger = rowFor(terms.stdout, "ledger");
  expect(ledger).toContain("| 2 |");
  expect(ledger).toContain("spec.md:3");
  expect(ledger).toContain("guide.md:17");
  // occurrences inside the glossary file itself are not listed
  expect(terms.stdout).not.toContain("glossary.md:5");
});

test("--terms needs --glossary and cannot be combined with --max-locations", async () => {
  const bare = await run([DOCS, "--terms"]);
  expect(bare.exitCode).toBe(2);
  expect(bare.stderr).toContain("--terms needs --glossary");
  const both = await run([
    DOCS,
    ...GLOSSARY,
    "--terms",
    "--max-locations",
    "5",
  ]);
  expect(both.exitCode).toBe(2);
});

test("a set with no shared subject prints the empty result and exits 0", async () => {
  const { stdout, exitCode } = await run([join(FIXTURE, "disjoint")]);
  expect(exitCode).toBe(0);
  expect(stdout).toBe("No statement subject appears in two or more files.\n");
});

test("unreadable or missing input exits 2", async () => {
  const missing = await run([join(FIXTURE, "no-such-dir")]);
  expect(missing.exitCode).toBe(2);
  expect(missing.stderr).toContain("fact-scan:");

  const badGlossary = await run([
    DOCS,
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

test("--max-locations packs contiguous groups by location count; each group lands once", async () => {
  const whole = await run([DOCS, ...GLOSSARY]);
  const plan = await run([DOCS, ...GLOSSARY, "--max-locations", "5"]);
  expect(plan.exitCode).toBe(0);
  expect(plan.stdout).toBe(whole.stdout);
  expect(plan.stderr).toContain("--max-locations 5: 4 shard(s)");
  expect(plan.stderr).toContain("shard 1/4: 1 groups, 5 locations");
  expect(plan.stderr).toContain("shard 2/4: 2 groups, 5 locations");
  expect(plan.stderr).toContain("shard 3/4: 2 groups, 4 locations");
  expect(plan.stderr).toContain("shard 4/4: 1 groups, 2 locations");

  const shards = await Promise.all(
    [1, 2, 3, 4].map((k) =>
      run([DOCS, ...GLOSSARY, "--max-locations", "5", "--shard", `${k}`]),
    ),
  );
  expect(shards.map((s) => s.exitCode)).toEqual([0, 0, 0, 0]);
  expect(shards.map((s) => subjects(s.stdout).length)).toEqual([1, 2, 2, 1]);
  expect(shards.flatMap((s) => subjects(s.stdout))).toEqual(
    subjects(whole.stdout),
  );
});

test("a group larger than --max-locations gets its own shard and is reported", async () => {
  const { stderr, exitCode } = await run([
    DOCS,
    ...GLOSSARY,
    "--max-locations",
    "2",
  ]);
  expect(exitCode).toBe(0);
  expect(stderr).toContain("shard 1/6: 1 groups, 5 locations");
  expect(stderr).toContain('single group "[unit:time]" exceeds the bound');
  expect(stderr).toContain('single group "checkpoint" exceeds the bound');
});

test("--shard needs --max-locations, an in-range integer; k/n is rejected", async () => {
  for (const args of [
    ["--shard", "1"],
    ["--max-locations", "0"],
    ["--max-locations", "x"],
    ["--max-locations", "5", "--shard", "5"],
    ["--max-locations", "5", "--shard", "0"],
    ["--shard", "1/3"],
  ]) {
    const { exitCode } = await run([DOCS, ...GLOSSARY, ...args]);
    expect(exitCode).toBe(2);
  }
});

test("an empty result has one empty shard", async () => {
  const { stdout, stderr, exitCode } = await run([
    join(FIXTURE, "disjoint"),
    "--max-locations",
    "5",
    "--shard",
    "1",
  ]);
  expect(exitCode).toBe(0);
  expect(stdout).toBe("No statement subject appears in two or more files.\n");
  expect(stderr).toContain("0 groups, 0 locations");
});

test("general grouping: unit family, glossary term and alias, status anchors, TOML names, no particle subjects", async () => {
  const dir = join(FIXTURE, "grouping");
  const { stdout, exitCode } = await run([
    dir,
    "--glossary",
    join(dir, "glossary.md"),
  ]);
  expect(exitCode).toBe(0);

  // 10 分 and 300000 ms meet in one time group; 16,348 and 16,384 bytes in one size group
  expect(rowFor(stdout, "[unit:time]")).toContain("limits.toml:3");
  expect(rowFor(stdout, "[unit:time]")).toContain("spec.md:3");
  expect(rowFor(stdout, "[unit:size]")).toContain("glossary.md:5");
  expect(rowFor(stdout, "[unit:size]")).toContain("spec.md:7");

  // a quantity statement about a glossary term meets the glossary row
  expect(rowFor(stdout, "ownercap")).toContain("glossary.md:6");
  expect(rowFor(stdout, "ownercap")).toContain("spec.md:9");

  // the alias in parentheses ties a sentence and a table row to the glossary entry
  const holder = rowFor(stdout, "保有者");
  expect(holder).toContain("glossary.md:7");
  expect(holder).toContain("spec.md:9");
  expect(holder).toContain("spec.md:16");

  // status cells meet by row label; a status sentence meets them by the names around it
  const mainnet = rowFor(stdout, "mainnet");
  expect(mainnet).toContain("spec.md:11");
  expect(mainnet).toContain("spec.md:15");
  expect(mainnet).toContain("status.md:5");
  expect(rowFor(stdout, "upgrade")).toContain("spec.md:11");
  expect(rowFor(stdout, "upgrade")).toContain("status.md:6");

  // a TOML status belongs to the table's name
  expect(rowFor(stdout, "upgrademigration")).toContain("limits.toml:7");

  // subjects carry no trailing particle
  expect(
    subjects(stdout).filter((t) => /[をがはのに]$/u.test(t ?? "")),
  ).toEqual([]);
});
