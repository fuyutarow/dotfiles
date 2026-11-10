// Fixture tests for `rr about --path`'s adaptive KNN: a stub `ccc` that owns a known corpus
// (rows with exact distances), and a full-scan ORACLE computed from the same corpus.
// Proposition P1: against the oracle, (a) count, (b) non-decreasing distance, (c) every eligible
// row strictly closer than the worst returned, (d) no loss or duplicate outside the boundary tie
// group; short at k=4096 -> full scan inside the same deadline, else exit 124.

import { Database } from "bun:sqlite";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { escapeGlobLiteral } from "../src/ccc-search-path.ts";
import {
  adaptivePathSearch,
  parseKnnResponse,
  sqliteGlobMatches,
  startingK,
  type KnnRow,
  type PathSearchPlan,
  type RoundOutcome,
} from "../src/knn-path-search.ts";

setDefaultTimeout(60_000);

// score = 1 - d*d/2 (ccc's definition); distances are exact float32-ish decimals.
const scoreOf = (d: number): number => 1 - (d * d) / 2;
const distanceOf = (row: KnnRow): number => Math.sqrt(2 * (1 - row.score));

function makeRow(filePath: string, d: number, n = 0): KnnRow {
  return {
    filePath,
    language: "text",
    content: `chunk ${filePath} ${n}`,
    startLine: 1 + n,
    endLine: 1 + n,
    score: scoreOf(d),
  };
}

// The corpus the stub ccc "indexes": row i has distance (i+1)/10000 unless `distances` says so.
function corpus(paths: string[], distances?: (i: number) => number): KnnRow[] {
  return paths.map((p, i) => makeRow(p, distances?.(i) ?? (i + 1) / 10_000, i));
}

// The oracle: full scan of the corpus with the same GLOB, ordered by distance.
function oracle(
  rows: KnnRow[],
  pattern: string,
  offset: number,
  limit: number,
) {
  const db = new Database(":memory:");
  db.run("CREATE TABLE c (i INTEGER, p TEXT, s REAL)");
  for (const [i, r] of rows.entries())
    db.run("INSERT INTO c VALUES (?,?,?)", [i, r.filePath, r.score]);
  const found = z
    .array(z.object({ i: z.number() }))
    .safeParse(
      db.query("SELECT i FROM c WHERE p GLOB ? ORDER BY s DESC").all(pattern),
    );
  const eligible = (found.success ? found.data : []).flatMap(
    (f) => rows[f.i] ?? [],
  );
  return { eligible, page: eligible.slice(offset, offset + limit) };
}

interface Harness {
  plan: PathSearchPlan<string>;
  knnCalls: number[];
  fullScans: number;
  clock: { t: number };
}

// An in-process stub of ccc: path-less top-k of the corpus, and a full scan that returns the
// oracle page. `cost` is the simulated time each ccc call consumes on the fake clock.
function harness(
  rows: KnnRow[],
  pattern: string,
  offset: number,
  limit: number,
  options: { budgetMs?: number; knnCostMs?: number; scanCostMs?: number } = {},
): Harness {
  const clock = { t: 0 };
  const knnCalls: number[] = [];
  const h: Harness = {
    knnCalls,
    fullScans: 0,
    clock,
    plan: {
      pattern,
      limit,
      offset,
      now: () => clock.t,
      deadlineAt: options.budgetMs ?? 1_000_000,
      knn: (k, remaining): Promise<RoundOutcome<KnnRow[]>> => {
        knnCalls.push(k);
        // vec0 rejects k > 4096.
        if (k > 4096)
          return Promise.resolve({ kind: "error", message: "k too large" });
        clock.t += options.knnCostMs ?? 1;
        if (clock.t > (options.budgetMs ?? 1_000_000) || remaining <= 0)
          return Promise.resolve({ kind: "timeout" });
        return Promise.resolve({
          kind: "done",
          value: rows.toSorted((a, b) => b.score - a.score).slice(0, k),
        });
      },
      fullScan: (remaining): Promise<RoundOutcome<string>> => {
        h.fullScans += 1;
        clock.t += options.scanCostMs ?? 1;
        if (clock.t > (options.budgetMs ?? 1_000_000) || remaining <= 0)
          return Promise.resolve({ kind: "timeout" });
        return Promise.resolve({
          kind: "done",
          value: JSON.stringify(
            oracle(rows, pattern, offset, limit).page.map((r) => r.filePath),
          ),
        });
      },
    },
  };
  return h;
}

