#!/usr/bin/env bun
// agent-router — the ONE entry point that starts a worker for a task, records why that worker was
// chosen, and shows it as running (statusline `Run:` segment, `agent-router ls`).
// Consumers: the coordinating agent (primary), a human, the statusline. PATH command via
// package.json `bin` (`mise run deps`).
//
// CLI CONTRACT (designing-command-line-interfaces C0–C5)
//   C1  agent-router run  --prompt-file F --cd DIR --sandbox read-only|workspace-write
//                     [--choice ID|auto] [--label TEXT] [--timeout-s N]
//       agent-router pick --prompt-file F [--cd DIR]     the auto pick only; starts nothing
//       agent-router ls                                  running workers (stale ones flagged)
//       agent-router stats                               picks, confidence, fallbacks, cost, outcomes
//   C2  effects  run starts `codex-run --choice <row>` (agents/skills/driving-codex) as a child; a
//                Claude row is refused with the Agent call to make instead (the CLI cannot start a
//                Claude subagent). State lives outside the repo: $XDG_STATE_HOME/agent-router
//                (~/.local/state/agent-router): active/<run_id>.json while running, runs.jsonl forever.
//   C3  channels stdout: exactly one JSON line (run: the agent-router receipt; pick: the pick record;
//                ls/stats: a JSON report). stderr: one line naming the pick and why, then the
//                worker's own liveness lines.
//   C4  outcomes exit = the worker's (0 ok, 1 failed, 3 timeout); 2 refused/usage before any start.
//   AUTO PICK  Jev answers one Choice question over the enabled roster rows (criteria = use_for).
//              Below [auto].min_confidence, on any Jev failure, or for a cwd under no_egress, the
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
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { cli, command } from "cleye";
import { attempt, errorMessage } from "../hooks/attempt.ts";
import { typesafeKey } from "../hooks/typesafe-key.ts";
import { jsonOf, z } from "../hooks/zod.ts";
import {
  enabledChoices,
  loadRoster,
  type Choice,
  type Roster,
} from "../models/roster.ts";

const SCHEMA = 1;
const STATE_DIR =
  process.env.AGENT_ROUTER_STATE_DIR ??
  join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "agent-router");
const ACTIVE_DIR = join(STATE_DIR, "active");
const LOG_FILE = join(STATE_DIR, "runs.jsonl");
const CODEX_RUN =
  process.env.AGENT_ROUTER_CODEX_RUN ??
  join(import.meta.dir, "../skills/driving-codex/scripts/codex-run.ts");

const now = (): string => Temporal.Now.instant().toString();
const sha256 = (s: string): string =>
  new Bun.CryptoHasher("sha256").update(s).digest("hex");

function fatal(message: string): never {
  console.error(`agent-router: ${message}`);
  return process.exit(2);
}

function loadRosterOrDie(): Roster {
  const path = process.env.DISPATCH_ROSTER_PATH;
  return path === undefined || path === "" ? loadRoster() : loadRoster(path);
}

// --- the pick --------------------------------------------------------------------------------------

