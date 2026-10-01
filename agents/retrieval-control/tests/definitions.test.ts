// Pure parts of the definition route and its hook. The end-to-end yardstick is
// bench-definitions.ts against a real catalog (README "Measurements"); these pin the rules that
// decide what a card says and what counts as internal.
import { describe, expect, test } from "bun:test";
import { firstLine, isPrivate, isTest, strengthOf } from "../definitions.ts";

describe("definition cards", () => {
  test("the doc line skips a signature copy and rulers", () => {
    const doc = "    saturating_add(a::T, b::T) where {T<:Signed} -> T\n\n-----\nAdd two signed integers, clamping.";
    expect(firstLine("saturating_add", doc)).toBe("Add two signed integers, clamping.");
  });
  test("internal by convention: leading underscore or a kernel/impl/inner/helper suffix", () => {
    for (const name of ["_rows", "residual_add_flag_kernel!", "parse_impl", "walk_inner", "fmt_helper"])
      expect(isPrivate({ name })).toBe(true);
    for (const name of ["residual_add_flag!", "kernelize", "impl_trait_for"]) expect(isPrivate({ name })).toBe(false);
  });
  test("test files are recognised by path, not by name", () => {
    expect(isTest({ file: "packages/X/test/round.jl" })).toBe(true);
    expect(isTest({ file: "src/a.test.ts" })).toBe(true);
    expect(isTest({ file: "src/testing_utils.jl" })).toBe(false);
  });
  test("without the reranker nothing is judged; with it, thresholds decide", () => {
    expect(strengthOf(9, false)).toBe("unranked");
    expect(strengthOf(4.2, true)).toBe("strong");
    expect(strengthOf(2, true)).toBe("likely");
    expect(strengthOf(-3, true)).toBe("none");
  });
});
