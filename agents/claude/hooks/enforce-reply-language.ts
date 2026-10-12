import { hookJson, hookStderr } from "./lib.ts";
// Stop hook: enforce the user's Japanese reply preference against the final assistant message.
// Safety: FAIL OPEN on every hook error (including unreadable/malformed transcripts), with one
// stderr line explaining the failure. A broken language check must never trap a session.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { arr, at, parseJson, str, strAt } from "../../hooks/narrow.ts";
import {
  classifyJapanesePrimary,
  JAPANESE_REPLY_BLOCK_REASON,
  requiredReplyLanguage,
  type JapaneseClassification,
} from "../../hooks/reply-language.ts";

function stderrLine(reason: string): void {
  hookStderr(`enforce-reply-language: ${reason.replaceAll(/\s+/gu, " ")}\n`);
}

type DecisionAudit = {
  home: string;
  settings_path: string;
  session_id?: string | undefined;
  transcript_path?: string | undefined;
  stop_hook_active?: boolean;
  language?: string | undefined;
  text_source?: "last_assistant_message" | "transcript";
  message_chars?: number;
  classifier_outcome?: JapaneseClassification["outcome"];
  classifier_reason?: JapaneseClassification["reason"];
  classifier_scope?: JapaneseClassification["scope"];
};

// Metadata only: distinguish loop guards, HOME/settings mismatches, stale input and errors
// without persisting the user's response. Logging is best-effort and never changes a decision.
async function recordDecision(
  audit: DecisionAudit,
  decision: "allow" | "block",
  reason: string,
  error?: string,
): Promise<number> {
  const result = await attempt(() => {
    const dir = join(audit.home, ".local", "state", "claude-hooks");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    appendFileSync(
      join(dir, "reply-language.jsonl"),
      `${JSON.stringify({
        at: Temporal.Now.instant().toString(),
        ...audit,
        hook_path: import.meta.path,
        bun_version: Bun.version,
        cwd: process.cwd(),
        decision,
        reason,
        error,
      })}\n`,
      { mode: 0o600 },
    );
  });
  if (!result.ok)
    stderrLine(`decision log failed: ${errorMessage(result.error)}`);
  return 0;
}

type TranscriptSelection = { text: string; toolInputs: string[] };

function stringValues(value: unknown): string[] {
  const direct = str(value);
  if (direct !== undefined) return [direct];
  if (Array.isArray(value)) return value.flatMap((item) => stringValues(item));
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap((item) => stringValues(item));
}

function hasToolResult(entry: unknown): boolean {
  return (arr(at(entry, "message", "content")) ?? []).some(
    (block) => strAt(block, "type") === "tool_result",
  );
}

function assistantBlocks(
  entry: unknown,
  includeText: boolean,
): TranscriptSelection {
  const textBlocks: string[] = [];
  const toolInputs: string[] = [];
  for (const block of arr(at(entry, "message", "content")) ?? []) {
    const kind = strAt(block, "type");
    if (kind === "tool_use")
      toolInputs.push(...stringValues(at(block, "input")));
    const text = kind === "text" ? strAt(block, "text") : undefined;
    if (includeText && text !== undefined) textBlocks.push(text);
  }
  return { text: textBlocks.join("\n"), toolInputs };
}

function finalAssistantText(transcript: string): TranscriptSelection | Error {
  const entries: unknown[] = [];
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const entry = parseJson(line);
    if (entry === undefined) return new Error("malformed transcript line");
    entries.push(entry);
  }

  const latestUserTurn = entries.findLastIndex(
    (entry) => strAt(entry, "type") === "user" && !hasToolResult(entry),
  );
  const latestToolResult = entries.findLastIndex(
    (entry, index) => index > latestUserTurn && hasToolResult(entry),
  );
  const after = Math.max(latestUserTurn, latestToolResult);
  const textBlocks: string[] = [];
  const toolInputs: string[] = [];
  for (const [index, entry] of entries.entries()) {
    if (index <= latestUserTurn || strAt(entry, "type") !== "assistant")
      continue;
    const selected = assistantBlocks(entry, index > after);
    textBlocks.push(selected.text);
    toolInputs.push(...selected.toolInputs);
  }
  return {
    text: textBlocks.filter((text) => text !== "").join("\n"),
    toolInputs,
  };
}

