// Version stores — where a self-updating CLI keeps one entry per release it ever installed, and a
// pointer that says which one is current. Nothing prunes them: each update adds an entry
// (measured 2026-10-06: codex 2 × 426 MB, claude 2 × 240 MB, 0.9 GB that no reclaim task saw).
// Consumers: reclaim-toolchains.ts (removes superseded entries) and reclaim-audit.ts (reports them).
//
// The safety predicate, in the same shape as reclaim-toolchains' vscode-server one, erring toward
// keeping whenever evidence is missing:
//   keep the entry the pointer resolves into (no pointer resolvable → keep ALL),
//   keep anything touched within KEEP_DAYS,
//   keep anything a live process is executing (no /proc → unknown → keep ALL) — a session started
//     before an update still runs the old binary.
// A new store is one row in STORES.

import { readdirSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";

export type VersionStore = {
  readonly name: string;
  /** home-relative directory holding one entry (file or directory) per release */
  readonly dir: string;
  /** home-relative symlink (or launcher link) that resolves into the current entry */
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

const real = (p: string): string | undefined =>
  fromThrowable(() => realpathSync(p))().unwrapOr(undefined);

/** The entries of a store, and the name of the one its pointer resolves into (if any). */
export function readStore(
  home: string,
  store: VersionStore,
): { releases: Release[]; current: string | undefined } {
  const dir = join(home, store.dir);
  const releases = fromThrowable(() => readdirSync(dir))()
    .unwrapOr([])
    .toSorted((a, b) => a.localeCompare(b))
    .flatMap((name): Release[] => {
      const path = join(dir, name);
      const st = fromThrowable(() => statSync(path))();
      return st.isOk()
        ? [{ name, path, mtimeSec: Math.floor(st.value.mtimeMs / 1000) }]
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

/** Real paths of every running process's executable; undefined where there is no /proc. */
export function liveExecutables(procDir = "/proc"): string[] | undefined {
  const pids = fromThrowable(() => readdirSync(procDir))();
  if (pids.isErr()) return undefined;
  return pids.value
    .filter((p) => /^\d+$/u.test(p))
    .flatMap((p) =>
      fromThrowable(() => readlinkSync(join(procDir, p, "exe")))()
        .map((exe) => [exe.replace(/ \(deleted\)$/u, "")])
        .unwrapOr([]),
    );
}

/** Superseded entries that are safe to remove (see the header for the predicate). */
export function releasesToRemove(
  releases: readonly Release[],
  opts: {
    current: string | undefined;
    live: readonly string[] | undefined;
    nowSec: number;
    keepDays: number;
  },
): Release[] {
  const { current, live } = opts;
  if (current === undefined || live === undefined) return [];
  const keepAfter = opts.nowSec - opts.keepDays * 86400;
  return releases
    .filter((r) => r.name !== current)
    .filter((r) => r.mtimeSec < keepAfter)
    .filter(
      (r) =>
        !live.some((exe) => exe === r.path || exe.startsWith(`${r.path}/`)),
    );
}
