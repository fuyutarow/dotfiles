// One durable journal and two lifetimes: runner.lock for a drain, land.lock for one landing.
// No argv boundary; scripts/land.ts owns the CLI. Enqueue never starts a resident service.
import { appendFile, mkdir } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { acquire, holderOf, tryAcquire } from "../tools/shared/src/dir-lock.ts";
import { dispatchStateDir } from "../tools/shared/src/dispatch-state.ts";

const Enqueue = z.strictObject({
  schema: z.literal(1),
  kind: z.literal("enqueue"),
  id: z.string().min(1),
  ws: z.string().min(1),
  msg: z.string().trim().min(1),
  queued_at: z.string(),
  smoke: z.string().optional(),
  keep_workspace: z.boolean(),
});
const Start = z.strictObject({
  schema: z.literal(1),
  kind: z.literal("start"),
  id: z.string(),
  at: z.string(),
  pid: z.number().int().positive(),
  host: z.string(),
});
const Done = z.strictObject({
  schema: z.literal(1),
  kind: z.literal("result"),
  id: z.string(),
  at: z.string(),
  status: z.enum(["OK", "FAIL"]),
  exit: z.number().int(),
  detail: z.string(),
});
const Event = z.discriminatedUnion("kind", [Enqueue, Start, Done]);
export type QueueRequest = z.output<typeof Enqueue>;
type QueueEvent = z.output<typeof Event>;
type QueueItem = QueueRequest & {
  start?: z.output<typeof Start>;
  result?: z.output<typeof Done>;
};

const emit = (line: string): void => {
  process.stdout.write(`[land] queue: ${line}\n`);
};
const now = () => Temporal.Now.instant().toString();
const owner = (what: string) => ({
  pid: process.pid,
  host: hostname(),
  what,
  since: now(),
});

export function landStateDir(mainRoot: string): string {
  const key = new Bun.CryptoHasher("sha256")
    .update(mainRoot)
    .digest("hex")
    .slice(0, 16);
  return join(dispatchStateDir(), "land", key);
}

export async function landLock(
  mainRoot: string,
): Promise<(() => void) | Error> {
  const release = await acquire(
    join(landStateDir(mainRoot), "land.lock"),
    owner("land"),
    {
      onWait: (held) => {
        emit(`waiting for land lock (pid ${held?.pid ?? "unknown"})`);
      },
    },
  );
  return typeof release === "function"
    ? release
    : new Error("land lock wait expired");
}

async function readQueue(state: string): Promise<QueueItem[] | Error> {
  const file = Bun.file(join(state, "queue.jsonl"));
  if (!(await file.exists())) return [];
  const items = new Map<string, QueueItem>();
  for (const [index, line] of (await file.text()).split("\n").entries()) {
    if (line === "") continue;
    const decoded = jsonOf(Event).safeParse(line);
    if (!decoded.success)
      return new Error(`invalid queue journal at line ${index + 1}`);
    const event = decoded.data;
    if (event.kind === "enqueue" && items.has(event.id))
      return new Error(`duplicate queued id ${event.id}`);
    if (event.kind === "enqueue") {
      items.set(event.id, { ...event });
      continue;
    }
    const item = items.get(event.id);
    if (item === undefined)
      return new Error(`queue event without enqueue: ${event.id}`);
    if (event.kind === "start") item.start = event;
    else item.result = event;
  }
  return [...items.values()];
}

async function journal<T>(
  state: string,
  action: () => Promise<T>,
): Promise<T | Error> {
  const release = await acquire(
    join(state, "queue.lock"),
    owner("queue journal"),
  );
  if (typeof release !== "function")
    return new Error("queue journal lock wait expired");
  using _lock = { [Symbol.dispose]: release };
  const result = await attempt(action);
  return result.ok ? result.value : new Error(errorMessage(result.error));
}

async function append(state: string, event: QueueEvent): Promise<void> {
  await mkdir(state, { recursive: true });
  await appendFile(join(state, "queue.jsonl"), `${JSON.stringify(event)}\n`, {
    mode: 0o600,
  });
}

export async function enqueue(
  mainRoot: string,
  request: { ws: string; msg: string; smoke?: string; keep_workspace: boolean },
): Promise<string | Error> {
  const state = landStateDir(mainRoot);
  return journal(state, async () => {
    const items = await readQueue(state);
    if (items instanceof Error) return items;
    const parsed = Enqueue.safeParse({
      ...request,
      schema: 1,
      kind: "enqueue",
      id: crypto.randomUUID(),
      queued_at: now(),
    });
    if (!parsed.success) return new Error(parsed.error.message);
    await append(state, parsed.data);
    emit(
      `enqueued ${parsed.data.id} ${parsed.data.ws} (${join(state, "queue.jsonl")})`,
    );
    return parsed.data.id;
  });
}

