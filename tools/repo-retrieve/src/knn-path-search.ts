// `rr about --path`: answer a path-scoped semantic search from an EXACT path-less KNN with an
// adaptive over-fetch and an rr-side path filter, instead of ccc's full scan.
//
// Why this is exact. ccc's path-less search is one vec0 KNN query (`MATCH ? AND k = ? ORDER BY
// distance`); vec0 scans every vector, so the global top-k is exact. Filtering that list by path
// keeps the `need = offset + limit` closest path-matching rows whenever at least `need` rows
// survive: a matching row outside the top-k is no closer than the worst row inside it.
//
// Algorithm (fellow decision, 2026-11-11):
//   1. Fetch the global top-k from the start (never merge earlier rounds).
//   2. Fewer than `k` rows came back -> the index (language partition) is exhausted: what matches
//      is everything that exists, so the short answer is complete, not a miss.
//   3. At least `need` rows match -> done.
//   4. Otherwise double k and refetch. Only the INTERNAL k is capped (vec0 rejects k > 4096).
//      Still short at the cap, or `need` > cap -> fall back to ccc's own full-scan path search.
// One deadline covers every call, the fallback included; it is never reset. Ties are left as
// ccc ordered them (ORDER BY distance leaves ties unspecified); no tie-break and no tie-only
// refetch. The user's limit and offset are never clamped.
//
// Distance source. Plain `ccc search` prints the score rounded to 3 decimals, which cannot order
// anything. `ccc search --json` carries `score = 1 - d*d/2` as a full float64 (d = vec0's float32
// L2 distance), strictly decreasing in d for float32 distances, so ordering by score descending
// is ordering by distance ascending.

import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { err, ok, type Result } from "neverthrow";

// vec0 rejects `k > 4096` ("k value in knn query too large").
export const KNN_K_CAP = 4096;
const KNN_START_K_FLOOR = 256;

const rowSchema = z.object({
  file_path: z.string(),
  language: z.string(),
  content: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  score: z.number(),
});
const responseSchema = z.object({
  success: z.boolean(),
  results: z.array(rowSchema).default([]),
  message: z.string().nullish(),
});

export interface KnnRow {
  filePath: string;
  language: string;
  content: string;
  startLine: number;
  endLine: number;
  // 1 - d*d/2, unrounded; larger is closer.
  score: number;
}

// Decodes `ccc search --json` stdout. A failed or malformed response is an error, never an
// empty result.
export function parseKnnResponse(stdout: string): Result<KnnRow[], Error> {
  const parsed = jsonOf(responseSchema).safeParse(stdout);
  if (!parsed.success)
    return err(new Error("ccc search --json did not print a search response"));
  if (!parsed.data.success)
    return err(
      new Error(`ccc search failed: ${parsed.data.message ?? "no message"}`),
    );
  return ok(
    parsed.data.results.map((row) => ({
      filePath: row.file_path,
      language: row.language,
      content: row.content,
      startLine: row.start_line,
      endLine: row.end_line,
      score: row.score,
    })),
  );
}

// The text block ccc prints per result (cli.py print_search_results), so the output contract is
// the same whichever way the rows were obtained.
export function renderKnnRows(rows: KnnRow[]): string {
  return rows
    .map(
      (row, index) =>
        `\n--- Result ${index + 1} (score: ${row.score.toFixed(3)}) ---\n` +
        `File: ${row.filePath}:${row.startLine}-${row.endLine} [${row.language}]\n` +
        `${row.content}\n`,
    )
    .join("");
}

// SQLite GLOB, as `patternCompare` in sqlite3 (func.c) defines it, over Unicode code points:
//   `*` any run (including `/` and empty), `?` exactly one character,
//   `[...]` a class: a leading `^` negates, a `]` right after `[`/`[^` is literal, `a-z` ranges.
//   An unterminated `[` matches nothing. Case-sensitive. There is no escape character; a literal
//   `*`, `?` or `[` is written as a one-character class (see escapeGlobLiteral).
const codePoint = (char: string): number => char.codePointAt(0) ?? 0;

// Matches `ch` against the class whose body starts at p[start] (just after `[`). Returns the
// index after the closing `]`, or undefined when the class is unterminated or does not match.
// SQLite's rules: a leading `^` negates; a `]` first in the set is literal; `a-z` is a range
// unless `-` is last; there is no escape.
function matchClass(
  p: string[],
  start: number,
  ch: string,
): number | undefined {
  let at = start;
  const invert = p[at] === "^";
  if (invert) at += 1;
  let seen = false;
  if (p[at] === "]") {
    seen = ch === "]";
    at += 1;
  }
  let prior: string | undefined;
  for (let c2 = p[at]; c2 !== undefined; c2 = p[at]) {
    at += 1;
    if (c2 === "]") return seen === invert ? undefined : at;
    const upper = p[at];
    if (
      c2 === "-" &&
      upper !== undefined &&
      upper !== "]" &&
      prior !== undefined
    ) {
      at += 1;
      seen ||=
        codePoint(ch) >= codePoint(prior) && codePoint(ch) <= codePoint(upper);
      prior = undefined;
    } else {
      seen ||= ch === c2;
      prior = c2;
    }
  }
  return undefined;
}

