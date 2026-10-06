// Advisory hook (PreToolUse matcher "Bash", and UserPromptSubmit) — alert when the ccc
// (cocoindex-code) daemon has been INDEXING on the GPU for a long time. NEVER blocks: it adds
// context for the model and a systemMessage for the user, and exits 0 on every error (register
// WITHOUT --fail-closed).
//
// Why (2026-09-23): after a daemon restart the ccc daemon embedded soks' and qoed's catch-up
// indexes on the GPU for over an hour, and firedancer's GPU oracle blew its wall three times in
// that window while its owner diagnosed contention between their own jobs — nothing said the
// indexer was on the GPU at all. The root cause was index SCOPE, not the device: generated run
// records, archives and frozen code copies made up ~70% (firedancer) and ~88% (qoed) of the
// chunks. A long index is the signal worth raising; the fix is the project's include/exclude.
//
// What this hook deliberately does NOT do (2026-09-24, both from the first day in use):
//   - Alert on an IDLE hold. Once a search loads the model, the daemon keeps ~2–3 GiB VRAM until
//     its idle exit, and the owner ruled that acceptable ("ccc停める必要ないだろ？vramずっと余って
//     ないか？"). An alert with nothing to act on is noise, so only an ongoing index counts.
//   - Suggest stopping the daemon. The first version did; a subagent stopped it for GPU headroom,
//     utilisation stayed at 33–40% (the load was outside WSL), and every ccc search died for
//     nothing. The owner's ruling is: never stop ccc-daemon for a GPU run.
//   - Attribute utilisation to the daemon. WSL's nvidia-smi reports no per-process usage, so the
//     util/VRAM figures are host-wide (every process, Windows side included) and are labelled so.
//
// Detection: a compute app from `nvidia-smi` whose /proc cmdline is `ccc run-daemon`, while
// `ccc daemon status` lists a project as [indexing]. The clock starts at the first probe that saw
// indexing and resets when a probe sees none; probes run only when a hook fires, so a gap between
// two probes that both saw indexing is assumed, not observed, to be indexing too.
//
// Cost: the probes (`nvidia-smi`, then `ccc daemon status`, ~0.1 s each) run at most once per
// PROBE_INTERVAL_MS machine-wide — a state file caches the last observation — and a session is
// re-alerted at most once per REALERT_MS. No `nvidia-smi` (macOS) → silent. Inputs overridable
// for tests: CCC_GPU_HOLD_STATE (state file), CCC_GPU_HOLD_NVIDIA_SMI and CCC_GPU_HOLD_CCC
// (binaries).

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { attempt, attemptOr } from "../../hooks/attempt.ts";
import { at, obj, parseJson, strAt, strsAt } from "../../hooks/narrow.ts";
import { readStdinJson } from "./lib.ts";
import { clockHMZ, localFromEpochSec } from "./prompt-stamp.ts";

const INDEXING_ALERT_MS = 15 * 60_000;
const REALERT_MS = 30 * 60_000;
const PROBE_INTERVAL_MS = 60_000;
const SESSION_TTL_MS = 24 * 60 * 60_000;

const STATE_PATH =
  process.env.CCC_GPU_HOLD_STATE ??
  join(homedir(), ".cache", "claude", "ccc-gpu-hold.json");
const NVIDIA_SMI = process.env.CCC_GPU_HOLD_NVIDIA_SMI ?? "nvidia-smi";
const CCC = process.env.CCC_GPU_HOLD_CCC ?? "ccc";

type State = {
  pid: number | null; // ccc daemon PID on the GPU at the last probe, null = none
  indexing: string[]; // projects [indexing] at the last probe
  indexingSinceMs: number; // first probe of the current indexing streak, 0 = none
  lastProbeMs: number;
  alerted: Record<string, number>; // session_id -> last alert time
};

// session_id -> last alert time; entries whose time is not a number are dropped.
function alertedOf(raw: unknown): Record<string, number> {
  const table = obj(raw) ?? {};
  return Object.fromEntries(
    Object.entries(table).flatMap(([session, time]): [string, number][] =>
      typeof time === "number" ? [[session, time]] : [],
    ),
  );
}

async function readState(): Promise<State> {
  const s = await attemptOr(
    (): unknown => parseJson(readFileSync(STATE_PATH, "utf8")),
    null,
  );
  if (s === null) {
    return {
      pid: null,
      indexing: [],
      indexingSinceMs: 0,
      lastProbeMs: 0,
      alerted: {},
    };
  }
  const pid = at(s, "pid");
  const indexingSinceMs = at(s, "indexingSinceMs");
  const lastProbeMs = at(s, "lastProbeMs");
  return {
    pid: typeof pid === "number" ? pid : null,
    indexing: strsAt(s, "indexing"),
    indexingSinceMs: typeof indexingSinceMs === "number" ? indexingSinceMs : 0,
    lastProbeMs: typeof lastProbeMs === "number" ? lastProbeMs : 0,
    alerted: alertedOf(at(s, "alerted")),
  };
}

