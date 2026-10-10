import { afterAll, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { routeLines, routeRuns, routeRunsAsync } from "../src/dispatch-runs.ts";
import { DIM, RST } from "../src/ansi.ts";
import { cleanupTempDirs, tempDir } from "./helpers.ts";

afterAll(cleanupTempDirs);

test("sync and async readers deduplicate by run_id, independent of filename", async () => {
  const base = tempDir("dispatch-migration-");
  for (const { dir, name, label } of [
    { dir: "agx", name: "new-name", label: "current" },
    { dir: "agent-router", name: "old-name", label: "duplicate" },
    { dir: "agent-router", name: "legacy", label: "legacy" },
  ]) {
    const active = join(base, dir, "active");
    mkdirSync(active, { recursive: true });
    const runId = label === "legacy" ? "legacy" : "same-run";
    writeFileSync(
      join(active, `${name}.json`),
      JSON.stringify({
        schema: 1,
        run_id: runId,
        pid: process.pid,
        label,
        choice: "luna-high",
        pick_source: "fixture",
        started_at: Temporal.Now.instant().toString(),
        cwd: base,
        dispatcher_session: "owner",
      }),
    );
    writeFileSync(
      join(active, `${runId}.progress.json`),
      JSON.stringify({
        schema: 1,
        at: Temporal.Now.instant().toString(),
        last: label,
        commands: 1,
        files: 0,
      }),
    );
  }
  const env = { XDG_STATE_HOME: base };
  for (const result of [routeRuns(env), await routeRunsAsync(env)]) {
    expect(result?.isOk()).toBe(true);
    if (result === undefined || result.isErr()) continue;
    expect(
      result.value.runs.map((run) => [run.label, run.doing?.last]),
    ).toEqual([
      ["current", "current"],
      ["legacy", "legacy"],
    ]);
  }
});

test("unattributed rows stay dim even with an absent or empty payload session", () => {
  const run = {
    displayId: undefined,
    choice: "luna-high",
    label: "hidden",
    pickSource: "fixture",
    phase: undefined,
    workerSession: undefined,
    markerCostUsd: undefined,
    secs: 1,
    alive: true,
    dispatcherSession: undefined,
    doing: undefined,
  };
  for (const session of [undefined, "", "owner"]) {
    expect(
      routeLines([run, { ...run, dispatcherSession: "" }], session),
    ).toEqual([`${DIM}unattributed 2${RST}`]);
  }
  expect(routeLines([], "owner")).toEqual([]);
});
