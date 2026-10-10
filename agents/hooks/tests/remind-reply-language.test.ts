import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runHook, tempDir } from "./helpers.ts";
import { jsonOf, z } from "../zod.ts";

const HOOK = "remind-reply-language.ts";
const CONTEXT =
  "返答は途中経過の報告も含めてすべて日本語で書く（コード・識別子・引用はそのまま）。作業者の英語出力は訳してから示す。";

function homeWithSettings(settingsText: string): string {
  const home = tempDir("reply-language-");
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "settings.json"), settingsText);
  return home;
}

describe("remind-reply-language", () => {
  test("Japanese language adds the exact UserPromptSubmit context", () => {
    const home = homeWithSettings(JSON.stringify({ language: "japanese" }));
    const result = runHook(HOOK, {}, { HOME: home });

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(
      jsonOf(
        z.object({
          hookSpecificOutput: z.object({
            hookEventName: z.string(),
            additionalContext: z.string(),
          }),
        }),
      ).safeParse(result.stdout),
    ).toMatchObject({
      success: true,
      data: {
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `[dotfiles:reply-language-reminder] ${CONTEXT}`,
        },
      },
    });
  });

  test("another or missing language produces no output", () => {
    for (const settings of [{ language: "english" }, {}]) {
      const home = homeWithSettings(JSON.stringify(settings));
      const result = runHook(HOOK, {}, { HOME: home });

      expect(result.code).toBe(0);
      expect(result.stdout).toBe("");
    }
  });

  test("malformed settings fail open with no stdout", () => {
    const home = homeWithSettings("{");
    const result = runHook(HOOK, {}, { HOME: home });

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).not.toBe("");
  });
});
