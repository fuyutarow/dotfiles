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
//                      re-run `repo-search index`.
//
// INDEX FRESHNESS: `ccc status` exposes chunk/file counts but no watermark — it cannot tell you
// whether its own index matches the working tree (verified: `ccc status`/`ccc --help`, no
// indexed-at or commit field anywhere in the output). So concept/battery (the only routes that
// read the persisted vector index) compare a sidecar watermark (.cocoindex_code/INDEXED_AT,
// {head, indexedAt, source} — see the Watermark type below) against `git rev-parse HEAD` before
// returning results. A mismatch, a missing/corrupt watermark, a legacy `source: "stamp"`
// watermark, or a watermark whose project has no ccc index artifacts at all, is NO_INDEX
// (exit 3) — never NO_MATCH, never results-with-a-warning.
//
// A project with no git HEAD at all (not a git repo, or an unborn branch with zero commits) is a
// REAL, legitimate state, not an error — but it is a state that only `index` may declare, because
// only it runs at a moment it can actually observe it and write it down. A read (search) never
// gets to assume it: absence of a watermark is never inferred as "fine", only ever read back as
// the fact something already recorded. See the long comment above gitHead() for the reasoning and
// the reproduction that motivated it, and checkIndexFreshness() for the read-side mechanics.
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
// calling convention -- see repo-search.test.ts and driving-cocoindex) can therefore never mistake
// an unearned pass for an earned one.

import { readdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cli, command } from "cleye";

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

// Exact text `ccc grep` (v0.2.41) prints, and the ONLY thing it prints, on a genuine no-match.
// See the structural case in runRoute for why exact-whole-output equality is used instead of a
// substring test.
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

function findRegisteredProject(start: string): string | null {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, ".cocoindex_code", "settings.yml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function requireExecutable(name: string): string {
  const executable = Bun.which(name);
  if (!executable) throw new Error(`${name} is not available on PATH`);
  return executable;
}

function headLabel(head: string | null): string {
  return head ?? "(none — not a git repo, or no commits yet)";
}

// --- Index freshness watermark -------------------------------------------------
//
// ccc's own index carries no watermark (confirmed against `ccc status` and `ccc --help`: chunk
// counts, file counts, languages — no indexed-at, no commit). The signal has to live outside
// ccc, so it lives here: a sidecar file next to the index recording the git HEAD the index was
// built from. Only HEAD is recorded, deliberately NOT a working-tree content signature — a
// signature that changes on every unstaged edit would fire on ordinary editing (the thing the
// task brief explicitly warns gets disabled by the first person it annoys) rather than on the
// structural change (commit, rename, checkout) that actually invalidates an index. Uncommitted
// edits between commits are therefore a known, accepted blind spot of this gate: `index` notes it
// to stderr rather than pretending it's covered.
//
// `head: null` is not "unknown" -- it is a POSITIVE, WRITER-VERIFIED claim that, at the moment
// `index` ran, this project had no git HEAD to compare against (see gitHead() below). A read-side
// comparison of `watermark.head !== currentHead` still does the right thing when both sides are
// null (`null !== null` is false in JS, so a still-no-git project correctly reads as fresh) and
// when only one side is null (a project that gained or lost its git history correctly reads as
// stale, forcing a re-index).
type Watermark = {
  head: string | null;
  indexedAt: string;
  // "index" is the only value this file writes anymore -- it is produced solely by observing a
  // `ccc index` child process actually succeed (see runIndexWrapper). "stamp" is a legacy value
  // written by the deleted `stamp` subcommand, which asserted freshness without ever running an
  // indexer; it is kept in this union ONLY so a leftover on-disk watermark from before the
  // deletion still parses as syntactically valid instead of falling into the generic "corrupt"
  // path, so checkIndexFreshness can name it specifically and refuse it -- never silently treat
  // it as equivalent to "index" just because its shape matches.
  source: "index" | "stamp";
};

const WATERMARK_BASENAME = "INDEXED_AT";

function watermarkPath(project: string): string {
  return join(project, ".cocoindex_code", WATERMARK_BASENAME);
}

type WatermarkRead =
  | { kind: "ok"; value: Watermark }
  | { kind: "missing" }
  | { kind: "invalid" };

