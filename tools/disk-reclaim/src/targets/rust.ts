import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Context, Target } from "./index.ts";
import { deleteTree, treeCandidate } from "./tree.ts";
import { busyCwds } from "../lib/busy.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";

function findTargets(root: string, depth = 0): string[] {
  if (depth > 4) return [];
  const names = fromThrowable(() => readdirSync(root))()
    .map((entries) => entries.toSorted())
    .unwrapOr([]);
  return names.flatMap((name) => {
    const path = join(root, name);
    const stat = fromThrowable(() => statSync(path))();
    if (stat.isErr() || !stat.value.isDirectory()) return [];
    if (name === "target") return [path];
    return findTargets(path, depth + 1);
  });
}
function lastBuilt(path: string): number | undefined {
  const own = fromThrowable(() => statSync(path))();
  if (own.isErr()) return undefined;
  const entries = fromThrowable(() => readdirSync(path))();
  if (entries.isErr()) return undefined;
  return Math.floor(
    Math.max(
      own.value.mtimeMs,
      ...entries.value.map((name) =>
        fromThrowable(() => statSync(join(path, name)).mtimeMs)().unwrapOr(0),
      ),
    ) / 1000,
  );
}
export const createRustTarget = (
  root: () => string = () =>
    process.env.AUDIT_PROJECTS ??
    join(process.env.HOME ?? homedir(), "Workspace"),
  getBusyCwds: (procDir?: string) => string[] | undefined = busyCwds,
) =>
  ({
    name: "rust",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: (ctx: Context) => {
      const keepDays = Number(
        process.env.RUST_TARGET_DAYS ??
          (Bun.which("sccache") === null ? "30" : "7"),
      );
      const busy = getBusyCwds(ctx.procDir);
      const cutoff =
        Math.floor(Temporal.Now.instant().epochMilliseconds / 1000) -
        keepDays * 86400;
      return findTargets(root()).flatMap((path) => {
        const project = dirname(path);
        const manifest = fromThrowable(() =>
          statSync(join(project, "Cargo.toml")),
        )();
        if (manifest.isErr() || !manifest.value.isFile()) return [];
        const built = fromThrowable(() => lastBuilt(path))();
        if (
          built.isErr() ||
          built.value === undefined ||
          built.value >= cutoff ||
          busy === undefined
        )
          return [];
        const active = busy.some(
          (cwd) => cwd === project || cwd.startsWith(`${project}/`),
        );
        if (active) return [];
        return [
          treeCandidate(
            path,
            `Rust target older than ${keepDays} days; project idle`,
          ),
        ];
      });
    },
    act: deleteTree,
  }) satisfies Target;
export const rust = createRustTarget();
