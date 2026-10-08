import { describe, expect, test } from "bun:test";
import { sampleRow } from "../src/selection.ts";

describe("seeded row selection", () => {
  test("1000 fixed seeds track the probability distribution", () => {
    const counts = new Map<string, number>();
    const draws = 1000;
    for (let i = 0; i < draws; i++) {
      const sample = sampleRow(
        { "luna-high": 0.75, "luna-low": 0.25 },
        1,
        `draw-${i}`,
      );
      if (sample === undefined) {
        expect(sample).toBeDefined();
        continue;
      }
      counts.set(sample.row, (counts.get(sample.row) ?? 0) + 1);
      expect(sample.probability).toBeCloseTo(
        sample.row === "luna-high" ? 0.75 : 0.25,
      );
    }
    expect(
      Math.abs((counts.get("luna-high") ?? 0) / draws - 0.75),
    ).toBeLessThan(0.05);
    expect(Math.abs((counts.get("luna-low") ?? 0) / draws - 0.25)).toBeLessThan(
      0.05,
    );
  });

  test("the same seed reproduces the same draw", () => {
    const probabilities = { "luna-high": 0.75, "luna-low": 0.25 };
    expect(sampleRow(probabilities, 1, "repeatable")).toEqual(
      sampleRow(probabilities, 1, "repeatable"),
    );
  });

  test("temperature zero is argmax", () => {
    const probabilities = { "luna-high": 0.75, "luna-low": 0.25 };
    expect(sampleRow(probabilities, 0, "any-seed")).toMatchObject({
      row: "luna-high",
      argmaxRow: "luna-high",
      probability: 1,
      mode: "argmax",
    });
  });
});
