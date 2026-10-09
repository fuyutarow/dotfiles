// Stop hook: enforce the user's Japanese reply preference against the final assistant message.
// Safety: FAIL OPEN on every hook error (including unreadable/malformed transcripts), with one
// stderr line explaining the failure. A broken language check must never trap a session.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { arr, at, parseJson, str, strAt } from "../../hooks/narrow.ts";

const MIN_LETTERS = 40;
// WHY 0.3: allow Japanese prose that contains ordinary English identifiers while still catching
// a mostly-English answer; code and paths are removed before calculating the share.
const MIN_JAPANESE_SHARE = 0.3;
const BLOCK_REASON =
  "直前の返答が英語です。日本語で書き直してください（コードや識別子は原文のままで構いません）。";

function stderrLine(reason: string): void {
  process.stderr.write(
    `enforce-reply-language: ${reason.replaceAll(/\s+/gu, " ")}\n`,
  );
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
  letters?: number;
  japanese_share?: number;
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

function finalAssistantText(transcript: string): string | Error {
  let lastText = "";
  for (const line of readFileSync(transcript, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const entry = parseJson(line);
    if (entry === undefined) return new Error("malformed transcript line");
    if (strAt(entry, "type") !== "assistant") continue;

    const content = at(entry, "message", "content");
    const direct = str(content);
    lastText =
      direct ??
      (arr(content) ?? [])
        .flatMap((block) => {
          const text = strAt(block, "text");
          return strAt(block, "type") === "text" && text !== undefined
            ? [text]
            : [];
        })
        .join("\n");
  }
  return lastText;
}

function stripNonProse(text: string): string {
  const codeAndQuotes: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence || /^\s*>/u.test(line)) continue;
    codeAndQuotes.push(line.replaceAll(/`[^`]*`/gu, ""));
  }

  return codeAndQuotes
    .join("\n")
    .replaceAll(/https?:\/\/\S+|www\.\S+/giu, " ")
    .replaceAll(
      /(?:~\/|\.\.?\/|\/)?(?:[\w.@+-]+\/)*[\w.@+-]+\.[A-Za-z0-9]{1,12}(?::\d+(?::\d+)?)?/gu,
      " ",
    );
}

function japaneseShare(text: string): { letters: number; share: number } {
  let japanese = 0;
  let latin = 0;
  for (const match of text.matchAll(
    /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]|\p{Script=Latin}/gu,
  )) {
    if (
      /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]$/u.test(match[0])
    )
      japanese += 1;
    else latin += 1;
  }
  const letters = japanese + latin;
  return { letters, share: letters === 0 ? 1 : japanese / letters };
}

function proseSegments(text: string): string[] {
  const lines = text.split("\n");
  const segments: string[] = [];
  let current: string[] = [];
  let currentKind: "prose" | "list" | "table" | undefined;
  const flush = () => {
    if (current.length > 0) segments.push(current.join("\n"));
    current = [];
    currentKind = undefined;
  };

  for (const line of lines) {
    if (/^\s*#/u.test(line)) {
      flush();
      segments.push(line);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    let kind: "prose" | "list" | "table" = "prose";
    if (/^\s*(?:[-+*]|\d+[.)])\s/u.test(line)) kind = "list";
    else if (/^\s*\|.*\|\s*$/u.test(line)) kind = "table";
    if (currentKind !== undefined && currentKind !== kind) flush();
    currentKind = kind;
    current.push(line);
  }
  flush();
  return segments;
}

function identifierHeavy(text: string): boolean {
  const tokens = text.match(/\p{Script=Latin}+/gu) ?? [];
  if (tokens.length === 0) return false;
  const identifiers = tokens.filter(
    (token) =>
      /[_\-./]/u.test(token) ||
      /[a-z][A-Z]/u.test(token) ||
      /^[A-Z]{2,}$/u.test(token),
  ).length;
  return identifiers / tokens.length >= 0.6;
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
  audit.language = strAt(settings, "language");
  if (audit.language !== "japanese")
    return recordDecision(audit, "allow", "language_not_japanese");

  // Stop's in-memory response is authoritative, including an empty string. The transcript
  // is written asynchronously and can still end with a tool call when this hook runs.
  // Fall back only for older clients that do not provide last_assistant_message.
  const response = strAt(payload, "last_assistant_message");
  const transcript = audit.transcript_path;
  if (response === undefined && (transcript === undefined || transcript === ""))
    return recordDecision(audit, "allow", "missing_response");

  audit.text_source =
    response === undefined ? "transcript" : "last_assistant_message";
  const text = response ?? finalAssistantText(transcript ?? "");
  if (text instanceof Error) {
    stderrLine(`check failed open: ${text.message}`);
    return recordDecision(audit, "allow", "transcript_error", text.message);
  }
  audit.message_chars = text.length;
  const prose = stripNonProse(text);
  const { letters, share } = japaneseShare(prose);
  audit.letters = letters;
  audit.japanese_share = share;
  const segmentBlocks = proseSegments(prose).some((segment) => {
    if (identifierHeavy(segment)) return false;
    const result = japaneseShare(segment);
    return result.letters >= 120 && result.share < MIN_JAPANESE_SHARE;
  });
  const wholeReplyBlocks = letters >= MIN_LETTERS && share < MIN_JAPANESE_SHARE;
  if (!wholeReplyBlocks && !segmentBlocks)
    return recordDecision(audit, "allow", "no_language_violation");

  process.stdout.write(
    `${JSON.stringify({ decision: "block", reason: BLOCK_REASON })}\n`,
  );
  return recordDecision(audit, "block", "english_prose");
}

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
