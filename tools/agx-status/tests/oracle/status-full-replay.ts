#!/usr/bin/env bun
// Test-only oracle: the pre-SEP-STATUS-PUBLISH full-replay agx-status (reads records.jsonl). Never shipped.
import { homedir } from "node:os";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { cli as cleyeCli } from "cleye";
import { standardCli } from "../../../shared/src/cli.ts";
import { fromThrowable, jsonOf, z } from "../../../shared/src/zod.ts";
import pkg from "../../package.json" with { type: "json" };

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, pkg, cliArgv);
const nonEmpty = (value: string | undefined): string | undefined =>
  value === "" ? undefined : value;

function stateDir(env: NodeJS.ProcessEnv): string {
  const override =
    nonEmpty(env.AGX_NEXT_STATE_DIR) ?? nonEmpty(env.AGX_STATE_DIR);
  if (override !== undefined) return override;
  const stateHome =
    env.XDG_STATE_HOME === ""
      ? join(homedir(), ".local", "state")
      : (env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"));
  return join(stateHome, "agx-next");
}

const workspaceCounts = z.object({
  total: z.number().int().nonnegative(),
  unlanded: z.number().int().nonnegative(),
  collectable: z.number().int().nonnegative(),
  legacy: z.number().int().nonnegative(),
  capturedAt: z.number(),
  stale: z.boolean().optional(),
  here: z.number().int().nonnegative().optional(),
  fleetKnown: z.boolean().optional(),
});
const findings = z.object({
  kinds: z.record(
    z.string().regex(/^[a-z0-9-]+$/u),
    z.number().int().nonnegative(),
  ),
  lost: z.number().int().nonnegative(),
  capturedAt: z.number(),
  stale: z.boolean().optional(),
});
const sessionCounts = z.object({
  here: z.number().int().nonnegative(),
  other: z.number().int().nonnegative(),
});
const summary = z.object({
  running: z.number().int().nonnegative(),
  unattributed: z.number().int().nonnegative(),
  sessions: z.record(z.string(), sessionCounts),
  noSession: sessionCounts,
});
const listing = z.union([
  z.object({ runs: z.array(z.unknown()), summary }),
  z.array(z.unknown()),
]);
const snapshot = z.object({
  output: jsonOf(listing),
  capturedAt: z.number(),
  exit: z.literal(0),
  workspaces: workspaceCounts.optional(),
  findings: findings.optional(),
});
const workspaceFile = z.object({
  counts: workspaceCounts.omit({ capturedAt: true }),
  capturedAt: z.number(),
  complete: z.literal(true),
  fleetComplete: z.boolean().optional(),
  rows: z.array(z.array(z.string())).optional(),
  repos: z
    .record(
      z.string(),
      z.object({
        counts: workspaceCounts.omit({ capturedAt: true }),
        capturedAt: z.number(),
        lines: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});
const doctorFile = findings.extend({ complete: z.literal(true) });
const runRow = z.object({
  id: z.string(),
  state: z.enum(["running", "ended"]),
  dispatcher_session: z.string().nullable(),
  workspace: z.string().optional(),
  ended_at: z.string().optional(),
  judgment: z.object({ decision: z.string() }).nullable(),
});
const event = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("started"),
    id: z.string(),
    dispatcher_session: z.string().nullable(),
    workspace: z.string(),
  }),
  z.object({
    kind: z.literal("ended"),
    id: z.string(),
    at: z.string().optional(),
  }),
  z.object({ kind: z.literal("judged"), id: z.string(), decision: z.string() }),
]);
type Run = z.output<typeof runRow>;

