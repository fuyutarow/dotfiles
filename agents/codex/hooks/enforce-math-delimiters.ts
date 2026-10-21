import { hookJson, hookStderr } from "./lib.ts";
import { attempt } from "../../hooks/attempt.ts";
import { at, parseJson, strAt } from "../../hooks/narrow.ts";
import { findLegacyMathDelimiters } from "./math-delimiters.ts";

// Native Codex Stop continuation request; malformed input must never trap a turn.
function stderrLine(reason: string): void {
  hookStderr(
    `check failed open: ${reason.replaceAll(/\s+/gu, " ").slice(0, 240)}\n`,
  );
}

async function main(): Promise<number> {
  const payload = parseJson(await Bun.stdin.text());
  if (payload === undefined) {
    stderrLine("malformed hook payload");
    return 0;
  }
  if (at(payload, "stop_hook_active") === true) return 0;

  const response = strAt(payload, "last_assistant_message");
  if (response === undefined) {
    stderrLine("missing or non-string last_assistant_message");
    return 0;
  }
  if (findLegacyMathDelimiters(response).length === 0) return 0;

  process.stdout.write(
    `${hookJson({
      decision: "block",
      reason:
        "直前の返答のコード外にある数式区切りだけを修正してください。インライン数式の \\( ... \\) を $...$ に、ディスプレイ数式の \\[ ... \\] を $$...$$ に置き換えてください。数式の内容、すべてのコード、その他の文章や内容はそのまま保持してください。",
    })}\n`,
  );
  return 0;
}

if (import.meta.main) {
  const result = await attempt(main);
  if (!result.ok) {
    stderrLine("could not inspect the response");
    process.exit(0);
  }
  process.exit(result.value);
}
