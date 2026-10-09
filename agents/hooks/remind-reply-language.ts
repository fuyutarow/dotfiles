// UserPromptSubmit reminder for Claude Code: carry the configured Japanese reply preference
// into each prompt as additional context. Errors fail open so a broken settings file cannot stop
// prompt submission.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { onPrompt } from "../../tools/use-hooks/src/index.ts";
import { parseJson, strAt } from "./narrow.ts";

const CONTEXT =
  "返答は途中経過の報告も含めてすべて日本語で書く（コード・識別子・引用はそのまま）。作業者の英語出力は訳してから示す。";

await onPrompt(() => {
  const home = process.env.HOME ?? homedir();
  const settings = parseJson(
    readFileSync(join(home, ".claude", "settings.json"), "utf8"),
  );
  if (settings === undefined) {
    process.stderr.write(
      "remind-reply-language: malformed ~/.claude/settings.json\n",
    );
    return false;
  }
  return strAt(settings, "language") === "japanese" ? CONTEXT : false;
});
