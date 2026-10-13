import { dlopen, FFIType } from "bun:ffi";
import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { errorMessage } from "../../shared/src/attempt.ts";
import { readJsonlTailSync } from "../../shared/src/jsonl.ts";
import { fromThrowable, jsonOf, z } from "../../shared/src/zod.ts";

const identity = {
  schema: z.literal(1),
  seq: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  event_id: z.uuid(),
  at: z.iso.datetime({ offset: true }),
  run_id: z.string().min(1),
  lineage_id: z.string().min(1),
  session_id: z.string().min(1).nullable(),
  record: z.record(z.string(), z.unknown()),
};
export const LifecycleEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...identity,
    type: z.literal("admitted"),
    repo: z.string(),
    workspace: z.string(),
    ticket: z.string(),
    writes: z.array(z.string()),
    resource: z.unknown(),
    predecessor: z.string().optional(),
    continuation: z.unknown().optional(),
  }),
  z.object({
    ...identity,
    type: z.literal("running"),
    pid: z.number().int().positive(),
    started_at: z.string(),
  }),
  z.object({
    ...identity,
    type: z.literal("terminal"),
    outcome: z.enum([
      "done",
      "returned",
      "failed",
      "timeout",
      "abandoned",
      "superseded",
    ]),
    exit: z.number().int().optional(),
    cause: z.string().optional(),
    vendor_session: z.string().optional(),
    workspace: z.string().optional(),
    changes_remain: z.boolean().optional(),
  }),
  z.object({
    ...identity,
    type: z.literal("judged"),
    decision: z.enum(["accept", "reject"]),
    note: z.string().optional(),
    evidence: z.string().optional(),
  }),
  z.object({ ...identity, type: z.literal("disposed") }),
  z.object({ ...identity, type: z.literal("lease_snapshot") }),
]);
export type LifecycleEvent = z.output<typeof LifecycleEventSchema>;
export type LifecycleInput = LifecycleEvent extends infer E
  ? E extends LifecycleEvent
    ? Omit<
        E,
        "schema" | "seq" | "event_id" | "at" | "lineage_id" | "session_id"
      > & {
        at?: string | undefined;
        lineage_id?: string | undefined;
        session_id?: string | null | undefined;
      }
    : never
  : never;
export const lifecyclePath = (state: string): string =>
  join(state, "lifecycle.jsonl");

/** Read a stable prefix without a lock or any filesystem mutation. */
export function readLifecycle(state: string): {
  events: LifecycleEvent[];
  errors: string[];
} {
  const path = lifecyclePath(state);
  const read = fromThrowable(() => readFileSync(path, "utf8"), errorMessage)();
  if (read.isErr())
    return {
      events: [],
      errors: read.error.includes("ENOENT") ? [] : [read.error],
    };
  const lines = read.value.split("\n");
  const tail = lines.pop();
  const errors: string[] = [];
  if (tail !== "")
    errors.push(
      `${path}: corrupt or incomplete tail ignored; explicit repair required`,
    );
  const events: LifecycleEvent[] = [];
  const ids = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const event = jsonOf(LifecycleEventSchema).safeParse(line);
    if (
      !event.success ||
      event.data.seq <= (events.at(-1)?.seq ?? 0) ||
      ids.has(event.data.event_id)
    ) {
      errors.push(
        `${path}: corrupt line ${index + 1} ignored; explicit repair required`,
      );
      break;
    }
    events.push(event.data);
    ids.add(event.data.event_id);
  }
  return { events, errors };
}

/** Read a bounded complete-line suffix for interactive run-id/ticket resolution. */
export function readLifecycleTail(
  state: string,
  maxBytes = 8 * 1024 * 1024,
): { events: LifecycleEvent[]; truncated: boolean; errors: string[] } {
  const path = lifecyclePath(state);
  const read = fromThrowable(
    () => readJsonlTailSync(path, maxBytes),
    errorMessage,
  )();
  if (read.isErr())
    return {
      events: [],
      truncated: false,
      errors: read.error.includes("ENOENT") ? [] : [read.error],
    };
  const lines = read.value.text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const events: LifecycleEvent[] = [];
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const [index, line] of lines.entries()) {
    const parsed = jsonOf(LifecycleEventSchema).safeParse(line);
    if (
      !parsed.success ||
      parsed.data.seq <= (events.at(-1)?.seq ?? 0) ||
      ids.has(parsed.data.event_id)
    ) {
      errors.push(
        `${path}: corrupt line in bounded lifecycle tail at ${index + 1}`,
      );
      break;
    }
    events.push(parsed.data);
    ids.add(parsed.data.event_id);
  }
  return { events, truncated: read.value.startOffset > 0, errors };
}

