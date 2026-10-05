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
import { arr, at, parseJson, str, strAt } from "../../hooks/narrow.ts";
import { readStdinJson } from "./lib.ts";

const HOME = process.env.HOME ?? "";
const CACHE = `${HOME}/.cache/claude/statusline-sys.json`;
const STATE_DIR = `${HOME}/.cache/claude/sys-log`;
// Per session: the statusline writes THIS session's rows (Ctx, Rate) here. Each payload carries
// its own context and the rate_limits it last received, so a shared file let another session's
// older Rate show here (2026-10-01: 7d 60% then 51%, same reset).
const SESSION_DIR = `${HOME}/.cache/claude/statusline-session`;
const STALE_MS = 120_000;
const RST = "\u001B[0m";
const DIM = "\u001B[2m";
const SEP = ` ${DIM}|${RST} `; // the statusline's own separator
const MIN_GAP_MS = 60_000;

function p2(n: number): string {
  return String(n).padStart(2, "0");
}

async function main(): Promise<void> {
  const payload = readStdinJson();
  const event = strAt(payload, "hook_event_name") ?? "";
  const sid = str(at(payload, "session_id") ?? "unknown");
  if (event !== "Stop" && event !== "PostToolUse") return;
  if (sid === undefined) return; // a non-string session_id never had a usable key

  const now = Temporal.Now.instant().epochMilliseconds;
  const cached = parseJson(readFileSync(CACHE, "utf8"));
  const cachedAt = at(cached, "at");
  const cachedLine = strAt(cached, "line");
  if (typeof cachedAt !== "number" || cachedLine === undefined) return;
  // The statusline's own colors when present (the renderer keeps ANSI: hook_system_message is a
  // plain Ink text node), else the plain row.
  const sys = strAt(cached, "ansi") ?? cachedLine;
  if (now - cachedAt > STALE_MS) return;

  const key = sid.replaceAll(/[^A-Za-z0-9_-]/gu, "_");
  // This session's rows, as the statusline ordered them. Missing or stale -> none.
  const read = await attempt(() =>
    parseJson(readFileSync(`${SESSION_DIR}/${key}.json`, "utf8")),
  );
  if (read.ok && read.value === null) return; // a literal null file was never a readable record
  const sess: unknown = read.ok ? read.value : {};
  const sessAt = at(sess, "at");
  const fresh = typeof sessAt === "number" && now - sessAt <= STALE_MS;
  const rows = (fresh ? (arr(at(sess, "rows")) ?? []) : []).flatMap((r) => {
    const row = strAt(r, "ansi") ?? strAt(r, "line");
    return row === undefined || row === "" ? [] : [row];
  });
  // One record per line: "MM-DD HH:MM | Ctx: … | Rate: … | Sys: …" — the time is this event's (the
  // mobile app shows none), the separator is the bar's SEP.
  const t = Temporal.Now.plainDateTimeISO();
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
