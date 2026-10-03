import { describe, expect, test } from "bun:test";
import { lastUserText, stripCode, turnText } from "../lib.ts";
import { assistant, toolResultUser, user } from "./helpers.ts";

describe("turnText", () => {
  test("returns only assistant text after the last user entry", () => {
    const entries = [
      user("q1"),
      assistant("old"),
      user("q2"),
      assistant("a"),
      assistant("b"),
    ];
    expect(turnText(entries)).toBe("a\nb");
  });

  test("tool_result user entries bound the turn too", () => {
    const entries = [
      user("q"),
      assistant("before"),
      toolResultUser(),
      assistant("after"),
    ];
    expect(turnText(entries)).toBe("after");
  });

  test("empty when the turn has no assistant text", () => {
    expect(turnText([user("q")])).toBe("");
  });
});

describe("lastUserText", () => {
  test("skips tool_result carriers and returns the last human prompt", () => {
    const entries = [
      user("first"),
      assistant("a"),
      user("second"),
      toolResultUser(),
    ];
    expect(lastUserText(entries)).toBe("second");
  });

  test("empty when there is no human text", () => {
    expect(lastUserText([toolResultUser()])).toBe("");
  });
});

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