// Concurrent sessions share this file; rename keeps every read whole. A lost update costs at
// most one duplicate alert.
function writeState(state: State): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  const tmp = `${STATE_PATH}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, STATE_PATH);
}

function run(cmd: string[], timeoutMs: number): string | null {
  const r = spawnSync(cmd[0] ?? "", cmd.slice(1), {
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "ignore"],
  });
  return r.status === 0 ? r.stdout : null;
}

async function isCccDaemon(pid: number): Promise<boolean> {
  const cmdline = await attemptOr(
    () => readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" "),
    null,
  );
  return cmdline !== null && /\bccc run-daemon\b/u.test(cmdline);
}

// undefined = no GPU probe available on this host; null = no ccc daemon on the GPU.
async function probeDaemonOnGpu(): Promise<number | null | undefined> {
  const out = run(
    [NVIDIA_SMI, "--query-compute-apps=pid", "--format=csv,noheader"],
    5_000,
  );
  if (out === null) return undefined;
  for (const line of out.split("\n")) {
    const pid = Math.trunc(Number(line.trim()));
    if (Number.isInteger(pid) && pid > 0 && (await isCccDaemon(pid)))
      return pid;
  }
  return null;
}

// The projects the daemon is indexing are where the scope fix belongs.
function indexingProjects(): string[] {
  const out = run([CCC, "daemon", "status"], 5_000) ?? "";
  return out
    .split("\n")
    .filter((l) => l.includes("[indexing]"))
    .map((l) => l.replace("[indexing]", "").trim());
}

function hostGpuLine(): string {
  const out = run(
    [
      NVIDIA_SMI,
      "--query-gpu=utilization.gpu,memory.used,memory.total",
      "--format=csv,noheader,nounits",
    ],
    5_000,
  );
  const [util, used, total] =
    (out ?? "")
      .split("\n")[0]
      ?.split(",")
      .map((s) => s.trim()) ?? [];
  return util !== undefined &&
    util !== "" &&
    used !== undefined &&
    used !== "" &&
    total !== undefined &&
    total !== ""
    ? `host-wide GPU util ${util}%, VRAM ${used}/${total} MiB`
    : "host-wide GPU util/VRAM unreadable";
}

// "HH:MM+09", the prompt's own clock shape (prompt-stamp.ts), not a locale's.
function clock(ms: number): string {
  return clockHMZ(localFromEpochSec(ms / 1000));
}

async function main(): Promise<void> {
  const payload = readStdinJson();
  const event = strAt(payload, "hook_event_name") ?? "PreToolUse";
  const session = strAt(payload, "session_id") ?? "unknown";
  const now = Temporal.Now.instant().epochMilliseconds;
  const state = await readState();

  if (now - state.lastProbeMs >= PROBE_INTERVAL_MS) {
    const pid = await probeDaemonOnGpu();
    if (pid === undefined) return;
    const indexing = pid === null ? [] : indexingProjects();
    const streak =
      pid !== null && pid === state.pid && state.indexingSinceMs > 0;
    if (indexing.length === 0) state.indexingSinceMs = 0;
    else if (!streak) state.indexingSinceMs = now;
    state.pid = pid;
    state.indexing = indexing;
    state.lastProbeMs = now;
  }
  for (const [s, alertedAt] of Object.entries(state.alerted)) {
    if (now - alertedAt > SESSION_TTL_MS) delete state.alerted[s];
  }

  const indexingMs =
    state.indexingSinceMs === 0 ? 0 : now - state.indexingSinceMs;
  const due =
    indexingMs >= INDEXING_ALERT_MS &&
    now - (state.alerted[session] ?? 0) >= REALERT_MS;
  if (due) state.alerted[session] = now;
  writeState(state);
  if (!due) return;

  const minutes = Math.round(indexingMs / 60_000);
  const projects = state.indexing.join(", ");
  const context = [
    `CCC-GPU-INDEXING: the ccc daemon (pid ${state.pid}) has been indexing ${projects} on the ` +
      `GPU for ${minutes} min (first observed ${clock(state.indexingSinceMs)}, still indexing ` +
      `at the latest probe). ${hostGpuLine()} — all processes, Windows side included; WSL ` +
      "reports no per-process share, so this is NOT the daemon's load.",
    "Count the indexer as one GPU job when admitting or diagnosing GPU experiments.",
    "An index this long usually means an over-broad scope: check that project's " +
      ".cocoindex_code/settings.yml include/exclude for generated records, archives and frozen " +
      "code copies (per-directory chunk counts: the code_chunks_vec_auxiliary table of its DB).",
    "Do NOT stop ccc-daemon for GPU headroom — owner ruling 2026-09-24: VRAM is ample and " +
      "stopping it kills every ccc search.",
  ].join("\n");
  process.stdout.write(
    `${JSON.stringify({
      systemMessage: `ccc has been indexing ${projects} on the GPU for ${minutes} min — check that project's index scope`,
      hookSpecificOutput: { hookEventName: event, additionalContext: context },
    })}\n`,
  );
}

// Advisory only: a broken probe must never cost the session a tool call or a prompt.
await attempt(main);
process.exit(0);