// Checks (a)-(d) of P1 for a returned page against the oracle.
function expectMatchesOracle(
  got: KnnRow[],
  rows: KnnRow[],
  pattern: string,
  offset: number,
  limit: number,
) {
  const { eligible, page } = oracle(rows, pattern, offset, limit);
  // (a) the requested count, or all that exist.
  expect(got.length).toBe(page.length);
  // (b) non-decreasing distance.
  const distances = got.map((r) => distanceOf(r));
  expect(distances).toEqual(distances.toSorted((x, y) => x - y));
  // Every returned row is eligible.
  for (const r of got)
    expect(sqliteGlobMatches(pattern, r.filePath)).toBe(true);
  // (d) no duplicate.
  expect(new Set(got.map((r) => r.content)).size).toBe(got.length);
  if (got.length === 0) return;
  const worst = got.reduce((m, r) => Math.max(m, distanceOf(r)), 0);
  const returned = new Set(got.map((r) => r.content));
  // (c) every eligible row strictly closer than the worst returned row is returned (this also
  // is (d)'s "no loss": only rows tied with the worst may be exchanged).
  for (const r of eligible) {
    if (offset === 0 && distanceOf(r) < worst - 1e-12)
      expect(returned.has(r.content)).toBe(true);
  }
  // Rows tied at the boundary are interchangeable: compare distance multisets of the page.
  expect(got.map((r) => r.score.toFixed(12))).toEqual(
    page.map((r) => r.score.toFixed(12)),
  );
}

const paths = (text: string): string[] => {
  const parsed = jsonOf(z.array(z.string())).safeParse(text);
  return parsed.success ? parsed.data : [];
};

const range = (n: number, make: (i: number) => string) =>
  Array.from({ length: n }, (_, i) => make(i));

