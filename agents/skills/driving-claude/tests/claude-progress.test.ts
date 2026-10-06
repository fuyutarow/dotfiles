import { describe, expect, test } from "bun:test";
import { emptyTally } from "../../driving-codex/scripts/codex-progress.ts";
import { foldClaudeEvent, resultEvent } from "../scripts/claude-progress.ts";

// claude-progress: claude stream-json events folded into the Run row's tally.
const assistant = (content: unknown[]): string =>
  JSON.stringify({ type: "assistant", message: { content } });

describe("foldClaudeEvent", () => {
  test("a Bash call is the latest event and counts as a command", () => {
    const t = foldClaudeEvent(
      emptyTally(),
      assistant([
        {
          type: "tool_use",
          name: "Bash",
          input: { command: "bun test\nmore" },
        },
      ]),
    );
    expect(t.last).toBe("$ bun test");
    expect(t.commands).toBe(1);
  });

  test("an edit names the file and counts it once; a read names it without counting", () => {
    const edit = assistant([
      { type: "tool_use", name: "Edit", input: { file_path: "/w/a.ts" } },
    ]);
    const t = [edit, edit].reduce(
      (acc, l) => foldClaudeEvent(acc, l),
      emptyTally(),
    );
    expect(t.last).toBe("✎ a.ts");
    expect(t.files.size).toBe(1);
    const r = foldClaudeEvent(
      t,
      assistant([
        { type: "tool_use", name: "Read", input: { file_path: "/w/b.ts" } },
      ]),
    );
    expect(r.last).toBe("Read b.ts");
    expect(r.files.size).toBe(1);
  });

  test("text is shown quoted; thinking, system lines and garbage change nothing", () => {
    const t = foldClaudeEvent(
      emptyTally(),
      assistant([{ type: "text", text: "looking" }]),
    );
    expect(t.last).toBe("“looking”");
    for (const line of [
      assistant([{ type: "thinking", thinking: "" }]),
      JSON.stringify({ type: "system", subtype: "init" }),
      "not json",
    ])
      expect(foldClaudeEvent(t, line)).toEqual(t);
  });
});

test("resultEvent: the last result event, or undefined when the run never finished", () => {
  const out = [
    assistant([{ type: "text", text: "x" }]),
    JSON.stringify({ type: "result", result: "OK" }),
    "",
  ].join("\n");
  expect(resultEvent(out)?.result).toBe("OK");
  expect(resultEvent(assistant([]))).toBeUndefined();
});
