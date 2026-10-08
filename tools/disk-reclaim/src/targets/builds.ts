import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";
import { protectedReason } from "../lib/protected.ts";
import type { Context, Target } from "./index.ts";
import { deleteTree, treeCandidate } from "./tree.ts";

const BUILD_NAMES = new Set([
  "target",
  "node_modules",
  "build",
  "dist",
  ".venv",
]);
function scan(root: string, depth = 0, device?: number): string[] {
  if (depth > 4 || !existsSync(root)) return [];
  const rootStat = fromThrowable(() => statSync(root))();
  if (rootStat.isErr()) return [];
  const rootDevice = device ?? rootStat.value.dev;
  if (rootStat.value.dev !== rootDevice) return [];
  const names = fromThrowable(() => readdirSync(root))().unwrapOr([]);
  return names.flatMap((name) => {
    const path = join(root, name);
    const stat = fromThrowable(() => statSync(path))();
    if (
      stat.isErr() ||
      !stat.value.isDirectory() ||
      stat.value.dev !== rootDevice
    )
      return [];
    if (BUILD_NAMES.has(name)) return [path];
    return scan(path, depth + 1, rootDevice);
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
    plan: (ctx: Context) =>
      scan(root())
        .toSorted()
        .flatMap((path) => {
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
            return [];
          if (reason !== null)
            return [
              {
                ...treeCandidate(
                  path,
                  `regenerable build output (kondo --all parity)`,
                ),
                verdict:
                  reason === "process paths are unknown"
                    ? ("ASK" as const)
                    : ("KEEP" as const),
                reason: `protected: ${reason}`,
                action: { kind: "delete" as const, argv: [] },
              },
            ];
          return [
            treeCandidate(
              path,
              "regenerable build output (kondo --all parity)",
            ),
          ];
        }),
    act: deleteTree,
  }) satisfies Target;
export const builds = createBuildsTarget();