// SQLite GLOB, as `patternCompare` in sqlite3 (func.c) defines it, over Unicode code points:
//   `*` any run (including `/` and empty), `?` exactly one character, `[...]` a class
//   (see matchClass). Case-sensitive. There is no escape character; a literal `*`, `?` or `[`
//   is written as a one-character class (see escapeGlobLiteral).
export function sqliteGlobMatches(pattern: string, text: string): boolean {
  const p = Array.from(pattern);
  const s = Array.from(text);
  const memo = new Map<number, boolean>();
  const match = (pi: number, si: number): boolean => {
    const key = pi * (s.length + 1) + si;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const result = matchFrom(pi, si);
    memo.set(key, result);
    return result;
  };
  const matchFrom = (pi: number, si: number): boolean => {
    const c = p[pi];
    if (c === undefined) return si === s.length;
    if (c === "*") {
      let rest = pi;
      while (p[rest] === "*") rest += 1;
      if (rest === p.length) return true;
      return Array.from({ length: s.length - si + 1 }, (_, i) => si + i).some(
        (from) => match(rest, from),
      );
    }
    const ch = s[si];
    if (ch === undefined) return false;
    if (c === "?") return match(pi + 1, si + 1);
    if (c === "[") {
      const after = matchClass(p, pi + 1, ch);
      return after !== undefined && match(after, si + 1);
    }
    return c === ch && match(pi + 1, si + 1);
  };
  return match(0, 0);
}

export type RoundOutcome<T> =
  | { kind: "done"; value: T }
  | { kind: "timeout" }
  // The caller has already reported the failure; `exitCode` is what rr exits with.
  | { kind: "failed"; exitCode: number }
  | { kind: "error"; message: string };

export interface PathSearchPlan<F> {
  // ccc's glob, applied here with SQLite GLOB semantics.
  pattern: string;
  limit: number;
  offset: number;
  // Monotonic clock (ms) and the absolute deadline shared by every call below.
  now: () => number;
  deadlineAt: number;
  // Global top-k from the start (no path). `remainingMs` is what is left of the one deadline.
  knn: (k: number, remainingMs: number) => Promise<RoundOutcome<KnnRow[]>>;
  // ccc's own path search for this limit/offset (`--path pattern`), whatever it returns.
  fullScan: (remainingMs: number) => Promise<RoundOutcome<F>>;
}

export type PathSearchResult<F> =
  | { kind: "rows"; rows: KnnRow[]; ks: number[] }
  | { kind: "full-scan"; value: F; ks: number[] }
  | { kind: "timeout"; ks: number[] }
  | { kind: "failed"; exitCode: number; ks: number[] }
  | { kind: "error"; message: string; ks: number[] };

export function startingK(need: number): number {
  return Math.min(KNN_K_CAP, Math.max(KNN_START_K_FLOOR, need * 4));
}

export async function adaptivePathSearch<F>(
  plan: PathSearchPlan<F>,
): Promise<PathSearchResult<F>> {
  const need = plan.offset + plan.limit;
  const ks: number[] = [];

  const fallBack = async (): Promise<PathSearchResult<F>> => {
    const remaining = plan.deadlineAt - plan.now();
    if (remaining <= 0) return { kind: "timeout", ks };
    const full = await plan.fullScan(remaining);
    return full.kind === "done"
      ? { kind: "full-scan", value: full.value, ks }
      : { ...full, ks };
  };

  if (need > KNN_K_CAP) return fallBack();
  for (let k = startingK(need); ; k = Math.min(KNN_K_CAP, k * 2)) {
    const remaining = plan.deadlineAt - plan.now();
    if (remaining <= 0) return { kind: "timeout", ks };
    ks.push(k);
    const round = await plan.knn(k, remaining);
    if (round.kind !== "done") return { ...round, ks };
    const fetched = round.value;
    // ccc returns rows ordered by distance; ordering here makes the contract independent of
    // that. Array sort is stable, so ties keep ccc's order (unspecified by contract).
    const ordered = fetched.toSorted((a, b) => b.score - a.score);
    const matched = ordered.filter((row) =>
      sqliteGlobMatches(plan.pattern, row.filePath),
    );
    // Fewer rows than asked for means ccc ran out of rows: this is every match that exists.
    if (matched.length >= need || fetched.length < k)
      return {
        kind: "rows",
        rows: matched.slice(plan.offset, need),
        ks,
      };
    if (k >= KNN_K_CAP) return fallBack();
  }
}
