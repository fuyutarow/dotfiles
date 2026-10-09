// UserPromptSubmit reminder for Claude Code: carry the configured Japanese reply preference
// into each prompt as additional context. Errors fail open so a broken settings file cannot stop
// prompt submission.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt, errorMessage } from "./attempt.ts";
import { parseJson, strAt } from "./narrow.ts";

const CONTEXT =
  "返答は途中経過の報告も含めてすべて日本語で書く（コード・識別子・引用はそのまま）。作業者の英語出力は訳してから示す。";

function stderrLine(reason: string): void {
  process.stderr.write(
    `remind-reply-language: ${reason.replaceAll(/\s+/gu, " ")}\n`,
  );
}

function main(): void {
  const home = process.env.HOME ?? homedir();
  const settingsText = readFileSync(
    join(home, ".claude", "settings.json"),
    "utf8",
  );
  const settings = parseJson(settingsText);
  if (settings === undefined) {
    stderrLine("malformed ~/.claude/settings.json");
    return;
  }
  if (strAt(settings, "language") !== "japanese") return;

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: CONTEXT,
      },
    })}\n`,
  );
}

const result = await attempt(main);
if (!result.ok) stderrLine(errorMessage(result.error));
process.exit(0);
