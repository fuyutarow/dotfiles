import { expect, spyOn, test } from "bun:test";
import {
  GpuReadingSchema,
  GpuUnavailableSchema,
  GpuSchema,
  RunSchema,
  RunsSchema,
  LaneCountSchema,
  gpu,
  runningRuns,
  unattributedRuns,
  laneCount,
  type GpuReading,
  type GpuUnavailable,
  type Run,
  type Runs,
  type LaneCount,
} from "../src/index.ts";
import { validated } from "../src/schemas.ts";

test("public schemas reject the retired GPU contract and invalid counts/readings", async () => {
  const reading: GpuReading = {
    nowPct: 20,
    avg15Pct: null,
    avg60Pct: 30,
    samples15: 1,
    memUsedGiB: 2,
    memTotalGiB: 8,
  };
  const unavailable: GpuUnavailable = { unavailable: "no nvidia-smi" };
  const run: Run = { id: "run", lane: "theory", row: "terra" };
  const runs: Runs = [run];
  const count: LaneCount = 1;
  expect(GpuReadingSchema.safeParse(reading).success).toBe(true);
  expect(GpuUnavailableSchema.safeParse(unavailable).success).toBe(true);
  expect(RunSchema.safeParse(run).success).toBe(true);
  expect(RunsSchema.safeParse(runs).success).toBe(true);
  expect(LaneCountSchema.safeParse(count).success).toBe(true);
  for (const value of [
    "unknown",
    { utilPct: 20 },
    { ...reading, nowPct: 101 },
    { ...reading, memUsedGiB: 9 },
  ])
    expect(GpuSchema.safeParse(value).success).toBe(false);
  for (const value of [-1, 0.5, NaN])
    expect(LaneCountSchema.safeParse(value).success).toBe(false);
  expect(
    RunsSchema.safeParse([{ id: "run", lane: 3, row: "terra" }]).success,
  ).toBe(false);
  expect(await validated(LaneCountSchema, -1, 0)).toBe(0);
});

test("selectors return parsed data from their exported schemas", async () => {
  const ctx = { cwd: process.cwd(), repoRoot: process.cwd(), payload: {} };
  const parsedRuns = [{ id: "parsed", lane: "theory", row: "terra" }];
  const runs = spyOn(RunsSchema, "safeParse").mockReturnValue({
    success: true,
    data: parsedRuns,
  });
  expect(await runningRuns(ctx, { stateDirs: [] })).toBe(parsedRuns);
  expect(await unattributedRuns(ctx, { stateDirs: [] })).toBe(parsedRuns);
  runs.mockRestore();
  const count = spyOn(LaneCountSchema, "safeParse").mockReturnValue({
    success: true,
    data: 7,
  });
  expect(await laneCount(ctx, "theory", { stateDirs: [] })).toBe(7);
  count.mockRestore();
  const parsedGpu = { unavailable: "parsed" };
  const device = spyOn(GpuSchema, "safeParse").mockReturnValue({
    success: true,
    data: parsedGpu,
  });
  expect(await gpu(ctx, { path: "", fallbacks: [] })).toBe(parsedGpu);
  device.mockRestore();
});