async function readWatermark(project: string): Promise<WatermarkRead> {
  const file = Bun.file(watermarkPath(project));
  if (!(await file.exists())) return { kind: "missing" };
  try {
    const parsed = JSON.parse(await file.text());
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.head === null ||
        (typeof parsed.head === "string" &&
          /^[0-9a-f]{40}$/i.test(parsed.head))) &&
      (parsed.source === "index" || parsed.source === "stamp") &&
      typeof parsed.indexedAt === "string"
    ) {
      return { kind: "ok", value: parsed as Watermark };
    }
    return { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

async function writeWatermark(
  project: string,
  head: string | null,
  // Narrowed to the literal "index", not the full Watermark["source"] union: this is now the
  // ONLY writer of a watermark, and "stamp" must never be producible again by any code path in
  // this file. Widening this parameter type is itself the signal that someone is trying to
  // reintroduce the deleted command's write path.
  source: "index",
): Promise<void> {
  const value: Watermark = {
    head,
    indexedAt: new Date().toISOString(),
    source,
  };
  const path = watermarkPath(project);
  const tmp = `${path}.tmp-${process.pid}`;
  await Bun.write(tmp, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmp, path); // same directory -> atomic on a POSIX filesystem
}

const SETTINGS_BASENAME = "settings.yml";

// Cheap sanity check, explicitly NOT a security boundary (see the TRUST LAW note at the top of
// this file): does .cocoindex_code contain anything besides its own settings.yml and our own
// watermark file? A watermark's on-disk bytes can always be hand-written by anyone with
// filesystem access, so this cannot stop a determined spoof -- it only catches the specific,
// unintentional defect a verifier reproduced live: a watermark that matches currentHead sitting
// in a directory `ccc index` never actually touched, describing an index that does not exist.
async function hasIndexArtifacts(project: string): Promise<boolean> {
  const dir = join(project, ".cocoindex_code");
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(dir, { recursive: true, withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name === SETTINGS_BASENAME) continue; // hand-authored by `ccc init`, not indexing
    if (
      entry.name === WATERMARK_BASENAME ||
      entry.name.startsWith(`${WATERMARK_BASENAME}.tmp-`)
    ) {
      continue; // our own watermark, not a ccc-owned artifact
    }
    return true;
  }
  return false;
}

// null means "no usable HEAD" (not a git repo, or an unborn branch with zero commits) -- a real,
// if rare, project state, not an error condition.
//
// An earlier version of this gate treated a null HEAD as unverifiable and warned-and-proceeded on
// the SEARCH side: it printed a warning to stderr and then fell through to ccc search anyway, so
// the served answer still came out as `RESULT: PASS` on stdout with exit 0 -- byte-for-byte
// indistinguishable, to any caller reading only stdout+exit code, from a genuinely verified
// answer. Reproduced live: a non-git ccc project was indexed once, its indexed file was then
// rewritten without reindexing, and the stale content still came back as PASS. The tension that
// motivated that design was real -- refusing outright would break every non-git or
// pre-first-commit ccc project, forever, since a HEAD-based watermark can never be written for a
// project that structurally has no HEAD -- but "serve unverified results with a warning" was the
// wrong resolution to it.
//
// The actual resolution: null is not unverifiable, it is a DIFFERENT value HEAD can take, and it
// is `index` -- not the read side -- who can observe and record it, at the moment it runs. `index`
// writes `head: null` into the watermark only after it has observed its own `ccc index` child
// process actually exit 0 (see runIndexWrapper); the read side then compares `watermark.head` to
// `currentHead` exactly as it always has, with no special case, because `null === null` already
// means "still no git, nothing changed" and any other combination already means "drift,
// re-index". A pre-existing project that has never run `index` under this scheme -- which, on day
// one, is every project on the machine -- has no watermark at all yet, and gets the same answer
// any unindexed project gets: NO_INDEX (exit 3), never a silent pass. One `repo-search index`
// closes that gap permanently, including for a project that never has and never will have a git
// HEAD.
async function gitHead(project: string): Promise<string | null> {
  const git = requireExecutable("git");
  const result = await runChildCaptured(
    [git, "-C", project, "rev-parse", "HEAD"],
    10_000,
    false,
  );
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

async function isWorkingTreeDirty(project: string): Promise<boolean> {
  const git = requireExecutable("git");
  const result = await runChildCaptured(
    [git, "-C", project, "status", "--porcelain"],
    10_000,
    false,
  );
  return result.exitCode === 0 && result.stdout.trim() !== "";
}

function remedy(project: string): string {
  return `run 'repo-search index' in ${project} to build a fresh, verified watermark`;
}

type Freshness =
  | { status: "fresh"; watermark: Watermark }
  | { status: "stale"; message: string };

// Deliberately NOT self-healing: an earlier design considered treating "the index DB's mtime is
// newer than the watermark" as proof of an out-of-band `ccc index`, and auto-adopting current
// HEAD. Rejected — it is unsound, not just approximate: reindexing at any OTHER checkout (or a
// failed/partial reindex) also advances the DB mtime, and "now" is later than almost any past
// HEAD's commit time, so the heuristic would rubber-stamp exactly the confidently-wrong-index
// case this gate exists to catch. A false PASS on stale data is worse than the false alarm it
// would avoid, so staleness recovery instead runs through `repo-search index` -- an actual
// reindex, observed to succeed -- rather than a guess or a self-asserted claim.
async function checkIndexFreshness(
  project: string,
  route: string,
): Promise<Freshness> {
  const currentHead = await gitHead(project);
  const watermark = await readWatermark(project);

  if (watermark.kind === "missing") {
    return {
      status: "stale",
      message:
        `RESULT: NO_INDEX route=${route} engine=ccc project=${project}; ` +
        `no freshness watermark at ${watermarkPath(project)}; current HEAD=${headLabel(currentHead)}; ` +
        `an unindexed project is treated as stale, never as fresh. Remedy: ${remedy(project)}\n`,
    };
  }
  if (watermark.kind === "invalid") {
    return {
      status: "stale",
      message:
        `RESULT: NO_INDEX route=${route} engine=ccc project=${project}; ` +
        `watermark at ${watermarkPath(project)} is unreadable/corrupt; current HEAD=${headLabel(currentHead)}; ` +
        `Remedy: ${remedy(project)}\n`,
    };
  }
  // A watermark written by the deleted `stamp` subcommand is a self-asserted claim that was never
  // backed by an observed reindex -- it is refused outright, on sight, regardless of whether its
  // recorded HEAD happens to match currentHead. It is never silently upgraded to "index" just
  // because its shape now parses the same way. See the Watermark.source comment for why this
  // legacy value is still accepted as syntactically valid instead of falling into "invalid" above.
  if (watermark.value.source === "stamp") {
    return {
      status: "stale",
      message:
        `RESULT: NO_INDEX route=${route} engine=ccc project=${project}; ` +
        `watermark at ${watermarkPath(project)} has source="stamp", written by the deleted ` +
        `'stamp' subcommand, which asserted freshness without ever running an indexer; such a ` +
        `watermark is never trusted, regardless of whether its recorded HEAD still matches. ` +
        `Remedy: ${remedy(project)}\n`,
    };
  }
  if (watermark.value.head !== currentHead) {
    return {
      status: "stale",
      // indexedAt is surfaced here (2026-09-04) because this is the ONE NO_INDEX case where a
      // real index exists and was genuinely fresh at some point -- the launch checklist's row 7
      // requires a PI to declare `--hit NO_INDEX:<timestamp+watermark>` naming exactly how far
      // behind the index was, but until now this message gave two commit hashes and no
      // timestamp, so a PI had to go compute that separately. `Watermark.indexedAt` was already
      // recorded; it just was not being printed. The other NO_INDEX branches (missing/invalid/
      // stamp/no-artifacts) do not get this treatment -- there either is no trustworthy
      // watermark to read a timestamp from, or the "how stale" question does not apply.
      message:
        `RESULT: NO_INDEX route=${route} engine=ccc project=${project}; ` +
        `index was built at HEAD=${headLabel(watermark.value.head)} (indexedAt=${watermark.value.indexedAt}) ` +
        `but the working tree is now at HEAD=${headLabel(currentHead)}; that drift is exactly what this ` +
        `gate exists to refuse serving. Remedy: ${remedy(project)}\n`,
    };
  }
  // Cheap sanity check, NOT a security boundary (a hand-written watermark file cannot be told
  // apart from a real one by anything in this file — see the TRUST LAW note at the top): catches
  // a watermark that describes an index that was never built at all, e.g. hand-planted in a
  // directory `ccc index` never touched. See hasIndexArtifacts().
  if (!(await hasIndexArtifacts(project))) {
    return {
      status: "stale",
      message:
        `RESULT: NO_INDEX route=${route} engine=ccc project=${project}; ` +
        `watermark at ${watermarkPath(project)} matches HEAD=${headLabel(currentHead)}, but no ccc ` +
        `index artifacts exist under ${join(project, ".cocoindex_code")}; a watermark describing ` +
        `an index that was never built is refused. Remedy: ${remedy(project)}\n`,
    };
  }
  return { status: "fresh", watermark: watermark.value };
}

function exactlyOneQuery(route: string, queries: string[]): string {
  if (queries.length !== 1 || queries[0].trim() === "") {
    throw new Error(`${route} requires exactly one non-empty --query`);
  }
  return queries[0];
}

async function runChild(command: string[], timeoutMs: number): Promise<number> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
    signal,
    killSignal: "SIGTERM",
  });
  const exitCode = await child.exited;
  if (signal.aborted) {
    process.stderr.write(
      `FATAL: search child timed out after ${timeoutMs}ms: ${command[0]}\n`,
    );
    return 124;
  }
  return exitCode;
}

