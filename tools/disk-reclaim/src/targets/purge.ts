import { chmodSync, lstatSync, readdirSync } from "node:fs";
import { lstat } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { homedir } from "node:os";
import {
  graveyardCandidates,
  existingGraveyards,
  graveyardEntries,
  ripRecords,
  ripBurialTime,
  UNKNOWN_RIP_BURIAL,
} from "../lib/graveyards.ts";
import { removeTree, removeTreeProgress } from "../lib/remove-tree.ts";
import { countEntries } from "../lib/purge-progress.ts";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ActionResult, Candidate, Config, Headroom } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { fromThrowable, z } from "../../../shared/src/zod.ts";
import { scanCache, checkScanDeadline } from "../lib/scan-cache.ts";
import { ripExpiryCandidates } from "./rip-expire.ts";
export { purgeRip } from "./rip-expire.ts";
import type { LivenessSnapshot } from "../liveness/facts.ts";

export const typedYes = (answer: string | null): boolean =>
  answer?.trim() === "yes";

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
  if (options.ripOnly === true) return ripExpiryCandidates(env, home, options);
  const now = options.now ?? Temporal.Now.instant().epochMilliseconds;
  const minAgeMs =
    (options.config?.graveyard_min_age_hours ?? 24) * 60 * 60 * 1000;
  const undoWindowMs =
    (options.config?.graveyard_pressure_undo_minutes ?? 10) * 60 * 1000;
  const candidates: Candidate[] = [];
  const graveyards = existingGraveyards(graveyardCandidates(env, home)).filter(
    (graveyard) =>
      options.ripOnly !== true || graveyard.label === "rip graveyard",
  );
  for (const graveyard of graveyards) {
    const drive = driveForPath(graveyard.path, options.headroom);
    const belowDenyLine = drive?.state === "deny";
    const records = ripRecords(graveyard.path);
    const scope = await graveyardScope(graveyard.path, options.only);
    const entries = scope;
    const entryCandidates = await Promise.all(
      entries.map(async (entry) => {
        checkScanDeadline(options.context);
        const entryRecords = records.filter(
          (record) =>
            record.destination === entry ||
            record.destination.startsWith(`${entry}${sep}`),
        );
        const stat = fromThrowable(() => lstatSync(entry))();
        const mtime = stat.isOk() ? stat.value.mtimeMs : 0;
        let newestTime: number | undefined = mtime;
        if (
          graveyard.label === "rip graveyard" &&
          entry !== join(graveyard.path, ".record")
        )
          newestTime = await ripBurialTime(
            resolve(graveyard.path),
            entry,
            records,
          );
        else if (entryRecords.length > 0)
          newestTime = Math.max(...entryRecords.map((record) => record.time));
        // rip already deleted this payload. Open fds retain their inode until close;
        // process-use evidence (including unreadable processes) cannot block expiry.
        const isRecent =
          newestTime === undefined || now - newestTime < minAgeMs;
        const insideUndoWindow =
          newestTime !== undefined && now - newestTime < undoWindowMs;
        const ageMs = Math.max(0, now - (newestTime ?? now));
        let age: string;
        if (ageMs < 60_000) age = `${Math.floor(ageMs / 1000)} seconds`;
        else if (ageMs < 3_600_000)
          age = `${Math.floor(ageMs / 60_000)} minutes`;
        else if (ageMs < 86_400_000)
          age = `${Math.floor(ageMs / 3_600_000)} hours`;
        else age = `${Math.floor(ageMs / 86_400_000)} days`;
        const verdict =
          newestTime === undefined ||
          insideUndoWindow ||
          (isRecent && (!belowDenyLine || options.underPressure !== true))
            ? "KEEP"
            : "RECLAIM";
        let reason: string;
        if (newestTime === undefined) reason = UNKNOWN_RIP_BURIAL;
        else if (insideUndoWindow) reason = `undo window: rip'd ${age} ago`;
        else if (isRecent && belowDenyLine && options.underPressure !== true)
          reason =
            "recent; host is below the deny line: rerun with --under-pressure to purge";
        else if (isRecent && !belowDenyLine)
          reason = `recent: rip'd ${age} ago`;
        else
          reason = `older than ${options.config?.graveyard_min_age_hours ?? 24}h`;
        const cache = scanCache(entry, "purge-allocated-v1", options.context);
        const cached = z.number().nonnegative().safeParse(cache?.value);
        const bytes = cached.success
          ? cached.data
          : size(entry, options.context);
        if (!cached.success) cache?.save(bytes);
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
      }),
    );
    const recordPath = `${graveyard.path}/.record`;
    const recordCandidate = entryCandidates.find(
      (candidate) => candidate.path === recordPath,
    );
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

async function purgePlan(ctx: Context, ripOnly: boolean): Promise<Candidate[]> {
  const rows = await purgeCandidates(process.env, homedir(), {
    context: ctx,
    config: ctx.config,
    ...(ctx.headroom === undefined ? {} : { headroom: ctx.headroom }),
    underPressure: ctx.underPressure === true,
    ...(ctx.liveness === undefined ? {} : { liveness: ctx.liveness }),
    ripOnly,
    only: ctx.only,
  });
  return rows;
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
