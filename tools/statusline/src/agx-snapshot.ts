import { homedir } from "node:os";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { fromThrowable } from "neverthrow";
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
  judgments?: Record<string, number> | undefined;
  repositoryJudgments?: number | undefined;
  judgeWhy?: string | undefined;
  land?: number | undefined;
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
    ) ?? join(join(env.HOME ?? homedir(), ".local/state"), "agx-next")
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
        rows: z.array(z.array(z.string())).optional(),
        repos: z
          .record(
            z.string(),
            z.object({
              counts: WorkspaceCountsSchema().omit({ capturedAt: true }),
              capturedAt: z.number(),
              lines: z.array(z.string()).optional(),
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
  const listingRows = snapshot?.output;
  const rows = Array.isArray(listingRows)
    ? listingRows
    : (listingRows?.runs ?? []);
  const actions = await readRunActions(env, own?.lines ?? [], rows, repo);
  if (snapshot === undefined)
    return {
      ...actions,
      rows: undefined,
      ageSeconds: undefined,
      reason: "snapshot unavailable",
      workspaces,
      findings: findingsWithFreshness,
    };
  const listing = snapshot.output;
  return {
    ...actions,
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

// current-runs intentionally omits completed history. The append-only state log is
// the authority for pending judgments; workspace verdicts supply landing evidence.
const ActionRun = z.object({
  id: z.string(),
  state: z.enum(["running", "ended"]),
  dispatcher_session: z.string().nullable(),
  workspace: z.string().optional(),
  ended_at: z.string().optional(),
  judgment: z.object({ decision: z.string() }).nullable(),
});
const ActionEvent = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("started"),
    id: z.string(),
    dispatcher_session: z.string().nullable(),
    workspace: z.string(),
  }),
  z.object({
    kind: z.literal("ended"),
    id: z.string(),
    at: z.string().optional(),
  }),
  z.object({ kind: z.literal("judged"), id: z.string(), decision: z.string() }),
]);
async function readRunActions(
  env: NodeJS.ProcessEnv,
  verdicts: string[],
  rows: unknown[] = [],
  repo?: string,
) {
  const runs = new Map<string, z.output<typeof ActionRun>>();
  for (const row of rows) {
    const parsed = ActionRun.safeParse(row);
    if (parsed.success) runs.set(parsed.data.id, parsed.data);
  }
  const log = await Bun.file(join(stateDir(env), "records.jsonl"))
    .text()
    .catch(() => "");
  // A partial final append is not an event yet.
  for (const line of log.slice(0, log.lastIndexOf("\n") + 1).split("\n")) {
    const parsed = jsonOf(ActionEvent).safeParse(line);
    if (!parsed.success) continue;
    const event = parsed.data;
    if (event.kind === "started") {
      runs.set(event.id, { ...event, state: "running", judgment: null });
      continue;
    }
    const run = runs.get(event.id);
    if (run === undefined) continue;
    if (event.kind === "ended") {
      run.state = "ended";
      run.ended_at = event.at;
    }
    if (event.kind === "judged") run.judgment = { decision: event.decision };
  }
  const workspaceRows = verdicts.map((line) => line.split("\t"));
  const members = new Set(workspaceRows.map((row) => row[0]));
  const unlanded = new Set(
    workspaceRows.filter((row) => row[2] === "unlanded").map((row) => row[0]),
  );
  const now = Temporal.Now.instant().epochMilliseconds;
  const cutoff = now - 24 * 60 * 60_000;
  const judgments: Record<string, number> = {};
  let repositoryJudgments = 0;
  let land = 0;
  for (const run of runs.values()) {
    if (run.state !== "ended") continue;
    const belongs =
      repo !== undefined &&
      run.workspace !== undefined &&
      (members.has(run.workspace) ||
        run.workspace === repo ||
        run.workspace.startsWith(repo + "/") ||
        run.workspace.startsWith(repo + ".ws/"));
    const endedAt = fromThrowable(
      () => Temporal.Instant.from(run.ended_at ?? "").epochMilliseconds,
    )().unwrapOr(Number.NaN);
    const recent = endedAt >= cutoff && endedAt <= now;
    if (run.judgment === null && recent && belongs) repositoryJudgments++;
    if (run.judgment === null && recent && run.dispatcher_session !== null)
      Object.defineProperty(judgments, run.dispatcher_session, {
        value:
          (Object.hasOwn(judgments, run.dispatcher_session)
            ? (judgments[run.dispatcher_session] ?? 0)
            : 0) + 1,
        enumerable: true,
        configurable: true,
      });
    if (
      run.judgment?.decision === "accept" &&
      belongs &&
      unlanded.has(run.workspace) &&
      run.workspace !== undefined &&
      (await stat(run.workspace)
        .then((info) => info.isDirectory())
        .catch(() => false))
    )
      land++;
  }
  return {
    judgments,
    repositoryJudgments,
    land,
    judgeWhy:
      repo === undefined
        ? "repository scope unavailable; agx worker doctor"
        : undefined,
  };
}
