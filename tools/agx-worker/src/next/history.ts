import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { GradeCounts, Graded } from "../roster/index.ts";
import { stateDir, type foldedRuns } from "./store.ts";

type HistoryItem = {
  run: Awaited<ReturnType<typeof foldedRuns>>[number];
  comparable: boolean;
};
const count = (items: HistoryItem[]): GradeCounts => ({
  accepted: items.filter((item) => item.run.judgment?.decision === "accept")
    .length,
  partial: 0,
  rejected: items.filter((item) => item.run.judgment?.decision === "reject")
    .length,
});
const proposition = (brief: string) =>
  /^Proposition ([^:\n]+):/mu.exec(brief)?.[1];

/** Judgments, not exit codes, measure acceptance. The current log has no partial
 * judgment, so partial stays zero; unjudged returns never become successes.
 * Comparable is deliberately narrow: an identical recorded proposition.
 */
export async function gradedHistory(
  runs: Awaited<ReturnType<typeof foldedRuns>>,
  brief: string,
  nowMs = Temporal.Now.instant().epochMilliseconds,
): Promise<(row: string) => Graded> {
  const target = proposition(brief);
  const graded = await Promise.all(
    runs
      .filter(
        (run) =>
          run.state === "ended" &&
          run.judgment !== null &&
          run.outcome !== "capacity",
      )
      .map(async (run) => {
        const source =
          target === undefined
            ? null
            : await readFile(
                join(stateDir(), "runs", run.id, "brief.md"),
                "utf8",
              ).catch(() => null);
        return {
          run,
          comparable:
            target !== undefined &&
            source !== null &&
            proposition(source) === target,
        };
      }),
  );
  return (row) => {
    const own = graded.filter((item) => item.run.row === row);
    const comparable = own.filter((item) => item.comparable);
    return {
      here: count(own),
      recent: count(
        own.filter((item) => {
          if (item.run.ended_at === null) return false;
          const endedMs = Temporal.Instant.from(
            item.run.ended_at,
          ).epochMilliseconds;
          return endedMs <= nowMs && nowMs - endedMs <= 7 * 24 * 60 * 60 * 1000;
        }),
      ),
      ...(comparable.length === 0 ? {} : { comparable: count(comparable) }),
    };
  };
}