function withoutToolInputs(text: string, toolInputs: string[]): string {
  return toolInputs.reduce(
    (remaining, input) =>
      input === "" ? remaining : remaining.replaceAll(input, ""),
    text,
  );
}

async function main(audit: DecisionAudit): Promise<number> {
  const payload = parseJson(await Bun.stdin.text());
  audit.session_id = strAt(payload, "session_id");
  audit.transcript_path = strAt(payload, "transcript_path");
  const active = at(payload, "stop_hook_active");
  if (typeof active === "boolean") audit.stop_hook_active = active;
  if (active === true)
    return recordDecision(audit, "allow", "stop_hook_active");
  if (payload === undefined) {
    stderrLine("check failed open: malformed hook payload");
    return recordDecision(audit, "allow", "malformed_payload");
  }

  if (!existsSync(audit.settings_path))
    return recordDecision(audit, "allow", "missing_settings");
  const settingsText = readFileSync(audit.settings_path, "utf8");
  const settings = parseJson(settingsText);
  if (settings === undefined) {
    stderrLine("check failed open: malformed ~/.claude/settings.json");
    return recordDecision(audit, "allow", "malformed_settings");
  }
  const policy = await attempt(() => requiredReplyLanguage("claude"));
  if (!policy.ok) {
    const error = errorMessage(policy.error);
    stderrLine(`check failed open: ${error}`);
    return recordDecision(audit, "allow", "policy_error", error);
  }
  if (policy.value instanceof Error) {
    stderrLine(`check failed open: ${policy.value.message}`);
    return recordDecision(audit, "allow", "policy_error", policy.value.message);
  }
  audit.language = strAt(settings, "language");
  if (audit.language !== policy.value)
    return recordDecision(audit, "allow", "language_not_japanese");

  // Keep the Stop response when it contains visible prose, but remove tool_use input strings
  // echoed into it. The transcript supplies typed text blocks when the response is only tool data
  // or older clients do not provide last_assistant_message.
  const response = strAt(payload, "last_assistant_message");
  const transcript = audit.transcript_path;
  if (response === undefined && (transcript === undefined || transcript === ""))
    return recordDecision(audit, "allow", "missing_response");

  audit.text_source =
    response === undefined ? "transcript" : "last_assistant_message";
  let selection: TranscriptSelection | undefined;
  if (transcript !== undefined && transcript !== "" && response !== "") {
    const result = await attempt(() => finalAssistantText(transcript));
    if (!result.ok && response === undefined) {
      const error = errorMessage(result.error);
      stderrLine(`check failed open: ${error}`);
      return recordDecision(audit, "allow", "check_error", error);
    }
    if (result.ok && result.value instanceof Error && response === undefined) {
      stderrLine(`check failed open: ${result.value.message}`);
      return recordDecision(
        audit,
        "allow",
        "transcript_error",
        result.value.message,
      );
    }
    if (result.ok && !(result.value instanceof Error)) {
      selection = result.value;
    }
  }
  const responseText =
    response === undefined
      ? undefined
      : withoutToolInputs(response, selection?.toolInputs ?? []);
  const hasResponseText = responseText !== undefined && responseText !== "";
  let text = "";
  if (response === "") {
    text = response;
  } else if (hasResponseText) {
    text = responseText;
  } else if (selection !== undefined) {
    text = selection.text;
    audit.text_source = "transcript";
  } else {
    text = responseText ?? "";
  }
  audit.message_chars = text.length;
  const classification = classifyJapanesePrimary(text);
  audit.classifier_outcome = classification.outcome;
  audit.classifier_reason = classification.reason;
  audit.classifier_scope = classification.scope;
  if (classification.outcome !== "non-japanese")
    return recordDecision(audit, "allow", classification.reason);

  process.stdout.write(
    `${hookJson({ decision: "block", reason: JAPANESE_REPLY_BLOCK_REASON })}\n`,
  );
  return recordDecision(audit, "block", classification.reason);
}

if (import.meta.main) {
  const home = process.env.HOME ?? homedir();
  const audit: DecisionAudit = {
    home,
    settings_path: join(home, ".claude", "settings.json"),
  };
  const result = await attempt(() => main(audit));
  if (!result.ok) {
    stderrLine(`check failed open: ${errorMessage(result.error)}`);
    await recordDecision(
      audit,
      "allow",
      "check_error",
      errorMessage(result.error),
    );
    process.exit(0);
  }
  process.exit(result.value);
}
