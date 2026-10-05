#!/usr/bin/env bun
// codex-run — run ONE `codex exec` as a bounded, observable worker and print its receipt.
// Consumers: a Workflow relay (a sonnet-high agent() whose Bash runs this and returns the receipt
// verbatim), the main loop, and a human. PATH command via package.json `bin` (`mise run deps`).
//
// WHY A COMMAND, not a recipe pasted into every relay prompt: the recipe drifted (a dropped
// `</dev/null` hung two runs for their whole budget), relays summarized instead of relaying, and a
// wrapped `codex` escapes the model-floor hook, which only sees the Bash command line. This file
// owns the invocation so the relay only has to pass the receipt through (driving-codex C2/C3).
//
// CLI CONTRACT (designing-command-line-interfaces C0–C5)
//   C0  consumers   agent relay (primary), main loop, human; never interactive (stdin is closed).
//   C1  invocation  codex-run --model M --effort E --sandbox S --cd DIR [--timeout-s N]
//                   [--receipt-dir D] (--prompt-file F | prompt on stdin)
//                   model, effort, sandbox and cd are REQUIRED: a bare codex inherits config.toml.
//   C2  effects     one codex subprocess, sandboxed as asked. read-only | workspace-write only;
//                   danger-full-access belongs in an isolated runner, so it is refused here.
//                   effort ultra (codex's own unbounded fan-out) is refused: P7 cannot admit it.
//   C3  channels    stdout: exactly one JSON receipt line (schema 1, additive-only).
//                   stderr: liveness — a start line, a line every HEARTBEAT_S while waiting, an end
//                   line with the duration. Never silent for longer than HEARTBEAT_S.
//   C4  outcomes    exit 0 ok (codex exit 0 and a non-empty last message)
//                        1 codex-failed (nonzero exit, or exit 0 with no last message)
//                        2 refused (usage, floor, sandbox/effort policy) — codex never started
//                        3 timeout (killed at --timeout-s; the receipt says so)
//   Waits / liveness     bounded by --timeout-s (default 540: under a relay's 600 s Bash ceiling).
//   Fallbacks / handoffs none — never another model, never another sandbox. A refusal says why.
//   C5  evolution   receipt fields are additive; `schema` bumps on any removal or meaning change.
// --emit-envelope PATH writes the P7 resource envelope for exactly this call (same checks, no
// codex) and exits 0: the main loop creates one per parallel worker BEFORE the Workflow starts,
// because the dispatch hook needs each RESOURCE-ENVELOPE path to exist at dispatch time. The
// worker then runs `agent-resource-run --manifest PATH -- codex-run …` (Linux; P7 is a Linux
// admission). Its numbers are measured, not guessed: see ENVELOPE below.
// The receipt is also written to --receipt-dir (default $TMPDIR/codex-run) so the main loop can
// check a relay's return against the file: a relay can paraphrase stdout, not the file.
import { mkdirSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { z } from "zod";
import { attempt, errorMessage } from "../../../hooks/attempt.ts";
import { judge, ordersIn, parseFloorConfig } from "../../../hooks/model-orders.ts";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const SANDBOXES = ["read-only", "workspace-write"];
const MAX_TIMEOUT_S = 1800; // a main-loop background run; relays stay under 540
// CODEX_RUN_HEARTBEAT_S is a test seam (a test cannot wait 30 s for the first liveness line).
const HEARTBEAT_S = Number(process.env.CODEX_RUN_HEARTBEAT_S ?? "") || 30;
const FLOOR_CONFIG =
  process.env.MODEL_FLOOR_CONFIG ??
  join(import.meta.dir, "..", "..", "..", "hooks", "model-floor.toml");
// Test seam: the codex binary to run (a fake in tests). Never a model or sandbox override.
const CODEX_BIN = process.env.CODEX_RUN_BIN ?? "codex";

type Outcome = "ok" | "codex-failed" | "refused" | "timeout";
const EXIT: Record<Outcome, number> = {
  ok: 0,
  "codex-failed": 1,
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
const say = (text: string): void => void writeSync(2, `codex-run: ${text}\n`);
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    say(`unknown option '--${flag}'`);
    process.exit(EXIT.refused);
  }
};
const argv = cli(
  {
    name: "codex-run",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: {
      description:
        "Run one bounded `codex exec` and print a JSON receipt (exit, tokens, last message, duration).",
      examples: [
        "codex-run --model gpt-6-luna --effort medium --sandbox read-only --cd . --prompt-file brief.md",
        "echo 'Reply OK' | codex-run --model gpt-6-luna --effort low --sandbox read-only --cd /tmp",
      ],
    },
    flags: {
      model: { type: String, description: "exact model slug (checked against model-floor.toml)" },
      effort: { type: String, description: `reasoning effort: ${EFFORTS.join(" | ")}` },
      sandbox: { type: String, description: `codex sandbox: ${SANDBOXES.join(" | ")}` },
      cd: { type: String, description: "working directory codex runs in (-C)" },
      timeoutS: {
        type: Number,
        default: 540,
        description: `wall-clock bound in seconds (1..${MAX_TIMEOUT_S}); a relay must stay under its 600 s Bash ceiling`,
      },
      receiptDir: {
        type: String,
        default: join(tmpdir(), "codex-run"),
        description: "directory the receipt file is written to",
      },
      promptFile: { type: String, description: "file holding the prompt (else stdin)" },
      emitEnvelope: {
        type: String,
        description: "write the P7 resource envelope for this call to PATH and exit (no codex run)",
      },
      jobId: { type: String, description: "job_id for --emit-envelope (default: the run id)" },
    },
  },
  undefined,
  Bun.argv.slice(2),
);