describe("P1 against the full-scan oracle", () => {
  test("broad path: the first round answers, one KNN call", async () => {
    const rows = corpus(
      range(2000, (i) => (i % 2 === 0 ? `src/f${i}.ts` : `doc/f${i}.md`)),
    );
    const h = harness(rows, "src/**", 0, 8);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("rows");
    if (result.kind !== "rows") return;
    expectMatchesOracle(result.rows, rows, "src/**", 0, 8);
    expect(h.knnCalls).toEqual([startingK(8)]);
    expect(h.fullScans).toBe(0);
  });

  test("very narrow path: k doubles from the start each round, then it answers", async () => {
    // Only the five rows at global ranks 1501-1505 are under narrow/.
    const rows = corpus(
      range(3000, (i) =>
        i >= 1500 && i < 1505 ? `narrow/x${i}.ts` : `other/f${i}.ts`,
      ),
    );
    const h = harness(rows, "narrow/**", 0, 5);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("rows");
    if (result.kind !== "rows") return;
    expectMatchesOracle(result.rows, rows, "narrow/**", 0, 5);
    expect(result.rows).toHaveLength(5);
    // Doubling, each round a fresh global top-k from the start, ending at the first k >= 1505.
    expect(h.knnCalls).toEqual([256, 512, 1024, 2048]);
    expect(h.fullScans).toBe(0);
  });

  test("global top is entirely out of path: matches deeper in the ranking are found", async () => {
    // The 3000 closest rows are out of path; 20 in-path rows sit behind them.
    const rows = corpus(
      range(3020, (i) => (i < 3000 ? `other/f${i}.ts` : `want/f${i}.ts`)),
    );
    const h = harness(rows, "want/**", 10, 5);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("rows");
    if (result.kind !== "rows") return;
    expectMatchesOracle(result.rows, rows, "want/**", 10, 5);
    expect(result.rows).toHaveLength(5);
    expect(h.knnCalls.at(-1)).toBe(4096);
  });

  test("0 matches: falls back to the full scan at the cap; the answer is the oracle's, empty", async () => {
    const rows = corpus(range(5000, (i) => `other/f${i}.ts`));
    const h = harness(rows, "none/**", 0, 8);
    const result = await adaptivePathSearch(h.plan);
    // Short at k=4096 with 5000 rows indexed: the full scan decides; it is not "absence".
    expect(result.kind).toBe("full-scan");
    expect(h.knnCalls).toEqual([256, 512, 1024, 2048, 4096]);
    expect(h.fullScans).toBe(1);
  });

  test("fewer rows indexed than k: the short answer is complete, with no fallback", async () => {
    const rows = corpus(
      range(100, (i) => (i < 3 ? `want/f${i}.ts` : `other/f${i}.ts`)),
    );
    const h = harness(rows, "want/**", 0, 8);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("rows");
    if (result.kind !== "rows") return;
    expectMatchesOracle(result.rows, rows, "want/**", 0, 8);
    expect(result.rows).toHaveLength(3);
    expect(h.knnCalls).toEqual([256]);
    expect(h.fullScans).toBe(0);
  });

  test("fewer matches than limit, but beyond the first round: all that exist", async () => {
    const rows = corpus(
      range(3000, (i) =>
        i === 700 || i === 2900 ? `want/f${i}.ts` : `o/f${i}.ts`,
      ),
    );
    const h = harness(rows, "want/**", 0, 8);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("rows");
    if (result.kind !== "rows") return;
    expectMatchesOracle(result.rows, rows, "want/**", 0, 8);
    expect(result.rows).toHaveLength(2);
    expect(h.knnCalls).toEqual([256, 512, 1024, 2048, 4096]);
  });

  test("offset: the page is the oracle's page, and k covers offset + limit", async () => {
    const rows = corpus(range(2000, (i) => `src/f${i}.ts`));
    const h = harness(rows, "src/**", 30, 8);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("rows");
    if (result.kind !== "rows") return;
    expectMatchesOracle(result.rows, rows, "src/**", 30, 8);
    expect(h.knnCalls[0]).toBeGreaterThanOrEqual(38);
  });

  test("offset + limit above the cap is never clamped: it goes straight to the full scan", async () => {
    const rows = corpus(range(6000, (i) => `src/f${i}.ts`));
    const h = harness(rows, "src/**", 4090, 100);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("full-scan");
    expect(h.knnCalls).toEqual([]);
    expect(h.fullScans).toBe(1);
    // The scan is asked for the user's own limit and offset.
    expect(
      paths(result.kind === "full-scan" ? result.value : "[]"),
    ).toHaveLength(100);
  });

  test("a user limit above the cap is honoured by the full scan", async () => {
    const rows = corpus(range(6000, (i) => `src/f${i}.ts`));
    const h = harness(rows, "src/**", 0, 5000);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("full-scan");
    expect(
      paths(result.kind === "full-scan" ? result.value : "[]"),
    ).toHaveLength(5000);
  });

  test("all-equal distances straddling K: count and distances are right; which tied row is unspecified", async () => {
    // 600 rows all at distance 0.5; limit 8 -> any 8 of them, no more, no fewer.
    const rows = corpus(
      range(600, (i) => `src/f${i}.ts`),
      () => 0.5,
    );
    const h = harness(rows, "src/**", 0, 8);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("rows");
    if (result.kind !== "rows") return;
    expectMatchesOracle(result.rows, rows, "src/**", 0, 8);
    // Ties cause no extra fetch or fallback.
    expect(h.knnCalls).toEqual([256]);
    expect(h.fullScans).toBe(0);
  });

  test("a tie group straddling the in-path boundary: strictly closer rows are all present", async () => {
    // 3 rows at 0.1 in path, then 10 rows tied at 0.2 in path; limit 8 -> the 3 + 5 of the tied 10.
    const rows = [
      ...range(3, (i) => `src/near${i}.ts`).map((p, i) => makeRow(p, 0.1, i)),
      ...range(10, (i) => `src/tie${i}.ts`).map((p, i) =>
        makeRow(p, 0.2, 100 + i),
      ),
      ...range(400, (i) => `o/f${i}.ts`).map((p, i) =>
        makeRow(p, 0.3 + i / 10_000, 200 + i),
      ),
    ];
    const h = harness(rows, "src/**", 0, 8);
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("rows");
    if (result.kind !== "rows") return;
    expectMatchesOracle(result.rows, rows, "src/**", 0, 8);
    const names = result.rows.map((r) => r.filePath);
    for (let i = 0; i < 3; i += 1) expect(names).toContain(`src/near${i}.ts`);
  });

  test("special-character paths select what SQLite GLOB selects for the emitted pattern", async () => {
    const names = [
      "a[1]/x.md",
      "a1/decoy.md",
      "star*/x.md",
      "starred/decoy.md",
      "q?/x.md",
      "qa/decoy.md",
      "x]y/x.md",
      "x{y}/x.md",
      "[bracket]/x.md",
      "sp ace/x.md",
      "日本語/x.md",
      "a[/x.md",
      "plain.md",
    ];
    const rows = corpus(names);
    for (const dir of [
      "a[1]",
      "star*",
      "q?",
      "x]y",
      "x{y}",
      "[bracket]",
      "sp ace",
      "日本語",
      "a[",
    ]) {
      const pattern = `${escapeGlobLiteral(dir)}/**`;
      const h = harness(rows, pattern, 0, 8);
      const result = await adaptivePathSearch(h.plan);
      expect(result.kind).toBe("rows");
      if (result.kind !== "rows") return;
      expect(result.rows.map((r) => r.filePath)).toEqual(
        oracle(rows, pattern, 0, 8).page.map((r) => r.filePath),
      );
      expect(result.rows).toHaveLength(1);
    }
  });

  test("a result short at the cap is never reported as a success short of the full scan", async () => {
    const rows = corpus(
      range(4500, (i) => (i === 4400 ? "want/x.ts" : `o/f${i}.ts`)),
    );
    const h = harness(rows, "want/**", 0, 3);
    const result = await adaptivePathSearch(h.plan);
    // The match sits at rank 4401 > cap: only the full scan can find it.
    expect(result.kind).toBe("full-scan");
    expect(paths(result.kind === "full-scan" ? result.value : "[]")).toEqual([
      "want/x.ts",
    ]);
  });
});

