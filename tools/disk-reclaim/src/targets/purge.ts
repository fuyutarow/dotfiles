import { chmodSync, lstatSync, readdirSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { homedir } from "node:os";
import {
  graveyardCandidates,
  existingGraveyards,
  graveyardEntries,
  ripRecords,
  RIP_GRAVEYARD_MAX_BYTES,
} from "../lib/graveyards.ts";
import { removeTree, removeTreeProgress } from "../lib/remove-tree.ts";
import { countEntries } from "../lib/purge-progress.ts";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ActionResult, Candidate, Config, Headroom } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { fromThrowable, z } from "../../../shared/src/zod.ts";
import { scanCache, checkScanDeadline } from "../lib/scan-cache.ts";
import { judge } from "../liveness/predicate.ts";
import { scratchRef, type LivenessSnapshot } from "../liveness/facts.ts";

export const typedYes = (answer: string | null): boolean =>
  answer?.trim() === "yes";

function appendPaths(pending: string[], children: string[]): void {
  for (const child of children) pending.push(child);
}

// Match doctor's logical-byte ceiling, including sparse files; allocated bytes are only
// the reclaim estimate. A subtree already over the ceiling cannot be retained, so stop
// at that lower bound instead of scanning millions of descendants just to reject it.
// Never follow symlinks while measuring deleted payloads.
async function graveyardSize(
  path: string,
  ctx?: Context,
): Promise<{ logical: number; allocated: number }> {
  const pending = [path];
  let total = 0;
  let allocated = 0;
  while (pending.length > 0) {
    checkScanDeadline(ctx);
    const next = pending.splice(-64);
    const batch = await Promise.all(
      next.map(async (entry) => {
        const stat = await lstat(entry);
        if (!stat.isDirectory() || stat.isSymbolicLink())
          return {
            bytes: stat.size,
            allocated: stat.blocks * 512,
            children: [],
          };
        const names = await readdir(entry);
        return {
          bytes: 0,
          allocated: 0,
          children: names.map((name) => join(entry, name)),
        };
      }),
    );
    total += batch.reduce((bytes, row) => bytes + row.bytes, 0);
    allocated += batch.reduce((bytes, row) => bytes + row.allocated, 0);
    if (total > RIP_GRAVEYARD_MAX_BYTES) return { logical: total, allocated };
    for (const row of batch) appendPaths(pending, row.children);
  }
  return { logical: total, allocated };
}

const candidatePath = (row: Candidate): string => row.path ?? "";

function applyCapacityExpiry(
  rows: Candidate[],
  times: Map<string, number>,
  logical: Map<string, number>,
  record: Candidate | undefined,
): void {
  rows.sort((left, right) => {
    const difference =
      (times.get(candidatePath(left)) ?? 0) -
      (times.get(candidatePath(right)) ?? 0);
    return difference === 0
      ? candidatePath(left).localeCompare(candidatePath(right))
      : difference;
  });
  let retained = rows.reduce(
    (total, row) =>
      total +
      (row.verdict === "KEEP" || row === record
        ? (logical.get(candidatePath(row)) ?? 0)
        : 0),
    0,
  );
  for (const row of rows) {
    if (retained <= RIP_GRAVEYARD_MAX_BYTES) break;
    if (row === record || row.verdict !== "KEEP") continue;
    if (
      !row.reason.startsWith("recent") &&
      !row.reason.startsWith("undo window:")
    )
      continue;
    row.verdict = "RECLAIM";
    row.reason = `graveyard exceeds ${RIP_GRAVEYARD_MAX_BYTES} bytes; oldest-first capacity expiry`;
    retained -= logical.get(candidatePath(row)) ?? 0;
  }
}

function driveForPath(path: string, headroom: Headroom | undefined) {
  return headroom?.drives
    .filter((drive) => {
      const fromDrive = relative(resolve(drive.path), resolve(path));
      return (
        fromDrive === "" ||
        (!isAbsolute(fromDrive) &&
          fromDrive !== ".." &&
          !fromDrive.startsWith(`..${sep}`))
      );
    })
    .toSorted((left, right) => right.path.length - left.path.length)[0];
}

