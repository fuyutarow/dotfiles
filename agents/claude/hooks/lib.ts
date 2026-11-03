// Shared plumbing for Claude Code hooks (bun runtime; node:-APIs only, zero npm deps —
// hooks must never trigger bun's auto-install at hook time). The zero-dep rule overrides
// the house zod-for-narrowing preference: payload/transcript shapes are hand-narrowed at
// the JSON boundary and kept loose (`any`) on purpose.
//
// Hook protocol reminders (see the archived harness contract and local hook declarations):
//   - stdin = event JSON
//   - PreToolUse decision = exit 0 + JSON on stdout (decidePre)
//   - Stop guard block    = top-level { decision: "block", reason } JSON on stdout. Existing
//     guards may use exit 2 + stderr, but new guards should return the structured decision.

import { readTranscriptTail, textBlocks } from "./lib/transcript-tail.ts";

// The protocol primitives are vendor-neutral and live with the portable hooks; re-exported so
// Claude-only hooks keep importing everything from ./lib.ts.
export {
  decidePre,
  findExe,
  readStdinJson,
  readBoundedStdinJson,
  hookJson,
  hookMessage,
  hookStderr,
} from "../../hooks/lib.ts";

export type { TranscriptEntry } from "./lib/transcript-tail.ts";
export { readTranscriptTail, textBlocks } from "./lib/transcript-tail.ts";

// This turn's assistant prose, read backward from the end of the transcript: the assistant
// text blocks after the last user-type entry (tool_result carriers count as user entries, which
// is what scopes us to the turn). The read stops at that user entry, so its cost follows the
// turn, not the session.
export async function turnTextTail(path: string): Promise<string> {
  const pieces: string[][] = [];
  for await (const entry of readTranscriptTail(path)) {
    if (entry.type === "user") break;
    if (entry.type === "assistant")
      pieces.push(textBlocks(entry.message?.content));
  }
  return pieces.toReversed().flat().join("\n");
}

// Most recent HUMAN prompt text, read backward; stops at the first user entry carrying text.
export async function lastUserTextTail(path: string): Promise<string> {
  for await (const entry of readTranscriptTail(path)) {
    if (entry.type !== "user") continue;
    const text = textBlocks(entry.message?.content).join("\n");
    if (text !== "") return text;
  }
  return "";
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
