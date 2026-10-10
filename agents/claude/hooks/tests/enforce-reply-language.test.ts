import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseJson } from "../../../hooks/narrow.ts";
import {
  assistant,
  runHook,
  tempDir,
  user,
  writeTranscript,
} from "./helpers.ts";

const stopPayload = (transcript_path: string, stop_hook_active = false) => ({
  transcript_path,
  stop_hook_active,
});

function settingsHome(language: string | undefined): string {
  const home = tempDir("reply-language-home-");
  mkdirSync(join(home, ".claude"));
  writeFileSync(
    join(home, ".claude", "settings.json"),
    JSON.stringify(language === undefined ? {} : { language }),
  );
  return home;
}

describe("enforce-reply-language", () => {
  const HOOK = "enforce-reply-language.ts";

  test("Stop payload blocks the live English reply before its transcript entry is flushed", () => {
    const transcript = writeTranscript([
      user(
        "だからいつになったら結果出すおん？？ agentが1つしか起動していないけど",
      ),
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "dispatch", name: "Bash", input: {} },
          ],
        },
      },
    ]);
    const home = settingsHome("japanese");
    const text =
      "I've dispatched 6 workers at once, on top of the throughput worker (gkdlin) that's already running. That makes 7 in total.";
    const result = runHook(
      HOOK,
      {
        ...stopPayload(transcript),
        session_id: "xj15-regression",
        last_assistant_message: text,
      },
      { HOME: home },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"decision":"block"');
    expect(result.stderr).toBe("");
    const record = parseJson(
      readFileSync(
        join(home, ".local/state/claude-hooks/reply-language.jsonl"),
        "utf8",
      ).trim(),
    );
    expect(record).toMatchObject({
      session_id: "xj15-regression",
      stop_hook_active: false,
      home,
      language: "japanese",
      text_source: "last_assistant_message",
      message_chars: text.length,
      decision: "block",
      reason: "english_prose",
    });
    expect(JSON.stringify(record)).not.toContain(text);
  });

  test("empty payload response is authoritative over stale English transcript text", () => {
    const transcript = writeTranscript([
      assistant(
        "This is an older English response which must not be treated as the current final response.",
      ),
    ]);
    const result = runHook(
      HOOK,
      {
        ...stopPayload(transcript),
        last_assistant_message: "",
      },
      { HOME: settingsHome("japanese") },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("payload response does not require a readable or well-formed transcript", () => {
    const result = runHook(
      HOOK,
      {
        ...stopPayload(join(tempDir("unflushed-reply-"), "missing.jsonl")),
        last_assistant_message:
          "The current final response is fully English and should block even while the transcript file is unavailable.",
      },
      { HOME: settingsHome("japanese") },
    );

    expect(result.stdout).toContain('"decision":"block"');
    expect(result.stderr).toBe("");
  });

  test("Japanese payload response wins over stale English transcript text", () => {
    const transcript = writeTranscript([
      assistant(
        "This older English response was already checked and is not the final response for this turn.",
      ),
    ]);
    const result = runHook(
      HOOK,
      {
        ...stopPayload(transcript),
        last_assistant_message:
          "今回は日本語で返答しています。古い英語のメッセージを判定に使わず、現在の返答だけを確認してください。",
      },
      { HOME: settingsHome("japanese") },
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test.each([
    { active: true, language: "japanese", reason: "stop_hook_active" },
    { active: false, language: "english", reason: "language_not_japanese" },
    { active: false, language: "japanese", reason: "no_language_violation" },
  ])("logs silent allow: $reason", ({ active, language, reason }) => {
    const home = settingsHome(language);
    const result = runHook(
      HOOK,
      {
        stop_hook_active: active,
        session_id: "allow-audit",
        last_assistant_message: "確認しました。",
      },
      { HOME: home },
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(
      parseJson(
        readFileSync(
          join(home, ".local/state/claude-hooks/reply-language.jsonl"),
          "utf8",
        ).trim(),
      ),
    ).toMatchObject({
      decision: "allow",
      reason,
      home,
      settings_path: join(home, ".claude/settings.json"),
      stop_hook_active: active,
    });
  });

  test("decision-log write failure preserves the language block", () => {
    const home = settingsHome("japanese");
    writeFileSync(
      join(home, ".local"),
      "cannot create the state directory here",
    );
    const result = runHook(
      HOOK,
      {
        stop_hook_active: false,
        last_assistant_message:
          "This English final response must still block even if the diagnostic decision log cannot be written.",
      },
      { HOME: home },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"decision":"block"');
    expect(result.stderr).toContain("decision log failed");
  });

  test("check errors are recorded while preserving fail-open behavior", () => {
    const home = settingsHome("japanese");
    const result = runHook(
      HOOK,
      stopPayload(join(tempDir("audit-missing-transcript-"), "missing.jsonl")),
      { HOME: home },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("check failed open");
    expect(
      parseJson(
        readFileSync(
          join(home, ".local/state/claude-hooks/reply-language.jsonl"),
          "utf8",
        ).trim(),
      ),
    ).toMatchObject({
      decision: "allow",
      reason: "check_error",
      text_source: "transcript",
    });
  });

  test("English prose reply -> blocks with a Japanese rewrite reason", () => {
    const transcript = writeTranscript([
      user("説明してください"),
      assistant(
        "Here is the result. The implementation reads the final assistant message and checks its language before allowing the session to stop.",
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(
      JSON.stringify({
        decision: "block",
        reason:
          "[dotfiles:reply-language] 直前の返答が英語です。日本語で書き直してください（コードや識別子は原文のままで構いません）。",
      }),
    );
    expect(result.stderr).toBe("");
  });

  test("long English section after Japanese prose -> blocks", () => {
    const transcript = writeTranscript([
      user("説明してください"),
      assistant(
        `これは日本語の前半です。仕組みの概要を説明し、必要な情報をまとめました。\n\n## Your frustrations, in your voice\n\n${"I understand how frustrating this can be, and I want to explain what happened and what you can do next. ".repeat(6)}`,
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.stdout).toContain('"decision":"block"');
  });

  test("Japanese prose with identifiers, paths, and a command table -> allows", () => {
    const transcript = writeTranscript([
      user("説明してください"),
      assistant(
        `この変更は設定を更新し、関連する処理を確認します。\n\n| 項目 | 内容 |\n| --- | --- |\n| ファイル | agents/claude/hooks/enforce-reply-language.ts |\n| コマンド | bunx tsgo --noEmit -p . |\n| フラグ | --stop-hook-active |`,
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("Japanese prose quoting an English hook message -> allows", () => {
    const transcript = writeTranscript([
      user("返答を確認してください"),
      assistant(
        `この引用は記録として残します。今回の返答は日本語です。\n\n> [dotfiles:reply-language] ${"The previous reply was counted as English because diagnostic text was included in the language check. ".repeat(3)}`,
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("Japanese prose with code-like table cells -> allows", () => {
    const transcript = writeTranscript([
      user("変更点を説明してください"),
      assistant(
        `この設定を更新しました。動作を確認しました。\n\n| 項目 | 値 |\n| --- | --- |\n| フック | --stop-hook-active-reply-language-validation |\n| タスク | test:reply-language-hook-transcript-selection |\n| 識別子 | lastAssistantMessageIncludesToolInputContent |\n| パス | agents/claude/hooks/enforce-reply-language.test.ts |`,
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("Japanese final text ignores English tool inputs in the transcript", () => {
    const englishInput =
      "Write English tool input with lots of implementation details and explanatory sentences. ".repeat(
        8,
      );
    const transcript = writeTranscript([
      user("設定を直してください"),
      {
        type: "assistant",
        message: {
          content: [
            { type: "text", text: "調査結果を踏まえて設定を直します。" },
            {
              type: "tool_use",
              id: "write-1",
              name: "Write",
              input: { content: englishInput },
            },
            {
              type: "tool_use",
              id: "bash-1",
              name: "Bash",
              input: { command: englishInput },
            },
            {
              type: "tool_use",
              id: "send-1",
              name: "SendMessage",
              input: { message: englishInput },
            },
          ],
        },
      },
      {
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "write-1", content: "完了" },
            { type: "tool_result", tool_use_id: "bash-1", content: "ok" },
            { type: "tool_result", tool_use_id: "send-1", content: "sent" },
          ],
        },
      },
      assistant("修正を適用し、確認しました。"),
    ]);
    const result = runHook(
      HOOK,
      {
        ...stopPayload(transcript),
        last_assistant_message: englishInput,
      },
      { HOME: settingsHome("japanese") },
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("one short English sentence under 120 letters -> allows", () => {
    const transcript = writeTranscript([
      user("説明してください"),
      assistant("処理を確認しました。 The change is ready."),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });

  test("Japanese prose with English identifiers and a code block -> allows", () => {
    const transcript = writeTranscript([
      user("説明してください"),
      assistant(
        "この実装では `readTranscript` が最後のメッセージを読み取り、language の設定を確認してから処理します。\n```ts\nconst result = await readTranscript(transcriptPath);\nconsole.log(result);\n```",
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("mostly English code plus one Japanese sentence -> allows", () => {
    const transcript = writeTranscript([
      user("説明してください"),
      assistant(
        `この関数は最後の返答だけを調べます。\n\n> ${"quoted tool output with English words ".repeat(8)}\n\n\`\`\`ts\n${"const response = await readTranscript(transcriptPath);\n".repeat(12)}\`\`\``,
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("short reply -> allows", () => {
    const transcript = writeTranscript([user("hi"), assistant("Looks good.")]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("reply containing only a code block -> allows", () => {
    const transcript = writeTranscript([
      user("コードを出してください"),
      assistant(
        `\`\`\`ts\n${"const response = await readTranscript(transcriptPath);\n".repeat(8)}\`\`\``,
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("tool-call-only final assistant message -> allows", () => {
    const transcript = writeTranscript([
      user("調べてください"),
      {
        type: "assistant",
        message: {
          content: [
            { type: "tool_use", id: "tool-1", name: "Bash", input: {} },
          ],
        },
      },
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("stop_hook_active -> allows", () => {
    const transcript = writeTranscript([
      user("説明してください"),
      assistant(
        "Here is the result. The implementation reads the final assistant message and checks its language before allowing the session to stop.",
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript, true), {
      HOME: settingsHome("japanese"),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("language not Japanese -> allows", () => {
    const transcript = writeTranscript([
      user("explain"),
      assistant(
        "Here is the result. The implementation reads the final assistant message and checks its language before allowing the session to stop.",
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("english"),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("language setting absent -> allows silently", () => {
    const transcript = writeTranscript([
      user("explain"),
      assistant(
        "Here is the result. The implementation reads the final assistant message and checks its language before allowing the session to stop.",
      ),
    ]);
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome(undefined),
    });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
  });

  test("unreadable transcript -> allows and logs one stderr line", () => {
    const result = runHook(
      HOOK,
      stopPayload(join(tempDir("missing-transcript-"), "missing.jsonl")),
      { HOME: settingsHome("japanese") },
    );

    expect(result.code).toBe(0);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("check failed open");
  });

  test("malformed transcript line -> allows and logs one stderr line", () => {
    const transcript = join(
      tempDir("malformed-transcript-"),
      "transcript.jsonl",
    );
    writeFileSync(
      transcript,
      '{"type":"assistant","message":{}}\n{bad json}\n',
    );
    const result = runHook(HOOK, stopPayload(transcript), {
      HOME: settingsHome("japanese"),
    });

    expect(result.code).toBe(0);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain("malformed transcript line");
  });
});
