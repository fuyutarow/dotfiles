#!/usr/bin/env bun
// agent-dispatch — the ONE entry point that starts a worker for a task, records why that worker was
// chosen, and shows it as running (statusline `Run:` segment, `agent-dispatch ls`).
// Consumers: the coordinating agent (primary), a human, the statusline. PATH command via
// package.json `bin` (`mise run deps`).
//
// CLI CONTRACT (designing-command-line-interfaces C0–C5)
//   C1  agent-dispatch run  --prompt-file F --cd DIR --sandbox read-only|workspace-write
//                     [--label TEXT]   (--choice is refused: Jev alone picks) [--timeout-s N]
//       agent-dispatch pick --prompt-file F [--cd DIR]     the auto pick only; starts nothing
//       agent-dispatch ask  --request F|-                  a typed question to Jev; its answer, never acted on
//       agent-dispatch ls                                  running workers (stale ones flagged)
//       agent-dispatch stats                               picks, confidence, fallbacks, cost, outcomes
//       agent-dispatch export [--since ISO]                one flat JSON line per run for analysis
//       agent-dispatch result RUN_ID|SESSION_PREFIX [--json] show the worker report
//       agent-dispatch resume RUN_ID|SESSION_PREFIX [--prompt-file F] [--timeout-s N]
//                                                        continue a stopped run in its own vendor session
//       agent-dispatch grade RUN_ID --evidence F           Jev grades a finished run pass|partial|fail
//       agent-dispatch grade RUN_ID --waive "<why>"        record that a run cannot be graded, and why
//   TICKET  a brief may open with TOML front matter between `+++` lines (ticket.ts): `writes` globs, `verify`
//           commands, `verify_timeout_s`, `capabilities`. The router then strips it for the worker, runs
//           the verify commands after the worker exits (verify.ts), grades the run itself (graded_by
//           "router", or a recorded waiver), and gates only runs whose `writes` overlap. No front matter
//           = legacy mode: today's behaviour, byte for byte.
//   RESUME  a run record carries the vendor session id (worker.session); `resume` starts a NEW run
//           (resumed_from, pick.source "resume") on the original's row, sandbox and cwd, continuing that
//           session (codex-run --resume → `codex exec resume`; run-claude --resume → `claude --resume`,
//           which is why router-dispatched claude sessions are persisted). A run that ends timeout /
//           codex-failed / claude-failed with a session says `agent-dispatch resume <run_id>` in its receipt
//           (resume_with) and on stderr. SIGINT/SIGTERM kills the worker AND a running verify group and
//           records the run as stopped (with a waiver).
//   C2  effects  run starts `codex-run --choice <row>` for a codex row or
//                `run-claude.ts` for a Claude row. State lives outside the repo:
//                $XDG_STATE_HOME/agent-router (~/.local/state/agent-router): active/<run_id>.json
//                while running, runs.jsonl forever.
//   C3  channels stdout: exactly one JSON line (run: the agent-dispatch receipt; pick: the pick record;
//                ls/stats: a JSON report). stderr: one line naming the pick and why, then the
//                worker's own liveness lines.
//   C4  outcomes exit = the worker's (0 ok, 1 failed, 3 timeout); 2 refused/usage before any start.
//   AUTO PICK  Jev answers one Choice question over every roster row, codex and claude (criteria =
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
import pkg from "../package.json" with { type: "json" };
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { jsonOf, jsonText, z } from "../../shared/src/zod.ts";
import {
  criterionFor,
  costMultiple,
  loadRoster,
  type Choice,
  type Roster,
} from "../../../agents/models/roster.ts";
import { admitCodexWorker, codexWorkerLimit } from "./admission.ts";
import {
  currentHost,
  probeRoutes,
  routeCachePath,
  type Routes,
} from "./routes.ts";
import {
  activeDir,
  ActiveSchema,
  briefLabel,
  progressFile,
  ProgressSchema,
  stateDir,
  STATE_SCHEMA,
  storedBriefPath,
  storeBrief,
  type Active,
} from "./state.ts";
import { postJev, type JevTrace } from "./jev-client.ts";
import {
  parseReport,
  renderReport,
  reportJsonSchema,
  withReportInstruction,
  WorkerReport,
} from "./report.ts";
import {
  overlappingGlobs,
  parseTicket,
  verifyLine,
  type Ticket,
} from "./ticket.ts";
import {
  killRunningVerify,
  runVerify,
  verifyEvidence,
  verifySummary,
  type VerifyResult,
} from "./verify.ts";

const SCHEMA = STATE_SCHEMA;
const STATE_DIR = stateDir();
const ACTIVE_DIR = activeDir();
const LOG_FILE = join(STATE_DIR, "runs.jsonl");
const CODEX_RUN =
  process.env.AGENT_ROUTER_CODEX_RUN ??
  join(import.meta.dir, "workers/codex-run.ts");
// A claude row runs `claude -p` through tools/agent-dispatch/src/workers/run-claude.ts (test seam: a fake).
const RUN_CLAUDE =
  process.env.AGENT_ROUTER_RUN_CLAUDE ??
  join(import.meta.dir, "workers/run-claude.ts");

const now = (): string => Temporal.Now.instant().toString();
const epochMilliseconds = (): number =>
  Temporal.Now.instant().epochMilliseconds;
const sha256 = (s: string): string =>
  new Bun.CryptoHasher("sha256").update(s).digest("hex");

interface WritesCheck {
  paths: string[];
  unavailable?: string;
  violations?: string[];
}

