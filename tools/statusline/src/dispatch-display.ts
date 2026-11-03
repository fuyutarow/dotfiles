import { DIM, RST, renderUnavailable, unavailable } from "./ansi.ts";
import { dur } from "./jobs.ts";
import { relative } from "node:path";
import { formatCostUsd } from "@dotfiles/shared/src/dispatch-pricing.ts";
import type { RouteRun, RouteScan } from "./dispatch-runs.ts";

export function actionLine(value: string, cwd?: string): string | undefined {
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
function doingText(
  d: RouteRun["doing"],
  phase: string | undefined,
  coreState?: RouteRun["coreState"],
): string {
  if (coreState !== undefined && d === undefined)
    return `${DIM}│${RST} ${phase ?? coreState}`;
  if (phase === undefined) {
    if (d === undefined) return `${DIM}│ no event yet${RST}`;
    const age =
      d.ageSecs !== undefined && d.ageSecs >= 60
        ? ` ${DIM}(${dur(d.ageSecs)} ago)${RST}`
        : "";
    return `${DIM}│${RST} ${displayAction(d.last)}${age} ${DIM}· ${d.commands ?? "n/a"} cmd · ${d.files ?? "n/a"} files${RST}`;
  }
  if (phase !== "working") return `${DIM}│${RST} ${phase}`;
  if (d === undefined || d.last === "starting")
    return `${DIM}│${RST} working · no event yet`;
  const age =
    d.ageSecs !== undefined && d.ageSecs >= 60
      ? ` ${DIM}(${dur(d.ageSecs)} ago)${RST}`
      : "";
  const activity = `${displayAction(d.last)}${age} ${DIM}· ${d.commands ?? "n/a"} cmd · ${d.files ?? "n/a"} files${RST}`;
  return `${DIM}│${RST} working · ${activity}`;
}

function costText(value: number | undefined, width: number): string {
  if (width === 0) return "";
  return `${padDisplay(costLabel(value), width)} `;
}
function costLabel(value: number | undefined): string {
  return value === undefined
    ? `$${renderUnavailable(unavailable("not reported"))}`
    : formatCostUsd(value);
}
const RUN_LABEL_WIDTH = 32;
const TICKET_NAME_WIDTH = 48;
const WORKER_NAME_PREFIX = /^(?:agx-|agt_)/u;
const WORKSPACE_NAME_PREFIX = /^ws_/u;
/**
 * The ticket is the row's name. The workspace and worker are appended only
 * when they carry something the ticket does not: agx names the worker
 * agx-<ticket> and the workspace ws_<ticket> by default.
 */
function runName(run: RouteRun): string {
  const resume = run.pickSource === "resume";
  const ticket = resume
    ? run.label.replace(/^resume(?::|\b)\s*/iu, "")
    : run.label;
  const shownTicket = truncateDisplay(ticket, TICKET_NAME_WIDTH);
  const head = resume ? `resume: ${shownTicket}` : shownTicket;
  const workspace = run.workspaceName?.replace(WORKSPACE_NAME_PREFIX, "");
  const worker = run.workerName?.replace(WORKER_NAME_PREFIX, "");
  const parts = [head];
  if (workspace !== undefined && workspace !== "" && workspace !== ticket)
    parts.push(`@${workspace}`);
  if (worker !== undefined && worker !== "" && worker !== ticket)
    parts.push(`(agt_${worker})`);
  return parts.join(" ");
}
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
  scope: string | readonly string[] | undefined,
  _unreadable = 0,
  _counts?: Partial<NonNullable<RouteScan["fleet"]>>,
): string[] {
  const live = runs
    .filter((r) => r.alive)
    .toSorted((a, b) => (b.secs ?? -1) - (a.secs ?? -1));

  const attributed = live.filter(
    (r) => r.dispatcherSession !== undefined && r.dispatcherSession !== "",
  );

  const dispatcherSessions =
    typeof scope === "string" ? new Set([scope]) : new Set(scope ?? []);
  const own = attributed.filter((r) =>
    dispatcherSessions.has(r.dispatcherSession ?? ""),
  );
  const shown = own;
  const choices = shown.map((r) => r.choice);
  const elapsed = shown.map((r) =>
    r.secs === undefined
      ? renderUnavailable(unavailable("start time unavailable"))
      : dur(r.secs),
  );
  const costs = shown.map((r) =>
    r.phase === "working"
      ? (r.doing?.costUsd ?? r.markerCostUsd)
      : (r.markerCostUsd ?? r.doing?.costUsd),
  );
  const costLabels = costs.map((value) => costLabel(value));
  const costWidth = Math.max(
    0,
    ...costLabels.map((value) => Bun.stringWidth(value)),
  );
  const names = shown.map((run) => runName(run));
  const choiceWidth = Math.max(
    0,
    ...choices.map((value) => Bun.stringWidth(value)),
  );
  const elapsedWidth = Math.max(
    0,
    ...elapsed.map((value) => Bun.stringWidth(value)),
  );
  const nameWidth = Math.max(
    0,
    ...names.map((value) => Bun.stringWidth(value)),
  );
  const lines = shown.map(
    (r, i) =>
      `${padDisplay(choices[i] ?? "", choiceWidth)} ${padDisplay(elapsed[i] ?? "", elapsedWidth, true)} ${costText(costs[i], costWidth)}${DIM}${padDisplay(names[i] ?? "", nameWidth)}${RST} ${doingText(r.doing, r.phase, r.coreState)}`,
  );
  return lines;
}

/** An explicitly selected display session wins over the invoking shell's identity. */
export function currentDispatcherSession(
  payloadSession: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return [
    payloadSession,
    env["AGX_DISPATCHER_SESSION"],
    env["CLAUDE_CODE_SESSION_ID"],
  ]
    .find((value) => value !== undefined && value.trim() !== "")
    ?.trim();
}
