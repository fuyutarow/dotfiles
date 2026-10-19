import { actionLine, currentDispatcherSession } from "./dispatch-display.ts";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, z } from "./zod.ts";
import { readCoreRuns } from "./core-runs.ts";
import { execError } from "./bounded.ts";
import { activeDirs, ProgressSchema } from "./dispatch-state.ts";
import { parseActiveMarker } from "../../shared/src/dispatch-state.ts";
import {
  costUsd,
  dispatchRowPrice,
} from "../../shared/src/dispatch-pricing.ts";
import {
  readAgxSnapshotAsync,
  stateDir as agxStateDir,
  type WorkspaceCounts,
  type FleetFindings,
} from "./agx-snapshot.ts";

// Render rows use agx's published listing and doctor counts. Legacy marker readers below
// remain compatibility APIs; the dataframe never calls them or enriches the core rows.
export interface RouteRun {
  coreState?: "running" | "ended";
  displayId: string | undefined;
  choice: string;
  label: string;
  workerName?: string | undefined;
  workspaceName?: string | undefined;
  pickSource: string;
  phase: string | undefined;
  workerSession: string | undefined;
  markerCostUsd: number | undefined;
  secs: number | undefined;
  alive: boolean;
  dispatcherSession: string | undefined;
  // what the worker is doing (agx progress file); undefined until its first event lands
  doing:
    | {
        last: string;
        commands: number;
        files: number;
        ageSecs: number;
        costUsd?: number;
        session?: string; // the vendor's id for the worker (codex thread, claude session)
      }
    | undefined;
}
// Lost rows come from the same health classification as agx doctor (orphaned),
// excluding pre-lease history classified as legacy.
const readText = fromThrowable((path: string) => readFileSync(path, "utf8"));
function doingOf(dir: string, runId: string): RouteRun["doing"] {
  const text = readText(join(dir, `${runId}.progress.json`));
  if (text.isErr()) return undefined;
  const parsed = jsonOf(ProgressSchema).safeParse(text.value);
  if (!parsed.success) return undefined;
  const p = parsed.data;
  return {
    last: p.last,
    commands: p.commands,
    files: p.files,
    ageSecs: sinceSecs(p.at).unwrapOr(0),
    ...(p.cost_usd === undefined ? {} : { costUsd: p.cost_usd }),
    ...(p.session === undefined ? {} : { session: p.session }),
  };
}
export interface RouteScan {
  actions?:
    | { judge: number; land: number; judgeWhy?: string | undefined }
    | undefined;
  findings?: FleetFindings | undefined;
  workspaces?: WorkspaceCounts | undefined;
  fleet?:
    | {
        running: number;
        here: number;
        other: number;
        lost?: number | undefined;
        unattributed: number;
      }
    | undefined;
  runs: RouteRun[];
  unreadable: number;
  snapshotAgeSecs?: number | undefined;
  snapshotWhy?: string | undefined;
}
export interface JobRun {
  id: string;
  ticket: string;
  state: "running" | "ended";
  dispatcher_session: string | null;
}
const AgxLsRowSchema = z.object({
  id: z.string(),
  ticket: z.string(),
  state: z.enum(["running", "ended"]),
  outcome: z.string().nullable().optional(),
  health: z.string().nullable().optional(),
  row: z.string(),
  dispatcher_session: z.string().nullable(),
  exit: z.unknown().optional(),
  cwd: z.unknown().optional(),
  workspace: z.unknown().optional(),
  worker_name: z.unknown().optional(),
  workspace_name: z.unknown().optional(),
  writes: z.unknown().optional(),
  judgment: z.unknown().optional(),
  report_path: z.unknown().optional(),
  verify: z.unknown().optional(),
  last_progress_path: z.unknown().optional(),
  continues: z.unknown().optional(),
  vendor_session: z.unknown().optional(),
  pick_source: z.unknown().optional(),
  phase: z.unknown().optional(),
  cost_usd: z.unknown().optional(),
  started_at: z.unknown().optional(),
});
function optionalString(value: unknown): string | undefined {
  const parsed = z.string().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
function optionalNullableString(value: unknown): string | null | undefined {
  const parsed = z.string().nullable().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
function optionalNumber(value: unknown): number | undefined {
  const parsed = z.number().safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
/** Read the Job segment's named runs from the shared last-good agx snapshot. */
export async function agxJobRunsAsync(
  sessionId: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<JobRun[]> {
  const rows = (await readAgxSnapshotAsync(env)).rows ?? [];
  if (sessionId === undefined || sessionId === "") return [];
  return rows.flatMap((value) => {
    const parsed = AgxLsRowSchema.safeParse(value);
    if (!parsed.success) return [];
    const run = parsed.data;
    return run.state === "running" && run.dispatcher_session === sessionId
      ? [
          {
            id: run.id,
            ticket: run.ticket,
            state: run.state,
            dispatcher_session: run.dispatcher_session,
          },
        ]
      : [];
  });
}
/** Read the cached agx ls rows for Run display and count malformed rows. */
export async function agxRouteRunsAsync(
  env: NodeJS.ProcessEnv = process.env,
  sessionId?: string,
  enrichRows = false,
  renderCwd = process.cwd(),
): Promise<RouteScan> {
  if (!enrichRows) return readCoreRuns(env, sessionId, renderCwd);
  const enrichment = enrichRows ? await import("./codex-rate.ts") : undefined;
  const snapshot = await readAgxSnapshotAsync(env, renderCwd);
  const rows = snapshot.rows ?? [];
  const now = Temporal.Now.instant();
  const dispatcherSession = currentDispatcherSession(sessionId);
  const runs: RouteRun[] = [];
  let unreadable = 0;
  const summary = snapshot.summary;
  const session =
    summary?.sessions[dispatcherSession ?? ""] ?? summary?.noSession;
  for (const value of rows) {
    const parsed = AgxLsRowSchema.safeParse(value);
    if (!parsed.success) {
      unreadable += 1;
      continue;
    }
    const row = parsed.data;
    if (row.state !== "running" && row.health !== "orphaned") continue;
    const recordedWorkspace = optionalString(row.workspace_name);
    const workspacePath =
      optionalString(row.workspace) ?? optionalString(row.cwd);
    const startedAt = optionalString(row.started_at);
    const secs =
      startedAt === undefined
        ? undefined
        : fromThrowable(() =>
            Math.max(
              0,
              Math.floor(
                now.since(Temporal.Instant.from(startedAt)).total("seconds"),
              ),
            ),
          )().unwrapOr(undefined);
    const enrich =
      enrichRows &&
      row.state === "running" &&
      row.dispatcher_session === dispatcherSession;
    const rolloutRoot = join(env.HOME ?? homedir(), ".codex", "sessions");
    let vendorSession = optionalNullableString(row.vendor_session) ?? undefined;
    const cwd = optionalString(row.cwd);
    const lastProgressPath = optionalNullableString(row.last_progress_path);
    const continues = optionalNullableString(row.continues);
    if (enrich && vendorSession === undefined && startedAt !== undefined)
      vendorSession =
        cwd === undefined
          ? undefined
          : await enrichment?.resolveCodexSession(rolloutRoot, cwd, startedAt);
    const activity =
      !enrich || vendorSession === undefined
        ? undefined
        : await enrichment?.readCodexActivity(rolloutRoot, vendorSession, cwd);
    let doing: RouteRun["doing"];
    if (activity !== undefined) {
      doing = {
        ...activity,
        ...(vendorSession === undefined ? {} : { session: vendorSession }),
      };
    } else if (enrich) {
      doing = await progressFromRun(
        agxStateDir(env),
        row.id,
        lastProgressPath ?? undefined,
        cwd,
      );
    }
    const cost = enrich
      ? await liveCodexCost(
          row.row,
          vendorSession,
          doing?.costUsd,
          undefined,
          true,
          rolloutRoot,
        )
      : undefined;
    runs.push({
      displayId: undefined,
      choice: row.row,
      label: row.ticket,
      workerName: optionalString(row.worker_name),
      workspaceName:
        recordedWorkspace ??
        (workspacePath === undefined ? undefined : basename(workspacePath)),
      pickSource:
        optionalString(row.pick_source) ??
        (continues === null || continues === undefined ? "agx" : "resume"),
      phase: optionalString(row.phase),
      workerSession: vendorSession,
      markerCostUsd: optionalNumber(row.cost_usd) ?? cost,
      secs,
      alive: row.state === "running",
      dispatcherSession: row.dispatcher_session ?? undefined,
      doing,
    });
  }
  return {
    runs,
    unreadable,
    actions: {
      judge:
        dispatcherSession === undefined
          ? (snapshot.repositoryJudgments ?? 0)
          : (snapshot.judgments?.[dispatcherSession] ?? 0),
      judgeWhy: dispatcherSession === undefined ? snapshot.judgeWhy : undefined,
      land: snapshot.land ?? 0,
    },
    fleet:
      summary === undefined || session === undefined
        ? undefined
        : {
            running: summary.running,
            ...session,
            unattributed: summary.unattributed,
            lost: snapshot.findings?.lost,
          },
    workspaces: snapshot.workspaces,
    findings: snapshot.findings,
    ...(snapshot.ageSeconds === undefined
      ? {}
      : { snapshotAgeSecs: snapshot.ageSeconds }),
    ...(snapshot.reason === undefined ? {} : { snapshotWhy: snapshot.reason }),
  };
}
// A claude worker's --progress-file (<state>/runs/<id>/worker-progress.jsonl): its newest line is
// the progress snapshot (last tool/command, counts, cost). undefined until the first event lands.
async function progressFromWorker(
  stateRoot: string,
  runId: string,
  cwd?: string,
): Promise<RouteRun["doing"]> {
  const text = await Bun.file(
    join(stateRoot, "runs", runId, "worker-progress.jsonl"),
  )
    .text()
    .catch(() => null);
  const line = text
    ?.split(/\r?\n/u)
    .findLast((candidate) => candidate.trim() !== "");
  if (line === undefined || !jsonOf(ProgressSchema).safeParse(line).success)
    return undefined;
  return progressFromText(line, cwd);
}
// The worker's own progress file first; the latest interim return when it has not written yet.
async function progressFromRun(
  stateRoot: string,
  runId: string,
  interimPath: string | undefined,
  cwd?: string,
): Promise<RouteRun["doing"]> {
  const worker = await progressFromWorker(stateRoot, runId, cwd);
  if (worker !== undefined || interimPath === undefined) return worker;
  return progressFromReturn(interimPath, cwd);
}
async function progressFromReturn(
  path: string,
  cwd?: string,
): Promise<RouteRun["doing"]> {
  const text = await Bun.file(path)
    .text()
    .catch(() => null);
  if (text === null) return undefined;
  return progressFromText(text, cwd);
}
function progressFromText(text: string, cwd?: string): RouteRun["doing"] {
  const parsed = jsonOf(ProgressSchema).safeParse(text);
  if (parsed.success) {
    return {
      last: actionLine(parsed.data.last, cwd) ?? "",
      commands: parsed.data.commands,
      files: parsed.data.files,
      ageSecs: sinceSecs(parsed.data.at).unwrapOr(0),
      ...(parsed.data.cost_usd === undefined
        ? {}
        : { costUsd: parsed.data.cost_usd }),
      ...(parsed.data.session === undefined
        ? {}
        : { session: parsed.data.session }),
    };
  }
  const first = actionLine(text, cwd);
  return first === undefined || first === ""
    ? undefined
    : { last: first, commands: 0, files: 0, ageSecs: 0 };
}
const pidAlive = fromThrowable((pid: number) => process.kill(pid, 0));
const sinceSecs = fromThrowable((iso: string) =>
  Math.max(
    0,
    Math.floor(
      Temporal.Now.instant().since(Temporal.Instant.from(iso)).total("seconds"),
    ),
  ),
);
const listDir = fromThrowable((dir: string) => readdirSync(dir));
async function liveCodexCost(
  choice: string,
  session: string | undefined,
  progressCost: number | undefined,
  usage: z.output<typeof ProgressSchema>["usage"],
  alive: boolean,
  rolloutRoot = join(homedir(), ".codex", "sessions"),
): Promise<number | undefined> {
  if (
    progressCost !== undefined ||
    usage !== undefined ||
    session === undefined ||
    !alive
  )
    return progressCost;
  const price = dispatchRowPrice(choice);
  if (price?.route !== "codex") return progressCost;
  const { readCodexUsage } = await import("./codex-rate.ts");
  const tokens = await readCodexUsage(rolloutRoot, session);
  return tokens === undefined ? progressCost : costUsd(price, tokens);
}
// Sync compatibility scan retained for sync callers; buildDataframe uses routeRunsAsync.
export function routeRuns(
  env: NodeJS.ProcessEnv = process.env,
): Result<RouteScan, string> | undefined {
  const dirs = activeDirs(env).filter((dir) => existsSync(dir));
  if (dirs.length === 0) return undefined;
  const seen = new Set<string>();
  const runs: RouteRun[] = [];
  let unreadable = 0;
  const markers: { dir: string; name: string }[] = [];
  for (const dir of dirs) {
    const names = listDir(dir);
    if (names.isErr()) return err(`cannot list ${dir}`);
    markers.push(
      ...names.value
        .filter(
          (name) => name.endsWith(".json") && !name.endsWith(".progress.json"),
        )
        .map((name) => ({ dir, name })),
    );
  }
  for (const { dir, name } of markers) {
    const text = readText(join(dir, name));
    if (text.isErr()) {
      unreadable += 1;
      continue;
    }
    const parsed = parseActiveMarker(text.value);
    if (parsed.kind === "malformed") continue;
    if (parsed.kind === "unreadable") {
      unreadable += 1;
      continue;
    }
    const a = parsed.marker;
    if (seen.has(a.run_id)) continue;
    seen.add(a.run_id);
    runs.push({
      displayId: a.display_id,
      choice: a.choice,
      label: a.label,
      pickSource: a.pick_source,
      phase: a.phase,
      workerSession: a.worker_session,
      markerCostUsd: a.cost_usd,
      secs: sinceSecs(a.started_at).unwrapOr(0),
      alive: pidAlive(a.pid).isOk(),
      dispatcherSession: a.dispatcher_session,
      doing: doingOf(dir, a.run_id),
    });
  }
  return ok({ runs, unreadable });
}
/** Async render-path version; marker and progress files are read without blocking the line. */
export async function routeRunsAsync(
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<RouteScan, string> | undefined> {
  const listings = await Promise.all(
    activeDirs(env).map((dir) =>
      readdir(dir).then(
        (names) => ({ dir, names, error: null }),
        (error: unknown) => {
          const missing = execError(error).code === "ENOENT";
          return {
            dir,
            names: null,
            error: missing ? null : `cannot list ${dir}`,
          };
        },
      ),
    ),
  );
  const failed = listings.find(({ error }) => error !== null);
  if (failed !== undefined && failed.error !== null) return err(failed.error);
  if (listings.every(({ names }) => names === null)) return undefined;
  const markers = listings.flatMap(({ dir, names }) =>
    (names ?? [])
      .filter(
        (name) => name.endsWith(".json") && !name.endsWith(".progress.json"),
      )
      .map((name) => ({ dir, name })),
  );
  const markerReads = await Promise.all(
    markers.map(async ({ dir, name }) => {
      const text = await Bun.file(join(dir, name))
        .text()
        .catch(() => null);
      return {
        dir,
        parsed:
          text === null
            ? ({ kind: "unreadable", reason: "file read failed" } as const)
            : parseActiveMarker(text),
      };
    }),
  );
  const unreadable = markerReads.filter(
    ({ parsed }) => parsed.kind === "unreadable",
  ).length;
  const seen = new Set<string>();
  const unique = markerReads.flatMap(({ dir, parsed }) => {
    if (parsed.kind !== "valid" || seen.has(parsed.marker.run_id)) return [];
    seen.add(parsed.marker.run_id);
    return [{ dir, active: parsed.marker }];
  });
  const runs = await Promise.all(
    unique.map(async ({ dir, active: a }) => {
      const alive = pidAlive(a.pid).isOk();
      const progressText = await Bun.file(
        join(dir, `${a.run_id}.progress.json`),
      )
        .text()
        .catch(() => null);
      let p: z.output<typeof ProgressSchema> | undefined;
      if (progressText !== null) {
        const progress = jsonOf(ProgressSchema).safeParse(progressText);
        if (progress.success) p = progress.data;
      }
      const progressSession = p?.session;
      let doing: RouteRun["doing"];
      if (p !== undefined) {
        const liveCost = await liveCodexCost(
          a.choice,
          progressSession,
          p.cost_usd,
          p.usage,
          alive,
        );
        doing = {
          last: p.last,
          commands: p.commands,
          files: p.files,
          ageSecs: sinceSecs(p.at).unwrapOr(0),
          ...(liveCost === undefined ? {} : { costUsd: liveCost }),
          ...(progressSession === undefined
            ? {}
            : { session: progressSession }),
        };
      }
      return {
        displayId: a.display_id,
        choice: a.choice,
        label: a.label,
        pickSource: a.pick_source,
        phase: a.phase,
        workerSession: a.worker_session,
        markerCostUsd: a.cost_usd,
        secs: sinceSecs(a.started_at).unwrapOr(0),
        alive,
        dispatcherSession: a.dispatcher_session,
        doing,
      } satisfies RouteRun;
    }),
  );
  return ok({ runs, unreadable });
}
// This session's Run rows: one line per worker, like Claude Code's own background panel — "<row>
// <elapsed> <label> │ <doing>". Other sessions' workers are one count. No "Run:" head (owner
// 2026-10-06: 「Run: って labelは不要では？」): the row id
// (luna-high, sonnet-medium) already says what the line is, and the head cost every line 5 columns.
// Every own live worker gets a row. Stale and unreadable markers get summary counts.
// "│ $ bun test x.ts · 12 cmd · 3 files": the worker's latest event, then what it has done so far.
// Older than a minute it says how old (a worker deep in reasoning prints nothing for a while — that
// is shown as age, not hidden). No progress file yet = no event yet, said as such.

export { readCoreRuns } from "./core-runs.ts";
export { routeLines, currentDispatcherSession } from "./dispatch-display.ts";
