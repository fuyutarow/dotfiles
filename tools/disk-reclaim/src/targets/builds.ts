import { lstat, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { protectedReason } from "../lib/protected.ts";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { deleteTree, keepTreeCandidate, treeCandidate } from "./tree.ts";
import { BUILD_NAMES, discoverBuilds } from "./build-discovery.ts";

// Each build directory is sized by a bounded walk: a huge node_modules is a lower-bound
// estimate instead of the whole stage budget, and fast-first acting frees the small ones first.
const BUILD_SCAN_MAX_ENTRIES = 20_000;
const protection = (path: string, ctx: Context) =>
  protectedReason(path, {
    home: process.env["HOME"] ?? homedir(),
    procDir: ctx.procDir,
    repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
    protectedPaths: ctx.config.protected ?? [],
    ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
    processes: ctx.liveness,
  });
export const createBuildsTarget = (
  root: () => string = () =>
    process.env["KONDO_DIR"] ?? process.env["HOME"] ?? homedir(),
  discover: (
    root: string,
    ctx: Context,
  ) => string[] | Promise<string[]> = discoverBuilds,
  options: {
    includeOwned?: boolean;
    protection?: (
      path: string,
      ctx: Context,
    ) => string | null | Promise<string | null>;
    tree?: typeof treeCandidate;
    stat?: (
      path: string,
    ) => Promise<{ dev: number; isDirectory: () => boolean }>;
  } = {},
) => {
  const protect = options.protection ?? protection;
  const tree = options.tree ?? treeCandidate;
  const inspect = options.stat ?? stat;
  const completedPayloads = new WeakMap<Context, number>();
  return {
    name: "builds",
    tier: "blind",
    incremental: true,
    resumeCandidates: true,
    fastFirst: true,
    available: () => ({ available: true, skip_reason: null }),
    plan: async (ctx: Context) => {
      const rows: Candidate[] = [];
      const device = (await stat(root())).dev;
      for (const path of (await discover(root(), ctx)).toSorted()) {
        // Persisted discovery is a hint: moved, removed or symlinked paths are not candidates.
        const present = await fromAsyncThrowable(async () => {
          const current = await lstat(path);
          return (
            current.isDirectory() &&
            current.dev === device &&
            (await realpath(path)) === path
          );
        })();
        if (present.isErr() || !present.value) continue;
        const reason = await protect(path, ctx);
        if (
          options.includeOwned !== true &&
          (reason === "owned by rust target" ||
            reason === "owned by clean target")
        )
          continue;
        if (reason !== null)
          rows.push({
            ...(await keepTreeCandidate(
              path,
              `protected: ${reason}`,
              ctx,
              false,
            )),
            verdict:
              reason === "process paths are unknown"
                ? ("ASK" as const)
                : ("KEEP" as const),
            reason: `protected: ${reason}`,
            action: { kind: "delete" as const, argv: [] },
          });
        else
          rows.push(
            await tree(
              path,
              "regenerable build output (kondo --all parity)",
              ctx,
              ctx.mode === "run" ? 0 : BUILD_SCAN_MAX_ENTRIES,
            ),
          );
      }
      return rows;
    },
    recheck: async (candidate, ctx) => {
      const path = candidate.path;
      if (path === null || !BUILD_NAMES.has(basename(path))) return null;
      const rootStat = await fromAsyncThrowable(() => inspect(root()))();
      const pathStat = await fromAsyncThrowable(() => inspect(path))();
      if (
        rootStat.isErr() ||
        pathStat.isErr() ||
        !pathStat.value.isDirectory() ||
        pathStat.value.dev !== rootStat.value.dev
      )
        return null;
      const reason = await protect(path, ctx);
      if (reason !== null)
        return {
          ...candidate,
          verdict: reason === "process paths are unknown" ? "ASK" : "KEEP",
          reason: `protected: ${reason}`,
          action: { kind: "delete", argv: [] },
        };
      return tree(
        path,
        "regenerable build output (kondo --all parity)",
        ctx,
        ctx.mode === "run" ? 0 : BUILD_SCAN_MAX_ENTRIES,
      );
    },
    act: async (candidate, ctx) => {
      const result = await deleteTree(candidate, ctx);
      const completed = (completedPayloads.get(ctx) ?? 0) + 1;
      completedPayloads.set(ctx, completed);
      if ((await ctx.yieldForegroundLock?.(completed)) === true)
        ctx.log(
          `builds yielded after ${completed} payload actions for a foreground capacity waiter`,
        );
      return result;
    },
  } satisfies Target;
};
export const builds = createBuildsTarget();