function size(path: string, ctx?: Context): number {
  checkScanDeadline(ctx);
  const stat = fromThrowable(() => lstatSync(path))();
  if (stat.isErr()) return 0;
  if (!stat.value.isDirectory() || stat.value.isSymbolicLink())
    return stat.value.blocks * 512;
  return graveyardEntries(path).reduce(
    (total, entry) => total + size(entry, ctx),
    0,
  );
}

/** Graveyard entries to judge: every top-level entry, or just the one named subtree. */
async function graveyardScope(
  root: string,
  only: string | undefined,
): Promise<string[]> {
  if (only === undefined) return graveyardEntries(root);
  const rel = relative(resolve(root), resolve(only));
  if (rel === "") return graveyardEntries(root);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return [];
  // A named descendant must not follow a graveyard symlink into live data.
  let parent = resolve(root);
  for (const part of rel.split(sep).slice(0, -1)) {
    parent = join(parent, part);
    const entry = parent;
    const stat = await fromAsyncThrowable(() => lstat(entry))();
    if (stat.isErr() || stat.value.isSymbolicLink()) return [];
  }
  const stat = await fromAsyncThrowable(() => lstat(only))();
  return stat.isOk() ? [resolve(only)] : [];
}

export async function purgeCandidates(
  env = process.env,
  home = homedir(),
  options: {
    config?: Pick<
      Config,
      | "graveyard_min_age_hours"
      | "graveyard_pressure_undo_minutes"
      | "scratch_roots"
    >;
    liveness?: LivenessSnapshot;
    headroom?: Headroom;
    underPressure?: boolean;
    ripOnly?: boolean;
    only?: string | undefined;
    now?: number;
    context?: Context;
  } = {},
): Promise<Candidate[]> {
  const now = options.now ?? Temporal.Now.instant().epochMilliseconds;
  const minAgeMs =
    (options.config?.graveyard_min_age_hours ?? 24) * 60 * 60 * 1000;
  const undoWindowMs =
    (options.config?.graveyard_pressure_undo_minutes ?? 10) * 60 * 1000;
  const scratchRoots = options.config?.scratch_roots ?? [];
  const candidates: Candidate[] = [];
  const graveyards = existingGraveyards(graveyardCandidates(env, home)).filter(
    (graveyard) =>
      options.ripOnly !== true || graveyard.label === "rip graveyard",
  );
  for (const graveyard of graveyards) {
    const drive = driveForPath(graveyard.path, options.headroom);
    const belowDenyLine = drive?.state === "deny";
    const entries = await graveyardScope(graveyard.path, options.only);
    const records = ripRecords(graveyard.path);
    const times = new Map<string, number>();
    const logical = new Map<string, number>();
    const allocated = new Map<string, number>();
    for (const entry of options.ripOnly === true ? entries : []) {
      const measured = await graveyardSize(entry, options.context);
      logical.set(entry, measured.logical);
      allocated.set(entry, measured.allocated);
    }
    const entryCandidates = entries.map((entry) => {
      checkScanDeadline(options.context);
      const entryRecords = records.filter(
        (record) =>
          record.destination === entry ||
          record.destination.startsWith(`${entry}${sep}`),
      );
      const stat = fromThrowable(() => lstatSync(entry))();
      const mtime = stat.isOk() ? stat.value.mtimeMs : 0;
      const newestTime = Math.max(
        mtime,
        ...entryRecords.map((record) => record.time),
      );
      times.set(entry, newestTime);
      const relativeEntry = relative(resolve(graveyard.path), resolve(entry));
      const mirroredPath = `/${relativeEntry}`;
      const sourcePaths =
        entryRecords.length > 0
          ? entryRecords.map((record) => record.original)
          : [mirroredPath];
      const refs = sourcePaths.flatMap((sourcePath) => {
        const ref = scratchRef(sourcePath, scratchRoots);
        return ref === null ? [] : [ref];
      });
      const liveRef = refs.find(
        (ref) =>
          options.liveness !== undefined &&
          judge(ref, options.liveness.facts(ref)).verdict === "live",
      );
      const uncertainRef = refs.find(
        (ref) =>
          options.liveness !== undefined &&
          judge(ref, options.liveness.facts(ref)).verdict === "unknown",
      );
      const openPaths = options.liveness?.openPaths(entry);
      const isLocked =
        openPaths !== undefined &&
        (openPaths.open.length > 0 || openPaths.unknown.length > 0);
      const isRecent = now - newestTime < minAgeMs;
      const insideUndoWindow = now - newestTime < undoWindowMs;
      const ageMs = Math.max(0, now - newestTime);
      let age: string;
      if (ageMs < 60_000) age = `${Math.floor(ageMs / 1000)} seconds`;
      else if (ageMs < 3_600_000) age = `${Math.floor(ageMs / 60_000)} minutes`;
      else if (ageMs < 86_400_000)
        age = `${Math.floor(ageMs / 3_600_000)} hours`;
      else age = `${Math.floor(ageMs / 86_400_000)} days`;
      const verdict =
        liveRef !== undefined ||
        uncertainRef !== undefined ||
        isLocked ||
        (isRecent &&
          (!belowDenyLine ||
            options.underPressure !== true ||
            insideUndoWindow))
          ? "KEEP"
          : "RECLAIM";
      let reason: string;
      if (liveRef !== undefined) reason = `from live session ${liveRef.uuid}`;
      else if (uncertainRef !== undefined)
        reason = `session status unknown for ${uncertainRef.uuid}`;
      else if (isLocked) {
        const openPath = openPaths?.open[0]?.path;
        reason = `entry is locked or in use${openPath === undefined ? "" : `: ${openPath}`}`;
      } else if (insideUndoWindow && isRecent)
        reason = `undo window: rip'd ${age} ago`;
      else if (isRecent && belowDenyLine && options.underPressure !== true)
        reason =
          "recent; host is below the deny line: rerun with --under-pressure to purge";
      else if (isRecent && !belowDenyLine) reason = `recent: rip'd ${age} ago`;
      else
        reason = `older than ${options.config?.graveyard_min_age_hours ?? 24}h; origin is not live`;
      const cache = scanCache(entry, "purge-allocated-v1", options.context);
      const cached = z.number().nonnegative().safeParse(cache.value);
      const bytes =
        allocated.get(entry) ??
        (cached.success ? cached.data : size(entry, options.context));
      if (!cached.success) cache.save(bytes);
      return {
        id: `${graveyard.label}: ${entry.slice(graveyard.path.length + 1)}`,
        path: entry,
        verdict,
        reason,
        checks: [
          {
            name: "graveyard-entry",
            ok: true,
            detail: "top-level graveyard entry",
          },
        ],
        bytes,
        bytes_kind: "estimate" as const,
        action: { kind: "delete" as const, argv: ["removeTree", entry] },
        result: null,
      } satisfies Candidate;
    });
    const recordPath = `${graveyard.path}/.record`;
    const recordCandidate = entryCandidates.find(
      (candidate) => candidate.path === recordPath,
    );
    if (options.ripOnly === true) {
      // Expire by age first, then oldest-first until retained logical bytes fit the
      // same limit doctor declares. Capacity overrides age, never liveness or locks.
      applyCapacityExpiry(entryCandidates, times, logical, recordCandidate);
    }
    if (
      recordCandidate !== undefined &&
      entryCandidates.some((candidate) => candidate.verdict === "KEEP")
    ) {
      recordCandidate.verdict = "KEEP";
      recordCandidate.reason = "required to restore kept graveyard entries";
    }
    candidates.push(...entryCandidates);
  }
  return candidates;
}

