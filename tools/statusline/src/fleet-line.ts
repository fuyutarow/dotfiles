import type { RouteScan } from "./dispatch-runs.ts";

// Only findings with a clearing command belong here. Historical counters stay in doctor.
const ACTIONS: Record<string, string> = {
  stale: "ws refresh",
  abandoned: "ws gc --abandoned",
  "legacy-empty": "ws gc --legacy",
  "legacy-layout": "ws gc --legacy",
  empty: "ws gc --include-unrecorded",
  collectable: "ws gc --include-unrecorded",
  "unlanded-72h": "mise run land",
  "accepted-landed-present": "tkt gc",
};

/** One optional action row, assembled exclusively from owner-published facts. */
export function fleetLine(
  scan: RouteScan | undefined,
  at = Temporal.Now.instant().epochMilliseconds,
): string {
  const parts: string[] = [];
  if (scan?.actions?.judgeWhy !== undefined)
    parts.push(`judge n/a (${scan.actions.judgeWhy})`);
  if ((scan?.actions?.judge ?? 0) > 0)
    parts.push(`judge ${scan?.actions?.judge} (agx judge)`);
  if ((scan?.actions?.land ?? 0) > 0)
    parts.push(`land ${scan?.actions?.land} (mise run land)`);
  const commands = new Map<string, number>();
  for (const [kind, count] of Object.entries(
    scan?.findings?.kinds ?? {},
  ).toSorted(([a], [b]) => a.localeCompare(b))) {
    const command = ACTIONS[kind];
    if (command !== undefined && count > 0)
      commands.set(command, (commands.get(command) ?? 0) + count);
  }
  for (const [command, count] of commands) parts.push(`⚠ ${command} ${count}`);
  if ((scan?.fleet?.other ?? 0) > 0)
    parts.push(`+${scan?.fleet?.other} workers in other sessions`);
  // Event-driven owners have no elapsed-time expiry. A missed publication or
  // failed read names the affected source and keeps its original observation age.
  const stale: string[] = [];
  if ((scan?.snapshotAgeSecs ?? 0) > 60)
    stale.push(`stale runs ${scan?.snapshotAgeSecs}s`);
  for (const [name, source] of [
    ["ws", scan?.workspaces],
    ["doctor", scan?.findings],
  ] as const)
    if (source?.stale === true && at - source.capturedAt > 60_000)
      stale.push(
        `stale ${name} ${Math.floor((at - source.capturedAt) / 1000)}s`,
      );
  // Source age is supporting detail, never a bottom row without an action.
  return parts.length === 0 ? "" : [...parts, ...stale].join(" · ");
}
