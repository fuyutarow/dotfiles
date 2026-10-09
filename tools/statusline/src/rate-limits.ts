import { err, fromThrowable, ok, type Result } from "neverthrow";
import { z } from "./zod.ts";
import { maybe } from "./input.ts";
import {
  clockHM,
  localFromEpochSec,
  nowEpochSec,
  pad2,
  stampMDHM,
} from "./prompt-stamp.ts";
import { DIM, ESC, MID, NA_COLOR, RST, naSegment, pctFmt } from "./ansi.ts";
import type { Dataframe } from "./dataframe.ts";
import { codexRateSegment } from "./codex-rate.ts";
import { jevUsageSegment } from "./jev-usage.ts";

const RSET = "⟳";
// the account's own /usage screen ("Current week (Fable)"). This is NOT in the statusline's own
// stdin JSON at all (checked against the documented schema: `rate_limits` carries only
// five_hour/seven_day/spend_limit) — it lives only in this cache, under the generic
// `weekly_scoped` kind with a `scope.model.display_name`, because that is the same field
// Claude Code's own /usage view reads. Can be stale between whatever triggers Claude Code to
// refetch it; same trust level as account() just above, which reads the same file with no
// staleness check either.
export interface ModelLimit {
  name: string;
  pct: number;
  resetEpoch: number | undefined;
}
const CapsSchema = z.object({
  cachedUsageUtilization: maybe(
    z.object({
      utilization: maybe(
        z.object({
          limits: maybe(
            z.array(
              z.object({
                kind: maybe(z.string()),
                percent: maybe(z.number()),
                resets_at: maybe(z.string()),
                scope: maybe(
                  z.object({
                    model: maybe(z.object({ display_name: maybe(z.string()) })),
                  }),
                ),
              }),
            ),
          ),
        }),
      ),
    }),
  ),
});
export function modelWeeklyLimits(cj: unknown): Result<ModelLimit[], string> {
  const parsed = CapsSchema.safeParse(cj);
  if (!parsed.success)
    return err("~/.claude.json has an unexpected usage-limits shape");
  const limits = parsed.data.cachedUsageUtilization?.utilization?.limits ?? [];
  const out: ModelLimit[] = [];
  for (const l of limits) {
    if (
      l.kind !== "weekly_scoped" ||
      l.percent === null ||
      l.percent === undefined
    )
      continue;
    const name = l.scope?.model?.display_name;
    if (name === undefined || name === "") continue;
    // Instant.from demands an offset/`Z` (Date guessed local time for a bare one); a string it
    // rejects drops just the reset countdown, like an unparseable one always has.
    const resetsAt = l.resets_at;
    const epochMs =
      resetsAt !== undefined && resetsAt !== ""
        ? fromThrowable(
            () => Temporal.Instant.from(resetsAt).epochMilliseconds,
          )().unwrapOr(undefined)
        : undefined;
    out.push({
      name,
      pct: l.percent,
      resetEpoch:
        epochMs !== undefined ? Math.floor(epochMs / 1000) : undefined,
    });
  }
  return ok(out);
}
// 5h reset: epoch s -> "⟳HH:MM(<h>h<mm>m NN%)" — local clock, time remaining and elapsed share.
function reset5(epoch: number, now: number): string {
  const clock = clockHM(localFromEpochSec(epoch));
  const s = Math.max(0, epoch - now);
  const rem = `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`;
  return `${RSET}${clock}(${rem} ${elapsedPct(epoch, FIVE_HOURS, now)}%)`;
}

// 7d reset: epoch s -> "⟳MM-DD HH:MM(<d>d<hh>h NN%)" — date, clock, remaining and elapsed share.
// The 7d horizon spans days, so it carries a date (unlike 5h) and counts down in days+hours;
// inside the final day it drops to the 5h-style hours+minutes.
function reset7(epoch: number, now: number): string {
  const clock = stampMDHM(localFromEpochSec(epoch));
  const s = Math.max(0, epoch - now);
  const rem =
    s >= 86400
      ? `${Math.floor(s / 86400)}d${pad2(Math.floor((s % 86400) / 3600))}h`
      : `${Math.floor(s / 3600)}h${pad2(Math.floor((s % 3600) / 60))}m`;
  return `${RSET}${clock}(${rem} ${elapsedPct(epoch, SEVEN_DAYS, now)}%)`;
}

const FIVE_HOURS = 5 * 60 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;

function elapsedPct(reset: number, windowSeconds: number, now: number): number {
  const remaining = Math.max(0, reset - now);
  return Math.round(
    Math.max(0, Math.min(100, (1 - remaining / windowSeconds) * 100)),
  );
}

function usageColor(pct: number, elapsed: number | undefined): string {
  const { pct: rounded, col } = pctFmt(pct);
  return elapsed !== undefined && rounded > elapsed + 10 ? "38;5;178" : col;
}