function makeDirectoriesOwnerWritable(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  if ((stat.mode & 0o300) !== 0o300) chmodSync(path, stat.mode | 0o300);
  for (const name of readdirSync(path))
    makeDirectoriesOwnerWritable(join(path, name));
}

function purgePlan(ctx: Context, ripOnly: boolean): Promise<Candidate[]> {
  return purgeCandidates(process.env, homedir(), {
    context: ctx,
    config: ctx.config,
    ...(ctx.headroom === undefined ? {} : { headroom: ctx.headroom }),
    underPressure: ctx.underPressure === true,
    ...(ctx.liveness === undefined ? {} : { liveness: ctx.liveness }),
    ripOnly,
    only: ctx.only,
  });
}

async function recheckPurge(
  candidate: Candidate,
  ctx: Context,
  ripOnly: boolean,
): Promise<Candidate | null> {
  if (candidate.path === null) return null;
  // The restore record depends on KEEP siblings; only payload rows can be judged alone.
  const only =
    ripOnly || basename(candidate.path) === ".record"
      ? ctx.only
      : candidate.path;
  const rows = await purgePlan({ ...ctx, only }, ripOnly);
  return (
    rows.find(
      (row) => row.id === candidate.id && row.path === candidate.path,
    ) ?? null
  );
}

