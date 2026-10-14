import {
  appendFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { globsOverlap } from "../ticket.ts";
import { exitWithError } from "./exit.ts";

const EventSchema = z.discriminatedUnion("kind", [
  z.looseObject({
    kind: z.literal("started"),
    id: z.string(),
    at: z.string(),
    ticket: z.string(),
    writes: z.array(z.string()),
    cwd: z.string(),
    workspace: z.string(),
    row: z.string(),
    dispatcher_session: z.string().nullable(),
    vendor_session: z.string().nullable(),
    continues: z.string().nullable().optional(),
    pid: z.number(),
    legacy_key: z.string().optional(),
  }),
  z.looseObject({
    kind: z.literal("progress"),
    id: z.string(),
    at: z.string(),
    path: z.string(),
    legacy_key: z.string().optional(),
  }),
  z.looseObject({
    kind: z.literal("ended"),
    id: z.string(),
    at: z.string(),
    exit: z.number(),
    report_path: z.string().nullable(),
    vendor_session: z.string().nullable(),
    verify: z
      .array(
        z.looseObject({
          cmd: z.string(),
          exit: z.number(),
          log_path: z.string(),
        }),
      )
      .default([]),
    legacy_key: z.string().optional(),
  }),
  z.looseObject({
    kind: z.literal("judged"),
    id: z.string(),
    at: z.string(),
    decision: z.string(),
    note: z.string(),
    legacy_key: z.string().optional(),
  }),
]);
export type NextEvent = z.output<typeof EventSchema>;

export const stateDir = (): string =>
  resolve(
    process.env.AGX_NEXT_STATE_DIR ??
      process.env.AGX_STATE_DIR ??
      join(
        process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"),
        "agx-next",
      ),
  );
export const recordPath = (): string => join(stateDir(), "records.jsonl");
export const now = (): string => Temporal.Now.instant().toString();

export function append(event: NextEvent): void {
  const path = recordPath();
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(event)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}

export function events(): NextEvent[] {
  const path = recordPath();
  if (!existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  const lines = text.split("\n");
  if (!text.endsWith("\n")) lines.pop();
  const parsed = lines
    .filter((line) => line !== "")
    .map((line) => jsonOf(EventSchema).safeParse(line));
  const invalid = parsed.find((event) => !event.success);
  if (invalid !== undefined)
    exitWithError(
      `agx: invalid record log line: ${invalid.error.message}\n`,
      1,
    );
  return parsed.flatMap((event) => (event.success ? [event.data] : []));
}

type LegacyImportResult = Readonly<{
  runs_imported: number;
  judgments_imported: number;
  progress_imported: number;
  malformed_lines: number;
  ignored_rows: number;
}>;

const LegacyRow = z.record(z.string(), z.unknown());
const rowOf = (value: unknown): Record<string, unknown> | undefined => {
  const parsed = LegacyRow.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};
const stringOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
const numberOf = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const legacyId = (runId: string): string =>
  `legacy-${createHash("sha256").update(runId).digest("hex").slice(0, 24)}`;
const legacySourceDir = (): string =>
  resolve(
    process.env.AGX_STATE_DIR ?? join(homedir(), ".local", "state", "agx"),
  );

const importedEventKeys = (): Set<string> =>
  new Set(
    events().flatMap((event) =>
      event.legacy_key === undefined ? [] : [event.legacy_key],
    ),
  );

type PendingLegacyRow = Readonly<{
  row: Record<string, unknown>;
  key: string;
}>;

type LegacyReadResult = Readonly<{
  pending: PendingLegacyRow[];
  runs_imported: number;
  malformed_lines: number;
  ignored_rows: number;
}>;

const legacyKeyFor = (
  kind: string,
  runId: string,
  row: Record<string, unknown>,
): string => {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        kind,
        runId,
        row.at,
        row.graded_at,
        row.waived_at,
        row.grade,
        row.accept,
        row.reason,
      ]),
    )
    .digest("hex")
    .slice(0, 24);
  return `${kind}:${digest}`;
};

