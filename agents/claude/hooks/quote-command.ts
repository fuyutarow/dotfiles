#!/usr/bin/env bun
// UserPromptExpansion hook (matcher: quote|c) — runs /quote and /c to completion HERE and
// returns decision:"block", so the turn ends without an inference call.
//
// WHY NOT JUST THE COMMAND FILE. A skill/command is a prompt-injection mechanism: its rendered
// body — `!command` output included — becomes a message that a model turn then processes.
// There is no frontmatter field to render-but-not-send (the full field list is in
// slash-commands.md; nothing like no-model/output-only exists), so a normal custom command
// necessarily burns a full LLM turn to restate a STATUS line. For mechanical work that is pure
// waste. UserPromptExpansion is the documented event for the direct-typing path ("Runs when a
// user-typed command expands into a prompt before reaching Claude"), it matches on COMMAND
// NAME, and its decision:"block" "prevents the command from expanding".
//
// Because it fires BEFORE expansion, the command file's own `!command` step never runs when we
// block — so the work has to happen here, and agents/commands/{quote,c}.md are reduced to
// name-registering placeholders. Keep the matcher in settings.json in step with those names.
//
// Everything is best-effort: on any failure we still block (the user typed a clipboard
// command, not a prompt for Claude — silently falling through to an inference turn would be
// the worst outcome) and say what went wrong in `reason`.

import { execFileSync } from "node:child_process";
import { readStdinJson } from "./lib.ts";

const HOME = process.env.HOME ?? "";
const SCRIPT = `${HOME}/.claude/hooks/copy-session-response.sh`;

function block(reason: string): never {
  console.log(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

let out = "";
try {
  const payload = readStdinJson();
  const sid = typeof payload?.session_id === "string" ? payload.session_id : "";
  out = execFileSync("sh", [SCRIPT, sid], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
    timeout: 15000,
  });
} catch (e) {
  block(`/quote failed: ${e instanceof Error ? e.message : String(e)}`);
}

const status = /^STATUS: (\S+)/m.exec(out)?.[1];
const name = /^NAME: (.+)$/m.exec(out)?.[1] ?? "?";

if (status === "delivered") block(`Copied to clipboard as "from: ${name}".`);

if (status === "no-body") {
  block(
    "Nothing captured for this session yet — capture-last-response.ts writes it on each Stop, " +
      "so there is nothing to quote until Claude has finished a turn here.",
  );
}

// undelivered: no idle shell pane to hand the payload to (see copy-via-herdr-pane.ts). Show
// the text so the copy is still one selection away.
const body = out.split("PAYLOAD_START\n")[1]?.split("\nPAYLOAD_END")[0] ?? "";
block(
  `Could not reach an idle shell pane, so nothing was copied. Select this to copy it by hand:\n\n${body}`,
);
