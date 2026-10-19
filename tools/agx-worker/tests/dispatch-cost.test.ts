import { describe, expect, test } from "bun:test";
import { costUsd } from "../src/dispatch-cost.ts";

describe("dispatch receipt cost", () => {
  test("prices uncached input, cached input, output and reasoning output", () => {
    const receipt = {
      usage: {
        input_tokens: 1_000_000,
        cached_input_tokens: 400_000,
        output_tokens: 100_000,
        reasoning_output_tokens: 50_000,
      },
    };
    expect(
      costUsd(
        { price_in: 2, price_cached_in: 0.2, price_out: 10 },
        receipt.usage,
      ),
    ).toBeCloseTo(2.78, 10);
  });

  test("keeps cost unknown when receipt usage is absent", () => {
    expect(costUsd({ price_in: 2, price_out: 10 }, {})).toBeUndefined();
  });
});