export type FoldedRun = {
  run_id: string;
  lineage_id: string;
  session_id: string | null;
  state:
    | "admitted"
    | "running"
    | "done"
    | "returned"
    | "failed"
    | "abandoned"
    | "superseded";
  record: Record<string, unknown>;
  terminal?: LifecycleEvent;
  judgment?: LifecycleEvent;
};
export function foldByRun(
  events: readonly LifecycleEvent[],
): Map<string, FoldedRun> {
  const runs = new Map<string, FoldedRun>();
  for (const event of events) {
    if (event.type === "lease_snapshot") continue;
    const previous = runs.get(event.run_id);
    let state = previous?.state ?? "admitted";
    if (event.type === "terminal")
      state = event.outcome === "timeout" ? "failed" : event.outcome;
    const run: FoldedRun = {
      ...previous,
      run_id: event.run_id,
      lineage_id: event.lineage_id,
      session_id: event.session_id ?? previous?.session_id ?? null,
      state:
        event.type === "running" && previous?.terminal === undefined
          ? "running"
          : state,
      record: { ...previous?.record, ...event.record },
    };
    if (event.type === "terminal") run.terminal = event;
    if (event.type === "judged") run.judgment = event;
    runs.set(event.run_id, run);
  }
  return runs;
}
export const foldBySession = (
  events: readonly LifecycleEvent[],
  session: string,
): FoldedRun[] =>
  [...foldByRun(events).values()].filter((run) => run.session_id === session);
export const foldLiveRuns = (events: readonly LifecycleEvent[]): FoldedRun[] =>
  [...foldByRun(events).values()].filter((run) => run.state === "running");

export function appendLifecycle(
  state: string,
  input: LifecycleInput,
  beforeAppend?: (events: readonly LifecycleEvent[]) => string | null,
): { ok: true; event: LifecycleEvent } | { ok: false; error: string } {
  const opened = fromThrowable(() => {
    mkdirSync(state, { recursive: true });
    return openSync(lifecyclePath(state), "a+", 0o600);
  }, errorMessage)();
  if (opened.isErr()) return { ok: false, error: opened.error };
  const fd = opened.value;
  const library = fromThrowable(
    () =>
      dlopen(
        process.platform === "darwin"
          ? "/usr/lib/libSystem.B.dylib"
          : "libc.so.6",
        { flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } },
      ),
    errorMessage,
  )();
  if (library.isErr()) {
    closeSync(fd);
    return { ok: false, error: library.error };
  }
  const result = fromThrowable(() => {
    const deadline = performance.now() + 30000;
    const wait = new Int32Array(new SharedArrayBuffer(4));
    while (library.value.symbols.flock(fd, 2 | 4) !== 0) {
      if (performance.now() >= deadline)
        return {
          ok: false,
          error: "timed out waiting for lifecycle flock",
        } as const;
      Atomics.wait(wait, 0, 0, 2);
    }
    let read: { events: LifecycleEvent[]; errors: string[] };
    if (input.type === "judged") read = readLastLifecycleEventLocked(state, fd);
    else if (input.type === "admitted" && beforeAppend !== undefined)
      read = readLifecycleSinceSnapshotLocked(state, fd, input.repo);
    else read = readLifecycle(state);
    if (read.errors.length > 0)
      return { ok: false, error: read.errors.join("; ") } as const;
    const refusal = beforeAppend?.(read.events);
    if (refusal !== undefined && refusal !== null)
      return { ok: false, error: refusal } as const;
    const runs: Map<string, FoldedRun> =
      input.type === "judged"
        ? new Map<string, FoldedRun>()
        : foldByRun(read.events);
    const previous = runs.get(input.run_id);
    const duplicate = read.events.find(
      (event) => event.run_id === input.run_id && event.type === input.type,
    );
    if (
      duplicate !== undefined &&
      input.type !== "judged" &&
      input.type !== "lease_snapshot"
    )
      return { ok: true, event: duplicate } as const;
    if (previous?.terminal !== undefined && input.type === "running")
      return { ok: false, error: "cannot start a terminal run" } as const;
    const parent =
      input.type === "admitted" && input.predecessor !== undefined
        ? runs.get(input.predecessor)
        : undefined;
    const event = LifecycleEventSchema.safeParse({
      ...input,
      schema: 1,
      seq: (read.events.at(-1)?.seq ?? 0) + 1,
      event_id: crypto.randomUUID(),
      at: input.at ?? Temporal.Now.instant().toString(),
      lineage_id:
        previous?.lineage_id ??
        parent?.lineage_id ??
        snapshotLineage(read.events, input) ??
        input.lineage_id ??
        input.run_id,
      session_id: input.session_id ?? previous?.session_id ?? null,
    });
    if (!event.success)
      return { ok: false, error: event.error.message } as const;
    const line = Buffer.from(`${JSON.stringify(event.data)}\n`);
    const output = openSync(lifecyclePath(state), "a", 0o600);
    const written = fromThrowable(
      () => writeSync(output, line),
      errorMessage,
    )();
    closeSync(output);
    if (written.isErr()) return { ok: false, error: written.error } as const;
    if (written.value !== line.length)
      return {
        ok: false,
        error: "short lifecycle write; explicit tail repair required",
      } as const;
    return { ok: true, event: event.data } as const;
  }, errorMessage)();
  closeSync(fd); // close releases flock even after an error; never unlink the shared lock inode.
  library.value.close();
  return result.isOk() ? result.value : { ok: false, error: result.error };
}

