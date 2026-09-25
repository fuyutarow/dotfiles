#!/usr/bin/env bun
// Agent/human CLI: declare the search shape, then route to ccc, rg, or Serena.
//
// Contract:
//   concept/battery -> ccc search (freshness is explicit via --refresh; battery requires >=3 paraphrases)
//   literal         -> rg --fixed-strings
//   exhaustive      -> rg regex enumeration
//   files           -> rg --files
//   structural      -> ccc grep
//   symbol          -> exit 2 with a Serena route
//   index           -> `ccc index`, then record the freshness watermark on success -- the ONLY
//                      writer of that watermark. There used to be a second, faster `stamp`
//                      command that recorded the watermark without reindexing; it was deleted
//                      because its freshness claim could not be verified --
//                      `GIT_COMMITTER_DATE`/`git commit --date=` defeated its plausibility check
//                      with no race and no exotic tooling (see this file's git history for the
//                      commit that removed it). A leftover `source: "stamp"` watermark on disk
//                      from before the deletion is never trusted (see checkIndexFreshness):
//                      re-run `repo-retrieve index`.
//
// INDEX FRESHNESS (concept/battery only) — the watermark, the NO_INDEX gate, and the no-HEAD
// rule — lives in ccc-index.ts, next to the `index` action that is the watermark's only writer.
//
// The rg routes read the working tree directly and are correctly current always — re-verified
// live 2026-09-04 (a brand-new file with a unique marker was found by `literal` immediately).
//
// `structural` (ccc grep) was ALSO believed to read the working tree directly, on an earlier
// claim of empirical verification with a named reproduction. That claim is CONTRADICTED by live
// measurement (2026-09-04): the same brand-new-file test that confirms the rg routes above
// returns NO_MATCH from `structural` for content `literal` finds instantly, reproduced
// independently twice (by gnya, and separately by this forge with a different marker/file, after
// ruling out a dotfile-naming confound in its own first attempt). Bounded claim, not
// generalized: contradicted for this ccc version, this project — not established as a universal
// property, and not yet resolved into a fix. Until resolved, do NOT assume `structural` sees
// content newer than its last `ccc index` run; this row is NOT gated by checkIndexFreshness
// either, so there is currently no refusal to protect a caller from a stale `structural` result —
// see the forge ledger for the open item (orderer decision pending, behaviour deliberately
// unchanged pending it).
//
// Exit: 0 success, 1 no rg/ccc-search matches or Cleye ordinary-unknown refusal, 2 other
// usage/environment failure, 3 stale/missing/corrupt/unrecorded index watermark (NO_INDEX), 75 ccc
// index still building (daemon reports [indexing]; wait and retry), 124 child timeout.
// Children receive argv directly; no query or path is evaluated by a shell.
//
// TRUST LAW (governs every exit path below): a tool must never report a stronger conclusion than
// it earned. "I checked and it is stale/unrecorded" (NO_INDEX, exit 3) and "I checked and it is
// fine" (PASS, exit 0) are the only two terminal answers about freshness -- there is no third
// "warn and proceed anyway" branch anywhere in this file, and PASS is the only one of the two that
// is ever allowed to appear on stdout. A caller that reads only stdout+exit code (the documented
// calling convention -- see repo-retrieve.test.ts and driving-cocoindex) can therefore never mistake
// an unearned pass for an earned one.

import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { cli, command } from "cleye";
import {
  checkIndexFreshness,
  citationToken,
  findRegisteredProject,
  headLabel,
  runIndexWrapper,
} from "./ccc-index.ts";
import { requireExecutable, runChild, runChildCaptured } from "./child.ts";

const ROUTES = [
  "concept",
  "battery",
  "literal",
  "exhaustive",
  "files",
  "structural",
  "symbol",
] as const;

type Route = (typeof ROUTES)[number];

// The routes that delegate to rg -- shared by runRg (which dispatches on it) and lexicalMissLine
// (which reports on the same set), so the two stay in lockstep instead of each declaring its own
// copy of the literal union.
type RgRoute = "literal" | "exhaustive" | "files";

