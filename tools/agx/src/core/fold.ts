import type { CoreEvent } from "./events.ts";
import type { Observer } from "./observe.ts";

export type RunView = {
  run_id: string;
  state:
    | "admitted"
    | "running"
    | "orphaned"
    | "done"
    | "returned"
    | "failed"
    | "timeout"
    | "abandoned"
    | "superseded";
  writes: string[];
  cwd: string;
  workspace_root: string;
  ticket: string;
  lineage: string;
  at: number;
  pid?: number;
  unit?: string;
  judged?: boolean;
};
export type LeasePolicy = { now?: number; orphan_after_ms?: number };

/** Pure fold. Missing terminal state is resolved only by the injected observer. */
export function runs(
  events: readonly CoreEvent[],
  observer: Observer,
): RunView[] {
  const folded = new Map<string, RunView>();
  for (const event of events) {
    const previous = folded.get(event.run_id);
    const run = previous ?? {
      run_id: event.run_id,
      state: "admitted" as const,
      writes: [],
      cwd: "",
      workspace_root: "",
      ticket: "",
      lineage: "",
      at: event.at ?? 0,
    };
    if (event.type === "admitted")
      Object.assign(run, {
        writes: event.writes,
        cwd: event.cwd,
        workspace_root: event.workspace_root,
        ticket: event.ticket,
        lineage: event.lineage,
        at: event.at ?? run.at,
      });
    if (event.type === "running")
      Object.assign(run, {
        state: "running",
        at: event.at ?? run.at,
        ...(event.pid === undefined ? {} : { pid: event.pid }),
        ...(event.unit === undefined ? {} : { unit: event.unit }),
      });
    if (event.type === "terminal")
      Object.assign(run, { state: event.outcome, at: event.at ?? run.at });
    if (event.type === "superseded")
      Object.assign(run, { state: "superseded", at: event.at ?? run.at });
    if (event.type === "judged")
      Object.assign(run, { judged: true, at: event.at ?? run.at });
    if (event.type === "disposed")
      Object.assign(run, { state: "abandoned", at: event.at ?? run.at });
    folded.set(event.run_id, run);
  }
  const result = [...folded.values()];
  for (const run of result) {
    if (run.state !== "admitted" && run.state !== "running") continue;
    run.state = observer(run) === "alive" ? "running" : "orphaned";
  }
  return result;
}

export const live = (
  events: readonly CoreEvent[],
  observer: Observer,
): RunView[] => runs(events, observer).filter((run) => run.state === "running");

/** Leases include observed live work and recent orphans; stale orphans release after 360 seconds. */
export function leases(
  events: readonly CoreEvent[],
  observer: Observer,
  policy: LeasePolicy = {},
): RunView[] {
  const now = policy.now ?? Temporal.Now.instant().epochMilliseconds;
  const age = policy.orphan_after_ms ?? 360_000;
  return runs(events, observer).filter(
    (run) =>
      run.state === "running" ||
      (run.state === "orphaned" && now - run.at < age),
  );
}
