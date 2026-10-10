import { expect, test } from "bun:test";
import { progressIntervalMs, progressThrottle } from "../src/progress.ts";

test("progress defaults to five minutes and accepts a positive seconds override", () => {
  expect(progressIntervalMs({})).toBe(300_000);
  expect(progressIntervalMs({ AGX_PROGRESS_EVERY_S: "45" })).toBe(45_000);
  expect(progressIntervalMs({ AGX_PROGRESS_EVERY_S: "0" })).toBe(300_000);
});

test("waiting messages are throttled to one per configured interval", () => {
  let current = 0;
  const shouldReport = progressThrottle(300_000, () => current);

  expect(shouldReport()).toBe(true);
  current = 299_999;
  expect(shouldReport()).toBe(false);
  current = 300_000;
  expect(shouldReport()).toBe(true);
  current = 599_999;
  expect(shouldReport()).toBe(false);
  current = 600_000;
  expect(shouldReport()).toBe(true);
});