// Exact text `ccc grep` (v0.2.41) prints, and the ONLY thing it prints, on a genuine no-match.
// See runCccGrep for why exact-whole-output equality is used instead of a substring test.
const CCC_GREP_NO_MATCH_TEXT = "No matches found.";

function positiveInteger(name: string): (value: string) => number {
  return (value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`--${name} must be a positive integer`);
    }
    return parsed;
  };
}

function nonEmptyString(name: string): (value: string) => string {
  return (value) => {
    if (value === "") {
      throw new Error(`--${name} requires a value`);
    }
    return value;
  };
}

// Cleye 2.6.0's strictFlags misses --__proto__; reject only that prototype-sensitive name before
// assignment. Commands do not inherit ignoreArgv, so every command below installs this guard;
// ordinary unknowns remain Cleye strictFlags' responsibility.
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

const GLOB_MAGIC = /[*?[\]{}]/;

// ccc's --path consumes a file-path glob, not a directory name. Preserve a caller's explicit
// glob and file path exactly, but turn an existing directory inside the selected project into
// the recursive glob that actually selects its indexed files. realpath keeps an in-project
// symlink to an outside directory from accidentally widening the search scope.
// This is accidental-scope normalization, not a hostile TOCTOU security boundary: the filesystem
// may change after these checks and before ccc consumes the resulting glob.
function cccSearchPath(project: string, path: string): string {
  if (GLOB_MAGIC.test(path)) return path;

  try {
    const projectPath = realpathSync(project);
    const candidate = realpathSync(resolve(projectPath, path));
    const insideProject = relative(projectPath, candidate);
    if (
      insideProject === ".." ||
      insideProject.startsWith(`..${sep}`) ||
      isAbsolute(insideProject) ||
      !statSync(candidate).isDirectory()
    ) {
      return path;
    }
    return `${insideProject || "."}/**`;
  } catch {
    // A nonexistent path is still a caller-supplied file/path glob. Do not invent a broader
    // recursive scope for it.
    return path;
  }
}

function exactlyOneQuery(route: string, queries: string[]): string {
  const query = queries[0];
  if (queries.length !== 1 || query === undefined || query.trim() === "") {
    throw new Error(`${route} requires exactly one non-empty --query`);
  }
  return query;
}

function atMostOnePath(route: string, paths: string[]): void {
  if (paths.length > 1) {
    throw new Error(`${route} accepts at most one --path glob`);
  }
}

