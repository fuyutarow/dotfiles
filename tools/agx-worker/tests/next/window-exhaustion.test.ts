import { expect, test } from "bun:test";
import { routeState } from "../../src/next/usage.ts";

const WEEK_SECONDS = 7 * 24 * 60 * 60;
const NOW_MS = Temporal.Instant.from("2026-10-23T00:00:00Z").epochMilliseconds;

// A fresh 7d window at the given used percent, resetting an hour from now.
function weekly(used_percent: number, measured_at = NOW_MS) {
  return {
    used_percent,
    resets_at: NOW_MS / 1000 + 3600,
    window_seconds: WEEK_SECONDS,
    measured_at,
  };
}

const expected = { "7d": WEEK_SECONDS };

test("default continue keeps a route at 100% available", () => {
  const state = routeState({ "7d": weekly(100) }, expected, NOW_MS);
  expect(state.exhausted).toBe(true);
  expect(state.available).toBe(true);
});

test("a route declared stop is vetoed at 100%", () => {
  const state = routeState({ "7d": weekly(100) }, expected, NOW_MS, "stop");
  expect(state.exhausted).toBe(true);
  expect(state.available).toBe(false);
});

test("a window below 100% is available under stop", () => {
  const state = routeState({ "7d": weekly(99) }, expected, NOW_MS, "stop");
  expect(state.exhausted).toBe(false);
  expect(state.available).toBe(true);
});

test("a stale window at 100% is neither exhausted nor vetoed", () => {
  const stale = weekly(100, NOW_MS - 16 * 60 * 1000);
  const state = routeState({ "7d": stale }, expected, NOW_MS, "stop");
  expect(state.exhausted).toBe(false);
  expect(state.available).toBe(true);
});
