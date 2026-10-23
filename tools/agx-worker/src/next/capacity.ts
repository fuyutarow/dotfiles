import type { Choice } from "../roster/index.ts";
import type { FoldedRun } from "./run-state.ts";
import { fromThrowable } from "neverthrow";

// Five minutes prevents immediate redispatch loops while permitting recovery without intervention.
export const CAPACITY_COOLDOWN_MS = 300_000;

export function capacityRows(
  runs: readonly Pick<FoldedRun, "row" | "outcome" | "ended_at">[],
  choices: readonly Choice[],
  nowMs = Temporal.Now.instant().epochMilliseconds,
): Set<string> {
  const rows = new Set<string>();
  for (const run of runs) {
    if (run.outcome !== "capacity" || run.ended_at === null) continue;
    const ended = fromThrowable(
      () => Temporal.Instant.from(run.ended_at ?? "").epochMilliseconds,
    )();
    if (!ended.isOk()) continue;
    const ageMs = nowMs - ended.value;
    if (!(ageMs >= 0 && ageMs < CAPACITY_COOLDOWN_MS)) continue;
    rows.add(run.row);
    const failed = choices.find((row) => row.id === run.row);
    // Effort variants still hit the same vendor model's capacity limit.
    if (failed === undefined) continue;
    choices
      .filter((row) => row.route === failed.route && row.model === failed.model)
      .forEach((row) => {
        rows.add(row.id);
      });
  }
  return rows;
}
