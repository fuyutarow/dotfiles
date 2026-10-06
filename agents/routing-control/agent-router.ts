#!/usr/bin/env bun
// agent-router — the ONE entry point that starts a worker for a task, records why that worker was
// chosen, and shows it as running (statusline `Run:` segment, `agent-router ls`).
// Consumers: the coordinating agent (primary), a human, the statusline. PATH command via
// package.json `bin` (`mise run deps`).
//
// CLI CONTRACT (designing-command-line-interfaces C0–C5)
//   C1  agent-router run  --prompt-file F --cd DIR --sandbox read-only|workspace-write
//                     [--label TEXT]   (--choice is refused: Jev alone picks) [--timeout-s N]
//       agent-router pick --prompt-file F [--cd DIR]     the auto pick only; starts nothing
//       agent-router ls                                  running workers (stale ones flagged)
//       agent-router stats                               picks, confidence, fallbacks, cost, outcomes
//       agent-router grade RUN_ID --evidence F           Jev grades a finished run pass|partial|fail
//       agent-router grade RUN_ID --waive "<why>"        record that a run cannot be graded, and why
//   C2  effects  run starts `codex-run --choice <row>` (agents/skills/driving-codex) as a child; a
//                Claude row is refused with the Agent call to make instead (the CLI cannot start a
//                Claude subagent). State lives outside the repo: $XDG_STATE_HOME/agent-router
//                (~/.local/state/agent-router): active/<run_id>.json while running, runs.jsonl forever.
//   C3  channels stdout: exactly one JSON line (run: the agent-router receipt; pick: the pick record;
//                ls/stats: a JSON report). stderr: one line naming the pick and why, then the
//                worker's own liveness lines.
//   C4  outcomes exit = the worker's (0 ok, 1 failed, 3 timeout); 2 refused/usage before any start.
//   AUTO PICK  Jev answers one Choice question over every roster row, luna and claude (criteria =
//              use_for, measured AA/TB4/SciCode, cost multiple, graded record; roster.ts criterionFor).
//              Jev's choice is used as made; on any Jev failure, a choice outside the roster, or a cwd under no_egress, the
//              roster default runs and the reason is recorded — never a silent substitute.
//   C5  evolution  receipt and log records carry `schema`; fields are additive.
// Test seams: AGENT_ROUTER_STATE_DIR, DISPATCH_ROSTER_PATH, AGENT_ROUTER_CODEX_RUN (a fake codex-run).
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { cli, command } from "cleye";
import { attempt, errorMessage } from "../hooks/attempt.ts";
import { typesafeKey } from "../hooks/typesafe-key.ts";
import { jsonOf, z } from "../hooks/zod.ts";
import {
  criterionFor,
  loadRoster,
  type Choice,
  type Roster,
} from "../models/roster.ts";
import {
  activeDir,
  ActiveSchema,
  briefLabel,
  progressFile,
  ProgressSchema,
  stateDir,
  STATE_SCHEMA,
  type Active,
} from "./state.ts";

const SCHEMA = STATE_SCHEMA;
const STATE_DIR = stateDir();
const ACTIVE_DIR = activeDir();
const LOG_FILE = join(STATE_DIR, "runs.jsonl");
const CODEX_RUN =
  process.env.AGENT_ROUTER_CODEX_RUN ??
  join(import.meta.dir, "workers/codex-run.ts");
// A claude row runs `claude -p` through driving-claude's bounded wrapper (test seam: a fake).
const RUN_CLAUDE =
  process.env.AGENT_ROUTER_RUN_CLAUDE ??
  join(import.meta.dir, "workers/run-claude.ts");

const now = (): string => Temporal.Now.instant().toString();
const sha256 = (s: string): string =>
  new Bun.CryptoHasher("sha256").update(s).digest("hex");

function fatal(message: string): never {
  console.error(`agent-router: ${message}`);
  return process.exit(2);
}

async function loadRosterOrDie(): Promise<Roster> {
  const path = process.env.DISPATCH_ROSTER_PATH;
  const r = await (path === undefined || path === ""
    ? loadRoster()
    : loadRoster(path));
  if (!r.ok) fatal(`cannot read the dispatch roster: ${r.error}`);
  return r.value;
}

// --- the pick --------------------------------------------------------------------------------------

const JevChoice = z.looseObject({
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()).optional(),
  confidence: z.number().optional(),
});
const JevAnswer = z.looseObject({
  model: z.string().optional(),
  answers: z.record(z.string(), JevChoice),
  usage: z.looseObject({}).optional(),
});

interface JevTrace {
  endpoint: string;
  request: unknown;
  key_source?: string;
  status?: number;
  response?: unknown;
  error?: string;
  latency_ms: number;
}
export interface Pick {
  source: "explicit" | "jev" | "default";
  choice: string;
  reason: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  jev?: JevTrace;
}

