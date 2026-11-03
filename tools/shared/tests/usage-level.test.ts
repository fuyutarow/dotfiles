import { expect, test } from "bun:test";
import {
  USAGE_RED_PCT,
  USAGE_YELLOW_PCT,
  usageLevel,
} from "../src/usage-level.ts";

test("usage level boundaries: green <70, yellow 70-89, red >=90", () => {
  expect([USAGE_YELLOW_PCT, USAGE_RED_PCT]).toEqual([70, 90]);
  for (const [pct, level] of [
    [0, "lo"],
    [1, "lo"],
    [50, "lo"],
    [69, "lo"],
    [70, "mid"],
    [75, "mid"],
    [89, "mid"],
    [90, "hi"],
    [99, "hi"],
    [250, "hi"],
  ] as const)
    expect(usageLevel(pct)).toBe(level);
});

test("explicit thresholds override the defaults", () => {
  expect([
    usageLevel(0, 1, 5),
    usageLevel(1, 1, 5),
    usageLevel(5, 1, 5),
  ]).toEqual(["lo", "mid", "hi"]);
});
