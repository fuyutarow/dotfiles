import type { CoreEvent } from "./events.ts";

export type ObservedRun = { run_id: string; pid?: number; unit?: string };
export type Observer = (run: ObservedRun) => "alive" | "dead";

/** Observe a systemd unit when present, otherwise probe the recorded pid. */
export const observe: Observer = (run) => {
  if (run.unit !== undefined) {
    const result = Bun.spawnSync(
      ["systemctl", "--user", "is-active", "--quiet", run.unit],
      { stdout: "ignore", stderr: "ignore" },
    );
    return result.exitCode === 0 ? "alive" : "dead";
  }
  if (run.pid === undefined) return "dead";
  const result = Bun.spawnSync(["kill", "-0", String(run.pid)], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return result.exitCode === 0 ? "alive" : "dead";
};

export const runObservation = (
  events: readonly CoreEvent[],
  run_id: string,
): ObservedRun => {
  const run = events.findLast(
    (event) => event.run_id === run_id && event.type === "running",
  );
  if (run?.type !== "running") return { run_id };
  return {
    run_id,
    ...(run.pid === undefined ? {} : { pid: run.pid }),
    ...(run.unit === undefined ? {} : { unit: run.unit }),
  };
};
