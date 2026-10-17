import { expect, test } from "bun:test";
import { probeGpuVisibility } from "../src/gpu-visibility.ts";
test("CPU work skips GPU state; GPU work requires fresh owner state", async () => {
  expect(
    await probeGpuVisibility({
      requested: false,
      statePath: "/nonexistent/gpu.json",
    }),
  ).toBeUndefined();
  expect(
    await probeGpuVisibility({
      requested: true,
      statePath: "/nonexistent/gpu.json",
    }),
  ).toContain("stale");
});