const t0 = performance.now();
const elapsed = (): number => Math.round((performance.now() - t0) / 100) / 10;
const startedAt = Temporal.Now.instant().toString();
const runId = `${startedAt.replace(/[:.]/g, "-")}-${process.pid}`;

// Print the receipt (stdout, one line), save it, say the end on stderr, and exit. Never returns:
// every caller's path ends here.
function emit(outcome: Outcome, fields: Record<string, unknown>): never {
  const receipt = {
    schema: 1,
    run_id: runId,
    outcome,
    model: argv.flags.model ?? null,
    effort: argv.flags.effort ?? null,
    sandbox: argv.flags.sandbox ?? null,
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
      writeFileSync(path, `${JSON.stringify({ ...receipt, receipt_file: path })}\n`);
    },
    (e) => errorMessage(e),
  )();
  const shown = saved.isOk() ? { ...receipt, receipt_file: path } : { ...receipt, receipt_file: null };
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
if (argv._.length > 0) refuse(`unexpected argument: ${argv._[0]} (the prompt goes in --prompt-file or stdin)`);
const { model, effort, sandbox, cd, timeoutS, promptFile } = argv.flags;
const missing = [
  ["--model", model],
  ["--effort", effort],
  ["--sandbox", sandbox],
  ["--cd", cd],
].flatMap(([flag, v]) => (v === undefined || v === "" ? [flag] : []));
if (missing.length > 0)
  refuse(`missing ${missing.join(", ")} — every call names model, effort, sandbox and directory (driving-codex C2)`);
if (!EFFORTS.includes(String(effort)))
  refuse(
    effort === "ultra"
      ? "effort ultra starts codex's own unbounded subagent fan-out, which the local P7 envelope cannot admit; use max (the deepest single agent) or an isolated runner"
      : `effort '${effort}' is not one of ${EFFORTS.join(", ")}`,
  );
if (!SANDBOXES.includes(String(sandbox)))
  refuse(
    sandbox === "danger-full-access"
      ? "sandbox danger-full-access is for an isolated runner only (driving-codex LEAST-PRIVILEGE)"
      : `sandbox '${sandbox}' is not one of ${SANDBOXES.join(", ")}`,
  );
if (!Number.isInteger(timeoutS) || timeoutS < 1 || timeoutS > MAX_TIMEOUT_S)
  refuse(`--timeout-s must be an integer from 1 to ${MAX_TIMEOUT_S}, got ${timeoutS}`);

// The same judgment the model-floor hook makes on a Bash command line, made on the command this
// file is about to run: a wrapped codex must not be the way around the floor.
const floorProblem = await attempt(() => {
  const config = parseFloorConfig(Bun.TOML.parse(readFileSync(FLOOR_CONFIG, "utf8")));
  if (!config.ok) return `model-floor config ${FLOOR_CONFIG} is invalid: ${config.errors.join("; ")}`;
  const problems = ordersIn(`codex exec -m ${String(model)}`).flatMap((o) => {
    const p = judge(o, config.floors);
    return p === undefined ? [] : [p];
  });
  return problems.length > 0 ? `model-floor: ${problems.join("; ")}` : undefined;
});
if (!floorProblem.ok) refuse(`cannot read the model floor ${FLOOR_CONFIG}: ${errorMessage(floorProblem.error)}`);
if (floorProblem.value !== undefined) refuse(floorProblem.value);

