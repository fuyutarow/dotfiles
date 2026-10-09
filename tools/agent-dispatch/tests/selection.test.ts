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
        sample.row === "luna-high" ? 0.725 : 0.275,
      );
    }
    expect(
      Math.abs((counts.get("luna-high") ?? 0) / draws - 0.725),
    ).toBeLessThan(0.05);
    expect(
      Math.abs((counts.get("luna-low") ?? 0) / draws - 0.275),
    ).toBeLessThan(0.05);
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

  test("epsilon smoothing explores a one-hot answer across five rows", () => {
    const probabilities = { a: 1, b: 0, c: 0, d: 0, e: 0 };
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) {
      const sample = sampleRow(probabilities, 1, `smooth-${i}`);
      expect(sample).toBeDefined();
      if (sample === undefined) continue;
      counts.set(sample.row, (counts.get(sample.row) ?? 0) + 1);
      expect(sample.epsilon).toBe(0.1);
    }
    for (const row of ["b", "c", "d", "e"])
      expect(Math.abs((counts.get(row) ?? 0) / 2000 - 0.02)).toBeLessThan(0.01);
  });

  test("epsilon zero preserves the unsmoothed distribution", () => {
    expect(sampleRow({ a: 1, b: 0 }, 1, "epsilon-zero", 0)).toMatchObject({
      row: "a",
      probability: 1,
      epsilon: 0,
    });
  });

  test("epsilon is limited to cost-eligible rows", () => {
    const lowArgmax = sampleRow(
      { "luna-low": 1, "opus-max": 0, "fable-max": 0 },
      1,
      "low-cost",
      0.1,
      ["luna-low"],
    );
    expect(lowArgmax?.epsilonRows).toEqual(["luna-low"]);
    expect(lowArgmax?.probability).toBe(1);

    const sonnetArgmax = sampleRow(
      { "sonnet-high": 1, "opus-max": 0, "fable-max": 0 },
      1,
      "sonnet-cost",
      0.1,
      ["sonnet-high", "opus-max"],
    );
    expect(sonnetArgmax?.epsilonRows).toEqual(["sonnet-high", "opus-max"]);
  });

  test("zero-probability eligible rows can be drawn after smoothing", () => {
    const probabilities = { a: 1, b: 0 };
    expect(
      Array.from(
        { length: 500 },
        (_, i) => sampleRow(probabilities, 1, `zero-row-${i}`)?.row,
      ),
    ).toContain("b");
  });
});
