import type { RouteScan } from "./dispatch-runs.ts";

// Only findings with a clearing command belong here. Historical counters stay in doctor.
const ACTIONS: Record<string, string> = {
  stale: "agx ws refresh",
  abandoned: "agx ws gc --abandoned",
  "legacy-empty": "agx ws gc --legacy",
  "legacy-layout": "agx ws gc --legacy",
  empty: "agx ws gc --include-unrecorded",
  collectable: "agx ws gc --include-unrecorded",
  "unlanded-72h": "mise run land",
  "accepted-landed-present": "agx ticket gc",
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
    parts.push(`judge ${scan?.actions?.judge} (agx worker judge)`);
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
  if ((scan?.fleet?.other ?? 0) > 0) {
    const count = scan?.fleet?.other;
    if (scan?.inventorySessions !== undefined)
      parts.push(
        `+${count} workers outside ${scan.inventorySessions.length} displayed session${scan.inventorySessions.length === 1 ? "" : "s"}`,
      );
    else if (scan?.sessionScope !== undefined)
      parts.push(`+${count} workers outside session ${scan.sessionScope}`);
    else parts.push(`+${count} workers in other sessions`);
  }
  // Event-driven owners have no elapsed-time expiry. A missed publication or
  // failed read names the affected source and keeps its original observation age.
  const stale: string[] = [];
  if ((scan?.snapshotAgeSecs ?? 0) > 0)
    parts.push(`stale runs ${scan?.snapshotAgeSecs}s`);
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
