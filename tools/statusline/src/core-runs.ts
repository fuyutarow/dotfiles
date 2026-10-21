import { basename } from "node:path";
import { z, recoverInvalid } from "./zod.ts";
import { readAgxSnapshotAsync } from "./agx-snapshot.ts";
import { currentDispatcherSession } from "./dispatch-display.ts";
import type { RouteRun, RouteScan } from "./dispatch-runs.ts";

export type ResolvedRunScope =
  | { kind: "session"; session: string | undefined }
  | { kind: "inventory"; sessions: string[] };

/** Resolve selector precedence once, before both summary counts and worker rows consume it. */
export function resolveRunScope(
  env: NodeJS.ProcessEnv,
  sessionId: string | null | undefined,
  inventorySessions?: readonly string[],
): ResolvedRunScope {
  if (sessionId === null && inventorySessions !== undefined)
    return { kind: "inventory", sessions: [...new Set(inventorySessions)] };
  return {
    kind: "session",
    session:
      sessionId === null ? undefined : currentDispatcherSession(sessionId, env),
  };
}

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
  sessionId?: string | null,
  cwd = process.cwd(),
  inventorySessions?: string[],
): Promise<RouteScan> {
  const snapshot = await readAgxSnapshotAsync(env, cwd);
  const scope = resolveRunScope(env, sessionId, inventorySessions);
  const dispatcherSession =
    scope.kind === "session" ? scope.session : undefined;
  const displayedSessions =
    scope.kind === "inventory" ? scope.sessions : undefined;
  const summary = snapshot.summary;
  const here =
    displayedSessions === undefined
      ? undefined
      : displayedSessions.reduce(
          (count, id) => count + (summary?.sessions[id]?.here ?? 0),
          0,
        );
  let session =
    summary?.sessions[dispatcherSession ?? ""] ?? summary?.noSession;
  if (displayedSessions !== undefined)
    session =
      summary !== undefined && here !== undefined && here <= summary.running
        ? { here, other: summary.running - here }
        : undefined;
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
    sessionScope: dispatcherSession,
    inventorySessions: displayedSessions,
    actions: {
      judge:
        dispatcherSession === undefined
          ? (snapshot.repositoryJudgments ?? 0)
          : (snapshot.judgments?.[dispatcherSession] ?? 0),
      judgeWhy: dispatcherSession === undefined ? snapshot.judgeWhy : undefined,
      land: snapshot.land ?? 0,
    },
    workspaces: snapshot.workspaces,
    findings: snapshot.findings,
    runSource: snapshot.runSource,
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