const JevAnswer = z.looseObject({
  model: z.string().optional(),
  answers: z.looseObject({
    worker: z.looseObject({
      choice: z.string(),
      probabilities: z.record(z.string(), z.number()).optional(),
      confidence: z.number().optional(),
    }),
  }),
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
  const criteria = Object.fromEntries(
    enabledChoices(roster).map((c) => [c.id, c.use_for]),
  );
  const body: Record<string, unknown> = {
    state: { task: brief.slice(0, roster.auto.max_task_chars) },
    questions: {
      worker: {
        type: "choice",
        instructions:
          "Which worker should carry out `task`? Choose the one whose description best fits the work `task` asks for.",
        criteria,
      },
    },
  };
  if (roster.auto.jev.api === "typesafe") body.model = roster.auto.jev.model;
  return body;
}

async function askJev(roster: Roster, brief: string): Promise<Pick> {
  const fallback = (reason: string, jev?: JevTrace): Pick => ({
    source: "default",
    choice: roster.default,
    reason,
    ...(jev === undefined ? {} : { jev }),
  });
  const request = jevRequest(roster, brief);
  const trace: JevTrace = { endpoint: roster.auto.jev.url, request, latency_ms: 0 };
  const key = typesafeKey();
  if (!key.ok) return fallback(`jev unavailable: ${key.reason}`, trace);
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
    return fallback(`jev request failed: ${trace.error}`, trace);
  }
  const text = await res.value.text();
  trace.latency_ms = Math.round(performance.now() - started);
  trace.status = res.value.status;
  const parsed = jsonOf(JevAnswer).safeParse(text);
  trace.response = parsed.success ? parsed.data : text.slice(0, 2000);
  if (res.value.status !== 200)
    return fallback(`jev HTTP ${res.value.status}`, trace);
  if (!parsed.success) return fallback("jev answer did not parse", trace);
  return judge(roster, parsed.data.answers.worker, trace, fallback);
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
  const row = enabledChoices(roster).find((c) => c.id === answer.choice);
  if (row === undefined)
    return fallback(`jev chose '${answer.choice}', not an enabled row`, trace);
  if (answer.confidence === undefined)
    return fallback("jev returned no confidence", trace);
  const scored = {
    confidence: answer.confidence,
    ...(answer.probabilities === undefined
      ? {}
      : { probabilities: answer.probabilities }),
  };
  if (answer.confidence < roster.auto.min_confidence)
    return {
      ...fallback(
        `jev confidence ${answer.confidence.toFixed(2)} < ${roster.auto.min_confidence} (it chose ${row.id})`,
        trace,
      ),
      ...scored,
    };
  return {
    source: "jev",
    choice: row.id,
    reason: `jev confidence ${answer.confidence.toFixed(2)} >= ${roster.auto.min_confidence}`,
    ...scored,
    jev: trace,
  };
}

