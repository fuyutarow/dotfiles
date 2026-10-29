import { existsSync, readdirSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { fromThrowable } from "../../../shared/src/zod.ts";
import { protectedReason } from "../lib/protected.ts";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { deleteTree, treeCandidate } from "./tree.ts";
import { cachedDiscovery, checkScanDeadline } from "../lib/scan-cache.ts";

// Each build directory is sized by a bounded walk: a huge node_modules is a lower-bound
// estimate instead of the whole stage budget, and fast-first acting frees the small ones first.
const BUILD_SCAN_MAX_ENTRIES = 20_000;
const BUILD_NAMES = new Set([
  "target",
  "node_modules",
  "build",
  "dist",
  ".venv",
]);
function scan(
  root: string,
  depth = 0,
  device?: number,
  ctx?: Context,
): string[] {
  checkScanDeadline(ctx);
  if (depth > 4 || !existsSync(root)) return [];
  const rootStat = fromThrowable(() => statSync(root))();
  if (rootStat.isErr()) return [];
  const rootDevice = device ?? rootStat.value.dev;
  if (rootStat.value.dev !== rootDevice) return [];
  const names = fromThrowable(() => readdirSync(root))().unwrapOr([]);
  return names.flatMap((name) => {
    const path = join(root, name);
    const entry = fromThrowable(() => statSync(path))();
    if (
      entry.isErr() ||
      !entry.value.isDirectory() ||
      entry.value.dev !== rootDevice
    )
      return [];
    if (BUILD_NAMES.has(name)) return [path];
    return scan(path, depth + 1, rootDevice, ctx);
  });
}
const protection = (path: string, ctx: Context) =>
  protectedReason(path, {
    home: process.env.HOME ?? homedir(),
    procDir: ctx.procDir,
    repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
    protectedPaths: ctx.config.protected ?? [],
    ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
  });
export const createBuildsTarget = (
  root: () => string = () =>
    process.env.KONDO_DIR ?? process.env.HOME ?? homedir(),
  discover: (root: string, ctx: Context) => string[] = (path, ctx) =>
    scan(path, 0, undefined, ctx),
) => {
  const completedPayloads = new WeakMap<Context, number>();
  return {
    name: "builds",
    tier: "blind",
    fastFirst: true,
    available: () => ({ available: true, skip_reason: null }),
    plan: async (ctx: Context) => {
      const rows: Candidate[] = [];
      for (const path of cachedDiscovery(
        root(),
        "build-discovery-v1",
        ctx,
        () => discover(root(), ctx),
      ).toSorted()) {
        const reason = protection(path, ctx);
        if (
          reason === "owned by rust target" ||
          reason === "owned by clean target"
        )
          continue;
        if (reason !== null)
          rows.push({
            ...(await treeCandidate(
              path,
              `regenerable build output (kondo --all parity)`,
              ctx,
              BUILD_SCAN_MAX_ENTRIES,
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
            await treeCandidate(
              path,
              "regenerable build output (kondo --all parity)",
              ctx,
              BUILD_SCAN_MAX_ENTRIES,
            ),
          );
      }
      return rows;
    },
    recheck: async (candidate, ctx) => {
      const path = candidate.path;
      if (path === null || !BUILD_NAMES.has(basename(path))) return null;
      const rootStat = await fromAsyncThrowable(() => stat(root()))();
      const pathStat = await fromAsyncThrowable(() => stat(path))();
      if (
        rootStat.isErr() ||
        pathStat.isErr() ||
        !pathStat.value.isDirectory() ||
        pathStat.value.dev !== rootStat.value.dev
      )
        return null;
      const reason = protection(path, ctx);
      if (reason !== null)
        return {
          ...candidate,
          verdict: reason === "process paths are unknown" ? "ASK" : "KEEP",
          reason: `protected: ${reason}`,
          action: { kind: "delete", argv: [] },
        };
      return treeCandidate(
        path,
        "regenerable build output (kondo --all parity)",
        ctx,
        BUILD_SCAN_MAX_ENTRIES,
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
