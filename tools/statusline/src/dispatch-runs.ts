import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { homedir } from "node:os";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, z } from "./zod.ts";
import { execError } from "./bounded.ts";
import { activeDirs, ProgressSchema } from "./dispatch-state.ts";
import { DIM, ESC, RST } from "./ansi.ts";
import { dur } from "./jobs.ts";
import {
  readCodexActivity,
  readCodexUsage,
  resolveCodexSession,
} from "./codex-rate.ts";
import { parseActiveMarker } from "../../shared/src/dispatch-state.ts";
import {
  costUsd,
  dispatchRowPrice,
  formatCostUsd,
} from "../../shared/src/dispatch-pricing.ts";
import {
  readAgxSnapshotAsync,
  stateDir as agxStateDir,
} from "./agx-snapshot.ts";

// Run row source: one marker per worker agx-run started (tools/agx-run/src/state.ts).
// A marker is written at start and removed at exit, so a marker whose process is gone means
// agx itself was killed — counted as lost (agx's own word), never dropped (EXPLICIT-ABSENCE).
export interface RouteRun {
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
// The lost count is the agx store fold: route runs include running rows and every
// ended/lost row, so counting the latter matches `agx stats --json`'s `lost` field.
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
function runPhase(row: z.output<typeof AgxLsRowSchema>): string | undefined {
  if (row.state !== "running") return undefined;
  return "working";
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
  enrichRows = true,
): Promise<RouteScan> {
  const snapshot = await readAgxSnapshotAsync(env);
  const rows = snapshot.rows ?? [];
  const now = Temporal.Now.instant();
  const dispatcherSession = currentDispatcherSession(sessionId);
  const runs: RouteRun[] = [];
  let unreadable = 0;
  for (const value of rows) {
    const parsed = AgxLsRowSchema.safeParse(value);
    if (!parsed.success) {
      unreadable += 1;
      continue;
    }
    const row = parsed.data;
    if (row.state !== "running" && row.outcome !== "lost") continue;
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
    const phase = runPhase(row);
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
          : await resolveCodexSession(rolloutRoot, cwd, startedAt);
    const activity =
      !enrich || vendorSession === undefined
        ? undefined
        : await readCodexActivity(rolloutRoot, vendorSession, cwd);
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
      phase: optionalString(row.phase) ?? phase,
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
function actionLine(value: string, cwd?: string): string | undefined {
  const first = value.split(/\r?\n|\\n/u, 1)[0]?.trim();
  if (first === undefined || first === "") return undefined;
  const edit = first.match(/^editing\s+(.+)$/u);
  const path = edit?.[1];
  if (cwd !== undefined && path !== undefined && path.startsWith("/"))
    return `editing ${relative(cwd, path)}`;
  return first;
}
function displayAction(value: string): string {
  const action = actionLine(value) ?? "";
  return action.startsWith("editing ")
    ? truncateDisplay(action, RUN_LABEL_WIDTH)
    : action;
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
function doingText(d: RouteRun["doing"], phase: string | undefined): string {
  if (phase === undefined) {
    if (d === undefined) return `${DIM}│ no event yet${RST}`;
    const age = d.ageSecs >= 60 ? ` ${DIM}(${dur(d.ageSecs)} ago)${RST}` : "";
    return `${DIM}│${RST} ${displayAction(d.last)}${age} ${DIM}· ${d.commands} cmd · ${d.files} files${RST}`;
  }
  if (phase !== "working") return `${DIM}│${RST} ${phase}`;
  if (d === undefined || d.last === "starting")
    return `${DIM}│${RST} working · no event yet`;
  const age = d.ageSecs >= 60 ? ` ${DIM}(${dur(d.ageSecs)} ago)${RST}` : "";
  const activity = `${displayAction(d.last)}${age} ${DIM}· ${d.commands} cmd · ${d.files} files${RST}`;
  return `${DIM}│${RST} working · ${activity}`;
}

// The worker's vendor id (codex thread, claude session), shortened without UUIDv7's shared
// timestamp prefix. Extend the tail only for rows that still collide. Same rules as the former
// Claude statusline, now in tools/statusline (cbc82bdc): an id shorter than 8 characters gets a shorter
// tail and an empty id is absent. Keep the rendered id ASCII-only so both collision checks and
// column padding use the same unambiguous width.
function growSessionTail(
  group: number[],
  ids: string[],
  tailLengths: number[],
): boolean {
  let grew = false;
  for (const index of group) {
    const maxTail = (ids[index] ?? "").length - 4;
    const tailLength = tailLengths[index] ?? 0;
    if (tailLength < maxTail) {
      tailLengths[index] = tailLength + 1;
      grew = true;
    }
  }
  return grew;
}
function sessionDisplays(shown: RouteRun[]): string[] {
  const ids = shown.map(
    (run) =>
      (run.doing?.session ?? run.workerSession)?.replaceAll("-", "") ?? "",
  );
  const tailLengths = ids.map((id) =>
    id === "" ? 0 : Math.min(4, Math.max(0, id.length - 4)),
  );
  const displayFor = (index: number): string => {
    const displayId = shown[index]?.displayId;
    if (displayId !== undefined) return displayId;
    const id = ids[index] ?? "";
    if (id === "") return "";
    const tailLength = tailLengths[index] ?? 0;
    const tail = tailLength === 0 ? "" : id.slice(-tailLength);
    const base = `${id.slice(0, 4)}..${tail}`;
    return base;
  };
  let displays = ids.map((_, index) => displayFor(index));
  for (;;) {
    const groups = new Map<string, number[]>();
    displays.forEach((display, index) => {
      if (display === "") return;
      const group = groups.get(display) ?? [];
      group.push(index);
      groups.set(display, group);
    });
    const collisions = [...groups.values()].filter((group) => group.length > 1);
    if (collisions.length === 0) break;
    let grew = false;
    for (const group of collisions)
      grew = growSessionTail(group, ids, tailLengths) || grew;
    if (!grew) break;
    displays = ids.map((_, index) => displayFor(index));
  }
  return displays;
}
function sessionText(value: string, width: number, reserve: boolean): string {
  if (value === "") return reserve ? " ".repeat(width + 1) : "";
  return `${ESC}[38;5;240m${padDisplay(value, width)}${RST} `;
}
function costText(value: number | undefined, width: number): string {
  if (width === 0) return "";
  if (value === undefined) return `${padDisplay("$–", width)} `;
  return `${padDisplay(costLabel(value), width)} `;
}
function costLabel(value: number): string {
  return formatCostUsd(value);
}
const RUN_LABEL_WIDTH = 32;
function truncateDisplay(value: string, width: number): string {
  let result = "";
  for (const char of value) {
    if (Bun.stringWidth(result + char) > width) break;
    result += char;
  }
  return result;
}
function padDisplay(value: string, width: number, left = false): string {
  const padding = " ".repeat(Math.max(0, width - Bun.stringWidth(value)));
  return left ? padding + value : value + padding;
}
export function routeLines(
  runs: RouteRun[],
  sessionId: string | undefined,
  unreadable = 0,
): string[] {
  const live = runs
    .filter((r) => r.alive)
    .toSorted((a, b) => (b.secs ?? -1) - (a.secs ?? -1));
  const lost = runs.filter((run) => !run.alive).length;
  const attributed = live.filter(
    (r) => r.dispatcherSession !== undefined && r.dispatcherSession !== "",
  );
  const unattributed = live.length - attributed.length;
  const dispatcherSession = currentDispatcherSession(sessionId);
  const own =
    dispatcherSession === undefined || dispatcherSession === ""
      ? []
      : attributed.filter((r) => r.dispatcherSession === dispatcherSession);
  const other = attributed.length - own.length;
  const shown = own;
  const sessions = sessionDisplays(shown);
  const sessionWidth = Math.max(
    0,
    ...sessions.map((value) => Bun.stringWidth(value)),
  );
  const choices = shown.map((r) => r.choice);
  const elapsed = shown.map((r) =>
    r.secs === undefined ? "n/a" : dur(r.secs),
  );
  const costs = shown.map((r) =>
    r.phase === "working"
      ? (r.doing?.costUsd ?? r.markerCostUsd)
      : (r.markerCostUsd ?? r.doing?.costUsd),
  );
  const costLabels = costs.map((value) =>
    value === undefined ? "$–" : costLabel(value),
  );
  const costWidth = Math.max(
    0,
    ...costLabels.map((value) => Bun.stringWidth(value)),
  );
  const labels = shown.map((r) =>
    truncateDisplay(
      r.pickSource === "resume" && !/^resume(?::|\b)/iu.test(r.label)
        ? `resume: ${r.label}`
        : r.label,
      RUN_LABEL_WIDTH,
    ),
  );
  const identities = shown.map((run) =>
    run.workerName === undefined || run.workspaceName === undefined
      ? ""
      : `${run.workerName}@${run.workspaceName}`,
  );
  const identityWidth = Math.max(
    0,
    ...identities.map((value) => Bun.stringWidth(value)),
  );
  const choiceWidth = Math.max(
    0,
    ...choices.map((value) => Bun.stringWidth(value)),
  );
  const elapsedWidth = Math.max(
    0,
    ...elapsed.map((value) => Bun.stringWidth(value)),
  );
  const labelWidth = Math.max(
    0,
    ...labels.map((value) => Bun.stringWidth(value)),
  );
  const reserveSession = sessionWidth > 0;
  const lines = shown.map(
    (r, i) =>
      `${padDisplay(choices[i] ?? "", choiceWidth)} ${padDisplay(elapsed[i] ?? "", elapsedWidth, true)} ${costText(costs[i], costWidth)}${sessionText(sessions[i] ?? "", sessionWidth, reserveSession)}${DIM}${padDisplay(identities[i] ?? "", identityWidth)}${identities[i] === "" ? "" : " "}${padDisplay(labels[i] ?? "", labelWidth)}${RST} ${doingText(r.doing, r.phase)}`,
  );
  const summary = [
    `${ESC}[38;5;167mlost ${lost}${RST}`,
    ...(other > 0 ? [`${DIM}+${other} in other sessions${RST}`] : []),
    ...(unattributed > 0 ? [`${DIM}unattributed ${unattributed}${RST}`] : []),
    ...(unreadable > 0
      ? [`${ESC}[38;5;178munreadable ${unreadable}${RST}`]
      : []),
  ];
  if (summary.length > 0) lines.unshift(summary.join(` ${DIM}·${RST} `));
  return lines;
}

/** Match agx ls: explicit agx override, Claude session environment, then payload. */
export function currentDispatcherSession(
  payloadSession: string | undefined,
): string | undefined {
  return (
    [process.env.AGX_DISPATCHER_SESSION, process.env.CLAUDE_CODE_SESSION_ID]
      .find((value) => value !== undefined && value.trim() !== "")
      ?.trim() ??
    (payloadSession === undefined || payloadSession.trim() === ""
      ? undefined
      : payloadSession.trim())
  );
}
