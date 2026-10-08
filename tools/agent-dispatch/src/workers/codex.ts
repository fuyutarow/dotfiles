// Internal agent-dispatch module — run ONE `codex exec` as a bounded, observable worker and print its receipt.
// The main loop invokes this file directly; tests also exercise it as a child process.
//
// WHY A COMMAND, not a recipe pasted into every relay prompt: the recipe drifted (a dropped
// `</dev/null` hung two runs for their whole budget), relays summarized instead of relaying, and a
// wrapped `codex` escapes the model-floor hook, which only sees the Bash command line. This file
// owns the invocation so a caller only has to read the receipt (agent-dispatch C2/C3).
//
// Internal CLI contract (designing-command-line-interfaces C0–C5)
//   C0  consumers   agent-dispatch main loop; tests invoke the internal file directly.
//   C1  invocation  `bun tools/agent-dispatch/src/workers/codex.ts` (--choice ID | --model M --effort E) --sandbox S --cd DIR [--timeout-s N]
//                   [--receipt-dir D] (--prompt-file F | prompt on stdin)
//                   model, effort, sandbox and cd are REQUIRED: a bare codex inherits config.toml.
//                   --resume THREAD continues that codex session in place of a fresh one: same flags,
//                   the receipt, progress and cause handling are those of a fresh run.
//                   --choice names a codex-route row of agents/models/dispatch-roster.toml (the roster
//                   choice a coordinator makes) and supplies its model and effort.
//   C2  effects     one codex subprocess, sandboxed as asked. read-only | workspace-write only;
//                   danger-full-access is never asked for here (refused); the one way codex runs
//                   unsandboxed is a box's own host declaration (HOST DECLARATION below), stated
//                   on stderr and in the receipt (sandbox_effective, unsandboxed_reason).
//                   effort ultra (codex's own unbounded fan-out) is refused: P7 cannot admit it.
//   C3  channels    stdout: exactly one JSON receipt line (schema 1, additive-only).
//                   stderr: liveness — a start line, a line every HEARTBEAT_S while waiting, an end
//                   line with the duration. Never silent for longer than HEARTBEAT_S.
//   C4  outcomes    exit 0 ok (codex exit 0 and a non-empty last message)
//                        1 codex-failed (nonzero exit, or exit 0 with no last message)
//                        2 refused (usage, floor, sandbox/effort policy) — codex never started
//                        3 timeout (killed at --timeout-s; the receipt says so)
//                      every non-ok receipt has a non-empty `cause` (codex's last error event, else
//                      "codex printed no error event" + the last stderr line); every receipt has
//                      `progress` {last, commands, files} — at a timeout, where the worker was.
//   Waits / liveness     bounded by --timeout-s (default 1800; this runs in the background).
//   Fallbacks / handoffs none — never another model, never another sandbox. A refusal says why.
//   C5  evolution   receipt fields are additive; `schema` bumps on any removal or meaning change.
// --emit-envelope PATH writes the P7 resource envelope for exactly this call (same checks, no
// codex) and exits 0: the main loop creates one per parallel worker before launching it, so each
// envelope exists before admission. The main loop then runs `agent-resource-run --manifest PATH -- agent-dispatch …` (Linux; P7 is a Linux
// admission). Its numbers are measured, not guessed: see ENVELOPE below.
// The receipt is also written to --receipt-dir (default $TMPDIR/agent-dispatch) so the main loop can
// re-read it after the call: a summary can paraphrase stdout, not the file.
import { mkdirSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { jsonText, z } from "../../../shared/src/zod.ts";
import { attempt, errorMessage } from "../../../shared/src/attempt.ts";
import { loadRoster } from "../../../../agents/models/roster.ts";
import {
  judge,
  ordersIn,
  parseFloorConfig,
} from "../../../shared/src/model-orders.ts";
import {
  lastError,
  progressWriter,
  sessionOf,
  tallyOf,
  toolErrorStreak,
} from "./codex-progress.ts";
import {
  codexHostDeclarationPath,
  readCodexHostDeclaration,
} from "./codex-host.ts";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const SANDBOXES = ["read-only", "workspace-write"];
const MAX_TIMEOUT_S = 14400;
const DEFAULT_TIMEOUT_S = 1800;
const IDENTICAL_TOOL_ERROR_LIMIT = 5; // Stop a worker that is retrying the same broken call indefinitely.
// AGENT_DISPATCH_CODEX_HEARTBEAT_S is a test seam (a test cannot wait 30 s for the first liveness line).
const parsedHeartbeat = Number(
  process.env.AGENT_DISPATCH_CODEX_HEARTBEAT_S ?? "",
);
const HEARTBEAT_S =
  parsedHeartbeat !== 0 && !Number.isNaN(parsedHeartbeat)
    ? parsedHeartbeat
    : 30;
const FLOOR_CONFIG =
  process.env.MODEL_FLOOR_CONFIG ??
  join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "..",
    "agents",
    "hooks",
    "model-floor.toml",
  );