function usageText(
  pct: number,
  reset: number | undefined,
  windowSeconds: number,
  now: number,
): string {
  const { text } = pctFmt(pct);
  const elapsed =
    reset !== undefined ? elapsedPct(reset, windowSeconds, now) : undefined;
  return `${ESC}[${usageColor(pct, elapsed)}m${text}%${RST}`;
}

// own; rateRow() puts the middot BETWEEN them, so a missing 5h window cannot leave "Rate: · 7d".
function rl5Segment(
  rl5: number,
  rl5Reset: number | undefined,
  now: number,
): string {
  let seg = `5h ${usageText(rl5, rl5Reset, FIVE_HOURS, now)}`;
  if (rl5Reset !== undefined) seg += ` ${DIM}${reset5(rl5Reset, now)}${RST}`;
  return seg;
}
// Rate row, 7d window: same shape as rl5Segment.
function rl7Segment(
  rl7: number,
  rl7Reset: number | undefined,
  now: number,
): string {
  let seg = `7d ${usageText(rl7, rl7Reset, SEVEN_DAYS, now)}`;
  if (rl7Reset !== undefined) seg += ` ${DIM}${reset7(rl7Reset, now)}${RST}`;
  return seg;
}
// Rate row, per-model weekly cap (e.g. "Fable 100% ⟳reset") — same reset7 shape as the 7d
// segment, since this window is also day-scale.
function rlModelSegment(m: ModelLimit, now: number): string {
  const { text: pct, col } = pctFmt(m.pct);
  let seg = `${m.name} ${ESC}[${col}m${pct}%${RST}`;
  if (m.resetEpoch !== undefined)
    seg += ` ${DIM}${reset7(m.resetEpoch, now)}${RST}`;
  return seg;
}
// Rate row: "Rate: 5h NN% ⟳… · 7d NN% ⟳… [· <Model> NN% ⟳…]". A window the payload does not carry
// reads `5h n/a`; a payload with none at all (before the first API response, or an account with
// no rate limits) reads `Rate: n/a (…)`. One builder for the bar and for the snapshot
// log-sys-snapshot.ts attaches.
export function rateRow(
  df: Pick<
    Dataframe,
    | "rl5"
    | "rl5Reset"
    | "rl7"
    | "rl7Reset"
    | "rlModel"
    | "modelCapsWhy"
    | "codexRate"
    | "codexRateWhy"
    | "jevUsage"
  >,
  now = nowEpochSec(),
): string {
  const label = `${ESC}[38;5;108mRate:${RST}`;
  if (
    (df.rl5 === null || df.rl5 === undefined) &&
    (df.rl7 === null || df.rl7 === undefined) &&
    df.rlModel.length === 0 &&
    df.codexRate === undefined &&
    df.codexRateWhy === undefined &&
    df.jevUsage === undefined
  )
    return `${label} ${NA_COLOR}n/a${RST} ${DIM}(no rate_limits in the payload)${RST}`;
  const hasClaudeRates =
    (df.rl5 !== null && df.rl5 !== undefined) ||
    (df.rl7 !== null && df.rl7 !== undefined);
  const parts: string[] = [];
  if (hasClaudeRates) {
    const claude: string[] = [
      df.rl5 !== null && df.rl5 !== undefined
        ? rl5Segment(df.rl5, df.rl5Reset, now)
        : `5h ${NA_COLOR}n/a${RST}`,
      df.rl7 !== null && df.rl7 !== undefined
        ? rl7Segment(df.rl7, df.rl7Reset, now)
        : `7d ${NA_COLOR}n/a${RST}`,
    ];
    parts.push(`claude ${claude.join(` ${DIM}${MID}${RST} `)}`);
  } else {
    parts.push(
      `claude 5h ${NA_COLOR}n/a${RST} ${DIM}${MID}${RST} 7d ${NA_COLOR}n/a${RST}`,
    );
  }
  for (const m of df.rlModel) parts.push(rlModelSegment(m, now));
  let row = `${label} ${parts.join(` ${DIM}${MID}${RST} `)}`;
  const codex = codexRateSegment(df.codexRate, df.codexRateWhy, now);
  if (codex !== "") row += ` ${DIM}|${RST} ${codex}`;
  if (df.jevUsage !== undefined) {
    const jev = jevUsageSegment(df.jevUsage);
    const detail = jev.slice("Jev ".length);
    row += ` ${DIM}|${RST} Jev ${DIM}${detail}${RST}`;
  }
  if (df.modelCapsWhy !== undefined && df.modelCapsWhy !== "")
    row += ` ${DIM}${MID}${RST} ${naSegment("model caps", df.modelCapsWhy)}`;
  // Provider boundaries use pipes; windows within each provider keep middots.
  return row;
}
// Job row, admitted-work half: "<name>[+N] <elapsed> [orphan×N]" — extracted out of render() only
