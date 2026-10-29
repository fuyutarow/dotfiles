// UserPromptSubmit reminder for Claude Code: carry the configured Japanese reply preference
// into each prompt as additional context. Errors fail open so a broken settings file cannot stop
// prompt submission. Zero external dependencies; preserve the former onPrompt wire behavior.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt, errorMessage } from "./attempt.ts";
import { hookJson, hookStderr } from "./lib.ts";
import { parseJson, strAt } from "./narrow.ts";
import { jsonOf, z } from "./zod.ts";

const CONTEXT =
  "返答は途中経過の報告も含めてすべて日本語で書く（コード・識別子・引用はそのまま）。作業者の英語出力は訳してから示す。";
const Payload = z.looseObject({
  session_id: z.string().optional(),
  cwd: z.string().min(1).optional(),
  hook_event_name: z.enum(["UserPromptSubmit", "Stop"]).optional(),
  prompt: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
  last_assistant_message: z.string().optional(),
});
const BUDGET_MS = 3_000;
const started = performance.now();
const timer = setTimeout(() => {
  hookStderr("3 s budget exceeded; fail open");
  process.exit(0);
}, BUDGET_MS);

const result = await attempt(async () => {
  const parsed = jsonOf(Payload).safeParse(await Bun.stdin.text());
  if (!parsed.success) return new Error("invalid hook payload; fail open");
  if (
    parsed.data.hook_event_name !== undefined &&
    parsed.data.hook_event_name !== "UserPromptSubmit"
  )
    return new Error("wrong hook event; fail open");
  const home = process.env["HOME"] ?? homedir();
  const settings = parseJson(
    readFileSync(join(home, ".claude", "settings.json"), "utf8"),
  );
  if (settings === undefined) {
    hookStderr("remind-reply-language: malformed ~/.claude/settings.json\n");
    return false;
  }
  return strAt(settings, "language") === "japanese" ? CONTEXT : false;
});
clearTimeout(timer);
if (!result.ok) {
  hookStderr(errorMessage(result.error).replaceAll(/\s+/gu, " "));
} else if (result.value instanceof Error) {
  hookStderr(result.value.message);
} else if (performance.now() - started >= BUDGET_MS) {
  hookStderr("3 s budget exceeded; fail open");
} else if (result.value !== false) {
  process.stdout.write(
    `${hookJson({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: result.value } })}\n`,
  );
}
process.exit(0);