describe("one total deadline across rounds and the fallback", () => {
  const rows = corpus(range(5000, (i) => `other/f${i}.ts`));

  test("rounds draw down the same budget; the remaining time is what each call is given", async () => {
    const seen: number[] = [];
    const h = harness(rows, "none/**", 0, 8, {
      knnCostMs: 100,
      scanCostMs: 100,
      budgetMs: 100_000,
    });
    const knn = h.plan.knn;
    h.plan.knn = (k, remaining) => {
      seen.push(remaining);
      return knn(k, remaining);
    };
    await adaptivePathSearch(h.plan);
    expect(seen).toEqual([100_000, 99_900, 99_800, 99_700, 99_600]);
  });

  test("running out of time between rounds is a timeout, not a short result", async () => {
    const h = harness(rows, "none/**", 0, 8, { knnCostMs: 100, budgetMs: 250 });
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("timeout");
    expect(h.fullScans).toBe(0);
  });

  test("the fallback inherits what the rounds left: no reset", async () => {
    const h = harness(rows, "none/**", 0, 8, {
      knnCostMs: 100,
      scanCostMs: 600,
      budgetMs: 1_000,
    });
    let remainingAtScan = -1;
    const scan = h.plan.fullScan;
    h.plan.fullScan = (remaining) => {
      remainingAtScan = remaining;
      return scan(remaining);
    };
    const result = await adaptivePathSearch(h.plan);
    // Five rounds at 100 ms leave 500 ms; the scan needs 600 -> timeout, not success.
    expect(remainingAtScan).toBe(500);
    expect(result.kind).toBe("timeout");
  });

  test("the deadline passing before the fallback starts is a timeout", async () => {
    const h = harness(rows, "none/**", 0, 8, {
      knnCostMs: 200,
      budgetMs: 1_000,
    });
    // Rounds end exactly at the deadline: nothing is left for the scan.
    const result = await adaptivePathSearch(h.plan);
    expect(result.kind).toBe("timeout");
    expect(h.fullScans).toBe(0);
  });
});

