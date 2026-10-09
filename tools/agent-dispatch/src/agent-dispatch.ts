#!/usr/bin/env bun
// agent-dispatch — the ONE entry point that starts a worker for a task, records why that worker was
// chosen, and shows it as running (statusline `Run:` segment, `agent-dispatch ls`).
// Consumers: the coordinating agent (primary), a human, the statusline. PATH command via
// package.json `bin` (`mise run deps`).
//
// CLI CONTRACT (designing-command-line-interfaces C0–C5)
//   C1  agent-dispatch run  --prompt-file F --cd DIR --sandbox read-only|workspace-write
//                     [--label TEXT]   (--choice is refused: router samples Jev probabilities) [--timeout-s N]
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
//           commands, `verify_timeout_s`, `timeout_s`, `capabilities`. The router then strips it for the worker, runs
//           the verify commands after the worker exits (verify.ts), grades the run itself (graded_by
//           "router", or a recorded waiver); verified runs never gate. A plain brief or ticket with no
//           verify that remains ungraded emits one warning at the next dispatch, then continues. No
//           front matter = plain-run warning behavior.
//   RESUME  a run record carries the vendor session id (worker.session); `resume` starts a NEW run
//           (resumed_from, pick.source "resume") on the original's row, sandbox and cwd, continuing that
//           session (agent-dispatch --resume → `codex exec resume`; run-claude --resume → `claude --resume`,
//           which is why router-dispatched claude sessions are persisted). A run that ends timeout /
//           codex-failed / claude-failed with a session says `agent-dispatch resume <run_id>` in its receipt
//           (resume_with) and on stderr. SIGINT/SIGTERM cleans up the worker group and a running verify
//           group; the router records its own partial report and a waiver.
//   C2  effects  run starts `agent-dispatch --choice <row>` for a codex row or
//                `run-claude.ts` for a Claude row. State lives outside the repo:
//                $XDG_STATE_HOME/agent-router (~/.local/state/agent-router): active/<run_id>.json
//                while running, runs.jsonl forever.
//   C3  channels stdout: exactly one JSON line (run: the agent-dispatch receipt; pick: the pick record;
//                ls/stats: a JSON report). stderr: one line naming the pick and why, then the
//                worker's own liveness lines.
//   C4  outcomes exit = the worker's (0 ok, 1 failed, 3 timeout); 2 refused/usage before any start.
//   AUTO PICK  Jev answers one Choice question over every roster row, codex and claude (criteria =
//              use_for, measured AA/TB4/SciCode, cost multiple, graded record; roster.ts criterionFor).
//              The router masks unavailable, over-budget and unjustified xhigh/max rows, then samples
//              Jev probabilities at the recorded temperature and seed; unusable answers fall back.
//   C5  evolution  receipt and log records carry `schema`; fields are additive.
// Test seams: AGENT_ROUTER_STATE_DIR, DISPATCH_ROSTER_PATH, AGENT_ROUTER_CODEX_WORKER (a fake agent-dispatch).
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomInt } from "node:crypto";
import { homedir, hostname } from "node:os";
import { basename, join, resolve } from "node:path";
import { cli, command } from "cleye";
import pkg from "../package.json" with { type: "json" };
import { fromThrowable } from "neverthrow";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { jsonOf, jsonText, z } from "../../shared/src/zod.ts";
import {
  criterionFor,
  costMultiple,
  loadRoster,
  ROUTING_OBJECTIVE,
  type Choice,
  type Roster,
} from "../../../agents/models/roster.ts";
import { admitCodexWorker, codexWorkerLimit } from "./admission.ts";
import { sampleRow } from "./selection.ts";
import {
  currentHost,
  probeRoutes,
  routeCachePath,
  type Routes,
} from "./routes.ts";
import { dispatchStats } from "./dispatch-stats.ts";
import {
  parseSince,
  replayStats,
  lineageMasks,
  maskCandidates,
  comparableTicketKey,
  throughputStats,
  perRowRecord,
  perTagRecord,
  perKindRecord,
} from "./throughput-stats.ts";
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
  parseReturn,
  renderReport,
  ReturnSchema,
  type TicketGrade,
  withReportInstruction,
  WorkerReport,
} from "./report.ts";
import { floorTicketGrade } from "./ticket-grade.ts";
import { checkPremises } from "./premises.ts";
import {
  GRADE_WORKER_PROMPT,
  mergeTicketGrades,
  parseAgentGrade,
  renderGradeRemand,
  type ParsedAgentGrade,
} from "./grader.ts";
import {
  DEFAULT_TIMEOUT_S,
  EXTENDED_TIMEOUT_THRESHOLD_S,
  MAX_TIMEOUT_S,
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
const IMPORTED_RECORD_FILE = join(STATE_DIR, "imported-record.json");
const ROUTING_RECORD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const ROUTING_RECORD_MIN_RUNS = 3;
const ROUTING_LOG_TAIL_BYTES = 4 * 1024 * 1024;
const RecordExportSchema = z.strictObject({
  schema: z.literal(1),
  host: z.string().min(1),
  exported_at: z.string(),
  window: z.string(),
  per_row: z.record(
    z.string(),
    z.strictObject({
      runs: z.number().int().nonnegative(),
      accepted_returns_per_worker_hour: z.number().nullable(),
      median_time_to_first_return_s: z.number().nullable(),
      accepted_rate: z.number().min(0).max(1),
      timeout_rate: z.number().min(0).max(1),
    }),
  ),
  per_tag: z
    .record(
      z.string(),
      z.record(
        z.string(),
        z.looseObject({
          runs: z.number().int().nonnegative(),
          accepted_returns_per_worker_hour: z.number().nullable(),
          median_time_to_first_return_s: z.number().nullable(),
          accepted_rate: z.number().min(0).max(1),
          timeout_rate: z.number().min(0).max(1),
        }),
      ),
    )
    .optional(),
});
const CODEX_WORKER =
  process.env.AGENT_ROUTER_CODEX_WORKER ??
  join(import.meta.dir, "workers/codex.ts");
const CODEX_PATCH_GUIDANCE =
  "For apply_patch, use at most one operation per file in a call: put all hunks for that file in one Update File block, or split into separate calls. After a tool error, change approach; do not resend the same call. At the declared first_return_s (T), send an interim RETURN by T if you can; never stop running jobs to do so.";
// A claude row runs `claude -p` through tools/agent-dispatch/src/workers/run-claude.ts (test seam: a fake).
const RUN_CLAUDE =
  process.env.AGENT_ROUTER_RUN_CLAUDE ??
  join(import.meta.dir, "workers/run-claude.ts");

let stderrRun: { displayId: string; route?: string } | undefined;
function dispatchError(message: string): void {
  const detail = message.replace(/^agent-dispatch:\s*/u, "");
  if (stderrRun === undefined) {
    console.error(message);
    return;
  }
  const route = stderrRun.route === undefined ? "" : ` ${stderrRun.route}`;
  console.error(`agent-dispatch[${stderrRun.displayId}${route}]: ${detail}`);
}

const displayIdForName = (name: string): string => `agt_${name}`;

const now = (): string => Temporal.Now.instant().toString();
const currentDispatcherSession = (): string | undefined => {
  const id = process.env.CLAUDE_CODE_SESSION_ID?.trim();
  return id === undefined || id === "" ? undefined : id;
};
const epochMilliseconds = (): number =>
  Temporal.Now.instant().epochMilliseconds;
const sha256 = (s: string): string =>
  new Bun.CryptoHasher("sha256").update(s).digest("hex");

interface WritesCheck {
  paths: string[];
  unavailable?: string;
  violations?: string[];
  unattributed?: string[];
}

interface ChangeSnapshot {
  paths: string[];
  hashes: Map<string, string | undefined>;
  unavailable?: string;
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

async function contentHash(
  cwd: string,
  path: string,
): Promise<string | undefined> {
  const read = await attempt(() => readFileSync(join(cwd, path)));
  return read.ok ? sha256(read.value.toString("base64")) : undefined;
}

async function snapshotChanges(cwd: string): Promise<ChangeSnapshot> {
  const listed = await changedPaths(cwd);
  const paths = [
    ...new Set(listed.paths.map((p) => p.replaceAll("\\", "/"))),
  ].filter((p) => !p.split("/").includes("node_modules"));
  return {
    paths,
    hashes: new Map(
      await Promise.all(
        paths.map(
          async (path) => [path, await contentHash(cwd, path)] as const,
        ),
      ),
    ),
    ...(listed.unavailable === undefined
      ? {}
      : { unavailable: listed.unavailable }),
  };
}

function pathMatchesGlobs(path: string, globs: string[]): boolean {
  return globs.some((glob) => new Bun.Glob(glob).match(path));
}

async function checkedWrites(
  cwd: string,
  writes: string[],
  before: ChangeSnapshot,
  siblingWrites: string[][],
): Promise<WritesCheck> {
  if (before.unavailable !== undefined)
    return { paths: [], unavailable: before.unavailable };
  const listed = await changedPaths(cwd);
  if (listed.unavailable !== undefined)
    return { paths: [], unavailable: listed.unavailable };
  const paths = [
    ...new Set([
      ...before.paths,
      ...listed.paths.map((p) => p.replaceAll("\\", "/")),
    ]),
  ].filter((p) => !p.split("/").includes("node_modules"));
  const hashes = await Promise.all(
    paths.map(async (path) => [path, await contentHash(cwd, path)] as const),
  );
  const delta = hashes
    .filter(([path, hash]) => hash !== before.hashes.get(path))
    .map(([path]) => path);
  const violations = delta.filter(
    (path) =>
      !pathMatchesGlobs(path, writes) &&
      !siblingWrites.some((globs) => pathMatchesGlobs(path, globs)),
  );
  const unattributed = delta.filter((path) => !violations.includes(path));
  return {
    paths: delta,
    ...(violations.length === 0 ? {} : { violations }),
    ...(unattributed.length === 0 ? {} : { unattributed }),
  };
}

async function changedSince(
  cwd: string,
  before: ChangeSnapshot,
): Promise<string[]> {
  if (before.unavailable !== undefined) return [];
  const after = await changedPaths(cwd);
  if (after.unavailable !== undefined) return [];
  const paths = [...new Set([...before.paths, ...after.paths])]
    .map((p) => p.replaceAll("\\", "/"))
    .filter((p) => !p.split("/").includes("node_modules"));
  const hashes = await Promise.all(
    paths.map(async (path) => [path, await contentHash(cwd, path)] as const),
  );
  return hashes
    .filter(([path, hash]) => hash !== before.hashes.get(path))
    .map(([path]) => path);
}

type ProcessInfo = { pid: number; ppid: number; pgid: number; cmd: string };

async function processGroup(
  pgid: number,
): Promise<{ processes: ProcessInfo[]; unavailable?: string }> {
  const ps = await runReadOnly(
    ["ps", "-axo", "pid=,ppid=,pgid=,command="],
    process.cwd(),
  );
  if (ps.exitCode !== 0)
    return {
      processes: [],
      unavailable:
        ps.stderr.length > 0 ? ps.stderr : `ps exited ${ps.exitCode}`,
    };
  return {
    processes: ps.stdout.split("\n").flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
      if (match === null || Number(match[3]) !== pgid) return [];
      return [
        {
          pid: Number(match[1]),
          ppid: Number(match[2]),
          pgid,
          cmd: match[4] ?? "",
        },
      ];
    }),
  };
}

async function reapWorkerGroup(pgid: number): Promise<{
  reaped: { pid: number; cmd: string }[];
  left: { pid: number; cmd: string; why: string }[];
}> {
  const listed = await processGroup(pgid);
  const found = listed.processes;
  const runnerOwnsScope = process.env.AGENT_RESOURCE_JOB_ID !== undefined;
  if (listed.unavailable !== undefined) {
    if (runnerOwnsScope)
      return {
        reaped: [],
        left: [
          {
            pid: pgid,
            cmd: "unknown process group",
            why: "agent-resource-run owns this process scope",
          },
        ],
      };
    const term = await attempt(() => process.kill(-pgid, "SIGTERM"));
    if (!term.ok && errorMessage(term.error).includes("ESRCH"))
      return { reaped: [], left: [] };
    const stopped = await waitForGroupExit(pgid, 5_000);
    if (stopped)
      return {
        reaped: [{ pid: pgid, cmd: "unlisted process group member" }],
        left: [],
      };
    const killed = await attempt(() => process.kill(-pgid, "SIGKILL"));
    return killed.ok || errorMessage(killed.error).includes("ESRCH")
      ? {
          reaped: [{ pid: pgid, cmd: "unlisted process group member" }],
          left: [],
        }
      : {
          reaped: [],
          left: [
            {
              pid: pgid,
              cmd: "unknown process group",
              why: `cannot inspect process group: ${listed.unavailable}; signal failed: ${errorMessage(killed.error)}`,
            },
          ],
        };
  }
  if (found.length === 0) return { reaped: [], left: [] };
  const protectedProcesses = found.filter(
    (p) => runnerOwnsScope || p.cmd.includes("agent-resource-run"),
  );
  const targets = found.filter((p) => !protectedProcesses.includes(p));
  if (targets.length > 0) {
    void attempt(() => process.kill(-pgid, "SIGTERM"));
    const deadline = performance.now() + 5_000;
    while (
      performance.now() < deadline &&
      (await processGroup(pgid)).processes.some(
        (p) => !protectedProcesses.some((x) => x.pid === p.pid),
      )
    )
      await Bun.sleep(100);
    const remaining = await processGroup(pgid);
    if (
      remaining.processes.some(
        (p) => !protectedProcesses.some((x) => x.pid === p.pid),
      )
    ) {
      void attempt(() => process.kill(-pgid, "SIGKILL"));
      await Bun.sleep(100);
    }
  }
  const after = await processGroup(pgid);
  const survivors = after.processes.filter(
    (p) => !protectedProcesses.some((x) => x.pid === p.pid),
  );
  return {
    reaped: targets.filter((p) => !survivors.some((x) => x.pid === p.pid)),
    left: [
      ...protectedProcesses.map((p) => ({
        pid: p.pid,
        cmd: p.cmd,
        why: runnerOwnsScope
          ? "agent-resource-run owns this process scope"
          : "agent-resource-run process excluded from teardown",
      })),
      ...survivors.map((p) => ({
        pid: p.pid,
        cmd: p.cmd,
        why: "survived SIGTERM and SIGKILL teardown",
      })),
      ...(after.unavailable === undefined
        ? []
        : [
            {
              pid: pgid,
              cmd: "unknown process group",
              why: `cannot verify teardown: ${after.unavailable}`,
            },
          ]),
    ],
  };
}