// Both sides are compared as REAL paths: a no_egress entry written through a symlink (/var vs
// /private/var on macOS, a linked checkout) must still match, or the brief would leave the machine.
const expandHome = (p: string): string => {
  const abs = p.startsWith("~/") ? join(homedir(), p.slice(2)) : resolve(p);
  return existsSync(abs) ? realpathSync(abs) : abs;
};

function underNoEgress(cwd: string, paths: string[]): string | undefined {
  const real = realpathSync(cwd);
  return paths.find((p) => {
    const base = expandHome(p);
    return real === base || real.startsWith(`${base}/`);
  });
}

function jevRequest(roster: Roster, brief: string): Record<string, unknown> {
  const tally = gradeTally();
  const criteria = Object.fromEntries(
    roster.choice.map((c) => [c.id, criterionFor(roster, c, tally.get(c.id))]),
  );
  const body: Record<string, unknown> = {
    state: { task: brief.slice(0, roster.auto.max_task_chars) },
    questions: {
      worker: {
        type: "choice",
        instructions:
          "Which worker should carry out `task`? Choose the CHEAPEST worker whose measured capability " +
          "and graded record are sufficient for what `task` actually needs. Pick a dearer worker only " +
          "when `task` needs a capability the cheaper ones measurably lack (for example a long " +
          "terminal or agentic session, where TB4 differs most), not because it is stronger in general.",
        criteria,
      },
    },
  };
  if (roster.auto.jev.api === "typesafe") body.model = roster.auto.jev.model;
  return body;
}

type JevReply =
  | { ok: true; answer: z.output<typeof JevChoice>; trace: JevTrace }
  | { ok: false; reason: string; trace: JevTrace };

/** One Choice question to Jev — the routing pick and the grade both go through here. */
async function askJevChoice(
  roster: Roster,
  request: Record<string, unknown>,
  question: string,
): Promise<JevReply> {
  const trace: JevTrace = {
    endpoint: roster.auto.jev.url,
    request,
    latency_ms: 0,
  };
  const key = typesafeKey();
  if (!key.ok)
    return { ok: false, reason: `jev unavailable: ${key.reason}`, trace };
  trace.key_source = key.source;
  const started = performance.now();
  const res = await attempt(() =>
    fetch(roster.auto.jev.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(roster.auto.timeout_ms),
    }),
  );
  if (!res.ok) {
    trace.latency_ms = Math.round(performance.now() - started);
    trace.error = errorMessage(res.error);
    return { ok: false, reason: `jev request failed: ${trace.error}`, trace };
  }
  const text = await res.value.text();
  trace.latency_ms = Math.round(performance.now() - started);
  trace.status = res.value.status;
  const parsed = jsonOf(JevAnswer).safeParse(text);
  trace.response = parsed.success ? parsed.data : text.slice(0, 2000);
  if (res.value.status !== 200)
    return { ok: false, reason: `jev HTTP ${res.value.status}`, trace };
  const answer = parsed.success ? parsed.data.answers[question] : undefined;
  if (answer === undefined)
    return { ok: false, reason: "jev answer did not parse", trace };
  return { ok: true, answer, trace };
}

async function askJev(roster: Roster, brief: string): Promise<Pick> {
  const fallback = (reason: string, jev?: JevTrace): Pick => ({
    source: "default",
    choice: roster.default,
    reason,
    ...(jev === undefined ? {} : { jev }),
  });
  const reply = await askJevChoice(roster, jevRequest(roster, brief), "worker");
  if (!reply.ok) return fallback(reply.reason, reply.trace);
  return judge(roster, reply.answer, reply.trace, fallback);
}

function judge(
  roster: Roster,
  answer: {
    choice: string;
    probabilities?: Record<string, number> | undefined;
    confidence?: number | undefined;
  },
  trace: JevTrace,
  fallback: (reason: string, jev?: JevTrace) => Pick,
): Pick {
  // Jev's pick stands as made: it chose ONE row from the brief and the table (jevRequest), and its
  // top choice is its decision however its probability mass was spread (owner 2026-10-06: 「迷ったって
  // どういう意味？…一つに決めないといけないのだから」 — a hand-set confidence floor overrode that
  // decision with the cheapest row). Its confidence and probabilities are logged so graded runs can
  // later show how low-confidence picks fare. The default runs only when there is no usable answer:
  // Jev unreachable (askJevChoice) or a choice outside the roster.
  const row = roster.choice.find((c) => c.id === answer.choice);
  if (row === undefined)
    return fallback(`jev chose '${answer.choice}', not a roster row`, trace);
  return {
    source: "jev",
    choice: row.id,
    reason:
      answer.confidence === undefined
        ? "jev's choice (no confidence reported)"
        : `jev's choice (confidence ${answer.confidence.toFixed(2)})`,
    ...(answer.confidence === undefined
      ? {}
      : { confidence: answer.confidence }),
    ...(answer.probabilities === undefined
      ? {}
      : { probabilities: answer.probabilities }),
    jev: trace,
  };
}