function readLastLifecycleEventLocked(
  state: string,
  fd: number,
): { events: LifecycleEvent[]; errors: string[] } {
  const size = fstatSync(fd).size;
  if (size === 0) return { events: [], errors: [] };
  const chunks: Buffer[] = [];
  let cursor = size;
  while (cursor > 0) {
    const start = Math.max(0, cursor - 64 * 1024);
    const chunk = Buffer.allocUnsafe(cursor - start);
    const length = readSync(fd, chunk, 0, chunk.length, start);
    chunks.unshift(chunk.subarray(0, length));
    const data = Buffer.concat(chunks);
    if (data.at(-1) !== 10)
      return {
        events: [],
        errors: [
          `${lifecyclePath(state)}: corrupt or incomplete tail ignored; explicit repair required`,
        ],
      };
    const separator = data.lastIndexOf(10, data.length - 2);
    if (separator >= 0 || start === 0) {
      const line = data
        .subarray(separator + 1, data.length - 1)
        .toString("utf8");
      const parsed = jsonOf(LifecycleEventSchema).safeParse(line);
      return parsed.success
        ? { events: [parsed.data], errors: [] }
        : {
            events: [],
            errors: [
              `${lifecyclePath(state)}: corrupt tail ignored; explicit repair required`,
            ],
          };
    }
    cursor = start;
  }
  return { events: [], errors: [] };
}

function snapshotLineage(
  events: readonly LifecycleEvent[],
  input: LifecycleInput,
): string | undefined {
  if (input.type !== "admitted" || input.predecessor === undefined)
    return undefined;
  const snapshot = events.findLast(
    (event) =>
      event.type === "lease_snapshot" && event.record.repo === input.repo,
  );
  const index = z
    .record(z.string(), z.string())
    .safeParse(snapshot?.record.lineage_index);
  return index.success ? index.data[input.predecessor] : undefined;
}

/** Read only the latest snapshot and its suffix; no snapshot means replay all events. */
function parseLifecycleSuffixChunk(
  chunk: Buffer,
  carry: Buffer,
  start: number,
  repo: string,
  path: string,
): {
  carry: Buffer;
  events: LifecycleEvent[];
  foundSnapshot: boolean;
  error?: string;
} {
  const lines = Buffer.concat([chunk, carry]).toString("utf8").split("\n");
  const nextCarry =
    start === 0 ? Buffer.alloc(0) : Buffer.from(lines.shift() ?? "");
  const events: LifecycleEvent[] = [];
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined || line === "") continue;
    const parsed = jsonOf(LifecycleEventSchema).safeParse(line);
    if (!parsed.success)
      return {
        carry: nextCarry,
        events,
        foundSnapshot: false,
        error: `${path}: corrupt line in lifecycle suffix; explicit repair required`,
      };
    events.push(parsed.data);
    if (
      parsed.data.type === "lease_snapshot" &&
      parsed.data.record.repo === repo
    )
      return { carry: nextCarry, events, foundSnapshot: true };
  }
  return { carry: nextCarry, events, foundSnapshot: false };
}

function readLifecycleSinceSnapshotLocked(
  state: string,
  fd: number,
  repo: string,
): { events: LifecycleEvent[]; errors: string[] } {
  const path = lifecyclePath(state);
  const size = fstatSync(fd).size;
  if (size === 0) return { events: [], errors: [] };
  const finalByte = Buffer.allocUnsafe(1);
  if (readSync(fd, finalByte, 0, 1, size - 1) !== 1 || finalByte[0] !== 10)
    return {
      events: [],
      errors: [
        `${path}: corrupt or incomplete tail ignored; explicit repair required`,
      ],
    };
  const reverse: LifecycleEvent[] = [];
  let cursor = size;
  let carry: Buffer = Buffer.alloc(0);
  let foundSnapshot = false;
  while (cursor > 0) {
    const start = Math.max(0, cursor - 64 * 1024);
    const chunk = Buffer.allocUnsafe(cursor - start);
    const length = readSync(fd, chunk, 0, chunk.length, start);
    const suffix = parseLifecycleSuffixChunk(
      chunk.subarray(0, length),
      carry,
      start,
      repo,
      path,
    );
    if (suffix.error !== undefined)
      return { events: [], errors: [suffix.error] };
    carry = suffix.carry;
    reverse.push(...suffix.events);
    foundSnapshot = suffix.foundSnapshot;
    if (foundSnapshot) break;
    cursor = start;
  }
  const events = reverse.toReversed();
  for (let index = 1; index < events.length; index += 1)
    if (events[index]!.seq <= events[index - 1]!.seq)
      return {
        events: [],
        errors: [
          `${path}: invalid sequence in lifecycle suffix; explicit repair required`,
        ],
      };
  return { events, errors: [] };
}