async function readActions(
  dir: string,
  verdicts: string[],
  rows: unknown[],
  repo: string | undefined,
) {
  const runs = new Map<string, Run>();
  for (const row of rows) {
    const parsed = runRow.safeParse(row);
    if (parsed.success) runs.set(parsed.data.id, parsed.data);
  }
  const log = await Bun.file(join(dir, "records.jsonl"))
    .text()
    .catch(() => "");
  for (const line of log.slice(0, log.lastIndexOf("\n") + 1).split("\n")) {
    const parsed = jsonOf(event).safeParse(line);
    if (!parsed.success) continue;
    const item = parsed.data;
    if (item.kind === "started") {
      runs.set(item.id, { ...item, state: "running", judgment: null });
      continue;
    }
    const run = runs.get(item.id);
    if (run === undefined) continue;
    if (item.kind === "ended") {
      run.state = "ended";
      run.ended_at = item.at;
    }
    if (item.kind === "judged") run.judgment = { decision: item.decision };
  }
  const workspaceRows = verdicts.map((line) => line.split("\t"));
  const members = new Set(workspaceRows.map((row) => row[0]));
  const unlanded = new Set(
    workspaceRows.filter((row) => row[2] === "unlanded").map((row) => row[0]),
  );
  const now = Temporal.Now.instant().epochMilliseconds;
  const cutoff = now - 24 * 60 * 60_000;
  const bySession: Record<string, number> = {};
  let repository = 0;
  let land = 0;
  for (const run of runs.values()) {
    if (run.state !== "ended") continue;
    const belongs =
      repo !== undefined &&
      run.workspace !== undefined &&
      (members.has(run.workspace) ||
        run.workspace === repo ||
        run.workspace.startsWith(`${repo}/`) ||
        run.workspace.startsWith(`${repo}.ws/`));
    const endedAt = fromThrowable(
      () => Temporal.Instant.from(run.ended_at ?? "").epochMilliseconds,
    )().unwrapOr(Number.NaN);
    const recent = endedAt >= cutoff && endedAt <= now;
    if (run.judgment === null && recent && belongs) repository++;
    if (run.judgment === null && recent && run.dispatcher_session !== null)
      Object.defineProperty(bySession, run.dispatcher_session, {
        value:
          (Object.hasOwn(bySession, run.dispatcher_session)
            ? (bySession[run.dispatcher_session] ?? 0)
            : 0) + 1,
        enumerable: true,
        configurable: true,
      });
    if (
      run.judgment?.decision === "accept" &&
      belongs &&
      unlanded.has(run.workspace) &&
      run.workspace !== undefined &&
      (await stat(run.workspace)
        .then((info) => info.isDirectory())
        .catch(() => false))
    )
      land++;
  }
  return {
    by_session: bySession,
    repository,
    land,
    why:
      repo === undefined
        ? "repository scope unavailable; agx worker doctor"
        : null,
  };
}

