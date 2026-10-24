import { clockHM, nowEpochSec, pad2, stampMDHM } from "./prompt-stamp.ts";
import { pctColor, roles, paceColor, pctFmt, unavailable } from "./ansi.ts";
import { formatCostUsd } from "../../shared/src/dispatch-pricing.ts";
import type { CodexRate } from "./codex-rate.ts";
import type { JevUsage } from "./jev-usage.ts";

function remaining(epoch: number, now: number): string {
  const seconds = Math.max(0, epoch - now);
  if (seconds >= 86400)
    return `${Math.floor(seconds / 86400)}d${Math.floor((seconds % 86400) / 3600)}h`;
  return `${Math.floor(seconds / 3600)}h${pad2(Math.floor((seconds % 3600) / 60))}m`;
}
export function codexRateSegment(
  rate: CodexRate | undefined,
  why?: string,
  now = nowEpochSec(),
  timeZone = Temporal.Now.timeZoneId(),
): string {
  if (rate === undefined) {
    return roles.unavailable(
      "codex",
      unavailable(why ?? "rate sample unavailable"),
    );
  }
  const parts = rate.windows.map((window) => {
    let label = `${window.minutes}m`;
    if (window.minutes === 300) label = "5h";
    if (window.minutes === 10080) label = "7d";
    const formatted = pctFmt(window.percent);
    const elapsed =
      window.reset === undefined || window.minutes <= 0
        ? undefined
        : Math.max(
            0,
            Math.min(
              100,
              (1 - Math.max(0, window.reset - now) / (window.minutes * 60)) *
                100,
            ),
          );
    let item = `${roles.label("codex")} ${roles.window(label)} ${roles.value(`${formatted.text}%`, paceColor(window.percent, elapsed))}`;
    if (window.reset !== undefined) {
      const local = Temporal.Instant.fromEpochMilliseconds(
        window.reset * 1000,
      ).toZonedDateTimeISO(timeZone);
      let stamp = stampMDHM(local);
      if (window.minutes === 300) stamp = clockHM(local);
      item += ` ${roles.secondary(`⟳${stamp}(${remaining(window.reset, now)} ${Math.round(elapsed ?? 0)}%)`)}`;
    }
    return item;
  });
  if (parts.length === 0)
    return roles.unavailable("codex", unavailable("no rate windows reported"));
  return parts.join(roles.separator());
}

export function codexCreditsSegment(rate: CodexRate): string | undefined {
  if (rate.credits === undefined) return undefined;
  const parts = [
    roles.label("codex"),
    roles.window("credits"),
    roles.value(rate.credits, pctColor(0)),
  ];
  if (rate.creditChange !== undefined) {
    const { delta, spanMs } = rate.creditChange;
    const absolute = Math.abs(delta);
    const change = delta < 0 ? `−${absolute}` : `+${absolute}`;
    const hours = Math.floor(spanMs / 3_600_000);
    const minutes = Math.floor((spanMs % 3_600_000) / 60_000);
    const span = minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`;
    parts.push(roles.secondary(`${change}/${span}`));
  }
  return parts.join(" ");
}

export function jevUsageSegment(
  usage: JevUsage | undefined,
  why?: string,
): string {
  if (usage?.costUsd === undefined)
    return roles.unavailable(
      "Jev",
      unavailable(why ?? "usage sample unavailable"),
    );
  const cost = formatCostUsd(usage.costUsd);
  // Seven-day spend: green below $1, yellow below $5, red at $5 and above.
  return `${roles.label("Jev")} ${roles.window("7d")} ${roles.secondary("spend")} ${roles.value(cost, pctColor(usage.costUsd, 1, 5))}`;
}
