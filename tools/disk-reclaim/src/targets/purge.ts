import { lstatSync } from "node:fs";
import { homedir } from "node:os";
import {
  graveyardCandidates,
  existingGraveyards,
  graveyardEntries,
  ripRecords,
} from "../lib/graveyards.ts";
import { removeTree, removeTreeProgress } from "../lib/remove-tree.ts";
import { countEntries } from "../lib/purge-progress.ts";
import { relative, resolve, sep } from "node:path";
import type { ActionResult, Candidate, Config } from "../model.ts";
import type { Target } from "./index.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";
import { judge } from "../liveness/predicate.ts";
import { scratchRef, type LivenessSnapshot } from "../liveness/facts.ts";

export const typedYes = (answer: string | null): boolean =>
  answer?.trim() === "yes";

function size(path: string): number {
  const stat = fromThrowable(() => lstatSync(path))();
  if (stat.isErr()) return 0;
  if (!stat.value.isDirectory() || stat.value.isSymbolicLink())
    return stat.value.blocks * 512;
  return graveyardEntries(path).reduce(
    (total, entry) => total + size(entry),
    0,
  );
}

export function purgeCandidates(
  env = process.env,
  home = homedir(),
  options: {
    config?: Pick<Config, "graveyard_min_age_hours" | "scratch_roots">;
    liveness?: LivenessSnapshot;
    now?: number;
  } = {},
): Candidate[] {
  const now = options.now ?? Temporal.Now.instant().epochMilliseconds;
  const minAgeMs =
    (options.config?.graveyard_min_age_hours ?? 24) * 60 * 60 * 1000;
  const scratchRoots = options.config?.scratch_roots ?? [];
  const candidates: Candidate[] = [];
  for (const graveyard of existingGraveyards(graveyardCandidates(env, home))) {
    const entries = graveyardEntries(graveyard.path);
    const records = ripRecords(graveyard.path);
    const entryCandidates = entries.map((entry) => {
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
      const isRecent = now - newestTime < minAgeMs;
      const ageMs = Math.max(0, now - newestTime);
      let age: string;
      if (ageMs < 60_000) age = `${Math.floor(ageMs / 1000)} seconds`;
      else if (ageMs < 3_600_000) age = `${Math.floor(ageMs / 60_000)} minutes`;
      else if (ageMs < 86_400_000)
        age = `${Math.floor(ageMs / 3_600_000)} hours`;
      else age = `${Math.floor(ageMs / 86_400_000)} days`;
      const verdict =
        liveRef !== undefined || uncertainRef !== undefined || isRecent
          ? "KEEP"
          : "RECLAIM";
      let reason: string;
      if (liveRef !== undefined) reason = `from live session ${liveRef.uuid}`;
      else if (uncertainRef !== undefined)
        reason = `session status unknown for ${uncertainRef.uuid}`;
      else if (isRecent) reason = `recent: rip'd ${age} ago`;
      else
        reason = `older than ${options.config?.graveyard_min_age_hours ?? 24}h; origin is not live`;
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
        bytes: size(entry),
        bytes_kind: "estimate" as const,
        action: { kind: "delete" as const, argv: ["removeTree", entry] },
        result: null,
      } satisfies Candidate;
    });
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

export const purge = {
  name: "purge",
  tier: "irreversible",
  available: () => ({ available: true, skip_reason: null }),
  plan: (ctx) =>
    purgeCandidates(process.env, homedir(), {
      config: ctx.config,
      ...(ctx.liveness === undefined ? {} : { liveness: ctx.liveness }),
    }),
  act: (candidate, ctx): ActionResult => {
    if (candidate.path === null)
      return { ok: false, bytes_freed: null, error: "missing graveyard path" };
    const plannedEntry = candidate.action.argv[1] === candidate.path;
    const entryCount = countEntries(candidate.path) + (plannedEntry ? 1 : 0);
    let freed = 0;
    let failed = false;
    // Planned rows own one top-level entry. Legacy/root rows still delete children independently.
    const entries = plannedEntry
      ? [candidate.path]
      : graveyardEntries(candidate.path);
    for (const entry of entries) {
      const result = removeTree(entry, {
        uid: process.getuid?.() ?? 0,
        protection: {
          ownerTarget: "purge",
          procDir: ctx.procDir,
          repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
          protectedPaths: ctx.config.protected ?? [],
          ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
        },
        progress: removeTreeProgress(entry, null, ctx),
      });
      freed += result.statfs_bytes_freed;
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
    if (!failed) ctx.log(`${candidate.id}: ${entryCount} entries removed`);
    return {
      ok: !failed,
      bytes_freed: freed,
      error: failed ? "some graveyard entries were refused or failed" : null,
    };
  },
} satisfies Target;
