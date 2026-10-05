// Shared plumbing for Claude Code hooks (bun runtime; node:-APIs only, zero npm deps —
// hooks must never trigger bun's auto-install at hook time). The zero-dep rule overrides
// the house zod-for-narrowing preference: payload/transcript shapes are hand-narrowed at
// the JSON boundary and kept loose (`any`) on purpose.
//
// Hook protocol reminders (see operating-the-harness/references/hooks.md):
//   - stdin = event JSON
//   - PreToolUse decision = exit 0 + JSON on stdout (decidePre)
//   - Stop guard block    = exit 2 + stderr; never mix the two channels

import { readFileSync } from "node:fs";
import { attempt } from "../../hooks/attempt.ts";
import { arr, at, parseJson, str, strAt } from "../../hooks/narrow.ts";

// The protocol primitives are vendor-neutral and live with the portable hooks; re-exported so
// Claude-only hooks keep importing everything from ./lib.ts.
export { decidePre, findExe, readStdinJson } from "../../hooks/lib.ts";

export type TranscriptEntry = {
  type?: string | undefined;
  message?: { content?: unknown } | undefined;
};

// One transcript line, read field by field (a field of the wrong type is simply absent).
function entryOf(line: unknown): TranscriptEntry {
  return {
    type: strAt(line, "type"),
    message: { content: at(line, "message", "content") },
  };
}

// Transcript is JSONL; skip malformed lines rather than fail the whole read. An unreadable
// file still throws (rejects), exactly as the synchronous read did.
export async function readTranscript(path: string): Promise<TranscriptEntry[]> {
  const entries: TranscriptEntry[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const parsed = await attempt(() => parseJson(line));
    if (parsed.ok) entries.push(entryOf(parsed.value));
  }
  return entries;
}

function textBlocks(content: unknown): string[] {
  const whole = str(content);
  if (whole !== undefined) return [whole];
  return (arr(content) ?? []).flatMap((b) => {
    const text = strAt(b, "text");
    return strAt(b, "type") === "text" && text !== undefined ? [text] : [];
  });
}

// This turn's assistant prose = assistant text blocks after the last user-type entry
// (tool_result carriers count as user entries too, which is what scopes us to the turn).
export function turnText(entries: TranscriptEntry[]): string {
  const rel = entries.filter(
    (e) => e.type === "assistant" || e.type === "user",
  );
  let lastUser = -1;
  rel.forEach((e, i) => {
    if (e.type === "user") lastUser = i;
  });
  return rel
    .slice(lastUser + 1)
    .filter((e) => e.type === "assistant")
    .flatMap((e) => textBlocks(e.message?.content))
    .join("\n");
}

// Most recent HUMAN prompt text (tool_result user entries carry no text blocks).
export function lastUserText(entries: TranscriptEntry[]): string {
  const texts = entries
    .filter((e) => e.type === "user")
    .map((e) => textBlocks(e.message?.content).join("\n"))
    .filter((t) => t !== "");
  return texts.at(-1) ?? "";
}

// Remove ``` fences, `inline` spans (line-scoped, like the sed it replaces), and
// optionally > blockquotes — so a QUOTED example never triggers a guard.
export function stripCode(
  text: string,
  opts: { blockquotes?: boolean } = {},
): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*```/u.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (opts.blockquotes === true && /^\s*>/u.test(line)) continue;
    out.push(line.replaceAll(/`[^`]*`/gu, ""));
  }
  return out.join("\n");
}