export const purge = {
  name: "purge",
  tier: "irreversible",
  // Small subtrees first, so a huge one cannot delay every cheap recovery behind it.
  fastFirst: true,
  available: () => ({ available: true, skip_reason: null }),
  plan: (ctx) => purgePlan(ctx, false),
  recheck: (candidate, ctx) => recheckPurge(candidate, ctx, false),
  act: async (candidate, ctx): Promise<ActionResult> => {
    if (candidate.path === null)
      return { ok: false, bytes_freed: null, error: "missing graveyard path" };
    const plannedEntry = candidate.action.argv[1] === candidate.path;
    const entryCount = countEntries(candidate.path) + (plannedEntry ? 1 : 0);
    let freed = 0;
    let removedEntries = 0;
    let removedBytes = 0;
    let failed = false;
    // Planned rows own one top-level entry. Legacy/root rows still delete children independently.
    const entries = plannedEntry
      ? [candidate.path]
      : graveyardEntries(candidate.path);
    for (const entry of entries) {
      const writable = fromThrowable(() => {
        makeDirectoriesOwnerWritable(entry);
      })();
      if (writable.isErr()) {
        failed = true;
        ctx.log(
          `ERROR ${entry}: cannot restore owner write permission: ${String(writable.error)}`,
        );
        continue;
      }
      const result = await removeTree(entry, {
        uid: process.getuid?.() ?? 0,
        // Graveyard entries are already-deleted data: the repo-store refusal does not apply.
        graveyard: true,
        protection: {
          processes: ctx.liveness,
          ownerTarget: "purge",
          procDir: ctx.procDir,
          repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
          protectedPaths: ctx.config.protected ?? [],
          ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
        },
        progress: removeTreeProgress(entry, null, ctx),
      });
      freed += result.statfs_bytes_freed;
      removedEntries += result.entries_removed;
      removedBytes += result.bytes_freed;
      for (const refusal of result.refused) {
        failed = true;
        ctx.log(
          `REFUSED ${refusal.path}: ${refusal.reason}; repair: ${refusal.repair}`,
        );
      }
      for (const error of result.errors) {
        failed = true;
        ctx.log(`ERROR ${error.path}: ${error.error}`);
      }
    }
    if (!failed)
      ctx.log(
        `${candidate.id}: ${entryCount} entries removed (${removedEntries} files and directories, ${removedBytes} bytes)`,
      );
    return {
      ok: !failed,
      bytes_freed: freed,
      error: failed ? "some graveyard entries were refused or failed" : null,
    };
  },
} satisfies Target;

export const purgeRip = {
  ...purge,
  name: "rip-expire",
  tier: "blind",
  fastFirst: false,
  description: {
    what: "expired rip graveyard entries",
    why: "remove expired rip entries; leave XDG Trash owner-only",
  },
  plan: (ctx: Context) => purgePlan(ctx, true),
  recheck: (candidate: Candidate, ctx: Context) =>
    recheckPurge(candidate, ctx, true),
} satisfies Target;
