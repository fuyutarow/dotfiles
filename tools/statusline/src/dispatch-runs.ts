import { readCoreRuns } from "./core-runs.ts";
import {
  type RunSnapshotSource,
  type WorkspaceCounts,
  type FleetFindings,
} from "./agx-snapshot.ts";
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
  // what the worker is doing (released C2 listing); undefined until its first event lands
  doing:
    | {
        last: string;
        commands: number | undefined;
        files: number | undefined;
        ageSecs: number | undefined;
        costUsd?: number;
        session?: string; // the vendor's id for the worker (codex thread, claude session)
      }
    | undefined;
}

export interface RouteScan {
  late?: number | undefined;
  /** Exact dispatcher session used to split own rows from the fleet's other count. */
  sessionScope?: string | undefined;
  /** Complete provider-session inventory shown by an unselected cwd view. */
  inventorySessions?: string[] | undefined;
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
  /** Validity of the owner-published run snapshot, distinct from this view's timestamp. */
  runSource?: RunSnapshotSource | undefined;
  snapshotAgeSecs?: number | undefined;
  snapshotWhy?: string | undefined;
}
export interface JobRun {
  id: string;
  ticket: string;
  state: "running" | "ended";
  dispatcher_session: string | null;
}

/** All row facts come from the existing collector snapshot of agx worker ls. */
export async function agxRouteRunsAsync(
  env: NodeJS.ProcessEnv = process.env,
  sessionId?: string,
  _enrichRows = false,
  renderCwd = process.cwd(),
): Promise<RouteScan> {
  const scan = await readCoreRuns(env, sessionId, renderCwd);
  if (_enrichRows)
    scan.runs = scan.runs.map(({ coreState: _state, ...run }) => run);
  return scan;
}
