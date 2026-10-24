import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
    expect(result.stdout).toBe(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: `[dotfiles:reply-language-reminder] ${CONTEXT}`,
        },
      })}\n`,
    );
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

  test("linked runtime emits the same reminder from an unrelated cwd", () => {
    const home = homeWithSettings(JSON.stringify({ language: "japanese" }));
    mkdirSync(join(home, ".agents"));
    symlinkSync(join(import.meta.dir, ".."), join(home, ".agents", "hooks"));
    const result = spawnSync(
      "sh",
      [join(home, ".agents", "hooks", "run.sh"), HOOK],
      {
        input: "{}",
        env: { ...process.env, HOME: home },
        cwd: home,
        timeout: 10_000,
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toEqual(Buffer.alloc(0));
    expect(result.stdout).toEqual(
      Buffer.from(runHook(HOOK, {}, { HOME: home }).stdout),
    );
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
    expect(result.stderr).toBe(
      "[dotfiles:reply-language-reminder] malformed ~/.claude/settings.json\n",
    );
  });

  test("invalid payloads and another event fail open before reading settings", () => {
    const home = homeWithSettings("{");
    for (const payload of ["{", "null", { cwd: "" }, { prompt: 1 }]) {
      const result = runHook(HOOK, payload, { HOME: home });
      expect(result.code).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "[dotfiles:reply-language-reminder] invalid hook payload; fail open\n",
      );
    }
    const result = runHook(HOOK, { hook_event_name: "Stop" }, { HOME: home });
    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "[dotfiles:reply-language-reminder] wrong hook event; fail open\n",
    );
  });
});
