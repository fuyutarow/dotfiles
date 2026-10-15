import { hookJson } from "./lib.ts";
// Stop / PostToolUse hook — attach one line "Agx: 3 running · 2 ended-unjudged · orphaned 1 | <ticket> <row> 4m working · …"
// describing THIS session's agx fleet at this moment, so a transcript shows when each worker
// started, ended and was judged. Sibling of log-sys-snapshot.ts and built the same way.
//
// Channel: a top-level `systemMessage` (recorded in the transcript, shown to the user, not added
// to the model's context) — see log-sys-snapshot.ts for the measurement.
//
// Sampler: none, and this hook never spawns agx. tools/statusline/src/agx-snapshot.ts refreshes
// `agx ls --json` into <runtime>/statusline/agx-runs.json on every render; this hook only reads
// that file (the path rule is a copy of agxSnapshotPath — readAgxSnapshotAsync itself would
// start a refresh, i.e. a sampler). A missing, unparsable or older-than-STALE_MS snapshot says
// nothing about now, so no line.
//
// Attribution: a run belongs to this session when its `dispatcher_session` equals the payload's
// session_id. Other sessions' runs never enter the counts or the entries.
//
// Cadence: every Stop, and on PostToolUse at most once per MIN_GAP_MS per session.
//
// Fail-open: this is a log, never a gate. Any problem -> exit 0 with no output.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { attempt } from "../../hooks/attempt.ts";
import { arr, at, parseJson, str, strAt } from "../../hooks/narrow.ts";
import { readStdinJson } from "./lib.ts";

const HOME = process.env.HOME ?? "";
const STATE_DIR = `${HOME}/.cache/claude/agx-log`;
const STALE_MS = 120_000;
const MIN_GAP_MS = 60_000;

const nonEmpty = (v: string | undefined): string | undefined =>
  v !== undefined && v !== "" ? v : undefined;

// The statusline's snapshot location (tools/statusline/src/agx-snapshot.ts agxSnapshotPath).
function snapshotPath(): string {
  const env = process.env;
  const runtime = nonEmpty(env.XDG_RUNTIME_DIR);
  if (runtime !== undefined)
    return join(runtime, "statusline", "agx-runs.json");
  const state =
    nonEmpty(env.AGX_NEXT_STATE_DIR) ??
    nonEmpty(env.AGX_STATE_DIR) ??
    (nonEmpty(env.XDG_STATE_HOME) === undefined
      ? join(env.HOME ?? "", ".local", "state", "agx-next")
      : join(env.XDG_STATE_HOME ?? "", "agx-next"));
  return join(state, "statusline", "agx-runs.json");
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

const ticketName = (t: string): string => basename(t).replace(/\.md$/u, "");

async function describe(
  runs: unknown[],
  now: number,
): Promise<string | undefined> {
  const running: string[] = [];
  let ended = 0;
  let orphaned = 0;
  for (const r of runs) {
    const state = strAt(r, "state");
    if (state === "running") {
      const started = await attempt(
        () =>
          Temporal.Instant.from(strAt(r, "started_at") ?? "").epochMilliseconds,
      );
      const age = started.ok ? ` ${elapsed(now - started.value)}` : "";
      const row = strAt(r, "row");
      running.push(
        `${ticketName(strAt(r, "ticket") ?? strAt(r, "id") ?? "?")}${row === undefined ? "" : ` ${row}`}${age} working`,
      );
    } else if (state === "orphaned") orphaned += 1;
    else if (state === "ended" && (at(r, "judgment") ?? null) === null)
      ended += 1;
  }
  const counts = [
    running.length > 0 ? `${running.length} running` : "",
    ended > 0 ? `${ended} ended-unjudged` : "",
    orphaned > 0 ? `orphaned ${orphaned}` : "",
  ].filter((c) => c !== "");
  if (counts.length === 0) return undefined;
  const head = `Agx: ${counts.join(" · ")}`;
  return running.length > 0 ? `${head} | ${running.join(" · ")}` : head;
}

async function main(): Promise<void> {
  const payload = readStdinJson();
  const event = strAt(payload, "hook_event_name") ?? "";
  const sid = str(at(payload, "session_id") ?? "");
  if (event !== "Stop" && event !== "PostToolUse") return;
  if (sid === undefined || sid === "") return;

  const now = Temporal.Now.instant().epochMilliseconds;
  const snap = parseJson(await readFile(snapshotPath(), "utf8"));
  const capturedAt = at(snap, "capturedAt");
  const output = strAt(snap, "output");
  if (typeof capturedAt !== "number" || output === undefined) return;
  if (now - capturedAt > STALE_MS || capturedAt > now) return;
  const all = arr(parseJson(output));
  if (all === undefined) return;
  const mine = all.filter((r) => strAt(r, "dispatcher_session") === sid);
  const line = await describe(mine, now);
  if (line === undefined) return;

  const key = sid.replaceAll(/[^A-Za-z0-9_-]/gu, "_");
  const statePath = `${STATE_DIR}/${key}.last`;
  const last = await attempt(async () =>
    Number(await readFile(statePath, "utf8")),
  );
  const lastAt = last.ok && Number.isFinite(last.value) ? last.value : 0;
  if (event === "PostToolUse" && now - lastAt < MIN_GAP_MS) return;

  await mkdir(STATE_DIR, { recursive: true });
  await writeFile(statePath, `${now}\n`);
  process.stdout.write(`${hookJson({ systemMessage: line })}\n`);
}

await attempt(main); // FAIL OPEN — a missing snapshot or state file just means no line this time
process.exit(0);
