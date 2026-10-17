import { expect, test } from "bun:test";
import { runningSummary } from "../../src/next/run.ts";

test("core running summary excludes ended rows and counts empty identities as unattributed", () => {
  const rows = ["here", "here", "elsewhere", null, "", " "].map(
    (dispatcher_session) => ({ state: "running", dispatcher_session }),
  );
  expect(
    runningSummary([...rows, { state: "ended", dispatcher_session: "here" }]),
  ).toEqual({
    running: 6,
    unattributed: 3,
    sessions: { here: { here: 2, other: 4 }, elsewhere: { here: 1, other: 5 } },
    noSession: { here: 0, other: 6 },
  });
  expect(runningSummary([])).toEqual({
    running: 0,
    unattributed: 0,
    sessions: {},
    noSession: { here: 0, other: 0 },
  });
});