function importLegacyRun(
  legacy: Record<string, unknown>,
  runId: string,
  knownKeys: Set<string>,
): number {
  const startedKey = `run:${runId}`;
  const endedKey = `run-ended:${runId}`;
  const ticket = rowOf(legacy.ticket);
  const pick = rowOf(legacy.pick);
  const worker = rowOf(legacy.worker);
  const cwd = stringOf(legacy.cwd) ?? "unknown";
  const startedAt = stringOf(legacy.started_at) ?? now();
  const endedAt = stringOf(legacy.ended_at) ?? startedAt;
  const writesResult = z.array(z.string()).safeParse(ticket?.writes);
  const writes = writesResult.success ? writesResult.data : [];
  const outcome = worker?.outcome;
  let exit = numberOf(legacy.exit) ?? numberOf(worker?.exit_code);
  if (exit === undefined) {
    if (outcome === "ok" || outcome === "returned") exit = 0;
    else if (outcome === "timeout") exit = 3;
    else exit = 1;
  }
  const id = legacyId(runId);
  let imported = 0;
  if (!knownKeys.has(startedKey)) {
    const brief = rowOf(legacy.brief);
    append({
      kind: "started",
      id,
      at: startedAt,
      ticket:
        stringOf(ticket?.name) ?? basename(stringOf(brief?.path) ?? "legacy"),
      writes,
      cwd,
      workspace: cwd,
      row: stringOf(pick?.choice) ?? "unknown",
      dispatcher_session: stringOf(legacy.dispatcher_session) ?? null,
      vendor_session: stringOf(worker?.session) ?? null,
      continues: null,
      pid: 0,
      legacy_key: startedKey,
    });
    knownKeys.add(startedKey);
    imported = 1;
  }
  if (!knownKeys.has(endedKey)) {
    append({
      kind: "ended",
      id,
      at: endedAt,
      exit,
      report_path: null,
      vendor_session: stringOf(worker?.session) ?? null,
      verify: [],
      legacy_key: endedKey,
    });
    knownKeys.add(endedKey);
  }
  return imported;
}

async function readLegacyFile(
  filePath: string,
  knownKeys: Set<string>,
): Promise<LegacyReadResult> {
  const pending: PendingLegacyRow[] = [];
  let runsImported = 0;
  let malformedLines = 0;
  let ignoredRows = 0;
  const input = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  for await (const line of input) {
    const parsed = jsonOf(LegacyRow).safeParse(line);
    if (!parsed.success) {
      malformedLines += 1;
      continue;
    }
    const legacy = parsed.data;
    const kind = stringOf(legacy.kind);
    const runId = stringOf(legacy.run_id);
    if (kind === "run" && runId !== undefined) {
      runsImported += importLegacyRun(legacy, runId, knownKeys);
      continue;
    }
    const importable = ["acceptance", "interim", "landed"];
    if (
      kind === undefined ||
      runId === undefined ||
      !importable.includes(kind)
    ) {
      ignoredRows += 1;
      continue;
    }
    pending.push({ row: legacy, key: legacyKeyFor(kind, runId, legacy) });
  }
  return {
    pending,
    runs_imported: runsImported,
    malformed_lines: malformedLines,
    ignored_rows: ignoredRows,
  };
}

