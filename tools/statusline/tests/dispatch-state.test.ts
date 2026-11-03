import { afterAll, expect, test } from "bun:test";
import { routeLines } from "../src/dispatch-display.ts";
import { listingProgress } from "../src/dispatch-state.ts";
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

const rowOf = (over: Record<string, unknown>) => ({
  displayId: undefined,
  choice: "luna-high",
  label: "t",
  pickSource: "agx",
  phase: "working",
  workerSession: undefined,
  markerCostUsd: undefined,
  secs: 1,
  alive: true,
  dispatcherSession: "owner",
  doing: undefined,
  ...over,
});
const doing = (extra: Record<string, unknown>) => ({
  last: "x",
  commands: 1,
  files: 0,
  ageSecs: 1,
  ...extra,
});
const SGR = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");
const strip = (s: string) => s.replaceAll(SGR, "");
const costCell = (over: Record<string, unknown>) =>
  strip(routeLines([rowOf(over)], "owner")[0] ?? "");

test("running row without cost shows recorded token usage, not `not reported`", () => {
  const usage = { input: 88, cached: 5007579, output: 648 };
  expect(costCell({ doing: doing({ usage }) })).toContain(
    "5.0M cached · 648 out",
  );
  expect(costCell({ doing: doing({ usage }) })).not.toContain("not reported");
});

test("a reported cost wins over usage; ended or empty rows keep `not reported`", () => {
  const usage = { input: 88, cached: 5007579, output: 648 };
  expect(costCell({ doing: doing({ usage, costUsd: 0.5158216 }) })).toContain(
    "$0.52",
  );
  expect(costCell({ coreState: "ended", doing: doing({ usage }) })).toContain(
    "$n/a (not reported)",
  );
  expect(costCell({ doing: undefined })).toContain("$n/a (not reported)");
});

test("listingProgress carries agx's recorded usage and keeps cost null absent", () => {
  const d = listingProgress({
    last: "x",
    at: null,
    commands: 1,
    files: 0,
    cost_usd: null,
    session: null,
    usage: {
      input_tokens: 88,
      cached_input_tokens: 5007579,
      output_tokens: 648,
    },
  });
  expect(d?.usage).toEqual({ input: 88, cached: 5007579, output: 648 });
  expect(d?.costUsd).toBeUndefined();
});