async function pickFor(
  roster: Roster,
  brief: string,
  cwd: string,
): Promise<Pick> {
  const blocked = underNoEgress(cwd, roster.auto.no_egress);
  if (blocked !== undefined)
    return {
      source: "default",
      choice: roster.default,
      reason: `cwd is under no_egress '${blocked}'; the brief stays on this machine`,
    };
  return askJev(roster, brief);
}

// --- state: active markers and the log -------------------------------------------------------------

function appendLog(record: Record<string, unknown>): void {
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(
    LOG_FILE,
    `${JSON.stringify({ schema: SCHEMA, ...record })}\n`,
  );
}

function alive(pid: number): boolean {
  const r = Bun.spawnSync(["kill", "-0", String(pid)], {
    stdout: "ignore",
    stderr: "ignore",
    timeout: 5_000,
  });
  return r.exitCode === 0;
}

function readActive(): { active: Active; alive: boolean; file: string }[] {
  if (!existsSync(ACTIVE_DIR)) return [];
  return readdirSync(ACTIVE_DIR)
    .filter((f) => f.endsWith(".json"))
    .flatMap((f) => {
      const file = join(ACTIVE_DIR, f);
      const parsed = jsonOf(ActiveSchema).safeParse(readFileSync(file, "utf8"));
      return parsed.success
        ? [{ active: parsed.data, alive: alive(parsed.data.pid), file }]
        : [];
    });
}

// --- run ------------------------------------------------------------------------------------------

const WorkerReceipt = z.looseObject({ outcome: z.string().optional() });

interface RunFlags {
  promptFile: string;
  cd: string;
  sandbox: string;
  choice: string;
  label: string | undefined;
  timeoutS: number | undefined;
}

function refuseUnrunnable(roster: Roster, id: string): Choice {
  const row = roster.choice.find((c) => c.id === id);
  if (row === undefined) fatal(`'${id}' is not a roster row`);
  return row;
}

// A luna row runs Codex. On a machine where Codex is not logged in every worker failed AFTER launch,
// and the caller learned why only by reading the run's stderr (a rented box, 2026-10-06: two
// workers "failed to start"). Ask Codex first, and refuse with the fix and where to run it.
function refuseUnauthenticatedCodex(): void {
  if (process.env.AGENT_ROUTER_CODEX_RUN !== undefined) return; // test seam: a fake codex-run
  if (Bun.which("codex") === null)
    fatal(
      `codex is not installed on ${hostname()}: every luna worker would fail — install it there: mise run install:ai-clis (dotfiles)`,
    );
  // bounded: a status query reads a local file.
  const r = Bun.spawnSync(["codex", "login", "status"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 15_000,
  });
  if (r.exitCode === 0) return;
  const said = `${r.stdout.toString()}${r.stderr.toString()}`.trim();
  fatal(
    `codex is not logged in on ${hostname()} (${said === "" ? `exit ${r.exitCode}` : said}): every luna worker would fail — log in there with \`codex login --device-auth\` (finish it in a browser on any machine), then rerun`,
  );
}

function refuseMissingClaude(): void {
  if (process.env.AGENT_ROUTER_RUN_CLAUDE !== undefined) return; // test seam: a fake run-claude
  if (Bun.which("claude") === null)
    fatal(
      `claude is not installed on ${hostname()}: a claude row cannot run here — install it: mise run install:ai-clis (dotfiles)`,
    );
}

// sandbox → claude permission mode. PERMISSIONS ARE NOT CONTAINMENT (driving-claude LAW): a claude
// worker has no OS sandbox; plan mode keeps a read-only task from editing, and a workspace-write task
// may edit and run Bash under the same hooks every Claude session runs under.
const CLAUDE_MODE: Record<string, { mode: string; tools?: string }> = {
  "read-only": { mode: "plan" },
  "workspace-write": { mode: "acceptEdits", tools: "Bash" },
};

/** The worker command for a row: codex-run for luna, run-claude for claude. */
function workerArgs(
  roster: Roster,
  row: Choice,
  flags: RunFlags,
  progress: string,
): string[] {
  if (row.route === "luna")
    return [
      CODEX_RUN,
      "--choice",
      row.id,
      "--sandbox",
      flags.sandbox,
      "--cd",
      flags.cd,
      "--prompt-file",
      flags.promptFile,
      ...(flags.timeoutS === undefined
        ? []
        : ["--timeout-s", String(flags.timeoutS)]),
    ];
  const mode = CLAUDE_MODE[flags.sandbox] ?? { mode: "plan" };
  return [
    RUN_CLAUDE,
    "--target",
    resolve(flags.cd),
    "--prompt-file",
    resolve(flags.promptFile),
    "--model",
    row.model,
    "--effort",
    row.effort,
    "--permission-mode",
    mode.mode,
    ...(mode.tools === undefined ? [] : ["--allowed-tools", mode.tools]),
    "--max-turns",
    String(roster.claude_run.max_turns),
    "--max-budget-usd",
    String(roster.claude_run.max_budget_usd),
    "--timeout-ms",
    String((flags.timeoutS ?? 540) * 1000),
    "--progress-file",
    progress,
  ];
}

