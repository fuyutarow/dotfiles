#!/usr/bin/env bun
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { fromThrowable, jsonOf, z } from "../../shared/src/zod.ts";
import pkg from "../package.json" with { type: "json" };

import { stateDir, checkState } from "./state-dir.ts";

await checkState();

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
const endedRun = z.object({
  id: z.string(),
  dispatcher_session: z.string().nullable(),
  workspace: z.string(),
  ended_at: z.string(),
  judgment: z.object({ decision: z.string() }).nullable(),
});
const snapshot = z.object({
  output: jsonOf(listing),
  capturedAt: z.number(),
  exit: z.literal(0),
  workspaces: workspaceCounts.optional(),
  findings: findings.optional(),
  endedRuns: z.array(endedRun).optional(),
  acceptedRuns: z.array(endedRun).optional(),
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
type Published = z.output<typeof snapshot>;

/** Judgment counts from the ended-run facts agx-worker publishes; records.jsonl is never read. */
async function readActions(
  published: Published | undefined,
  verdicts: string[],
  repo: string | undefined,
) {
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
  const belongs = (workspace: string): boolean =>
    repo !== undefined &&
    (members.has(workspace) ||
      workspace === repo ||
      workspace.startsWith(`${repo}/`) ||
      workspace.startsWith(`${repo}.ws/`));
  for (const run of published?.endedRuns ?? []) {
    const endedAt = fromThrowable(
      () => Temporal.Instant.from(run.ended_at).epochMilliseconds,
    )().unwrapOr(Number.NaN);
    const recent = endedAt >= cutoff && endedAt <= now;
    if (run.judgment !== null || !recent) continue;
    if (belongs(run.workspace)) repository++;
    if (run.dispatcher_session !== null)
      Object.defineProperty(bySession, run.dispatcher_session, {
        value:
          (Object.hasOwn(bySession, run.dispatcher_session)
            ? (bySession[run.dispatcher_session] ?? 0)
            : 0) + 1,
        enumerable: true,
        configurable: true,
      });
  }
  const present = new Map<string, Promise<boolean>>();
  const candidates = (published?.acceptedRuns ?? []).filter(
    (run) =>
      run.judgment?.decision === "accept" &&
      belongs(run.workspace) &&
      unlanded.has(run.workspace),
  );
  for (const run of candidates)
    if (!present.has(run.workspace))
      present.set(
        run.workspace,
        stat(run.workspace)
          .then((info) => info.isDirectory())
          .catch(() => false),
      );
  for (const run of candidates)
    if ((await present.get(run.workspace)) === true) land++;
  let why: string | null = null;
  if (repo === undefined)
    why = "repository scope unavailable; agx worker doctor";
  else if (
    published?.endedRuns === undefined ||
    published.acceptedRuns === undefined
  )
    why = "judgment facts unpublished; agx worker doctor";
  return { by_session: bySession, repository, land, why };
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
  const actions = await readActions(snap, own?.lines ?? [], repo);
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
const emit = async (cwd: string): Promise<void> => {
  process.stdout.write(
    `${JSON.stringify(await readStatus(process.env, cwd))}\n`,
  );
};

/** The two forms every caller uses; everything else (help, version, errors) goes to cleye. */
const operandOf = (value: string | undefined): string | undefined =>
  value === undefined || value === "" || value.startsWith("-")
    ? undefined
    : value;
function plainInvocation(argv: string[]): { cwd: string | undefined } | null {
  const [first, second, third] = argv;
  if (argv.length === 1 && first === "--json") return { cwd: undefined };
  if (argv.length !== 3) return null;
  let cwd: string | undefined;
  if (first === "--json" && second === "--cwd") cwd = operandOf(third);
  if (first === "--cwd" && third === "--json") cwd = operandOf(second);
  return cwd === undefined ? null : { cwd };
}

// Loading cleye and the shared CLI wrapper costs more than the status read itself.
const plain = plainInvocation(process.argv.slice(2));
if (plain !== null) await emit(plain.cwd ?? process.cwd());
else {
  const { cli: cleyeCli } = await import("cleye");
  const { standardCli } = await import("../../shared/src/cli.ts");
  const cli = standardCli(cleyeCli, pkg, () => process.argv.slice(2));
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
      await emit(args.flags.cwd ?? process.cwd());
    },
  );
}
