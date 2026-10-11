// Stop hook — appends the just-finished turn's `last_assistant_message` to a per-session
// history file, so /quote (agents/claude/hooks/quote-command.ts) can quote the last turn, or
// the last N, without touching transcript_path. hooks.md documents transcript_path as racy for
// this: "written asynchronously and may lag the in-memory conversation... may not yet include
// the current turn's most recent messages" — and explicitly says to use
// `last_assistant_message` on Stop/SubagentStop instead. That field exists only on the hook
// event, so nothing downstream can read it unless this hook writes it down every turn.
//
// JSONL, newest last, trimmed to KEEP entries. A flat one-response-per-session file was enough
// when /quote could only ever mean "the last one"; `/quote N` needs the history behind it.
//
// Fires on every Stop (see settings.json's matcher). Best-effort only: never worth failing a
// turn over a clipboard convenience feature.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { attempt, attemptOr } from "../../hooks/attempt.ts";
import { at, parseJson, strAt } from "../../hooks/narrow.ts";
import { MAX_QUOTE_TURNS } from "./quote.config.ts";

const HOME = process.env.HOME ?? "";
const KEEP = MAX_QUOTE_TURNS; // deepest `/quote N` worth supporting; bounds the file for a long session

async function recordResponse(
  sid: unknown,
  text: unknown,
  replaceLast: boolean,
): Promise<void> {
  if (!(typeof sid === "string" && sid !== "" && typeof text === "string"))
    return;
  const dir = `${HOME}/.cache/claude/last-response`;
  const file = `${dir}/${sid}.jsonl`;

  // no (readable) history yet -> start one
  const noHistory: string[] = [];
  const lines = await attemptOr(
    () =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== ""),
    noHistory,
  );
  const response = JSON.stringify({
    at: Temporal.Now.instant().epochMilliseconds,
    text,
  });
  // Stop-hook retries carry stop_hook_active=true; replace the blocked draft so this logical
  // assistant turn has one history entry, the final response the user saw.
  if (replaceLast && lines.length > 0) lines[lines.length - 1] = response;
  else lines.push(response);

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${lines.slice(-KEEP).join("\n")}\n`);
}

// best-effort snapshot -> never fail Stop over this (a bad payload OR a failed write)
await attempt(async () => {
  const payload = parseJson(readFileSync(0, "utf8"));
  await recordResponse(
    strAt(payload, "session_id"),
    strAt(payload, "last_assistant_message"),
    at(payload, "stop_hook_active") === true,
  );
});
process.exit(0);
