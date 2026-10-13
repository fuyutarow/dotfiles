import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";
import { protectedReason } from "../lib/protected.ts";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { deleteTree, treeCandidate } from "./tree.ts";
import { cachedDiscovery, checkScanDeadline } from "../lib/scan-cache.ts";

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
export const createBuildsTarget = (
  root: () => string = () =>
    process.env.KONDO_DIR ?? process.env.HOME ?? homedir(),
) =>
  ({
    name: "builds",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: async (ctx: Context) => {
      const rows: Candidate[] = [];
      for (const path of cachedDiscovery(
        root(),
        "build-discovery-v1",
        ctx,
        () => scan(root(), 0, undefined, ctx),
      ).toSorted()) {
        const reason = protectedReason(path, {
          home: process.env.HOME ?? homedir(),
          procDir: ctx.procDir,
          repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
          protectedPaths: ctx.config.protected ?? [],
          ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
        });
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
            ),
          );
      }
      return rows;
    },
    act: deleteTree,
  }) satisfies Target;
export const builds = createBuildsTarget();
