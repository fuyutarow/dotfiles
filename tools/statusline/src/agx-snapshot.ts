import { homedir } from "node:os";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { jsonOf, z } from "./zod.ts";
const WorkspaceCountsSchema = () =>
  z.object({
    total: z.number().int().nonnegative(),
    unlanded: z.number().int().nonnegative(),
    collectable: z.number().int().nonnegative(),
    legacy: z.number().int().nonnegative(),
    capturedAt: z.number(),
    stale: z.boolean().optional(),
    here: z.number().int().nonnegative().optional(),
    fleetKnown: z.boolean().optional(),
  });
export type WorkspaceCounts = z.output<
  ReturnType<typeof WorkspaceCountsSchema>
>;
const FindingsSchema = () =>
  z.object({
    kinds: z.record(
      z.string().regex(/^[a-z0-9-]+$/u),
      z.number().int().nonnegative(),
    ),
    lost: z.number().int().nonnegative(),
    capturedAt: z.number(),
    stale: z.boolean().optional(),
  });
export type FleetFindings = z.output<ReturnType<typeof FindingsSchema>>;

const SessionCountsSchema = z.lazy(() =>
  z.object({
    here: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
);
const SummarySchema = z.lazy(() =>
  z.object({
    running: z.number().int().nonnegative(),
    unattributed: z.number().int().nonnegative(),
    sessions: z.record(z.string(), SessionCountsSchema),
    noSession: SessionCountsSchema,
  }),
);
const ListingSchema = z.lazy(() =>
  z.object({
    runs: z.array(z.unknown()),
    summary: SummarySchema,
  }),
);

const SnapshotSchema = z.lazy(() =>
  z.object({
    output: jsonOf(z.union([ListingSchema, z.array(z.unknown())])),
    capturedAt: z.number(),
    exit: z.literal(0),
    workspaces: WorkspaceCountsSchema().optional(),
    findings: FindingsSchema().optional(),
  }),
);
export interface AgxSnapshotRead {
  findings?: FleetFindings | undefined;
  workspaces?: WorkspaceCounts | undefined;
  summary?: z.output<typeof SummarySchema> | undefined;
  rows: unknown[] | undefined;
  ageSeconds: number | undefined;
  reason: string | undefined;
}

export function stateDir(env: NodeJS.ProcessEnv): string {
  return (
    [env.AGX_NEXT_STATE_DIR, env.AGX_STATE_DIR].find(
      (value) => value !== undefined && value !== "",
    ) ??
    join(
      env.XDG_STATE_HOME === ""
        ? join(env.HOME ?? homedir(), ".local/state")
        : (env.XDG_STATE_HOME ?? join(env.HOME ?? homedir(), ".local/state")),
      "agx-next",
    )
  );
}
export const agxSnapshotPath = (env: NodeJS.ProcessEnv) =>
  join(stateDir(env), "current-runs.json");
export function doctorFindings(
  output: string,
  capturedAt: number,
): FleetFindings | undefined {
  const parsed = jsonOf(
    FindingsSchema()
      .omit({ capturedAt: true })
      .extend({
        complete: z.literal(true),
        total: z.number(),
      }),
  ).safeParse(output);
  return parsed.success
    ? { kinds: parsed.data.kinds, lost: parsed.data.lost, capturedAt }
    : undefined;
}
export function workspaceCounts(
  output: string,
  capturedAt: number,
): WorkspaceCounts | undefined {
  const parsed = jsonOf(
    z.object({
      counts: WorkspaceCountsSchema().omit({ capturedAt: true }),
      complete: z.literal(true),
    }),
  ).safeParse(output);
  return parsed.success ? { ...parsed.data.counts, capturedAt } : undefined;
}
// Watch-mode last owner values only; no presentation or disk cache. Bound the path inventory.
const lastOwner = new Map<string, string>();
const failedReads = new Set<string>();
function rememberOwner(path: string, text: string): void {
  lastOwner.delete(path);
  lastOwner.set(path, text);
  failedReads.delete(path);
  if (lastOwner.size <= 32) return;
  const oldest = lastOwner.keys().next().value;
  if (oldest === undefined) return;
  lastOwner.delete(oldest);
  failedReads.delete(oldest);
}
async function read<T extends z.ZodType>(path: string, schema: () => T) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await Bun.file(path)
      .text()
      .catch(() => null);
    const parsed = text === null ? undefined : jsonOf(schema()).safeParse(text);
    if (parsed?.success !== true || text === null) continue;
    rememberOwner(path, text);
    return parsed.data;
  }
  failedReads.add(path);
  const saved = lastOwner.get(path);
  const previous =
    saved === undefined ? undefined : jsonOf(schema()).safeParse(saved);
  return previous?.success === true ? previous.data : undefined;
}
/** Owners publish these independent files on change; a read never refreshes or writes. */
export async function readAgxSnapshotAsync(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<AgxSnapshotRead> {
  const [snapshot, ws, findings, times] = await Promise.all([
    read(agxSnapshotPath(env), () => SnapshotSchema),
    read(join(stateDir(env), "workspace-verdicts.json"), () =>
      z.object({
        counts: WorkspaceCountsSchema().omit({ capturedAt: true }),
        capturedAt: z.number(),
        complete: z.literal(true),
        fleetComplete: z.boolean().optional(),
        repos: z
          .record(
            z.string(),
            z.object({
              counts: WorkspaceCountsSchema().omit({ capturedAt: true }),
              capturedAt: z.number(),
            }),
          )
          .optional(),
      }),
    ),
    read(join(stateDir(env), "doctor.json"), () =>
      FindingsSchema().extend({ complete: z.literal(true) }),
    ),
    Promise.all(
      [
        "current-runs.json",
        "records.jsonl",
        "workspace-verdicts.json",
        "doctor.json",
      ].map((name) =>
        stat(join(stateDir(env), name))
          .then((info) => info.mtimeMs)
          .catch(() => 0),
      ),
    ),
  ]);
  const [runsAt = 0, recordsAt = 0, wsAt = 0, doctorAt = 0] = times;
  const runsStale = runsAt < recordsAt || failedReads.has(agxSnapshotPath(env));
  const findingsWithFreshness =
    findings === undefined
      ? undefined
      : {
          ...findings,
          stale:
            doctorAt < Math.max(recordsAt, wsAt) ||
            failedReads.has(join(stateDir(env), "doctor.json")),
        };
  const repo = Object.keys(ws?.repos ?? {})
    .filter(
      (root) =>
        cwd === root ||
        cwd.startsWith(root + "/") ||
        cwd.startsWith(root + ".ws/"),
    )
    .toSorted((a, b) => b.length - a.length)[0];
  const own = repo === undefined ? undefined : ws?.repos?.[repo];
  const capturedAt =
    own === undefined || ws === undefined
      ? ws?.capturedAt
      : Math.min(ws.capturedAt, own.capturedAt);
  const workspaces =
    ws === undefined
      ? snapshot?.workspaces
      : {
          ...ws.counts,
          here: own?.counts.total,
          fleetKnown: ws.fleetComplete !== false,
          capturedAt: capturedAt ?? ws.capturedAt,
          stale: failedReads.has(
            join(stateDir(env), "workspace-verdicts.json"),
          ),
        };
  if (snapshot === undefined)
    return {
      rows: undefined,
      ageSeconds: undefined,
      reason: "snapshot unavailable",
      workspaces,
      findings: findingsWithFreshness,
    };
  const listing = snapshot.output;
  return {
    rows: Array.isArray(listing) ? listing : listing.runs,
    summary: Array.isArray(listing) ? undefined : listing.summary,
    workspaces,
    findings: findingsWithFreshness ?? snapshot.findings,
    ageSeconds: runsStale
      ? Math.max(
          1,
          Math.floor(
            (Temporal.Now.instant().epochMilliseconds - snapshot.capturedAt) /
              1000,
          ),
        )
      : 0,
    reason: undefined,
  };
}
