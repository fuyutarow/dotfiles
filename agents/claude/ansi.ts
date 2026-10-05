// Terminal vocabulary shared by the statusline and host-load.ts: ANSI codes, the EXPLICIT-ABSENCE
// n/a segment, and the usage-percent color thresholds. Split out of statusline-command.ts
// (2026-10-06) so a reader of host load needs none of the statusline's stdin machinery.

export const ESC = "\u001B";
export const RST = `${ESC}[0m`;
export const DIM = `${ESC}[2m`;
export const MID = "·"; //   meter middot
// EXPLICIT-ABSENCE law (owner ruling 2026-10-03: 「implicit display は本当によくない」). A value
// the bar could not take is printed as `<label> n/a (<why>)`, never left off the row: a missing
// segment reads as "there is nothing to show", which is a claim, and for a failed probe it is a
// false one (2026-10-03: a loaded host made nvidia-smi miss its 2 s bound, the miss was cached as
// "no GPU", and VRAM vanished while the card was fine). Absence stays silent ONLY where it means
// the thing does not exist (not a repo -> no branch; no model-scoped weekly cap -> no segment).
// rc:? above is the older instance of the same rule.
export const NA_COLOR = `${ESC}[38;5;178m`; // amber, same as rc:? — "unverified", not "bad"
export function naSegment(label: string, why: string): string {
  return `${label} ${NA_COLOR}n/a${RST} ${DIM}(${why})${RST}`;
}
// Usage-percent -> rounded int + threshold color (green <70 / yellow <90 / red >=90).
export function pctColor(i: number): string {
  if (i >= 90) return "38;5;167";
  if (i >= 70) return "38;5;178";
  return "38;5;71";
}
export function pctFmt(p: number): { pct: number; col: string } {
  const pct = Math.round(p);
  return { pct, col: pctColor(pct) };
}
