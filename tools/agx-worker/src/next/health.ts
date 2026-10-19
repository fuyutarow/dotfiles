import type { FoldedRun } from "./run-state.ts";

export function runHealth(
  run: Pick<
    FoldedRun,
    "state" | "ended_at" | "outcome" | "returned" | "judgment"
  >,
  legacy: boolean,
): string | undefined {
  if (run.state === "running" || run.judgment !== null) return undefined;
  if (run.outcome === "capacity") return undefined;
  // Pre-lease history (including imports) cannot establish modern lifecycle or
  // return guarantees. Missing metadata is not evidence that a run was lost.
  if (legacy) return undefined;
  if (run.ended_at === null && run.outcome === "lost") return "orphaned";
  // An absent flag identifies completions written before the return contract.
  // A modern completion needs one judgment, regardless of its return/outcome.
  if (run.ended_at !== null && run.returned !== undefined) return "unjudged";
  return undefined;
}
