import { hookJson, hookStderr } from "./lib.ts";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { at, parseJson, strAt } from "../../hooks/narrow.ts";
import {
  classifyJapanesePrimary,
  JAPANESE_REPLY_BLOCK_REASON,
  requiredReplyLanguage,
} from "../../hooks/reply-language.ts";

// Stop hook: enforce the owner-declared Japanese-primary Codex final-reply policy.
// Safety: fail open on malformed payload/policy; only non-Japanese visible reply prose blocks.
function stderrLine(reason: string): void {
  hookStderr(`enforce-reply-language: ${reason.replaceAll(/\s+/gu, " ")}\n`);
}

async function main(): Promise<number> {
  const payload = parseJson(await Bun.stdin.text());
  if (payload === undefined) {
    stderrLine("check failed open: malformed hook payload");
    return 0;
  }
  if (at(payload, "stop_hook_active") === true) return 0;

  const policy = await attempt(() => requiredReplyLanguage("codex"));
  if (!policy.ok) {
    stderrLine(`check failed open: ${errorMessage(policy.error)}`);
    return 0;
  }
  if (policy.value instanceof Error) {
    stderrLine(`check failed open: ${policy.value.message}`);
    return 0;
  }
  if (policy.value !== "japanese") return 0;

  const response = strAt(payload, "last_assistant_message");
  if (response === undefined) return 0;
  const classification = classifyJapanesePrimary(response);
  if (classification.outcome !== "non-japanese") return 0;

  process.stdout.write(
    `${hookJson({ decision: "block", reason: JAPANESE_REPLY_BLOCK_REASON })}\n`,
  );
  return 0;
}

if (import.meta.main) {
  const result = await attempt(main);
  if (!result.ok) {
    stderrLine(`check failed open: ${errorMessage(result.error)}`);
    process.exit(0);
  }
  process.exit(result.value);
}