const ClaudeRelay = z.looseObject({
  exit_code: z.number(),
  timed_out: z.boolean().optional(),
  result: z.string().optional(),
  total_cost_usd: z.unknown().optional(),
  usage: z.unknown().optional(),
  error: z.string().optional(),
  parse_error: z.string().optional(),
  stderr: z.string().optional(),
});

/** What the worker did, from its progress file, read before the file is removed (O2). */
type Done = { last: string; commands: number; files: number };
function progressAtEnd(path: string): Done | undefined {
  if (!existsSync(path)) return undefined;
  const p = jsonOf(ProgressSchema).safeParse(readFileSync(path, "utf8"));
  return p.success
    ? { last: p.data.last, commands: p.data.commands, files: p.data.files }
    : undefined;
}

/** A worker whose stdout is not its receipt is a failure that says so (O1) — it used to be logged as
 *  `{unparsed_stdout}` with no outcome at all, neither ok nor failed. */
const unreadable = (worker: string, outcome: string, out: string) => ({
  schema: 1,
  outcome,
  cause: `${worker} printed no ${worker === "run-claude" ? "relay" : "receipt"}: ${out.trim().slice(0, 400)}`,
});

/** Why a claude worker did not succeed, from its own relay; never empty (O1). */
function claudeCause(r: z.output<typeof ClaudeRelay>): string {
  const stderrLast = (r.stderr ?? "").trim().split("\n").at(-1) ?? "";
  if (r.error !== undefined && r.error !== "") return r.error;
  if (r.parse_error !== undefined && r.parse_error !== "")
    return `claude printed no JSON result: ${r.parse_error}`;
  if (r.timed_out === true) return "killed at its time bound";
  if (stderrLast !== "") return stderrLast;
  return `run-claude exited ${r.exit_code} and reported no cause`;
}

/** run-claude's relay in the receipt shape luna workers report (outcome, last_message, …). */
function claudeWorker(
  out: string,
  row: Choice,
  sandbox: string,
  elapsedS: number,
): Record<string, unknown> {
  const relay = jsonOf(ClaudeRelay).safeParse(out.trim());
  if (!relay.success) return unreadable("run-claude", "claude-failed", out);
  const r = relay.data;
  const failed = r.exit_code === 0 ? "ok" : "claude-failed";
  const outcome = r.timed_out === true ? "timeout" : failed;
  return {
    ...(outcome === "ok" ? {} : { cause: claudeCause(r) }),
    schema: 1,
    outcome,
    model: row.model,
    effort: row.effort,
    sandbox,
    permission_mode: (CLAUDE_MODE[sandbox] ?? { mode: "plan" }).mode,
    elapsed_s: elapsedS,
    exit_code: r.exit_code,
    total_cost_usd: r.total_cost_usd ?? null,
    usage: r.usage ?? null,
    last_message: r.result ?? r.error ?? "",
  };
}

