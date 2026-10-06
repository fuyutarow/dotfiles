// Progress for reclaim:purge's delete. A graveyard holds rip'd trees — cargo registries, worktrees,
// node_modules — so 5 GB is hundreds of thousands of entries, and `rm -rf` on them ran for minutes
// with nothing on screen after the 'yes' (a rented box, 2026-10-06). The unit is the ENTRY (file or
// directory), not the byte: `rm -v` reports one line per entry removed, so the bar counts exactly
// what rm does and needs no polling of du or df (df would lie under concurrent writers or snapshots).
// The bar itself is cli-progress (reclaim-purge.ts); a hand-drawn one wrapped on a narrow pane.
import { readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";

const readDir = fromThrowable((d: string): Dirent[] =>
  readdirSync(d, { withFileTypes: true }),
);

/** Every entry under `dir` (not `dir` itself), symlinks not followed — what `rm -r` will remove.
 *  An unreadable directory contributes its own entry only; rm will report it as an error. */
export function countEntries(dir: string): number {
  let n = 0;
  const stack = [dir];
  for (let d = stack.pop(); d !== undefined; d = stack.pop()) {
    const ents = readDir(d).unwrapOr([]);
    n += ents.length;
    const dirs = ents.filter((e) => e.isDirectory());
    stack.push(...dirs.map((e) => join(d, e.name)));
  }
  return n;
}

/** Lines in a chunk of rm -v output = entries rm reported removed. */
export const newlines = (chunk: Uint8Array): number =>
  chunk.reduce((n, b) => n + (b === 10 ? 1 : 0), 0);
