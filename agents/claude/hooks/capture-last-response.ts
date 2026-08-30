#!/usr/bin/env bun
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

const HOME = process.env.HOME ?? "";
const KEEP = 20; // deepest `/quote N` worth supporting; bounds the file for a long session

try {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const sid = payload?.session_id;
  const text = payload?.last_assistant_message;
  if (typeof sid === "string" && sid && typeof text === "string") {
    const dir = `${HOME}/.cache/claude/last-response`;
    const file = `${dir}/${sid}.jsonl`;

    let lines: string[] = [];
    try {
      lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "");
    } catch {
      // no history yet -> start one
    }
    lines.push(JSON.stringify({ at: Date.now(), text }));

    mkdirSync(dir, { recursive: true });
    writeFileSync(file, `${lines.slice(-KEEP).join("\n")}\n`);
  }
} catch {
  // best-effort snapshot -> never fail Stop over this
}
process.exit(0);