// Test seam: the codex binary to run (a fake in tests). Never a model or sandbox override.
const CODEX_BIN = process.env.AGENT_DISPATCH_CODEX_BIN ?? "codex";

type Outcome = "ok" | "codex-failed" | "refused" | "timeout" | "killed";
const EXIT: Record<Outcome, number> = {
  ok: 0,
  "codex-failed": 1,
  killed: 1,
  refused: 2,
  timeout: 3,
};
type Usage = {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
};

// Synchronous writes: every exit path ends in process.exit, and an async write to a pipe can be
// lost at exit — the receipt is the one thing this command must not lose.
const say = (text: string): void =>
  void writeSync(2, `agent-dispatch[codex]: ${text}\n`);
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    say(`unknown option '--${flag}'`);
    process.exit(EXIT.refused);
  }
};
const argv = cli(
  {
    name: "agent-dispatch codex (internal)",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: {
      description:
        "Run one bounded `codex exec` and print a JSON receipt (exit, tokens, last message, duration).",
      examples: [
        "bun tools/agent-dispatch/src/workers/codex.ts --model gpt-6-luna --effort medium --sandbox read-only --cd . --prompt-file brief.md",
        "echo 'Reply OK' | bun tools/agent-dispatch/src/workers/codex.ts --model gpt-6-luna --effort low --sandbox read-only --cd /tmp",
      ],
    },
    flags: {
      choice: {
        type: String,
        description:
          "a codex-route row of agents/models/dispatch-roster.toml (sets model and effort)",
      },
      model: {
        type: String,
        description: "exact model slug (checked against model-floor.toml)",
      },
      effort: {
        type: String,
        description: `reasoning effort: ${EFFORTS.join(" | ")}`,
      },
      sandbox: {
        type: String,
        description: `codex sandbox: ${SANDBOXES.join(" | ")}`,
      },
      cd: { type: String, description: "working directory codex runs in (-C)" },
      timeoutS: {
        type: Number,
        default: DEFAULT_TIMEOUT_S,
        description: `wall-clock bound in seconds (default ${DEFAULT_TIMEOUT_S}; 1..${MAX_TIMEOUT_S})`,
      },
      runId: {
        type: String,
        description:
          "run_id supplied by agent-dispatch (otherwise generated here)",
      },
      receiptDir: {
        type: String,
        default: join(tmpdir(), "agent-dispatch"),
        description: "directory the receipt file is written to",
      },
      promptFile: {
        type: String,
        description: "file holding the prompt (else stdin)",
      },
      outputSchema: {
        type: String,
        description:
          "JSON-schema file for the final message (`codex exec --output-schema`; agent-dispatch passes the typed report's)",
      },
      resume: {
        type: String,
        description:
          "a codex thread id (a receipt's `session`): continue that session with the prompt as its next message (`codex exec resume`)",
      },
      emitEnvelope: {
        type: String,
        description:
          "write the P7 resource envelope for this call to PATH and exit (no codex run)",
      },
      jobId: {
        type: String,
        description: "job_id for --emit-envelope (default: the run id)",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);

// Resolved model and effort: from --model/--effort, or from the roster row --choice names (below).
// Declared before emit() so every receipt, refusals included, shows what was actually ordered.
let model = argv.flags.model;
let effort = argv.flags.effort;
// Set once the host declaration is read (below); null in a receipt emitted before that.
let codexSandbox: string | undefined;
let unsandboxedReason: string | undefined;
const t0 = performance.now();
const wallT0 = Temporal.Now.instant().epochMilliseconds;
const elapsed = (): number => Math.round((performance.now() - t0) / 100) / 10;
const startedAt = Temporal.Now.instant().toString();
const runId =
  argv.flags.runId ?? `${startedAt.replaceAll(/[:.]/gu, "-")}-${process.pid}`;

// Print the receipt (stdout, one line), save it, say the end on stderr, and exit. Never returns:
// every caller's path ends here.
function emit(outcome: Outcome, fields: Record<string, unknown>): never {
  const receipt = {
    schema: 1,
    run_id: runId,
    outcome,
    model: model ?? null,
    effort: effort ?? null,
    sandbox: argv.flags.sandbox ?? null,
    // additive (C5): what codex actually ran with, and why it differs from `sandbox`
    sandbox_effective: codexSandbox ?? null,
    unsandboxed_reason: unsandboxedReason ?? null,
    cwd: argv.flags.cd === undefined ? null : resolve(argv.flags.cd),
    started_at: startedAt,
    elapsed_s: elapsed(),
    ...fields,
  };
  const dir = argv.flags.receiptDir;
  const path = join(dir, `${runId}.json`);
  const saved = fromThrowable(
    () => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path,
        `${JSON.stringify({ ...receipt, receipt_file: path })}\n`,
      );
    },
    (e) => errorMessage(e),
  )();
  const shown = saved.isOk()
    ? { ...receipt, receipt_file: path }
    : { ...receipt, receipt_file: null };
  writeSync(1, `${JSON.stringify(shown)}\n`);
  say(
    `${outcome} after ${elapsed()} s${saved.isOk() ? ` — receipt ${path}` : ` — receipt file not written (${saved.error})`}`,
  );
  return process.exit(EXIT[outcome]);
}

function refuse(why: string): never {
  return emit("refused", { why });
}

// --- C1/C2 checks: everything that can be refused before codex starts -------------------------
if (argv._.length > 0)
  refuse(
    `unexpected argument: ${argv._[0]} (the prompt goes in --prompt-file or stdin)`,
  );
const { choice, sandbox, cd, timeoutS, promptFile, resume } = argv.flags;
if (resume !== undefined && resume.trim() === "")
  refuse("--resume needs the codex thread id of the session to continue");
if (choice !== undefined) {
  if (model !== undefined || effort !== undefined)
    refuse(
      "give --choice OR --model/--effort, not both — --choice already sets model and effort",
    );
  const roster = await loadRoster();
  if (!roster.ok) refuse(`cannot read the dispatch roster: ${roster.error}`);
  const row = roster.value.choice.find((c) => c.id === choice);
  if (row?.route !== "codex")
    refuse(
      `--choice '${choice}' is not a codex-route row of agents/models/dispatch-roster.toml (codex rows: ${roster.value.choice
        .filter((c) => c.route === "codex")
        .map((c) => c.id)
        .join(
          ", ",
        )}); a claude row runs through agent-dispatch (run-claude.ts)`,
    );
  model = row?.model;
  effort = row?.effort;
}
const missing = [
  ["--model", model],
  ["--effort", effort],
  ["--sandbox", sandbox],
  ["--cd", cd],
].flatMap(([flag, v]) => (v === undefined || v === "" ? [flag] : []));
if (missing.length > 0)
  refuse(
    `missing ${missing.join(", ")} — every call names model, effort, sandbox and directory`,
  );
if (!EFFORTS.includes(String(effort)))
  refuse(
    effort === "ultra"
      ? "effort ultra starts codex's own unbounded subagent fan-out, which the local P7 envelope cannot admit; use max (the deepest single agent) or an isolated runner"
      : `effort '${effort}' is not one of ${EFFORTS.join(", ")}`,
  );
if (!SANDBOXES.includes(String(sandbox)))
  refuse(
    sandbox === "danger-full-access"
      ? "sandbox danger-full-access is for an isolated runner only; the host declaration in ~/.config/agent-dispatch/host.toml identifies that isolation"
      : `sandbox '${sandbox}' is not one of ${SANDBOXES.join(", ")}`,
  );
if (!Number.isInteger(timeoutS) || timeoutS < 1 || timeoutS > MAX_TIMEOUT_S)
  refuse(
    `--timeout-s must be an integer from 1 to ${MAX_TIMEOUT_S}, got ${timeoutS}`,
  );

// The same judgment the model-floor hook makes on a Bash command line, made on the command this
// file is about to run: a wrapped codex must not be the way around the floor.
const floorProblem = await attempt(() => {
  const config = parseFloorConfig(
    Bun.TOML.parse(readFileSync(FLOOR_CONFIG, "utf8")),
  );
  if (!config.ok)
    return `model-floor config ${FLOOR_CONFIG} is invalid: ${config.errors.join("; ")}`;
  const problems = ordersIn(`codex exec -m ${String(model)}`).flatMap((o) => {
    const p = judge(o, config.floors);
    return p === undefined ? [] : [p];
  });
  return problems.length > 0
    ? `model-floor: ${problems.join("; ")}`
    : undefined;
});
if (!floorProblem.ok)
  refuse(
    `cannot read the model floor ${FLOOR_CONFIG}: ${errorMessage(floorProblem.error)}`,
  );
if (floorProblem.value !== undefined) refuse(floorProblem.value);

// HOST DECLARATION: a box where codex's own sandbox cannot exist. codex sandboxes with bwrap on
// Linux, which needs an unprivileged user namespace; a Docker-default container (seccomp filter, no
// CAP_SYS_ADMIN — Vast.ai, measured 2026-10-06: `unshare -U` = EPERM) refuses that to every process,
// so every run there died before its first command. Such a box opts in, per box, with
// ~/.config/agent-dispatch/host.toml (`schema = 1`, `unsandboxed_reason = "<why this box is itself the
// isolation>"`): the run then uses danger-full-access, says so on stderr every time, and records the
// reason in the receipt. No file = the sandbox asked for; a malformed file = refused, never guessed.
const HOST_FILE = codexHostDeclarationPath();
const hostDeclaration = readCodexHostDeclaration(HOST_FILE);
if (hostDeclaration.kind === "invalid") refuse(hostDeclaration.reason);
if (hostDeclaration.kind === "valid")
  unsandboxedReason = hostDeclaration.declaration.unsandboxedReason;
codexSandbox =
  unsandboxedReason === undefined ? String(sandbox) : "danger-full-access";

// Measured 2026-10-05 on macOS: agent-dispatch + codex (gpt-6-luna, effort low, read-only) peaked at
// 191 MB RSS (`/usr/bin/time -l`) and used 1.7 s CPU in a 5.6 s run — a network-bound client.
const MEASURED_PEAK_BYTES = 191_217_664;
if (argv.flags.emitEnvelope !== undefined) {
  const jobId = argv.flags.jobId ?? `agent-dispatch-${runId}`;
  const envelope = {
    schema: 1,
    job_id: jobId,
    run_class: "full",
    cpu_threads: 2,
    processes: 16,
    host_ram_peak_bytes: MEASURED_PEAK_BYTES * 5,
    memory_bound:
      "measured 191 MB peak RSS for agent-dispatch + codex (gpt-6-luna, low, read-only, 2026-10-05) x5 for tool subprocesses in the sandbox; nothing local scales with the prompt",
    device: {
      kind: "cpu",
      gpu_status: "not-beneficial",
      rationale:
        "a codex client is network-bound: the model runs vendor-side, nothing local to place on a GPU (smoke 2026-10-05: 1.7 s CPU in a 5.6 s run)",
    },
    scratch_bytes: 268_435_456,
    child_fanout: 0,
    walltime_seconds: timeoutS + 30,
    cleanup: { mode: "term-then-kill", grace_seconds: 10 },
  };
  const path = resolve(argv.flags.emitEnvelope);
  const written = fromThrowable(
    () => {
      writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`);
    },
    (e) => errorMessage(e),
  )();
  if (written.isErr())
    refuse(`cannot write the envelope ${path}: ${written.error}`);
  writeSync(
    1,
    `${JSON.stringify({ envelope_file: path, job_id: jobId, walltime_seconds: envelope.walltime_seconds })}\n`,
  );
  say(
    `envelope for ${model} (bound ${timeoutS} s) written to ${path} — run: agent-resource-run --manifest ${path} -- agent-dispatch …`,
  );
  process.exit(0);
}

const promptRead = await attempt(async () =>
  promptFile !== undefined
    ? readFileSync(promptFile, "utf8")
    : Bun.stdin.text(),
);
if (!promptRead.ok)
  refuse(`cannot read the prompt: ${errorMessage(promptRead.error)}`);
const prompt = promptRead.value.trim();
if (prompt === "")
  refuse("empty prompt (give --prompt-file, or pipe the prompt on stdin)");

// --- run --------------------------------------------------------------------------------------
const lastFile = join(argv.flags.receiptDir, `${runId}.last.txt`);
mkdirSync(argv.flags.receiptDir, { recursive: true });
// `codex exec resume` (codex-cli help read 2026-10-06) takes [SESSION_ID] [PROMPT] and -m, -c, -o,
// --json, --skip-git-repo-check — but no --sandbox and no -C. The sandbox goes in as the config
// override it is, and the directory is the process's own cwd, which a resumed session also expects.
const execFlags = [
  "--json",
  "--skip-git-repo-check",
  "-m",
  String(model),
  "-c",
  `model_reasoning_effort="${effort}"`,
  "-o",
  lastFile,
  ...(argv.flags.outputSchema === undefined
    ? []
    : ["--output-schema", resolve(argv.flags.outputSchema)]),
];
const cmd =
  resume === undefined
    ? [
        CODEX_BIN,
        "exec",
        "--sandbox",
        codexSandbox,
        "-C",
        resolve(String(cd)),
        ...execFlags,
        prompt,
      ]
    : [
        CODEX_BIN,
        "exec",
        "resume",
        "-c",
        `sandbox_mode="${codexSandbox}"`,
        ...execFlags,
        resume,
        prompt,
      ];
if (unsandboxedReason !== undefined)
  say(
    `UNSANDBOXED: asked for ${sandbox}, running danger-full-access — ${HOST_FILE} declares this box the isolation: ${unsandboxedReason}`,
  );
say(
  `${resume === undefined ? "started" : `resuming ${resume}:`} ${model} effort=${effort} sandbox=${codexSandbox} in ${resolve(String(cd))}, bound ${timeoutS} s`,
);
const deadline = new AbortController();
let boundFired = false;
const boundTimer = setTimeout(() => {
  boundFired = true;
  deadline.abort();
}, timeoutS * 1000);
const spawned = await attempt(() =>
  // stdin "ignore" is the `</dev/null` of the recipe: codex exec reads stdin and would hang on an
  // open pipe for the whole budget.
  Bun.spawn(cmd, {
    cwd: resolve(String(cd)),
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal: deadline.signal,
    killSignal: "SIGKILL",
  }),
);
if (!spawned.ok)
  refuse(`cannot start ${CODEX_BIN}: ${errorMessage(spawned.error)}`);
const proc = spawned.value;
const heartbeat = setInterval(() => {
  say(`waiting for ${model} (${elapsed()} s of ${timeoutS} s)…`);
}, HEARTBEAT_S * 1000);
// Read both pipes from the start (a child blocked on a full pipe never exits), but stop waiting for
// them PIPE_GRACE_MS after the child itself exits: a killed codex can leave a grandchild holding
// the pipe open, and the bound must hold even then.
const PIPE_GRACE_MS = 1_000;
const graced = (r: Promise<string>): Promise<string> =>
  proc.exited.then(() =>
    Promise.race([r, Bun.sleep(PIPE_GRACE_MS).then(() => "")]),
  );
// stdout is read as it arrives: every JSONL line also feeds the statusline's progress file when
// agent-dispatch asked for one (AGENT_DISPATCH_CODEX_PROGRESS_FILE; codex-progress.ts). What was read before a
// grace cut-off is kept, not dropped.
const progress =
  process.env.AGENT_DISPATCH_CODEX_PROGRESS_FILE === undefined
    ? undefined
    : progressWriter(process.env.AGENT_DISPATCH_CODEX_PROGRESS_FILE);
let streamed = "";
let spinCause: string | undefined;
const detectToolSpin = toolErrorStreak(IDENTICAL_TOOL_ERROR_LIMIT);
function readEvents(): Promise<string> {
  const decoder = new TextDecoder();
  let pending = "";
  const sink = new WritableStream<Uint8Array>({
    write(chunk) {
      const text = decoder.decode(chunk, { stream: true });
      streamed += text;
      const lines = `${pending}${text}`.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        progress?.feed(line);
        const detectedCause = detectToolSpin(line);
        if (spinCause === undefined && detectedCause !== null) {
          spinCause = detectedCause;
          deadline.abort();
        }
      }
    },
  });
  return proc.stdout.pipeTo(sink).then(() => streamed);
}
// Both readers start now; each is cut PIPE_GRACE_MS after the child exits (graced waits for that).
const [code, eventsRead, errText] = await Promise.all([
  proc.exited,
  graced(readEvents()),
  graced(new Response(proc.stderr).text()),
]);
const events = eventsRead === "" ? streamed : eventsRead;
clearInterval(heartbeat);
clearTimeout(boundTimer);
progress?.flush();
if (progress !== undefined && progress.failedWrites() > 0)
  say(
    `progress file ${process.env.AGENT_DISPATCH_CODEX_PROGRESS_FILE}: ${progress.failedWrites()} write(s) failed — the Run: row was not live for them`,
  );

// Usage is the sum over every turn.completed event (`--json` JSONL); a line that is not JSON, or
// an event of another shape, carries no usage and is skipped.
const Count = z
  .number()
  .int()
  .nonnegative()
  .or(z.unknown().transform(() => 0));
const TurnCompleted = z.object({
  type: z.literal("turn.completed"),
  usage: z.object({
    input_tokens: Count,
    cached_input_tokens: Count,
    output_tokens: Count,
    reasoning_output_tokens: Count,
  }),
});
const usage: Usage = {
  input_tokens: 0,
  cached_input_tokens: 0,
  output_tokens: 0,
  reasoning_output_tokens: 0,
};
let turns = 0;
for (const line of events.split("\n")) {
  const json = jsonText.safeParse(line);
  const turn = json.success ? TurnCompleted.safeParse(json.data) : undefined;
  if (turn?.success !== true) continue;
  turns += 1;
  usage.input_tokens += turn.data.usage.input_tokens;
  usage.cached_input_tokens += turn.data.usage.cached_input_tokens;
  usage.output_tokens += turn.data.usage.output_tokens;
  usage.reasoning_output_tokens += turn.data.usage.reasoning_output_tokens;
}
const last = await attempt(() => readFileSync(lastFile, "utf8"));
const lastMessage = last.ok ? last.value.trim() : "";
const stderrTail = errText.trim().split("\n").slice(-20).join("\n");
// Tiger ledger O1/O2 (2026-10-06): a failed receipt always names a cause, and every receipt says
// what the worker did. On Vast five luna runs were killed at their bound and two failed in seconds
// with an empty stderr tail; "the model could not do it", "codex waited on the network" and "codex
// refused to start" were indistinguishable. The cause is codex's own last error event; when it
// printed none, the receipt says so (never an empty cause).
const progressSoFar = tallyOf(events);
const cause =
  lastError(events) ??
  `codex printed no error event; last stderr line: ${errText.trim().split("\n").at(-1) ?? ""}`;
const session = sessionOf(events);
const common = {
  ...(session === undefined ? {} : { session }),
  codex_exit: code,
  turns,
  usage,
  progress: progressSoFar,
  last_message: lastMessage,
  stderr_tail: stderrTail,
};

if (spinCause !== undefined)
  emit("timeout", {
    ...common,
    why: spinCause,
    cause: spinCause,
  });
if (boundFired)
  emit("timeout", {
    ...common,
    why: `killed at the ${timeoutS} s bound`,
    cause,
  });
let signal = proc.signalCode ?? undefined;
if (signal === undefined && code === 137) signal = "SIGKILL";
if (signal === undefined && code === 143) signal = "SIGTERM";
if (signal !== undefined) {
  const monotonicElapsed = (performance.now() - t0) / 1000;
  const wallElapsed =
    (Temporal.Now.instant().epochMilliseconds - wallT0) / 1000;
  const sleepSeconds = Math.round(wallElapsed - monotonicElapsed);
  const sleepNote =
    sleepSeconds > 60 ? `; the machine slept about ${sleepSeconds} s` : "";
  emit("killed", {
    ...common,
    why: `killed by ${signal} from outside agent-dispatch after ${elapsed()} s (not its bound)${sleepNote}`,
    cause,
  });
}
if (code !== 0)
  emit("codex-failed", { ...common, why: `codex exited ${code}`, cause });
if (lastMessage === "")
  emit("codex-failed", {
    ...common,
    why: "codex exited 0 but wrote no last message",
    cause,
  });
emit("ok", common);
