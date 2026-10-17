import { fromThrowable } from "neverthrow";
import type { FoldedRun } from "./run-state.ts";

export function runHealth(
  run: Pick<
    FoldedRun,
    "state" | "ended_at" | "outcome" | "returned" | "judgment"
  >,
  legacy: boolean,
  now = Temporal.Now.instant(),
): string | undefined {
  let kind: string | undefined;
  if (run.state === "running") return undefined;
  // Pre-lease history (including imports) cannot establish modern lifecycle or
  // return guarantees. Missing metadata is not evidence that a run was lost.
  if (legacy) kind = "legacy";
  else if (run.ended_at === null && run.outcome === "lost") kind = "orphaned";
  else if (run.ended_at !== null && run.returned !== true)
    kind = "missing-return";
  else if (
    run.state === "ended" &&
    run.judgment === null &&
    run.ended_at !== null
  )
    kind = unjudgedFinding(run.ended_at, now);
  return kind;
}

function unjudgedFinding(
  endedAt: string,
  now: Temporal.Instant,
): string | undefined {
  const parsed = fromThrowable(() => Temporal.Instant.from(endedAt))();
  return parsed.isOk() && now.since(parsed.value).total({ unit: "hours" }) > 24
    ? "unjudged"
    : undefined;
}