// Measured 2026-10-05 on macOS: codex-run + codex (gpt-6-luna, effort low, read-only) peaked at
// 191 MB RSS (`/usr/bin/time -l`) and used 1.7 s CPU in a 5.6 s run — a network-bound client.
const MEASURED_PEAK_BYTES = 191_217_664;
if (argv.flags.emitEnvelope !== undefined) {
  const jobId = argv.flags.jobId ?? `codex-run-${runId}`;
  const envelope = {
    schema: 1,
    job_id: jobId,
    run_class: "full",
    cpu_threads: 2,
    processes: 16,
    host_ram_peak_bytes: MEASURED_PEAK_BYTES * 5,
    memory_bound:
      "measured 191 MB peak RSS for codex-run + codex (gpt-6-luna, low, read-only, 2026-10-05) x5 for tool subprocesses in the sandbox; nothing local scales with the prompt",
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
    () => writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`),
    (e) => errorMessage(e),
  )();
  if (written.isErr()) refuse(`cannot write the envelope ${path}: ${written.error}`);
  writeSync(1, `${JSON.stringify({ envelope_file: path, job_id: jobId, walltime_seconds: envelope.walltime_seconds })}\n`);
  say(`envelope for ${model} (bound ${timeoutS} s) written to ${path} — run: agent-resource-run --manifest ${path} -- codex-run …`);
  process.exit(0);
}

const promptRead = await attempt(async () =>
  promptFile !== undefined ? readFileSync(promptFile, "utf8") : await Bun.stdin.text(),
);
if (!promptRead.ok) refuse(`cannot read the prompt: ${errorMessage(promptRead.error)}`);
const prompt = promptRead.value.trim();
if (prompt === "") refuse("empty prompt (give --prompt-file, or pipe the prompt on stdin)");

// --- run --------------------------------------------------------------------------------------
const lastFile = join(argv.flags.receiptDir, `${runId}.last.txt`);
mkdirSync(argv.flags.receiptDir, { recursive: true });
const cmd = [
  CODEX_BIN,
  "exec",
  "--json",
  "--skip-git-repo-check",
  "--sandbox",
  String(sandbox),
  "-C",
  resolve(String(cd)),
  "-m",
  String(model),
  "-c",
  `model_reasoning_effort="${effort}"`,
  "-o",
  lastFile,
  prompt,
];
say(`started ${model} effort=${effort} sandbox=${sandbox} in ${resolve(String(cd))}, bound ${timeoutS} s`);
const deadline = AbortSignal.timeout(timeoutS * 1000);
const spawned = await attempt(() =>
  // stdin "ignore" is the `</dev/null` of the recipe: codex exec reads stdin and would hang on an
  // open pipe for the whole budget (driving-codex Gotchas).
  Bun.spawn(cmd, { stdin: "ignore", stdout: "pipe", stderr: "pipe", signal: deadline, killSignal: "SIGKILL" }),
);
if (!spawned.ok) refuse(`cannot start ${CODEX_BIN}: ${errorMessage(spawned.error)}`);
const proc = spawned.value;
const heartbeat = setInterval(
  () => say(`waiting for ${model} (${elapsed()} s of ${timeoutS} s)…`),
  HEARTBEAT_S * 1000,
);
// Read both pipes from the start (a child blocked on a full pipe never exits), but stop waiting for
// them PIPE_GRACE_MS after the child itself exits: a killed codex can leave a grandchild holding
// the pipe open, and the bound must hold even then.
const PIPE_GRACE_MS = 1_000;
const graced = (r: Promise<string>): Promise<string> =>
  Promise.race([r, Bun.sleep(PIPE_GRACE_MS).then(() => "")]);
const outText = new Response(proc.stdout).text();
const errRead = new Response(proc.stderr).text();
const code = await proc.exited;
const [events, errText] = await Promise.all([graced(outText), graced(errRead)]);
clearInterval(heartbeat);

// Usage is the sum over every turn.completed event (`--json` JSONL); a line that is not JSON, or
// an event of another shape, carries no usage and is skipped.
const Count = z.number().int().nonnegative().catch(0);
const TurnCompleted = z.object({
  type: z.literal("turn.completed"),
  usage: z.object({
    input_tokens: Count,
    cached_input_tokens: Count,
    output_tokens: Count,
    reasoning_output_tokens: Count,
  }),
});
const usage: Usage = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
let turns = 0;
for (const line of events.split("\n")) {
  const json = fromThrowable((): unknown => JSON.parse(line))();
  const turn = json.isOk() ? TurnCompleted.safeParse(json.value) : undefined;
  if (!turn?.success) continue;
  turns += 1;
  usage.input_tokens += turn.data.usage.input_tokens;
  usage.cached_input_tokens += turn.data.usage.cached_input_tokens;
  usage.output_tokens += turn.data.usage.output_tokens;
  usage.reasoning_output_tokens += turn.data.usage.reasoning_output_tokens;
}
const last = await attempt(() => readFileSync(lastFile, "utf8"));
const lastMessage = last.ok ? last.value.trim() : "";
const stderrTail = errText.trim().split("\n").slice(-20).join("\n");
const common = { codex_exit: code, turns, usage, last_message: lastMessage, stderr_tail: stderrTail };

if (deadline.aborted) emit("timeout", { ...common, why: `killed at the ${timeoutS} s bound` });
if (code !== 0) emit("codex-failed", { ...common, why: `codex exited ${code}` });
if (lastMessage === "") emit("codex-failed", { ...common, why: "codex exited 0 but wrote no last message" });
emit("ok", common);
