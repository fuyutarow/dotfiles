import { hookJson } from "./lib.ts";
import { hasBareUnavailable } from "../../../tools/statusline/src/ansi.ts";
import {
  FleetSessionSchema,
  FleetSessionUnavailableSchema,
  readFleetSession,
  type FleetSession,
} from "../../../tools/shared/src/fleet-session.ts";
// Stop / PostToolUse hook — attach one line "user@host:MM-DD HH:MM+09 | Ctx: … | Rate: 5h … · 7d … | Sys: CPU …"
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
// Sampler: tools/shared/src/gpu-sampler.ts owns GPU observations. The statusline
// caches the plain row in ~/.cache/claude/statusline-sys.json; this hook only reads
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
import { promptParts } from "./prompt-stamp.ts";

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

const unavailable = (value: unknown) =>
  `n/a (${FleetSessionUnavailableSchema.safeParse(value).data?.why ?? "not recorded"})`;

function sessionRows(session: FleetSession): string[] {
  const ctx = FleetSessionSchema.shape.ctx.options[0].safeParse(session.ctx);
  let context = `Ctx: ${unavailable(session.ctx)}`;
  if (ctx.success) {
    const { tokens, pct } = ctx.data;
    const shown =
      tokens < 1000 ? `${tokens}` : `${Math.round(tokens / 100) / 10}k`;
    context = `Ctx: ${shown} ${pct}%`;
  }
  const rate = FleetSessionSchema.shape.rate.options[0].safeParse(session.rate);
  const usage = rate.success
    ? `Rate: 5h ${rate.data.five_h_pct}% · 7d ${rate.data.seven_d_pct}%`
    : `Rate: ${unavailable(session.rate)}`;
  return [context, usage].map((row) =>
    row.replaceAll(/[\r\n\u2028\u2029]/gu, " "),
  );
}

function publishedSessionRows(sess: unknown): string[] {
  const rows: string[] = [];
  for (const r of arr(at(sess, "rows")) ?? []) {
    const row = strAt(r, "ansi") ?? strAt(r, "line");
    if (row === undefined || row === "" || hasBareUnavailable(row)) continue;
    rows.push(row);
  }
  return rows;
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
  // Pre-upgrade presentation caches cannot establish a reason. Wait for the sampler to replace them.
  if (hasBareUnavailable(sys)) return;
  if (now - cachedAt > STALE_MS) return;

  const key = sid.replaceAll(/[^A-Za-z0-9_-]/gu, "_");
  // Schema 1 handoff takes precedence over the legacy statusline presentation cache.
  // It is session-owned state, not a sampler observation: updated_at is not a TTL.
  const fleet = FleetSessionSchema.safeParse(await readFleetSession(sid));
  // Legacy rows remain a fallback while the writer migrates to the shared handoff.
  const read = await attempt(() =>
    parseJson(readFileSync(`${SESSION_DIR}/${key}.json`, "utf8")),
  );
  if (!fleet.success && read.ok && read.value === null) return;
  const sess: unknown = read.ok ? read.value : {};
  const sessAt = at(sess, "at");
  const fresh = typeof sessAt === "number" && now - sessAt <= STALE_MS;
  const publishedRows = fresh ? publishedSessionRows(sess) : [];
  // The statusline publisher owns the complete per-session presentation, including provider
  // slots and reset windows. Fleet is a reduced handoff, so use it only when that fresh
  // presentation is unavailable; it remains the same-session fallback.
  let rows = publishedRows;
  if (publishedRows.length !== 2 && fleet.success)
    rows = sessionRows(fleet.data);
  // One record per line: "user@host:MM-DD HH:MM+09 | Ctx: … | Rate: … | Sys: …" — who and where
  // (sessions now span machines), and this event's time (the mobile app shows none), in the
  // prompt's own head shape (prompt-stamp.ts); the separator is SEP.
  const { user, host, stamp } = promptParts("");
  const shown = [`${DIM}${user}@${host}:${stamp}${RST}`, ...rows, sys].join(
    SEP,
  );

  const statePath = `${STATE_DIR}/${key}.last`;
  const last = await attempt(() => Number(readFileSync(statePath, "utf8")));
  const lastAt = last.ok && Number.isFinite(last.value) ? last.value : 0;
  if (event === "PostToolUse" && now - lastAt < MIN_GAP_MS) return;

  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath, `${now}\n`);
  process.stdout.write(`${hookJson({ systemMessage: shown })}\n`);
}

await attempt(main); // FAIL OPEN — a missing cache or state file just means no line this time
process.exit(0);
