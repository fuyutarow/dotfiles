import { expect, test } from "bun:test";
import {
  GpuOutputSchema,
  gpuEstimate,
  gpuSampleInterval,
  type GpuSample,
} from "../../shared/src/gpu-samples.ts";
function row(ts: number, utilPct = 0): GpuSample {
  return {
    ts,
    utilPct,
    memUsedGiB: 0.25,
    memTotalGiB: 12,
    nextTs: ts + 60_000,
  };
}
test("exact NVIDIA outputs validate units and field order without inventing 100", () => {
  for (const output of ["0, 19, 255, 12288", "0 %, 19 %, 255 MiB, 12288 MiB"]) {
    expect(GpuOutputSchema.safeParse(output)).toEqual({
      success: true,
      data: { utilPct: 0, memUsedGiB: 255 / 1024, memTotalGiB: 12 },
    });
  }
  for (const output of [
    "[N/A], 19, 255, 12288",
    "0, [N/A], 255, 12288",
    "0, 19, [N/A], 12288",
    "0, 19, 255, [N/A]",
    "0,19,12289,12288",
    "101,19,255,12288",
    "0,19,,12288",
    "0,19,255,0",
  ])
    expect(GpuOutputSchema.safeParse(output).success).toBe(false);
});
test("averages are null below three samples and windows exclude old samples", () => {
  expect(gpuEstimate([], 0)).toBe("unknown");
  expect(gpuEstimate([row(0, 100), row(10_000)], 10_000)).toMatchObject({
    nowPct: 0,
    avg15Pct: null,
    avg60Pct: null,
    samples15: 2,
  });
  expect(
    gpuEstimate([row(0, 100), row(10_000), row(20_000)], 20_000),
  ).toMatchObject({ avg15Pct: 100 / 3, avg60Pct: 100 / 3, samples15: 3 });
  expect(
    gpuEstimate(
      [row(0, 100), row(910_000), row(920_000), row(930_000)],
      930_000,
    ),
  ).toMatchObject({ avg15Pct: 0, avg60Pct: 25, samples15: 3 });
});
test("owner interval is at least sixty seconds", () => {
  for (const random of [() => 0, () => 0.5, () => 1])
    expect(gpuSampleInterval(random)).toBe(60_000);
});