async function readStatus(env: NodeJS.ProcessEnv, cwd: string) {
  const dir = stateDir(env);
  const paths = {
    current: join(dir, "current-runs.json"),
    workspaces: join(dir, "workspace-verdicts.json"),
    findings: join(dir, "doctor.json"),
    records: join(dir, "records.jsonl"),
  };
  const [currentText, wsText, doctorText, times] = await Promise.all([
    Bun.file(paths.current)
      .text()
      .catch(() => null),
    Bun.file(paths.workspaces)
      .text()
      .catch(() => null),
    Bun.file(paths.findings)
      .text()
      .catch(() => null),
    Promise.all(
      Object.values(paths).map((path) =>
        stat(path)
          .then((info) => info.mtimeMs)
          .catch(() => 0),
      ),
    ),
  ]);
  const current =
    currentText === null ? undefined : jsonOf(snapshot).safeParse(currentText);
  const ws =
    wsText === null ? undefined : jsonOf(workspaceFile).safeParse(wsText);
  const doctor =
    doctorText === null ? undefined : jsonOf(doctorFile).safeParse(doctorText);
  const snap = current?.success === true ? current.data : undefined;
  const workspace = ws?.success === true ? ws.data : undefined;
  const doctorData = doctor?.success === true ? doctor.data : undefined;
  const [runsAt = 0, recordsAt = 0, wsAt = 0, doctorAt = 0] = times;
  const runsStale = runsAt < recordsAt;
  const freshFindings =
    doctorData === undefined
      ? undefined
      : {
          kinds: doctorData.kinds,
          lost: doctorData.lost,
          capturedAt: doctorData.capturedAt,
          stale: doctorAt < Math.max(recordsAt, wsAt),
        };
  const repo = Object.keys(workspace?.repos ?? {})
    .filter(
      (root) =>
        cwd === root ||
        cwd.startsWith(`${root}/`) ||
        cwd.startsWith(`${root}.ws/`),
    )
    .toSorted((a, b) => b.length - a.length)[0];
  const own = repo === undefined ? undefined : workspace?.repos?.[repo];
  let workspaces: Record<string, unknown> | null = null;
  if (workspace !== undefined) {
    workspaces = {
      total: workspace.counts.total,
      unlanded: workspace.counts.unlanded,
      collectable: workspace.counts.collectable,
      legacy: workspace.counts.legacy,
      here: own?.counts.total,
      fleet_known: workspace.fleetComplete !== false,
      captured_at:
        own === undefined
          ? workspace.capturedAt
          : Math.min(workspace.capturedAt, own.capturedAt),
      stale: false,
    };
  } else if (snap?.workspaces !== undefined) {
    workspaces = {
      total: snap.workspaces.total,
      unlanded: snap.workspaces.unlanded,
      collectable: snap.workspaces.collectable,
      legacy: snap.workspaces.legacy,
      captured_at: snap.workspaces.capturedAt,
      stale: snap.workspaces.stale,
      here: snap.workspaces.here,
      fleet_known: snap.workspaces.fleetKnown,
    };
  }
  const runListing = snap?.output;
  let rows: unknown[] = [];
  if (runListing !== undefined)
    rows = Array.isArray(runListing) ? runListing : runListing.runs;
  const actions = await readActions(dir, own?.lines ?? [], rows, repo);
  let runOutput: Record<string, unknown>;
  if (snap === undefined) {
    runOutput = {
      source: "unknown",
      captured_at: null,
      age_s: null,
      reason: "snapshot unavailable",
      rows: null,
      summary: null,
    };
  } else {
    let runSummary = null;
    if (runListing !== undefined && !Array.isArray(runListing))
      runSummary = runListing.summary;
    runOutput = {
      source: runsStale ? "stale" : "current",
      captured_at: snap.capturedAt,
      age_s: runsStale
        ? Math.max(
            1,
            Math.floor(
              (Temporal.Now.instant().epochMilliseconds - snap.capturedAt) /
                1000,
            ),
          )
        : 0,
      reason: null,
      rows,
      summary: runSummary,
    };
  }
  let statusFindings: Record<string, unknown> | null = null;
  if (freshFindings !== undefined) {
    statusFindings = {
      kinds: freshFindings.kinds,
      lost: freshFindings.lost,
      captured_at: freshFindings.capturedAt,
      stale: freshFindings.stale,
    };
  } else if (snap?.findings !== undefined) {
    statusFindings = {
      kinds: snap.findings.kinds,
      lost: snap.findings.lost,
      captured_at: snap.findings.capturedAt,
      stale: snap.findings.stale,
    };
  }
  return {
    schema: 1,
    runs: runOutput,
    workspaces,
    findings: statusFindings,
    judgments: actions,
  };
}

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("agx-status: unknown option '--__proto__'\n");
    process.exit(2);
  }
};
await cli(
  {
    name: "agx-status",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    flags: {
      json: { type: Boolean, description: "emit status as JSON" },
      cwd: {
        type: String,
        description: "repository path (default: current directory)",
      },
    },
    help: { description: "Read-only summary of agx state files." },
  },
  async (args) => {
    if (args.flags.json !== true) {
      process.stderr.write("Usage: agx-status --json [--cwd DIR]\n");
      process.exitCode = 2;
      return;
    }
    process.stdout.write(
      `${JSON.stringify(await readStatus(process.env, args.flags.cwd ?? process.cwd()))}\n`,
    );
  },
);
