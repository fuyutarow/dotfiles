import { homedir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "./zod.ts";
const WorkspaceCountsSchema = () =>
  z.object({
    total: z.number().int().nonnegative(),
    unlanded: z.number().int().nonnegative(),
    collectable: z.number().int().nonnegative(),
    legacy: z.number().int().nonnegative(),
    capturedAt: z.number(),
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
    output: z.string(),
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
async function read<T extends z.ZodType>(path: string, schema: () => T) {
  const file = Bun.file(path);
  const text = (await file.exists()) ? await file.text().catch(() => "") : "";
  const parsed = text === "" ? undefined : jsonOf(schema()).safeParse(text);
  return parsed?.success === true ? parsed.data : undefined;
}
/** Owners publish these independent files on change; a read never refreshes or writes. */
export async function readAgxSnapshotAsync(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<AgxSnapshotRead> {
  const [snapshot, ws, findings] = await Promise.all([
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
  ]);
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
        };
  if (snapshot === undefined)
    return {
      rows: undefined,
      ageSeconds: undefined,
      reason: "snapshot unavailable",
      workspaces,
      findings,
    };
  const parsed = jsonOf(
    z.union([ListingSchema, z.array(z.unknown())]),
  ).safeParse(snapshot.output);
  if (!parsed.success)
    return {
      rows: undefined,
      ageSeconds: undefined,
      reason: "snapshot invalid",
    };
  return {
    rows: Array.isArray(parsed.data) ? parsed.data : parsed.data.runs,
    summary: Array.isArray(parsed.data) ? undefined : parsed.data.summary,
    workspaces,
    findings: findings ?? snapshot.findings,
    ageSeconds: Math.max(
      0,
      Math.floor(
        (Temporal.Now.instant().epochMilliseconds - snapshot.capturedAt) / 1000,
      ),
    ),
    reason: undefined,
  };
}
