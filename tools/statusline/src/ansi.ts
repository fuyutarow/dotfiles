// Terminal vocabulary shared by the statusline and host-load.ts: ANSI codes, the EXPLICIT-ABSENCE
// n/a segment, and the usage-percent color thresholds. Split out of the former Claude statusline
// (2026-10-06) so a reader of host load needs none of the statusline's stdin machinery.

// Presentation thresholds mirror the storage gate; tmp-headroom.test.ts enforces parity.
// Importing that executable gate here loads its shell parser on every statusline render.
export const TMP_INODE_WARN_PCT = 85;
export const TMP_INODE_DENY_PCT = 95;

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
export type Unavailable = { kind: "unknown"; reason: string };
export function unavailable(reason: string): Unavailable {
  // Upstream diagnostic text can itself contain the reserved absence token.
  const why = reason.trim().replaceAll(/\bn\/a\b/gu, "unavailable");
  return {
    kind: "unknown",
    reason: why === "" ? "unavailable" : why,
  };
}
/** The only renderer for an unavailable value; even empty runtime reasons are explicit. */
export function renderUnavailable(state: Unavailable): string {
  return `n/a (${unavailable(state.reason).reason})`;
}
/** Reject legacy presentation strings at cache boundaries before they reach either surface. */
export function hasBareUnavailable(value: string): boolean {
  const plain = value.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, "gu"), "");
  return /\bn\/a\b(?! \([^()\r\n])/u.test(plain);
}
export function naSegment(label: string, why: string): string {
  return roles.unavailable(label, unavailable(why));
}
// Usage-percent -> rounded int + threshold color (green <70 / yellow <90 / red >=90).
export function pctColor(i: number, yellow = 70, red = 90): string {
  if (i >= red) return "38;5;167";
  if (i >= yellow) return "38;5;178";
  return "38;5;71";
}
// Rate usage is colored by its pace through the reset window. Until 2% has elapsed,
// retain usage-threshold coloring because the ratio is too sensitive to a near-zero base.
export function paceColor(used: number, elapsed: number | undefined): string {
  if (used >= 90) return "38;5;167";
  if (elapsed === undefined || elapsed < 2) return pctColor(used);
  const pace = used / elapsed;
  if (pace > 1.5) return "38;5;167";
  if (pace > 1) return "38;5;178";
  return "38;5;71";
}
// Disk free-space colors are shared across every volume and use free percentage, not GiB.
export function diskFreeColor(freePercent: number | undefined): string {
  if (freePercent === undefined) return "38;5;71";
  if (freePercent < 10) return "38;5;167";
  if (freePercent < 20) return "38;5;178";
  return "38;5;71";
}
// Use the hook's thresholds directly, independently of the recoverer's reclaim trigger.
export function tmpInodeColor(usedPercent: number): string {
  if (usedPercent >= TMP_INODE_DENY_PCT) return "38;5;167";
  if (usedPercent >= TMP_INODE_WARN_PCT) return "38;5;178";
  return "38;5;71";
}
// Rate and Sys vocabulary: plain names/windows, threshold-colored values, dim supporting
// text/separators. Each styled part resets itself; never wrap an already-rendered segment.
export const roles = {
  label: (text: string) => text,
  window: (text: string) => text,
  value: (text: string, color: string) => `${ESC}[${color}m${text}${RST}`,
  secondary: (text: string) => `${DIM}${text}${RST}`,
  separator: (text = MID) => ` ${DIM}${text}${RST} `,
  unavailable: (label: string, state: Unavailable): string => {
    const text = renderUnavailable(state);
    const space = text.indexOf(" ");
    return `${roles.label(label)} ${roles.value(text.slice(0, space), pctColor(70))} ${roles.secondary(text.slice(space + 1))}`;
  },
};
// `text` is the percentage right-aligned to three columns ("  9", " 42", "100"): a value crossing
// 10 or 100 must not shift every segment after it — the row flickered as CPU went 12% -> 9%
// (owner 2026-10-06: 「一桁になると表示が縮む。チカチカする。等幅にしてほしい」).
export function pctFmt(p: number): { pct: number; col: string; text: string } {
  const pct = Math.round(p);
  return { pct, col: pctColor(pct), text: String(pct).padStart(2) };
}
