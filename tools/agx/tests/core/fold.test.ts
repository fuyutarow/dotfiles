import { expect, test } from "bun:test";
import { live, leases, runs } from "../../src/core/fold.ts";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import type { CoreEvent } from "../../src/core/events.ts";

const admitted = (
  overrides: Partial<Extract<CoreEvent, { type: "admitted" }>> = {},
): CoreEvent => {
  const event = {
    seq: 1,
    run_id: "run-1",
    type: "admitted",
    writes: ["src/**"],
    cwd: "/repo",
    workspace_root: "/repo",
    ticket: "ticket-1",
    lineage: "lineage-1",
    ...overrides,
  } satisfies Extract<CoreEvent, { type: "admitted" }>;
  return event;
};
const deadObserver = (): "dead" => "dead";
const liveObserver = (): "alive" => "alive";

test("live means observed live, not merely missing a terminal event", () => {
  const events: CoreEvent[] = [
    admitted(),
    { seq: 2, run_id: "run-1", type: "running", pid: 42 },
  ];
  expect(live(events, deadObserver)).toEqual([]);
  expect(runs(events, deadObserver)[0]?.state).toBe("orphaned");
});

test("an amended predecessor folds as superseded, not failed", () => {
  const events: CoreEvent[] = [
    admitted(),
    { seq: 2, run_id: "run-1", type: "superseded", by: "run-2" },
  ];

  expect(runs(events, deadObserver)[0]?.state).toBe("superseded");
});

test("legacy run without terminal or live pid releases its lease after 360 seconds", () => {
  const now = 1_797_000_000_000;
  const events: CoreEvent[] = [admitted({ at: now - 361_000 })];
  expect(
    leases(events, deadObserver, { now, orphan_after_ms: 360_000 }),
  ).toEqual([]);
});

test("an observed live process keeps its lease even without a terminal event", () => {
  const events: CoreEvent[] = [
    admitted(),
    { seq: 2, run_id: "run-1", type: "running", pid: 42 },
  ];
  expect(live(events, liveObserver)).toHaveLength(1);
  expect(leases(events, liveObserver)).toHaveLength(1);
});

test("fixture summary matches the supplied lifecycle snapshot facts", async () => {
  const schema = z.object({
    events: z.number(),
    admitted: z.number(),
    running: z.number(),
    terminal: z.number(),
    judged: z.number(),
    admitted_without_terminal: z.number(),
  });
  const fixture = jsonOf(schema).safeParse(
    await Bun.file(`${import.meta.dir}/lifecycle-summary-20261013.json`).text(),
  );
  expect(fixture.success).toBe(true);
  if (fixture.success)
    expect(fixture.data).toEqual({
      events: 469,
      admitted: 128,
      running: 127,
      terminal: 122,
      judged: 91,
      admitted_without_terminal: 7,
    });
});
