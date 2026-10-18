import { err, fromThrowable, ok, type Result } from "neverthrow";
import { maybe, z } from "./zod.ts";
import {
  clockHM,
  localFromEpochSec,
  nowEpochSec,
  pad2,
  stampMDHM,
} from "./prompt-stamp.ts";
import { ESC, RST, paceColor, pctFmt, roles } from "./ansi.ts";
import type { Dataframe } from "./dataframe.ts";
import { codexRateSegment } from "./provider-display.ts";
import { jevUsageSegment } from "./provider-display.ts";
import { fieldDisplay, observed, type FieldDisplay } from "./field-state.ts";

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
const CapsSchema = z.lazy(() =>
  z.object({
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
                      model: maybe(
                        z.object({ display_name: maybe(z.string()) }),
                      ),
                    }),
                  ),
                }),
              ),
            ),
          }),
        ),
      }),
    ),
  }),
);
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

function elapsedPercent(
  reset: number,
  windowSeconds: number,
  now: number,
): number {
  const remaining = Math.max(0, reset - now);
  return Math.max(0, Math.min(100, (1 - remaining / windowSeconds) * 100));
}

function elapsedPct(reset: number, windowSeconds: number, now: number): number {
  return Math.round(elapsedPercent(reset, windowSeconds, now));
}

function usageText(
  pct: number,
  reset: number | undefined,
  windowSeconds: number,
  now: number,
): string {
  const { text } = pctFmt(pct);
  const elapsed =
    reset !== undefined ? elapsedPercent(reset, windowSeconds, now) : undefined;
  return roles.value(`${text}%`, paceColor(pct, elapsed));
}

// own; rateRow() puts the middot BETWEEN them, so a missing 5h window cannot leave "Rate: · 7d".
function rl5Segment(
  rl5: number,
  rl5Reset: number | undefined,
  now: number,
): string {
  let seg = `${roles.window("5h")} ${usageText(rl5, rl5Reset, FIVE_HOURS, now)}`;
  if (rl5Reset !== undefined)
    seg += ` ${roles.secondary(reset5(rl5Reset, now))}`;
  return seg;
}
// Rate row, 7d window: same shape as rl5Segment.
function rl7Segment(
  rl7: number,
  rl7Reset: number | undefined,
  now: number,
): string {
  let seg = `${roles.window("7d")} ${usageText(rl7, rl7Reset, SEVEN_DAYS, now)}`;
  if (rl7Reset !== undefined)
    seg += ` ${roles.secondary(reset7(rl7Reset, now))}`;
  return seg;
}
// Rate row, per-model weekly cap (e.g. "Fable 100% ⟳reset") — same reset7 shape as the 7d
// segment, since this window is also day-scale.
function rlModelSegment(m: ModelLimit, now: number): string {
  const { text: pct, col } = pctFmt(m.pct);
  let seg = `${roles.label(m.name)} ${roles.value(`${pct}%`, col)}`;
  if (m.resetEpoch !== undefined)
    seg += ` ${roles.secondary(reset7(m.resetEpoch, now))}`;
  return seg;
}
type RateFacts = Pick<
  Dataframe,
  | "rl5"
  | "rl5Reset"
  | "rl7"
  | "rl7Reset"
  | "rlModel"
  | "modelCapsWhy"
  | "codexRate"
  | "codexRateWhy"
  | "codexWindowMinutes"
  | "jevUsage"
  | "jevUsageWhy"
>;

