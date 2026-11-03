// The usage-percent thresholds behind every green / yellow / red load display. One declaration:
// the statusline maps the level to ANSI colors (tools/statusline/src/ansi.ts pctColor) and the
// herdr projector maps it to a sidebar token (cpu_lo / cpu_mid / cpu_hi) that herdr/config.toml
// styles. Neither consumer may restate these numbers.
export const USAGE_YELLOW_PCT = 70;
export const USAGE_RED_PCT = 90;

export type UsageLevel = "lo" | "mid" | "hi";

/** lo below `yellow`, mid from `yellow` below `red`, hi from `red` up. */
export function usageLevel(
  pct: number,
  yellow = USAGE_YELLOW_PCT,
  red = USAGE_RED_PCT,
): UsageLevel {
  if (pct >= red) return "hi";
  if (pct >= yellow) return "mid";
  return "lo";
}
