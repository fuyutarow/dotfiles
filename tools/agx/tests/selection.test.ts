import { describe, expect, test } from "bun:test";
import { escalationRow, sampleRow } from "../src/selection.ts";
import { loadRoster } from "../../../agents/models/roster.ts";

describe("deterministic escalation", () => {
  test("sol-high and luna-low prefer capable next-effort rows at the cheapest price", async () => {
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    for (const [failedId, expectedId] of [
      ["sol-high", "sol-xhigh"],
      ["luna-low", "luna-medium"],
    ]) {
      const failed = loaded.value.choice.find((row) => row.id === failedId);
      expect(failed).toBeDefined();
      if (failed === undefined) continue;
      const selected = escalationRow(loaded.value.choice, failed);
      expect(selected?.id).toBe(expectedId);
      expect(selected?.aa_index).toBeGreaterThanOrEqual(failed.aa_index ?? 0);
      expect(escalationRow(loaded.value.choice.toReversed(), failed)).toEqual(
        selected,
      );
    }
  });

  test("cheap rows and same-family next effort cannot bypass the AA floor", () => {
    const failed = {
      id: "sol-high",
      model: "sol",
      effort: "high",
      aa_index: 50,
    };
    const lower = {
      id: "sol-xhigh",
      model: "sol",
      effort: "xhigh",
      aa_index: 49,
      price_in: 2,
      price_out: 10,
    };
    const rows = [
      {
        id: "luna-medium",
        model: "luna",
        effort: "medium",
        aa_index: 30,
        price_in: 0.1,
        price_out: 0.5,
      },
      lower,
    ];
    expect(escalationRow(rows, failed)).toBeUndefined();
    expect(
      escalationRow(
        [...rows, { ...lower, id: "sol-max", aa_index: 51 }],
        failed,
      )?.id,
    ).toBe("sol-max");
  });

  test("unknown capability or price cannot establish a safe cheapest escalation", () => {
    const row = { id: "sol-high", model: "sol", effort: "high" };
    expect(escalationRow([row], row)).toBeUndefined();
    expect(
      escalationRow([{ ...row, id: "sol-max", aa_index: 51 }], {
        ...row,
        aa_index: 50,
      }),
    ).toBeUndefined();
  });

  test("a budget excluding every capable row cannot force a cheaper downgrade", () => {
    const failed = {
      id: "sol-high",
      model: "sol",
      effort: "high",
      aa_index: 50,
      price_in: 2,
      price_out: 10,
    };
    const rows = [
      {
        id: "luna-low",
        model: "luna",
        effort: "low",
        aa_index: 22,
        price_in: 0.1,
        price_out: 0.5,
      },
      failed,
      { ...failed, id: "sol-xhigh", effort: "xhigh", aa_index: 51 },
    ];
    expect(escalationRow(rows, failed, 0.02)).toBeUndefined();
  });
});

describe("seeded row selection", () => {
  const fixture = {
    leader: 0.7,
    runnerUp: 0.2,
    third: 0.06,
    fourth: 0.02,
    tailA: 0.01,
    tailB: 0.01,
  };

  test("default 0.5: 1000 seeds track all tempered probabilities", async () => {
    const loaded = await loadRoster();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const temperature = loaded.value.auto.pick_temperature;
    expect(temperature).toBe(0.5);
    const total = Object.values(fixture).reduce((sum, p) => sum + p ** 2, 0);
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const sample = sampleRow(fixture, temperature, `draw-${i}`);
      expect(sample).toBeDefined();
      if (sample === undefined) continue;
      counts.set(sample.row, (counts.get(sample.row) ?? 0) + 1);
      const p =
        Object.entries(fixture).find(([row]) => row === sample.row)?.[1] ?? 0;
      expect(sample.probability).toBeCloseTo(p ** 2 / total, 12);
    }
    for (const [row, p] of Object.entries(fixture)) {
      const expected = p ** 2 / total;
      // Four binomial standard deviations, plus one count for discrete rare rows.
      const error = 4 * Math.sqrt((expected * (1 - expected)) / 1000) + 0.001;
      expect(Math.abs((counts.get(row) ?? 0) / 1000 - expected)).toBeLessThan(
        error,
      );
    }
    expect(0.2 ** 2 / total).toBeCloseTo(0.0748783, 7);
  });

  test("explicit T=1 reproduces the untempered categorical draw", () => {
    const probabilities = { a: 0.75, b: 0.25 };
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const seed = `untempered-${i}`;
      const sample = sampleRow(probabilities, 1, seed);
      expect(sample).toEqual(sampleRow(probabilities, 1, seed));
      if (sample === undefined) continue;
      counts.set(sample.row, (counts.get(sample.row) ?? 0) + 1);
      expect(sample.probability).toBeCloseTo(
        sample.row === "a" ? 0.75 : 0.25,
        12,
      );
    }
    expect(Math.abs((counts.get("b") ?? 0) / 1000 - 0.25)).toBeLessThan(0.05);
  });

  test("all positive rows remain drawable at the default, including both 1% tails", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100000 && seen.size < 6; i++) {
      const sample = sampleRow(fixture, 0.5, `all-rows-${i}`);
      if (sample !== undefined) seen.add(sample.row);
    }
    expect([...seen].toSorted()).toEqual(Object.keys(fixture).toSorted());
    // No probability floor: a tiny input remains positive when selected alone.
    expect(sampleRow({ tiny: 1e-100 }, 0.5, "tiny")?.probability).toBe(1);
  });

  test("only zero temperature is argmax; positive near-zero T still samples", () => {
    expect(sampleRow({ a: 0.75, b: 0.25 }, 0, "any-seed")).toMatchObject({
      row: "a",
      argmaxRow: "a",
      probability: 1,
      mode: "argmax",
    });
    const seen = new Set(
      Array.from(
        { length: 100 },
        (_, i) => sampleRow({ a: 0.5, b: 0.5 }, 0.001, `cold-${i}`)?.row,
      ),
    );
    expect(seen.size).toBe(2);
    expect(sampleRow({ a: 0.5, b: 0.5 }, 0.001, "cold")?.mode).toBe("sample");
  });

  test("zero input mass has no smoothing and all-zero inputs cannot be sampled", () => {
    expect(sampleRow({ a: 1, b: 0 }, 0.5, "zero-mass")).toMatchObject({
      row: "a",
      probability: 1,
    });
    expect(sampleRow({ a: 0, b: 0 }, 0.5, "all-zero")).toBeUndefined();
  });
});