async function pickFor(
  roster: Roster,
  choice: string,
  brief: string,
  cwd: string,
): Promise<Pick> {
  if (choice !== "auto")
    return { source: "explicit", choice, reason: "--choice given" };
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

const ActiveSchema = z.strictObject({
  schema: z.literal(SCHEMA),
  run_id: z.string(),
  pid: z.number().int(),
  label: z.string(),
  choice: z.string(),
  pick_source: z.string(),
  started_at: z.string(),
  cwd: z.string(),
});
type Active = z.output<typeof ActiveSchema>;

function appendLog(record: Record<string, unknown>): void {
  mkdirSync(STATE_DIR, { recursive: true });
  appendFileSync(LOG_FILE, `${JSON.stringify({ schema: SCHEMA, ...record })}\n`);
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
  if (!row.enabled)
    fatal(
      `'${id}' is disabled in the roster (enabled = false in agents/models/dispatch-roster.toml)`,
    );
  if (row.route === "claude")
    fatal(
      `'${id}' is a Claude row: start it with the Agent tool, subagent_type:"${id}" — this CLI starts only luna rows`,
    );
  return row;
}

async function run(flags: RunFlags): Promise<number> {
  const roster = loadRosterOrDie();
  if (!existsSync(flags.promptFile)) fatal(`no such brief: ${flags.promptFile}`);
  if (!existsSync(flags.cd)) fatal(`no such --cd directory: ${flags.cd}`);
  if (flags.choice !== "auto") refuseUnrunnable(roster, flags.choice);
  const brief = readFileSync(flags.promptFile, "utf8");
  const pick = await pickFor(roster, flags.choice, brief, flags.cd);
  const row = refuseUnrunnable(roster, pick.choice);
  const runId = `${now().replaceAll(":", "-")}-${process.pid}`;
  const label = flags.label ?? brief.split("\n").find((l) => l.trim() !== "")?.trim().slice(0, 60) ?? "";
  console.error(`agent-router: ${row.id} (${pick.source}: ${pick.reason}) — ${label}`);

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

  const args = [
    CODEX_RUN,
    "--choice",
    row.id,
    "--sandbox",
    flags.sandbox,
    "--cd",
    flags.cd,
    "--prompt-file",
    flags.promptFile,
    ...(flags.timeoutS === undefined ? [] : ["--timeout-s", String(flags.timeoutS)]),
  ];
  const child = Bun.spawn([process.execPath, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
  const stop = (signal: NodeJS.Signals, code: number): void => {
    child.kill(signal);
    rmSync(marker, { force: true });
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
  rmSync(marker, { force: true });
  const worker = jsonOf(WorkerReceipt).safeParse(out.trim());
  const receipt = {
    schema: SCHEMA,
    run_id: runId,
    label,
    cwd: active.cwd,
    brief: { path: resolve(flags.promptFile), sha256: sha256(brief), chars: brief.length },
    pick,
    started_at: active.started_at,
    ended_at: now(),
    exit,
    worker: worker.success ? worker.data : { unparsed_stdout: out.slice(0, 2000) },
  };
  appendLog({ kind: "run", ...receipt });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
  return exit;
}

// --- pick / ls / stats -----------------------------------------------------------------------------

async function pickOnly(promptFile: string, cd: string): Promise<number> {
  const roster = loadRosterOrDie();
  if (!existsSync(promptFile)) fatal(`no such brief: ${promptFile}`);
  const brief = readFileSync(promptFile, "utf8");
  const pick = await pickFor(roster, "auto", brief, cd);
  appendLog({
    kind: "pick",
    at: now(),
    cwd: resolve(cd),
    brief: { path: resolve(promptFile), sha256: sha256(brief), chars: brief.length },
    pick,
  });
  console.error(`agent-router: would run ${pick.choice} (${pick.source}: ${pick.reason})`);
  process.stdout.write(`${JSON.stringify(pick)}\n`);
  return 0;
}

function ls(): number {
  const rows = readActive().map((r) => Object.assign({}, r.active, { alive: r.alive }));
  for (const r of rows)
    console.error(`${r.alive ? "running" : "STALE  "} ${r.choice.padEnd(12)} ${r.started_at}  ${r.label}`);
  if (rows.length === 0) console.error("agent-router: nothing running");
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, active: rows })}\n`);
  return 0;
}

const LogLine = z.looseObject({
  kind: z.string(),
  pick: z.looseObject({
    source: z.string(),
    choice: z.string(),
    confidence: z.number().optional(),
    jev: z.looseObject({ latency_ms: z.number(), response: z.unknown().optional() }).optional(),
  }),
  exit: z.number().optional(),
  worker: z
    .looseObject({
      outcome: z.string().optional(),
      elapsed_s: z.number().optional(),
      usage: z.looseObject({ input_tokens: z.number().optional(), output_tokens: z.number().optional() }).optional(),
    })
    .optional(),
});
type Logged = z.output<typeof LogLine>;

const quantile = (xs: number[], q: number): number | undefined => {
  const s = xs.toSorted((a, b) => a - b);
  return s.length === 0 ? undefined : s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

function perChoice(lines: Logged[]): Record<string, unknown> {
  const runs = lines.filter((l) => l.kind === "run");
  const ids = [...new Set(runs.map((l) => l.pick.choice))];
  return Object.fromEntries(
    ids.map((id) => {
      const mine = runs.filter((l) => l.pick.choice === id);
      return [
        id,
        {
          runs: mine.length,
          ok: mine.filter((l) => l.exit === 0).length,
          elapsed_s_p50: quantile(mine.flatMap((l) => l.worker?.elapsed_s ?? []), 0.5),
          input_tokens: mine.reduce((s, l) => s + (l.worker?.usage?.input_tokens ?? 0), 0),
          output_tokens: mine.reduce((s, l) => s + (l.worker?.usage?.output_tokens ?? 0), 0),
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

function stats(): number {
  const lines = readLog();
  const bySource = Object.fromEntries(
    ["explicit", "jev", "default"].map((s) => [s, lines.filter((l) => l.pick.source === s).length]),
  );
  const conf = lines.flatMap((l) => l.pick.confidence ?? []);
  const latency = lines.flatMap((l) => l.pick.jev?.latency_ms ?? []);
  const report = {
    schema: SCHEMA,
    log: LOG_FILE,
    records: lines.length,
    by_source: bySource,
    confidence: { n: conf.length, p10: quantile(conf, 0.1), p50: quantile(conf, 0.5), p90: quantile(conf, 0.9) },
    jev_latency_ms: { n: latency.length, p50: quantile(latency, 0.5), p95: quantile(latency, 0.95) },
    per_choice: perChoice(lines),
  };
  console.error(
    `agent-router: ${lines.length} records — explicit ${bySource.explicit}, jev ${bySource.jev}, default ${bySource.default}`,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return 0;
}

// --- argv -----------------------------------------------------------------------------------------

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") fatal(`unknown option '--${flag}'`);
};
const requiredText = (v: string): string => {
  if (v === "") throw new Error("a value is required");
  return v;
};
const seconds = (v: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`not a positive whole number of seconds: ${v}`);
  return n;
};

const argv = cli({
  name: "agent-router",
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: [],
  help: { description: "Start a worker for a task (the one agent-router entry point), and report on dispatches." },
  commands: [
    command({
      name: "run",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        promptFile: { type: requiredText, description: "the brief (Markdown) the worker gets" },
        cd: { type: requiredText, description: "the worker's working directory" },
        sandbox: { type: requiredText, description: "read-only | workspace-write" },
        choice: { type: requiredText, default: "auto", description: "a roster row id, or auto (Jev picks)" },
        label: { type: requiredText, description: "short name shown by ls and the statusline" },
        timeoutS: { type: seconds, description: "worker wall clock (codex-run --timeout-s)" },
      },
      help: { description: "pick a row (or take --choice) and run the worker" },
    }),
    command({
      name: "pick",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        promptFile: { type: requiredText, description: "the brief to classify" },
        cd: { type: requiredText, default: ".", description: "the directory the brief would run in (no_egress)" },
      },
      help: { description: "the auto pick only; starts nothing" },
    }),
    command({ name: "ls", strictFlags: true, ignoreArgv: rejectPrototypeFlag, parameters: [], help: { description: "running dispatches" } }),
    command({ name: "stats", strictFlags: true, ignoreArgv: rejectPrototypeFlag, parameters: [], help: { description: "pick and outcome statistics from runs.jsonl" } }),
  ],
});

async function main(): Promise<number | undefined> {
  if (argv.command === "run") {
    const f = argv.flags;
    if (f.promptFile === undefined || f.cd === undefined || f.sandbox === undefined)
      fatal("run needs --prompt-file, --cd and --sandbox");
    if (f.sandbox !== "read-only" && f.sandbox !== "workspace-write")
      fatal(`--sandbox must be read-only or workspace-write, not '${f.sandbox}'`);
    return run({ promptFile: f.promptFile, cd: f.cd, sandbox: f.sandbox, choice: f.choice, label: f.label, timeoutS: f.timeoutS });
  }
  if (argv.command === "pick") {
    if (argv.flags.promptFile === undefined) fatal("pick needs --prompt-file");
    return pickOnly(argv.flags.promptFile, argv.flags.cd);
  }
  if (argv.command === "ls") return ls();
  if (argv.command === "stats") return stats();
  return undefined;
}

const result = await attempt(main);
if (!result.ok) fatal(errorMessage(result.error));
if (result.value === undefined) {
  argv.showHelp();
  process.exit(2);
}
process.exit(result.value);
