import { describe, expect, test } from "bun:test";
import {
  dispatchWarning,
  RoutingStatsSchema,
} from "../src/dispatch-warning.ts";
import recorded from "./fixtures/agx-c5-1.5.0.json";
import { decoded } from "./decode.ts";

// The release only reports unknown/unavailable. Affirmative capability is the
// coordinator-authorized forward-compatible case, not a recorded release fact.
const affirmative = {
  ...recorded,
  host: "fixture-host",
  jev: {
    ...recorded.jev,
    pick_count: 5,
    denominator: 5,
    codex_pick_count: 0,
    codex_share: 0,
  },
  routes: {
    ...recorded.routes,
    codex: { ...recorded.routes.codex, state: "available" },
  },
};
const warning = (value: unknown) =>
  dispatchWarning(decoded(RoutingStatsSchema, value), "fixture-host");

describe("statusline dispatch warning", () => {
  test("appears only with at least five recent Jev picks, no codex picks, and available codex route", () => {
    expect(warning(affirmative)).toBe("codex 0/5 picks ⚠");
    expect(
      warning({
        ...affirmative,
        jev: { ...affirmative.jev, pick_count: 6, denominator: 6 },
      }),
    ).toBe("codex 0/6 picks ⚠");
    expect(warning({ ...affirmative, fallback_count: 100 })).toBe(
      "codex 0/5 picks ⚠",
    );
    expect(warning({ ...affirmative, host: "elsewhere" })).toBeUndefined();
    expect(
      warning({
        ...affirmative,
        jev: { ...affirmative.jev, pick_count: 4, denominator: 4 },
      }),
    ).toBeUndefined();
    expect(
      warning({
        ...affirmative,
        jev: { ...affirmative.jev, codex_pick_count: 1, codex_share: 0.2 },
      }),
    ).toBeUndefined();
  });

  test("unknown capability stays hidden even with configuration, executable and subscription permission", () => {
    expect(warning({ ...recorded, host: "fixture-host" })).toBeUndefined();
    expect(
      warning({
        ...affirmative,
        routes: {
          codex: {
            ...recorded.routes.codex,
            state: "unknown",
            configured: true,
            executable: "present",
            subscription: { available: true },
          },
        },
      }),
    ).toBeUndefined();
  });

  test.each(["unavailable", "unknown", "future-state"])(
    "capability %s never implies availability",
    (state) => {
      expect(
        warning({ ...affirmative, routes: { codex: { state } } }),
      ).toBeUndefined();
    },
  );

  test("null share and an empty observation never become zero picks", () => {
    expect(
      warning({
        ...affirmative,
        jev: { ...affirmative.jev, codex_share: null },
      }),
    ).toBeUndefined();
    expect(
      warning({
        ...affirmative,
        jev: { denominator: 0, codex_pick_count: 0, codex_share: null },
      }),
    ).toBeUndefined();
  });

  test("unsupported schemas, missing facts and invalid counts are rejected", () => {
    for (const value of [
      { ...affirmative, schema: 2 },
      { ...affirmative, routes: {} },
      { ...affirmative, observation: { window: "7d", duration_ms: 604800000 } },
    ])
      expect(RoutingStatsSchema.safeParse(value).success).toBe(false);
    for (const denominator of [null, -1, "5", 1.5])
      expect(
        RoutingStatsSchema.safeParse({
          ...affirmative,
          jev: { ...affirmative.jev, denominator },
        }).success,
      ).toBe(false);
  });
});
