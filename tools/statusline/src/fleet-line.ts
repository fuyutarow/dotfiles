import type { RouteScan } from "./dispatch-runs.ts";

/** Cached facts only: neither jj nor a classifier belongs on the render path. */
export function fleetLine(
  scan: RouteScan | undefined,
  at = Temporal.Now.instant().epochMilliseconds,
): string {
  const workers = scan?.fleet;
  const ws = scan?.workspaces;
  const findings = scan?.findings;
  const age = Math.max(
    scan?.snapshotAgeSecs ?? 0,
    ws?.stale === true
      ? Math.max(1, Math.floor((at - ws.capturedAt) / 1000))
      : 0,
    findings?.stale === true
      ? Math.max(1, Math.floor((at - findings.capturedAt) / 1000))
      : 0,
  );
  let freshness = "unknown";
  if (
    workers !== undefined &&
    ws !== undefined &&
    ws.fleetKnown !== false &&
    findings !== undefined
  )
    freshness = age === 0 ? "" : `stale(${age}s)`;
  else if (age > 0) freshness = `stale(${age}s) unknown`;
  const anomalies = Object.entries(findings?.kinds ?? {})
    .filter(([, count]) => count > 0)
    .toSorted(([a], [b]) => a.localeCompare(b));
  const health = findings === undefined ? ["anomalies unknown"] : ["ok"];
  if (anomalies.length > 0)
    health.splice(
      0,
      1,
      ...anomalies.map(
        ([kind, count], index) => `${index === 0 ? "⚠ " : ""}${kind} ${count}`,
      ),
    );
  const other = workers === undefined ? 0 : workers.other;
  const workerSummary = `workers ${workers?.here ?? "unknown"} running`;
  return [
    workerSummary + (other > 0 ? ` (+${other} in other sessions)` : ""),
    `lost ${findings?.lost ?? workers?.lost ?? "unknown"}`,
    `ws ${ws?.here === undefined ? "" : `${ws.here} here · `}${ws?.fleetKnown === false ? "unknown" : (ws?.total ?? "unknown")} all`,
    `unlanded ${ws?.fleetKnown === false ? "unknown" : (ws?.unlanded ?? "unknown")}`,
    `collectable ${ws?.fleetKnown === false ? "unknown" : (ws?.collectable ?? "unknown")}`,
    `legacy ${ws?.fleetKnown === false ? "unknown" : (ws?.legacy ?? "unknown")}${freshness === "" ? "" : ` ${freshness}`}`,
    ...health,
  ].join(" · ");
}
