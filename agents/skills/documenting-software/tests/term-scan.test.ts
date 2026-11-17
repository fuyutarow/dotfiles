// Proves term-scan.ts lists what check T's judgment needs: glossary body text grouped per (term, file) with its
// count and representative lines; label, title, heading and convention lines as units; variant clusters of
// names that normalize to one key or share a head word; the four defect kinds; the unit count and its breakdown
// on stderr; sharding; and exit codes. Run from the repository root:  bun test agents/skills/documenting-software

import { expect, test } from "bun:test";
import { join } from "node:path";

const DIR = import.meta.dir;
const SCRIPT = join(DIR, "..", "scripts", "term-scan.ts");
const FIXTURE = join(DIR, "term-scan-fixture");
const DOCS = join(FIXTURE, "docs");
const FULL = [
  DOCS,
  "--glossary",
  join(FIXTURE, "glossary.md"),
  "--labels",
  join(FIXTURE, "labels.ts"),
  "--convention",
  join(FIXTURE, "convention"),
];

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

// Row: | # | Term | Entry | Kind | Location | Count | Text |
const dataRows = (stdout: string) =>
  stdout
    .split("\n")
    .filter(
      (l) =>
        l.startsWith("| ") && !l.startsWith("| #") && !l.startsWith("| ---"),
    )
    .map((l) => l.replace(/^\| /u, "").replace(/ \|$/u, "").split(" | "));
const rowsFor = (stdout: string, term: string) =>
  dataRows(stdout).filter((c) => c[1] === term);
// Body rows locate by file; label, title, heading and convention rows by file:line.
const find = (stdout: string, term: string, kind: string, location: string) =>
  rowsFor(stdout, term).find((c) => c[3] === kind && c[4] === location);
const has = (stdout: string, term: string, kind: string, location: string) =>
  find(stdout, term, kind, location) !== undefined;
// A cluster row: its Term lists every variant, joined by " / ".
const clusterRow = (stdout: string, variant: string) =>
  dataRows(stdout).find(
    (c) => c[2] === "cluster" && (c[1] ?? "").split(" / ").includes(variant),
  );

test("groups glossary body uses per file with a count; keeps label, title and heading lines as units", async () => {
  const { stdout, stderr, exitCode } = await run(FULL);
  expect(exitCode).toBe(0);
  expect(stderr).toContain(
    "term-scan: 36 names, 19 judgment units (glossary body groups 5, label-linked body groups 1, label/title/heading rows 9, convention rows 2, variant clusters 2)",
  );
  expect(stdout.split("\n")[0]).toBe(
    "| # | Term | Entry | Kind | Location | Count | Text |",
  );

  const proof = find(stdout, "証明", "body", "proof.md");
  expect(proof?.[5]).toBe("2");
  expect(proof?.[6]).toContain("L2: 証明 は Grant の一種です。 / L3:");
  expect(find(stdout, "証拠", "title", "evidence.md:1")?.[5]).toBe("1");
  expect(find(stdout, "証拠", "heading", "evidence.md:3")?.[5]).toBe("1");
});

test("defect kind 1, two senses unqualified: 証拠 and 証明 keep every use with its page", async () => {
  const { stdout } = await run(FULL);
  expect(has(stdout, "証拠", "body", "index.md")).toBe(true);
  expect(has(stdout, "証拠", "title", "evidence.md:1")).toBe(true);
  expect(has(stdout, "証拠", "heading", "evidence.md:3")).toBe(true);
  expect(has(stdout, "証拠", "body", "evidence.md")).toBe(true);
  expect(has(stdout, "証明", "body", "proof.md")).toBe(true);
});

test("defect kind 2, two names for one referent: 鍵サーバー/鍵 server and Move core/move/core/CoralbaseCore form clusters", async () => {
  const { stdout } = await run(FULL);
  const keys = clusterRow(stdout, "鍵サーバー");
  expect(keys).toBeDefined();
  expect(keys?.[1]).toContain("鍵 server");
  expect(keys?.[1]).toContain("鍵サーバー");
  expect(keys?.[1]).toContain("server");
  expect(keys?.[6]).toContain("鍵 server (api.md×1, keys.md×1, package.md×1)");

  const core = clusterRow(stdout, "Move core");
  expect(core).toBeDefined();
  for (const variant of [
    "core",
    "CoralbaseCore",
    "coralbase_core",
    "move/core",
  ]) {
    expect(core?.[1]?.split(" / ")).toContain(variant);
  }
  // one cluster per referent: the Move core names are not split across two rows
  expect(clusterRow(stdout, "CoralbaseCore")).toEqual(core);
});

