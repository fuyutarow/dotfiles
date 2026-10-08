import { existsSync, lstatSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";
import {
  createLivenessSnapshot,
  type LivenessFacts,
  type LivenessProbes,
  type LivenessRef,
} from "../liveness/facts.ts";
import { judge } from "../liveness/predicate.ts";
import {
  removeTree,
  removeTreeProgress,
  type RemoveTreeResult,
} from "../lib/remove-tree.ts";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { treeBytes } from "./tree.ts";

type Inspection<T> = { ok: true; value: T } | { ok: false; error: string };
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const inspect = <T>(operation: () => T): Inspection<T> => {
  const result = fromThrowable(operation, (error) =>
    error instanceof Error ? error.message : String(error),
  )();
  return result.isOk()
    ? { ok: true, value: result.value }
    : { ok: false, error: result.error };
};

function candidatesUnder(root: string): LivenessRef[] {
  const refs: LivenessRef[] = [];
  const slugs = inspect(() => readdirSync(root));
  if (!slugs.ok) return refs;
  for (const slug of slugs.value) refs.push(...candidatesForSlug(root, slug));
  return refs;
}

function candidatesForSlug(root: string, slug: string): LivenessRef[] {
  const slugPath = join(root, slug);
  const sessions = inspect(() => readdirSync(slugPath));
  if (!sessions.ok) return [];
  const refs: LivenessRef[] = [];
  for (const uuid of sessions.value) {
    const ref = candidateForUuid(root, slug, slugPath, uuid);
    if (ref !== null) refs.push(ref);
  }
  return refs;
}

function candidateForUuid(
  root: string,
  slug: string,
  slugPath: string,
  uuid: string,
): LivenessRef | null {
  if (!uuidPattern.test(uuid)) return null;
  const dir = join(slugPath, uuid, "scratchpad");
  const stat = inspect(() => lstatSync(dir));
  if (!stat.ok || !stat.value.isDirectory() || stat.value.isSymbolicLink())
    return null;
  const rootMatch = basename(root).match(/^claude-(\d+)$/u);
  const uid =
    rootMatch === null ? (process.getuid?.() ?? 0) : Number(rootMatch[1]);
  return { uid, slug, uuid, dir };
}

function hasDelegatedWorkspace(root: string): Inspection<boolean> {
  const entries = inspect(() => readdirSync(root));
  if (!entries.ok) return entries;
  for (const name of entries.value) {
    const result = inspectDelegatedEntry(root, name);
    if (!result.ok || result.value) return result;
  }
  return { ok: true, value: false };
}

function inspectDelegatedEntry(
  root: string,
  name: string,
): Inspection<boolean> {
  const path = join(root, name);
  const stat = inspect(() => lstatSync(path));
  if (!stat.ok) return stat;
  if (name === ".git" && (stat.value.isFile() || stat.value.isDirectory()))
    return { ok: true, value: true };
  if (!stat.value.isDirectory() || stat.value.isSymbolicLink())
    return { ok: true, value: false };
  if (name === ".jj" && existsSync(join(path, "repo"))) {
    const repo = inspect(() => lstatSync(join(path, "repo")));
    if (!repo.ok) return repo;
    if (repo.value.isFile()) return { ok: true, value: true };
  }
  return hasDelegatedWorkspace(path);
}

export type ScratchTargetOptions = {
  home?: () => string;
  uid?: () => number;
  probes?: Partial<LivenessProbes>;
  getFacts?: (ref: LivenessRef, graceHours: number) => LivenessFacts;
  remove?: (path: string, uid: number, ctx?: Context) => RemoveTreeResult;
};

const candidate = (
  ref: LivenessRef,
  verdict: Candidate["verdict"],
  reason: string,
  check: boolean | null,
  bytes: number | null,
): Candidate => ({
  id: ref.dir,
  path: ref.dir,
  verdict,
  reason,
  checks: [{ name: "session liveness", ok: check, detail: reason }],
  bytes,
  bytes_kind: "freed_now",
  action: { kind: "delete", argv: [ref.dir] },
  result: null,
});

const candidateBytes = (path: string): number | null => {
  const result = inspect(() => treeBytes(path));
  return result.ok ? result.value : null;
};

export function createScratchTarget(options: ScratchTargetOptions = {}) {
  const home = options.home ?? (() => process.env.HOME ?? homedir());
  const uid = options.uid ?? (() => process.getuid?.() ?? 0);
  const remove =
    options.remove ??
    ((path, ownerUid, ctx) =>
      removeTree(path, {
        uid: ownerUid,
        protection: {
          ownerTarget: "scratch",
          procDir: ctx?.procDir,
          repoRoots: [
            ...(ctx?.config.repo_roots ?? []),
            ...(ctx?.config.repos ?? []),
          ],
          protectedPaths: ctx?.config.protected ?? [],
          ignoreUnreadableProcs: ctx?.config.ignore_unreadable_procs ?? [],
        },
        progress: removeTreeProgress(path, null, ctx),
      }));
  const verdicts = {
    dead: "RECLAIM",
    live: "KEEP",
    unknown: "ASK",
  } satisfies Record<string, Candidate["verdict"]>;
  return {
    name: "scratch",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: (ctx) => {
      const snapshot =
        ctx.liveness ??
        createLivenessSnapshot(ctx.config, {
          home: home(),
          ...(options.probes === undefined ? {} : { probes: options.probes }),
        });
      return ctx.config.scratch_roots.flatMap((root) =>
        candidatesUnder(root).map((ref) => {
          const delegated = hasDelegatedWorkspace(ref.dir);
          if (!delegated.ok)
            return candidate(
              ref,
              "ASK",
              `cannot inspect scratch workspace markers: ${delegated.error}`,
              null,
              candidateBytes(ref.dir),
            );
          if (delegated.value)
            return candidate(
              ref,
              "KEEP",
              "delegated: jj workspace",
              false,
              candidateBytes(ref.dir),
            );
          const capturedFacts = inspect(() =>
            options.getFacts === undefined
              ? snapshot.facts(ref)
              : options.getFacts(ref, ctx.config.session_grace_hours),
          );
          if (!capturedFacts.ok)
            return candidate(
              ref,
              "ASK",
              `liveness facts unavailable: ${capturedFacts.error}`,
              null,
              candidateBytes(ref.dir),
            );
          const result = judge(ref, capturedFacts.value);
          const verdict = verdicts[result.verdict];
          const check = verdict === "ASK" ? null : verdict === "RECLAIM";
          return candidate(
            ref,
            verdict,
            result.evidence.join("; "),
            check,
            candidateBytes(ref.dir),
          );
        }),
      );
    },
    act: (item, ctx) => {
      if (item.path === null || item.verdict !== "RECLAIM")
        return {
          ok: false,
          bytes_freed: null,
          error: "scratch candidate is not reclaimable",
        };
      const result = remove(item.path, uid(), ctx);
      return {
        ok: result.ok,
        bytes_freed: result.ok ? result.statfs_bytes_freed : null,
        error: result.ok
          ? null
          : [
              ...result.refused.map((row) => `${row.path}: ${row.reason}`),
              ...result.errors.map((row) => `${row.path}: ${row.error}`),
            ].join("; "),
      };
    },
  } satisfies Target;
}

export const scratch = createScratchTarget();