async function run(flags: RunFlags): Promise<number> {
  const roster = await loadRosterOrDie();
  if (!existsSync(flags.promptFile))
    fatal(`no such brief: ${flags.promptFile}`);
  if (!existsSync(flags.cd)) fatal(`no such --cd directory: ${flags.cd}`);
  // Owner 2026-10-06 「jev routingに一元化しろ、何度目だ」: the coordinator kept naming rows itself.
  // A wrong pick is fixed where Jev reads, the brief or the row use_for, never by overriding Jev.
  if (flags.choice !== "auto")
    fatal(
      `--choice ${flags.choice} refused: Jev alone picks the row. If Jev picks wrong, say more in the brief (scope, files, risk) or fix that row use_for in agents/models/dispatch-roster.toml`,
    );
  const brief = readFileSync(flags.promptFile, "utf8");
  refuseOverUngraded(resolve(flags.cd));
  const pick = await pickFor(roster, brief, flags.cd);
  const row = refuseUnrunnable(roster, pick.choice);
  if (row.route === "luna") refuseUnauthenticatedCodex();
  else refuseMissingClaude();
  const runId = `${now().replaceAll(":", "-")}-${process.pid}`;
  const label = flags.label ?? briefLabel(brief);
  console.error(
    `agent-router: ${row.id} (${pick.source}: ${pick.reason}) — ${label}`,
  );

  const active: Active = {
    schema: SCHEMA,
    run_id: runId,
    pid: process.pid,
    label,
    choice: row.id,
    pick_source: pick.source,
    started_at: now(),
    cwd: resolve(flags.cd),
  };
  mkdirSync(ACTIVE_DIR, { recursive: true });
  const marker = join(ACTIVE_DIR, `${runId}.json`);
  writeFileSync(marker, JSON.stringify(active));
  // The worker folds its own events into this file (codex-run via CODEX_RUN_PROGRESS_FILE,
  // run-claude via --progress-file); the statusline Run rows read it.
  const progress = progressFile(runId);

  const args = workerArgs(roster, row, flags, progress);
  const t0 = performance.now();
  const child = Bun.spawn([process.execPath, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
    env: { ...process.env, CODEX_RUN_PROGRESS_FILE: progress },
  });
  const stop = (signal: NodeJS.Signals, code: number): void => {
    child.kill(signal);
    rmSync(marker, { force: true });
    rmSync(progress, { force: true });
    process.exit(code);
  };
  process.on("SIGINT", () => {
    stop("SIGINT", 130);
  });
  process.on("SIGTERM", () => {
    stop("SIGTERM", 143);
  });

  const out = await new Response(child.stdout).text();
  const exit = await child.exited;
  const done = progressAtEnd(progress);
  rmSync(marker, { force: true });
  rmSync(progress, { force: true });
  const elapsedS = Math.round((performance.now() - t0) / 100) / 10;
  const lunaWorker = jsonOf(WorkerReceipt).safeParse(out.trim());
  const worker =
    row.route === "claude"
      ? {
          success: true as const,
          data: claudeWorker(out, row, flags.sandbox, elapsedS),
        }
      : lunaWorker;
  const progressField = done === undefined ? {} : { progress: done };
  const receipt = {
    schema: SCHEMA,
    run_id: runId,
    label,
    cwd: active.cwd,
    brief: {
      path: resolve(flags.promptFile),
      sha256: sha256(brief),
      chars: brief.length,
    },
    pick,
    started_at: active.started_at,
    ended_at: now(),
    exit,
    // codex-run's own receipt carries progress; a claude worker's comes from its progress file
    worker: worker.success
      ? { ...progressField, ...worker.data }
      : unreadable("codex-run", "codex-failed", out),
  };
  appendLog({ kind: "run", ...receipt });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  return exit;
}

// --- pick / ls / stats -----------------------------------------------------------------------------

async function pickOnly(promptFile: string, cd: string): Promise<number> {
  const roster = await loadRosterOrDie();
  if (!existsSync(promptFile)) fatal(`no such brief: ${promptFile}`);
  const brief = readFileSync(promptFile, "utf8");
  const pick = await pickFor(roster, brief, cd);
  appendLog({
    kind: "pick",
    at: now(),
    cwd: resolve(cd),
    brief: {
      path: resolve(promptFile),
      sha256: sha256(brief),
      chars: brief.length,
    },
    pick,
  });
  console.error(
    `agent-router: would run ${pick.choice} (${pick.source}: ${pick.reason})`,
  );
  process.stdout.write(`${JSON.stringify(pick)}\n`);
  return 0;
}