export async function queueStatus(
  mainRoot: string,
): Promise<Error | undefined> {
  const state = landStateDir(mainRoot);
  const items = await journal(state, () => readQueue(state));
  if (items instanceof Error) return items;
  const count = (status: string) =>
    items.filter((item) => {
      const value =
        item.result?.status ??
        (item.start === undefined ? "pending" : "running");
      return value === status;
    }).length;
  process.stdout.write(
    `${JSON.stringify(
      {
        schema: 1,
        state_dir: state,
        runner: holderOf(join(state, "runner.lock")) ?? null,
        land: holderOf(join(state, "land.lock")) ?? null,
        pending: count("pending"),
        running: count("running"),
        OK: count("OK"),
        FAIL: count("FAIL"),
        items,
      },
      null,
      2,
    )}\n`,
  );
  return undefined;
}

async function mainClean(mainRoot: string): Promise<boolean | Error> {
  const result = await attempt(async () => {
    const snapshotSignal = AbortSignal.timeout(30_000);
    const snap = Bun.spawn(["jj", "--no-pager", "status"], {
      cwd: mainRoot,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal: snapshotSignal,
    });
    const [, snapshotError, snapshotCode] = await Promise.all([
      new Response(snap.stdout).text(),
      new Response(snap.stderr).text(),
      snap.exited,
    ]);
    if (
      snapshotSignal.aborted ||
      snapshotCode !== 0 ||
      snapshotError.includes("Refused to snapshot")
    )
      return new Error(
        `cannot confirm a clean main checkout: ${snapshotSignal.aborted ? "jj status timed out after 30s" : snapshotError}`,
      );
    const diffSignal = AbortSignal.timeout(30_000);
    const diff = Bun.spawn(
      [
        "jj",
        "--ignore-working-copy",
        "--no-pager",
        "diff",
        "--from",
        "@-",
        "--to",
        "@",
        "-T",
        'path ++ "\\0"',
      ],
      {
        cwd: mainRoot,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal: diffSignal,
      },
    );
    const [diffOutput, diffError, diffCode] = await Promise.all([
      new Response(diff.stdout).text(),
      new Response(diff.stderr).text(),
      diff.exited,
    ]);
    if (diffSignal.aborted || diffCode !== 0)
      return new Error(
        diffSignal.aborted ? "jj diff timed out after 30s" : diffError,
      );
    return diffOutput.length === 0;
  });
  return result.ok ? result.value : new Error(errorMessage(result.error));
}

export async function runQueue(
  mainRoot: string,
  land: (request: QueueRequest) => Promise<number>,
): Promise<number | Error> {
  const state = landStateDir(mainRoot);
  const runner = tryAcquire(
    join(state, "runner.lock"),
    owner("land queue runner"),
  );
  if (!runner.ok) {
    emit(`runner already active (pid ${runner.holder?.pid ?? "unknown"})`);
    return 0;
  }
  using _runner = { [Symbol.dispose]: runner.release };
  let failed = 0;
  let waiting = false;
  for (;;) {
    const items = await journal(state, () => readQueue(state));
    if (items instanceof Error) return items;
    const item = items.find((value) => value.result === undefined);
    if (item === undefined) {
      emit(`drained; FAIL ${failed}`);
      return failed === 0 ? 0 : 1;
    }
    const release = await landLock(mainRoot);
    if (release instanceof Error) return release;
    const result = await attempt(async () => {
      using _land = { [Symbol.dispose]: release };
      const clean = await mainClean(mainRoot);
      if (clean instanceof Error) return clean;
      if (!clean && item.start === undefined) return "wait";
      // An interrupted item is never blindly replayed: it may already have committed/pushed.
      if (item.start !== undefined) {
        const saved = await journal(state, () =>
          append(state, {
            schema: 1,
            kind: "result",
            id: item.id,
            at: now(),
            status: "FAIL",
            exit: 1,
            detail:
              "interrupted runner; inspect the landed commit before re-enqueueing",
          }),
        );
        if (saved instanceof Error) return saved;
        emit(`FAIL ${item.ws}: interrupted runner`);
        return 1;
      }
      const started = await journal(state, () =>
        append(state, {
          schema: 1,
          kind: "start",
          id: item.id,
          at: now(),
          pid: process.pid,
          host: hostname(),
        }),
      );
      if (started instanceof Error) return started;
      emit(`landing ${item.ws} id=${item.id}`);
      const landed = await attempt(() => land(item));
      const code = landed.ok ? landed.value : 2;
      const recorded = await journal(state, () =>
        append(state, {
          schema: 1,
          kind: "result",
          id: item.id,
          at: now(),
          status: code === 0 ? "OK" : "FAIL",
          exit: code,
          detail: landed.ok
            ? `land exited ${code}`
            : errorMessage(landed.error),
        }),
      );
      if (recorded instanceof Error) return recorded;
      emit(`${code === 0 ? "OK" : "FAIL"} ${item.ws} id=${item.id}`);
      return code;
    });
    if (!result.ok) return new Error(errorMessage(result.error));
    if (result.value instanceof Error) return result.value;
    if (result.value === "wait" && !waiting)
      emit("waiting for a clean main checkout");
    if (result.value === "wait") {
      waiting = true;
      await Bun.sleep(2_000);
      continue;
    }
    waiting = false;
    if (result.value !== 0) failed++;
  }
}