test("defect kind 3, clash with upstream or convention: body use and convention line are both listed", async () => {
  const { stdout } = await run(FULL);
  expect(has(stdout, "checkpoint", "body", "index.md")).toBe(true);
  expect(
    has(stdout, "checkpoint", "convention", "convention/upstream-sui.md:2"),
  ).toBe(true);
  expect(
    has(stdout, "core", "convention", "convention/development-alignment.md:2"),
  ).toBe(true);
});

test("defect kind 4, label contradicts content: the label row and its page's body row are both listed", async () => {
  const { stdout } = await run(FULL);
  expect(has(stdout, "サンドボックス", "label", "labels.ts:3")).toBe(true);
  expect(has(stdout, "サンドボックス", "body", "try.md")).toBe(true);
  expect(has(stdout, "checkpoint", "label", "labels.ts:4")).toBe(true);
  // URLs and paths in label config are not labels
  expect(stdout.includes("/contribute")).toBe(false);
  expect(stdout.includes("/try")).toBe(false);
});

test("non-glossary names get no body groups unless labelled; lone title words are not listed", async () => {
  const { stdout } = await run(FULL);
  // a labelled name's body group is the only body row a non-glossary name gets
  expect(rowsFor(stdout, "ページ")).toEqual([]);
  expect(rowsFor(stdout, "Grant")).toEqual([]);
  expect(rowsFor(stdout, "OnlyHere")).toEqual([]);
  // a title word that is no cluster member is not a naming conflict
  expect(rowsFor(stdout, "Overview")).toEqual([]);
  // the glossary headword keeps its glossary entry
  expect(rowsFor(stdout, "checkpoint").every((c) => c[2] === "glossary")).toBe(
    true,
  );
});

test("--max-units shards the judgment units; a shard keeps the global unit numbers", async () => {
  const plan = await run([...FULL, "--max-units", "10"]);
  expect(plan.exitCode).toBe(0);
  expect(plan.stderr).toContain("term-scan: --max-units 10: 2 shard(s)");
  expect(plan.stderr).toContain("term-scan: shard 2/2: 9 units");
  expect(dataRows(plan.stdout).length).toBe(19);

  const second = await run([...FULL, "--max-units", "10", "--shard", "2"]);
  expect(second.exitCode).toBe(0);
  const numbers = dataRows(second.stdout).map((c) => Number(c[0]));
  expect(numbers[0]).toBe(11);
  expect(numbers.length).toBe(9);

  const outside = await run([...FULL, "--max-units", "10", "--shard", "3"]);
  expect(outside.exitCode).toBe(2);
});

test("a single convention file is scanned when passed as a file rather than a directory", async () => {
  const { stdout, exitCode } = await run([
    DOCS,
    "--glossary",
    join(FIXTURE, "glossary.md"),
    "--convention",
    join(FIXTURE, "convention", "upstream-sui.md"),
  ]);
  expect(exitCode).toBe(0);
  expect(
    has(stdout, "checkpoint", "convention", "convention/upstream-sui.md:2"),
  ).toBe(true);
  expect(stdout.includes("development-alignment")).toBe(false);
});

test("usage and read failures exit 2 with a message; unknown flags exit 1", async () => {
  const none = await run([]);
  expect(none.exitCode).toBe(2);
  expect(none.stderr).toContain("doc directory is required");

  const missing = await run([join(FIXTURE, "no-such-dir")]);
  expect(missing.exitCode).toBe(2);
  expect(missing.stderr).toContain("term-scan:");

  const badLabels = await run([DOCS, "--labels", join(FIXTURE, "absent.ts")]);
  expect(badLabels.exitCode).toBe(2);

  const badShard = await run([...FULL, "--shard", "1"]);
  expect(badShard.exitCode).toBe(2);

  const unknown = await run([DOCS, "--bogus"]);
  expect(unknown.exitCode).toBe(1);
});