function ls(): number {
  const rows = readActive().map((r) =>
    Object.assign({}, r.active, { alive: r.alive }),
  );
  for (const r of rows)
    console.error(
      `${r.alive ? "running" : "STALE  "} ${r.choice.padEnd(12)} ${r.started_at}  ${r.label}`,
    );
  if (rows.length === 0) console.error("agent-router: nothing running");
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, active: rows })}\n`);
  return 0;
}

const LogLine = z.looseObject({
  kind: z.string(),
  run_id: z.string().optional(),
  cwd: z.string().optional(),
  brief: z.looseObject({ path: z.string() }).optional(),
  pick: z.looseObject({
    source: z.string(),
    choice: z.string(),
    confidence: z.number().optional(),
    jev: z
      .looseObject({ latency_ms: z.number(), response: z.unknown().optional() })
      .optional(),
  }),
  exit: z.number().optional(),
  worker: z
    .looseObject({
      outcome: z.string().optional(),
      elapsed_s: z.number().optional(),
      last_message: z.string().optional(),
      usage: z
        .looseObject({
          input_tokens: z.number().optional(),
          output_tokens: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
});
type Logged = z.output<typeof LogLine>;

const quantile = (xs: number[], q: number): number | undefined => {
  const s = xs.toSorted((a, b) => a - b);
  return s.length === 0
    ? undefined
    : s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

function perChoice(lines: Logged[]): Record<string, unknown> {
  const runs = lines.filter((l) => l.kind === "run");
  const tally = gradeTally();
  const ids = [...new Set(runs.map((l) => l.pick.choice))];
  return Object.fromEntries(
    ids.map((id) => {
      const mine = runs.filter((l) => l.pick.choice === id);
      return [
        id,
        {
          runs: mine.length,
          ok: mine.filter((l) => l.exit === 0).length,
          elapsed_s_p50: quantile(
            mine.flatMap((l) => l.worker?.elapsed_s ?? []),
            0.5,
          ),
          input_tokens: mine.reduce(
            (s, l) => s + (l.worker?.usage?.input_tokens ?? 0),
            0,
          ),
          output_tokens: mine.reduce(
            (s, l) => s + (l.worker?.usage?.output_tokens ?? 0),
            0,
          ),
          graded: tally.get(id) ?? { pass: 0, partial: 0, fail: 0 },
        },
      ];
    }),
  );
}

function readLog(): Logged[] {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, "utf8")
    .split("\n")
    .filter((l) => l !== "")
    .flatMap((l) => {
      const p = jsonOf(LogLine).safeParse(l);
      return p.success ? [p.data] : [];
    });
}

// --- grade: Jev judges a finished run from evidence the coordinator collected ----------------------
//
// Owner 2026-10-06: 「その様な業務こそ jevにやらせましょう」. A run's `exit` says only that the worker
// stopped; whether its work was right is a separate fact. The coordinator runs the external checks
// (lint, typecheck, tests against a baseline) and passes their output as --evidence; Jev reads that,
// the worker's own report and the brief, and answers pass | partial | fail. The grade is appended to
// runs.jsonl beside the run, with Jev's probabilities (no confidence floor: Jev's answer is the
// grade, as its pick is the route). No Jev answer = no grade (refused, exit 2), never a default.

const GRADES = {
  pass: "Every check in `evidence` passed and the worker finished its whole assigned scope: no new failures against the baseline, nothing left undone, no test weakened or deleted.",
  partial:
    "The work is usable but not complete: part of the scope was left, a fix was owed elsewhere (another file, another worker), or the coordinator had to repair a regression it introduced.",
  fail: "The work is not usable: checks fail, most of the scope is undone, or it broke something that had to be reverted.",
} as const;
const GradeEnum = z.enum(["pass", "partial", "fail"]);
type Grade = z.output<typeof GradeEnum>;

const GradeLine = z.looseObject({
  kind: z.literal("grade"),
  run_id: z.string(),
  grade: GradeEnum,
});

/** The latest grade per run_id (a regrade replaces the earlier one). */
function readGrades(): Map<string, z.output<typeof GradeLine>> {
  const grades = new Map<string, z.output<typeof GradeLine>>();
  if (!existsSync(LOG_FILE)) return grades;
  for (const l of readFileSync(LOG_FILE, "utf8").split("\n")) {
    const p = jsonOf(GradeLine).safeParse(l);
    if (p.success) grades.set(p.data.run_id, p.data);
  }
  return grades;
}

const WaiverLine = z.looseObject({
  kind: z.literal("grade-waived"),
  run_id: z.string(),
  reason: z.string().min(1),
});

/** Run ids recorded as not gradable, each with its reason (a waiver is never counted as a grade). */
function readWaivers(): Set<string> {
  const waived = new Set<string>();
  if (!existsSync(LOG_FILE)) return waived;
  for (const l of readFileSync(LOG_FILE, "utf8").split("\n")) {
    const p = jsonOf(WaiverLine).safeParse(l);
    if (p.success) waived.add(p.data.run_id);
  }
  return waived;
}

// O3 (Tiger ledger, owner 2026-10-06 「tiger styleが徹底されているべき。fail firstでなければ」): a
// finished run is owed a grade, or a waiver with its reason, before more work is dispatched from
// the same cwd. On Vast 38 runs were logged and none graded: Jev's "graded record" criterion stayed
// empty, a run that deleted a file it was asked to lint stayed "ok", and the same mis-pick (luna on
// long edit-and-test loops, killed at its bound) repeated. Grading was available and optional, so
// it never happened; the gate makes the owed grade the coordinator's next step.
function owedGrades(cwd: string): Logged[] {
  const graded = readGrades();
  const waived = readWaivers();
  return readLog().filter(
    (l) =>
      l.kind === "run" &&
      l.run_id !== undefined &&
      l.cwd === cwd &&
      !graded.has(l.run_id) &&
      !waived.has(l.run_id),
  );
}

function refuseOverUngraded(cwd: string): void {
  const owed = owedGrades(cwd);
  if (owed.length === 0) return;
  const lines = owed
    .slice(0, 10)
    .map(
      (l) =>
        `  ${l.run_id ?? ""}  ${l.pick.choice}  ${l.worker?.outcome ?? `exit ${l.exit ?? "?"}`}`,
    );
  const more = owed.length > 10 ? [`  … and ${owed.length - 10} more`] : [];
  const id = owed[0]?.run_id ?? "<run_id>";
  fatal(
    [
      `${owed.length} finished run(s) in ${cwd} are not graded; grade each before dispatching more work here:`,
      ...lines,
      ...more,
      `Run the checks on its work, then: agent-router grade ${id} --evidence <checks file>`,
      `If it cannot be judged (it never started, its work is gone): agent-router grade ${id} --waive "<why>"`,
    ].join("\n"),
  );
}

/** Per roster row: how its graded runs went — fed to Jev with each row's use_for. */
function gradeTally(): Map<string, Record<Grade, number>> {
  const grades = readGrades();
  const tally = new Map<string, Record<Grade, number>>();
  for (const logged of readLog()) {
    const g =
      logged.run_id === undefined ? undefined : grades.get(logged.run_id);
    if (logged.kind !== "run" || g === undefined) continue;
    const t = tally.get(logged.pick.choice) ?? { pass: 0, partial: 0, fail: 0 };
    t[g.grade] += 1;
    tally.set(logged.pick.choice, t);
  }
  return tally;
}

const GRADE_TEXT_CHARS = 6000;

async function grade(runId: string, evidencePath: string): Promise<number> {
  const roster = await loadRosterOrDie();
  const logged = readLog().find((l) => l.kind === "run" && l.run_id === runId);
  if (logged === undefined)
    fatal(`no run ${runId} in ${LOG_FILE} (agent-router stats lists the log)`);
  if (!existsSync(evidencePath))
    fatal(
      `no such evidence file: ${evidencePath} — put the check output there (lint, typecheck, tests vs baseline)`,
    );
  const evidence = readFileSync(evidencePath, "utf8");
  const briefPath = logged.brief?.path;
  const brief =
    briefPath !== undefined && existsSync(briefPath)
      ? readFileSync(briefPath, "utf8")
      : "(brief file no longer exists)";
  const request: Record<string, unknown> = {
    state: {
      task: brief.slice(0, GRADE_TEXT_CHARS),
      worker_report: (logged.worker?.last_message ?? "(no report)").slice(
        0,
        GRADE_TEXT_CHARS,
      ),
      evidence: evidence.slice(0, GRADE_TEXT_CHARS),
    },
    questions: {
      grade: {
        type: "choice",
        instructions:
          "How did the worker do on `task`? Judge by `evidence` (checks the coordinator ran), not by `worker_report` (the worker's own claim); where they disagree, `evidence` wins.",
        criteria: GRADES,
      },
    },
  };
  if (roster.auto.jev.api === "typesafe") request.model = roster.auto.jev.model;
  const reply = await askJevChoice(roster, request, "grade");
  if (!reply.ok) fatal(`not graded: ${reply.reason}`);
  const answer = reply.answer;
  const graded = GradeEnum.safeParse(answer.choice);
  if (!graded.success)
    fatal(`not graded: jev answered '${answer.choice}', not pass|partial|fail`);
  const confidence = answer.confidence ?? 0;
  const record = {
    kind: "grade",
    run_id: runId,
    grade: graded.data,
    confidence,
    probabilities: answer.probabilities ?? {},
    evidence: { path: resolve(evidencePath), sha256: sha256(evidence) },
    graded_at: now(),
    jev: reply.trace,
  };
  appendLog(record);
  console.error(
    `agent-router: ${runId} graded ${answer.choice} (confidence ${confidence.toFixed(2)})`,
  );
  process.stdout.write(
    `${JSON.stringify({ schema: SCHEMA, ...record, jev: undefined })}\n`,
  );
  return 0;
}

function waive(runId: string, reason: string): number {
  const logged = readLog().find((l) => l.kind === "run" && l.run_id === runId);
  if (logged === undefined)
    fatal(`no run ${runId} in ${LOG_FILE} (agent-router stats lists the log)`);
  const record = {
    kind: "grade-waived",
    run_id: runId,
    reason,
    waived_at: now(),
  };
  appendLog(record);
  console.error(`agent-router: ${runId} waived — ${reason}`);
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, ...record })}\n`);
  return 0;
}

