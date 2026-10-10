import { describe, expect, test } from "bun:test";
import { deriveRunResult } from "../src/run-result.ts";

const base = {
  vendor_exit: 0,
  verify: [{ exit: 0 }],
  verify_required: true,
  changed_files: ["a.ts"],
  valid_return: false,
  return_findings: 0,
  turns: 1,
  output_chars: 1,
};

describe("deriveRunResult", () => {
  test("vendor failure with zero turns is failed even when verify passes", () => {
    expect(
      deriveRunResult({ ...base, vendor_exit: 1, turns: 0, changed_files: [] }),
    ).toBe("failed");
  });
  test("scope warnings do not prevent a delivered result", () => {
    expect(
      deriveRunResult({ ...base, scope_warning: ["outside writes globs"] }),
    ).toBe("delivered");
  });
  test("valid RETURN with findings can be delivered", () => {
    expect(
      deriveRunResult({
        ...base,
        changed_files: [],
        valid_return: true,
        return_findings: 1,
      }),
    ).toBe("delivered");
  });
  test("valid RETURN without findings asks the coordinator", () => {
    expect(
      deriveRunResult({ ...base, changed_files: [], valid_return: true }),
    ).toBe("returned");
  });
  test("zero turns or no output can never be delivered", () => {
    expect(deriveRunResult({ ...base, turns: 0 })).toBe("failed");
    expect(deriveRunResult({ ...base, output_chars: 0 })).toBe("failed");
  });
  test("a missing required verification result cannot be delivered", () => {
    expect(
      deriveRunResult({ ...base, verify: [], verify_required_count: 2 }),
    ).toBe("failed");
  });
});
