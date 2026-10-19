import { basename } from "node:path";
import { z, recoverInvalid } from "./zod.ts";
import { readAgxSnapshotAsync } from "./agx-snapshot.ts";
import { currentDispatcherSession } from "./dispatch-display.ts";
import type { RouteRun, RouteScan } from "./dispatch-runs.ts";

const Row = z.lazy(() =>
  z.object({
    id: z.string(),
    ticket: z.string(),
    state: z.enum(["running", "ended"]),
    row: z.string(),
    dispatcher_session: z.string().nullable(),
    health: z.string().nullable().optional(),
    workspace: recoverInvalid(z.string()),
    workspace_name: recoverInvalid(z.string()),
    worker_name: recoverInvalid(z.string()),
    phase: recoverInvalid(z.string()),
    cost_usd: recoverInvalid(z.number()),
    vendor_session: z.string().nullable().optional(),
    pick_source: recoverInvalid(z.string()),
    continues: z.string().nullable().optional(),
    elapsed_seconds: recoverInvalid(z.number()),
  }),
);
/** The core's rows and summaries, without vendor enrichment or local state inference. */
export async function readCoreRuns(
  env: NodeJS.ProcessEnv = process.env,
  sessionId?: string,
  cwd = process.cwd(),
): Promise<RouteScan> {
  const snapshot = await readAgxSnapshotAsync(env, cwd);
  const summary = snapshot.summary;
  const session =
    summary?.sessions[currentDispatcherSession(sessionId) ?? ""] ??
    summary?.noSession;
  const runs: RouteRun[] = [];
  let unreadable = 0;
  for (const value of snapshot.rows ?? []) {
    const parsed = Row.safeParse(value);
    if (!parsed.success) {
      unreadable++;
      continue;
    }
    const row = parsed.data;
    if (row.state !== "running" && row.health !== "orphaned") continue;
    runs.push({
      displayId: undefined,
      choice: row.row,
      label: row.ticket,
      workerName: row.worker_name,
      workspaceName:
        row.workspace_name ??
        (row.workspace === undefined ? undefined : basename(row.workspace)),
      pickSource:
        row.pick_source ??
        (row.continues === undefined || row.continues === null
          ? "agx"
          : "resume"),
      phase: row.phase,
      workerSession: row.vendor_session ?? undefined,
      markerCostUsd: row.cost_usd,
      secs: row.elapsed_seconds,
      coreState: row.state,
      alive: row.state === "running",
      dispatcherSession: row.dispatcher_session ?? undefined,
      doing: undefined,
    });
  }
  return {
    runs,
    unreadable,
    actions: {
      judge:
        snapshot.judgments?.[currentDispatcherSession(sessionId) ?? ""] ?? 0,
      land: snapshot.land ?? 0,
    },
    workspaces: snapshot.workspaces,
    findings: snapshot.findings,
    fleet:
      summary === undefined || session === undefined
        ? undefined
        : {
            running: summary.running,
            ...session,
            unattributed: summary.unattributed,
            lost: snapshot.findings?.lost,
          },
    snapshotAgeSecs: snapshot.ageSeconds,
    snapshotWhy: snapshot.reason,
  };
}