describe("the SQLite GLOB matcher equals SQLite", () => {
  const samples = [
    "AGENTS.md",
    "a1.txt",
    "a[1].txt",
    "a[1]/inside.md",
    "a[/inside.md",
    "q?/inside.md",
    "star*/inside.md",
    "starred/decoy.md",
    "x]y/inside.md",
    "x{y}/inside.md",
    "[bracket]/inside.md",
    "sp ace/inside.md",
    "日本語/inside.md",
    "Knowledge/a.md",
    "knowledge/a.md",
    "knowledge/b/c.md",
    "src/a.rs",
    "src/lib.rs",
    "src/日.rs",
    "^x",
    "-",
    "a-b",
    "]",
    "[",
    "",
  ];
  const patterns = [
    "**",
    "*",
    "?",
    "src/**",
    "src/*.rs",
    "src/?.rs",
    "knowledge/**",
    "KNOWLEDGE/**",
    "a[[]1]/**",
    "a[1]",
    "a[1].txt",
    "a[[]1].txt",
    "q[?]/**",
    "star[*]/**",
    "x]y/**",
    "x{y}/**",
    "[[]bracket]/**",
    "sp ace/**",
    "日本語/**",
    "?本語/*",
    "[a-c]*",
    "[^a-c]*",
    "[]]",
    "[]a]*",
    "[^]]",
    "[a-]",
    "[-a]",
    "[a-",
    "a[",
    "a[[]/**",
    "[",
    "[]",
    "[^",
    "*.md",
    "*/*/*.md",
    "a-b",
    "a[-]b",
    "[!a]*",
    "[*]",
    "[?]",
    "[a-c-e]",
    "[z-a]",
    "[日-本]*",
    "",
    "**/**",
    "*a*b*",
  ];
  const sqlite = new Database(":memory:");
  const glob = (pattern: string, text: string): boolean =>
    z
      .object({ m: z.number() })
      .safeParse(sqlite.query("SELECT ? GLOB ? AS m").get(text, pattern)).data
      ?.m === 1;

  test("every pattern x path agrees with SQLite's own GLOB", () => {
    const mismatches = patterns
      .flatMap((pattern) => samples.map((text) => ({ pattern, text })))
      .filter(
        ({ pattern, text }) =>
          sqliteGlobMatches(pattern, text) !== glob(pattern, text),
      );
    expect(mismatches).toEqual([]);
  });
});

describe("ccc --json decoding", () => {
  test("keeps the unrounded score; a failure or junk is an error, never an empty result", () => {
    const d = 0.7312345678901234;
    const score = scoreOf(d);
    const ok = parseKnnResponse(
      JSON.stringify({
        success: true,
        results: [
          {
            file_path: "a",
            language: "ts",
            content: "c",
            start_line: 1,
            end_line: 2,
            score,
          },
        ],
        total_returned: 1,
        offset: 0,
      }),
    );
    expect(ok.isOk() ? ok.value[0]?.score : undefined).toBe(score);
    expect(ok.isOk() ? ok.value[0]?.score.toFixed(3) : undefined).not.toBe(
      String(score),
    );
    const failed = parseKnnResponse(
      JSON.stringify({ success: false, results: [], message: "boom" }),
    );
    expect(failed.isErr() ? failed.error.message : "").toBe(
      "ccc search failed: boom",
    );
    expect(parseKnnResponse("No results found.").isErr()).toBe(true);
  });
});

// End to end through the router with a stub ccc whose search obeys `--limit`, `--json`, `--path`
// and `--lang`, and logs every call. Exercises the real child runner and the real deadline.
const ROUTER = join(import.meta.dir, "..", "src", "repo-retrieve.ts");

function tempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