async function runChildCaptured(
  command: string[],
  timeoutMs: number,
  relay = true,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGTERM",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (relay && stdout !== "") process.stdout.write(stdout);
  if (relay && stderr !== "") process.stderr.write(stderr);
  if (signal.aborted) {
    process.stderr.write(
      `FATAL: search child timed out after ${timeoutMs}ms: ${command[0]}\n`,
    );
    return { exitCode: 124, stdout, stderr };
  }
  return { exitCode, stdout, stderr };
}

function cccResultCount(stdout: string): number {
  return stdout.match(/^--- Result \d+ \(/gm)?.length ?? 0;
}

function rgFlags(values: {
  glob?: string[];
  ignoreCase?: boolean;
  hidden?: boolean;
  context?: number;
  filesWithMatches?: boolean;
  count?: boolean;
  limit?: number;
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
  const confidence =
    `confidence=verified(index) indexedAt=${freshness.watermark.indexedAt} ` +
    `head=${headLabel(freshness.watermark.head)}`;

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
  let matchedQueries = 0;

  for (const [index, query] of queries.entries()) {
    const command = [ccc, "search", query, "--limit", String(limit)];
    if (path !== undefined) command.push("--path", path);
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
  route: "literal" | "exhaustive" | "files",
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
 */
function lexicalMissLine(
  route: "literal" | "exhaustive" | "files",
  query: string | undefined,
): string {
  const head = `RESULT: NO_MATCH route=${route} engine=rg`;
  if (route === "files") {
    return `${head}; glob に一致する path が無い(内容は見ていない)\n`;
  }
  return (
    `${head}; **語彙で外しただけであって、不在の証明ではない。**` +
    `この repo の記録は同じ事柄を別の語で書く(日本語/英語、略号/正式名)。\n` +
    `  不在を主張する前に: repo-search battery --queries "<3本以上の言い換え>"` +
    (query === undefined
      ? ""
      : `\n  意味で引き直す: repo-search concept --query ${JSON.stringify(query)}`) +
    `\n  **意味検索の応答は不在を否定も肯定もしない**——件数は常に上限まで返り、` +
    `score は在る/無いを分離しない(実測 2026-09-02)。読むのは中身であって件数ではない。\n`
  );
}

type SearchFlags = {
  query?: string[];
  path?: string[];
  glob?: string[];
  limit?: number;
  timeoutMs?: number;
  refresh?: boolean;
  ignoreCase?: boolean;
  hidden?: boolean;
  context?: number;
  filesWithMatches?: boolean;
  count?: boolean;
};

function queryFlag() {
  return {
    query: { type: [nonEmptyString("query")], alias: "q", default: () => [] },
  };
}

function pathFlag() {
  return {
    path: { type: [nonEmptyString("path")], alias: "p", default: () => [] },
  };
}

function globFlag() {
  return {
    glob: { type: [nonEmptyString("glob")], alias: "g", default: () => [] },
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
      if (paths.length > 1) {
        throw new Error(`${rawRoute} accepts at most one --path glob`);
      }
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
      if (paths.length > 1) {
        throw new Error("structural accepts at most one --path glob");
      }
      const ccc = requireExecutable("ccc");
      const command = [ccc, "grep", query];
      if (paths[0] !== undefined) command.push("--path", paths[0]);
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
  const flags =
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
          ? { ...pathFlag(), ...globFlag(), ...timeoutFlag(), hidden: Boolean }
          : route === "structural"
            ? { ...queryFlag(), ...pathFlag(), ...timeoutFlag() }
            : { ...queryFlag(), ...timeoutFlag() };
  return command(
    {
      name: route,
      parameters: [],
      flags,
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

// Companion to the freshness gate, not a search route: writes .cocoindex_code/INDEXED_AT. This is
// now the ONLY thing that writes that file. A plain `ccc index` run by hand (bypassing this
// wrapper entirely) still leaves the watermark stale or missing -- there is deliberately no
// separate, faster, no-reindex path to recover it (that path used to be `stamp`; it asserted
// freshness without ever observing an indexer run, and was deleted because that assertion could
// not be verified -- see the file header). The only way to make the watermark fresh again is to
// run `repo-search index`, which reindexes AND records the result in one step.
async function runIndexWrapper(timeoutMs: number): Promise<number> {
  const project = findRegisteredProject(process.cwd());
  if (!project) {
    throw new Error(
      `index requested, but ${process.cwd()} is not ccc-registered`,
    );
  }
  const ccc = requireExecutable("ccc");

  // Read HEAD both before and after the (potentially long-running) `ccc index` child. If they
  // disagree, a structural git mutation (commit, checkout, rebase, branch switch) landed WHILE
  // the indexer was scanning: the resulting on-disk index is some unknown mixture of the tree at
  // headBefore and the tree at headAfter, and certifying it against EITHER HEAD would be a lie.
  // This is the race the audit named: "a structural git mutation landing DURING an in-flight
  // `ccc index` produces a watermark certifying a tree state that was never atomically scanned."
  // Comparing before/after closes it for the one case this wrapper controls (a `ccc index` it
  // launched itself) -- it cannot detect a mutation racing some OTHER, concurrently-running
  // `ccc index` invoked by hand outside this tool. A hand-run `ccc index` never writes this
  // watermark at all (there is no longer any command that will write a watermark without itself
  // observing the indexing run), so that case surfaces as an ordinary missing/stale watermark on
  // the next search, not as a false certification.
  const headBefore = await gitHead(project);

  process.stderr.write(`ROUTE: index -> ccc index project=${project}\n`);
  const exitCode = await runChild([ccc, "index"], timeoutMs);
  if (exitCode !== 0) {
    process.stderr.write(
      `FATAL: ccc index failed (exit ${exitCode}); watermark left unchanged so the gate stays ` +
        "honest rather than reporting a failed reindex as fresh\n",
    );
    return exitCode;
  }

  const headAfter = await gitHead(project);
  if (headBefore !== headAfter) {
    process.stderr.write(
      `FATAL: HEAD moved during 'ccc index' (was ${headLabel(headBefore)}, now ` +
        `${headLabel(headAfter)}); a structural git mutation landed mid-scan, so the resulting ` +
        "index cannot be honestly certified against either HEAD. Watermark left unwritten -- " +
        "re-run 'repo-search index' now that the tree is stable\n",
    );
    return 2;
  }
  const head = headAfter; // === headBefore, confirmed stable across the whole run: safe to certify

  await writeWatermark(project, head, "index");
  if (head !== null && (await isWorkingTreeDirty(project))) {
    process.stderr.write(
      "NOTE: working tree has uncommitted changes; the index reflects those edits, but only " +
        `HEAD=${head} is recorded\n`,
    );
  }
  if (head === null) {
    process.stderr.write(
      `NOTE: ${project} is not inside a git repository (or has no commits); the watermark ` +
        "records that VERIFIED absence of a HEAD. concept/battery will now pass here for as " +
        "long as this project stays without a HEAD\n",
    );
  }
  process.stdout.write(
    `RESULT: INDEXED project=${project} head=${headLabel(head)} source=index ` +
      "confidence=verified(index)\n",
  );
  return 0;
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
      name: "repo-search",
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
        "Run 'repo-search --help' for usage.\n",
    );
    process.exitCode = 2;
  });
}
