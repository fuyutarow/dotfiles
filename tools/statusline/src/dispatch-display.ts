import { DIM, ESC, RST, renderUnavailable, unavailable } from "./ansi.ts";
import { dur } from "./jobs.ts";
import { relative } from "node:path";
import { formatCostUsd } from "../../shared/src/dispatch-pricing.ts";
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
  counts?: Partial<NonNullable<RouteScan["fleet"]>>,
): string[] {
  const live = runs
    .filter((r) => r.alive)
    .toSorted((a, b) => (b.secs ?? -1) - (a.secs ?? -1));

  const attributed = live.filter(
    (r) => r.dispatcherSession !== undefined && r.dispatcherSession !== "",
  );

  const dispatcherSession = currentDispatcherSession(sessionId);
  const own =
    dispatcherSession === undefined || dispatcherSession === ""
      ? []
      : attributed.filter((r) => r.dispatcherSession === dispatcherSession);
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
  const costLabels = costs.map((value) =>
    value === undefined ? "$–" : costLabel(value),
  );
  const costWidth = Math.max(
    0,
    ...costLabels.map((value) => Bun.stringWidth(value)),
  );
  const labels = shown.map((r) =>
    truncateDisplay(
      r.pickSource === "resume"
        ? `resume: tkt_${r.label.replace(/^resume(?::|\b)\s*/iu, "")}`
        : `tkt_${r.label}`,
      RUN_LABEL_WIDTH,
    ),
  );
  const identities = shown.map((run) =>
    run.workerName === undefined || run.workspaceName === undefined
      ? ""
      : `${run.workerName.replace(/^agx-/u, "agt_")}@${run.workspaceName}`,
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
  const lines = shown.map(
    (r, i) =>
      `${padDisplay(choices[i] ?? "", choiceWidth)} ${padDisplay(elapsed[i] ?? "", elapsedWidth, true)} ${costText(costs[i], costWidth)}${DIM}${padDisplay(identities[i] ?? "", identityWidth)}${identities[i] === "" ? "" : " "}${padDisplay(labels[i] ?? "", labelWidth)}${RST} ${doingText(r.doing, r.phase, r.coreState)}`,
  );
  const summary = [
    `${ESC}[38;5;167mlost ${counts?.lost ?? "unknown"}${RST}`,
    ...((counts?.unattributed ?? 0) > 0
      ? [`${DIM}unattributed ${counts?.unattributed}${RST}`]
      : []),
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