function cccResultCount(stdout: string): number {
  return stdout.match(/^--- Result \d+ \(/gm)?.length ?? 0;
}

// Same `| undefined` reasoning as SearchFlags above: this is always called with a SearchFlags
// value (or a slice of one), whose optional fields are real present-with-undefined keys.
function rgFlags(values: {
  glob?: string[] | undefined;
  ignoreCase?: boolean | undefined;
  hidden?: boolean | undefined;
  context?: number | undefined;
  filesWithMatches?: boolean | undefined;
  count?: boolean | undefined;
  limit?: number | undefined;
  multiline?: boolean | undefined;
  multilineDotall?: boolean | undefined;
}): string[] {
  if (values.filesWithMatches && values.count) {
    throw new Error("--files-with-matches and --count are mutually exclusive");
  }

  const flags: string[] = ["--color", "never"];
  if (values.ignoreCase) flags.push("--ignore-case");
  if (values.hidden) flags.push("--hidden");
  if (values.context !== undefined) {
    flags.push("--context", String(values.context));
  }
  if (values.filesWithMatches) flags.push("--files-with-matches");
  if (values.count) flags.push("--count");
  // `-U`/`--multiline`, exposed 2026-09-17 after a measured miss (soks corpus, hard-wrapped
  // knowledge/ prose): a phrase whose file has a real line break INSIDE it can never match
  // `literal`/`exhaustive` without this, because rg matches per physical line by default. This
  // flag alone is NOT the fix for a blind "find this exact phrase" query -- `--fixed-strings`
  // (literal's own flag, see runRg) cannot express "there might be a newline here", so `literal`
  // still needs the caller to pass a query that itself contains a real newline byte (useful only
  // to CONFIRM a wrap you already located by other means). `exhaustive` is where this earns its
  // keep: its query is a real regex, so a caller who suspects a wrap can write `foo\n?bar` once
  // multiline is on. Verified empirically before shipping (not assumed from rg's docs alone):
  // `rg --fixed-strings -U --multiline -- 'AB' file` where file holds "A\nB" still misses (exit
  // 1) -- multiline lifts the "no match may cross a line" restriction, it does not retroactively
  // let a literal string absorb a newline it never asked for. `--multiline-dotall` only changes
  // `.`'s behavior and rg itself documents it as a no-op without `-U` first (checked live), so no
  // extra validation is added here beyond what rgSearchFlags() already wires straight through.
  if (values.multiline) flags.push("--multiline");
  if (values.multilineDotall) flags.push("--multiline-dotall");
  // **`literal`/`exhaustive` に `--limit` が無かった**(2026-09-02、腕 0a の報告)。
  //   `concept`/`battery` は最初から `--limit` を持つのに、語彙 route だけ rg の
  //   `-m/--max-count` を露出していなかった——広い正規表現が大きな repo で無制限に
  //   一致を返しうる。rg 自身の `-m` へそのまま渡す(ファイルごとの上限)。
  if (values.limit !== undefined)
    flags.push("--max-count", String(values.limit));
  for (const glob of values.glob ?? []) flags.push("--glob", glob);
  return flags;
}

async function runCccSearch(
  route: "concept" | "battery",
  queries: string[],
  path: string | undefined,
  limit: number,
  timeoutMs: number,
  refresh: boolean,
): Promise<number> {
  const project = findRegisteredProject(process.cwd());
  if (!project) {
    throw new Error(
      `${route} requested, but ${process.cwd()} is not ccc-registered; ` +
        "run ccc init/index or use an explicitly lexical route",
    );
  }

  const freshness = await checkIndexFreshness(project, route);
  if (freshness.status === "stale") {
    process.stderr.write(freshness.message);
    return 3;
  }
  // freshness.status === "fresh" here -- the branch above returns unconditionally. A watermark
  // can only reach this point if checkIndexFreshness confirmed source === "index" (a legacy
  // "stamp" watermark is refused as stale before it ever gets here -- see the source === "stamp"
  // branch there), so every fresh result was produced by `index` observing a real `ccc index`
  // child succeed. There is no second, lower-confidence tier anymore.
  //
  // indexedAt/head ride on EVERY result this function can still produce, not only NO_INDEX
  // (2026-09-04, feature not repair -- see this file's own git history / the forge ledger for
  // the reasoning). Before this, "was the index fresh when this absence was claimed" survived
  // only if a PI remembered to declare `NO_INDEX:<timestamp+watermark>` themselves; a plain
  // NO_MATCH carried nothing. Stamping the success path moves that fact out of memory and into
  // the output for BOTH NO_MATCH and PASS, so a gate can check it later instead of trusting
  // recall. Scoped to concept/battery only (this function's only two callers) -- `structural`
  // and the rg routes read the working tree directly (verified empirically, see the file-header
  // comment above) and have no persisted watermark to stamp; `route=` alone already tells a
  // reader which class a line belongs to, so a missing stamp on those routes is never ambiguous
  // with an omission here.
  //
  // `cite=` (2026-09-08) adds the verbatim `<indexedAt>+<head>` token (see citationToken()) next
  // to the existing separate indexedAt=/head= fields. This turns "the index this claim is about"
  // from something a PI would otherwise reconstruct by hand out of two other fields into a single
  // string that carries straight into a claim -- `--hit PASS:<cite>` or `--hit NO_MATCH:<cite>` --
  // exactly the way row 7's `--hit NO_INDEX:<timestamp+watermark>` already does. A NO_MATCH or a
  // PASS made today keeps `cite=` pointing at the commit it actually searched even after HEAD
  // moves on without it -- the claim was never about "current HEAD" to begin with.
  const confidence =
    `confidence=verified(index) indexedAt=${freshness.watermark.indexedAt} ` +
    `head=${headLabel(freshness.watermark.head)} cite=${citationToken(freshness.watermark)}`;

  const ccc = requireExecutable("ccc");
  const statusTimeoutMs = Math.min(timeoutMs, 5_000);
  const status = await runChildCaptured(
    [ccc, "daemon", "status"],
    statusTimeoutMs,
    false,
  );
  if (status.exitCode !== 0) {
    process.stderr.write(
      `FATAL: could not read ccc daemon status before ${route} search\n`,
    );
    return status.exitCode;
  }
  if (status.stdout.includes(`${project} [indexing]`)) {
    process.stderr.write(
      `RESULT: INDEXING route=${route} engine=ccc project=${project}; ` +
        "wait for ccc daemon status to report [idle], then retry\n",
    );
    return 75;
  }
  const cccPath = path === undefined ? undefined : cccSearchPath(project, path);
  let matchedQueries = 0;

  for (const [index, query] of queries.entries()) {
    const command = [ccc, "search", query, "--limit", String(limit)];
    if (cccPath !== undefined) command.push("--path", cccPath);
    if (refresh && index === 0) command.push("--refresh");

    process.stderr.write(
      `ROUTE: ${route} -> ccc search (${index + 1}/${queries.length}) project=${project}\n`,
    );
    const result = await runChildCaptured(command, timeoutMs);
    if (result.exitCode !== 0) return result.exitCode;
    if (cccResultCount(result.stdout) > 0) matchedQueries += 1;
  }

  if (matchedQueries === 0) {
    process.stderr.write(
      `RESULT: NO_MATCH route=${route} engine=ccc queries=${queries.length}; ` +
        `exit 0 with no result blocks is not PASS and does not by itself prove absence; ` +
        `${confidence}\n`,
    );
    return 1;
  }
  process.stdout.write(
    `RESULT: PASS route=${route} engine=ccc queries=${queries.length} ` +
      `queries_with_hits=${matchedQueries} ${confidence}\n`,
  );
  return 0;
}

async function runRg(
  route: RgRoute,
  query: string | undefined,
  paths: string[],
  values: Parameters<typeof rgFlags>[0],
  timeoutMs: number,
): Promise<number> {
  const rg = requireExecutable("rg");
  const command =
    route === "files"
      ? [rg, "--files", ...rgFlags(values), ...paths]
      : [
          rg,
          ...(route === "literal" ? ["--fixed-strings"] : []),
          "--line-number",
          ...rgFlags(values),
          "--",
          query ?? "",
          ...paths,
        ];

  process.stderr.write(`ROUTE: ${route} -> rg\n`);
  const exitCode = await runChild(command, timeoutMs);
  if (exitCode === 0) {
    process.stdout.write(`RESULT: PASS route=${route} engine=rg\n`);
  } else if (exitCode === 1) {
    process.stderr.write(lexicalMissLine(route, query));
  }
  return exitCode;
}

async function runCccGrep(
  query: string,
  path: string | undefined,
  timeoutMs: number,
): Promise<number> {
  const ccc = requireExecutable("ccc");
  const command = [ccc, "grep", query];
  if (path !== undefined) command.push("--path", path);
  process.stderr.write("ROUTE: structural -> ccc grep\n");
  const result = await runChildCaptured(command, timeoutMs);
  if (result.exitCode !== 0) return result.exitCode;
  // `ccc grep` (checked: v0.2.41, `ccc grep --help`) prints exactly the sentence
  // "No matches found." and nothing else on a genuine no-match, exit 0 -- there is no --json,
  // --count, or other machine-readable signal for this subcommand (search has --json; grep
  // does not). A prior version of this check tested only `stdout.trim() === ""`, which real
  // `ccc grep` never produces on a no-match (reproduced live: `ccc grep` on a guaranteed-absent
  // pattern printed "No matches found." and exited 0, and the old check let it through as
  // RESULT: PASS). A plain substring test on that sentence is itself spoofable: grepping a
  // file whose OWN content contains the literal text "No matches found." returns that text as
  // part of a REAL match's output (`path\nline| content`), so a substring match would
  // misreport a genuine hit as NO_MATCH. Comparing the ENTIRE trimmed output for exact equality
  // avoids that: ccc's match format always leads with a path/line block and can never collapse
  // to just this one sentence. Accepted failure mode: if a future ccc version changes this
  // exact wording, the check silently stops firing and structural again reports PASS on a
  // genuine no-match -- the same defect this closes, not a new one it introduces, and worth
  // re-verifying against `ccc grep --help`/CHANGELOG on any ccc upgrade.
  if (result.stdout.trim() === CCC_GREP_NO_MATCH_TEXT) {
    process.stderr.write(
      "RESULT: NO_MATCH route=structural engine=ccc-grep; ccc reported no matches\n",
    );
    return 1;
  }
  if (result.stdout.trim() === "") {
    // Not observed on the checked ccc version, but cheap defensive coverage in case a
    // future version goes back to signalling no-match via empty output instead of the
    // sentence above.
    process.stderr.write(
      "RESULT: NO_MATCH route=structural engine=ccc-grep; empty output is not PASS\n",
    );
    return 1;
  }
  process.stdout.write("RESULT: PASS route=structural engine=ccc-grep\n");
  return 0;
}

/**
 * **語彙で外したことは、無いことではない。**その一行を `NO_MATCH` に付ける。
 *
 * WHY: 語彙 route の `NO_MATCH` は `RESULT: NO_MATCH route=literal engine=rg` の一行だけで、
 *   **注意書きが無かった**——ccc 側の `NO_MATCH` には
 *   「exit 0 with no result blocks is not PASS and does not by itself prove absence」が付いて
 *   いるのに、語彙側には無い。腕はそこから「無い」と読み、不在の主張や新規実装の判断に使う。
 *
 * **当初の設計(①)は、ここで意味検索を自動発火させて
 *   `NO_MATCH(語彙、意味では N 件)` と `NO_MATCH(両方)` を分ける、というものだった。
 *   実装して実測し、前提が偽であることが分かったので採らない**——
 *
 *     件数: ccc search は常に上限まで返す。`--limit 5` なら不在の語でも 5 件。**情報が無い。**
 *     score: 在る 6 問 0.879〜0.930 / 無い 6 問 0.824〜0.895。**帯が重なる。**
 *            無意味な子音列 `wpfjkd nvqxzl bmtrhg` が 0.873、実在する主題
 *            「overlay で子プロセスを隔離する」が 0.879——**閾値を置けない。**
 *
 *   件数でも score でも分離しないので、道具が「語が違うだけで在る」と言えば、それは
 *   **捏造した信号**である。誤った信号は信号が無いより悪い(誤った分母が正しい分母より
 *   危険であるのと同じ理由——測ったことになってしまう)。
 *
 * だから付けるのは**判定ではなく、次に打てる route** だけにする。撃たないので遅くもならない。
 *
 * ADDENDUM (2026-09-17, soks corpus 実測報告): 語彙で外れていなくても NO_MATCH になる別の系統が
 * ある——rg は行単位で照合するので、hard-wrap で一致点に改行が挟まった file はどちらの語彙
 * route でも見つからない。同一文で全文 23 件・短い断片 45 件という実測差(soks-agt_bdpp、
 * 2026-09-17)がこれを裏付ける。言い換え(battery/concept)はこの系統には効かないので、
 * 別の一行として案内する(既存の語彙キャベアットを書き換えない——原因が違う)。
 * `--multiline`(-U)は rg 側の制約を外すだけで、跨ぐ正規表現を書くのは呼び出し側の責務のまま
 * ——実測: `--fixed-strings -U --multiline` の生の literal 文字列だけでは効かない
 * (2026-09-17 実測、rgFlags() のコメント参照)。
 */
function lexicalMissLine(route: RgRoute, query: string | undefined): string {
  const head = `RESULT: NO_MATCH route=${route} engine=rg`;
  if (route === "files") {
    return `${head}; glob に一致する path が無い(内容は見ていない)\n`;
  }
  return (
    `${head}; **語彙で外しただけであって、不在の証明ではない。**` +
    `この repo の記録は同じ事柄を別の語で書く(日本語/英語、略号/正式名)。\n` +
    `  不在を主張する前に: repo-retrieve battery --queries "<3本以上の言い換え>"` +
    (query === undefined
      ? ""
      : `\n  意味で引き直す: repo-retrieve concept --query ${JSON.stringify(query)}`) +
    `\n  **意味検索の応答は不在を否定も肯定もしない**——件数は常に上限まで返り、` +
    `score は在る/無いを分離しない(実測 2026-09-02)。読むのは中身であって件数ではない。\n` +
    // 2026-09-17, soks corpus からの実測報告: rg は行単位で照合するので、hard-wrap された散文
    // (knowledge/ 系に多い)で一致点の内側に改行が落ちている file は、語彙を変えても
    // NO_MATCH のまま——言い換えでは直らない別の失敗系統。同一文で全文 23 件・断片 45 件と
    // 実測差が出た(短い断片ほど改行を跨がずに収まりやすいため)。
    `  **改行またぎの可能性**: hard-wrap で一致点に改行が挟まると、言い換えても直らない。` +
    `短い部分文字列(改行を跨がない長さ)で引き直すか、--multiline(規約は跨げる正規表現側で` +
    `\\n? を書く側の責務、--multiline はそれを許可するだけ)を試すこと。\n`
  );
}

// Every field is `| undefined`, not just optional: this type receives cleye's `parsed.flags`
// directly, where a flag with no default is always a present key holding `undefined` (a real,
// distinct state -- see the `?? <default>` / `!== undefined` reads throughout this file), not an
// absent key. exactOptionalPropertyTypes distinguishes the two, so the type must say which one
// this is.
type SearchFlags = {
  query?: string[] | undefined;
  path?: string[] | undefined;
  glob?: string[] | undefined;
  limit?: number | undefined;
  timeoutMs?: number | undefined;
  refresh?: boolean | undefined;
  ignoreCase?: boolean | undefined;
  hidden?: boolean | undefined;
  context?: number | undefined;
  filesWithMatches?: boolean | undefined;
  count?: boolean | undefined;
  multiline?: boolean | undefined;
  multilineDotall?: boolean | undefined;
};

function queryFlag() {
  return {
    // `as const` marks this a fixed 1-element tuple (cleye's FlagType wants `readonly
    // [TypeFunction]` for a repeatable flag), not a variable-length array -- without it TS infers
    // a plain mutable array type, which a tuple type can never accept.
    query: {
      type: [nonEmptyString("query")] as const,
      alias: "q",
      default: () => [],
    },
  };
}

function pathFlag() {
  return {
    path: {
      type: [nonEmptyString("path")] as const,
      alias: "p",
      default: () => [],
    },
  };
}

function globFlag() {
  return {
    glob: {
      type: [nonEmptyString("glob")] as const,
      alias: "g",
      default: () => [],
    },
  };
}

function timeoutFlag() {
  return { timeoutMs: positiveInteger("timeout-ms") };
}

function rgSearchFlags() {
  return {
    ignoreCase: Boolean,
    hidden: Boolean,
    context: positiveInteger("context"),
    filesWithMatches: Boolean,
    count: Boolean,
    limit: positiveInteger("limit"),
    // See rgFlags()'s own comment for what these do and do NOT fix (a wrap-tolerant query is
    // still the caller's job; this only lifts rg's per-line restriction so that query can work).
    multiline: Boolean,
    multilineDotall: Boolean,
  };
}

async function runRoute(rawRoute: Route, values: SearchFlags): Promise<number> {
  const queries = values.query ?? [];
  const paths = values.path ?? [];
  const timeoutMs = values.timeoutMs ?? 120_000;
  switch (rawRoute) {
    case "symbol": {
      const symbol = exactlyOneQuery(rawRoute, queries);
      process.stderr.write(
        `FATAL: route=symbol belongs to Serena, not shell search; ` +
          `use Serena definitions/references for '${symbol}'\n`,
      );
      return 2;
    }
    case "concept":
    case "battery": {
      if (rawRoute === "concept") {
        exactlyOneQuery(rawRoute, queries);
      } else if (
        queries.length < 3 ||
        queries.some((query) => query.trim() === "")
      ) {
        throw new Error("battery requires at least 3 non-empty --query values");
      }
      atMostOnePath(rawRoute, paths);
      return runCccSearch(
        rawRoute,
        queries,
        paths[0],
        values.limit ?? 8,
        timeoutMs,
        values.refresh ?? false,
      );
    }
    case "structural": {
      const query = exactlyOneQuery(rawRoute, queries);
      atMostOnePath(rawRoute, paths);
      return runCccGrep(query, paths[0], timeoutMs);
    }
    case "files": {
      return runRg(
        rawRoute,
        undefined,
        paths.length > 0 ? paths : ["."],
        values,
        timeoutMs,
      );
    }
    case "literal":
    case "exhaustive": {
      const query = exactlyOneQuery(rawRoute, queries);
      return runRg(
        rawRoute,
        query,
        paths.length > 0 ? paths : ["."],
        values,
        timeoutMs,
      );
    }
  }
}

function routeCommand(route: Route) {
  return command(
    {
      name: route,
      parameters: [],
      // Inlined (not hoisted to a `const flags = ...` above) so each branch stays a fresh object
      // literal at the point cleye's `Flags` (a string-index-signature type) checks it -- a
      // literal gets an implicit index signature synthesized here; a variable holding the same
      // value does not, and fails as "index signature missing".
      //
      // The ternary carries a SECOND load that the paragraph above does not name, measured
      // 2026-09-23 by attempting the collapse and reverting it. Replacing these branches with a
      // `Record<Route, Flags>` lookup table typechecks at the `flags:` property itself (the
      // explicit annotation supplies the index signature) but breaks one call further down:
      //   repo-retrieve.ts(639,46): error TS2559: Type '{ [x: string]: unknown; help: boolean |
      //   undefined; }' has no properties in common with type 'SearchFlags'
      // because cleye's `command()` infers a DIFFERENT flags shape per branch, and that per-branch
      // inference is what makes `parsed.flags` below assignable to SearchFlags. One table collapses
      // all seven routes to a single generic `Flags`, so the callback loses its narrowing. A
      // `ts-pattern` `match(route).exhaustive()` is expected to fail for the same structural reason
      // (its result is a call expression, not a per-branch literal) -- NOT separately measured.
      // Do not "fix" the resulting error with `as` or `@ts-expect-error`: that trades a real
      // guarantee for a cosmetic one. Collapsing this needs a cleye-side change first.
      flags:
        route === "concept" || route === "battery"
          ? {
              ...queryFlag(),
              ...pathFlag(),
              limit: positiveInteger("limit"),
              ...timeoutFlag(),
              refresh: Boolean,
            }
          : route === "literal" || route === "exhaustive"
            ? {
                ...queryFlag(),
                ...pathFlag(),
                ...globFlag(),
                ...timeoutFlag(),
                ...rgSearchFlags(),
              }
            : route === "files"
              ? {
                  ...pathFlag(),
                  ...globFlag(),
                  ...timeoutFlag(),
                  hidden: Boolean,
                }
              : route === "structural"
                ? { ...queryFlag(), ...pathFlag(), ...timeoutFlag() }
                : { ...queryFlag(), ...timeoutFlag() },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: { description: `Run the ${route} repository-search route.` },
    },
    async (parsed) => {
      if (parsed._.length > 0) {
        throw new Error(
          `unexpected positional arguments: ${parsed._.join(" ")}`,
        );
      }
      const exitCode = await runRoute(route, parsed.flags);
      process.exitCode = exitCode;
    },
  );
}

function indexCommand() {
  return command(
    {
      name: "index",
      parameters: [],
      flags: { ...timeoutFlag() },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: {
        description:
          "Run 'ccc index' and, on success, record the freshness watermark at the resulting HEAD.",
      },
    },
    async (parsed) => {
      if (parsed._.length > 0) {
        throw new Error(
          `unexpected positional arguments: ${parsed._.join(" ")}`,
        );
      }
      process.exitCode = await runIndexWrapper(
        parsed.flags.timeoutMs ?? 600_000,
      );
    },
  );
}

async function main(): Promise<void> {
  await cli(
    {
      name: "repo-retrieve",
      parameters: ["[route]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: {
        description:
          "Declare a repository-search shape and route it to ccc, rg, or Serena.",
      },
      commands: [...ROUTES.map(routeCommand), indexCommand()],
    },
    (parsed) => {
      if (parsed._.route === undefined) throw new Error("missing route");
      throw new Error(`unknown route '${parsed._.route}'`);
    },
    Bun.argv.slice(2),
  );
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n` +
        "Run 'repo-retrieve --help' for usage.\n",
    );
    process.exitCode = 2;
  });
}