function importLegacyEvent(
  row: Record<string, unknown>,
  key: string,
): "judged" | "progress" | undefined {
  const kind = stringOf(row.kind);
  const runId = stringOf(row.run_id);
  if (kind === undefined || runId === undefined) return undefined;
  const id = legacyId(runId);
  const at =
    stringOf(row.at) ??
    stringOf(row.graded_at) ??
    stringOf(row.waived_at) ??
    now();
  if (kind === "interim") {
    const interim = rowOf(row.interim_report);
    const reportValue = interim?.return ?? interim ?? row.interim_report;
    const path = join(stateDir(), "runs", id, "last-progress.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(reportValue)}\n`);
    append({ kind: "progress", id, at, path, legacy_key: key });
    return "progress";
  }
  let decision: string | undefined;
  if (kind === "acceptance")
    decision = row.accept === true ? "accept" : "reject";
  if (kind === "landed") decision = "accept";
  if (decision === undefined) return undefined;
  const note = stringOf(row.note) ?? stringOf(row.reason) ?? "";
  append({ kind: "judged", id, at, decision, note, legacy_key: key });
  return "judged";
}

/** Import old agx rows idempotently; malformed source lines are counted and skipped. */
export async function importLegacyRecords(): Promise<LegacyImportResult> {
  const sourceDir = legacySourceDir();
  const files = existsSync(sourceDir)
    ? readdirSync(sourceDir)
        .filter(
          (name) =>
            name === "runs.jsonl" ||
            /^runs-\d{4}-\d{2}-\d{2}\.jsonl$/u.test(name),
        )
        .toSorted()
    : [];
  const knownKeys = importedEventKeys();
  const pending: PendingLegacyRow[] = [];
  let runsImported = 0;
  let judgmentsImported = 0;
  let progressImported = 0;
  let malformedLines = 0;
  let ignoredRows = 0;

  for (const file of files) {
    const read = await readLegacyFile(join(sourceDir, file), knownKeys);
    pending.push(...read.pending);
    runsImported += read.runs_imported;
    malformedLines += read.malformed_lines;
    ignoredRows += read.ignored_rows;
  }

  for (const { row, key } of pending) {
    if (knownKeys.has(key)) continue;
    const imported = importLegacyEvent(row, key);
    if (imported === "progress") progressImported += 1;
    if (imported === "judged") judgmentsImported += 1;
    knownKeys.add(key);
  }
  return {
    runs_imported: runsImported,
    judgments_imported: judgmentsImported,
    progress_imported: progressImported,
    malformed_lines: malformedLines,
    ignored_rows: ignoredRows,
  };
}

export function overlapWarnings(writes: string[]): void {
  const started = new Map<string, Extract<NextEvent, { kind: "started" }>>();
  const ended = new Set<string>();
  for (const event of events()) {
    if (event.kind === "started") started.set(event.id, event);
    if (event.kind === "ended") ended.add(event.id);
  }
  for (const [id, run] of started) {
    if (ended.has(id)) continue;
    const live = fromThrowable(
      () => process.kill(run.pid, 0),
      (error) => error,
    )();
    if (live.isErr()) continue;
    const intersections = run.writes.flatMap((a) =>
      writes.filter((b) => globsOverlap(a, b)),
    );
    if (intersections.length > 0)
      process.stderr.write(`WARN overlap run=${id} ticket=${run.ticket}\n`);
  }
}

export function foldedRuns() {
  const runs = new Map<
    string,
    {
      id: string;
      started_at: string;
      ended_at: string | null;
      ticket: string;
      state: "running" | "ended" | "orphaned";
      exit: number | null;
      row: string;
      dispatcher_session: string | null;
      cwd: string;
      workspace: string;
      writes: string[];
      judgment: { decision: string; note: string } | null;
      report_path: string | null;
      verify: { cmd: string; exit: number; log_path: string }[];
      last_progress_path: string | null;
      continues: string | null;
      vendor_session: string | null;
      pid: number;
    }
  >();
  for (const event of events()) {
    if (event.kind === "started")
      runs.set(event.id, {
        id: event.id,
        started_at: event.at,
        ended_at: null,
        ticket: event.ticket,
        state: "orphaned",
        exit: null,
        row: event.row,
        dispatcher_session: event.dispatcher_session,
        cwd: event.cwd,
        workspace: event.workspace,
        writes: event.writes,
        judgment: null,
        report_path: null,
        verify: [],
        last_progress_path: null,
        continues: event.continues ?? null,
        vendor_session: event.vendor_session,
        pid: event.pid,
      });
    const run = runs.get(event.id);
    if (run === undefined) continue;
    if (event.kind === "progress") run.last_progress_path = event.path;
    if (event.kind === "ended") {
      run.state = "ended";
      run.ended_at = event.at;
      run.exit = event.exit;
      run.report_path = event.report_path;
      run.verify = event.verify;
      run.vendor_session = event.vendor_session;
    }
    if (event.kind !== "judged") continue;
    const decision = event.decision === "landed" ? "accept" : event.decision;
    if (decision === "accept" || decision === "reject")
      run.judgment = { decision, note: event.note };
  }
  for (const run of runs.values()) {
    if (run.state !== "ended") {
      const alive = fromThrowable(
        () => process.kill(run.pid, 0),
        (error) => error,
      )();
      run.state = alive.isOk() ? "running" : "orphaned";
    }
  }
  return [...runs.values()].map(({ pid: _pid, ...run }) => run);
}