function git(dir: string, args: string[]): string {
  const result = spawnSync(
    "git",
    ["-C", dir, "-c", "commit.gpgsign=false", ...args],
    {
      encoding: "utf8",
    },
  );
  expect(result.status).toBe(0);
  return result.stdout;
}

function freshProject(): string {
  const dir = tempDir("rr-knn-project-");
  mkdirSync(join(dir, ".cocoindex_code"), { recursive: true });
  writeFileSync(
    join(dir, ".cocoindex_code", "settings.yml"),
    "include_patterns: []\n",
  );
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "rr-knn@example.com"]);
  git(dir, ["config", "user.name", "rr-knn"]);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "init"]);
  const head = git(dir, ["rev-parse", "HEAD"]).trim();
  writeFileSync(join(dir, ".cocoindex_code", "fake_target.db"), "fake index");
  writeFileSync(
    join(dir, ".cocoindex_code", "INDEXED_AT"),
    `${JSON.stringify({
      indexedAt: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
      source: "index",
      head,
    })}\n`,
  );
  return dir;
}

// A stub ccc over a corpus file (JSON [{p, d}] ordered by distance). It applies --limit, --path
// (via sqlite3's GLOB through bun) and --lang like ccc, prints JSON for --json, and sleeps
// STUB_SLEEP_MS per search to make the deadline observable.
function stubCcc(corpusRows: { p: string; d: number }[]): {
  bin: string;
  log: string;
} {
  const bin = tempDir("rr-knn-bin-");
  const log = join(bin, "calls.log");
  const data = join(bin, "corpus.json");
  writeFileSync(data, JSON.stringify(corpusRows));
  const script = join(bin, "stub.ts");
  writeFileSync(
    script,
    `import { Database } from "bun:sqlite";
import { readFileSync, appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.STUB_LOG, "ccc " + args.join(" ") + "\\n");
if (args[0] === "daemon") { process.stdout.write("Projects:\\n" + process.cwd() + " [idle]\\n"); process.exit(0); }
const q = {}; let json = false;
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--json") json = true;
  else if (args[i] === "--limit" || args[i] === "--offset" || args[i] === "--path") q[args[i]] = args[++i];
  else if (args[i] === "--lang") i++;
}
const limit = Number(q["--limit"] ?? 10), offset = Number(q["--offset"] ?? 0);
if (limit + offset > 4096 && q["--path"] === undefined) { console.log(JSON.stringify({success:false,results:[],message:"k too large"})); process.exit(1); }
const ms = Number(process.env.STUB_SLEEP_MS ?? 0);
if (ms > 0) await Bun.sleep(ms);
const rows = JSON.parse(readFileSync(process.env.STUB_CORPUS, "utf8"));
const db = new Database(":memory:");
db.run("CREATE TABLE c (i INTEGER, p TEXT, d REAL)");
rows.forEach((r, i) => db.run("INSERT INTO c VALUES (?,?,?)", [i, r.p, r.d]));
const picked = q["--path"] !== undefined
  ? db.query("SELECT i, p, d FROM c WHERE p GLOB ? ORDER BY d LIMIT ? OFFSET ?").all(q["--path"], limit, offset)
  : db.query("SELECT i, p, d FROM c ORDER BY d LIMIT ? OFFSET ?").all(limit + offset, 0).slice(offset);
const results = picked.map((r) => ({ file_path: r.p, language: "text", content: "chunk " + r.i, start_line: 1, end_line: 1, score: 1 - (r.d * r.d) / 2 }));
if (json) { process.stdout.write(JSON.stringify({ success: true, results, total_returned: results.length, offset: 0 }) + "\\n"); }
else if (results.length === 0) console.log("No results found.");
else results.forEach((r, i) => { console.log("\\n--- Result " + (i + 1) + " (score: " + r.score.toFixed(3) + ") ---"); console.log("File: " + r.file_path + ":1-1 [text]"); console.log(r.content); });
`,
  );
  writeFileSync(
    join(bin, "ccc"),
    `#!/bin/sh
# // dotfiles:ccc-index-entry
exec ${process.execPath} ${script} "$@"
`,
  );
  chmodSync(join(bin, "ccc"), 0o755);
  return { bin, log };
}

