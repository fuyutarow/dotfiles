#!/usr/bin/env bun
// Stop hook — snapshots the just-finished turn's `last_assistant_message` to a per-session
// scratch file, so /mycopy (agents/commands/mycopy.md) can grab it without touching
// transcript_path. hooks.md documents transcript_path as racy for this: "written
// asynchronously and may lag the in-memory conversation... may not yet include the current
// turn's most recent messages" — and explicitly says to use `last_assistant_message` on
// Stop/SubagentStop instead. A slash command's own `!command` shell step has no equivalent
// field of its own (only ordinary Bash-tool env), so it has nothing to read unless something
// upstream — this hook — already wrote it down every turn.
//
// Fires on every Stop (see settings.json's matcher). Best-effort only: never worth failing a
// turn over a clipboard convenience feature.

import { mkdirSync, writeFileSync } from "node:fs";
import { readStdinJson } from "./lib.ts";

const HOME = process.env.HOME ?? "";

try {
  const payload = readStdinJson();
  const sid = payload?.session_id;
  const text = payload?.last_assistant_message;
  if (typeof sid === "string" && sid && typeof text === "string") {
    const dir = `${HOME}/.cache/claude/last-response`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/${sid}.txt`, text);
  }
} catch {
  // best-effort snapshot -> never fail Stop over this
}
process.exit(0);