interface ReadOnlyCommand {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runReadOnly(
  argv: string[],
  cwd: string,
): Promise<ReadOnlyCommand> {
  const spawned = await attempt(() =>
    Bun.spawnSync(argv, {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
  if (!spawned.ok)
    return { exitCode: 127, stdout: "", stderr: errorMessage(spawned.error) };
  const result = spawned.value;
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

/** Read the target workspace's changed paths; both commands are inspection-only. */
async function changedPaths(cwd: string): Promise<WritesCheck> {
  const jj = await runReadOnly(["jj", "diff", "--name-only"], cwd);
  if (jj.exitCode === 0)
    return {
      paths: jj.stdout.split("\n").filter((p) => p !== ""),
    };
  const git = await runReadOnly(["git", "status", "--porcelain"], cwd);
  if (git.exitCode === 0)
    return {
      paths: git.stdout
        .split("\n")
        .filter((line) => line.length >= 4)
        .map((line) => line.slice(3).split(" -> ").at(-1) ?? "")
        .filter((p) => p !== ""),
    };
  const jjError = jj.stderr.trim();
  const gitError = git.stderr.trim();
  const jjWhy = jjError.length > 0 ? jjError : `exit ${jj.exitCode}`;
  const gitWhy = gitError.length > 0 ? gitError : `exit ${git.exitCode}`;
  return {
    paths: [],
    unavailable: `jj diff failed (${jjWhy}); git status failed (${gitWhy})`,
  };
}

async function checkedWrites(
  cwd: string,
  writes: string[],
): Promise<WritesCheck> {
  const listed = await changedPaths(cwd);
  if (listed.unavailable !== undefined) return listed;
  const paths = [
    ...new Set(listed.paths.map((p) => p.replaceAll("\\", "/"))),
  ].filter((p) => !p.split("/").includes("node_modules"));
  const violations = paths.filter(
    (path) => !writes.some((glob) => new Bun.Glob(glob).match(path)),
  );
  return { paths, ...(violations.length === 0 ? {} : { violations }) };
}

function claudeTranscript(cwd: string, session: string): string {
  const slug = cwd.replaceAll(/[/.]/gu, "-");
  return join(homedir(), ".claude", "projects", slug, `${session}.jsonl`);
}

function fatal(message: string): never {
  console.error(`agent-dispatch: ${message}`);
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

export interface Pick {
  source: "explicit" | "jev" | "default" | "resume";
  choice: string;
  reason: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  jev?: JevTrace;
  routes_unavailable?: Partial<Record<"codex" | "claude", string>>;
  default_fallback?: string;
}

function hostRoutes(): Routes {
  const codexPath = Bun.which(process.env.CODEX_BIN ?? "codex");
  const codexVersion =
    codexPath === null
      ? "missing"
      : Bun.spawnSync([codexPath, "--version"], {
          stdout: "pipe",
          stderr: "pipe",
          timeout: 3_000,
        })
          .stdout.toString()
          .trim();
  return probeRoutes({
    host: currentHost(),
    version: codexVersion,
    cachePath: routeCachePath(STATE_DIR),
    now: epochMilliseconds,
    codexProbe: () => {
      if (process.env.AGENT_ROUTER_TEST_CODEX_ROUTE === "unavailable")
        return { available: false, reason: "injected sandbox denial" };
      if (process.env.AGENT_ROUTER_CODEX_RUN !== undefined)
        return { available: true, reason: "test worker override" };
      if (codexPath === null)
        return { available: false, reason: "codex is not on PATH" };
      const r = Bun.spawnSync([codexPath, "sandbox", "true"], {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5_000,
      });
      const output =
        `${r.stdout.toString()}${r.stderr.toString()}`
          .trim()
          .split("\n")
          .at(0) ?? "";
      if (r.exitCode === 0)
        return { available: true, reason: "Codex sandbox probe passed" };
      const reason =
        output === ""
          ? `sandbox probe exited ${r.exitCode}`
          : output.slice(0, 300);
      return { available: false, reason };
    },
    claudePath: (): string | null => {
      if (process.env.AGENT_ROUTER_TEST_CLAUDE_ROUTE === "unavailable")
        return null;
      if (process.env.AGENT_ROUTER_RUN_CLAUDE !== undefined)
        return process.env.AGENT_ROUTER_RUN_CLAUDE;
      return Bun.which("claude");
    },
  });
}

function availableRoster(
  roster: Roster,
  routes: Routes,
): {
  roster: Roster;
  unavailable: Partial<Record<"codex" | "claude", string>>;
  fallback?: string;
} {
  const unavailable = Object.fromEntries(
    Object.entries(routes)
      .filter(([, status]) => !status.available)
      .map(([route, status]) => [route, status.reason]),
  );
  const choice = roster.choice.filter((row) => routes[row.route].available);
  if (choice.length === 0)
    fatal(
      `no worker route is available on ${hostname()}: ${Object.entries(
        unavailable,
      )
        .map(([route, reason]) => `${route}: ${reason}`)
        .join("; ")}`,
    );
  const fallbackRow = choice.toSorted(
    (a, b) =>
      (costMultiple({ ...roster, choice }, a) ?? Number.POSITIVE_INFINITY) -
      (costMultiple({ ...roster, choice }, b) ?? Number.POSITIVE_INFINITY),
  )[0];
  const defaultRow = choice.find((row) => row.id === roster.default);
  const fallback = defaultRow === undefined ? fallbackRow?.id : undefined;
  return {
    roster: {
      ...roster,
      choice,
      default: defaultRow?.id ?? fallbackRow?.id ?? roster.default,
    },
    unavailable,
    ...(fallback === undefined ? {} : { fallback }),
  };
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

function jevRequest(
  roster: Roster,
  brief: string,
  capabilities: string[],
): Record<string, unknown> {
  const tally = gradeTally();
  const criteria = Object.fromEntries(
    roster.choice.map((c) => [c.id, criterionFor(roster, c, tally.get(c.id))]),
  );
  const body: Record<string, unknown> = {
    state: {
      task: brief.slice(0, roster.auto.max_task_chars),
      ...(capabilities.length === 0
        ? {}
        : { required_capabilities: capabilities }),
    },
    questions: {
      worker: {
        type: "choice",
        instructions:
          "Which worker should carry out `task`? Choose the CHEAPEST worker whose measured capability " +
          "and graded record are sufficient for what `task` actually needs. Pick a dearer worker only " +
          "when `task` needs a capability the cheaper ones measurably lack (for example a long " +
          "terminal or agentic session, where TB4 differs most), not because it is stronger in general. " +
          "A blank measurement means not published, not low: compare rows without TB4 on the AA index, and do not prefer a row only because its numbers are more complete. " +
          "When a codex-route row and a claude-route row are about equally capable for this task " +
          "(comparable measured numbers for the capabilities it needs), choose the codex-route row. " +
          "Then choose the cheapest sufficient codex row as before. Choose a claude-route row only " +
          "if the task needs a capability that codex rows measurably lack.",
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
  const post = await postJev(
    roster.auto.jev.url,
    request,
    roster.auto.timeout_ms,
  );
  if (!post.ok) return post;
  const { trace } = post;
  const parsed = jsonOf(JevAnswer).safeParse(post.text);
  trace.response = parsed.success ? parsed.data : post.text.slice(0, 2000);
  if (post.status !== 200)
    return { ok: false, reason: `jev HTTP ${post.status}`, trace };
  const answer = parsed.success ? parsed.data.answers[question] : undefined;
  if (answer === undefined)
    return { ok: false, reason: "jev answer did not parse", trace };
  return { ok: true, answer, trace };
}

async function askJev(
  roster: Roster,
  brief: string,
  capabilities: string[],
): Promise<Pick> {
  const fallback = (reason: string, jev?: JevTrace): Pick => ({
    source: "default",
    choice: roster.default,
    reason,
    ...(jev === undefined ? {} : { jev }),
  });
  const reply = await askJevChoice(
    roster,
    jevRequest(roster, brief, capabilities),
    "worker",
  );
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
  capabilities: string[] = [],
): Promise<Pick> {
  const available = availableRoster(roster, hostRoutes());
  const blocked = underNoEgress(cwd, roster.auto.no_egress);
  if (blocked !== undefined)
    return {
      source: "default",
      choice: available.roster.default,
      reason: `cwd is under no_egress '${blocked}'; the brief stays on this machine`,
      ...(Object.keys(available.unavailable).length === 0
        ? {}
        : { routes_unavailable: available.unavailable }),
      ...(available.fallback === undefined
        ? {}
        : {
            default_fallback: `default route unavailable; using cheapest available row ${available.fallback}`,
          }),
    };
  const pick = await askJev(available.roster, brief, capabilities);
  const fallbackReason =
    available.fallback === undefined
      ? undefined
      : `default route unavailable; fallback default is cheapest available row ${available.fallback}`;
  const defaultFallback =
    fallbackReason === undefined ? {} : { default_fallback: fallbackReason };
  const pickReason =
    fallbackReason !== undefined && pick.source === "default"
      ? { reason: `${pick.reason}; ${fallbackReason}` }
      : {};
  return {
    ...pick,
    ...(Object.keys(available.unavailable).length === 0
      ? {}
      : { routes_unavailable: available.unavailable }),
    ...defaultFallback,
    ...pickReason,
  };
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

// A codex row runs Codex. On a machine where Codex is not logged in every worker failed AFTER launch,
// and the caller learned why only by reading the run's stderr (a rented box, 2026-10-06: two
// workers "failed to start"). Ask Codex first, and refuse with the fix and where to run it.
function refuseUnauthenticatedCodex(): void {
  if (process.env.AGENT_ROUTER_CODEX_RUN !== undefined) return; // test seam: a fake codex-run
  if (Bun.which("codex") === null)
    fatal(
      `codex is not installed on ${hostname()}: every codex worker would fail — install it there: mise run install:ai-clis (dotfiles)`,
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
    `codex is not logged in on ${hostname()} (${said === "" ? `exit ${r.exitCode}` : said}): every codex worker would fail — log in there with \`codex login --device-auth\` (finish it in a browser on any machine), then rerun`,
  );
}

function refuseMissingClaude(): void {
  if (process.env.AGENT_ROUTER_RUN_CLAUDE !== undefined) return; // test seam: a fake run-claude
  if (Bun.which("claude") === null)
    fatal(
      `claude is not installed on ${hostname()}: a claude row cannot run here — install it: mise run install:ai-clis (dotfiles)`,
    );
}

// sandbox → claude permission mode. PERMISSIONS ARE NOT CONTAINMENT (law from
// archives/skills/driving-claude/SKILL.md): a claude worker has no OS sandbox; plan mode keeps a
// read-only task from editing, and a workspace-write task may edit and run Bash under the same hooks
// every Claude session runs under.
const CLAUDE_MODE: Record<string, { mode: string; tools?: string }> = {
  "read-only": { mode: "plan" },
  "workspace-write": { mode: "acceptEdits", tools: "Bash" },
};

/** The worker command for a row: codex-run for codex, run-claude for claude. */
function workerArgs(
  roster: Roster,
  row: Choice,
  flags: RunFlags,
  progress: string,
  runId: string,
  resume: string | undefined,
  schemaFile: string,
): string[] {
  if (row.route === "codex")
    return [
      CODEX_RUN,
      "--choice",
      row.id,
      // the typed report's JSON schema: `codex exec --output-schema` (fresh and resumed)
      "--output-schema",
      schemaFile,
      "--sandbox",
      flags.sandbox,
      "--cd",
      flags.cd,
      "--prompt-file",
      flags.promptFile,
      "--run-id",
      runId,
      ...(resume === undefined ? [] : ["--resume", resume]),
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
    String((flags.timeoutS ?? 1800) * 1000),
    "--progress-file",
    progress,
    // the typed report's JSON schema: `claude --json-schema`; the structured output lands in the relay
    "--json-schema-file",
    schemaFile,
    // router-dispatched claude sessions stay on disk so `agent-dispatch resume` can continue them
    "--persist-session",
    ...(resume === undefined ? [] : ["--resume", resume]),
  ];
}

const ClaudeRelay = z.looseObject({
  exit_code: z.number(),
  timed_out: z.boolean().optional(),
  result: z.string().optional(),
  total_cost_usd: z.unknown().optional(),
  usage: z.unknown().optional(),
  structured_output: z.unknown().optional(),
  // why claude stopped, from its result event (run-claude keeps them in its relay)
  subtype: z.string().optional(),
  is_error: z.boolean().optional(),
  num_turns: z.number().optional(),
  error: z.string().optional(),
  session_id: z.unknown().optional(),
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

/** The vendor session id a running worker has reported in its progress file, if any. */
function progressSession(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const p = jsonOf(ProgressSchema).safeParse(readFileSync(path, "utf8"));
  return p.success ? p.data.session : undefined;
}

/** A worker whose stdout is not its receipt is a failure that says so (O1) — it used to be logged as
 *  `{unparsed_stdout}` with no outcome at all, neither ok nor failed. */
const unreadable = (worker: string, outcome: string, out: string) => ({
  schema: 1,
  outcome,
  cause: `${worker} printed no ${worker === "run-claude" ? "relay" : "receipt"}: ${out.trim().slice(0, 400)}`,
});

/** Whether claude's own result event says the run did not succeed, whatever the exit code. */
const claudeStopped = (r: z.output<typeof ClaudeRelay>): boolean =>
  r.is_error === true || (r.subtype !== undefined && r.subtype !== "success");

/** The stop reason in claude's result event (subtype, is_error, num_turns, cost), or undefined when
 *  there is none to name. The bounds are the router's own (--max-turns, --max-budget-usd). */
function claudeStopReason(
  r: z.output<typeof ClaudeRelay>,
  bounds: { maxTurns: number; maxBudgetUsd: number },
): string | undefined {
  if (!claudeStopped(r)) return undefined;
  const subtype = r.subtype ?? "is_error";
  const turns = r.num_turns === undefined ? "" : `, ${r.num_turns} turns`;
  const spent =
    typeof r.total_cost_usd === "number" ? `, $${r.total_cost_usd} spent` : "";
  if (subtype === "error_max_turns")
    return `stopped at the turn bound (${subtype}, ${r.num_turns ?? bounds.maxTurns} turns of ${bounds.maxTurns})`;
  if (subtype.includes("budget"))
    return `stopped at the budget bound (${subtype}${spent}, bound $${bounds.maxBudgetUsd})`;
  const said = (r.result ?? "").trim().split("\n").at(0) ?? "";
  return `claude stopped with ${subtype} (is_error=${r.is_error ?? false}${turns}${spent})${said === "" ? "" : `: ${said.slice(0, 200)}`}`;
}

/** Why a claude worker did not succeed, from its own relay; never empty (O1). */
function claudeCause(
  r: z.output<typeof ClaudeRelay>,
  bounds: { maxTurns: number; maxBudgetUsd: number },
): string {
  const stderrLast = (r.stderr ?? "").trim().split("\n").at(-1) ?? "";
  if (r.error !== undefined && r.error !== "") return r.error;
  if (r.timed_out === true) return "killed at its time bound";
  const stopped = claudeStopReason(r, bounds);
  if (stopped !== undefined) return stopped;
  if (r.parse_error !== undefined && r.parse_error !== "") {
    if (!r.parse_error.startsWith("no result event"))
      return `claude printed no JSON result: ${r.parse_error}`;
    const tail = stderrLast === "" ? "" : `: ${stderrLast}`;
    return `claude produced no result event (the stream ended without one; exit ${r.exit_code})${tail}`;
  }
  if (stderrLast !== "") return stderrLast;
  return `run-claude exited ${r.exit_code} and reported no cause`;
}

/** run-claude's relay in the receipt shape codex workers report (outcome, last_message, …). */
function claudeWorker(
  out: string,
  row: Choice,
  sandbox: string,
  elapsedS: number,
  bounds: { maxTurns: number; maxBudgetUsd: number },
): Record<string, unknown> {
  const relay = jsonOf(ClaudeRelay).safeParse(out.trim());
  if (!relay.success) return unreadable("run-claude", "claude-failed", out);
  const r = relay.data;
  const failed =
    r.exit_code === 0 && !claudeStopped(r) ? "ok" : "claude-failed";
  const outcome = r.timed_out === true ? "timeout" : failed;
  return {
    ...(typeof r.session_id === "string" ? { session: r.session_id } : {}),
    ...(outcome === "ok" ? {} : { cause: claudeCause(r, bounds) }),
    ...(r.subtype === undefined ? {} : { stop_subtype: r.subtype }),
    ...(r.num_turns === undefined ? {} : { num_turns: r.num_turns }),
    // the vendor's structured output (claude --json-schema): the typed report is read from it
    ...(r.structured_output === undefined
      ? {}
      : { structured_output: r.structured_output }),
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
    last_message: claudeLastMessage(r),
  };
}

/** What the claude worker said last: its result text, else its structured output as JSON text. */
function claudeLastMessage(r: z.output<typeof ClaudeRelay>): string {
  if (r.result !== undefined && r.result !== "") return r.result;
  if (r.structured_output !== undefined)
    return JSON.stringify(r.structured_output);
  return r.error ?? "";
}

/** The typed report of a finished worker, as the fields the run record and receipt carry: `report`
 *  when valid, else `report_error` (the raw last message stays in worker.last_message). Never fatal. */
function reportFields(worker: unknown): Record<string, unknown> {
  const w = z
    .looseObject({
      last_message: z.string().optional(),
      structured_output: z.unknown().optional(),
    })
    .safeParse(worker);
  if (!w.success)
    return {
      report_error: "the worker printed no receipt, so no final report",
    };
  const parsed = parseReport(
    w.data.structured_output,
    w.data.last_message ?? "",
  );
  return parsed.ok ? { report: parsed.report } : { report_error: parsed.error };
}

type TokenCounts = {
  input: number | null;
  cached_input: number | null;
  output: number | null;
  reasoning: number | null;
};

const UsageFields = z.looseObject({
  input_tokens: z.number().optional(),
  cached_input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  reasoning_output_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
});

const tokenCounts = (route: Choice["route"], value: unknown): TokenCounts => {
  const parsed = UsageFields.safeParse(value);
  if (!parsed.success)
    return { input: null, cached_input: null, output: null, reasoning: null };
  const usage = parsed.data;
  if (route === "claude") {
    const cacheFields = [
      usage.cache_read_input_tokens,
      usage.cache_creation_input_tokens,
    ];
    return {
      input: usage.input_tokens ?? null,
      cached_input: cacheFields.every((n) => n !== undefined)
        ? cacheFields.reduce<number>((sum, n) => sum + (n ?? 0), 0)
        : null,
      output: usage.output_tokens ?? null,
      reasoning: null,
    };
  }
  return {
    input: usage.input_tokens ?? null,
    cached_input: usage.cached_input_tokens ?? null,
    output: usage.output_tokens ?? null,
    reasoning: usage.reasoning_output_tokens ?? null,
  };
};

function statsFor(
  row: Choice,
  pick: Pick,
  worker: Record<string, unknown>,
  exit: number,
  elapsedS: number,
  briefChars: number,
  cwd: string,
  asOf: string,
): Record<string, unknown> {
  const tokens = tokenCounts(row.route, worker.usage);
  const price = {
    in: row.price_in ?? null,
    cached_in: row.price_cached_in ?? null,
    out: row.price_out ?? null,
    as_of: asOf,
  };
  let costUsd: number | null = null;
  let costBasis: string;
  if (row.route === "claude") {
    const raw = worker.total_cost_usd;
    if (typeof raw === "number") costUsd = raw;
    else if (typeof raw === "string" && raw.trim() !== "")
      costUsd = Number(raw);
    else costUsd = null;
    if (costUsd !== null && !Number.isFinite(costUsd)) costUsd = null;
    costBasis = "billed";
  } else {
    const missing = Object.entries(tokens)
      .filter(([, n]) => n === null)
      .map(([name]) => name);
    if (row.price_in === undefined || row.price_out === undefined) {
      costBasis = "unknown: no list price";
    } else if (missing.length > 0) {
      costBasis = `unknown: missing token counts (${missing.join(", ")})`;
    } else {
      const input = tokens.input ?? 0;
      const cached = tokens.cached_input ?? 0;
      const output = tokens.output ?? 0;
      const reasoning = tokens.reasoning ?? 0;
      const cachedPrice = row.price_cached_in ?? row.price_in;
      costUsd =
        ((input - cached) * row.price_in +
          cached * cachedPrice +
          (output + reasoning) * row.price_out) /
        1_000_000;
      costBasis = "list_price_x_tokens";
    }
  }
  return {
    row: row.id,
    family: row.id.split("-")[0],
    route: row.route,
    model: row.model,
    effort: row.effort,
    outcome:
      typeof worker.outcome === "string" ? worker.outcome : "codex-failed",
    exit,
    elapsed_s:
      typeof worker.elapsed_s === "number" ? worker.elapsed_s : elapsedS,
    tokens,
    cost_usd: costUsd,
    cost_basis: costBasis,
    price,
    brief_chars: briefChars,
    cwd,
    jev_confidence: pick.confidence ?? null,
    picked_by: pick.source,
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
  const parsed = parseTicket(brief);
  if (parsed.kind === "invalid")
    fatal(`invalid ticket in ${flags.promptFile}: ${parsed.reason}`);
  const ticket = parsed.kind === "ticket" ? parsed.ticket : undefined;
  refuseOverUngraded(resolve(flags.cd), ticket?.writes);
  const pick = await pickFor(
    roster,
    parsed.prose,
    flags.cd,
    ticket?.capabilities,
  );
  // A ticket's front matter is the router's, not the worker's: the worker gets the prose and the
  // verify line, from a copy under the state dir. A legacy brief goes to the worker as the file itself.
  const workerText =
    ticket === undefined ? undefined : withVerifyLine(parsed.prose, ticket);
  return launch({
    roster,
    flags,
    brief,
    ticket,
    pick,
    label: flags.label ?? briefLabel(parsed.prose),
    workerText,
    resume: undefined,
  });
}

const withVerifyLine = (text: string, ticket: Ticket): string => {
  const line = verifyLine(ticket.verify);
  return line === "" ? text : `${text.trimEnd()}\n\n${line}\n`;
};

interface Launch {
  roster: Roster;
  flags: RunFlags;
  /** the full original text, ticket included */
  brief: string;
  ticket: Ticket | undefined;
  pick: Pick;
  label: string;
  /** what the worker is sent when it is not the brief file itself */
  workerText: string | undefined;
  /** the vendor session to continue, for a resume */
  resume: { from: string; session: string } | undefined;
}

/** Start the worker for a pick, wait for it, verify and grade; shared by `run` and `resume`. */
async function launch(l: Launch): Promise<number> {
  const { roster, flags, brief, ticket, pick, label, resume } = l;
  const row = refuseUnrunnable(roster, pick.choice);
  const routeStatus = hostRoutes()[row.route];
  if (!routeStatus.available)
    fatal(
      `${row.route} route is unavailable on ${hostname()}: ${routeStatus.reason}`,
    );
  if (row.route === "codex") refuseUnauthenticatedCodex();
  else refuseMissingClaude();
  if (row.route === "codex") {
    // bash, not sh: dash (Ubuntu's /bin/sh) has no `ulimit -u`, prints nothing, and that read as limit 1.
    const limitOutput = Bun.spawnSync(["bash", "-c", "ulimit -u"], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 2_000,
    })
      .stdout.toString()
      .trim();
    const limit = codexWorkerLimit(limitOutput, roster.auto.max_codex_workers);
    const admitted = await admitCodexWorker({
      liveCodexWorkers: () =>
        readActive().filter(
          (entry) =>
            entry.alive &&
            roster.choice.find((choice) => choice.id === entry.active.choice)
              ?.route === "codex",
        ).length,
      limit,
      waitMs: 5 * 60_000,
      intervalMs: 30_000,
      now: epochMilliseconds,
      sleep: (ms) => Bun.sleep(ms),
      reportWait: (live, max, waited) => {
        console.error(
          `agent-dispatch: waiting for codex worker slot (${live}/${max} active; ${Math.round(waited / 1000)}s elapsed)`,
        );
      },
    });
    if (!admitted.ok) fatal(admitted.reason);
  }
  const runId = `${now().replaceAll(":", "-")}-${process.pid}`;
  // the full text, ticket included, kept by its hash: the run record's brief.sha256 is the key
  storeBrief(sha256(brief), brief);
  console.error(
    `agent-dispatch: ${row.id} (${pick.source}: ${pick.reason}) — ${label}`,
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
    ...(process.env.CLAUDE_CODE_SESSION_ID === undefined
      ? {}
      : { dispatcher_session: process.env.CLAUDE_CODE_SESSION_ID }),
  };
  mkdirSync(ACTIVE_DIR, { recursive: true });
  const marker = join(ACTIVE_DIR, `${runId}.json`);
  writeFileSync(marker, JSON.stringify(active));
  // The worker folds its own events into this file (codex-run via CODEX_RUN_PROGRESS_FILE,
  // run-claude via --progress-file); the statusline Run rows read it.
  const progress = progressFile(runId);

  // The worker's prompt is always a copy under the state dir: what it was told, plus the typed
  // report instruction after the ticket's verify line (a legacy brief is its own text).
  const workerBrief = join(STATE_DIR, "briefs", `${runId}.md`);
  mkdirSync(join(STATE_DIR, "briefs"), { recursive: true });
  writeFileSync(workerBrief, withReportInstruction(l.workerText ?? brief));
  const schemaFile = join(STATE_DIR, "report.schema.json");
  writeFileSync(schemaFile, reportJsonSchema());
  const args = workerArgs(
    roster,
    row,
    { ...flags, promptFile: workerBrief },
    progress,
    runId,
    resume?.session,
    schemaFile,
  );
  const t0 = performance.now();
  const child = Bun.spawn([process.execPath, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
    env: { ...process.env, CODEX_RUN_PROGRESS_FILE: progress },
  });
  const stop = (signal: NodeJS.Signals, code: number): void => {
    child.kill(signal);
    // a verify that is running is in its own process group (verify.ts): it survives unless killed here
    killRunningVerify();
    const session = progressSession(progress);
    // recorded as stopped; a waiver, because a stopped run has no work to grade and must not block the cwd
    appendLog({
      kind: "run",
      run_id: runId,
      label,
      cwd: active.cwd,
      brief: {
        path: resolve(flags.promptFile),
        sha256: sha256(brief),
        chars: brief.length,
      },
      pick,
      ...(ticket === undefined ? {} : { ticket }),
      ...(resume === undefined ? {} : { resumed_from: resume.from }),
      started_at: active.started_at,
      ...(active.dispatcher_session === undefined
        ? {}
        : { dispatcher_session: active.dispatcher_session }),
      ended_at: now(),
      exit: code,
      worker: {
        outcome: "stopped",
        cause: `agent-dispatch received ${signal}`,
        sandbox: flags.sandbox,
        ...(session === undefined ? {} : { session }),
      },
    });
    recordWaiver(runId, `stopped: agent-dispatch received ${signal}`, "router");
    rmSync(workerBrief, { force: true });
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
  rmSync(workerBrief, { force: true });
  const elapsedS = Math.round((performance.now() - t0) / 100) / 10;
  const codexWorker = jsonOf(WorkerReceipt).safeParse(out.trim());
  const worker =
    row.route === "claude"
      ? {
          success: true as const,
          data: claudeWorker(out, row, flags.sandbox, elapsedS, {
            maxTurns: roster.claude_run.max_turns,
            maxBudgetUsd: roster.claude_run.max_budget_usd,
          }),
        }
      : codexWorker;
  const progressField = done === undefined ? {} : { progress: done };
  const workerOutcome = z
    .looseObject({ outcome: z.string().optional() })
    .safeParse(worker.success ? worker.data : undefined);
  const outcomeName = workerOutcome.success
    ? workerOutcome.data.outcome
    : undefined;
  const writes =
    ticket === undefined
      ? undefined
      : await checkedWrites(active.cwd, ticket.writes);
  const writeViolations = writes?.violations ?? [];
  if (writes?.unavailable !== undefined)
    console.error(
      `agent-dispatch: writes check unavailable: ${writes.unavailable}`,
    );
  if (writeViolations.length > 0)
    console.error(
      `agent-dispatch: writes outside ticket scope: ${writeViolations.join(", ")}`,
    );
  const verified =
    ticket === undefined
      ? undefined
      : await verifyAfterWorker(ticket, active.cwd, outcomeName, done);
  const stoppedWith = z
    .looseObject({ outcome: z.string(), session: z.string() })
    .safeParse(worker.success ? worker.data : undefined);
  const resumeHint =
    stoppedWith.success &&
    stoppedWith.data.outcome !== "ok" &&
    (row.route === "codex" ||
      existsSync(claudeTranscript(active.cwd, stoppedWith.data.session)))
      ? `agent-dispatch resume ${runId}`
      : undefined;
  if (resumeHint !== undefined)
    console.error(
      `agent-dispatch: ${stoppedWith.data?.outcome ?? "stopped"} — continue it in its own context: ${resumeHint}`,
    );
  const writesFields: Record<string, unknown> = {};
  if (writes !== undefined) {
    writesFields.writes_check =
      writes.unavailable === undefined
        ? writes.paths
        : `unavailable: ${writes.unavailable}`;
    if (writeViolations.length > 0)
      writesFields.writes_violations = writeViolations;
  }
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
    ...(ticket === undefined ? {} : { ticket }),
    ...(resume === undefined ? {} : { resumed_from: resume.from }),
    started_at: active.started_at,
    ...(active.dispatcher_session === undefined
      ? {}
      : { dispatcher_session: active.dispatcher_session }),
    ended_at: now(),
    exit,
    ...(resumeHint === undefined ? {} : { resume_with: resumeHint }),
    ...reportFields(worker.success ? worker.data : undefined),
    ...(verified === undefined
      ? {}
      : { verify: verified.results, verify_summary: verified.summary }),
    ...writesFields,
    // codex-run's own receipt carries progress; a claude worker's comes from its progress file
    worker: worker.success
      ? { ...progressField, sandbox: flags.sandbox, ...worker.data }
      : unreadable("codex-run", "codex-failed", out),
  };
  const runStats = statsFor(
    row,
    pick,
    receipt.worker,
    exit,
    elapsedS,
    brief.length,
    active.cwd,
    roster.as_of,
  );
  appendLog({ kind: "run", ...receipt, stats: runStats });
  let graded: Record<string, unknown> = {};
  if (verified !== undefined) {
    graded =
      writeViolations.length > 0
        ? recordWritesViolationGrade(runId, verified, writeViolations)
        : await autoGrade(
            roster,
            runId,
            brief,
            receipt.worker,
            active.cwd,
            verified,
          );
  }
  process.stdout.write(`${JSON.stringify({ ...receipt, ...graded })}\n`);
  return writeViolations.length > 0 ? 1 : exit;
}

// --- the ticket after the worker exits: verify, then grade ---------------------------------------------

interface Verified {
  results: VerifyResult[];
  summary: string;
  /** why verify did not run, when it did not (the worker never started) */
  skipped?: string;
}

/** Run the ticket's verify commands now that the worker is gone. They are skipped only for a worker
 *  killed at its time bound before it ran a command or changed a file: there is nothing to verify. */
async function verifyAfterWorker(
  ticket: Ticket,
  cwd: string,
  outcome: string | undefined,
  done: Done | undefined,
): Promise<Verified> {
  const neverStarted =
    outcome === "timeout" &&
    (done === undefined || (done.commands === 0 && done.files === 0));
  if (neverStarted)
    return {
      results: [],
      summary: "skipped: the worker timed out before doing any work",
      skipped: "the worker timed out before doing any work",
    };
  const results = await runVerify(ticket.verify, cwd, ticket.verify_timeout_s);
  const summary = verifySummary(results);
  console.error(`agent-dispatch: verify ${summary}`);
  return { results, summary };
}

/** Grade the run from the router's own verify output (graded_by "router"); when Jev cannot, record a
 *  waiver with the reason — a run is never left silently ungraded, and no grade is invented. */
async function autoGrade(
  roster: Roster,
  runId: string,
  brief: string,
  worker: unknown,
  cwd: string,
  verified: Verified,
): Promise<Record<string, unknown>> {
  const waiveWith = (reason: string): Record<string, unknown> => {
    recordWaiver(runId, reason, "router");
    console.error(`agent-dispatch: ${runId} waived — ${reason}`);
    return { grade_waived: reason };
  };
  if (verified.skipped !== undefined)
    return waiveWith(`auto-grade: ${verified.skipped}; nothing to grade`);
  const noEgress = underNoEgress(cwd, roster.auto.no_egress);
  if (noEgress !== undefined)
    return waiveWith(
      `auto-grade: jev unavailable: cwd is under no_egress '${noEgress}'; the brief stays on this machine`,
    );
  const report =
    z.looseObject({ last_message: z.string().optional() }).safeParse(worker)
      .data?.last_message ?? "(no report)";
  const evidence = verifyEvidence(verified.results);
  const asked = await attempt(() =>
    requestGrade(roster, brief, report, evidence),
  );
  if (!asked.ok)
    return waiveWith(
      `auto-grade: jev unavailable: ${errorMessage(asked.error)}`,
    );
  if (!asked.value.ok)
    return waiveWith(`auto-grade: jev unavailable: ${asked.value.reason}`);
  const file = join(STATE_DIR, "evidence", `${runId}.txt`);
  mkdirSync(join(STATE_DIR, "evidence"), { recursive: true });
  writeFileSync(file, evidence);
  recordGrade(runId, asked.value, file, evidence, "router");
  console.error(
    `agent-dispatch: ${runId} graded ${asked.value.grade} by router (confidence ${asked.value.confidence.toFixed(2)})`,
  );
  return {
    grade: {
      grade: asked.value.grade,
      confidence: asked.value.confidence,
      graded_by: "router",
    },
  };
}

function recordWritesViolationGrade(
  runId: string,
  verified: Verified,
  violations: string[],
): Record<string, unknown> {
  const reason = `ticket writes scope violated: ${violations.join(", ")}`;
  const evidence = `${reason}\n\n${verifyEvidence(verified.results)}`;
  const file = join(STATE_DIR, "evidence", `${runId}.txt`);
  mkdirSync(join(STATE_DIR, "evidence"), { recursive: true });
  writeFileSync(file, evidence);
  appendLog({
    kind: "grade",
    run_id: runId,
    grade: "fail",
    confidence: 1,
    probabilities: { fail: 1 },
    reason,
    evidence: { path: resolve(file), sha256: sha256(evidence) },
    graded_at: now(),
    graded_by: "router",
  });
  console.error(`agent-dispatch: ${runId} graded fail by router — ${reason}`);
  return {
    grade: { grade: "fail", confidence: 1, graded_by: "router", reason },
  };
}

// --- pick / ls / stats -----------------------------------------------------------------------------

async function pickOnly(promptFile: string, cd: string): Promise<number> {
  const roster = await loadRosterOrDie();
  if (!existsSync(promptFile)) fatal(`no such brief: ${promptFile}`);
  const brief = readFileSync(promptFile, "utf8");
  const parsed = parseTicket(brief);
  if (parsed.kind === "invalid")
    fatal(`invalid ticket in ${promptFile}: ${parsed.reason}`);
  const pick = await pickFor(
    roster,
    parsed.prose,
    cd,
    parsed.kind === "ticket" ? parsed.ticket.capabilities : [],
  );
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
    `agent-dispatch: would run ${pick.choice} (${pick.source}: ${pick.reason})`,
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
  if (rows.length === 0) console.error("agent-dispatch: nothing running");
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, active: rows })}\n`);
  return 0;
}

function doctor(): number {
  const routes = hostRoutes();
  console.error(
    `agent-dispatch: codex: ${routes.codex.available ? "available" : "unavailable"} — ${routes.codex.reason}`,
  );
  console.error(
    `agent-dispatch: claude: ${routes.claude.available ? "available" : "unavailable"} — ${routes.claude.reason}`,
  );
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, routes })}\n`);
  return 0;
}

const LogLine = z.looseObject({
  kind: z.string(),
  run_id: z.string().optional(),
  cwd: z.string().optional(),
  brief: z
    .looseObject({ path: z.string(), sha256: z.string().optional() })
    .optional(),
  // present on a run dispatched with a ticket; absent = legacy
  ticket: z.looseObject({ writes: z.array(z.string()) }).optional(),
  writes_check: z.union([z.array(z.string()), z.string()]).optional(),
  writes_violations: z.array(z.string()).optional(),
  pick: z.looseObject({
    source: z.string(),
    choice: z.string(),
    confidence: z.number().optional(),
    jev: z
      .looseObject({ latency_ms: z.number(), response: z.unknown().optional() })
      .optional(),
  }),
  exit: z.number().optional(),
  resumed_from: z.string().optional(),
  // the typed final report (report.ts): `report` when valid, else `report_error`; both absent on a
  // run recorded before it. report is unknown here so a malformed one never drops the whole line.
  report: z.unknown().optional(),
  report_error: z.string().optional(),
  worker: z
    .looseObject({
      outcome: z.string().optional(),
      session: z.string().optional(),
      sandbox: z.string().optional(),
      run_id: z.string().optional(),
      receipt_file: z.string().optional(),
      elapsed_s: z.number().optional(),
      last_message: z.string().optional(),
      cause: z.string().optional(),
      progress: z.unknown().optional(),
      // null: a claude worker whose relay carried no usage (claudeWorker writes `usage: null`).
      // Before 2026-10-06 null failed this schema and the WHOLE run line was skipped by readLog —
      // invisible to grade, the O3 gate and stats.
      usage: z
        .looseObject({
          input_tokens: z.number().optional(),
          output_tokens: z.number().optional(),
        })
        .nullable()
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
function owedGrades(cwd: string, except?: string): Logged[] {
  const graded = readGrades();
  const waived = readWaivers();
  return readLog().filter(
    (l) =>
      l.kind === "run" &&
      l.run_id !== undefined &&
      l.cwd === cwd &&
      l.run_id !== except &&
      !graded.has(l.run_id) &&
      !waived.has(l.run_id),
  );
}

// The gate per write scope. `mine` is this run's declared writes (undefined = a legacy run, no ticket).
//   - a read-only ticket (writes = []) is never blocked, and an ungraded read-only run never blocks;
//   - a legacy run's scope is unknown, so it is treated as "may write anywhere": it blocks and is
//     blocked by every writing run in the same cwd (today's same-cwd rule);
//   - two ticket runs conflict only when some pair of their write globs overlaps (ticket.ts globsOverlap).
function conflict(
  mine: string[] | undefined,
  theirs: string[] | undefined,
): string | undefined {
  if (mine?.length === 0 || theirs?.length === 0) return undefined;
  if (mine === undefined || theirs === undefined)
    return "same-cwd rule: one of the two runs has no ticket, so its write scope is unknown";
  const pairs = overlappingGlobs(mine, theirs);
  return pairs.length === 0
    ? undefined
    : pairs.map(([m, t]) => `${t} overlaps ${m}`).join(", ");
}

function refuseOverUngraded(
  cwd: string,
  mine?: string[],
  except?: string,
): void {
  const owed = owedGrades(cwd, except).flatMap((l) => {
    const why = conflict(mine, l.ticket?.writes);
    return why === undefined ? [] : [{ run: l, why }];
  });
  if (owed.length === 0) return;
  const lines = owed
    .slice(0, 10)
    .map(
      ({ run: l, why }) =>
        `  ${l.run_id ?? ""}  ${l.pick.choice}  ${l.worker?.outcome ?? `exit ${l.exit ?? "?"}`}  (${why})`,
    );
  const more = owed.length > 10 ? [`  … and ${owed.length - 10} more`] : [];
  const id = owed[0]?.run.run_id ?? "<run_id>";
  fatal(
    [
      `${owed.length} finished run(s) in ${cwd} are not graded; grade each before dispatching more work here:`,
      ...lines,
      ...more,
      `Run the checks on its work, then: agent-dispatch grade ${id} --evidence <checks file>`,
      `If it cannot be judged (it never started, its work is gone): agent-dispatch grade ${id} --waive "<why>"`,
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

type GradeReply =
  | {
      ok: true;
      grade: Grade;
      confidence: number;
      probabilities: Record<string, number>;
      trace: JevTrace;
    }
  | { ok: false; reason: string };

/** Jev's grade of a run from its brief, the worker's report and the evidence — one question, shared
 *  by `grade` (the coordinator's evidence) and the automatic grade (the router's own verify output). */
async function requestGrade(
  roster: Roster,
  brief: string,
  report: string,
  evidence: string,
): Promise<GradeReply> {
  const request: Record<string, unknown> = {
    state: {
      task: brief.slice(0, GRADE_TEXT_CHARS),
      worker_report: report.slice(0, GRADE_TEXT_CHARS),
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
  if (!reply.ok) return { ok: false, reason: reply.reason };
  const answer = reply.answer;
  const graded = GradeEnum.safeParse(answer.choice);
  if (!graded.success)
    return {
      ok: false,
      reason: `jev answered '${answer.choice}', not pass|partial|fail`,
    };
  return {
    ok: true,
    grade: graded.data,
    confidence: answer.confidence ?? 0,
    probabilities: answer.probabilities ?? {},
    trace: reply.trace,
  };
}

/** Append a grade to the log beside its run; `by` is set only for the router's own grade. */
function recordGrade(
  runId: string,
  g: Extract<GradeReply, { ok: true }>,
  evidencePath: string,
  evidence: string,
  by?: "router",
) {
  const record = {
    kind: "grade",
    run_id: runId,
    grade: g.grade,
    confidence: g.confidence,
    probabilities: g.probabilities,
    evidence: { path: resolve(evidencePath), sha256: sha256(evidence) },
    graded_at: now(),
    ...(by === undefined ? {} : { graded_by: by }),
    jev: g.trace,
  };
  appendLog(record);
  return record;
}

/** A run's brief text: the stored copy by its hash, else the original file when it still exists
 *  (runs logged before briefs were stored). */
function loggedBrief(logged: Logged): string | undefined {
  const sha = logged.brief?.sha256;
  const stored = sha === undefined ? undefined : storedBriefPath(sha);
  if (stored !== undefined && existsSync(stored))
    return readFileSync(stored, "utf8");
  const path = logged.brief?.path;
  return path !== undefined && existsSync(path)
    ? readFileSync(path, "utf8")
    : undefined;
}

async function grade(runId: string, evidencePath: string): Promise<number> {
  const roster = await loadRosterOrDie();
  const logged = readLog().find((l) => l.kind === "run" && l.run_id === runId);
  if (logged === undefined)
    fatal(
      `no run ${runId} in ${LOG_FILE} (agent-dispatch stats lists the log)`,
    );
  if (!existsSync(evidencePath))
    fatal(
      `no such evidence file: ${evidencePath} — put the check output there (lint, typecheck, tests vs baseline)`,
    );
  const evidence = readFileSync(evidencePath, "utf8");
  const brief = loggedBrief(logged) ?? "(brief file no longer exists)";
  const reply = await requestGrade(
    roster,
    brief,
    logged.worker?.last_message ?? "(no report)",
    evidence,
  );
  if (!reply.ok) fatal(`not graded: ${reply.reason}`);
  const record = recordGrade(runId, reply, evidencePath, evidence);
  console.error(
    `agent-dispatch: ${runId} graded ${reply.grade} (confidence ${reply.confidence.toFixed(2)})`,
  );
  process.stdout.write(
    `${JSON.stringify({ schema: SCHEMA, ...record, jev: undefined })}\n`,
  );
  return 0;
}

function recordWaiver(runId: string, reason: string, by?: "router") {
  const record = {
    kind: "grade-waived",
    run_id: runId,
    reason,
    waived_at: now(),
    ...(by === undefined ? {} : { waived_by: by }),
  };
  appendLog(record);
  return record;
}

function waive(runId: string, reason: string): number {
  const logged = readLog().find((l) => l.kind === "run" && l.run_id === runId);
  if (logged === undefined)
    fatal(
      `no run ${runId} in ${LOG_FILE} (agent-dispatch stats lists the log)`,
    );
  const record = recordWaiver(runId, reason);
  console.error(`agent-dispatch: ${runId} waived — ${reason}`);
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, ...record })}\n`);
  return 0;
}

function stats(): number {
  const lines = readLog();
  const bySource = Object.fromEntries(
    ["explicit", "jev", "default", "resume"].map((s) => [
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
    `agent-dispatch: ${lines.length} records — explicit ${bySource.explicit}, jev ${bySource.jev}, default ${bySource.default}`,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return 0;
}

const ExportRunLine = z.looseObject({
  kind: z.literal("run"),
  run_id: z.string(),
  started_at: z.string().optional(),
  pick: z.looseObject({
    choice: z.string(),
    source: z.string().optional(),
    confidence: z.number().optional(),
  }),
  worker: z
    .looseObject({
      outcome: z.string().optional(),
      model: z.string().optional(),
      effort: z.string().optional(),
      elapsed_s: z.number().optional(),
      total_cost_usd: z.unknown().optional(),
      usage: z.unknown().optional(),
    })
    .optional(),
  exit: z.number().optional(),
  cwd: z.string().optional(),
  brief: z.looseObject({ chars: z.number().optional() }).optional(),
  stats: z.unknown().optional(),
});
type ExportRun = z.output<typeof ExportRunLine>;

const ExportStatsSchema = z.looseObject({
  row: z.string().optional(),
  family: z.string().optional(),
  route: z.enum(["codex", "claude"]).optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  outcome: z.string().optional(),
  exit: z.number().nullable().optional(),
  elapsed_s: z.number().nullable().optional(),
  tokens: z
    .looseObject({
      input: z.number().nullable().optional(),
      cached_input: z.number().nullable().optional(),
      output: z.number().nullable().optional(),
      reasoning: z.number().nullable().optional(),
    })
    .optional(),
  cost_usd: z.number().nullable().optional(),
  cost_basis: z.string().optional(),
  price: z
    .looseObject({
      in: z.number().nullable().optional(),
      cached_in: z.number().nullable().optional(),
      out: z.number().nullable().optional(),
      as_of: z.string().nullable().optional(),
    })
    .optional(),
  brief_chars: z.number().nullable().optional(),
  cwd: z.string().nullable().optional(),
  jev_confidence: z.number().nullable().optional(),
  picked_by: z.string().optional(),
});

const readExportRuns = (): ExportRun[] => {
  if (!existsSync(LOG_FILE)) return [];
  return readFileSync(LOG_FILE, "utf8")
    .split("\n")
    .filter((line) => line !== "")
    .flatMap((line) => {
      const parsed = jsonOf(ExportRunLine).safeParse(line);
      return parsed.success ? [parsed.data] : [];
    });
};

const latestGrades = (): Map<
  string,
  { grade: Grade; confidence: number | null }
> => {
  const result = new Map<string, { grade: Grade; confidence: number | null }>();
  if (!existsSync(LOG_FILE)) return result;
  const schema = z.looseObject({
    kind: z.literal("grade"),
    run_id: z.string(),
    grade: GradeEnum,
    confidence: z.number().optional(),
  });
  for (const line of readFileSync(LOG_FILE, "utf8").split("\n")) {
    const parsed = jsonOf(schema).safeParse(line);
    if (parsed.success)
      result.set(parsed.data.run_id, {
        grade: parsed.data.grade,
        confidence: parsed.data.confidence ?? null,
      });
  }
  return result;
};

const latestWaivers = (): Map<string, string> => {
  const result = new Map<string, string>();
  if (!existsSync(LOG_FILE)) return result;
  for (const line of readFileSync(LOG_FILE, "utf8").split("\n")) {
    const parsed = jsonOf(WaiverLine).safeParse(line);
    if (parsed.success) result.set(parsed.data.run_id, parsed.data.reason);
  }
  return result;
};

function recoveredStats(
  entry: ExportRun,
  roster: Roster,
): Record<string, unknown> {
  const parsed = ExportStatsSchema.safeParse(entry.stats);
  const snapshot = parsed.success ? parsed.data : undefined;
  const snapshotRow = snapshot?.row;
  if (snapshot !== undefined && snapshotRow !== undefined) {
    return {
      row: snapshotRow,
      family: snapshot.family ?? snapshotRow.split("-")[0],
      route: snapshot.route ?? null,
      model: snapshot.model ?? null,
      effort: snapshot.effort ?? null,
      outcome: snapshot.outcome ?? null,
      exit: snapshot.exit ?? entry.exit ?? null,
      elapsed_s: snapshot.elapsed_s ?? entry.worker?.elapsed_s ?? null,
      tokens: {
        input: snapshot.tokens?.input ?? null,
        cached_input: snapshot.tokens?.cached_input ?? null,
        output: snapshot.tokens?.output ?? null,
        reasoning: snapshot.tokens?.reasoning ?? null,
      },
      cost_usd: snapshot.cost_usd ?? null,
      cost_basis: snapshot.cost_basis ?? "unknown: no stats snapshot",
      price: {
        in: snapshot.price?.in ?? null,
        cached_in: snapshot.price?.cached_in ?? null,
        out: snapshot.price?.out ?? null,
        as_of: snapshot.price?.as_of ?? null,
      },
      brief_chars: snapshot.brief_chars ?? entry.brief?.chars ?? null,
      cwd: snapshot.cwd ?? entry.cwd ?? null,
      jev_confidence: snapshot.jev_confidence ?? entry.pick.confidence ?? null,
      picked_by: snapshot.picked_by ?? entry.pick.source ?? null,
    };
  }
  const id = entry.pick.choice;
  const row = roster.choice.find((choice) => choice.id === id);
  const route =
    row?.route ??
    (id.startsWith("luna-") ||
    id.startsWith("terra-") ||
    id.startsWith("sol-") ||
    id.startsWith("astra-")
      ? "codex"
      : "claude");
  const worker = entry.worker;
  const tokens = tokenCounts(route, worker?.usage);
  const claudeCost = worker?.total_cost_usd;
  let billedCost: number | null = null;
  if (typeof claudeCost === "number") billedCost = claudeCost;
  else if (typeof claudeCost === "string" && claudeCost.trim() !== "")
    billedCost = Number(claudeCost);
  return {
    row: id,
    family: id.split("-")[0],
    route,
    model: worker?.model ?? row?.model ?? null,
    effort: worker?.effort ?? row?.effort ?? null,
    outcome: worker?.outcome ?? null,
    exit: entry.exit ?? null,
    elapsed_s: worker?.elapsed_s ?? null,
    tokens,
    cost_usd:
      route === "claude" &&
      typeof billedCost === "number" &&
      Number.isFinite(billedCost)
        ? billedCost
        : null,
    cost_basis: route === "claude" ? "billed" : "unknown: no stats snapshot",
    price: { in: null, cached_in: null, out: null, as_of: null },
    brief_chars: entry.brief?.chars ?? null,
    cwd: entry.cwd ?? null,
    jev_confidence: entry.pick.confidence ?? null,
    picked_by: entry.pick.source ?? null,
  };
}

async function exportRuns(since: string | undefined): Promise<number> {
  let threshold: string | undefined;
  if (since !== undefined) {
    const parsed = await attempt(() => Temporal.Instant.from(since).toString());
    if (!parsed.ok) fatal(`--since must be an ISO instant: ${since}`);
    threshold = parsed.value;
  }
  const roster = await loadRosterOrDie();
  const grades = latestGrades();
  const waivers = latestWaivers();
  const lines = readExportRuns().filter(
    (entry) => threshold === undefined || (entry.started_at ?? "") >= threshold,
  );
  for (const entry of lines) {
    const latest = grades.get(entry.run_id);
    const waived = waivers.get(entry.run_id);
    const flat = {
      ...recoveredStats(entry, roster),
      run_id: entry.run_id,
      started_at: entry.started_at ?? null,
      grade: latest?.grade ?? null,
      confidence: latest?.confidence ?? null,
      ...(waived === undefined ? {} : { waived }),
    };
    process.stdout.write(`${JSON.stringify(flat)}\n`);
  }
  return 0;
}

// --- ask: a typed question to Jev, for any caller ---------------------------------------------------
//
// Ported from driving-jev's jev.ts (retired 2026-10-06; agent-dispatch is the one entry point for
// everything that talks to Jev). The request is validated BEFORE anything is sent. Ask returns Jev's
// probabilities as given and never acts on them: thresholds and abstention stay with the caller.

const StructuredText = z.union([
  z.string(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);
const AskQuestion = z.discriminatedUnion("type", [
  z.looseObject({
    type: z.literal("choice"),
    instructions: StructuredText,
    criteria: z
      .record(z.string(), z.unknown())
      .refine(
        (c) => Object.keys(c).length >= 2 && Object.keys(c).length <= 255,
        {
          message: "choice criteria requires 2..255 options",
        },
      ),
  }),
  z.looseObject({
    type: z.literal("score"),
    instructions: StructuredText,
    criteria: z.array(z.unknown()).min(2).max(10),
  }),
  z.looseObject({
    type: z.literal("noul"),
    instructions: StructuredText,
    criteria: z.record(z.string(), z.unknown()).optional(),
  }),
]);
const AskRequest = z.looseObject({
  state: StructuredText,
  questions: z
    .record(z.string(), AskQuestion)
    .refine((q) => Object.keys(q).length > 0, {
      message: "questions must be a non-empty object",
    }),
});
const AskAnswer = z.looseObject({
  answers: z.record(z.string(), z.unknown()),
});

const ASK_DIAGNOSTIC_CHARS = 2000;

/** The reason on stderr, the exit class as the return value (2 request, 3 auth, 4 retry, 5 provider). */
function askFailure(code: 2 | 3 | 4 | 5, reason: string): number {
  const compact = reason.replaceAll("\n", " ").trim();
  const bounded =
    compact.length <= ASK_DIAGNOSTIC_CHARS
      ? compact
      : `${compact.slice(0, ASK_DIAGNOSTIC_CHARS)} [truncated: ${compact.length} chars]`;
  console.error(`agent-dispatch: ${bounded === "" ? "ask failed" : bounded}`);
  return code;
}

function askStatusExit(status: number): 3 | 4 | 5 {
  if (status === 401 || status === 403) return 3;
  if (status === 429 || status === 529) return 4;
  return 5;
}

async function readAskText(path: string): Promise<string> {
  if (path === "-") {
    if (process.stdin.isTTY)
      fatal("--request - needs piped stdin, not a terminal");
    return Bun.stdin.text();
  }
  if (!existsSync(path)) fatal(`no such request file: ${path}`);
  return Bun.file(path).text();
}

async function ask(requestPath: string): Promise<number> {
  const roster = await loadRosterOrDie();
  const text = await readAskText(requestPath);
  const decoded = jsonText.safeParse(text);
  if (!decoded.success)
    return askFailure(
      2,
      `request is not valid JSON: ${errorLine(decoded.error)}`,
    );
  const checked = AskRequest.safeParse(decoded.data);
  if (!checked.success)
    return askFailure(2, `invalid request: ${errorLine(checked.error)}`);
  // The request is forwarded as the caller wrote it; the model comes from the roster, as for the pick.
  const request: Record<string, unknown> = { ...checked.data };
  if (roster.auto.jev.api === "typesafe") request.model = roster.auto.jev.model;
  const post = await postJev(
    roster.auto.jev.url,
    request,
    roster.auto.timeout_ms,
  );
  const { trace } = post;
  const logAsk = (): void => {
    appendLog({
      kind: "ask",
      at: now(),
      request_sha256: sha256(text),
      questions: Object.keys(checked.data.questions),
      status: post.ok ? post.status : 0,
      latency_ms: trace.latency_ms,
      jev: trace,
    });
  };
  if (!post.ok) {
    logAsk();
    // no HTTP exchange and no transport error = the key was not found: an auth problem, not a retry.
    return askFailure(trace.error === undefined ? 3 : 4, post.reason);
  }
  const parsed = jsonOf(AskAnswer).safeParse(post.text);
  trace.response = parsed.success ? parsed.data : post.text.slice(0, 2000);
  logAsk();
  if (post.status < 200 || post.status >= 300)
    return askFailure(
      askStatusExit(post.status),
      `jev HTTP ${post.status}: ${post.text}`,
    );
  if (!parsed.success)
    return askFailure(
      5,
      `jev response is not JSON with answers: ${post.text.slice(0, 200)}`,
    );
  process.stdout.write(`${JSON.stringify(parsed.data)}\n`);
  return 0;
}

/** The first zod issue as one line: its path and message. */
function errorLine(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return "unknown problem";
  const path = issue.path.map(String).join(".");
  return (
    (path === "" ? "" : `${path}: `) +
    issue.message.replace(/^not valid JSON: /u, "")
  );
}

// --- resume: continue a stopped worker in its own vendor session ----------------------------------
//
// 2026-10-06: about half of one coordinator's workers were killed at their time bound with 80-90% of
// the work done, and every follow-up worker re-read everything from zero. A run record carries the
// vendor's own session id (worker.session); both CLIs resume by it (codex-run --resume → `codex exec
// resume`, run-claude --resume → `claude --resume`). The new run is a run of its own on the original's
// row, sandbox and cwd; Jev picks nothing.

const defaultResumeMessage = (outcome: string, cause: string): string =>
  `You were stopped before you finished (${outcome}: ${cause}). Continue the same task from where you stopped; finish it, run its checks in the foreground, and write your final report.`;

async function resumeCommand(
  id: string,
  promptFile: string | undefined,
  timeoutS: number | undefined,
): Promise<number> {
  const roster = await loadRosterOrDie();
  const runId = resolveRunId(id);
  const logged = readLog().find((l) => l.kind === "run" && l.run_id === runId);
  if (logged === undefined)
    fatal(`no run ${id} in ${LOG_FILE} (agent-dispatch stats lists the log)`);
  const worker = logged.worker;
  const session = worker?.session;
  if (session === undefined || session === "")
    fatal(
      `run ${runId} has no session id (outcome ${worker?.outcome ?? "unknown"}): the vendor never reported one, so there is nothing to resume`,
    );
  const row = roster.choice.find((c) => c.id === logged.pick.choice);
  if (row === undefined)
    fatal(`run ${runId} used '${logged.pick.choice}', no longer a roster row`);
  const cwd = logged.cwd;
  if (cwd === undefined || !existsSync(cwd))
    fatal(`run ${runId}: its directory ${cwd ?? "(not recorded)"} is gone`);
  if (row.route === "claude") {
    const transcript = claudeTranscript(cwd, session);
    if (!existsSync(transcript))
      fatal(
        `run ${runId}: Claude transcript is missing: ${transcript}; dispatch a fresh run with a continuation brief`,
      );
  }
  const sandbox = worker?.sandbox;
  if (sandbox !== "read-only" && sandbox !== "workspace-write")
    fatal(`run ${runId}: its sandbox was not recorded, cannot continue it`);
  const brief = loggedBrief(logged);
  if (brief === undefined) fatal(`run ${runId}: its brief is no longer stored`);
  const parsed = parseTicket(brief);
  if (parsed.kind === "invalid")
    fatal(`run ${runId}: its stored ticket is invalid: ${parsed.reason}`);
  const ticket = parsed.kind === "ticket" ? parsed.ticket : undefined;
  if (promptFile !== undefined && !existsSync(promptFile))
    fatal(`no such message file: ${promptFile}`);
  // the original is the run being continued: its own ungraded record must not block its continuation
  refuseOverUngraded(cwd, ticket?.writes, runId);
  const message =
    promptFile === undefined
      ? defaultResumeMessage(
          worker?.outcome ?? "unknown",
          worker?.cause ?? "cause not recorded",
        )
      : readFileSync(promptFile, "utf8");
  return launch({
    roster,
    flags: {
      promptFile: logged.brief?.path ?? "",
      cd: cwd,
      sandbox,
      choice: "auto",
      label: undefined,
      timeoutS,
    },
    brief,
    ticket,
    pick: {
      source: "resume",
      choice: row.id,
      reason: `continuing session ${session} of ${runId}`,
    },
    label: `resume: ${briefLabel(parsed.prose)}`,
    workerText:
      ticket === undefined ? message : withVerifyLine(message, ticket),
    resume: { from: runId, session },
  });
}

// --- argv -----------------------------------------------------------------------------------------

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__")
    fatal(`unknown option '--${flag}'`);
};
const argv = cli({
  name: "agent-dispatch",
  version: pkg.version,
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: [],
  help: {
    description:
      "Start a worker for a task and report on dispatches. agent-router is an alias for one release.",
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
          description:
            "worker wall clock in seconds (default 1800; --timeout-s)",
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
      name: "doctor",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "route capability status on this host" },
    }),
    command({
      name: "ask",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        request: {
          type: String,
          description:
            'file (or - for stdin) holding {"state": ..., "questions": {"<id>": {type, instructions, criteria}}}',
        },
      },
      help: {
        description:
          "ask Jev typed questions (choice | score | noul); prints its JSON answer. It returns probabilities and never acts on them: thresholds and abstention stay with the caller. Exit 2 bad request (nothing sent), 3 auth/no key, 4 retry later (429/529, timeout, network), 5 other provider failure",
      },
    }),
    command({
      name: "stats",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "pick and outcome statistics from runs.jsonl" },
    }),
    command({
      name: "export",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        since: {
          type: String,
          description: "include runs started at or after this ISO instant",
        },
      },
      help: {
        description:
          "one flat JSON line per run, joined to its latest grade or waiver",
      },
    }),
    command({
      name: "result",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<run_id>"],
      flags: {
        json: {
          type: Boolean,
          description: "print the complete run record as one JSON object",
        },
        brief: {
          type: Boolean,
          description:
            "print the run's stored brief (the full original text, ticket included) instead",
        },
      },
      help: {
        description:
          "show the worker's final report by run_id or unique vendor-session-id prefix",
      },
    }),
    command({
      name: "resume",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<run_id>"],
      flags: {
        promptFile: {
          type: String,
          description:
            "the message the worker gets (default: you were stopped, continue, finish, report)",
        },
        timeoutS: {
          type: String,
          description: "worker wall clock in seconds (default 1800)",
        },
      },
      help: {
        description:
          "continue a stopped run (by run_id or session-id prefix) in its own vendor session: a new run on the same row, sandbox and cwd; the ticket's verify and grade apply again",
      },
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
  // Cleye leaves excess positionals in argv._ (writing-bun-scripts BG1); result and grade take one.
  const positionals =
    argv.command === "grade" ||
    argv.command === "result" ||
    argv.command === "resume"
      ? 1
      : 0;
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
  if (argv.command === "ask") {
    if (argv.flags.request === undefined || argv.flags.request === "")
      fatal("ask needs --request <file|->");
    return ask(argv.flags.request);
  }
  if (argv.command === "ls") return ls();
  if (argv.command === "doctor") return doctor();
  if (argv.command === "stats") return stats();
  if (argv.command === "export") return exportRuns(argv.flags.since);
  if (argv.command === "result")
    return resultCommand(
      argv._.runId,
      argv.flags.json ?? false,
      argv.flags.brief ?? false,
    );
  if (argv.command === "resume") {
    const { promptFile, timeoutS } = argv.flags;
    if (promptFile === "") fatal("a value is required");
    const bound = timeoutS === undefined ? undefined : Number(timeoutS);
    if (bound !== undefined && (!Number.isInteger(bound) || bound <= 0))
      fatal(`not a positive whole number of seconds: ${timeoutS}`);
    return resumeCommand(argv._.runId, promptFile, bound);
  }
  if (argv.command === "grade")
    return gradeCommand(argv._.runId, argv.flags.evidence, argv.flags.waive);
  return undefined;
}

/** A run named by the router's run_id, or by its worker's vendor session id (a unique prefix):
 *  a coordinator names a worker the way its vendor does (owner 2026-10-06). An unknown id is passed
 *  through, so grade / waive say "no run"; a prefix several runs share is refused, naming them. */
function resolveRunId(id: string): string {
  const runs = readLog().filter((l) => l.kind === "run");
  if (id === "" || runs.some((l) => l.run_id === id)) return id;
  const hits = runs.filter((l) => (l.worker?.session ?? "").startsWith(id));
  if (hits.length > 1)
    fatal(
      `${id} matches ${hits.length} runs: ${hits.map((h) => h.run_id ?? "?").join(", ")} — give more of the session id, or the run_id`,
    );
  return hits[0]?.run_id ?? id;
}

/** Why a run's typed report cannot be shown, or undefined when it is valid. */
function reportNoteFor(
  logged: Logged,
  typed: { success: true } | { success: false; error: z.ZodError },
): string | undefined {
  if (typed.success) return undefined;
  if (logged.report !== undefined)
    return `the typed final report is invalid: ${typed.error.issues[0]?.message ?? "wrong shape"}`;
  if (logged.report_error !== undefined)
    return `the typed final report is missing or invalid: ${logged.report_error}`;
  return "no typed final report (this run was recorded before typed reports)";
}

/** Show a completed run's compact receipt header and the worker's own final report. */
function resultCommand(
  id: string,
  asJson: boolean,
  showBrief: boolean,
): number {
  const resolved = resolveRunId(id);
  const logged = readLog().find(
    (l) => l.kind === "run" && l.run_id === resolved,
  );
  if (logged === undefined)
    fatal(`no run ${id} in ${LOG_FILE} (agent-dispatch stats lists the log)`);
  if (showBrief) {
    const text = loggedBrief(logged);
    if (text === undefined) {
      console.error(
        `agent-dispatch: no stored brief for ${logged.run_id ?? id} (briefs/<sha256>.md missing, and the original file is gone)`,
      );
      return 1;
    }
    process.stdout.write(text);
    return 0;
  }
  const worker = logged.worker;
  const outcome = worker?.outcome ?? "unknown";
  const cause = worker?.cause;
  const report = worker?.last_message ?? "";
  const typed = WorkerReport.safeParse(logged.report);
  const reportNote = reportNoteFor(logged, typed);
  if (asJson) {
    process.stdout.write(`${JSON.stringify(logged)}\n`);
    if (reportNote !== undefined)
      console.error(`agent-dispatch: ${reportNote}`);
    if (report.trim() === "" && !typed.success)
      console.error(
        `agent-dispatch: no final report (outcome=${outcome}; cause=${cause ?? "not recorded"})`,
      );
    return report.trim() === "" && !typed.success ? 1 : 0;
  }
  const fields = [
    `row=${logged.pick.choice}`,
    `outcome=${outcome}`,
    `exit=${logged.exit ?? "?"}`,
    `elapsed=${worker?.elapsed_s === undefined ? "?" : `${worker.elapsed_s}s`}`,
    ...(outcome === "ok" ? [] : [`cause=${cause ?? "not recorded"}`]),
    `progress=${JSON.stringify(worker?.progress ?? null)}`,
    `session=${worker?.session ?? "none"}`,
  ];
  process.stdout.write(`${fields.join(" ")}\n`);
  if (typed.success) {
    process.stdout.write(`${renderReport(typed.data)}\n`);
    return 0;
  }
  if (reportNote !== undefined && report.trim() !== "")
    process.stdout.write(
      `${reportNote}; the worker's raw last message follows\n\n`,
    );
  if (report.trim() === "") {
    process.stdout.write(
      `No final report (outcome=${outcome}; cause=${cause ?? "not recorded"})${reportNote === undefined ? "" : `; ${reportNote}`}\n`,
    );
    return 1;
  }
  process.stdout.write(report);
  return 0;
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
  const id = resolveRunId(runId);
  if (why !== undefined) return waive(id, why.trim());
  if (evidence === undefined || evidence === "")
    fatal(
      'grade needs --evidence <file> (the checks you ran on the work), or --waive "<why>"',
    );
  return grade(id, evidence);
}

const result = await attempt(main);
if (!result.ok) fatal(errorMessage(result.error));
if (result.value === undefined) {
  argv.showHelp();
  process.exit(2);
}
process.exit(result.value);