function runAbout(
  corpusRows: { p: string; d: number }[],
  args: string[],
  env: Record<string, string> = {},
) {
  const project = freshProject();
  mkdirSync(join(project, "src"), { recursive: true });
  const tools = stubCcc(corpusRows);
  const result = spawnSync(
    process.execPath,
    [ROUTER, "about", "retry policy", ...args],
    {
      cwd: project,
      encoding: "utf8",
      timeout: 50_000,
      env: {
        ...process.env,
        PATH: `${tools.bin}:${process.env["PATH"] ?? ""}`,
        STUB_LOG: tools.log,
        STUB_CORPUS: join(tools.bin, "corpus.json"),
        COCOINDEX_CODE_DB_PATH_MAPPING: "",
        REPO_RETRIEVE_AUTO_INDEX: "0",
        REPO_RETRIEVE_INDEX_WORKER: "0",
        XDG_STATE_HOME: join(tools.bin, "state"),
        XDG_RUNTIME_DIR: join(tools.bin, "runtime"),
        ...env,
      },
    },
  );
  const calls = (
    existsSync(tools.log) ? readFileSync(tools.log, "utf8").split("\n") : []
  ).filter((c) => c.startsWith("ccc search "));
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    calls,
  };
}

const hits = (stdout: string): string[] =>
  [...stdout.matchAll(/^File: (\S+):1-1 \[text\]$/gmu)].map((m) => m[1] ?? "");

describe("rr about --path through a stub ccc", () => {
  const big = range(5000, (i) =>
    i % 50 === 0 ? `src/f${i}.ts` : `other/f${i}.ts`,
  ).map((p, i) => ({
    p,
    d: (i + 1) / 10_000,
  }));

  test("a broad path is answered by path-less KNN rounds and rr's own filter", () => {
    const result = runAbout(big, ["--path", "src", "--limit", "5"]);
    expect(result.code).toBe(0);
    expect(hits(result.stdout)).toEqual([
      "src/f0.ts",
      "src/f50.ts",
      "src/f100.ts",
      "src/f150.ts",
      "src/f200.ts",
    ]);
    // Every ccc call is path-less and asks for JSON; no --path reaches ccc.
    expect(result.calls.length).toBe(1);
    expect(result.calls[0]).toContain("--json");
    expect(result.calls[0]).not.toContain("--path");
    expect(result.stdout).toContain("RESULT: PASS route=concept engine=ccc");
  });

  test("the user's limit above 4096 reaches ccc's full scan unclamped", () => {
    const result = runAbout(big, ["--path", "src", "--limit", "5000"]);
    expect(result.code).toBe(0);
    expect(result.calls).toHaveLength(1);
    expect(result.calls[0]).toContain("--limit 5000");
    expect(result.calls[0]).toContain("--path src/**");
    expect(hits(result.stdout)).toHaveLength(100);
  });

  test("0 matches under the cap falls back to the full scan and is NO_MATCH, not success", () => {
    const result = runAbout(big, ["--path", "src/*.zzz", "--limit", "5"]);
    expect(result.code).toBe(1);
    const last = result.calls.at(-1) ?? "";
    expect(last).toContain("--path src/*.zzz");
    expect(last).not.toContain("--json");
    expect(result.stderr).toContain("RESULT: NO_MATCH route=concept");
  });

  test("a stub slower than the single deadline exits 124, across rounds", () => {
    const slow = range(5000, (i) => `other/f${i}.ts`).map((p, i) => ({
      p,
      d: (i + 1) / 10_000,
    }));
    const started = performance.now();
    const result = runAbout(
      slow,
      ["--path", "nope/*", "--limit", "5", "--timeout-ms", "1500"],
      {
        STUB_SLEEP_MS: "400",
      },
    );
    expect(result.code).toBe(124);
    // 5 rounds x 400 ms would be 2 s and the scan another 400 ms: the one 1.5 s deadline cut it.
    expect(performance.now() - started).toBeLessThan(6_000);
    expect(result.stderr).toContain("timed out");
  });
});
