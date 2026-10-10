import { expect, test } from "bun:test";
import { formatCostUsd } from "../src/dispatch-pricing.ts";

test("formats statusline costs to cents without hiding sub-cent spend", () => {
  expect(formatCostUsd(0)).toBe("$0");
  expect(formatCostUsd(0.0004)).toBe("<$0.01");
  expect(formatCostUsd(0.004)).toBe("<$0.01");
  expect(formatCostUsd(0.0099)).toBe("<$0.01");
  expect(formatCostUsd(0.01)).toBe("$0.01");
  expect(formatCostUsd(0.0149)).toBe("$0.01");
  expect(formatCostUsd(1.234)).toBe("$1.23");
  expect(formatCostUsd(undefined)).toBe("");
});