function stats(): number {
  const lines = readLog();
  const bySource = Object.fromEntries(
    ["explicit", "jev", "default"].map((s) => [
      s,
      lines.filter((l) => l.pick.source === s).length,
    ]),
  );
  const conf = lines.flatMap((l) => l.pick.confidence ?? []);
  const latency = lines.flatMap((l) => l.pick.jev?.latency_ms ?? []);
  const report = {
    schema: SCHEMA,
    log: LOG_FILE,
    records: lines.length,
    by_source: bySource,
    confidence: {
      n: conf.length,
      p10: quantile(conf, 0.1),
      p50: quantile(conf, 0.5),
      p90: quantile(conf, 0.9),
    },
    jev_latency_ms: {
      n: latency.length,
      p50: quantile(latency, 0.5),
      p95: quantile(latency, 0.95),
    },
    per_choice: perChoice(lines),
    // O3: finished runs still owed a grade or a waiver, over every cwd
    ungraded: (() => {
      const graded = readGrades();
      const waived = readWaivers();
      return lines.filter(
        (l) =>
          l.kind === "run" &&
          l.run_id !== undefined &&
          !graded.has(l.run_id) &&
          !waived.has(l.run_id),
      ).length;
    })(),
  };
  console.error(
    `agent-router: ${lines.length} records — explicit ${bySource.explicit}, jev ${bySource.jev}, default ${bySource.default}`,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return 0;
}

// --- argv -----------------------------------------------------------------------------------------

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__")
    fatal(`unknown option '--${flag}'`);
};
const argv = cli({
  name: "agent-router",
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: [],
  help: {
    description:
      "Start a worker for a task (the one agent-router entry point), and report on dispatches.",
  },
  commands: [
    command({
      name: "run",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        promptFile: {
          type: String,
          description: "the brief (Markdown) the worker gets",
        },
        cd: {
          type: String,
          description: "the worker's working directory",
        },
        sandbox: {
          type: String,
          description: "read-only | workspace-write",
        },
        choice: {
          type: String,
          default: "auto",
          description:
            "refused unless auto: Jev alone picks the row (kept so the refusal can say why)",
        },
        label: {
          type: String,
          description: "short name shown by ls and the statusline",
        },
        timeoutS: {
          type: String,
          description: "worker wall clock (codex-run --timeout-s)",
        },
      },
      help: { description: "Jev picks a row; run the worker" },
    }),
    command({
      name: "pick",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        promptFile: {
          type: String,
          description: "the brief to classify",
        },
        cd: {
          type: String,
          default: ".",
          description: "the directory the brief would run in (no_egress)",
        },
      },
      help: { description: "the auto pick only; starts nothing" },
    }),
    command({
      name: "ls",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "running dispatches" },
    }),
    command({
      name: "stats",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "pick and outcome statistics from runs.jsonl" },
    }),
    command({
      name: "grade",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<run_id>"],
      flags: {
        evidence: {
          type: String,
          description:
            "file holding the checks you ran on the run's work (lint, typecheck, tests vs baseline)",
        },
        waive: {
          type: String,
          description:
            "instead of a grade: why this run cannot be judged (recorded; not counted as a grade)",
        },
      },
      help: {
        description:
          "Jev grades a finished run pass|partial|fail from your evidence; appended to runs.jsonl",
      },
    }),
  ],
});