function claudeRateSegment(
  df: RateFacts & Pick<Dataframe, "fields">,
  now: number,
  field: FieldDisplay,
): string {
  const rl5 = df.rl5;
  const rl7 = df.rl7;
  const capsAge = Math.max(
    0,
    ...df.rlModel.map((m) =>
      m.resetEpoch !== undefined && m.resetEpoch <= now
        ? (now - m.resetEpoch + 1) * 1000
        : 0,
    ),
  );
  const parts: string[] = [];
  const claude: string[] = [
    field(
      "claude-5h",
      "5h",
      observed(
        rl5 === undefined ? undefined : rl5Segment(rl5, df.rl5Reset, now),
        "input has no Claude 5h rate limit",
        df.rl5Reset !== undefined && df.rl5Reset <= now
          ? (now - df.rl5Reset + 1) * 1000
          : 0,
      ),
    ),
    field(
      "claude-7d",
      "7d",
      observed(
        rl7 === undefined ? undefined : rl7Segment(rl7, df.rl7Reset, now),
        "input has no Claude 7d rate limit",
        df.rl7Reset !== undefined && df.rl7Reset <= now
          ? (now - df.rl7Reset + 1) * 1000
          : 0,
      ),
    ),
  ];
  const claudeLabel = field(
    "claude-label",
    "claude",
    observed(
      rl5 !== undefined || rl7 !== undefined
        ? roles.label("claude")
        : undefined,
      "input has no Claude rate limits",
    ),
  );
  const claudeSeparator =
    rl5 === undefined &&
    rl7 === undefined &&
    df.fields?.["claude-label"]?.kind !== "stale"
      ? roles.separator()
      : " ";
  parts.push(
    `${claudeLabel}${claudeSeparator}${claude.join(roles.separator())}`,
    field(
      "model-caps",
      "model caps",
      observed(
        df.modelCapsWhy === undefined
          ? df.rlModel
              .map((m) => rlModelSegment(m, now))
              .join(roles.separator())
          : undefined,
        df.modelCapsWhy,
        capsAge,
      ),
    ),
  );
  return parts.filter((part) => part !== "").join(roles.separator());
}

// One builder for both the statusline and its snapshot. Every provider always owns one slot.
export const RATE_SOURCES = ["claude", "codex", "Jev"] as const;
export function rateRow(
  df: RateFacts & Pick<Dataframe, "sid" | "fields">,
  now = nowEpochSec(),
  sources: readonly (typeof RATE_SOURCES)[number][] = RATE_SOURCES,
  field: FieldDisplay = fieldDisplay(df.fields),
): string {
  const label = `${ESC}[38;5;108mRate:${RST}`;
  // Positive space: exactly one slot per source, in this fixed order. A renderer failure
  // belongs to its own slot; no early return or undefined filter can erase a provider.
  const slots = sources.map((source) => {
    const rendered = fromThrowable(() => {
      if (source === "claude") return claudeRateSegment(df, now, field);
      if (source === "codex") {
        const windows = new Set([
          ...(df.codexWindowMinutes ?? [10080]),
          ...(df.codexRate?.windows.map((w) => w.minutes) ?? []),
        ]);
        return [...windows]
          .toSorted((a, b) => a - b)
          .map((minutes) => {
            const window = df.codexRate?.windows.find(
              (w) => w.minutes === minutes,
            );
            const rate = df.codexRate;
            const age =
              rate === undefined
                ? 0
                : Math.max(
                    0,
                    Temporal.Now.instant().epochMilliseconds - rate.mtimeMs,
                  );
            return field(
              `codex:${minutes}`,
              "codex",
              observed(
                window === undefined || rate === undefined
                  ? undefined
                  : codexRateSegment(
                      { ...rate, windows: [window] },
                      undefined,
                      now,
                    ),
                df.codexRateWhy,
                age > 30_000 ? age : 0,
              ),
            );
          })
          .join(roles.separator());
      }
      return field(
        "jev",
        "Jev",
        observed(
          df.jevUsage?.costUsd === undefined
            ? undefined
            : jevUsageSegment(df.jevUsage),
          df.jevUsageWhy,
        ),
      );
    })().unwrapOr(undefined);
    if (rendered !== undefined && rendered.trim() !== "") return rendered;
    // A formatting failure has the same keys as a read failure, so it retains prior values.
    if (source === "claude")
      return `${field("claude-label", "claude", observed(undefined))}${roles.separator()}${[
        field("claude-5h", "5h", observed(undefined, "renderer unavailable")),
        field("claude-7d", "7d", observed(undefined, "renderer unavailable")),
        field(
          "model-caps",
          "model caps",
          observed(undefined, "renderer unavailable"),
        ),
      ].join(roles.separator())}`;
    if (source === "codex")
      return (df.codexWindowMinutes ?? [10080])
        .map((minutes) =>
          field(
            `codex:${minutes}`,
            "codex",
            observed(undefined, "renderer unavailable"),
          ),
        )
        .join(roles.separator());
    return field("jev", "Jev", observed(undefined, "renderer unavailable"));
  });
  // Provider boundaries use pipes; windows within each provider keep middots.
  return `${label} ${slots.join(roles.separator("|"))}`;
}
// Job row, admitted-work half: "<name>[+N] <elapsed> [orphan×N]" — extracted out of render() only
