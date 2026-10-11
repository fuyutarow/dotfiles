import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJson } from "../../../hooks/narrow.ts";
import { decoded } from "../../../hooks/tests/decode.ts";
import { z } from "../../../hooks/zod.ts";
import { runHook, tempHome } from "./helpers.ts";

describe("capture-last-response", () => {
  test("a Stop-hook retry replaces the blocked draft for the same turn", () => {
    const home = tempHome();
    const session = "capture-retry-session";
    const historyDir = join(home, ".cache", "claude", "last-response");
    mkdirSync(historyDir, { recursive: true });
    const history = join(historyDir, `${session}.jsonl`);

    expect(
      runHook(
        "capture-last-response.ts",
        {
          session_id: session,
          last_assistant_message: "以前のターン",
          stop_hook_active: false,
        },
        { HOME: home },
      ).code,
    ).toBe(0);
    expect(
      runHook(
        "capture-last-response.ts",
        {
          session_id: session,
          last_assistant_message: "English draft blocked by Stop",
          stop_hook_active: false,
        },
        { HOME: home },
      ).code,
    ).toBe(0);
    expect(
      runHook(
        "capture-last-response.ts",
        {
          session_id: session,
          last_assistant_message: "Stop hook が表示した日本語の最終返信です。",
          stop_hook_active: true,
        },
        { HOME: home },
      ).code,
    ).toBe(0);

    const records = readFileSync(history, "utf8")
      .trim()
      .split("\n")
      .map((line) => parseJson(line));
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ text: "以前のターン" });
    expect(records[1]).toMatchObject({
      text: "Stop hook が表示した日本語の最終返信です。",
    });
    expect(readFileSync(history, "utf8")).not.toContain("English draft");

    const quote = runHook(
      "quote-command.ts",
      { session_id: session, cwd: home, command_args: "1" },
      { HOME: home, HERDR_ENV: "", SSH_CONNECTION: "remote", SSH_TTY: "" },
    );
    const output = decoded(
      z.object({ decision: z.string(), reason: z.string() }),
      parseJson(quote.stdout),
    );
    expect(output.reason).toContain(
      "Stop hook が表示した日本語の最終返信です。",
    );
    expect(output.reason).not.toContain("English draft blocked by Stop");
  });

  test("a new turn appends even after a prior retry", () => {
    const home = tempHome();
    const session = "capture-next-session";
    const historyDir = join(home, ".cache", "claude", "last-response");
    mkdirSync(historyDir, { recursive: true });
    const history = join(historyDir, `${session}.jsonl`);
    runHook(
      "capture-last-response.ts",
      {
        session_id: session,
        last_assistant_message: "final turn",
        stop_hook_active: true,
      },
      { HOME: home },
    );
    runHook(
      "capture-last-response.ts",
      {
        session_id: session,
        last_assistant_message: "next turn",
        stop_hook_active: false,
      },
      { HOME: home },
    );
    const texts = readFileSync(history, "utf8")
      .trim()
      .split("\n")
      .map((line) => decoded(z.object({ text: z.string() }), parseJson(line)))
      .map((record) => record.text);
    expect(texts).toEqual(["final turn", "next turn"]);
  });
});
