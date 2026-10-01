// Stop / PostToolUse hook — attach one line "MM-DD HH:MM | Ctx: … | Rate: 5h … · 7d … | Sys: CPU …"
// (time, this session's context and API budget, host) to the thread at this moment, so a transcript shows what the machine looked like WHEN something
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
// Per session: the statusline writes THIS session's rows (Ctx, Rate) here. Each payload carries
// its own context and the rate_limits it last received, so a shared file let another session's
// older Rate show here (2026-10-01: 7d 60% then 51%, same reset).
const SESSION_DIR = `${HOME}/.cache/claude/statusline-session`;
const STALE_MS = 120_000;
const RST = "\x1b[0m";
const DIM = "\x1b[2m";
const SEP = ` ${DIM}|${RST} `; // the statusline's own separator
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
  };
  if (typeof cached.at !== "number" || typeof cached.line !== "string") return;
  // The statusline's own colors when present (the renderer keeps ANSI: hook_system_message is a
  // plain Ink text node), else the plain row.
  const sys = typeof cached.ansi === "string" ? cached.ansi : cached.line;
  if (now - cached.at > STALE_MS) return;

  const key = sid.replace(/[^A-Za-z0-9_-]/g, "_");
  // This session's rows, as the statusline ordered them. Missing or stale -> none.
  const read = await attempt(
    () =>
      JSON.parse(readFileSync(`${SESSION_DIR}/${key}.json`, "utf8")) as {
        at?: unknown;
        rows?: unknown;
      },
  );
  const sess = read.ok ? read.value : {};
  const fresh = typeof sess.at === "number" && now - sess.at <= STALE_MS;
  const rows = (fresh && Array.isArray(sess.rows) ? sess.rows : [])
    .map((r: { line?: unknown; ansi?: unknown }) =>
      typeof r?.ansi === "string" ? r.ansi : r?.line,
    )
    .filter((r): r is string => typeof r === "string" && r !== "");
  // One record per line: "MM-DD HH:MM | Ctx: … | Rate: … | Sys: …" — the time is this event's (the
  // mobile app shows none), the separator is the bar's SEP.
  const t = Temporal.Now.plainDateTimeISO();
  const p2 = (n: number) => String(n).padStart(2, "0");
  const time = `${p2(t.month)}-${p2(t.day)} ${p2(t.hour)}:${p2(t.minute)}`;
  const shown = [`${DIM}${time}${RST}`, ...rows, sys].join(SEP);

  const statePath = `${STATE_DIR}/${key}.last`;
  const last = await attempt(() => Number(readFileSync(statePath, "utf8")));
  const lastAt = last.ok && Number.isFinite(last.value) ? last.value : 0;
  if (event === "PostToolUse" && now - lastAt < MIN_GAP_MS) return;

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath, `${now}\n`);
  process.stdout.write(`${JSON.stringify({ systemMessage: shown })}\n`);
}

await attempt(main); // FAIL OPEN — a missing cache or state file just means no line this time
process.exit(0);