async function main(): Promise<number | undefined> {
  // Cleye leaves excess positionals in argv._ (writing-bun-scripts BG1); only grade takes one, <run_id>.
  const positionals = argv.command === "grade" ? 1 : 0;
  if (argv._.length > positionals)
    fatal(`unexpected argument: ${String(argv._[positionals])}`);
  if (argv.command === "run") {
    const f = argv.flags;
    if (
      [f.promptFile, f.cd, f.sandbox, f.choice, f.label].some(
        (value) => value === "",
      )
    )
      fatal("a value is required");
    const timeoutS = f.timeoutS === undefined ? undefined : Number(f.timeoutS);
    if (
      timeoutS !== undefined &&
      (!Number.isInteger(timeoutS) || timeoutS <= 0)
    )
      fatal(`not a positive whole number of seconds: ${f.timeoutS}`);
    if (
      f.promptFile === undefined ||
      f.cd === undefined ||
      f.sandbox === undefined
    )
      fatal("run needs --prompt-file, --cd and --sandbox");
    if (f.sandbox !== "read-only" && f.sandbox !== "workspace-write")
      fatal(
        `--sandbox must be read-only or workspace-write, not '${f.sandbox}'`,
      );
    return run({
      promptFile: f.promptFile,
      cd: f.cd,
      sandbox: f.sandbox,
      choice: f.choice,
      label: f.label,
      timeoutS,
    });
  }
  if (argv.command === "pick") {
    if (argv.flags.promptFile === "" || argv.flags.cd === "")
      fatal("a value is required");
    if (argv.flags.promptFile === undefined) fatal("pick needs --prompt-file");
    return pickOnly(argv.flags.promptFile, argv.flags.cd);
  }
  if (argv.command === "ls") return ls();
  if (argv.command === "stats") return stats();
  if (argv.command === "grade")
    return gradeCommand(argv._.runId, argv.flags.evidence, argv.flags.waive);
  return undefined;
}

/** grade RUN_ID: exactly one of --evidence (Jev grades) or --waive (a recorded reason). */
async function gradeCommand(
  runId: string,
  evidence: string | undefined,
  why: string | undefined,
): Promise<number> {
  if (why !== undefined && evidence !== undefined)
    fatal("grade takes --evidence or --waive, not both");
  if (why !== undefined && why.trim() === "")
    fatal("--waive needs the reason this run cannot be judged");
  if (why !== undefined) return waive(runId, why.trim());
  if (evidence === undefined || evidence === "")
    fatal(
      'grade needs --evidence <file> (the checks you ran on the work), or --waive "<why>"',
    );
  return grade(runId, evidence);
}

const result = await attempt(main);
if (!result.ok) fatal(errorMessage(result.error));
if (result.value === undefined) {
  argv.showHelp();
  process.exit(2);
}
process.exit(result.value);
