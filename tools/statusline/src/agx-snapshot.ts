import { DoctorFindings } from "../../shared/src/doctor-record.ts";
import { resolve } from "node:path";
import { readOwnerState } from "./owner-state.ts";
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
// Internal presentation names are derived from the shared CLI projection.
export type FleetFindings = Omit<
  z.output<typeof DoctorFindings>,
  "schema" | "complete" | "captured_at"
> & { capturedAt: number };

const SessionCountsSchema = z.lazy(() =>
  z.object({
    here: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
);
const SummarySchema = z.lazy(() =>
  z.object({
    running: z.number().int().nonnegative(),
    late: z.number().int().nonnegative().optional(),
    unattributed: z.number().int().nonnegative(),
    sessions: z.record(z.string(), SessionCountsSchema),
    noSession: SessionCountsSchema,
  }),
);
export type RunSnapshotSource =
  | { kind: "current"; capturedAt: number }
  | { kind: "stale"; capturedAt: number }
  | { kind: "unknown"; why: string };
export interface AgxSnapshotRead {
  late?: number | undefined;
  judgments?: Record<string, number> | undefined;
  repositoryJudgments?: number | undefined;
  judgeWhy?: string | undefined;
  land?: number | undefined;
  findings?: FleetFindings | undefined;
  workspaces?: WorkspaceCounts | undefined;
  summary?: z.output<typeof SummarySchema> | undefined;
  rows: unknown[] | undefined;
  runSource: RunSnapshotSource;
  ageSeconds: number | undefined;
  reason: string | undefined;
}

// The CLI owns status-file layouts, scope, judgments and freshness.
export const AgxStatusSchema = z.object({
  schema: z.literal(1),
  runs: z.discriminatedUnion("source", [
    z.object({
      source: z.enum(["current", "stale"]),
      captured_at: z.number(),
      age_s: z.number().nonnegative(),
      reason: z.string().nullable(),
      rows: z.array(z.unknown()),
      summary: SummarySchema.nullable(),
    }),
    z.object({
      source: z.literal("unknown"),
      captured_at: z.null(),
      age_s: z.null(),
      reason: z.string().nullable(),
      rows: z.null(),
      summary: z.null(),
    }),
  ]),
  workspaces: WorkspaceCountsSchema()
    .omit({ capturedAt: true, fleetKnown: true })
    .extend({
      captured_at: z.number(),
      fleet_known: z.boolean().optional(),
    })
    .nullable(),
  findings: DoctorFindings.nullable(),
  judgments: z.object({
    by_session: z.record(z.string(), z.number().int().nonnegative()),
    repository: z.number().int().nonnegative(),
    land: z.number().int().nonnegative(),
    why: z.string().nullable(),
  }),
});
export const agxStatusKey = (cwd: string) => `agx:${resolve(cwd)}`;

export function adaptAgxStatus(
  status: z.output<typeof AgxStatusSchema>,
): AgxSnapshotRead {
  const { runs, workspaces, findings, judgments } = status;
  return {
    // The core owns aggregation; older snapshots leave this count unavailable.
    late: runs.summary?.late,
    judgments: judgments.by_session,
    repositoryJudgments: judgments.repository,
    judgeWhy: judgments.why ?? undefined,
    land: judgments.land,
    rows: runs.rows ?? undefined,
    summary: runs.summary ?? undefined,
    runSource:
      runs.source === "unknown"
        ? { kind: "unknown", why: runs.reason ?? "snapshot unavailable" }
        : { kind: runs.source, capturedAt: runs.captured_at },
    ageSeconds: runs.age_s ?? undefined,
    reason: runs.reason ?? undefined,
    workspaces:
      workspaces === null
        ? undefined
        : {
            total: workspaces.total,
            unlanded: workspaces.unlanded,
            collectable: workspaces.collectable,
            legacy: workspaces.legacy,
            here: workspaces.here,
            fleetKnown: workspaces.fleet_known,
            capturedAt: workspaces.captured_at,
            stale: workspaces.stale,
          },
    findings:
      findings === null
        ? undefined
        : {
            kinds: findings.kinds,
            lost: findings.lost,
            capturedAt: findings.captured_at,
            stale: findings.stale === true || !findings.complete,
          },
  };
}

/** Render reads only the sampler's existing owner cache; never collects or spawns. */
export async function readAgxSnapshotAsync(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<AgxSnapshotRead> {
  const owner = await readOwnerState(env);
  const path = resolve(cwd);
  const keys = Object.keys(owner?.fields ?? {}).filter((key) =>
    key.startsWith("agx:"),
  );
  const scoped = keys
    .filter(
      (key) => path === key.slice(4) || path.startsWith(`${key.slice(4)}/`),
    )
    .toSorted((a, b) => b.length - a.length)[0];
  // Fleet/session counts are global even outside a sampled repository. Local
  // workspace and action counts must never leak from another repository's sample.
  const key = scoped ?? keys[0];
  const field = key === undefined ? undefined : owner?.fields[key];
  const parsed = AgxStatusSchema.safeParse(field?.value);
  if (!parsed.success) {
    const why =
      field === undefined
        ? "snapshot unavailable"
        : "invalid schema-1 agx status";
    return {
      rows: undefined,
      runSource: { kind: "unknown", why },
      ageSeconds: undefined,
      reason: why,
    };
  }
  const snapshot = adaptAgxStatus(parsed.data);
  if (scoped === undefined) {
    if (snapshot.workspaces !== undefined) snapshot.workspaces.here = undefined;
    snapshot.repositoryJudgments = undefined;
    snapshot.judgeWhy = "repository scope unavailable; agx worker doctor";
    snapshot.land = undefined;
  }
  if (field?.error !== undefined) {
    if (snapshot.runSource.kind !== "unknown") {
      snapshot.runSource = { ...snapshot.runSource, kind: "stale" };
      snapshot.ageSeconds = Math.max(
        1,
        snapshot.ageSeconds ?? 0,
        Math.floor(
          (Temporal.Now.instant().epochMilliseconds -
            snapshot.runSource.capturedAt) /
            1000,
        ),
      );
    }
    snapshot.reason = field.error;
    if (snapshot.workspaces !== undefined) snapshot.workspaces.stale = true;
    if (snapshot.findings !== undefined) snapshot.findings.stale = true;
  }
  return snapshot;
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