async function waitForGroupExit(
  pgid: number,
  graceMs: number,
): Promise<boolean> {
  const deadline = performance.now() + graceMs;
  while (performance.now() < deadline) {
    const probe = await attempt(() => process.kill(-pgid, 0));
    if (!probe.ok && errorMessage(probe.error).includes("ESRCH")) return true;
    await Bun.sleep(100);
  }
  return false;
}

function claudeTranscript(cwd: string, session: string): string {
  const slug = cwd.replaceAll(/[/.]/gu, "-");
  return join(homedir(), ".claude", "projects", slug, `${session}.jsonl`);
}

function fatal(message: string): never {
  dispatchError(`agent-dispatch: ${message}`);
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
  source: "explicit" | "jev" | "default" | "resume" | "override";
  choice: string;
  approval?: string;
  mode?: "sample" | "argmax" | "fallback";
  argmax_row?: string;
  sampled_row?: string;
  temperature?: number;
  seed?: string;
  masked_rows?: { row: string; reason: string }[];
  sampled_probability?: number;
  epsilon?: number;
  pick_fallback_reason?: string;
  reason: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  jev?: JevTrace;
  routes_unavailable?: Partial<Record<"codex" | "claude", string>>;
  default_fallback?: string;
  selection_record_unavailable?: string;
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
      if (process.env.AGENT_ROUTER_CODEX_WORKER !== undefined)
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
    codexLoggedIn: () => {
      if (process.env.AGENT_ROUTER_CODEX_WORKER !== undefined) return true;
      if (codexPath === null) return false;
      return (
        Bun.spawnSync([codexPath, "login", "status"], {
          stdout: "ignore",
          stderr: "ignore",
          timeout: 5_000,
        }).exitCode === 0
      );
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

async function routingCriteria(
  roster: Roster,
  capabilities: string[] = [],
  lineageName?: string,
  writesCount = 0,
  briefChars = 0,
  cwd = process.cwd(),
): Promise<{
  criteria: Record<string, string>;
  masks: Record<string, { failures: number; reason: string }>;
  throughputLines: string[];
  fallback?: string;
  failure?: string;
}> {
  const current = epochMilliseconds();
  const loaded = await attempt(async () => {
    const gradeCounts = gradeTally();
    let complete = "";
    if (existsSync(LOG_FILE)) {
      const size = statSync(LOG_FILE).size;
      const start = Math.max(0, size - ROUTING_LOG_TAIL_BYTES);
      const tail = await Bun.file(LOG_FILE).slice(start, size).text();
      const newline = tail.indexOf("\n");
      if (start > 0) complete = newline < 0 ? "" : tail.slice(newline + 1);
      else complete = tail;
    }
    return {
      throughput: throughputStats(complete, {
        now: current,
        sinceMs: current - ROUTING_RECORD_WINDOW_MS,
        grading: false,
      }),
      tally: gradeCounts,
      log: complete,
      masks: lineageMasks(complete, {
        ...(lineageName === undefined ? {} : { name: lineageName }),
        now: current,
      }),
    };
  });
  if (!loaded.ok)
    return {
      criteria: Object.fromEntries(
        roster.choice.map((choice) => [
          choice.id,
          `${criterionFor(roster, choice)} Recent measured record unavailable.`,
        ]),
      ),
      masks: {},
      throughputLines: [],
      failure: errorMessage(loaded.error).slice(0, 300),
    };
  let imported: z.output<typeof RecordExportSchema> | undefined;
  if (existsSync(IMPORTED_RECORD_FILE)) {
    const read = await attempt(() =>
      readFileSync(IMPORTED_RECORD_FILE, "utf8"),
    );
    const parsed = read.ok
      ? jsonOf(RecordExportSchema).safeParse(read.value)
      : undefined;
    if (parsed?.success === true) imported = parsed.data;
    else
      console.error(
        `agent-dispatch: ignoring unreadable imported record: ${read.ok ? (parsed?.error.issues[0]?.message ?? "invalid shape") : errorMessage(read.error)}`,
      );
  }
  const importedDate = imported?.exported_at.slice(0, 10);
  const { masked, fallback } = maskCandidates(
    roster.choice.map((choice) => choice.id),
    loaded.value.masks,
    loaded.value.throughput.per_row,
  );
  const comparableKey = comparableTicketKey(
    capabilities,
    writesCount,
    briefChars,
  );
  const bestThroughputRow = roster.choice
    .map((choice) => {
      const record =
        loaded.value.throughput.per_comparable_ticket[comparableKey]?.[
          choice.id
        ];
      const medianFirstReturn = record?.median_time_to_first_return_s;
      const throughput =
        record !== undefined &&
        medianFirstReturn !== null &&
        medianFirstReturn !== undefined &&
        medianFirstReturn > 0
          ? (record.accepted_rate * 3600) / medianFirstReturn
          : undefined;
      return { id: choice.id, throughput };
    })
    .filter((row) => row.throughput !== undefined)
    .toSorted((a, b) => (b.throughput ?? 0) - (a.throughput ?? 0))[0]?.id;
  const throughputLines = roster.choice.map((choice) => {
    const local = loaded.value.throughput.per_row[choice.id];
    const importedRow = imported?.per_row[choice.id];
    const row =
      (local?.runs ?? 0) >= ROUTING_RECORD_MIN_RUNS ? local : importedRow;
    let prefix = "";
    if ((local?.runs ?? 0) < ROUTING_RECORD_MIN_RUNS) {
      if (row === undefined) prefix = "UNMEASURED | ";
      else prefix = `imported from ${imported?.host} ${importedDate} | `;
    }
    const firstReturn = row?.median_time_to_first_return_s;
    return `${choice.id} | ${prefix}runs ${row?.runs ?? 0} | accepted/h ${row?.accepted_returns_per_worker_hour?.toFixed(2) ?? "unknown"} | p50 first return ${firstReturn === null || firstReturn === undefined ? "unknown" : `${firstReturn.toFixed(1)}s`} | accepted ${((row?.accepted_rate ?? 0) * 100).toFixed(1)}% | timeout ${((row?.timeout_rate ?? 0) * 100).toFixed(1)}%`;
  });
  const criteria = Object.fromEntries(
    roster.choice
      .filter((choice) => masked[choice.id] === undefined)
      .map((choice) => {
        const local = loaded.value.throughput.per_row[choice.id];
        const localRuns = local?.runs ?? 0;
        const localWins = localRuns >= ROUTING_RECORD_MIN_RUNS;
        const allRow = localWins ? local : imported?.per_row[choice.id];
        const localKind = perKindRecord(
          loaded.value.log,
          choice.id,
          capabilities,
          basename(cwd),
          {
            now: current,
            sinceMs: current - ROUTING_RECORD_WINDOW_MS,
            grading: false,
          },
        );
        const importedKind = capabilities
          .map((tag) => imported?.per_tag?.[tag]?.[choice.id])
          .find((record) => record !== undefined);
        const kind =
          (localKind?.runs ?? 0) >= ROUTING_RECORD_MIN_RUNS
            ? localKind
            : (importedKind ?? localKind);
        const globalMedian = allRow?.median_time_to_first_return_s;
        const globalLine = `all tickets: runs ${allRow?.runs ?? 0} | accepted/h ${allRow?.accepted_returns_per_worker_hour?.toFixed(2) ?? "unknown"} | p50 first return ${globalMedian === null || globalMedian === undefined ? "unknown" : `${globalMedian.toFixed(1)}s`} | accepted ${((allRow?.accepted_rate ?? 0) * 100).toFixed(1)}% | timeout ${((allRow?.timeout_rate ?? 0) * 100).toFixed(1)}%`;
        const comparableRecord =
          loaded.value.throughput.per_comparable_ticket[comparableKey]?.[
            choice.id
          ];
        const comparableMedian =
          comparableRecord?.median_time_to_first_return_s;
        const throughput =
          comparableRecord !== undefined &&
          comparableMedian !== null &&
          comparableMedian !== undefined &&
          comparableMedian > 0
            ? (comparableRecord.accepted_rate * 3600) / comparableMedian
            : undefined;
        const comparableLine = `Comparable-ticket tradeoff: n=${comparableRecord?.runs ?? 0}; expected accepted-returns-per-hour=${throughput?.toFixed(2) ?? "unknown"}`;
        const provenance =
          !localWins && allRow !== undefined
            ? `imported from ${imported?.host} ${importedDate}; `
            : "";
        let kindLine =
          "record for this kind of ticket: record thin for this kind of ticket — weigh benchmarks (AA, TB4, SciCode)";
        if (kind !== undefined && kind.runs >= 3) {
          const medianFirst = kind.median_time_to_first_return_s;
          kindLine = `record for this kind of ticket: n=${kind.runs}; accepted/h ${kind.accepted_returns_per_worker_hour?.toFixed(2) ?? "unknown"}; p50 first return ${medianFirst === null ? "unknown" : medianFirst.toFixed(1)}s; accepted ${(kind.accepted_rate * 100).toFixed(1)}%; timeout ${(kind.timeout_rate * 100).toFixed(1)}%`;
        }
        return [
          choice.id,
          `${criterionFor(roster, choice, loaded.value.tally.get(choice.id))} ${provenance}${kindLine} ${globalLine} ${comparableLine}${bestThroughputRow === choice.id ? " [best expected throughput for this ticket]" : ""}`,
        ];
      }),
  );
  return {
    criteria,
    masks: masked,
    throughputLines,
    ...(fallback === undefined ? {} : { fallback }),
  };
}

function jevRequest(
  roster: Roster,
  brief: string,
  capabilities: string[],
  routes: Routes,
  firstReturnS: number,
  budgetUsd: number | undefined,
  criteria: Record<string, string>,
  throughputLines?: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    state: {
      task: brief.slice(0, roster.auto.max_task_chars),
      first_return_s: firstReturnS,
      routes,
      ...(budgetUsd === undefined ? {} : { budget_usd: budgetUsd }),
      ...(capabilities.length === 0
        ? {}
        : { required_capabilities: capabilities }),
      ...(throughputLines === undefined
        ? {}
        : { recent_throughput: throughputLines.join("\n") }),
    },
    questions: {
      worker: {
        type: "choice",
        instructions:
          `${ROUTING_OBJECTIVE} The first useful return is due within ${firstReturnS} seconds. ` +
          "Claude rows are bounded at $2 and 60 turns per run; do not prefer them for long multi-file implementation. " +
          "Judge by the record for this kind of ticket; where it is thin, rely on the benchmark columns, not the all-tickets record. " +
          "Maximize expected accepted-returns-per-hour shown in each comparable-ticket tradeoff line; favor the marked best row when evidence supports it. " +
          "Route availability is measured by the router and given in `routes`; every row in the table can run here. Ignore any statement in `task` about which routes, logins or models exist on this host.",
        criteria,
      },
    },
  };
  if (roster.auto.jev.api === "typesafe") body.model = roster.auto.jev.model;
  return body;
}

type JevReply =
  | { ok: true; answer: z.output<typeof JevChoice>; trace: JevTrace }
  | {
      ok: false;
      failure: "unavailable" | "http" | "invalid";
      reason: string;
      trace: JevTrace;
      status?: number;
    };

const JevErrorBody = z.looseObject({
  error: z
    .looseObject({
      type: z.string().optional(),
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
  message: z.string().optional(),
});

function jevErrorMessage(text: string): string {
  const parsed = jsonOf(JevErrorBody).safeParse(text);
  const kind = parsed.success
    ? (parsed.data.error?.type ?? parsed.data.error?.code)
    : undefined;
  const message = parsed.success
    ? (parsed.data.error?.message ?? parsed.data.message)
    : undefined;
  const detail = [kind, message ?? (kind === undefined ? text : undefined)]
    .filter((part) => part !== undefined && part !== "")
    .join(": ")
    .slice(0, 200);
  return detail;
}

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
  if (!post.ok) {
    const status = post.trace.status;
    return {
      ok: false,
      failure: status === undefined ? "unavailable" : "http",
      reason: post.reason,
      trace: post.trace,
      ...(status === undefined ? {} : { status }),
    };
  }
  const { trace } = post;
  if (post.status !== 200) {
    const detail = jevErrorMessage(post.text);
    trace.response = detail;
    return {
      ok: false,
      failure: "http",
      reason: `jev HTTP ${post.status}${detail === "" ? "" : ` ${detail}`}`,
      status: post.status,
      trace,
    };
  }
  const parsed = jsonOf(JevAnswer).safeParse(post.text);
  trace.response = parsed.success ? parsed.data : post.text.slice(0, 200);
  const answer = parsed.success ? parsed.data.answers[question] : undefined;
  if (answer === undefined)
    return {
      ok: false,
      failure: "invalid",
      reason: "jev answer did not parse",
      trace,
    };
  return { ok: true, answer, trace };
}

async function askJev(
  roster: Roster,
  brief: string,
  capabilities: string[],
  routes: Routes,
  firstReturnS: number,
  budgetUsd: number | undefined,
  criteria: Record<string, string>,
  throughputLines: string[] | undefined,
  temperature: number,
  seed: string,
  hardMasks: ReadonlySet<string> = new Set(),
  hardMaskReasons: ReadonlyMap<string, string> = new Map(),
): Promise<Pick> {
  const fallback = (reason: string, jev?: JevTrace): Pick => ({
    source: "default",
    choice: roster.default,
    reason,
    mode: "fallback",
    argmax_row: roster.default,
    sampled_row: roster.default,
    temperature,
    seed,
    masked_rows: [...hardMasks].map((row) => ({
      row,
      reason: hardMaskReasons.get(row) ?? "stall escalation",
    })),
    sampled_probability: 0,
    pick_fallback_reason: reason,
    ...(jev === undefined ? {} : { jev }),
  });
  const reply = await askJevChoice(
    roster,
    jevRequest(
      roster,
      brief,
      capabilities,
      routes,
      firstReturnS,
      budgetUsd,
      criteria,
      throughputLines,
    ),
    "worker",
  );
  if (!reply.ok) return fallback(reply.reason, reply.trace);
  return judge(roster, reply.answer, reply.trace, {
    temperature,
    seed,
    budgetUsd,
    capabilities,
    hardMasks,
    hardMaskReasons,
  });
}

function judge(
  roster: Roster,
  answer: {
    choice: string;
    probabilities?: Record<string, number> | undefined;
    confidence?: number | undefined;
  },
  trace: JevTrace,
  options: {
    temperature: number;
    seed: string;
    budgetUsd?: number | undefined;
    capabilities: string[];
    hardMasks?: ReadonlySet<string>;
    hardMaskReasons?: ReadonlyMap<string, string>;
  },
): Pick {
  const maskedRows: { row: string; reason: string }[] = [
    ...(options.hardMasks ?? []),
  ].map((row) => ({
    row,
    reason:
      options.hardMaskReasons?.get(row) ??
      "stalled row or same family at lower/equal effort",
  }));
  const mass = new Map<string, number>();
  const priced = roster.choice.flatMap((c) =>
    c.price_in === undefined || c.price_out === undefined
      ? []
      : [c.price_in + c.price_out],
  );
  const cheapest = priced.length === 0 ? undefined : Math.min(...priced);
  for (const [id, probability] of Object.entries(answer.probabilities ?? {})) {
    if (options.hardMasks?.has(id) === true) continue;
    const candidate = roster.choice.find((c) => c.id === id);
    let reason: string | undefined;
    if (candidate === undefined)
      reason = "unavailable route or not a roster row";
    else if (!Number.isFinite(probability) || probability < 0)
      reason = "probability is invalid";
    else if (
      candidate.route === "codex" &&
      process.env.AGENT_ROUTER_TEST_CODEX_ROUTE === "unavailable"
    )
      reason = "route unavailable";
    else if (
      candidate.route === "claude" &&
      process.env.AGENT_ROUTER_TEST_CLAUDE_ROUTE === "unavailable"
    )
      reason = "route unavailable";
    else if (
      options.budgetUsd !== undefined &&
      cheapest !== undefined &&
      candidate.price_in !== undefined &&
      candidate.price_out !== undefined &&
      ((candidate.price_in + candidate.price_out) / cheapest) * 0.01 >
        options.budgetUsd
    )
      reason = "exceeds ticket budget";
    else if (
      candidate !== undefined &&
      ["xhigh", "max"].includes(candidate.effort) &&
      options.capabilities.length === 0
    )
      reason = "xhigh/max lacks a justifying capability";
    if (reason !== undefined) maskedRows.push({ row: id, reason });
    else if (candidate !== undefined) mass.set(id, probability);
  }
  const totalMass = [...mass.values()].reduce((sum, p) => sum + p, 0);
  if (answer.probabilities === undefined || totalMass === 0) {
    const why =
      answer.probabilities === undefined
        ? "no probabilities"
        : "zero mass after masking";
    const row = roster.choice.find(
      (c) => c.id === answer.choice && options.hardMasks?.has(c.id) !== true,
    );
    const fallbackRow = row?.id ?? roster.default;
    const invalidChoiceReason =
      row === undefined
        ? `; Jev choice '${answer.choice}' is unavailable, using default`
        : "";
    return {
      source: row === undefined ? "default" : "jev",
      choice: fallbackRow,
      reason: `fallback to ${row === undefined ? "default" : "Jev choice"}: ${why}${invalidChoiceReason}`,
      mode: "fallback",
      argmax_row: fallbackRow,
      sampled_row: fallbackRow,
      temperature: options.temperature,
      seed: options.seed,
      masked_rows: maskedRows,
      sampled_probability: answer.probabilities?.[fallbackRow] ?? 0,
      pick_fallback_reason: `${why}${invalidChoiceReason}`,
      ...(answer.confidence === undefined
        ? {}
        : { confidence: answer.confidence }),
      ...(answer.probabilities === undefined
        ? {}
        : { probabilities: answer.probabilities }),
      jev: trace,
    };
  }
  const sample = sampleRow(
    Object.fromEntries(mass),
    options.temperature,
    options.seed,
  );
  if (sample === undefined) {
    const row = roster.choice.find(
      (candidate) => candidate.id === answer.choice,
    );
    const fallbackRow = row?.id ?? roster.default;
    const reason = "zero mass after masking";
    return {
      source: row === undefined ? "default" : "jev",
      choice: fallbackRow,
      reason: `fallback to ${row === undefined ? "default" : "Jev choice"}: ${reason}`,
      mode: "fallback",
      argmax_row: fallbackRow,
      sampled_row: fallbackRow,
      temperature: options.temperature,
      seed: options.seed,
      masked_rows: maskedRows,
      sampled_probability: 0,
      pick_fallback_reason: reason,
      ...(answer.confidence === undefined
        ? {}
        : { confidence: answer.confidence }),
      ...(answer.probabilities === undefined
        ? {}
        : { probabilities: answer.probabilities }),
      jev: trace,
    };
  }
  const sampledProbability = sample.probability;
  return {
    source: "jev",
    choice: sample.row,
    mode: sample.mode,
    argmax_row: sample.argmaxRow,
    sampled_row: sample.row,
    temperature: options.temperature,
    seed: options.seed,
    masked_rows: maskedRows,
    sampled_probability: sampledProbability,
    epsilon: sample.epsilon,
    reason: `${sample.row} (sampled p=${sampledProbability.toFixed(2)} from jev; argmax ${sample.argmaxRow})`,
    ...(answer.confidence === undefined
      ? {}
      : { confidence: answer.confidence }),
    ...(answer.probabilities === undefined
      ? {}
      : { probabilities: answer.probabilities }),
    jev: trace,
  };
}

const rowFamily = (id: string): string => id.slice(0, id.lastIndexOf("-"));

async function pickFor(
  roster: Roster,
  brief: string,
  cwd: string,
  capabilities: string[] = [],
  firstReturnS = 360,
  budgetUsd?: number,
  temperatureOverride?: number,
  seedOverride?: string,
  lineageName?: string,
  writesCount = 0,
  stalledRow?: Choice,
  timeoutS?: number,
): Promise<Pick> {
  const routes = hostRoutes();
  const available = availableRoster(roster, routes);
  const effortOrder = ["low", "medium", "high", "xhigh", "max"];
  const hardMasks = new Set(
    roster.choice
      .filter(
        (row) =>
          stalledRow !== undefined &&
          (row.id === stalledRow.id ||
            (rowFamily(row.id) === rowFamily(stalledRow.id) &&
              effortOrder.indexOf(row.effort) <=
                effortOrder.indexOf(stalledRow.effort))),
      )
      .map((row) => row.id),
  );
  const hardMaskReasons = new Map<string, string>(
    [...hardMasks].map((row) => [row, "stall escalation"]),
  );
  let claudeReason: string | undefined;
  if (
    capabilities.some((tag) =>
      /long[- ]tool[- ]loop|long[- ]terminal|multi[- ]file|refactor across|device refactor/iu.test(
        tag,
      ),
    )
  )
    claudeReason =
      "capability requires a long tool loop, long terminal task, multi-file work, or device refactor";
  else if (writesCount >= 5)
    claudeReason = "ticket declares 5 or more write globs";
  else if (timeoutS !== undefined && timeoutS > 600)
    claudeReason = "ticket timeout_s exceeds 600 seconds";
  if (claudeReason !== undefined) {
    for (const row of roster.choice.filter(
      (candidate) => candidate.route === "claude",
    )) {
      hardMasks.add(row.id);
      hardMaskReasons.set(
        row.id,
        `claude row bound ($2, 60 turns) cannot fit this ticket: ${claudeReason}`,
      );
    }
  }
  const eligible = available.roster.choice.filter(
    (row) => !hardMasks.has(row.id),
  );
  if (eligible.length === 0) {
    return {
      source: "default",
      choice: roster.default,
      reason: "all available rows are masked; falling back to roster default",
      mode: "fallback",
      argmax_row: roster.default,
      sampled_row: roster.default,
      temperature: temperatureOverride ?? roster.auto.pick_temperature,
      seed: seedOverride ?? "all-masked",
      masked_rows: [...hardMasks].map((row) => ({
        row,
        reason: hardMaskReasons.get(row)!,
      })),
      sampled_probability: 0,
      pick_fallback_reason: "all available rows are masked",
    };
  }
  if (hardMasks.has(available.roster.default))
    available.roster = { ...available.roster, default: eligible[0]!.id };
  const blocked = underNoEgress(cwd, roster.auto.no_egress);
  if (blocked !== undefined)
    return {
      source: "default",
      choice: available.roster.default,
      reason: `cwd is under no_egress '${blocked}'; the brief stays on this machine`,
      mode: "fallback",
      argmax_row: available.roster.default,
      sampled_row: available.roster.default,
      temperature: temperatureOverride ?? roster.auto.pick_temperature,
      seed:
        seedOverride ??
        createHash("sha256")
          .update(`${process.env.AGENT_ROUTER_RUN_ID ?? "pick"}:${brief}`)
          .digest("hex")
          .slice(0, 16),
      masked_rows: [...hardMasks].map((row) => ({
        row,
        reason: hardMaskReasons.get(row) ?? "stall escalation",
      })),
      sampled_probability: 0,
      pick_fallback_reason: "cwd under no_egress",
      ...(Object.keys(available.unavailable).length === 0
        ? {}
        : { routes_unavailable: available.unavailable }),
      ...(available.fallback === undefined
        ? {}
        : {
            default_fallback: `default route unavailable; using cheapest available row ${available.fallback}`,
          }),
    };
  const routing = await routingCriteria(
    available.roster,
    capabilities,
    lineageName,
    writesCount,
    brief.length,
    cwd,
  );
  const candidates = available.roster.choice.filter(
    (row) => routing.masks[row.id] === undefined,
  );
  let routedRoster = available.roster;
  if (candidates.length > 0) {
    const defaultRow =
      candidates.find((row) => row.id === available.roster.default) ??
      candidates.find((row) => !hardMasks.has(row.id)) ??
      eligible[0]!;
    routedRoster = {
      ...available.roster,
      choice: candidates,
      default: defaultRow.id,
    };
  }
  let requestRoster = routedRoster;
  if (routing.fallback !== undefined && !hardMasks.has(routing.fallback))
    requestRoster = {
      ...routedRoster,
      choice: routedRoster.choice.filter((row) => row.id === routing.fallback),
      default: routing.fallback,
    };
  const pick = await askJev(
    requestRoster,
    brief,
    capabilities,
    routes,
    firstReturnS,
    budgetUsd,
    Object.fromEntries(
      Object.entries(routing.criteria).filter(([id]) =>
        requestRoster.choice.some((row) => row.id === id),
      ),
    ),
    routing.throughputLines,
    temperatureOverride ?? roster.auto.pick_temperature,
    seedOverride ??
      createHash("sha256")
        .update(`${process.env.AGENT_ROUTER_RUN_ID ?? "pick"}:${brief}`)
        .digest("hex")
        .slice(0, 16),
    hardMasks,
    hardMaskReasons,
  );
  if (routing.failure !== undefined)
    dispatchError(
      `recent throughput log unavailable; continuing pick: ${routing.failure}`,
    );
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
  const allMaskedFallback =
    routing.fallback === undefined
      ? {}
      : { all_masked_fallback: routing.fallback };
  const lineageMaskField =
    Object.keys(routing.masks).length === 0 && routing.fallback === undefined
      ? {}
      : {
          lineage_mask: {
            masked: routing.masks,
            ...allMaskedFallback,
          },
        };
  return {
    ...pick,
    ...(Object.keys(available.unavailable).length === 0
      ? {}
      : { routes_unavailable: available.unavailable }),
    ...(pick.masked_rows === undefined
      ? {}
      : {
          masked_rows: pick.masked_rows.map((masked) => {
            const row = roster.choice.find(
              (choice) => choice.id === masked.row,
            );
            if (row === undefined) return masked;
            const routeReason = available.unavailable[row.route];
            if (routeReason === undefined) return masked;
            masked.reason = `route unavailable: ${routeReason}`;
            return masked;
          }),
        }),
    ...(routing.failure === undefined
      ? {}
      : { selection_record_unavailable: routing.failure }),
    ...lineageMaskField,
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

const validDisplayName = (name: string): boolean =>
  /^[A-Za-z0-9_-]{1,16}$/u.test(name);

const normalizeDisplayName = (name: string): string =>
  name.replaceAll("-", "_");

function chooseDisplayId(name: string | undefined): string {
  if (name !== undefined && !validDisplayName(name))
    fatal(
      `invalid --name/name '${name}': expected 1..16 characters from [A-Za-z0-9_-]`,
    );
  const live = readActive().filter((entry) => entry.alive);
  if (name !== undefined) {
    const normalizedName = normalizeDisplayName(name);
    const displayId = displayIdForName(normalizedName);
    stderrRun = { displayId };
    if (normalizedName !== name)
      console.error(
        `agent-dispatch: normalized worker name '${name}' to '${normalizedName}'`,
      );
    const holder = live.find((entry) => entry.active.display_id === displayId);
    if (holder !== undefined)
      fatal(
        `display id ${displayId} is held by live run ${holder.active.run_id}`,
      );
    return displayId;
  }
  for (;;) {
    const suffix = randomInt(36 ** 4)
      .toString(36)
      .padStart(4, "0");
    const displayId = displayIdForName(suffix);
    if (!live.some((entry) => entry.active.display_id === displayId)) {
      stderrRun = { displayId };
      return displayId;
    }
  }
}

function overlappingWriterScopes(
  runId: string,
  cwd: string,
  startedAt: string,
  endedAt: string,
): string[][] {
  const intervals = readLog()
    .filter(
      (entry) =>
        entry.kind === "run" && entry.run_id !== runId && entry.cwd === cwd,
    )
    .flatMap((entry) => {
      const writes = entry.ticket?.writes;
      const start = entry.started_at;
      const end = entry.ended_at;
      return writes !== undefined &&
        start !== undefined &&
        end !== undefined &&
        start <= endedAt &&
        end >= startedAt
        ? [writes]
        : [];
    });
  const live = readActive()
    .filter(({ active }) => active.run_id !== runId && active.cwd === cwd)
    .flatMap(({ active }) =>
      active.ticket?.writes === undefined ? [] : [active.ticket.writes],
    );
  return [...intervals, ...live];
}

// --- run ------------------------------------------------------------------------------------------

const WorkerReceipt = z.looseObject({ outcome: z.string().optional() });

interface RunFlags {
  promptFile: string;
  cd: string;
  sandbox: string;
  choice: string;
  row: string | undefined;
  approval: string | undefined;
  label: string | undefined;
  name: string | undefined;
  timeoutS: number | undefined;
  timeoutReason: string | undefined;
  noGrader: boolean;
  legacyBrief: string | undefined;
  pickTemperature?: number | undefined;
  pickSeed?: string | undefined;
  runId?: string;
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
  if (process.env.AGENT_ROUTER_CODEX_WORKER !== undefined) return; // test seam: a fake agent-dispatch
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

/** The worker command for a row: agent-dispatch for codex, run-claude for claude. */
function workerArgs(
  roster: Roster,
  row: Choice,
  flags: RunFlags,
  progress: string,
  runId: string,
  resume: string | undefined,
): string[] {
  if (row.route === "codex")
    return [
      CODEX_WORKER,
      "--choice",
      row.id,
      "--sandbox",
      flags.sandbox,
      "--cd",
      flags.cd,
      "--prompt-file",
      flags.promptFile,
      "--run-id",
      runId,
      "--receipt-dir",
      join(STATE_DIR, "worker-receipts"),
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
    String((flags.timeoutS ?? DEFAULT_TIMEOUT_S) * 1000),
    "--progress-file",
    progress,
    // router-dispatched claude sessions stay on disk so `agent-dispatch resume` can continue them
    "--persist-session",
    ...(resume === undefined ? [] : ["--resume", resume]),
  ];
}

const GRADER_TIMEOUT_S = 90;
const GRADER_TIMEOUT_MS = (() => {
  const testOverride = Number(
    process.env.AGENT_DISPATCH_TEST_GRADER_TIMEOUT_MS ?? "",
  );
  return Number.isInteger(testOverride) && testOverride > 0
    ? Math.min(testOverride, GRADER_TIMEOUT_S * 1000)
    : GRADER_TIMEOUT_S * 1000;
})();

type GraderUsage = NonNullable<TicketGrade["grader"]>["usage"];

function graderUsage(
  row: Choice,
  worker: Record<string, unknown>,
): GraderUsage {
  const rawUsage = z
    .looseObject({
      input_tokens: z.number().optional(),
      cached_input_tokens: z.number().optional(),
      output_tokens: z.number().optional(),
      reasoning_output_tokens: z.number().optional(),
      cache_read_input_tokens: z.number().optional(),
      cache_creation_input_tokens: z.number().optional(),
    })
    .safeParse(worker.usage);
  const normalized: {
    input_tokens?: number;
    cached_input_tokens?: number;
    output_tokens?: number;
    reasoning_output_tokens?: number;
  } = {};
  if (rawUsage.success) {
    const usage = rawUsage.data;
    let cachedInput = usage.cached_input_tokens;
    if (
      cachedInput === undefined &&
      usage.cache_read_input_tokens !== undefined &&
      usage.cache_creation_input_tokens !== undefined
    )
      cachedInput =
        usage.cache_read_input_tokens + usage.cache_creation_input_tokens;
    if (usage.input_tokens !== undefined)
      normalized.input_tokens = usage.input_tokens;
    if (cachedInput !== undefined) normalized.cached_input_tokens = cachedInput;
    if (usage.output_tokens !== undefined)
      normalized.output_tokens = usage.output_tokens;
    if (usage.reasoning_output_tokens !== undefined)
      normalized.reasoning_output_tokens = usage.reasoning_output_tokens;
  }
  let cost: number | null = null;
  if (row.route === "claude") {
    const amount = worker.total_cost_usd;
    if (typeof amount === "number") cost = amount;
    else if (typeof amount === "string" && amount.trim() !== "")
      cost = Number(amount);
    if (cost !== null && !Number.isFinite(cost)) cost = null;
  } else if (
    row.price_in !== undefined &&
    row.price_out !== undefined &&
    normalized.input_tokens !== undefined &&
    normalized.output_tokens !== undefined
  ) {
    const input = normalized.input_tokens;
    const cached = normalized.cached_input_tokens ?? 0;
    const cachedPrice = row.price_cached_in ?? row.price_in;
    cost =
      ((input - cached) * row.price_in +
        cached * cachedPrice +
        ((normalized.output_tokens ?? 0) +
          (normalized.reasoning_output_tokens ?? 0)) *
          row.price_out) /
      1_000_000;
  }
  return {
    ...normalized,
    cost_usd: cost,
  };
}

/** Dispatch a read-only grader as a child of the parent run, without creating a run record. */
async function gradeWithWorker(
  roster: Roster,
  brief: string,
  cwd: string,
  parentRunId: string,
): Promise<{
  grade: ReturnType<typeof parseAgentGrade>;
  record: NonNullable<TicketGrade["grader"]>;
}> {
  const prompt = GRADE_WORKER_PROMPT(brief);
  const pick = await pickFor(roster, prompt, cwd, [], GRADER_TIMEOUT_S);
  const row = refuseUnrunnable(roster, pick.choice);
  const graderDir = join(STATE_DIR, "grader");
  mkdirSync(graderDir, { recursive: true });
  const workerBrief = join(graderDir, `${parentRunId}.md`);
  const progress = join(graderDir, `${parentRunId}.progress.json`);
  writeFileSync(workerBrief, prompt);
  const runId = `${parentRunId}-grader`;
  const args = workerArgs(
    roster,
    row,
    {
      promptFile: workerBrief,
      cd: cwd,
      sandbox: "read-only",
      choice: "auto",
      row: undefined,
      approval: undefined,
      label: "ticket grader",
      name: undefined,
      timeoutS: GRADER_TIMEOUT_S,
      timeoutReason: undefined,
      noGrader: true,
      legacyBrief: undefined,
    },
    progress,
    runId,
    undefined,
  );
  const signal = AbortSignal.timeout(GRADER_TIMEOUT_MS);
  const started = performance.now();
  const child = Bun.spawn([process.execPath, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, AGENT_DISPATCH_CODEX_PROGRESS_FILE: progress },
    detached: true,
    signal,
    killSignal: "SIGTERM",
  });
  const stopGroup = (): void => {
    void attempt(() => process.kill(-child.pid, "SIGTERM"));
  };
  signal.addEventListener("abort", stopGroup, { once: true });
  const [stdout, stderr, exitCode] = await Promise.all([
    child.stdout === null
      ? Promise.resolve("")
      : new Response(child.stdout).text(),
    child.stderr === null
      ? Promise.resolve("")
      : new Response(child.stderr).text(),
    child.exited,
  ]);
  signal.removeEventListener("abort", stopGroup);
  if (signal.aborted) stopGroup();
  await reapWorkerGroup(child.pid);
  const elapsed = Math.round((performance.now() - started) / 100) / 10;
  const decoded = jsonText.safeParse(stdout.trim());
  const worker = decoded.success
    ? z
        .looseObject({
          outcome: z.string().optional(),
          exit_code: z.number().optional(),
          last_message: z.string().optional(),
          result: z.string().optional(),
          usage: z.unknown().optional(),
          total_cost_usd: z.unknown().optional(),
          elapsed_s: z.number().optional(),
          cause: z.string().optional(),
          error: z.string().optional(),
        })
        .safeParse(decoded.data)
    : undefined;
  let failureReason = "no worker receipt";
  if (worker?.success === true)
    failureReason =
      worker.data.cause ?? worker.data.error ?? "no grader response";
  else {
    const stderrText = stderr.trim();
    if (stderrText.length > 0) failureReason = stderrText;
  }
  const workerSucceeded = worker?.success === true;
  let parsed: ParsedAgentGrade;
  if (
    !signal.aborted &&
    exitCode === 0 &&
    workerSucceeded &&
    worker.data.outcome !== "timeout" &&
    worker.data.exit_code !== 124
  ) {
    parsed = parseAgentGrade(
      worker.data.last_message ?? worker.data.result ?? "",
      brief,
    );
  } else if (signal.aborted) {
    parsed = {
      valid: false,
      reason: `grader timed out after ${GRADER_TIMEOUT_MS / 1000} seconds`,
    };
  } else {
    parsed = {
      valid: false,
      reason: `grader worker failed (exit ${exitCode}): ${failureReason.slice(0, 300)}`,
    };
  }
  const record = {
    status: parsed.valid ? ("ok" as const) : ("failed" as const),
    ...(parsed.valid ? {} : { reason: parsed.reason }),
    pick,
    row: {
      id: row.id,
      route: row.route,
      model: row.model,
      effort: row.effort,
    },
    elapsed_s: workerSucceeded ? (worker.data.elapsed_s ?? elapsed) : elapsed,
    ...(workerSucceeded ? { usage: graderUsage(row, worker.data) } : {}),
  } satisfies NonNullable<TicketGrade["grader"]>;
  rmSync(workerBrief, { force: true });
  rmSync(progress, { force: true });
  return { grade: parsed, record };
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
  graderCostUsd: number | null = null,
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
  const combinedCost =
    costUsd === null || graderCostUsd === null
      ? costUsd
      : costUsd + graderCostUsd;
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
    cost_usd: combinedCost,
    grader_cost_usd: graderCostUsd,
    cost_basis:
      graderCostUsd === null
        ? costBasis
        : `${costBasis} + grader billed/list price`,
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
  const overrideRow =
    flags.row === undefined ? undefined : refuseUnrunnable(roster, flags.row);
  if (overrideRow !== undefined && (flags.approval ?? "").trim() === "")
    fatal("--row requires a non-empty --approval");
  if (overrideRow === undefined && flags.approval !== undefined)
    fatal("--approval requires --row <id>");
  // Owner 2026-10-06 「jev routingに一元化しろ、何度目だ」: the coordinator kept naming rows itself.
  // A wrong pick is fixed where Jev reads, the brief or the row use_for, never by overriding Jev.
  if (flags.choice !== "auto" && overrideRow === undefined)
    fatal(
      `--choice ${flags.choice} refused: Jev alone picks the row. If Jev picks wrong, say more in the brief (scope, files, risk) or fix that row use_for in agents/models/dispatch-roster.toml; for an owner-approved override, use --row <id> --approval "<owner approval>"`,
    );
  const brief = readFileSync(flags.promptFile, "utf8");
  const parsed = parseTicket(brief);
  if (parsed.kind === "invalid")
    fatal(`invalid ticket in ${flags.promptFile}: ${parsed.reason}`);
  const ticket = parsed.kind === "ticket" ? parsed.ticket : undefined;
  const displayId = chooseDisplayId(flags.name ?? ticket?.name);
  stderrRun = { displayId };
  if (flags.legacyBrief !== undefined && ticket?.schema === 2)
    fatal("--legacy-brief applies only to plain briefs and schema 1 tickets");
  const premiseCheck = checkPremises(ticket?.premises, resolve(flags.cd));
  if (premiseCheck.status === "missing") {
    const violations = premiseCheck.premises.map((premise) => ({
      rule: "premise",
      quote_from_brief: premise,
      why_it_blocks_a_6min_first_return: `The declared premise ${premise} could not be found in the --cd tree.`,
      fix: "correct the brief's premise or remove it",
    }));
    const ticketGrade: TicketGrade = {
      verdict: "clarify",
      source: "floor",
      violations,
    };
    for (const violation of violations)
      dispatchError(
        `agent-dispatch: remand premise: ${violation.quote_from_brief} is absent. Fix: ${violation.fix}`,
      );
    appendLog({
      kind: "refusal",
      at: now(),
      cwd: resolve(flags.cd),
      dispatcher_session: currentDispatcherSession(),
      brief: {
        path: resolve(flags.promptFile),
        sha256: sha256(brief),
        chars: brief.length,
      },
      ticket_grade: ticketGrade,
    });
    return 2;
  }
  if (ticket === undefined || ticket.verify.length === 0)
    warnOverUngraded(resolve(flags.cd));
  const pick: Pick =
    overrideRow === undefined
      ? await pickFor(
          roster,
          parsed.prose,
          flags.cd,
          ticket?.capabilities,
          ticket?.first_return_s,
          ticket?.budget_usd,
          flags.pickTemperature ?? ticket?.pick_temperature,
          flags.pickSeed ??
            createHash("sha256")
              .update(
                flags.runId ?? `${now().replaceAll(":", "-")}-${process.pid}`,
              )
              .digest("hex")
              .slice(0, 16),
          ticket?.name ?? flags.name,
          ticket?.writes?.length ?? 0,
          undefined,
          ticket?.timeout_s,
        )
      : {
          source: "override",
          choice: overrideRow.id,
          approval: flags.approval ?? "",
          reason: "owner-approved row override",
        };
  const floorGrade = floorTicketGrade(
    brief,
    parsed,
    roster.choice.find((choice) => choice.id === pick.choice)?.effort,
  );
  const ticketGrade: TicketGrade =
    premiseCheck.status === "timeout"
      ? {
          ...floorGrade,
          warnings: [
            ...(floorGrade.warnings ?? []),
            "premise check skipped: timeout",
          ],
        }
      : floorGrade;
  if (
    (ticket === undefined || ticket.schema === 1) &&
    ticketGrade.verdict !== "pass" &&
    flags.legacyBrief === undefined
  ) {
    for (const line of renderGradeRemand(ticketGrade)) dispatchError(line);
    dispatchError(
      'agent-dispatch: plain briefs and schema 1 tickets with floor violations are refused; add schema = 2 and fix each violation, or use --legacy-brief "<why this must run once more release>"',
    );
    appendLog({
      kind: "refusal",
      at: now(),
      cwd: resolve(flags.cd),
      dispatcher_session: currentDispatcherSession(),
      brief: {
        path: resolve(flags.promptFile),
        sha256: sha256(brief),
        chars: brief.length,
      },
      pick,
      effort: roster.choice.find((choice) => choice.id === pick.choice)?.effort,
      ticket_grade: ticketGrade,
    });
    return 2;
  }
  let finalGrade = ticketGrade;
  const gradeRunId = `${now().replaceAll(/[:.]/gu, "-")}-${process.pid}`;
  const splitParentTitle = flags.label ?? briefLabel(parsed.prose);
  if (flags.noGrader) {
    finalGrade = {
      ...ticketGrade,
      grader: { status: "skipped", reason: "disabled by --no-grader" },
    };
  } else if (ticket?.schema === 2 && ticketGrade.violations.length > 0) {
    finalGrade = {
      ...ticketGrade,
      grader: { status: "skipped", reason: "floor refused schema 2 ticket" },
    };
  } else {
    const attempted = await attempt(() =>
      gradeWithWorker(roster, brief, resolve(flags.cd), gradeRunId),
    );
    if (!attempted.ok) {
      finalGrade = {
        ...ticketGrade,
        grader: {
          status: "failed",
          reason: errorMessage(attempted.error).slice(0, 300),
        },
      };
    } else if (!attempted.value.grade.valid) {
      finalGrade = {
        ...ticketGrade,
        grader: {
          ...attempted.value.record,
          status: "failed",
          reason: attempted.value.grade.reason,
        },
      };
    } else {
      finalGrade = mergeTicketGrades(
        ticketGrade,
        attempted.value.grade.grade,
        attempted.value.record,
      );
    }
  }
  const urgentGraderOverride =
    ticket?.schema === 2 &&
    ticket.urgent_reason !== undefined &&
    ticketGrade.verdict === "pass" &&
    finalGrade.grader?.status === "ok" &&
    finalGrade.verdict === "split";
  if (
    finalGrade.violations.length > 0 ||
    (finalGrade.questions?.length ?? 0) > 0 ||
    (finalGrade.pieces?.length ?? 0) > 0
  ) {
    for (const line of renderGradeRemand(finalGrade, splitParentTitle))
      dispatchError(line);
    if (urgentGraderOverride)
      dispatchError(
        `agent-dispatch: urgent override (${ticket.urgent_reason}): grader ${finalGrade.verdict} is recorded as a warning; proceeding with the run`,
      );
    if (ticket?.schema === 2 && ticketGrade.violations.length > 0) {
      appendLog({
        kind: "refusal",
        at: now(),
        cwd: resolve(flags.cd),
        dispatcher_session: currentDispatcherSession(),
        brief: {
          path: resolve(flags.promptFile),
          sha256: sha256(brief),
          chars: brief.length,
        },
        pick,
        effort: roster.choice.find((choice) => choice.id === pick.choice)
          ?.effort,
        ticket_grade: finalGrade,
      });
      return 2;
    }
  }
  if (
    ticket?.schema === 2 &&
    finalGrade.verdict === "split" &&
    finalGrade.grader?.status === "ok" &&
    !urgentGraderOverride
  ) {
    appendLog({
      kind: "refusal",
      at: now(),
      cwd: resolve(flags.cd),
      dispatcher_session: currentDispatcherSession(),
      brief: {
        path: resolve(flags.promptFile),
        sha256: sha256(brief),
        chars: brief.length,
      },
      pick,
      effort: roster.choice.find((choice) => choice.id === pick.choice)?.effort,
      ticket_grade: finalGrade,
    });
    return 2;
  }
  // A ticket's front matter is the router's, not the worker's: the worker gets the prose and the
  // verify line, from a copy under the state dir. A legacy brief goes to the worker as the file itself.
  const workerText =
    ticket === undefined ? undefined : withVerifyLine(parsed.prose, ticket);
  return launch({
    roster,
    flags,
    brief,
    ticket,
    ticketGrade: finalGrade,
    legacyBriefReason: flags.legacyBrief,
    pick,
    label: splitParentTitle,
    displayId,
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
  ticketGrade: TicketGrade;
  legacyBriefReason: string | undefined;
  pick: Pick;
  label: string;
  displayId: string;
  /** what the worker is sent when it is not the brief file itself */
  workerText: string | undefined;
  /** the vendor session to continue, for a resume */
  resume: { from: string; session: string } | undefined;
  escalatedFrom?: string;
}

/** Start the worker for a pick, wait for it, verify and grade; shared by `run` and `resume`. */
async function launch(l: Launch): Promise<number> {
  const {
    roster,
    flags,
    brief,
    ticket,
    ticketGrade,
    legacyBriefReason,
    pick,
    label,
    displayId,
    resume,
  } = l;
  let timeout: {
    seconds: number;
    source: "cli" | "ticket" | "default";
    reason?: string;
  };
  if (flags.timeoutS !== undefined) {
    const reason =
      flags.timeoutReason ??
      (ticket?.timeout_s === flags.timeoutS
        ? ticket.timeout_reason
        : undefined);
    timeout = {
      seconds: flags.timeoutS,
      source: "cli",
      ...(reason === undefined ? {} : { reason }),
    };
  } else if (ticket?.timeout_s !== undefined) {
    timeout = {
      seconds: ticket.timeout_s,
      source: "ticket",
      ...(ticket.timeout_reason === undefined
        ? {}
        : { reason: ticket.timeout_reason }),
    };
  } else timeout = { seconds: DEFAULT_TIMEOUT_S, source: "default" };
  const row = refuseUnrunnable(roster, pick.choice);
  stderrRun = { displayId, route: row.route };
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
        dispatchError(
          `agent-dispatch: waiting for codex worker slot (${live}/${max} active; ${Math.round(waited / 1000)}s elapsed)`,
        );
      },
    });
    if (!admitted.ok) fatal(admitted.reason);
  }
  const runId = flags.runId ?? `${now().replaceAll(":", "-")}-${process.pid}`;
  // the full text, ticket included, kept by its hash: the run record's brief.sha256 is the key
  storeBrief(sha256(brief), brief);
  dispatchError(
    pick.source !== "resume" &&
      (pick.mode === "sample" || pick.mode === "argmax")
      ? `${row.id} (sampled p=${(pick.sampled_probability ?? 0).toFixed(2)} from jev; argmax ${pick.argmax_row ?? pick.choice})`
      : `${row.id} (${pick.source}: ${pick.reason}) — ${label}`,
  );

  const active: Active = {
    schema: SCHEMA,
    run_id: runId,
    display_id: displayId,
    pid: process.pid,
    label,
    choice: row.id,
    pick_source: pick.source,
    started_at: now(),
    cwd: resolve(flags.cd),
    ...(currentDispatcherSession() === undefined
      ? {}
      : { dispatcher_session: currentDispatcherSession() }),
    ...(ticket === undefined
      ? {}
      : { ticket: { writes: ticket.writes ?? [] } }),
  };
  const changesBefore = await snapshotChanges(active.cwd);
  mkdirSync(ACTIVE_DIR, { recursive: true });
  const marker = join(ACTIVE_DIR, `${runId}.json`);
  writeFileSync(marker, JSON.stringify(active));
  // The worker folds its own events into this file (agent-dispatch via AGENT_DISPATCH_CODEX_PROGRESS_FILE,
  // run-claude via --progress-file); the statusline Run rows read it.
  const progress = progressFile(runId);

  // The worker's prompt is always a copy under the state dir: what it was told, plus the typed
  // report instruction after the ticket's verify line (a legacy brief is its own text).
  const workerBrief = join(STATE_DIR, "briefs", `${runId}.md`);
  mkdirSync(join(STATE_DIR, "briefs"), { recursive: true });
  const workerText = l.workerText ?? brief;
  writeFileSync(
    workerBrief,
    withReportInstruction(
      row.route === "codex"
        ? `${CODEX_PATCH_GUIDANCE}\n\n${workerText}`
        : workerText,
    ),
  );
  const args = workerArgs(
    roster,
    row,
    { ...flags, timeoutS: timeout.seconds, promptFile: workerBrief },
    progress,
    runId,
    resume?.session,
  );
  const workerStartedAt = performance.now();
  const t0 = workerStartedAt;
  const spawnWorker = (workerArgs_: string[]) =>
    Bun.spawn([process.execPath, ...workerArgs_], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "inherit",
      env: {
        ...process.env,
        AGENT_DISPATCH_CODEX_PROGRESS_FILE: progress,
        AGENT_DISPATCH_LAST_MESSAGE_FILE: join(
          STATE_DIR,
          "worker-receipts",
          `${runId}.last.txt`,
        ),
      },
      detached: true,
    });
  const spawned = await attempt(() => spawnWorker(args));
  if (!spawned.ok) {
    rmSync(workerBrief, { force: true });
    rmSync(marker, { force: true });
    fatal(`cannot start worker: ${errorMessage(spawned.error)}`);
  }
  const child = spawned.value;
  let checkpointTimer: ReturnType<typeof setTimeout> | undefined;
  let firstReturnPoll: ReturnType<typeof setInterval> | undefined;
  const clearObservation = (): void => {
    if (checkpointTimer !== undefined) clearTimeout(checkpointTimer);
    if (firstReturnPoll !== undefined) clearInterval(firstReturnPoll);
  };
  const cleanup = (): void => {
    clearObservation();
    process.removeListener("SIGINT", onInterrupt);
    process.removeListener("SIGTERM", onTerminate);
  };
  let stopping = false;
  const stop = async (signal: NodeJS.Signals, code: number): Promise<void> => {
    if (stopping) return;
    stopping = true;
    cleanup();
    void attempt(() => process.kill(-child.pid, signal));
    // a verify that is running is in its own process group (verify.ts): it survives unless killed here
    killRunningVerify();
    await child.exited;
    const orphans = await reapWorkerGroup(child.pid);
    const done = progressAtEnd(progress);
    const filesChanged = await changedSince(active.cwd, changesBefore);
    const session = progressSession(progress);
    // recorded as stopped; a waiver, because a stopped run has no work to grade and must not block the cwd
    appendLog({
      kind: "run",
      host: currentHost(),
      route: row.route,
      run_id: runId,
      display_id: displayId,
      label,
      cwd: active.cwd,
      brief: {
        path: resolve(flags.promptFile),
        sha256: sha256(brief),
        chars: brief.length,
      },
      pick,
      ...(ticket === undefined ? {} : { ticket }),
      ticket_grade: ticketGrade,
      timeout_s: timeout.seconds,
      timeout_source: timeout.source,
      ...(timeout.reason === undefined
        ? {}
        : { timeout_reason: timeout.reason }),
      ...(resume === undefined ? {} : { resumed_from: resume.from }),
      started_at: active.started_at,
      ...(active.dispatcher_session === undefined
        ? {}
        : { dispatcher_session: active.dispatcher_session }),
      ended_at: now(),
      exit: code,
      report_partial: {
        last_progress: done?.last ?? "no progress observed",
        commands: done?.commands ?? 0,
        files_changed: filesChanged,
        last_message_tail: "",
        cause: `agent-dispatch received ${signal}`,
        return: {
          received: false,
          note: "no RETURN was received before the worker stopped",
        },
      },
      orphans_reaped: orphans.reaped,
      ...(orphans.left.length === 0 ? {} : { orphans_left: orphans.left }),
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
  const onInterrupt = (): void => {
    void stop("SIGINT", 130);
  };
  const onTerminate = (): void => {
    void stop("SIGTERM", 143);
  };
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  using _workerLifecycle = { [Symbol.dispose]: cleanup };

  let firstReturnAtS: number | undefined;
  let firstReturnByDeadline = false;
  let firstReturnWindowS = ticket?.first_return_s ?? 360;
  let validReturnObserved = false;
  let stalled = false;
  if (row.route === "codex" || resume === undefined) {
    const firstReturnS = ticket?.first_return_s ?? 360;
    const testDelay = Number(process.env.AGENT_DISPATCH_CHECKPOINT_MS ?? "");
    const checkpointDelayMs =
      Number.isFinite(testDelay) && testDelay > 0
        ? testDelay
        : firstReturnS * 1000;
    const timerDelayMs = Math.max(
      0,
      checkpointDelayMs - (performance.now() - workerStartedAt),
    );
    firstReturnWindowS = checkpointDelayMs / 1000;
    const observeFirstReturn = (): void => {
      const lastMessageFile = join(
        STATE_DIR,
        "worker-receipts",
        `${runId}.last.txt`,
      );
      const currentMessage = existsSync(lastMessageFile)
        ? readFileSync(lastMessageFile, "utf8")
        : "";
      const currentProgress = progressAtEnd(progress);
      validReturnObserved ||= parseReturn(currentMessage).kind === "valid";
      const progressObserved =
        currentProgress !== undefined &&
        (currentProgress.commands > 0 ||
          currentProgress.files > 0 ||
          currentProgress.last !== "starting");
      if (
        firstReturnAtS === undefined &&
        (parseReturn(currentMessage).kind === "valid" || progressObserved)
      )
        firstReturnAtS =
          Math.round(((performance.now() - workerStartedAt) / 1000) * 10) / 10;
    };
    firstReturnPoll = setInterval(observeFirstReturn, 50);
    checkpointTimer = setTimeout(() => {
      observeFirstReturn();
      firstReturnByDeadline =
        firstReturnAtS !== undefined && firstReturnAtS <= firstReturnWindowS;
      if (
        resume === undefined &&
        !validReturnObserved &&
        (progressAtEnd(progress)?.files ?? 0) === 0
      ) {
        stalled = true;
        clearObservation();
        // Both worker wrappers handle SIGUSR1 through their existing timeout abort path.
        void attempt(() => process.kill(child.pid, "SIGUSR1"));
      }
    }, timerDelayMs);
  }
  const completed = await attempt(() =>
    Promise.all([new Response(child.stdout).text(), child.exited]),
  );
  clearObservation();
  if (!completed.ok) {
    cleanup();
    void attempt(() => process.kill(-child.pid, "SIGKILL"));
    await child.exited;
    await reapWorkerGroup(child.pid);
    rmSync(workerBrief, { force: true });
    rmSync(marker, { force: true });
    rmSync(progress, { force: true });
    fatal(`worker read failed: ${errorMessage(completed.error)}`);
  }
  const [out, workerExit] = completed.value;
  if (row.route === "codex" && firstReturnAtS === undefined) {
    const lastMessageFile = join(
      STATE_DIR,
      "worker-receipts",
      `${runId}.last.txt`,
    );
    const currentMessage = existsSync(lastMessageFile)
      ? readFileSync(lastMessageFile, "utf8")
      : "";
    const currentProgress = progressAtEnd(progress);
    if (
      parseReturn(currentMessage).kind === "valid" ||
      (currentProgress !== undefined &&
        (currentProgress.commands > 0 ||
          currentProgress.files > 0 ||
          currentProgress.last !== "starting"))
    )
      firstReturnAtS =
        Math.round(((performance.now() - workerStartedAt) / 1000) * 10) / 10;
  }
  if (row.route === "codex")
    firstReturnByDeadline =
      firstReturnAtS !== undefined && firstReturnAtS <= firstReturnWindowS;
  let orphans = await reapWorkerGroup(child.pid);
  const done = progressAtEnd(progress);
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
  const rawWorker = worker.success ? worker.data : undefined;
  const lastMessage =
    z.looseObject({ last_message: z.string().optional() }).safeParse(rawWorker)
      .data?.last_message ?? "";
  const parsedReturn = parseReturn(lastMessage);
  if (
    row.route === "codex" &&
    firstReturnAtS === undefined &&
    parsedReturn.kind === "valid" &&
    elapsedS <= firstReturnWindowS
  )
    firstReturnAtS = elapsedS;
  if (row.route === "codex")
    firstReturnByDeadline =
      firstReturnAtS !== undefined && firstReturnAtS <= firstReturnWindowS;
  const checkpoint =
    row.route === "claude"
      ? {
          supported: false,
          reason: "claude worker takes its prompt at start; no live injection",
        }
      : {
          mode: "observe",
          first_return_by_deadline: firstReturnByDeadline,
          first_return_at_s: firstReturnAtS ?? null,
        };
  let workerData = rawWorker;
  if (stalled)
    workerData = {
      ...rawWorker,
      outcome: "stalled",
      cause: "stalled at first_return_s",
    };
  else if (parsedReturn.kind === "valid" && workerData !== undefined)
    workerData = { ...workerData, outcome: "returned" };
  let exit = workerExit;
  if (stalled) exit = 1;
  else if (parsedReturn.kind === "valid") exit = 0;
  const progressField = done === undefined ? {} : { progress: done };
  const workerOutcome = z
    .looseObject({ outcome: z.string().optional() })
    .safeParse(workerData);
  const outcomeName = workerOutcome.success
    ? workerOutcome.data.outcome
    : undefined;
  const delta = await checkedWrites(
    active.cwd,
    ticket?.writes ?? [],
    changesBefore,
    overlappingWriterScopes(runId, active.cwd, active.started_at, now()),
  );
  const writes = ticket === undefined ? undefined : delta;
  const writeViolations = writes?.violations ?? [];
  if (writes?.unavailable !== undefined)
    dispatchError(
      `agent-dispatch: writes check unavailable: ${writes.unavailable}`,
    );
  if (writeViolations.length > 0)
    dispatchError(
      `agent-dispatch: writes outside ticket scope: ${writeViolations.join(", ")}`,
    );
  const verified =
    ticket === undefined || stalled
      ? undefined
      : await verifyAfterWorker(ticket, active.cwd, outcomeName, done);
  const workerOutput = z
    .looseObject({ structured_output: z.unknown().optional() })
    .safeParse(workerData);
  const parsedReport = parseReport(
    workerOutput.success ? workerOutput.data.structured_output : undefined,
    lastMessage,
  );
  const claimedPaths = [
    ...new Set([
      ...(parsedReport.ok
        ? parsedReport.report.changes.map((change) => change.path)
        : []),
      ...(parsedReturn.kind === "valid" ? parsedReturn.record.artifacts : []),
    ]),
  ];
  // Without a ticket there are no declared writes, so claims-without-diff does not apply.
  const claimsWithoutDiff =
    ticket !== undefined &&
    writes !== undefined &&
    writes.unavailable === undefined &&
    writes.paths.length === 0 &&
    claimedPaths.length > 0;
  const claimFields = claimsWithoutDiff
    ? { claims_without_diff: { claimed: claimedPaths, diff_empty: true } }
    : {};
  if (claimsWithoutDiff)
    dispatchError(
      `agent-dispatch: worker claimed changes (${claimedPaths.join(", ")}) but the ticket writes diff is empty`,
    );
  const verifyProvesOtherwise =
    verified !== undefined &&
    verified.results.length > 0 &&
    verified.results.every((result) => result.exit === 0 && !result.timed_out);
  const stoppedWith = z
    .looseObject({ outcome: z.string(), session: z.string() })
    .safeParse(workerData);
  const resumeHint =
    stoppedWith.success &&
    stoppedWith.data.outcome !== "ok" &&
    stoppedWith.data.outcome !== "returned" &&
    (row.route === "codex" ||
      existsSync(claudeTranscript(active.cwd, stoppedWith.data.session)))
      ? `agent-dispatch resume ${runId}`
      : undefined;
  if (resumeHint !== undefined)
    dispatchError(
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
    if ((writes?.unattributed?.length ?? 0) > 0)
      writesFields.writes_unattributed = writes?.unattributed;
  }
  const stoppedSubtypes = z
    .looseObject({ stop_subtype: z.string().optional() })
    .safeParse(workerData);
  const stopCause =
    outcomeName === "timeout" ||
    exit === 3 ||
    outcomeName === "killed" ||
    outcomeName === "stopped" ||
    outcomeName === "stalled" ||
    stoppedSubtypes.data?.stop_subtype === "error_max_turns" ||
    stoppedSubtypes.data?.stop_subtype?.includes("budget") === true;
  const lastMessageTail =
    z
      .looseObject({ last_message: z.string().optional() })
      .safeParse(workerData)
      .data?.last_message?.slice(-1000) ?? "";
  const workerCause = z
    .looseObject({ cause: z.string().optional() })
    .safeParse(workerData).data?.cause;
  const partialCause =
    outcomeName ??
    (exit === 3 ? "timeout" : undefined) ??
    stoppedSubtypes.data?.stop_subtype ??
    "unknown cause";
  let partialReturn: unknown = {
    received: false,
    note: "no RETURN was received before timeout",
  };
  if (parsedReturn.kind === "valid") partialReturn = parsedReturn.record;
  else if (parsedReturn.kind === "invalid")
    partialReturn = {
      received: false,
      note: `malformed RETURN: ${parsedReturn.error}`,
    };
  const partialReport = stopCause
    ? {
        last_progress: done?.last ?? "no progress observed",
        commands: done?.commands ?? 0,
        files_changed: delta.paths,
        last_message_tail: lastMessageTail,
        cause: workerCause ?? `worker stopped (${partialCause})`,
        return: partialReturn,
      }
    : undefined;
  const returnFields: Record<string, unknown> = {};
  if (parsedReturn.kind === "valid") returnFields.return = parsedReturn.record;
  else if (parsedReturn.kind === "invalid")
    returnFields.return_error = parsedReturn.error;
  const receipt = {
    schema: SCHEMA,
    host: currentHost(),
    route: row.route,
    run_id: runId,
    display_id: displayId,
    ...(l.escalatedFrom === undefined
      ? {}
      : { escalated_from: l.escalatedFrom }),
    label,
    cwd: active.cwd,
    brief: {
      path: resolve(flags.promptFile),
      sha256: sha256(brief),
      chars: brief.length,
    },
    pick,
    ...(ticket === undefined ? {} : { ticket }),
    ticket_grade: ticketGrade,
    ...(legacyBriefReason === undefined
      ? {}
      : { legacy_brief_reason: legacyBriefReason }),
    checkpoint,
    timeout_s: timeout.seconds,
    timeout_source: timeout.source,
    ...(timeout.reason === undefined ? {} : { timeout_reason: timeout.reason }),
    ...(resume === undefined ? {} : { resumed_from: resume.from }),
    started_at: active.started_at,
    ...(active.dispatcher_session === undefined
      ? {}
      : { dispatcher_session: active.dispatcher_session }),
    ended_at: now(),
    exit,
    ...(resumeHint === undefined ? {} : { resume_with: resumeHint }),
    ...reportFields(workerData),
    ...returnFields,
    ...(verified === undefined
      ? {}
      : { verify: verified.results, verify_summary: verified.summary }),
    ...writesFields,
    ...claimFields,
    ...(partialReport === undefined ? {} : { report_partial: partialReport }),
    orphans_reaped: orphans.reaped,
    ...(orphans.left.length === 0 ? {} : { orphans_left: orphans.left }),
    orphan_detection:
      process.platform === "darwin"
        ? "process group only; macOS cannot recover reparented descendants that called setsid"
        : "process group only; this router does not assign a per-run Linux cgroup or recover reparented descendants that called setsid",
    // agent-dispatch's own receipt carries progress; a claude worker's comes from its progress file
    worker:
      worker.success || stalled
        ? {
            ...progressField,
            sandbox: flags.sandbox,
            ...workerData,
            elapsed_s: elapsedS,
          }
        : unreadable("agent-dispatch", "codex-failed", out),
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
    ticketGrade.grader?.usage?.cost_usd ?? null,
  );
  appendLog({ kind: "run", ...receipt, stats: runStats });
  rmSync(marker, { force: true });
  if (stalled) {
    cleanup();
    appendFileSync(
      join(STATE_DIR, "incidents.jsonl"),
      `${JSON.stringify({ kind: "stalled_at_first_return", at: now(), run_id: runId, display_id: displayId, row: row.id, first_return_s: ticket?.first_return_s ?? 360, commands: done?.commands ?? 0 })}\n`,
    );
    recordWaiver(runId, "stalled at first_return_s", "router");
    if (l.escalatedFrom !== undefined) {
      process.stdout.write(`${JSON.stringify(receipt)}\n`);
      return 1;
    }
    const parsedBrief = parseTicket(brief);
    if (parsedBrief.kind === "invalid") fatal(parsedBrief.reason);
    const nextPick = await pickFor(
      roster,
      parsedBrief.prose,
      flags.cd,
      ticket?.capabilities,
      ticket?.first_return_s,
      ticket?.budget_usd,
      flags.pickTemperature ?? ticket?.pick_temperature,
      flags.pickSeed,
      ticket?.name ?? flags.name,
      ticket?.writes?.length ?? 0,
      row,
      ticket?.timeout_s,
    );
    return await launch({
      ...l,
      pick: nextPick,
      flags: { ...flags, runId: `${runId}-escalated` },
      escalatedFrom: row.id,
    });
  }
  let graded: Record<string, unknown> = {};
  if (verified !== undefined) {
    if (writeViolations.length > 0)
      graded = recordWritesViolationGrade(runId, verified, writeViolations);
    else if (claimsWithoutDiff && !verifyProvesOtherwise)
      graded = recordClaimsWithoutDiffGrade(runId, verified, claimedPaths);
    else
      graded = await autoGrade(
        roster,
        runId,
        brief,
        receipt.worker,
        active.cwd,
        verified,
      );
  } else if (parsedReturn.kind === "valid") {
    recordWaiver(runId, "returned early with findings", "router");
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
  dispatchError(`agent-dispatch: verify ${summary}`);
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
    dispatchError(`agent-dispatch: ${runId} waived — ${reason}`);
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
  dispatchError(
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
  dispatchError(`agent-dispatch: ${runId} graded fail by router — ${reason}`);
  return {
    grade: { grade: "fail", confidence: 1, graded_by: "router", reason },
  };
}

function recordClaimsWithoutDiffGrade(
  runId: string,
  verified: Verified,
  claimed: string[],
): Record<string, unknown> {
  const reason = "claimed changes, no diff";
  const evidence = `${reason}\nclaimed: ${claimed.join(", ")}\n\n${verifyEvidence(verified.results)}`;
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
  dispatchError(`agent-dispatch: ${runId} graded fail by router — ${reason}`);
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
  const ticket = parsed.kind === "ticket" ? parsed.ticket : undefined;
  const premiseCheck = checkPremises(ticket?.premises, resolve(cd));
  if (premiseCheck.status === "missing") {
    const ticketGrade: TicketGrade = {
      verdict: "clarify",
      source: "floor",
      violations: premiseCheck.premises.map((premise) => ({
        rule: "premise",
        quote_from_brief: premise,
        why_it_blocks_a_6min_first_return: `The declared premise ${premise} could not be found in the --cd tree.`,
        fix: "correct the brief's premise or remove it",
      })),
    };
    for (const violation of ticketGrade.violations)
      dispatchError(
        `agent-dispatch: remand premise: ${violation.quote_from_brief} is absent. Fix: ${violation.fix}`,
      );
    appendLog({
      kind: "refusal",
      at: now(),
      cwd: resolve(cd),
      brief: {
        path: resolve(promptFile),
        sha256: sha256(brief),
        chars: brief.length,
      },
      ticket_grade: ticketGrade,
    });
    return 2;
  }
  const pick = await pickFor(
    roster,
    parsed.prose,
    cd,
    ticket?.capabilities ?? [],
    ticket?.first_return_s,
    ticket?.budget_usd,
    undefined,
    undefined,
    ticket?.name,
    ticket?.writes?.length ?? 0,
    undefined,
    ticket?.timeout_s,
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
  dispatchError(
    `agent-dispatch: would run ${pick.choice} (${pick.source}: ${pick.reason})`,
  );
  process.stdout.write(`${JSON.stringify(pick)}\n`);
  return 0;
}

type ReplayVerdict = "pass" | "split" | "clarify";

function replayExpectations(expectFile: string): Map<string, ReplayVerdict> {
  if (!existsSync(expectFile)) fatal(`no such expectation file: ${expectFile}`);
  const ExpectedVerdict = z.enum(["pass", "split", "clarify"]);
  const expected = new Map<string, ReplayVerdict>();
  for (const [index, line] of readFileSync(expectFile, "utf8")
    .split("\n")
    .entries()) {
    if (line === "") continue;
    const [file, verdict, ...extra] = line.split("\t");
    if (file === undefined || verdict === undefined || extra.length > 0)
      fatal(`invalid expectation TSV row ${index + 1}`);
    const parsedVerdict = ExpectedVerdict.safeParse(verdict);
    if (!parsedVerdict.success)
      fatal(`invalid expectation verdict at row ${index + 1}: ${verdict}`);
    if (expected.has(file)) fatal(`duplicate expectation for ${file}`);
    expected.set(file, parsedVerdict.data);
  }
  return expected;
}

const replayFalseRate = (
  falseRefusals: number,
  expectedPass: number,
): string =>
  expectedPass === 0
    ? "n/a"
    : `${falseRefusals}/${expectedPass} (${Math.round((falseRefusals / expectedPass) * 100)}%)`;

const replayAgreement = (n: number, denominator: number): string =>
  denominator === 0
    ? "n/a"
    : `${n}/${denominator} (${Math.round((n / denominator) * 100)}%)`;

async function gradeReplayBrief(
  roster: Roster,
  directory: string,
  file: string,
): Promise<{
  grade: TicketGrade;
  floorViolationCount: number;
  graderStatus: "ok" | "failed" | "skipped";
  graderVerdict: TicketGrade["verdict"] | undefined;
  nPieces: number;
  piecesValid: boolean | undefined;
  reason: string | undefined;
  valid: boolean;
}> {
  const brief = readFileSync(join(directory, file), "utf8");
  const parsed = parseTicket(brief);
  const floor = floorTicketGrade(brief, parsed);
  if (parsed.kind === "invalid")
    return {
      grade: floor,
      floorViolationCount: floor.violations.length,
      graderStatus: "skipped",
      graderVerdict: undefined,
      nPieces: 0,
      piecesValid: undefined,
      reason: `ticket parse failed: ${parsed.reason}`,
      valid: false,
    };
  if (
    parsed.kind === "ticket" &&
    parsed.ticket.schema === 2 &&
    floor.violations.length > 0
  )
    return {
      grade: floor,
      floorViolationCount: floor.violations.length,
      graderStatus: "skipped",
      graderVerdict: undefined,
      nPieces: 0,
      piecesValid: undefined,
      reason: `schema 2 floor has ${floor.violations.length} violation(s); grader not run`,
      valid: false,
    };
  const replayId = `replay-${sha256(`${file}:${brief}`).slice(0, 16)}`;
  const result = await attempt(() =>
    gradeWithWorker(roster, brief, resolve(directory), replayId),
  );
  if (!result.ok)
    return {
      grade: floor,
      floorViolationCount: floor.violations.length,
      graderStatus: "failed",
      graderVerdict: undefined,
      nPieces: 0,
      piecesValid: undefined,
      reason: errorMessage(result.error),
      valid: false,
    };
  if (!result.value.grade.valid)
    return {
      grade: floor,
      floorViolationCount: floor.violations.length,
      graderStatus: "failed",
      graderVerdict: undefined,
      nPieces: 0,
      piecesValid: false,
      reason: result.value.grade.reason,
      valid: false,
    };
  return {
    grade: mergeTicketGrades(
      floor,
      result.value.grade.grade,
      result.value.record,
    ),
    floorViolationCount: floor.violations.length,
    graderStatus: "ok",
    graderVerdict: result.value.grade.grade.verdict,
    nPieces: result.value.grade.grade.pieces?.length ?? 0,
    piecesValid: true,
    reason: undefined,
    valid: true,
  };
}

async function gradeReplay(
  directory: string,
  expectFile: string | undefined,
): Promise<number> {
  if (!existsSync(directory) || !statSync(directory).isDirectory())
    fatal(`grade-replay needs an existing directory: ${directory}`);
  const expected =
    expectFile === undefined
      ? new Map<string, ReplayVerdict>()
      : replayExpectations(expectFile);
  const roster = await loadRosterOrDie();
  const files = readdirSync(directory)
    .filter((file) => file.endsWith(".md"))
    .toSorted();
  let mergedAgreement = 0;
  let mergedCompared = 0;
  let mergedFalseRefusals = 0;
  let mergedExpectedPass = 0;
  let graderAgreement = 0;
  let graderCompared = 0;
  let graderFalseRefusals = 0;
  let graderExpectedPass = 0;
  let graderExcluded = 0;
  for (const file of files) {
    const evaluation = await gradeReplayBrief(roster, directory, file);
    const reason =
      evaluation.reason === undefined
        ? "-"
        : evaluation.reason.replaceAll(/[\t\r\n]+/gu, " ").slice(0, 240);
    process.stdout.write(
      `${file}\tmerged=${evaluation.grade.verdict}\tfloor_violations=${evaluation.floorViolationCount}\tgrader_status=${evaluation.graderStatus}\tgrader_verdict=${evaluation.graderVerdict ?? "n/a"}\tn_pieces=${evaluation.nPieces}\tpieces_valid=${evaluation.piecesValid?.toString() ?? "n/a"}\tgrader_reason=${reason}\n`,
    );
    const want = expected.get(file);
    if (want === undefined) continue;
    mergedCompared += 1;
    if (want === "pass") mergedExpectedPass += 1;
    if (want === evaluation.grade.verdict) mergedAgreement += 1;
    if (want === "pass" && evaluation.grade.verdict !== "pass")
      mergedFalseRefusals += 1;
    if (
      evaluation.graderStatus !== "ok" ||
      evaluation.graderVerdict === undefined
    ) {
      graderExcluded += 1;
      continue;
    }
    graderCompared += 1;
    if (want === "pass") graderExpectedPass += 1;
    if (want === evaluation.graderVerdict) graderAgreement += 1;
    if (want === "pass" && evaluation.graderVerdict !== "pass")
      graderFalseRefusals += 1;
  }
  process.stdout.write(
    `TOTAL briefs=${files.length} merged_agreement=${replayAgreement(mergedAgreement, mergedCompared)} merged_false_refusal_rate=${replayFalseRate(mergedFalseRefusals, mergedExpectedPass)} grader_agreement=${replayAgreement(graderAgreement, graderCompared)} grader_false_refusal_rate=${replayFalseRate(graderFalseRefusals, graderExpectedPass)} grader_excluded=${graderExcluded}\n`,
  );
  return 0;
}

function ls(): number {
  const rows = readActive().map((r) =>
    Object.assign({}, r.active, { alive: r.alive }),
  );
  for (const r of rows)
    dispatchError(
      `${r.alive ? "running" : "STALE  "} ${r.choice.padEnd(12)} ${r.started_at}  ${r.label}`,
    );
  if (rows.length === 0) dispatchError("agent-dispatch: nothing running");
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, active: rows })}\n`);
  return 0;
}

function doctor(): number {
  const routes = hostRoutes();
  dispatchError(
    `agent-dispatch: codex: ${routes.codex.available ? "available" : "unavailable"} — ${routes.codex.reason}`,
  );
  dispatchError(
    `agent-dispatch: claude: ${routes.claude.available ? "available" : "unavailable"} — ${routes.claude.reason}`,
  );
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, routes })}\n`);
  return 0;
}

const LogLine = z.looseObject({
  kind: z.string(),
  run_id: z.string().optional(),
  label: z.string().optional(),
  cwd: z.string().optional(),
  dispatcher_session: z.string().optional(),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  at: z.string().optional(),
  brief: z
    .looseObject({ path: z.string(), sha256: z.string().optional() })
    .optional(),
  // present on a run dispatched with a ticket; absent = legacy
  ticket: z
    .looseObject({
      writes: z.array(z.string()),
      verify: z.array(z.string()).optional(),
    })
    .optional(),
  timeout_s: z.number().int().optional(),
  timeout_source: z.enum(["cli", "ticket", "default"]).optional(),
  timeout_reason: z.string().optional(),
  ticket_grade: z.unknown().optional(),
  checkpoint: z.unknown().optional(),
  writes_check: z.union([z.array(z.string()), z.string()]).optional(),
  writes_violations: z.array(z.string()).optional(),
  writes_unattributed: z.array(z.string()).optional(),
  pick: z.looseObject({
    source: z.string(),
    choice: z.string(),
    mode: z.enum(["sample", "argmax", "fallback"]).optional(),
    argmax_row: z.string().optional(),
    sampled_row: z.string().optional(),
    temperature: z.number().optional(),
    seed: z.string().optional(),
    masked_rows: z
      .array(z.looseObject({ row: z.string(), reason: z.string() }))
      .optional(),
    sampled_probability: z.number().optional(),
    epsilon: z.number().optional(),
    pick_fallback_reason: z.string().optional(),
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
  return: ReturnSchema.optional(),
  return_error: z.string().optional(),
  report_partial: z.unknown().optional(),
  orphans_reaped: z
    .array(z.looseObject({ pid: z.number(), cmd: z.string() }))
    .optional(),
  orphans_left: z
    .array(z.looseObject({ pid: z.number(), cmd: z.string(), why: z.string() }))
    .optional(),
  orphan_detection: z.string().optional(),
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
// finished plain run is owed a grade, or a waiver with its reason, before more work is dispatched from
// the same dispatcher session (cwd only when the session id is absent). On Vast 38 runs were logged and none graded: Jev's "graded record" criterion stayed
// empty, a run that deleted a file it was asked to lint stayed "ok", and the same mis-pick (luna on
// long edit-and-test loops, killed at its bound) repeated. Grading was available and optional, so
// it never happened; the gate makes the owed grade the coordinator's next step. Router-verified
// ticket runs are excluded from the gate.
function owedGrades(cwd: string, sessionId?: string): Logged[] {
  const graded = readGrades();
  const waived = readWaivers();
  return readLog().filter(
    (l) =>
      l.kind === "run" &&
      l.run_id !== undefined &&
      (sessionId === undefined
        ? l.cwd === cwd && l.dispatcher_session === undefined
        : l.dispatcher_session === sessionId) &&
      (l.ticket === undefined || (l.ticket.verify?.length ?? 0) === 0) &&
      !graded.has(l.run_id) &&
      !waived.has(l.run_id),
  );
}

function warnOverUngraded(
  cwd: string,
  session = currentDispatcherSession(),
  except?: string,
): void {
  const owed = owedGrades(cwd, session).filter(
    (entry) => entry.run_id !== except,
  );
  if (owed.length === 0) return;
  dispatchError(
    `agent-dispatch: warning: ${owed.length} finished run(s) in ${session === undefined ? cwd : `dispatcher session ${session}`} remain ungraded; dispatch continues (grade or waive them when convenient)`,
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
  | {
      ok: false;
      failure: "unavailable" | "http" | "invalid";
      reason: string;
      status?: number;
    };

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
  if (!reply.ok)
    return {
      ok: false,
      failure: reply.failure,
      reason: reply.reason,
      ...(reply.status === undefined ? {} : { status: reply.status }),
    };
  const answer = reply.answer;
  const graded = GradeEnum.safeParse(answer.choice);
  if (!graded.success)
    return {
      ok: false,
      failure: "invalid",
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
  if (!reply.ok) {
    if (
      reply.failure === "http" &&
      reply.status !== undefined &&
      reply.status !== 400 &&
      reply.status !== 422
    ) {
      const reason = `auto-waived: ${reply.reason}`;
      const record = recordWaiver(runId, reason);
      dispatchError(`agent-dispatch: ${runId} waived — ${reason}`);
      process.stdout.write(
        `${JSON.stringify({ schema: SCHEMA, ...record })}\n`,
      );
      return 0;
    }
    if (reply.failure === "unavailable") {
      const reason = `auto-waived: ${reply.reason}`;
      const record = recordWaiver(runId, reason);
      dispatchError(`agent-dispatch: ${runId} waived — ${reason}`);
      process.stdout.write(
        `${JSON.stringify({ schema: SCHEMA, ...record })}\n`,
      );
      return 0;
    }
    fatal(`not graded: ${reply.reason}`);
  }
  const record = recordGrade(runId, reply, evidencePath, evidence);
  dispatchError(
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
  dispatchError(`agent-dispatch: ${runId} waived — ${reason}`);
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, ...record })}\n`);
  return 0;
}

function ack(
  runId: string,
  consumed: boolean,
  note: string | undefined,
): number {
  const resolved = resolveRunId(runId);
  const logged = readLog().find(
    (line) => line.kind === "run" && line.run_id === resolved,
  );
  if (logged === undefined)
    fatal(
      `no finished run ${runId} in ${LOG_FILE}; no acknowledgement recorded`,
    );
  const record = {
    kind: "ack",
    run_id: runId,
    dispatcher_session: currentDispatcherSession() ?? null,
    at: now(),
    consumed,
    ...(note === undefined ? {} : { note }),
  };
  appendLog(record);
  process.stdout.write(`${JSON.stringify({ schema: SCHEMA, ...record })}\n`);
  return 0;
}

function stats(flags: {
  since: string | undefined;
  grading: boolean;
  check: boolean;
  replay: string | undefined;
}): number {
  const allLines = readLog();
  const logText = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8") : "";
  const nowMs = epochMilliseconds();
  const sinceMs = parseSince(flags.since, nowMs);
  if (!Number.isFinite(sinceMs))
    fatal(
      `invalid --since value '${flags.since ?? ""}': use an ISO instant or duration such as 24h`,
    );
  if (flags.check && !flags.grading) fatal("--check requires --grading");
  const lines = allLines.filter((line) => {
    const timestamp = line.kind === "run" ? line.started_at : line.at;
    const parsedAt =
      timestamp === undefined
        ? undefined
        : fromThrowable(
            () => Temporal.Instant.from(timestamp).epochMilliseconds,
            (error) => error,
          )();
    const at = parsedAt?.isOk() === true ? parsedAt.value : undefined;
    return at !== undefined && at >= sinceMs && at <= nowMs;
  });
  const routePicks = dispatchStats({
    log: logText,
    now: nowMs,
    sinceMs,
  });
  const bySource = Object.fromEntries(
    ["explicit", "jev", "default", "resume"].map((s) => [
      s,
      lines.filter((l) => l.pick.source === s).length,
    ]),
  );
  const conf = lines.flatMap((l) => l.pick.confidence ?? []);
  const latency = lines.flatMap((l) => l.pick.jev?.latency_ms ?? []);
  const legacy = {
    schema: SCHEMA,
    log: LOG_FILE,
    records: lines.length,
    route_picks: routePicks,
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
  const throughput = throughputStats(logText, {
    now: nowMs,
    sinceMs,
    grading: flags.grading,
  });
  const replay =
    flags.replay === undefined
      ? undefined
      : (() => {
          const candidate = jsonOf(z.unknown()).safeParse(
            readFileSync(flags.replay, "utf8"),
          );
          if (!candidate.success)
            fatal(`invalid candidate JSON: ${flags.replay}`);
          return replayStats(logText, candidate.data, {
            now: nowMs,
            sinceMs,
            grading: false,
          });
        })();
  const report = {
    ...legacy,
    window: flags.since ?? "24h",
    throughput,
    legacy,
    ...(replay === undefined ? {} : { replay }),
  };
  dispatchError(
    `agent-dispatch: ${lines.length} records — explicit ${bySource.explicit}, jev ${bySource.jev}, default ${bySource.default}`,
  );
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return flags.check && throughput.grading?.exceeds_saves === true ? 1 : 0;
}

function exportRecord(since: string, out: string | undefined): number {
  const nowMs = epochMilliseconds();
  const sinceMs = parseSince(since, nowMs);
  if (!Number.isFinite(sinceMs))
    fatal(
      `invalid --since value '${since}': use an ISO instant or duration such as 7d`,
    );
  const logText = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8") : "";
  const candidate = RecordExportSchema.safeParse({
    schema: 1,
    host: hostname(),
    exported_at: now(),
    window: since,
    per_row: perRowRecord(logText, { now: nowMs, sinceMs, grading: false }),
    per_tag: perTagRecord(logText, { now: nowMs, sinceMs, grading: false }),
  });
  if (!candidate.success)
    fatal(
      `could not form record export: ${candidate.error.issues[0]?.message ?? "invalid shape"}`,
    );
  const record = candidate.data;
  const text = `${JSON.stringify(record, null, 2)}\n`;
  if (out === undefined) process.stdout.write(text);
  else writeFileSync(out, text);
  return 0;
}

function exportRecordCommand(
  flags: { since: string | undefined; out: string | undefined },
  file: string | undefined,
): number {
  const { since, out } = flags;
  if (since === "" || out === "") fatal("a value is required");
  if (file !== undefined) fatal("record export takes no positional arguments");
  return exportRecord(since ?? "7d", out);
}

function importRecordCommand(file: string | undefined): number {
  if (file === undefined) fatal("record import needs <file>");
  return importRecord(file);
}

function importRecord(file: string): number {
  const parsed = jsonOf(RecordExportSchema).safeParse(
    readFileSync(file, "utf8"),
  );
  if (!parsed.success)
    fatal(
      `invalid record export: ${parsed.error.issues[0]?.message ?? "wrong shape"}`,
    );
  mkdirSync(STATE_DIR, { recursive: true });
  const temporary = `${IMPORTED_RECORD_FILE}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(parsed.data, null, 2)}\n`);
  renameSync(temporary, IMPORTED_RECORD_FILE);
  process.stdout.write(
    `Imported ${Object.keys(parsed.data.per_row).length} rows from ${parsed.data.host} (${parsed.data.exported_at.slice(0, 10)}).\n`,
  );
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
  dispatchError(`agent-dispatch: ${bounded === "" ? "ask failed" : bounded}`);
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
// vendor's own session id (worker.session); both CLIs resume by it (agent-dispatch --resume → `codex exec
// resume`, run-claude --resume → `claude --resume`). The new run is a run of its own on the original's
// row, sandbox and cwd; Jev picks nothing.

const defaultResumeMessage = (outcome: string, cause: string): string =>
  `You were stopped before you finished (${outcome}: ${cause}). Continue the same task from where you stopped; finish it, run its checks in the foreground, and write your final report.`;

async function resumeCommand(
  id: string,
  promptFile: string | undefined,
  timeoutS: number | undefined,
  timeoutReason: string | undefined,
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
  const ticketGrade = floorTicketGrade(brief, parsed, row.effort);
  if (promptFile !== undefined && !existsSync(promptFile))
    fatal(`no such message file: ${promptFile}`);
  // the original is the run being continued: its own ungraded record must not block its continuation
  if (ticket === undefined || ticket.verify.length === 0)
    warnOverUngraded(cwd, currentDispatcherSession(), runId);
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
      row: undefined,
      approval: undefined,
      label: undefined,
      name: undefined,
      timeoutS,
      timeoutReason,
      noGrader: false,
      legacyBrief: undefined,
    },
    brief,
    ticket,
    ticketGrade,
    legacyBriefReason: undefined,
    pick: {
      source: "resume",
      choice: row.id,
      ...(logged.pick.mode === undefined ? {} : { mode: logged.pick.mode }),
      ...(logged.pick.argmax_row === undefined
        ? {}
        : { argmax_row: logged.pick.argmax_row }),
      ...(logged.pick.sampled_row === undefined
        ? {}
        : { sampled_row: logged.pick.sampled_row }),
      ...(logged.pick.temperature === undefined
        ? {}
        : { temperature: logged.pick.temperature }),
      ...(logged.pick.seed === undefined ? {} : { seed: logged.pick.seed }),
      ...(logged.pick.masked_rows === undefined
        ? {}
        : { masked_rows: logged.pick.masked_rows }),
      ...(logged.pick.sampled_probability === undefined
        ? {}
        : { sampled_probability: logged.pick.sampled_probability }),
      ...(logged.pick.epsilon === undefined
        ? {}
        : { epsilon: logged.pick.epsilon }),
      ...(logged.pick.pick_fallback_reason === undefined
        ? {}
        : { pick_fallback_reason: logged.pick.pick_fallback_reason }),
      reason: `continuing session ${session} of ${runId}`,
    },
    label: `resume: ${briefLabel(parsed.prose)}`,
    displayId:
      typeof logged.display_id === "string"
        ? logged.display_id
        : chooseDisplayId(undefined),
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
        row: {
          type: String,
          description: "owner-approved roster row override",
        },
        approval: {
          type: String,
          description: "non-empty owner approval for --row",
        },
        label: {
          type: String,
          description: "short name shown by ls and the statusline",
        },
        name: {
          type: String,
          description: "worker display name (shown as agt_<name>)",
        },
        timeoutS: {
          type: Number,
          description:
            "worker wall clock in seconds (60..14400; default from ticket or 900)",
        },
        timeoutReason: {
          type: String,
          description: "required justification when --timeout-s exceeds 1800",
        },
        noGrader: {
          type: Boolean,
          description:
            "skip the pre-spawn ticket grader (recorded in the receipt)",
        },
        legacyBrief: {
          type: String,
          description:
            "one-release reason to run a plain/schema 1 brief with floor violations",
        },
        pickTemperature: {
          type: Number,
          description: "sampling temperature (0 < T <= 5; near zero is argmax)",
        },
        pickSeed: {
          type: String,
          description: "seed for reproducible row sampling",
        },
      },
      help: {
        description: "Sample a row from Jev probabilities; run the worker",
      },
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
      name: "grade-replay",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<dir>"],
      flags: {
        expect: {
          type: String,
          description: "TSV file with file<TAB>expected verdict rows",
        },
      },
      help: {
        description:
          "grade every Markdown brief with the floor and grader without starting the real worker",
      },
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
      flags: {
        since: {
          type: String,
          description: "window start as ISO instant or duration (default 24h)",
        },
        grading: {
          type: Boolean,
          description: "include grading overhead and estimated saves",
        },
        check: {
          type: Boolean,
          description:
            "with --grading, exit 1 when overhead exceeds estimated saves",
        },
        replay: {
          type: String,
          description: "offline candidate routing JSON file",
        },
      },
      help: {
        description:
          "throughput statistics by row and dispatcher; legacy view is included",
      },
    }),
    command({
      name: "record",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<action>", "[file]"],
      flags: { since: { type: String, default: "7d" }, out: { type: String } },
      help: {
        description:
          "agent-dispatch record export [--since 7d] [--out file] | import <file>",
      },
    }),
    command({
      name: "ack",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<run_id>"],
      flags: {
        consumed: {
          type: Boolean,
          description: "the artifact was consumed (default)",
        },
        rejected: { type: Boolean, description: "the artifact was rejected" },
        note: {
          type: String,
          description: "why the artifact was consumed or rejected",
        },
      },
      help: {
        description: "record whether a finished run's artifact was consumed",
      },
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
          type: Number,
          description:
            "worker wall clock in seconds (60..14400; default from ticket or 900)",
        },
        timeoutReason: {
          type: String,
          description: "required justification when --timeout-s exceeds 1800",
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
  let positionals = 0;
  if (argv.command === "record") positionals = 2;
  if (
    argv.command === "grade-replay" ||
    argv.command === "grade" ||
    argv.command === "ack" ||
    argv.command === "result" ||
    argv.command === "resume"
  )
    positionals = 1;
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
    const timeoutS = f.timeoutS;
    if (
      f.pickTemperature !== undefined &&
      (!(f.pickTemperature >= 0) || f.pickTemperature > 5)
    )
      fatal("--pick-temperature must be from 0 through 5");
    if (
      timeoutS !== undefined &&
      (!Number.isInteger(timeoutS) || timeoutS < 60 || timeoutS > MAX_TIMEOUT_S)
    )
      fatal(
        `--timeout-s must be a whole number from 60 through ${MAX_TIMEOUT_S} seconds: ${timeoutS}`,
      );
    if (f.timeoutReason !== undefined && f.timeoutReason.trim() === "")
      fatal("--timeout-reason requires a non-empty reason");
    if (f.legacyBrief !== undefined && f.legacyBrief.trim() === "")
      fatal("--legacy-brief requires a non-empty reason");
    if (
      timeoutS !== undefined &&
      timeoutS > EXTENDED_TIMEOUT_THRESHOLD_S &&
      f.timeoutReason === undefined
    )
      fatal(
        `--timeout-s above ${EXTENDED_TIMEOUT_THRESHOLD_S} seconds requires --timeout-reason <why>`,
      );
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
      row: f.row,
      approval: f.approval,
      label: f.label,
      name: f.name,
      timeoutS,
      timeoutReason: f.timeoutReason,
      noGrader: f.noGrader ?? false,
      legacyBrief: f.legacyBrief,
      pickTemperature: f.pickTemperature,
      pickSeed: f.pickSeed,
      runId: `${now().replaceAll(":", "-")}-${process.pid}`,
    });
  }
  if (argv.command === "pick") {
    if (argv.flags.promptFile === "" || argv.flags.cd === "")
      fatal("a value is required");
    if (argv.flags.promptFile === undefined) fatal("pick needs --prompt-file");
    return pickOnly(argv.flags.promptFile, argv.flags.cd);
  }
  if (argv.command === "grade-replay") {
    if (argv._.length !== 1) fatal("grade-replay needs <dir>");
    if (argv.flags.expect === "") fatal("--expect needs a file path");
    return gradeReplay(argv._.dir, argv.flags.expect);
  }
  if (argv.command === "ask") {
    if (argv.flags.request === undefined || argv.flags.request === "")
      fatal("ask needs --request <file|->");
    return ask(argv.flags.request);
  }
  if (argv.command === "ls") return ls();
  if (argv.command === "doctor") return doctor();
  if (argv.command === "stats") {
    const { since, grading, check, replay } = argv.flags;
    if (since === "" || replay === "") fatal("a value is required");
    if (check === true && grading !== true) fatal("--check requires --grading");
    return stats({
      since,
      grading: grading ?? false,
      check: check ?? false,
      replay,
    });
  }
  if (argv.command === "record") {
    const action = argv._.action;
    if (action === "export")
      return exportRecordCommand(argv.flags, argv._.file);
    if (action === "import") return importRecordCommand(argv._.file);
    fatal("record needs export or import");
  }
  if (argv.command === "ack") {
    if (argv._.length !== 1) fatal("ack needs <run_id>");
    if (argv.flags.note === "")
      fatal("--note requires a non-empty explanation");
    if (argv.flags.consumed === true && argv.flags.rejected === true)
      fatal("choose either --consumed or --rejected");
    return ack(argv._.runId, argv.flags.rejected !== true, argv.flags.note);
  }
  if (argv.command === "export") return exportRuns(argv.flags.since);
  if (argv.command === "result")
    return resultCommand(
      argv._.runId,
      argv.flags.json ?? false,
      argv.flags.brief ?? false,
    );
  if (argv.command === "resume") {
    const { promptFile, timeoutS, timeoutReason } = argv.flags;
    if (promptFile === "") fatal("a value is required");
    if (
      timeoutS !== undefined &&
      (!Number.isInteger(timeoutS) || timeoutS < 60 || timeoutS > MAX_TIMEOUT_S)
    )
      fatal(
        `--timeout-s must be a whole number from 60 through ${MAX_TIMEOUT_S} seconds: ${timeoutS}`,
      );
    if (timeoutReason !== undefined && timeoutReason.trim() === "")
      fatal("--timeout-reason requires a non-empty reason");
    if (
      timeoutS !== undefined &&
      timeoutS > EXTENDED_TIMEOUT_THRESHOLD_S &&
      timeoutReason === undefined
    )
      fatal(
        `--timeout-s above ${EXTENDED_TIMEOUT_THRESHOLD_S} seconds requires --timeout-reason <why>`,
      );
    return resumeCommand(argv._.runId, promptFile, timeoutS, timeoutReason);
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
  const normalizedId = /^agt[_-]/u.test(id)
    ? `agt_${normalizeDisplayName(id.slice(4))}`
    : id;
  const displayMatches = runs.filter((l) => {
    const storedId = l.display_id;
    if (typeof storedId !== "string") return false;
    const normalizedStoredId = /^agt[_-]/u.test(storedId)
      ? `agt_${normalizeDisplayName(storedId.slice(4))}`
      : storedId;
    return storedId === id || normalizedStoredId === normalizedId;
  });
  if (displayMatches.length > 0) {
    const latest = displayMatches.at(-1);
    if (displayMatches.length > 1)
      dispatchError(
        `agent-dispatch: display id ${id} matches ${displayMatches.length} finished runs; using most recent ${latest?.run_id ?? "?"}`,
      );
    return latest?.run_id ?? id;
  }
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
      dispatchError(
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
      dispatchError(`agent-dispatch: ${reportNote}`);
    if (report.trim() === "" && !typed.success)
      dispatchError(
        `agent-dispatch: no final report (outcome=${outcome}; cause=${cause ?? "not recorded"})`,
      );
    return report.trim() === "" && !typed.success ? 1 : 0;
  }
  const fields = [
    `row=${logged.pick.choice}`,
    `outcome=${outcome}`,
    `exit=${logged.exit ?? "?"}`,
    `elapsed=${worker?.elapsed_s === undefined ? "?" : `${worker.elapsed_s}s`}`,
    ...(outcome === "ok" || outcome === "returned"
      ? []
      : [`cause=${cause ?? "not recorded"}`]),
    `progress=${JSON.stringify(worker?.progress ?? null)}`,
    `session=${worker?.session ?? "none"}`,
  ];
  process.stdout.write(`${fields.join(" ")}\n`);
  if (logged.return !== undefined)
    process.stdout.write(`RETURN: ${JSON.stringify(logged.return)}\n`);
  if (logged.return_error !== undefined)
    process.stdout.write(`RETURN error: ${logged.return_error}\n`);
  if (logged.report_partial !== undefined)
    process.stdout.write(
      `Partial (harness-written): ${JSON.stringify(logged.report_partial)}\n`,
    );
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
