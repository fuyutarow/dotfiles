import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
          "直前の返答が英語です。日本語で書き直してください（コードや識別子は原文のままで構いません）。",
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
