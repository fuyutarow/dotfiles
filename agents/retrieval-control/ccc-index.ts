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
import { resolveDbDir } from "./ccc-db-dir.ts";
import { requireExecutable, runChild, runChildCaptured } from "./child.ts";

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

const WATERMARK_BASENAME = "INDEXED_AT";

// The watermark lives beside the DB it certifies — in ccc's DB dir, which is outside the repo
// whenever COCOINDEX_CODE_DB_PATH_MAPPING relocates it (see ccc-db-dir.ts).
function watermarkPath(project: string): string {
  return join(resolveDbDir(project), WATERMARK_BASENAME);
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
// this file): does the project's DB dir contain anything besides settings.yml and our own
// watermark file? A watermark's on-disk bytes can always be hand-written by anyone with
// filesystem access, so this cannot stop a determined spoof -- it only catches the specific,
// unintentional defect a verifier reproduced live: a watermark that matches currentHead sitting
// in a directory `ccc index` never actually touched, describing an index that does not exist.
//
// Only TOP-LEVEL files count, plus the contents of ccc's `cocoindex.db/` directory. Under a DB
// path mapping, a nested project's DB dir sits inside this one (ccc-db-dir.ts), and a recursive
// walk would count that project's artifacts as this project's.
async function hasIndexArtifacts(project: string): Promise<boolean> {
  const dir = resolveDbDir(project);
  // Wrapped in a plain (non-overloaded) local function so `ReturnType<typeof list>` resolves to
  // the type these exact arguments (default utf8 encoding, withFileTypes: true) actually select
  // -- Dirent<string>[]. `Awaited<ReturnType<typeof readdir>>` directly does not: readdir's LAST
  // overload signature returns Dirent<Buffer>[], and ReturnType on an overloaded function always
  // picks that last signature, never the one these arguments select.
  const list = () => readdir(dir, { recursive: true, withFileTypes: true });
  let entries: Awaited<ReturnType<typeof list>>;
  try {
    entries = await list();
  } catch {
    return false;
  }
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
// any unindexed project gets: NO_INDEX (exit 3), never a silent pass. One `repo-retrieve index`
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
        `gate exists to refuse serving. cite=${citationToken(watermark.value)} names the index's own ` +
        `(now-superseded) state for a citation such as --hit NO_INDEX:${citationToken(watermark.value)}. ` +
        `Remedy: ${remedy(project)}\n`,
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
        `index artifacts exist under ${resolveDbDir(project)}; a watermark describing ` +
        `an index that was never built is refused. Remedy: ${remedy(project)}\n`,
    };
  }
  return { status: "fresh", watermark: watermark.value };
}

// Companion to the freshness gate, not a search route: writes INDEXED_AT (ccc's DB dir). This is
// now the ONLY thing that writes that file. A plain `ccc index` run by hand (bypassing this
// wrapper entirely) still leaves the watermark stale or missing -- there is deliberately no
// separate, faster, no-reindex path to recover it (that path used to be `stamp`; it asserted
// freshness without ever observing an indexer run, and was deleted because that assertion could
// not be verified -- see the file header). The only way to make the watermark fresh again is to
// run `repo-retrieve index`, which reindexes AND records the result in one step.
export async function runIndexWrapper(timeoutMs: number): Promise<number> {
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
        "re-run 'repo-retrieve index' now that the tree is stable\n",
    );
    return 2;
  }
  const head = headAfter; // === headBefore, confirmed stable across the whole run: safe to certify

  // The daemon wrote the index wherever ITS COCOINDEX_CODE_DB_PATH_MAPPING points; this process
  // resolves the DB dir from its own. If the two disagree (a daemon started before the mapping
  // was set, a shell that never read zsh/zshenv), the index exists and this process cannot see
  // it — certifying it here would put the watermark beside no DB. Refuse, and name the fix.
  if (!(await hasIndexArtifacts(project))) {
    process.stderr.write(
      `FATAL: 'ccc index' succeeded but no index artifacts exist under ${resolveDbDir(project)}; ` +
        "the daemon and this process resolve different DB dirs. Compare the 'DB path mappings' " +
        `line of 'ccc doctor' with this process's COCOINDEX_CODE_DB_PATH_MAPPING ` +
        `(${process.env.COCOINDEX_CODE_DB_PATH_MAPPING ?? "unset"}). Watermark left unwritten\n`,
    );
    return 2;
  }

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
