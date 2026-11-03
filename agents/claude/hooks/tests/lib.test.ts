import { describe, expect, test } from "bun:test";
import { stripCode } from "../lib.ts";

describe("stripCode", () => {
  test("removes fenced blocks and inline spans", () => {
    const text = "keep\n```\nfenced\n```\nmid `inline` end";
    expect(stripCode(text)).toBe("keep\nmid  end");
  });

  test("keeps blockquotes by default, drops them on request", () => {
    const text = "> quoted\nplain";
    expect(stripCode(text)).toBe("> quoted\nplain");
    expect(stripCode(text, { blockquotes: true })).toBe("plain");
  });
});
