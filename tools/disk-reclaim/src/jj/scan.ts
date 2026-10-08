import { lstatSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";

export type Scan = {
  /** tracked files modified after the working-copy tree_state was written */
  newer: string[];
  /** entries with no tracked file under them that do not match regenerable_ignored */
  foreign: string[];
};

/** `target` matches by basename; `.julia/compiled` matches as a path suffix. */
export const regenerable = (rel: string, patterns: string[]): boolean =>
  patterns.some((p) =>
    p.includes("/") ? rel === p || rel.endsWith(`/${p}`) : basename(rel) === p,
  );

/**
 * Walk a workspace with jj's own tracked-file list as the oracle. After a fresh snapshot every
 * non-tracked entry is ignored, so ignored files need no .gitignore parser: each untracked entry
 * must be regenerable. Only directories that hold tracked files are descended.
 */
export function scanWorkspace(
  root: string,
  tracked: string[],
  patterns: string[],
  treeStateMs: number | null,
): Scan {
  const files = new Set(tracked);
  const dirs = new Set<string>();
  for (const file of tracked) {
    for (let i = file.indexOf("/"); i !== -1; i = file.indexOf("/", i + 1))
      dirs.add(file.slice(0, i));
  }
  const scan: Scan = { newer: [], foreign: [] };
  const visit = (rel: string) => {
    const names = fromThrowable(() =>
      readdirSync(rel === "" ? root : join(root, rel)),
    )();
    if (names.isErr()) {
      scan.foreign.push(`${rel.length > 0 ? rel : "."} (unreadable)`);
      return;
    }
    for (const name of names.value) {
      if (rel.length === 0 && (name === ".jj" || name === ".git")) continue;
      const child = rel === "" ? name : `${rel}/${name}`;
      const abs = join(root, child);
      const statResult = fromThrowable(() => lstatSync(abs))();
      if (statResult.isErr()) continue;
      const stat = statResult.value;
      if (
        files.has(child) &&
        treeStateMs !== null &&
        stat.mtimeMs > treeStateMs
      ) {
        scan.newer.push(child);
        continue;
      }
      if (files.has(child)) continue;
      if (dirs.has(child) && stat.isDirectory()) {
        visit(child);
        continue;
      }
      if (regenerable(child, patterns)) continue;
      if (stat.isDirectory() && !stat.isSymbolicLink() && isEmpty(abs))
        continue;
      scan.foreign.push(child);
    }
  };
  visit("");
  return scan;
}

function isEmpty(path: string): boolean {
  const entries = fromThrowable(() => readdirSync(path))();
  return entries.isOk() && entries.value.length === 0;
}
