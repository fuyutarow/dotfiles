import { readlink, readdir, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
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
const real = async (path: string): Promise<string | undefined> => {
  return (await fromAsyncThrowable(() => realpath(path))()).unwrapOr(undefined);
};
export async function readStore(
  home: string,
  store: VersionStore,
): Promise<{ releases: Release[]; current: string | undefined }> {
  const dir = join(home, store.dir);
  const names = (await fromAsyncThrowable(() => readdir(dir))())
    .map((entries) => entries.toSorted((a, b) => a.localeCompare(b)))
    .unwrapOr([]);
  const releases = (
    await Promise.all(
      names.map(async (name): Promise<Release[]> => {
        const path = join(dir, name);
        const info = await fromAsyncThrowable(() => stat(path))();
        return info.isOk()
          ? [{ name, path, mtimeSec: Math.floor(info.value.mtimeMs / 1000) }]
          : [];
      }),
    )
  ).flat();
  const [target, realDir] = await Promise.all([
    real(join(home, store.pointer)),
    real(dir),
  ]);
  const current =
    target === undefined || realDir === undefined
      ? undefined
      : releases.find((r) => {
          const entry = join(realDir, r.name);
          return target === entry || target.startsWith(`${entry}/`);
        })?.name;
  return { releases, current };
}
export async function liveExecutables(
  procDir = resolveProcRoot(),
): Promise<string[] | undefined> {
  const pids = await fromAsyncThrowable(() => readdir(procDir))();
  if (pids.isErr()) return undefined;
  return (
    await Promise.all(
      pids.value
        .filter((p) => /^\d+$/u.test(p))
        .map(async (pid) => {
          const executable = await fromAsyncThrowable(() =>
            readlink(join(procDir, pid, "exe")),
          )();
          return executable
            .map((path) => [path.replace(/ \(deleted\)$/u, "")])
            .unwrapOr([]);
        }),
    )
  ).flat();
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
