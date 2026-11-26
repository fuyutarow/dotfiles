// Row 4 of an agent's sidebar entry: shown only when there is something to act on.
//
// Errors are failures the projector met while reading this pane's sources, each a better-result
// TaggedError so a reader branches on `_tag`, never on message text. Warnings are this session's
// workers (agx runs) and background shells that have been running for LONG_RUNNING_MS or more.
// With neither, both tokens are cleared and herdr drops the row.
import { matchError, TaggedError } from "@dotfiles/shared/src/result.ts";

/** A worker or shell running this long gets a warning. */
export const LONG_RUNNING_MS = 12 * 60_000;
/**
 * Marks the error row. A text glyph, one cell wide, that takes the row's own color: the heavy
 * `✖` (U+2716) is drawn from the emoji font, in that font's color and wider than its cell, so it
 * ignored the red and ran into the first word.
 */
const ERROR_MARK = "✗";
/** Text cells on an agent row (see ROW3_FIT_WIDTH in herdr-projector.ts). */
const ROW_CELLS = 44;

export class SessionRecordUnavailable extends TaggedError(
  "SessionRecordUnavailable",
)<{ why: string; message: string }> {}
export class ResourceSnapshotUnavailable extends TaggedError(
  "ResourceSnapshotUnavailable",
)<{ message: string }> {}
export class AgxUnavailable extends TaggedError("AgxUnavailable")<{
  message: string;
}> {}
export class ShellScanUnavailable extends TaggedError("ShellScanUnavailable")<{
  why: string;
  message: string;
}> {}

/** Row 2 drew `?` for the model: the session record names no model, no effort, or neither. */
export class ModelUnobserved extends TaggedError("ModelUnobserved")<{
  missing: "model" | "effort" | "model and effort";
  message: string;
}> {}

export type PaneError =
  | ModelUnobserved
  | SessionRecordUnavailable
  | ResourceSnapshotUnavailable
  | AgxUnavailable
  | ShellScanUnavailable;

/** Something running, by kind, id and start. */
export type Running = { kind: "wkr" | "sh"; id: string; startedAt: string };

const errorText = (error: PaneError): string =>
  matchError(error, {
    ModelUnobserved: (e) => `${e.missing} unobserved`,
    SessionRecordUnavailable: (e) => `session ${e.why}`,
    ResourceSnapshotUnavailable: () => "agent-cpu unavailable",
    AgxUnavailable: () => "agx unavailable",
    ShellScanUnavailable: (e) => `sh ${e.why}`,
  });

const minutes = (ms: number): string => `${Math.floor(ms / 60_000)}m`;

/** Whole parts joined by " · ", dropping parts from the right into "+N" to fit ROW_CELLS. */
function fit(lead: string, parts: readonly string[]): string {
  for (let kept = parts.length; kept >= 0; kept -= 1) {
    const rest = parts.length - kept;
    const text = [
      lead,
      [...parts.slice(0, kept), ...(rest > 0 ? [`+${rest}`] : [])].join(" · "),
    ].join(" ");
    if (Bun.stringWidth(text) <= ROW_CELLS || kept === 0) return text;
  }
  return lead;
}

/** The row-4 token arguments: set the error and warning tokens that apply, clear the rest. */
export function alertTokenArgs(
  errors: readonly PaneError[],
  running: readonly Running[],
  now: number,
): string[] {
  const long = running
    .map((item) => ({
      item,
      age: now - Temporal.Instant.from(item.startedAt).epochMilliseconds,
    }))
    .filter(({ age }) => age >= LONG_RUNNING_MS)
    .toSorted((a, b) => b.age - a.age)
    .map(
      ({ item, age }) =>
        `${item.kind === "sh" ? `sh_${item.id}` : `wkr ${item.id.slice(0, 8)}`} ${minutes(age)}`,
    );
  return [
    ...(errors.length === 0
      ? ["--clear-token", "alert_err"]
      : [
          "--token",
          `alert_err=${fit(
            ERROR_MARK,
            errors.map((error) => errorText(error)),
          )}`,
        ]),
    ...(long.length === 0
      ? ["--clear-token", "alert_warn"]
      : ["--token", `alert_warn=${fit("⚠️", long)}`]),
  ];
}
