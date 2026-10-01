// Stop / PostToolUse hook — attach the statusline's "Rate: 5h … · 7d …" (API budget) and
// "Sys: CPU … · RAM … · VRAM …" (host) rows to the thread at this moment, so a transcript shows what the machine looked like WHEN something
// happened, not only what the statusline shows now.
//
// Channel: a top-level `systemMessage`. Claude Code records a hook's stdout in the transcript
// (attachment type hook_success, timestamped) and shows systemMessage to the user; it does not
// add either to the model's context — only additionalContext (and plain stdout on
// UserPromptSubmit/SessionStart) does. So the log costs no model tokens (measured 2026-09-27:
// 16 PreToolUse hook_success records with decision JSON in this session's transcript, none of it
// in the model's context).
//
// Sampler: none here. statusline-command.ts samples (nvidia-smi, the /proc CPU delta) on every
// render and caches the plain row in ~/.cache/claude/statusline-sys.json; this hook only reads
// it, so a tool call never pays for a sample. A reading older than STALE_MS is not shown — it
// would be a claim about a moment it does not describe.
//
// Cadence: every Stop (end of turn), and on PostToolUse at most once per MIN_GAP_MS per session,
// so a long tool-heavy turn still gets a timeline without one line per tool call.
//
// Fail-open: this is a log, never a gate. Any problem -> exit 0 with no output.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { attempt } from "../../hooks/attempt.ts";
import { readStdinJson } from "./lib.ts";

const HOME = process.env.HOME ?? "";
const CACHE = `${HOME}/.cache/claude/statusline-sys.json`;
const STATE_DIR = `${HOME}/.cache/claude/sys-log`;
const STALE_MS = 120_000;
const MIN_GAP_MS = 60_000;

async function main(): Promise<void> {
  const payload = readStdinJson();
  const event: string = payload?.hook_event_name ?? "";
  const sid: string = payload?.session_id ?? "unknown";
  if (event !== "Stop" && event !== "PostToolUse") return;

  const now = Temporal.Now.instant().epochMilliseconds;
  const cached = JSON.parse(readFileSync(CACHE, "utf8")) as {
    at?: unknown;
    line?: unknown;
    ansi?: unknown;
    rate?: unknown;
    rate_ansi?: unknown;
  };
  if (typeof cached.at !== "number" || typeof cached.line !== "string") return;
  // The statusline's own colors when present (the renderer keeps ANSI: hook_system_message is a
  // plain Ink text node), else the plain row.
  const sys = typeof cached.ansi === "string" ? cached.ansi : cached.line;
  const rate =
    typeof cached.rate_ansi === "string" ? cached.rate_ansi : cached.rate;
  // Rate first, as on the bar; a payload without rate_limits leaves the Sys row alone.
  const shown =
    typeof rate === "string" && rate !== "" ? `${rate}\n${sys}` : sys;
  if (now - cached.at > STALE_MS) return;

  const statePath = `${STATE_DIR}/${sid.replace(/[^A-Za-z0-9_-]/g, "_")}.last`;
  const last = await attempt(() => Number(readFileSync(statePath, "utf8")));
  const lastAt = last.ok && Number.isFinite(last.value) ? last.value : 0;
  if (event === "PostToolUse" && now - lastAt < MIN_GAP_MS) return;

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath, `${now}\n`);
  process.stdout.write(`${JSON.stringify({ systemMessage: shown })}\n`);
}

await attempt(main); // FAIL OPEN — a missing cache or state file just means no line this time
process.exit(0);
