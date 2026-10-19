import type { ListedRun } from "./run-state.ts";
import { fromThrowable } from "neverthrow";
/** Observation-time elapsed values belong to the machine producer, not its reader. */
export function listingRows(rows: ListedRun[], at = Temporal.Now.instant()) {
  return rows.map((row) => {
    const elapsed = fromThrowable(() =>
      Math.max(
        0,
        Math.floor(
          (row.ended_at === null ? at : Temporal.Instant.from(row.ended_at))
            .since(Temporal.Instant.from(row.started_at))
            .total("seconds"),
        ),
      ),
    )().unwrapOr(undefined);
    return Object.assign({}, row, { elapsed_seconds: elapsed });
  });
}
/** Core-owned counts; empty dispatcher identities are unattributed. */
export function runningSummary(
  rows: { state: string; dispatcher_session: string | null }[],
) {
  const live = rows.filter((row) => row.state === "running");
  const attributed = live.flatMap((row) =>
    row.dispatcher_session === null || row.dispatcher_session.trim() === ""
      ? []
      : [row.dispatcher_session],
  );
  return {
    running: live.length,
    unattributed: live.length - attributed.length,
    sessions: Object.fromEntries(
      [...new Set(attributed)].map((session) => {
        const here = attributed.filter(
          (identity) => identity === session,
        ).length;
        return [session, { here, other: live.length - here }];
      }),
    ),
    noSession: { here: 0, other: live.length },
  };
}
