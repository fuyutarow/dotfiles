// Progress for reclaim:purge's delete. A graveyard holds rip'd trees — cargo registries, worktrees,
// node_modules — so 5 GB is hundreds of thousands of entries, and `rm -rf` on them ran for minutes
// with nothing on screen after the 'yes' (a rented box, 2026-10-06). The unit is the ENTRY (file or
// directory), not the byte: `rm -v` reports one line per entry removed, so the bar counts exactly
// what rm does and needs no polling of du or df (df would lie under concurrent writers or snapshots).
import { readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";

const readDir = fromThrowable((d: string): Dirent[] =>
  readdirSync(d, { withFileTypes: true }),
);
const fmt = (x: number): string => x.toLocaleString("en-US");

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

const BAR_MAX = 20;
const BAR_MIN = 5;

/** `[######--------------]  30%  183,204/600,112 件  12s`, at most `cols` display columns wide —
 *  done is capped at total (a name with a newline makes rm -v print two lines for one entry).
 *
 *  The line must fit the terminal: a redraw with \r returns to the start of the CURRENT row only,
 *  so a line that wraps leaves its first row behind on every frame (a ~55-column herdr pane,
 *  2026-10-06, showed the frames strung along one row). Width is measured in display columns
 *  (件 is two), the bar shrinks first and goes when under BAR_MIN, and the bar is ASCII: █ and ░
 *  are East Asian Ambiguous width, two columns in a CJK-locale terminal, which no width count
 *  here can know. */
export function progressLine(
  done: number,
  total: number,
  ms: number,
  cols = Number.POSITIVE_INFINITY,
): string {
  const d = Math.min(done, total);
  const frac = total === 0 ? 1 : d / total;
  const pct = String(Math.floor(frac * 100)).padStart(3);
  const text = `${pct}%  ${fmt(d)}/${fmt(total)} 件  ${Math.round(ms / 1000)}s`;
  const width = Math.min(BAR_MAX, cols - Bun.stringWidth(text) - 3);
  if (width < BAR_MIN) return fit(text, cols);
  const fill = Math.round(frac * width);
  return `[${"#".repeat(fill)}${"-".repeat(width - fill)}] ${text}`;
}

/** `s` cut to at most `cols` display columns. */
function fit(s: string, cols: number): string {
  let out = "";
  for (const ch of s) {
    if (Bun.stringWidth(out + ch) > cols) break;
    out += ch;
  }
  return out;
}
