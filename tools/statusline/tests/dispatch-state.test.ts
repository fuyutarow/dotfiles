import { afterAll, expect, test } from "bun:test";
import { routeLines } from "../src/dispatch-runs.ts";
import { cleanupTempDirs } from "./helpers.ts";

afterAll(cleanupTempDirs);

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
      routeLines([run, { ...run, dispatcherSession: "" }], session, 0, {
        running: 2,
        here: 0,
        other: 2,
        lost: 0,
        unattributed: 2,
      }),
    ).toEqual([]);
  }
  expect(
    routeLines([], "owner", 0, {
      running: 0,
      here: 0,
      other: 0,
      lost: 0,
      unattributed: 0,
    }),
  ).toEqual([]);
});
