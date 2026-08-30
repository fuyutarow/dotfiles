#!/usr/bin/env bun
// UserPromptExpansion hook (matcher: quote) — runs /quote to completion HERE and returns
// decision:"block", so the turn ends without an inference call.
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
// block — so the work has to happen here, and agents/commands/quote.md is reduced to a
// name-registering placeholder. Keep the matcher in settings.json in step with that name.
//
// `/quote N` means the last N turns, oldest first — a QUANTITY. Note this deliberately differs
// from the built-in `/copy N`, where N is an INDEX ("copies the Nth-latest"). The point of this
// command is handing someone a readable excerpt of what a session just said, and for that
// "the last two things" is the useful ask; "only the second-to-last, without the last" is not.
//
// Everything is best-effort: on any failure we still block (the user typed a clipboard
// command, not a prompt for Claude — silently falling through to an inference turn would be
// the worst outcome) and say what went wrong in `reason`.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readStdinJson } from "./lib.ts";

const HOME = process.env.HOME ?? "";
const HOOKS = `${HOME}/.claude/hooks`;
const TURN_SEPARATOR = "\n\n---\n\n";
// Matches capture-last-response.ts's KEEP — that file only ever HAS this many turns to give,
// so validating against a different number here would let a request past this check just to
// fail confusingly later. Keep the two in step if either changes.
const MAX_TURNS = 20;

function block(reason: string): never {
  console.log(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

let sid = "";
let count = 1;
let rawArgs = "";
try {
  const payload = readStdinJson();
  if (typeof payload?.session_id === "string") sid = payload.session_id;
  rawArgs = String(payload?.command_args ?? "").trim();
} catch {
  block("/quote could not read its hook input.");
}

// No argument -> default to 1, the common case, and not an error. An argument that IS given
// but isn't a clean positive whole number is rejected rather than coerced: a mistyped count
// should say so, not silently copy something the user didn't ask for.
if (rawArgs !== "") {
  if (!/^\d+$/.test(rawArgs)) {
    block(
      `/quote's argument must be a whole number of turns, or omitted entirely. Got "${rawArgs}". ` +
        `Try "/quote" for the last turn, or "/quote 3" for the last 3.`,
    );
  }
  const n = Number.parseInt(rawArgs, 10);
  if (n < 1 || n > MAX_TURNS) {
    block(
      `/quote N must be between 1 and ${MAX_TURNS} — capture-last-response.ts only keeps the ` +
        `last ${MAX_TURNS} turns of history, so anything beyond that could never be honored. ` +
        `Got ${n}. Try "/quote ${MAX_TURNS}" to go back as far as possible.`,
    );
  }
  count = n;
}

// Written every turn by capture-last-response.ts (Stop hook); newest last.
let turns: string[] = [];
try {
  turns = readFileSync(
    `${HOME}/.cache/claude/last-response/${sid}.jsonl`,
    "utf8",
  )
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l)?.text)
    .filter((t): t is string => typeof t === "string");
} catch {
  // no history file -> handled as "nothing captured" below
}

if (turns.length === 0) {
  block(
    "Nothing captured for this session yet — capture-last-response.ts writes it on each Stop, " +
      "so there is nothing to quote until Claude has finished a turn here.",
  );
}

const selected = turns.slice(-count);

// The cross-session addressable name ("firedancer-fe"), not the AI-generated title — that
// distinction is the whole point of the from: header. Falls back to the raw session id.
let name = sid;
try {
  const resolved = execFileSync(
    "bun",
    [`${HOOKS}/resolve-agent-name.ts`, sid],
    { stdio: ["ignore", "pipe", "ignore"], encoding: "utf8", timeout: 5000 },
  ).trim();
  if (resolved) name = resolved;
} catch {
  // leave the session id as the name
}

const payloadText = `from: ${name}\n${selected.join(TURN_SEPARATOR)}`;

// Claude Code cannot reach the clipboard from a process it spawns — see
// hooks/copy-via-herdr-pane.ts's header for why, and what it does instead. The payload travels
// as a FILE PATH: it is arbitrary assistant prose, and shell-quoting it into a command line
// would be a needless injection surface.
let paneId = "";
try {
  const file = join(mkdtempSync(join(tmpdir(), "quote-")), "payload.txt");
  writeFileSync(file, payloadText);
  paneId = execFileSync("bun", [`${HOOKS}/copy-via-herdr-pane.ts`, file], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
    timeout: 15000,
  }).trim();
} catch {
  block(
    `Could not reach an idle shell pane, so nothing was copied. Select this to copy it by hand:\n\n${payloadText}`,
  );
}

const scope = selected.length === 1 ? "" : ` (last ${selected.length} turns)`;
const short =
  selected.length < count
    ? ` — only ${selected.length} turn${selected.length === 1 ? "" : "s"} captured so far`
    : "";
block(`Copied to clipboard as "from: ${name}"${scope}${short}. [${paneId}]`);
