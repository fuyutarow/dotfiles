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

import {
  mkdir,
  open,
  readdir,
  rename,
  stat as statFile,
  unlink,
  writeFile,
} from "node:fs/promises";
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonOf, z } from "../../shared/src/zod.ts";
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "neverthrow";
import { resolveDbDir } from "./ccc-db-dir.ts";
import { cccBackend } from "./ccc-entry.ts";
import { hostLoad, processedWork, recordIndexRate } from "./index-rate.ts";
import { inScopeChanges, type ScopeDrift } from "./ccc-scope.ts";
import { requireExecutable, runChildCaptured } from "./child.ts";
import {
  computeIndexPlan,
  planReport,
  writePlanJsonl,
  type IndexPlan,
} from "./index-plan.ts";

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

export type RegisteredProject = {
  project: string;
  workspace: string | null;
};

function jjBackingRepo(current: string): string | null | undefined {
  const marker = join(current, ".jj", "repo");
  const info = fromThrowable(() => lstatSync(marker))();
  if (info.isErr() || !info.value.isFile()) return undefined;
  const target = fromThrowable(() =>
    realpathSync(
      resolve(join(current, ".jj"), readFileSync(marker, "utf8").trim()),
    ),
  )();
  return target.isErr() ? null : dirname(dirname(target.value));
}

