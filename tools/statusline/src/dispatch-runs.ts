import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, z } from "./zod.ts";
import { activeDirs, ProgressSchema } from "./dispatch-state.ts";
import { DIM, ESC, RST } from "./ansi.ts";
import { dur } from "./jobs.ts";
import { readCodexUsage } from "./codex-rate.ts";
import { parseActiveMarker } from "../../shared/src/dispatch-state.ts";
import {
  costUsd,
  dispatchRowPrice,
  formatCostUsd,
} from "../../shared/src/dispatch-pricing.ts";
import { homedir } from "node:os";

// Run row source: one marker per worker agx started (tools/agx/src/state.ts).
// A marker is written at start and removed at exit, so a marker whose process is gone means
// agx itself was killed — counted as stale, never dropped (EXPLICIT-ABSENCE).
export interface RouteRun {
  displayId: string | undefined;
  choice: string;
  label: string;
  pickSource: string;
  phase: string | undefined;
  workerSession: string | undefined;
  markerCostUsd: number | undefined;
  secs: number;
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
  const tokens = await readCodexUsage(
    join(homedir(), ".codex", "sessions"),
    session,
  );
  return tokens === undefined ? progressCost : costUsd(price, tokens);
}
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
    activeDirs(env).map(async (dir) => ({
      dir,
      names: await readdir(dir).catch(() => null),
    })),
  );
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
    return `${DIM}│${RST} ${d.last}${age} ${DIM}· ${d.commands} cmd · ${d.files} files${RST}`;
  }
  if (phase !== "working") return `${DIM}│${RST} ${phase}`;
  if (d === undefined || d.last === "starting")
    return `${DIM}│${RST} working · no event yet`;
  const age = d.ageSecs >= 60 ? ` ${DIM}(${dur(d.ageSecs)} ago)${RST}` : "";
  const activity = `${d.last}${age} ${DIM}· ${d.commands} cmd · ${d.files} files${RST}`;
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
  const live = runs.filter((r) => r.alive).toSorted((a, b) => b.secs - a.secs);
  const stale = runs.length - live.length;
  const attributed = live.filter(
    (r) => r.dispatcherSession !== undefined && r.dispatcherSession !== "",
  );
  const unattributed = live.length - attributed.length;
  const own =
    sessionId === undefined || sessionId === ""
      ? []
      : attributed.filter((r) => r.dispatcherSession === sessionId);
  const other = attributed.length - own.length;
  const shown = own;
  const sessions = sessionDisplays(shown);
  const sessionWidth = Math.max(
    0,
    ...sessions.map((value) => Bun.stringWidth(value)),
  );
  const choices = shown.map((r) => r.choice);
  const elapsed = shown.map((r) => dur(r.secs));
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
      `${padDisplay(choices[i] ?? "", choiceWidth)} ${padDisplay(elapsed[i] ?? "", elapsedWidth, true)} ${costText(costs[i], costWidth)}${sessionText(sessions[i] ?? "", sessionWidth, reserveSession)}${DIM}${padDisplay(labels[i] ?? "", labelWidth)}${RST} ${doingText(r.doing, r.phase)}`,
  );
  const summary = [
    ...(other > 0 ? [`${DIM}+${other} in other sessions${RST}`] : []),
    ...(unattributed > 0 ? [`${DIM}unattributed ${unattributed}${RST}`] : []),
    ...(stale > 0 ? [`${ESC}[38;5;167mstale ${stale}${RST}`] : []),
    ...(unreadable > 0
      ? [`${ESC}[38;5;178munreadable ${unreadable}${RST}`]
      : []),
  ];
  if (summary.length > 0) lines.push(summary.join(` ${DIM}·${RST} `));
  return lines;
}
