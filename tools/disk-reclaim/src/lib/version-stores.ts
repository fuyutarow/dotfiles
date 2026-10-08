import { readdirSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";
import { resolveProcRoot } from "./procs.ts";

export type VersionStore = {
  readonly name: string;
  readonly dir: string;
  readonly pointer: string;
};
export const STORES: readonly VersionStore[] = [
  {
    name: "codex",
    dir: ".codex/packages/standalone/releases",
    pointer: ".codex/packages/standalone/current",
  },
  {
    name: "claude",
    dir: ".local/share/claude/versions",
    pointer: ".local/bin/claude",
  },
];
export type Release = {
  readonly name: string;
  readonly path: string;
  readonly mtimeSec: number;
};
const real = (path: string): string | undefined => {
  return fromThrowable(() => realpathSync(path))().unwrapOr(undefined);
};
export function readStore(
  home: string,
  store: VersionStore,
): { releases: Release[]; current: string | undefined } {
  const dir = join(home, store.dir);
  const names = fromThrowable(() => readdirSync(dir))()
    .map((entries) => entries.toSorted((a, b) => a.localeCompare(b)))
    .unwrapOr([]);
  const releases = names.flatMap((name): Release[] => {
    const path = join(dir, name);
    const stat = fromThrowable(() => statSync(path))();
    return stat.isOk()
      ? [{ name, path, mtimeSec: Math.floor(stat.value.mtimeMs / 1000) }]
      : [];
  });
  const target = real(join(home, store.pointer));
  const realDir = real(dir);
  const current =
    target === undefined || realDir === undefined
      ? undefined
      : releases.find((r) => {
          const entry = join(realDir, r.name);
          return target === entry || target.startsWith(`${entry}/`);
        })?.name;
  return { releases, current };
}
export function liveExecutables(
  procDir = resolveProcRoot(),
): string[] | undefined {
  const pids = fromThrowable(() => readdirSync(procDir))();
  if (pids.isErr()) return undefined;
  return pids.value
    .filter((p) => /^\d+$/u.test(p))
    .flatMap((pid) => {
      const executable = fromThrowable(() =>
        readlinkSync(join(procDir, pid, "exe")).replace(/ \(deleted\)$/u, ""),
      )();
      return executable.match(
        (path) => [path],
        () => [],
      );
    });
}
export function releasesToRemove(
  releases: readonly Release[],
  opts: {
    current: string | undefined;
    live: readonly string[] | undefined;
    nowSec: number;
    keepDays: number;
  },
): Release[] {
  const live = opts.live;
  if (opts.current === undefined || live === undefined) return [];
  const cutoff = opts.nowSec - opts.keepDays * 86400;
  return releases.filter(
    (r) =>
      r.name !== opts.current &&
      r.mtimeSec < cutoff &&
      !live.some((exe) => exe === r.path || exe.startsWith(`${r.path}/`)),
  );
}
