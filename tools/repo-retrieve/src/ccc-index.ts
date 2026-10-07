// ccc index adapter for repo-retrieve: registration lookup, the freshness watermark
// (INDEXED_AT in ccc's DB dir — ccc-db-dir.ts), the NO_INDEX gate that concept/battery run
// before serving, and the `index` action that is the watermark's only writer. Moved verbatim out of
// repo-retrieve.ts on 2026-09-22 so routing and ccc index freshness each have one home; the
// router imports this module and nothing here knows about routes beyond the label it prints.
//
// INDEX FRESHNESS: `ccc status` exposes chunk/file counts but no watermark — it cannot tell you
// whether its own index matches the working tree (verified: `ccc status`/`ccc --help`, no
// indexed-at or commit field anywhere in the output). So concept/battery (the only routes that
// read the persisted vector index) compare a sidecar watermark (INDEXED_AT beside the DB,
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

import { readdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { err, fromAsyncThrowable, ok, type Result } from "neverthrow";
import { resolveDbDir } from "./ccc-db-dir.ts";
import { inScopeChanges, type ScopeDrift } from "./ccc-scope.ts";
import { requireExecutable, runChild, runChildCaptured } from "./child.ts";

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

export function findRegisteredProject(start: string): string | null {
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

export function headLabel(head: string | null): string {
  return head ?? "(none — not a git repo, or no commits yet)";
}

// --- Verbatim citation token ------------------------------------------------------------------
//
// A claim about "no hits" is a claim about a SEARCHED STATE, not about HEAD-right-now -- HEAD
// moves every few minutes in a multi-writer repo, so any claim phrased in terms of it is stale
// before the sentence finishes. `indexedAt` alone does not fix this: a timestamp names WHEN
// something was checked, never WHAT was checked -- it cannot be verified against anything later
// (there is no `git cat-file -t <timestamp>`). A commit can be: `git cat-file -t <head>` (or
// `git show <head>`) still answers the same question next week, next month, after HEAD has moved
// a hundred commits on. So the citable unit is the pair (indexedAt, head) the watermark already
// carries, not either half alone.
//
// Shape is deliberately aligned with the sibling fleet's existing `--hit NO_INDEX:<timestamp+
// watermark>` string (agents/skills/commanding-research-fleets/SKILL.md row 7 and
// references/launch-and-order.md #7): that row already ships a bare, non-validated string after
// `NO_INDEX:` (per its own stated gap: "the validator accepts any non-empty string ... it does
// not itself confirm the string is actually a timestamp and a watermark"), so whatever shape this
// side adopts becomes the de facto contract the sibling side follows -- this function is where
// that shape gets DEFINED, once, rather than re-invented ad hoc at each call site. Rendered as
// `<indexedAt>+<head>`, `+`-joined to match the sibling string literally, with `head` spelled
// "none" (not the prose-y headLabel() form, which has spaces/parens and would break a token
// meant to be pasted verbatim into `--hit ...:<here>`) for the real, watermark-recorded case of
// "this project had no git HEAD when it was indexed" (see the Watermark.head doc comment above).
export function citationToken(
  watermark: Pick<Watermark, "indexedAt" | "head">,
): string {
  return `${watermark.indexedAt}+${watermark.head ?? "none"}`;
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

const WatermarkSchema = z.object({
  head: z.union([z.null(), z.string().regex(/^[0-9a-f]{40}$/iu)]),
  indexedAt: z.string(),
  source: z.enum(["index", "stamp"]),
});

const WATERMARK_BASENAME = "INDEXED_AT";
const INDEX_ATTEMPTS = 3;

// The watermark lives beside the DB it certifies — in ccc's DB dir, which is outside the repo
// whenever COCOINDEX_CODE_DB_PATH_MAPPING relocates it (see ccc-db-dir.ts).
function watermarkPath(project: string): Result<string, Error> {
  return resolveDbDir(project).map((directory) =>
    join(directory, WATERMARK_BASENAME),
  );
}

type WatermarkRead =
  | { kind: "ok"; value: Watermark }
  | { kind: "missing" }
  | { kind: "invalid" };

async function readWatermark(
  project: string,
): Promise<Result<WatermarkRead, Error>> {
  const path = watermarkPath(project);
  if (path.isErr()) return err(path.error);
  const file = Bun.file(path.value);
  if (!(await file.exists())) return ok({ kind: "missing" });
  const text = await fromAsyncThrowable(() => file.text(), asError)();
  if (text.isErr()) return ok({ kind: "invalid" });
  const value = jsonOf(WatermarkSchema).safeParse(text.value);
  return ok(
    value.success ? { kind: "ok", value: value.data } : { kind: "invalid" },
  );
}

async function writeWatermark(
  project: string,
  head: string | null,
  // Narrowed to the literal "index", not the full Watermark["source"] union: this is now the
  // ONLY writer of a watermark, and "stamp" must never be producible again by any code path in
  // this file. Widening this parameter type is itself the signal that someone is trying to
  // reintroduce the deleted command's write path.
  source: "index",
): Promise<Result<void, Error>> {
  const value: Watermark = {
    head,
    indexedAt: Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
    source,
  };
  const path = watermarkPath(project);
  if (path.isErr()) return err(path.error);
  const tmp = `${path.value}.tmp-${process.pid}`;
  return fromAsyncThrowable(async () => {
    await Bun.write(tmp, `${JSON.stringify(value, null, 2)}\n`);
    await rename(tmp, path.value); // same directory -> atomic on a POSIX filesystem
  }, asError)();
}

const SETTINGS_BASENAME = "settings.yml";

// Cheap sanity check, explicitly NOT a security boundary (see the TRUST LAW note at the top of
// this file): does the project's DB dir contain anything besides settings.yml and our own
// watermark file? A watermark's on-disk bytes can always be hand-written by anyone with
// filesystem access, so this cannot stop a determined spoof -- it only catches the specific,
// unintentional defect a verifier reproduced live: a watermark that matches currentHead sitting
// in a directory `ccc index` never actually touched, describing an index that does not exist.
//
// Only TOP-LEVEL files count, plus the contents of ccc's `cocoindex.db/` directory. Under a DB
// path mapping, a nested project's DB dir sits inside this one (ccc-db-dir.ts), and a recursive
// walk would count that project's artifacts as this project's.
async function hasIndexArtifacts(
  project: string,
): Promise<Result<boolean, Error>> {
  const resolved = resolveDbDir(project);
  if (resolved.isErr()) return err(resolved.error);
  const dir = resolved.value;
  // Wrapped in a plain (non-overloaded) local function so `ReturnType<typeof list>` resolves to
  // the type these exact arguments (default utf8 encoding, withFileTypes: true) actually select
  // -- Dirent<string>[]. `Awaited<ReturnType<typeof readdir>>` directly does not: readdir's LAST
  // overload signature returns Dirent<Buffer>[], and ReturnType on an overloaded function always
  // picks that last signature, never the one these arguments select.
  const list = () => readdir(dir, { recursive: true, withFileTypes: true });
  const listed = await fromAsyncThrowable(list, asError)();
  if (listed.isErr()) return ok(false);
  const entries = listed.value;
  const cccStore = join(dir, "cocoindex.db");
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parent = resolve(entry.parentPath);
    if (parent !== resolve(dir) && !`${parent}/`.startsWith(`${cccStore}/`))
      continue;
    if (entry.name === SETTINGS_BASENAME) continue; // hand-authored by `ccc init`, not indexing
    if (
      entry.name === WATERMARK_BASENAME ||
      entry.name.startsWith(`${WATERMARK_BASENAME}.tmp-`)
    ) {
      continue; // our own watermark, not a ccc-owned artifact
    }
    return ok(true);
  }
  return ok(false);
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
// any unindexed project gets: NO_INDEX (exit 3), never a silent pass. One `repo-retrieve index`
// closes that gap permanently, including for a project that never has and never will have a git
// HEAD.
async function gitHead(project: string): Promise<Result<string | null, Error>> {
  const git = requireExecutable("git");
  if (git.isErr()) return err(git.error);
  const child = await fromAsyncThrowable(
    () =>
      runChildCaptured(
        [git.value, "-C", project, "rev-parse", "HEAD"],
        10_000,
        false,
      ),
    asError,
  )();
  return child.map((result) =>
    result.exitCode === 0 ? result.stdout.trim() : null,
  );
}

async function isWorkingTreeDirty(
  project: string,
): Promise<Result<boolean, Error>> {
  const git = requireExecutable("git");
  if (git.isErr()) return err(git.error);
  const child = await fromAsyncThrowable(
    () =>
      runChildCaptured(
        [git.value, "-C", project, "status", "--porcelain"],
        10_000,
        false,
      ),
    asError,
  )();
  return child.map(
    (result) => result.exitCode === 0 && result.stdout.trim() !== "",
  );
}

const AUTO_INDEX_MS = 120_000;

// The search routes' catch-up: re-index a project whose index exists but trails HEAD. Skipped when
// disabled, when there is no index to update incrementally, or when the one shared daemon is
// already indexing — a search would then wait out the whole bound behind another project.
async function autoCatchUp(
  project: string,
): Promise<Result<{ ok: boolean; why: string }, Error>> {
  if (process.env.REPO_RETRIEVE_AUTO_INDEX === "0") {
    return ok({
      ok: false,
      why: "Automatic catch-up is disabled (REPO_RETRIEVE_AUTO_INDEX=0).",
    });
  }
  const artifacts = await hasIndexArtifacts(project);
  if (artifacts.isErr()) return err(artifacts.error);
  if (!artifacts.value)
    return ok({ ok: false, why: "No index exists to catch up incrementally." });
  const ccc = requireExecutable("ccc");
  if (ccc.isErr()) return err(ccc.error);
  const statusResult = await fromAsyncThrowable(
    () =>
      runChildCaptured([ccc.value, "daemon", "status"], 10_000, false, project),
    asError,
  )();
  if (statusResult.isErr()) return err(statusResult.error);
  const status = statusResult.value;
  const busy = status.stdout
    .split("\n")
    .filter((line) => line.includes("[indexing]"))
    .map((line) => line.replace("[indexing]", "").trim());
  if (busy.length > 0) {
    return ok({
      ok: false,
      why: `Automatic catch-up skipped: the ccc daemon is indexing ${busy.join(", ")}.`,
    });
  }
  const started = Temporal.Now.instant().epochMilliseconds;
  process.stderr.write(
    `NOTE: index trails HEAD; catching up (bounded ${AUTO_INDEX_MS / 1000}s)\n`,
  );
  const runResult = await reindexCertified(
    project,
    ccc.value,
    AUTO_INDEX_MS,
    true,
  );
  if (runResult.isErr()) return err(runResult.error);
  const run = runResult.value;
  const seconds = (
    (Temporal.Now.instant().epochMilliseconds - started) /
    1000
  ).toFixed(1);
  if (run.code === 0) {
    process.stderr.write(
      `NOTE: caught up in ${seconds}s; index certified at HEAD=${headLabel(run.head)}\n`,
    );
    return ok({ ok: true, why: "" });
  }
  return ok({
    ok: false,
    why: `Automatic catch-up did not certify the index (exit ${run.code} after ${seconds}s).`,
  });
}

function scopeLine(drift: ScopeDrift | null): string {
  if (drift === null) return "";
  const shown = drift.inScope.slice(0, 5).join(", ");
  const more = drift.inScope.length > 5 ? ", …" : "";
  return (
    `${drift.inScope.length} of ${drift.changed} path(s) changed since are in index scope ` +
    `(${shown}${more}). `
  );
}

function remedy(project: string): string {
  return `run 'repo-retrieve index' in ${project} to build a fresh, verified watermark`;
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
// would avoid, so staleness recovery instead runs through `repo-retrieve index` -- an actual
// reindex, observed to succeed -- rather than a guess or a self-asserted claim.
export async function checkIndexFreshness(
  project: string,
  route: string,
  allowCatchUp = true,
): Promise<Result<Freshness, Error>> {
  const watermarkFile = watermarkPath(project);
  if (watermarkFile.isErr()) return err(watermarkFile.error);
  const headResult = await gitHead(project);
  if (headResult.isErr()) return err(headResult.error);
  const currentHead = headResult.value;
  const watermarkResult = await readWatermark(project);
  if (watermarkResult.isErr()) return err(watermarkResult.error);
  const watermark = watermarkResult.value;

  if (watermark.kind === "missing") {
    return ok({
      status: "stale",
      message:
        `RESULT: NO_INDEX route=${route} engine=ccc project=${project}; ` +
        `no freshness watermark at ${watermarkFile.value}; current HEAD=${headLabel(currentHead)}; ` +
        `an unindexed project is treated as stale, never as fresh. Remedy: ${remedy(project)}\n`,
    });
  }
  if (watermark.kind === "invalid") {
    return ok({
      status: "stale",
      message:
        `RESULT: NO_INDEX route=${route} engine=ccc project=${project}; ` +
        `watermark at ${watermarkFile.value} is unreadable/corrupt; current HEAD=${headLabel(currentHead)}; ` +
        `Remedy: ${remedy(project)}\n`,
    });
  }
  // A watermark written by the deleted `stamp` subcommand is a self-asserted claim that was never
  // backed by an observed reindex -- it is refused outright, on sight, regardless of whether its
  // recorded HEAD happens to match currentHead. It is never silently upgraded to "index" just
  // because its shape now parses the same way. See the Watermark.source comment for why this
  // legacy value is still accepted as syntactically valid instead of falling into "invalid" above.
  if (watermark.value.source === "stamp") {
    return ok({
      status: "stale",
      message:
        `RESULT: NO_INDEX route=${route} engine=ccc project=${project}; ` +
        `watermark at ${watermarkFile.value} has source="stamp", written by the deleted ` +
        `'stamp' subcommand, which asserted freshness without ever running an indexer; such a ` +
        `watermark is never trusted, regardless of whether its recorded HEAD still matches. ` +
        `Remedy: ${remedy(project)}\n`,
    });
  }
  // A HEAD mismatch is stale only if something the index covers changed. When every path
  // changed since the watermark is outside ccc's scope (its own matcher decides — ccc-scope.ts),
  // a re-index at currentHead would reproduce this index exactly, so it is served as current.
  // This is not "serving stale with a warning": the index IS current. When the scope cannot be
  // decided, or any in-scope path changed, the refusal below stands (owner ruling 2026-09-25:
  // never serve stale results).
  let drift: ScopeDrift | null = null;
  if (
    watermark.value.head !== currentHead &&
    watermark.value.head !== null &&
    currentHead !== null
  ) {
    const ccc = requireExecutable("ccc");
    if (ccc.isErr()) return err(ccc.error);
    drift = await inScopeChanges(
      project,
      ccc.value,
      watermark.value.head,
      currentHead,
    );
  }
  if (drift !== null && drift.inScope.length === 0) {
    process.stderr.write(
      `NOTE: index built at HEAD=${headLabel(watermark.value.head)}; HEAD is now ` +
        `${headLabel(currentHead)}, but all ${drift.changed} path(s) changed since are outside ` +
        "the index scope (ccc's own matcher), so the index is current\n",
    );
  } else if (watermark.value.head !== currentHead) {
    // Behind through in-scope (or undecidable) changes. Catch up instead of refusing: a bounded,
    // incremental re-index, then the same gate again — never a stale answer (owner ruling
    // 2026-09-25). firedancer commits ~43 times an hour; the post-commit re-index skips whenever
    // the shared daemon is busy and never retries, so searches there answered NO_INDEX for
    // stretches, and a pipeline filtering for hits read that as "no hits" (2026-09-25).
    const catchUpResult = allowCatchUp ? await autoCatchUp(project) : null;
    let catchUpError: Error | undefined;
    const catchUp =
      catchUpResult?.match(
        (value) => value,
        (error) => {
          catchUpError = error;
          return null;
        },
      ) ?? null;
    if (catchUpError !== undefined) return err(catchUpError);
    if (catchUp?.ok === true) return checkIndexFreshness(project, route, false);
    return ok({
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
        `gate exists to refuse serving. cite=${citationToken(watermark.value)} names the index's own ` +
        `(now-superseded) state for a citation such as --hit NO_INDEX:${citationToken(watermark.value)}. ` +
        scopeLine(drift) +
        (catchUp === null ? "" : `${catchUp.why} `) +
        `Remedy: ${remedy(project)}\n`,
    });
  }
  // Cheap sanity check, NOT a security boundary (a hand-written watermark file cannot be told
  // apart from a real one by anything in this file — see the TRUST LAW note at the top): catches
  // a watermark that describes an index that was never built at all, e.g. hand-planted in a
  // directory `ccc index` never touched. See hasIndexArtifacts().
  const artifacts = await hasIndexArtifacts(project);
  if (artifacts.isErr()) return err(artifacts.error);
  if (!artifacts.value) {
    return ok({
      status: "stale",
      message:
        `RESULT: NO_INDEX route=${route} engine=ccc project=${project}; ` +
        `watermark at ${watermarkFile.value} matches HEAD=${headLabel(currentHead)}, but no ccc ` +
        `index artifacts exist under ${dirname(watermarkFile.value)}; a watermark describing ` +
        `an index that was never built is refused. Remedy: ${remedy(project)}\n`,
    });
  }
  return ok({ status: "fresh", watermark: watermark.value });
}

// The index run itself: `ccc index`, HEAD stability (retrying through in-scope drift), the
// artifact check, and the watermark write. Shared by `repo-retrieve index` and by the search
// routes' automatic catch-up (checkIndexFreshness), which sends ccc's own output to stderr so a
// search's stdout carries only results. Logs go to stderr; the caller prints any RESULT line.
async function reindexCertified(
  project: string,
  ccc: string,
  timeoutMs: number,
  childToStderr: boolean,
): Promise<Result<{ code: number; head: string | null }, Error>> {
  let head: string | null = null;
  let certified = false;
  for (
    let indexAttempt = 1;
    indexAttempt <= INDEX_ATTEMPTS && !certified;
    indexAttempt++
  ) {
    const headBeforeResult = await gitHead(project);
    if (headBeforeResult.isErr()) return err(headBeforeResult.error);
    const headBefore = headBeforeResult.value;

    process.stderr.write(`ROUTE: index -> ccc index project=${project}\n`);
    const child = await fromAsyncThrowable(
      () =>
        childToStderr
          ? runChildToStderr([ccc, "index"], timeoutMs, project)
          : runChild([ccc, "index"], timeoutMs, project),
      asError,
    )();
    if (child.isErr()) return err(child.error);
    const exitCode = child.value;
    if (exitCode !== 0) {
      process.stderr.write(
        `FATAL: ccc index failed (exit ${exitCode}); watermark left unchanged so the gate stays ` +
          "honest rather than reporting a failed reindex as fresh\n",
      );
      return ok({ code: exitCode, head: null });
    }

    const headAfterResult = await gitHead(project);
    if (headAfterResult.isErr()) return err(headAfterResult.error);
    const headAfter = headAfterResult.value;
    head = headAfter;
    if (headBefore === headAfter) {
      certified = true; // confirmed stable across the whole run: safe to certify
      break;
    }
    const scopeResult = await scopeDrift(project, ccc, headBefore, headAfter);
    if (scopeResult.isErr()) return err(scopeResult.error);
    const drift = scopeResult.value;
    if (drift !== null && drift.inScope.length === 0) {
      process.stderr.write(
        `NOTE: HEAD moved during 'ccc index' (${headLabel(headBefore)} -> ${headLabel(headAfter)}), ` +
          `but all ${drift.changed} changed path(s) are outside the index scope; certifying ` +
          `HEAD=${headLabel(headAfter)}\n`,
      );
      certified = true;
      break;
    }
    process.stderr.write(
      `NOTE: HEAD moved during 'ccc index' (${headLabel(headBefore)} -> ${headLabel(headAfter)})` +
        (drift === null
          ? "; index scope could not be decided"
          : `; ${drift.inScope.length} in-scope path(s) changed`) +
        ` — attempt ${indexAttempt}/${INDEX_ATTEMPTS}\n`,
    );
  }
  if (!certified) {
    process.stderr.write(
      `FATAL: HEAD moved during 'ccc index' on all ${INDEX_ATTEMPTS} attempts through in-scope ` +
        "(or undecidable) changes, so no scan can be honestly certified against a single HEAD. " +
        "Watermark left unwritten -- re-run 'repo-retrieve index' once commits to indexed paths " +
        "pause\n",
    );
    return ok({ code: 2, head: null });
  }

  // The daemon wrote the index wherever ITS COCOINDEX_CODE_DB_PATH_MAPPING points; this process
  // resolves the DB dir from its own. If the two disagree (a daemon started before the mapping
  // was set, a shell that never read zsh/zshenv), the index exists and this process cannot see
  // it — certifying it here would put the watermark beside no DB. Refuse, and name the fix.
  const artifacts = await hasIndexArtifacts(project);
  if (artifacts.isErr()) return err(artifacts.error);
  if (!artifacts.value) {
    const dbDir = resolveDbDir(project);
    if (dbDir.isErr()) return err(dbDir.error);
    process.stderr.write(
      `FATAL: 'ccc index' succeeded but no index artifacts exist under ${dbDir.value}; ` +
        "the daemon and this process resolve different DB dirs. Compare the 'DB path mappings' " +
        `line of 'ccc doctor' with this process's COCOINDEX_CODE_DB_PATH_MAPPING ` +
        `(${process.env.COCOINDEX_CODE_DB_PATH_MAPPING ?? "unset"}). Watermark left unwritten\n`,
    );
    return ok({ code: 2, head: null });
  }

  const watermarkWrite = await writeWatermark(project, head, "index");
  if (watermarkWrite.isErr()) return err(watermarkWrite.error);
  return ok({ code: 0, head });
}

async function scopeDrift(
  project: string,
  ccc: string,
  before: string | null,
  after: string | null,
): Promise<Result<ScopeDrift | null, Error>> {
  if (before === null || after === null) return ok(null);
  return fromAsyncThrowable(
    () => inScopeChanges(project, ccc, before, after),
    asError,
  )();
}

async function runChildToStderr(
  command: string[],
  timeoutMs: number,
  cwd: string,
): Promise<number> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn({
    cmd: command,
    cwd,
    env: process.env,
    stdout: "pipe",
    stderr: "inherit",
    signal,
    killSignal: "SIGTERM",
  });
  const relay = (async () => {
    for await (const chunk of child.stdout) process.stderr.write(chunk);
  })();
  const [exitCode] = await Promise.all([child.exited, relay]);
  if (signal.aborted) {
    process.stderr.write(
      `NOTE: ccc index still running after ${timeoutMs}ms; left to the daemon\n`,
    );
    return 124;
  }
  return exitCode;
}

// Companion to the freshness gate, not a search route: writes INDEXED_AT (ccc's DB dir). This is
// now the ONLY thing that writes that file. A plain `ccc index` run by hand (bypassing this
// wrapper entirely) still leaves the watermark stale or missing -- there is deliberately no
// separate, faster, no-reindex path to recover it (that path used to be `stamp`; it asserted
// freshness without ever observing an indexer run, and was deleted because that assertion could
// not be verified -- see the file header). The only way to make the watermark fresh again is to
// run `repo-retrieve index`, which reindexes AND records the result in one step.
export async function runIndexWrapper(
  timeoutMs: number,
): Promise<Result<number, Error>> {
  const project = findRegisteredProject(process.cwd());
  if (project === undefined || project === null || project === "") {
    return err(
      new Error(`index requested, but ${process.cwd()} is not ccc-registered`),
    );
  }
  const ccc = requireExecutable("ccc");
  if (ccc.isErr()) return err(ccc.error);

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
  //
  // A HEAD that moved mid-scan is not always a mixed tree: when every path the intervening
  // commits touched is outside the index scope (ccc-scope.ts), the index is exactly what a scan
  // at headAfter would build, so headAfter is certified. Otherwise the scan is re-run — ccc
  // indexes incrementally, so a repeat costs only what changed — up to INDEX_ATTEMPTS times
  // (firedancer 2026-09-25: ten agents committing every 1–2 min; a human needed three tries).
  const certifiedResult = await reindexCertified(
    project,
    ccc.value,
    timeoutMs,
    false,
  );
  if (certifiedResult.isErr()) return err(certifiedResult.error);
  const certifiedRun = certifiedResult.value;
  if (certifiedRun.code !== 0) return ok(certifiedRun.code);
  const head = certifiedRun.head;
  const dirty = await isWorkingTreeDirty(project);
  if (dirty.isErr()) return err(dirty.error);
  if (head !== null && dirty.value) {
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
  return ok(0);
}