export function resolveRegisteredProject(
  start: string,
): RegisteredProject | null {
  let current = resolve(start);
  while (true) {
    const backingRepo = jjBackingRepo(current);
    if (backingRepo === null) return null;
    if (backingRepo !== undefined) {
      const project = findRegisteredProject(backingRepo);
      return project === null ? null : { project, workspace: current };
    }
    if (existsSync(join(current, ".cocoindex_code", "settings.yml"))) {
      return { project: current, workspace: null };
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function findRegisteredProject(start: string): string | null {
  return resolveRegisteredProject(start)?.project ?? null;
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
const INDEX_REQUEST_BASENAME = "INDEX_REQUEST.json";
const AUTO_REINDEX_STAMP_BASENAME = "AUTO_REINDEX_AT";
const AUTO_REINDEX_LOCK_BASENAME = "AUTO_REINDEX.lock";
const INDEX_ATTEMPTS = 3;
const INDEX_POLL_MS = 1_000;
const INDEX_STALL_MS = 600_000;
const AUTO_REINDEX_WINDOW_MS = 120_000;
const DEFAULT_MAX_STALE_COMMITS = 200;
const DEFAULT_MAX_STALE_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const ErrnoCodeSchema = z.object({ code: z.string() });

function errnoCode(error: unknown): string | null {
  const parsed = ErrnoCodeSchema.safeParse(error);
  return parsed.success ? parsed.data.code : null;
}

async function acquireAutoReindexLock(
  path: string,
): Promise<Result<Awaited<ReturnType<typeof open>> | null, Error>> {
  const create = () => fromAsyncThrowable(() => open(path, "wx"), asError)();
  const first = await create();
  if (first.isOk()) return ok(first.value);
  if (errnoCode(first.error) !== "EEXIST") return err(first.error);

  const info = await fromAsyncThrowable(() => statFile(path), asError)();
  if (info.isErr() && errnoCode(info.error) !== "ENOENT")
    return err(info.error);
  if (
    info.isOk() &&
    Temporal.Now.instant().epochMilliseconds - info.value.mtimeMs <
      AUTO_REINDEX_WINDOW_MS
  )
    return ok(null);

  const removed = await fromAsyncThrowable(() => unlink(path), asError)();
  if (removed.isErr() && errnoCode(removed.error) !== "ENOENT")
    return err(removed.error);
  const retry = await create();
  return retry.match(
    (file) => ok(file),
    (error) => (errnoCode(error) === "EEXIST" ? ok(null) : err(error)),
  );
}

export async function requestAutoReindex(
  project: string,
): Promise<Result<{ started: boolean; pid?: number }, Error>> {
  const directory = resolveDbDir(project);
  if (directory.isErr()) return err(directory.error);
  const created = await fromAsyncThrowable(
    () => mkdir(directory.value, { recursive: true }),
    asError,
  )();
  if (created.isErr()) return err(created.error);
  const lockPath = join(directory.value, AUTO_REINDEX_LOCK_BASENAME);
  const stampPath = join(directory.value, AUTO_REINDEX_STAMP_BASENAME);
  const acquired = await acquireAutoReindexLock(lockPath);
  if (acquired.isErr()) return err(acquired.error);
  if (acquired.value === null) return ok({ started: false });
  const lockFile = acquired.value;

  const run = async (): Promise<
    Result<{ started: boolean; pid?: number }, Error>
  > => {
    const previous = await fromAsyncThrowable(
      async () => Number((await Bun.file(stampPath).text()).trim()),
      asError,
    )();
    if (
      previous.isOk() &&
      Number.isFinite(previous.value) &&
      Temporal.Now.instant().epochMilliseconds - previous.value <
        AUTO_REINDEX_WINDOW_MS
    )
      return ok({ started: false });
    if (previous.isErr() && errnoCode(previous.error) !== "ENOENT")
      return err(previous.error);

    const now = Temporal.Now.instant().epochMilliseconds;
    const stamped = await fromAsyncThrowable(
      () => writeFile(stampPath, `${now}\n`),
      asError,
    )();
    if (stamped.isErr()) return err(stamped.error);
    const child = fromThrowable(
      () =>
        // bounded: the detached worker's index command uses INDEX_STALL_MS.
        Bun.spawn(
          [
            process.execPath,
            fileURLToPath(new URL("./repo-retrieve.ts", import.meta.url)),
            "index",
            "--detach",
          ],
          {
            cwd: project,
            env: process.env,
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
            detached: true,
          },
        ),
      asError,
    )();
    if (child.isErr()) {
      await fromAsyncThrowable(() => unlink(stampPath), asError)();
      return err(child.error);
    }
    child.value.unref();
    return ok({ started: true, pid: child.value.pid });
  };
  const result = await run();
  await fromAsyncThrowable(() => lockFile.close(), asError)();
  await fromAsyncThrowable(() => unlink(lockPath), asError)();
  return result;
}

export type IndexProgressSource = {
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  sample: () => Promise<string>;
  overBudget?: () => boolean;
};

type IndexWaitResult = {
  exitCode: number;
  origin: "ccc" | "budget" | "stall";
};

export async function waitForIndexChild(
  childExit: Promise<number>,
  stallMs: number,
  source: IndexProgressSource,
): Promise<IndexWaitResult> {
  let lastProgress = source.now();
  let settled = false;
  let exitCode = 0;
  void childExit.then((code) => {
    settled = true;
    exitCode = code;
  });
  let lastSample = await source.sample();
  if (!settled && source.overBudget?.() === true)
    return { exitCode: 125, origin: "budget" };
  for (;;) {
    if (settled) break;
    await source.sleep(INDEX_POLL_MS);
    if (settled) break;
    const sample = await source.sample();
    if (settled) break;
    if (source.overBudget?.() === true)
      return { exitCode: 125, origin: "budget" };
    if (sample !== lastSample) {
      lastSample = sample;
      lastProgress = source.now();
    }
    if (source.now() - lastProgress >= stallMs)
      return { exitCode: 124, origin: "stall" };
  }
  return { exitCode, origin: "ccc" };
}

async function indexProgressSample(
  project: string,
): Promise<{ signature: string; indexing: boolean; chunks?: number }> {
  const ccc = requireExecutable("ccc");
  if (ccc.isErr())
    return {
      signature: `ccc unavailable: ${ccc.error.message}`,
      indexing: false,
    };
  const [status, daemon] = await Promise.all([
    runChildCaptured([ccc.value, "status"], 10_000, false, project),
    runChildCaptured([ccc.value, "daemon", "status"], 10_000, false, project),
  ]);
  const statusLine = status.stdout
    .split("\n")
    .find((line) => line.includes("Indexing in progress:"));
  const daemonLine = daemon.stdout
    .split("\n")
    .find((line) => line.trimStart().startsWith(`${project} [`));
  return {
    signature: `${statusLine ?? status.stdout.trim()}\n${/\bChunks:\s*(\d+)/u.exec(status.stdout)?.[0] ?? ""}\n${daemonLine ?? daemon.stdout.trim()}`,
    ...(/\bChunks:\s*(\d+)/u.exec(status.stdout)?.[1] === undefined
      ? {}
      : { chunks: Number(/\bChunks:\s*(\d+)/u.exec(status.stdout)?.[1]) }),
    indexing:
      daemon.exitCode !== 0 ||
      daemonLine === undefined ||
      daemonLine.includes("[indexing]"),
  };
}

async function waitForProjectIdle(
  project: string,
  stallMs: number,
  timeBudget?: { plan: IndexPlan; startedAt: number },
): Promise<number> {
  let progressAt = Temporal.Now.instant().epochMilliseconds;
  let state = await indexProgressSample(project);
  while (state.indexing) {
    if (
      timeBudget !== undefined &&
      (Temporal.Now.instant().epochMilliseconds - timeBudget.startedAt) / 1000 >
        timeBudget.plan.budget.max_seconds
    ) {
      process.stderr.write(
        `FATAL: repo-retrieve elapsed time exceeds max_seconds=${timeBudget.plan.budget.max_seconds} while daemon is still indexing (exit 125); left the daemon running; watermark left unchanged\n${planReport(timeBudget.plan)}`,
      );
      return 125;
    }
    await Bun.sleep(INDEX_POLL_MS);
    const next = await indexProgressSample(project);
    if (next.signature !== state.signature) {
      state = next;
      progressAt = Temporal.Now.instant().epochMilliseconds;
      continue;
    }
    if (Temporal.Now.instant().epochMilliseconds - progressAt >= stallMs)
      return 124;
  }
  return 0;
}

// The watermark lives beside the DB it certifies — in ccc's DB dir, which is outside the repo
// whenever COCOINDEX_CODE_DB_PATH_MAPPING relocates it (see ccc-db-dir.ts).
function watermarkPath(project: string): Result<string, Error> {
  return resolveDbDir(project).map((directory) =>
    join(directory, WATERMARK_BASENAME),
  );
}

type IndexRequest = {
  id?: string | undefined;
  completedHead?: string | null | undefined;
  head: string | null;
  pid?: number | undefined;
  requestedAt: string;
  state: "pending" | "complete" | "stale" | "failed";
};

const IndexRequestSchema = z.object({
  id: z.string().optional(),
  completedHead: z
    .union([z.null(), z.string().regex(/^[0-9a-f]{40}$/iu)])
    .optional(),
  head: z.union([z.null(), z.string().regex(/^[0-9a-f]{40}$/iu)]),
  pid: z.number().int().positive().optional(),
  requestedAt: z.string(),
  state: z.enum(["pending", "complete", "stale", "failed"]),
});

function indexRequestPath(project: string): Result<string, Error> {
  return resolveDbDir(project).map((directory) =>
    join(directory, INDEX_REQUEST_BASENAME),
  );
}

async function readIndexRequest(project: string): Promise<IndexRequest | null> {
  const path = indexRequestPath(project);
  if (path.isErr()) return null;
  const file = Bun.file(path.value);
  if (!(await file.exists())) return null;
  const parsed = jsonOf(IndexRequestSchema).safeParse(await file.text());
  return parsed.success ? parsed.data : null;
}

export async function runningIndexPid(project: string): Promise<number | null> {
  const request = await readIndexRequest(project);
  return request?.state === "pending" ? (request.pid ?? null) : null;
}

// All request writers serialize replacement and identity-checked updates. No stale-lock
// expiry: an interrupted writer must never let a second writer bypass mutual exclusion.
async function writeIndexRequest(
  project: string,
  request: IndexRequest,
  expected?: IndexRequest,
): Promise<Result<void, Error>> {
  const path = indexRequestPath(project);
  if (path.isErr()) return err(path.error);
  const lockPath = path.value + ".lock";
  const acquired = await acquireRequestLock(lockPath);
  if (acquired.isErr()) return err(acquired.error);
  const updated = await fromAsyncThrowable(async () => {
    if (expected !== undefined) {
      const current = await readIndexRequest(project);
      if (
        current === null ||
        current.id !== expected.id ||
        current.head !== expected.head ||
        current.requestedAt !== expected.requestedAt ||
        current.state !== expected.state
      )
        return;
    }
    const tmp = `${path.value}.tmp-${process.pid}`;
    await Bun.write(tmp, `${JSON.stringify(request, null, 2)}\n`);
    await rename(tmp, path.value);
  }, asError)();
  const closed = await fromAsyncThrowable(
    () => acquired.value.close(),
    asError,
  )();
  const released = await fromAsyncThrowable(() => unlink(lockPath), asError)();
  return updated.andThen(() => closed).andThen(() => released);
}

async function acquireRequestLock(
  path: string,
): Promise<Result<Awaited<ReturnType<typeof open>>, Error>> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const opened = await fromAsyncThrowable(() => open(path, "wx"), asError)();
    if (opened.isOk() || errnoCode(opened.error) !== "EEXIST") return opened;
    await Bun.sleep(10);
  }
  return err(
    new Error(
      `index request update locked at ${path}; inspect the writer before recovering an interrupted lock`,
    ),
  );
}

async function markWorkerRequest(
  project: string,
  request: IndexRequest | null,
  state: IndexRequest["state"],
  completedHead?: string | null,
): Promise<void> {
  if (request === null) return;
  const result = await writeIndexRequest(
    project,
    {
      ...request,
      state,
      ...(completedHead === undefined ? {} : { completedHead }),
    },
    request,
  );
  if (result.isErr())
    process.stderr.write(
      `NOTE: could not update index request status: ${result.error.message}\n`,
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
    if (entry.name === "rr.toml" || entry.name === "RR_ACCEPTED_PLAN.json")
      continue;
    if (entry.name === SETTINGS_BASENAME) continue; // hand-authored by `ccc init`, not indexing
    if (
      entry.name === INDEX_REQUEST_BASENAME ||
      entry.name.startsWith(`${INDEX_REQUEST_BASENAME}.`) ||
      entry.name === AUTO_REINDEX_STAMP_BASENAME ||
      entry.name === AUTO_REINDEX_LOCK_BASENAME
    )
      continue; // request bookkeeping cannot prove that ccc built an index
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
        [git.value, "--no-optional-locks", "-C", project, "rev-parse", "HEAD"],
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
        [
          git.value,
          "--no-optional-locks",
          "-C",
          project,
          "status",
          "--porcelain",
        ],
        10_000,
        false,
      ),
    asError,
  )();
  return child.map(
    (result) => result.exitCode === 0 && result.stdout.trim() !== "",
  );
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
  | {
      status: "fresh";
      watermark: Watermark;
      note?: string;
      reindexPid?: number;
    }
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
  let distance: number | null = null;
  let changedPaths: string[] = [];
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
    const git = requireExecutable("git");
    if (git.isErr()) return err(git.error);
    const count = await runChildCaptured(
      [
        git.value,
        "--no-optional-locks",
        "-C",
        project,
        "rev-list",
        "--count",
        watermark.value.head + ".." + currentHead,
      ],
      10_000,
      false,
    );
    if (count.exitCode !== 0 || !/^\d+$/u.test(count.stdout.trim())) {
      drift = null;
    } else distance = Number(count.stdout.trim());
    const paths = await runChildCaptured(
      [
        git.value,
        "--no-optional-locks",
        "-C",
        project,
        "diff",
        "--name-only",
        watermark.value.head,
        currentHead,
      ],
      10_000,
      false,
    );
    if (paths.exitCode !== 0) drift = null;
    else changedPaths = paths.stdout.split("\n").filter(Boolean);
  }
  if (drift !== null && drift.inScope.length === 0) {
    process.stderr.write(
      `NOTE: index built at HEAD=${headLabel(watermark.value.head)}; HEAD is now ` +
        `${headLabel(currentHead)}, but all ${drift.changed} path(s) changed since are outside ` +
        "the index scope (ccc's own matcher), so the index is current\n",
    );
  } else if (watermark.value.head !== currentHead) {
    const maxCommits = Number(
      process.env.REPO_RETRIEVE_MAX_STALE_COMMITS ?? DEFAULT_MAX_STALE_COMMITS,
    );
    const maxAgeMs = Number(
      process.env.REPO_RETRIEVE_MAX_STALE_AGE_MS ?? DEFAULT_MAX_STALE_AGE_MS,
    );
    const ageMs =
      Temporal.Now.instant().epochMilliseconds -
      Temporal.Instant.from(watermark.value.indexedAt).epochMilliseconds;
    if (
      watermark.value.head !== null &&
      currentHead !== null &&
      distance !== null &&
      distance <= maxCommits &&
      ageMs <= maxAgeMs
    ) {
      const changed =
        changedPaths.length > 0 ? changedPaths.join(", ") : "none";
      process.stderr.write(
        `INDEX: built at ${watermark.value.head.slice(0, 12)}, ${distance} commits / ${changedPaths.length} changed files behind; changed files: ${changed}\n`,
      );
      const reindex = await requestAutoReindex(project);
      return ok({
        status: "fresh",
        watermark: watermark.value,
        note: `INDEX: built at ${watermark.value.head.slice(0, 12)}, ${distance} commits / ${changedPaths.length} changed files behind; changed files: ${changed}`,
        ...(reindex.isOk() &&
        reindex.value.started &&
        reindex.value.pid !== undefined
          ? { reindexPid: reindex.value.pid }
          : {}),
      });
    }
    // Refuse this semantic request immediately. The caller starts one rate-limited detached
    // `index --detach` request while keeping NO_INDEX as the observable result.
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
        `but the working tree is now at HEAD=${headLabel(currentHead)}; gap=${distance} commits / ` +
        `${changedPaths.length} changed files, age=${ageMs}ms (bounds ${maxCommits} commits / ${maxAgeMs}ms). ` +
        `cite=${citationToken(watermark.value)} names the index's own ` +
        `(now-superseded) state for a citation such as --hit NO_INDEX:${citationToken(watermark.value)}. ` +
        scopeLine(drift) +
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
  expectedHead?: string | null,
  plan?: IndexPlan,
): Promise<Result<{ code: number; head: string | null }, Error>> {
  const initial = await indexProgressSample(project);
  const initialArtifacts = await hasIndexArtifacts(project);
  const initialChunks =
    initial.chunks ??
    (initialArtifacts.isOk() && !initialArtifacts.value ? 0 : undefined);
  const version = await runChildCaptured(
    [ccc, "version"],
    10_000,
    false,
    project,
  );
  const startLoad = hostLoad();
  const startedAt = Temporal.Now.instant().epochMilliseconds;
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
    if (expectedHead !== undefined && headBefore !== expectedHead) {
      process.stderr.write(
        `FATAL: HEAD changed since detached index request (${headLabel(expectedHead)} -> ${headLabel(headBefore)}); index is stale\n`,
      );
      return ok({ code: 2, head: null });
    }

    process.stderr.write(`ROUTE: index -> ccc index project=${project}\n`);
    const child = await fromAsyncThrowable(
      () => runChildToStderr([ccc, "index"], timeoutMs, project, plan),
      asError,
    )();
    if (child.isErr()) return err(child.error);
    const { exitCode, cause } = child.value;
    if (exitCode !== 0) {
      process.stderr.write(
        `FATAL: ccc index failed (exit ${exitCode}); ${cause}; watermark left unchanged\n`,
      );
      return ok({ code: exitCode, head: null });
    }

    const headAfterResult = await gitHead(project);
    if (headAfterResult.isErr()) return err(headAfterResult.error);
    const headAfter = headAfterResult.value;
    head = headBefore;
    if (headBefore !== headAfter) {
      process.stderr.write(
        `NOTE: HEAD moved during 'ccc index' (${headLabel(headBefore)} -> ${headLabel(headAfter)}); recording the scan-start watermark\n`,
      );
    }
    certified = true;
    break;
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

  const idle = await waitForProjectIdle(
    project,
    timeoutMs,
    plan === undefined ? undefined : { plan, startedAt },
  );
  if (idle !== 0) {
    if (idle === 124)
      process.stderr.write(
        `FATAL: ccc daemon kept indexing ${project} without progress for ${timeoutMs}ms (exit 124); watermark left unwritten\n`,
      );
    return ok({ code: idle, head: null });
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
  const completed = await indexProgressSample(project);
  const completedChunks = completed.chunks;
  const elapsedSeconds =
    (Temporal.Now.instant().epochMilliseconds - startedAt) / 1000;
  if (
    completedChunks !== undefined &&
    completedChunks > 0 &&
    elapsedSeconds > 0
  ) {
    const recorded = await fromAsyncThrowable(
      () =>
        recordIndexRate({
          ...processedWork(initialChunks, completedChunks),
          elapsedSeconds,
          ...startLoad,
          cccVersion:
            version.exitCode === 0 ? version.stdout.trim() : "unknown",
        }),
      asError,
    )();
    if (recorded.isErr())
      process.stderr.write(
        `NOTE: completed index rate was not recorded: ${recorded.error.message}\n`,
      );
  }
  return ok({ code: 0, head });
}

async function runChildToStderr(
  command: string[],
  timeoutMs: number,
  cwd: string,
  plan?: IndexPlan,
): Promise<{ exitCode: number; cause: string }> {
  const startedAt = Temporal.Now.instant().epochMilliseconds;
  let overBudget = false;
  // bounded: waitForIndexChild enforces progress and elapsed limits before terminating this client.
  const child = Bun.spawn({
    cmd: command,
    cwd,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  let outputAdvance = 0;
  const relay = (async () => {
    for await (const chunk of child.stdout) {
      outputAdvance += chunk.length;
      process.stderr.write(chunk);
    }
  })();
  let stderrTail = "";
  const relayStderr = (async () => {
    const decoder = new TextDecoder();
    for await (const chunk of child.stderr) {
      outputAdvance += chunk.length;
      process.stderr.write(chunk);
      stderrTail = (stderrTail + decoder.decode(chunk, { stream: true })).slice(
        -16_384,
      );
    }
    stderrTail = (stderrTail + decoder.decode()).slice(-16_384);
  })();
  const sample = async () => {
    const state = await indexProgressSample(cwd);
    if (
      plan !== undefined &&
      (Temporal.Now.instant().epochMilliseconds - startedAt) / 1000 >
        plan.budget.max_seconds
    )
      overBudget = true;
    // Chunks is the stored corpus size, not completed work: incremental indexing
    // reuses old chunks and replacements/deletions may not increase it at all.
    // With no pending-work count, extrapolating a full-corpus ETA falsely aborts.
    return `${state.signature}\nchild-output-bytes=${outputAdvance}`;
  };
  const exitPromise = Promise.all([child.exited, relay, relayStderr]).then(
    ([code]) => code,
  );
  const result = await waitForIndexChild(exitPromise, timeoutMs, {
    now: () => Temporal.Now.instant().epochMilliseconds,
    sleep: (milliseconds) => Bun.sleep(milliseconds),
    sample,
    overBudget: () => overBudget,
  });
  if (result.origin === "budget") {
    child.kill("SIGTERM");
    const elapsed =
      (Temporal.Now.instant().epochMilliseconds - startedAt) / 1000;
    if (plan !== undefined) process.stderr.write(planReport(plan));
    return {
      exitCode: 125,
      cause: `repo-retrieve elapsed ${elapsed.toFixed(1)}s exceeds max_seconds=${plan?.budget.max_seconds}; stopped the client and left the daemon running`,
    };
  }
  if (result.origin === "stall") {
    child.kill("SIGTERM");
    return {
      exitCode: 124,
      cause: `repo-retrieve observed no progress for ${timeoutMs}ms; stopped the client and left the daemon running`,
    };
  }
  return {
    exitCode: result.exitCode,
    cause: `ccc exited ${result.exitCode} (child exit status, not a repo-retrieve limit); ccc stderr tail=${JSON.stringify(stderrTail.trim() === "" ? "(empty)" : stderrTail.trim())}`,
  };
}

// Companion to the freshness gate, not a search route: writes INDEXED_AT (ccc's DB dir). This is
// now the ONLY thing that writes that file. The deployed ccc entry refuses raw index; an
// explicitly invoked vendor backend still leaves the watermark stale or missing. There is no
// separate, faster, no-reindex path to recover it (that path used to be `stamp`; it asserted
// freshness without ever observing an indexer run, and was deleted because that assertion could
// not be verified -- see the file header). The only way to make the watermark fresh again is to
// run `repo-retrieve index`, which reindexes AND records the result in one step.
export type IndexOutcome =
  | { kind: "plan"; exitCode: 0 | 4 }
  | { kind: "refused"; exitCode: 4 }
  | { kind: "detached"; exitCode: 0 }
  | { kind: "indexed"; exitCode: 0 }
  | { kind: "failed"; exitCode: number };

export async function runIndexWrapper(
  timeoutMs = INDEX_STALL_MS,
  mode: "wait" | "detach" = "wait",
  options: { plan?: boolean; acceptPlan?: boolean } = {},
): Promise<Result<IndexOutcome, Error>> {
  const resolution = resolveRegisteredProject(process.cwd());
  if (resolution?.workspace !== null && resolution?.workspace !== undefined) {
    return err(
      new Error(
        `index refused in jj workspace ${resolution.workspace}; run 'repo-retrieve index' in backing repo ${resolution.project}`,
      ),
    );
  }
  const project = resolution?.project;
  if (project === undefined || project === null || project === "") {
    return err(
      new Error(`index requested, but ${process.cwd()} is not ccc-registered`),
    );
  }
  const ccc = requireExecutable("ccc");
  if (ccc.isErr()) return err(ccc.error);

  const backend = cccBackend(ccc.value);
  const planned = await computeIndexPlan(project, backend);
  if (planned.isErr()) return err(planned.error);
  const plan = planned.value;
  process.stderr.write(planReport(plan));
  if (options.plan === true) {
    writePlanJsonl(plan);
    return ok({ kind: "plan", exitCode: plan.violations.length === 0 ? 0 : 4 });
  }
  if (plan.violations.length > 0) return ok({ kind: "refused", exitCode: 4 });
  if (options.acceptPlan === true) {
    const accepted = await fromAsyncThrowable(
      () =>
        Bun.write(
          join(project, ".cocoindex_code", "RR_ACCEPTED_PLAN.json"),
          `${JSON.stringify({ acceptedAt: Temporal.Now.instant().toString(), budget: plan.budget, total: plan.total, violations: plan.violations })}\n`,
        ),
      asError,
    )();
    if (accepted.isErr()) return err(accepted.error);
    process.stderr.write(
      "PLAN: --accept-plan recorded in .cocoindex_code/RR_ACCEPTED_PLAN.json; no violations permitted; measured time budget still applies\n",
    );
  }

  const worker = process.env.REPO_RETRIEVE_INDEX_WORKER === "1";
  let expectedHead: string | null | undefined;
  if (worker) {
    expectedHead = process.env.REPO_RETRIEVE_INDEX_REQUEST_HEAD;
    if (expectedHead === "none") expectedHead = null;
  }
  if (mode === "detach") {
    const head = await gitHead(project);
    if (head.isErr()) return err(head.error);
    const request: IndexRequest = {
      id: crypto.randomUUID(),
      head: head.value,
      requestedAt: Temporal.Now.instant().toString({
        fractionalSecondDigits: 3,
      }),
      state: "pending",
    };
    const saved = await writeIndexRequest(project, request);
    if (saved.isErr()) return err(saved.error);
    const child = fromThrowable(
      () =>
        // bounded: this detached worker applies the same progress-based stall timeout internally.
        Bun.spawn(
          [
            process.execPath,
            fileURLToPath(new URL("./repo-retrieve.ts", import.meta.url)),
            "index",
            ...(options.acceptPlan === true ? ["--accept-plan"] : []),
          ],
          {
            cwd: project,
            env: {
              ...process.env,
              REPO_RETRIEVE_INDEX_WORKER: "1",
              REPO_RETRIEVE_INDEX_REQUEST_HEAD: head.value ?? "none",
              REPO_RETRIEVE_INDEX_REQUEST_ID: request.id,
            },
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
            detached: true,
          },
        ),
      asError,
    )();
    if (child.isErr()) {
      await writeIndexRequest(
        project,
        { ...request, state: "failed" },
        request,
      );
      return err(child.error);
    }
    child.value.unref();
    const recorded = await writeIndexRequest(
      project,
      {
        ...request,
        pid: child.value.pid,
      },
      request,
    );
    if (recorded.isErr())
      process.stderr.write(
        `NOTE: could not record detached index pid: ${recorded.error.message}\n`,
      );
    process.stdout.write(
      `RESULT: INDEX_REQUESTED project=${project} head=${headLabel(head.value)} state=pending\n`,
    );
    return ok({ kind: "detached", exitCode: 0 });
  }

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
  // (2026-09-25 evaluation: ten agents committing every 1–2 min; a human needed three tries).
  const observedRequest = await readIndexRequest(project);
  // A detached worker owns only the request passed by its parent. A foreground
  // scan may fulfill the prior request it captured, including an unresolvable old HEAD.
  const capturedRequest =
    worker && observedRequest?.id !== process.env.REPO_RETRIEVE_INDEX_REQUEST_ID
      ? null
      : observedRequest;
  const certifiedResult = await reindexCertified(
    project,
    backend,
    timeoutMs,
    expectedHead,
    plan,
  );
  if (certifiedResult.isErr()) {
    if (worker) await markWorkerRequest(project, capturedRequest, "failed");
    return err(certifiedResult.error);
  }
  const certifiedRun = certifiedResult.value;
  if (certifiedRun.code !== 0) {
    if (worker)
      await markWorkerRequest(
        project,
        capturedRequest,
        expectedHead === undefined ? "failed" : "stale",
      );
    return ok({ kind: "failed", exitCode: certifiedRun.code });
  }
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
  const currentHead = await gitHead(project);
  if (currentHead.isErr()) return err(currentHead.error);
  if (currentHead.value === head)
    await markWorkerRequest(project, capturedRequest, "complete", head);
  else if (worker) await markWorkerRequest(project, capturedRequest, "stale");
  return ok({ kind: "indexed", exitCode: 0 });
}

export async function runIndexStatus(): Promise<Result<number, Error>> {
  const resolution = resolveRegisteredProject(process.cwd());
  const project = resolution?.project;
  if (project === undefined || project === null || project === "")
    return err(
      new Error(
        `index status requested, but ${process.cwd()} is not ccc-registered`,
      ),
    );
  const request = await readIndexRequest(project);
  const head = await gitHead(project);
  if (head.isErr()) return err(head.error);
  const watermark = await readWatermark(project);
  if (watermark.isErr()) return err(watermark.error);
  const builtHead =
    watermark.value.kind === "ok" ? watermark.value.value.head : null;
  let gap = "unknown";
  if (
    watermark.value.kind === "ok" &&
    builtHead !== null &&
    head.value !== null
  ) {
    const git = requireExecutable("git");
    if (git.isErr()) return err(git.error);
    const count = await runChildCaptured(
      [
        git.value,
        "--no-optional-locks",
        "-C",
        project,
        "rev-list",
        "--count",
        builtHead + ".." + head.value,
      ],
      10_000,
      false,
    );
    if (count.exitCode === 0) gap = count.stdout.trim();
  }
  const ccc = requireExecutable("ccc");
  if (ccc.isErr()) return err(ccc.error);
  const status = await runChildCaptured(
    [ccc.value, "daemon", "status"],
    10_000,
    false,
    project,
  );
  const projectLine = status.stdout
    .split("\n")
    .find((line) => line.trimStart().startsWith(`${project} [`));
  const daemon =
    status.exitCode === 0 && projectLine !== undefined
      ? (/\[([^\]]+)\]/u.exec(projectLine)?.[1] ?? "unknown")
      : "unknown";
  let pidAlive = false;
  if (request?.state === "pending" && request.pid !== undefined) {
    const pid = request.pid;
    const alive = fromThrowable(() => process.kill(pid, 0), asError)();
    pidAlive = alive.isOk() || errnoCode(alive.error) === "EPERM";
  }
  const running = daemon === "indexing" || pidAlive;
  let reindex = daemon === "unknown" ? "unknown" : "not-running";
  if (running) reindex = "running";
  const artifacts = await hasIndexArtifacts(project);
  if (artifacts.isErr()) return err(artifacts.error);
  const fresh =
    watermark.value.kind === "ok" &&
    watermark.value.value.source === "index" &&
    builtHead === head.value &&
    artifacts.value;
  if (head.value === null && fresh) gap = "0";
  let state = fresh ? "idle" : "stale";
  if (request === null && fresh && head.value === null) state = "complete";
  if (request === null) {
    const requestPath = indexRequestPath(project);
    if (requestPath.isErr()) return err(requestPath.error);
    if (await Bun.file(requestPath.value).exists()) state = "invalid";
    else if (watermark.value.kind === "missing") state = "none";
  } else if (request.state === "complete") {
    const completedHead =
      request.completedHead === undefined
        ? request.head
        : request.completedHead;
    state = fresh && completedHead === builtHead ? "complete" : "stale";
  } else {
    state = request.state;
    if (request.head !== head.value) state = "stale";
  }
  process.stdout.write(
    `RESULT: INDEX_STATUS project=${project} state=${state} daemon=${daemon} built=${head.value === null && fresh ? "none-verified" : headLabel(builtHead)} gap=${gap} reindex=${reindex} current=${headLabel(head.value)}` +
      (request === null
        ? ""
        : ` head=${headLabel(request.head)} requested=${headLabel(request.head)}`) +
      (state === "invalid" || state === "pending" || state === "stale"
        ? " remedy=run-repo-retrieve-index"
        : "") +
      "\n",
  );
  return ok(0);
}