const LegacyRecordSchema = z.looseObject({
  kind: z.string(),
  run_id: z.string().optional(),
  at: z.string().optional(),
  ended_at: z.string().optional(),
  started_at: z.string().optional(),
  dispatcher_session: z.string().optional(),
  cwd: z.string().optional(),
  repo: z.string().optional(),
  predecessor: z.string().optional(),
  resumed_from: z.string().optional(),
  pid: z.number().optional(),
  resource: z.unknown().optional(),
  continuation: z.unknown().optional(),
  ticket: z
    .looseObject({
      name: z.string().optional(),
      writes: z.array(z.string()).optional(),
    })
    .optional(),
  worker: z
    .looseObject({
      outcome: z.string().optional(),
      cause: z.string().optional(),
      session: z.string().optional(),
    })
    .optional(),
  exit: z.number().optional(),
  accept: z.boolean().optional(),
  note: z.string().optional(),
  review: z.string().optional(),
  return: z.unknown().optional(),
  facts: z
    .looseObject({ changed_files: z.array(z.string()).optional() })
    .optional(),
});

/** Migration mirror: old stores stay authoritative; failures are visible and never change dispatch. */
export function dualWriteLifecycle(state: string, raw: unknown): void {
  const parsed = LegacyRecordSchema.safeParse(raw);
  if (!parsed.success || parsed.data.run_id === undefined) return;
  const record = parsed.data;
  const common = {
    run_id: parsed.data.run_id,
    record,
    session_id: record.dispatcher_session,
    at: record.ended_at ?? record.at,
  };
  let input: LifecycleInput | undefined;
  if (record.kind === "admitted")
    input = {
      ...common,
      type: "admitted",
      repo: record.repo ?? "unknown",
      workspace: record.cwd ?? "unknown",
      ticket: record.ticket?.name ?? common.run_id,
      writes: record.ticket?.writes ?? [],
      resource: record.resource ?? null,
      predecessor: record.predecessor ?? record.resumed_from,
      continuation: record.continuation,
    };
  if (record.kind === "started" && record.pid !== undefined)
    input = {
      ...common,
      type: "running",
      pid: record.pid,
      started_at: record.started_at ?? Temporal.Now.instant().toString(),
    };
  if (record.kind === "run" || record.kind === "abandoned") {
    let outcome: "done" | "returned" | "failed" | "timeout" | "abandoned" =
      "failed";
    if (record.worker?.outcome === "ok") outcome = "done";
    if (record.worker?.outcome === "returned" || record.return !== undefined)
      outcome = "returned";
    if (record.worker?.outcome === "timeout") outcome = "timeout";
    if (record.kind === "abandoned") outcome = "abandoned";
    input = {
      ...common,
      type: "terminal",
      outcome,
      exit: record.exit,
      cause:
        record.worker?.cause ??
        (record.kind === "abandoned" ? "stopped externally" : undefined),
      vendor_session: record.worker?.session,
      workspace: record.cwd,
      changes_remain:
        record.facts?.changed_files === undefined
          ? undefined
          : record.facts.changed_files.length > 0,
    };
  }
  if (
    (record.kind === "acceptance" || record.kind === "landed") &&
    (record.kind === "landed" || record.accept !== undefined)
  )
    input = {
      ...common,
      type: "judged",
      decision:
        record.kind === "landed" || record.accept === true
          ? "accept"
          : "reject",
      note: record.note,
      evidence: record.review,
    };
  if (input === undefined) return;
  const result = appendLifecycle(state, input);
  if (!result.ok)
    process.stderr.write(
      `agx: lifecycle dual-write failed for ${common.run_id}: ${result.error}\n`,
    );
  if (record.kind === "landed") {
    const disposed = appendLifecycle(state, {
      ...common,
      type: "disposed",
    });
    if (!disposed.ok)
      process.stderr.write(
        `agx: lifecycle disposal dual-write failed for ${common.run_id}: ${disposed.error}\n`,
      );
  }
}
