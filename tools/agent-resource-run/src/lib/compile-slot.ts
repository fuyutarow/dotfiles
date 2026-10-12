import {
  mkdir,
  readFile,
  readdir,
  rename,
  rmdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { cpus, homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "neverthrow";
import { jsonOf, z } from "../../../shared/src/zod.ts";

const LOCK_STALE_MS = 5_000;
const LOCK_WAIT_MS = 15 * 60_000;
const POLL_MS = 100;

const EntrySchema = z.object({
  pid: z.number().int().positive(),
  token: z.string(),
  created_at: z.number(),
});
type Entry = z.output<typeof EntrySchema>;

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export const defaultJuliaCompileSlots = (): number =>
  Math.max(1, Math.floor(cpus().length / 6));

export async function juliaCompileSlotCapacity(): Promise<
  Result<number, Error>
> {
  const override = process.env.AGENT_RESOURCE_SLOTS;
  const path =
    override === undefined || override === ""
      ? join(homedir(), ".config", "agent-resource", "slots.toml")
      : override;
  if (!path.startsWith("/"))
    return err(new Error("AGENT_RESOURCE_SLOTS must be an absolute path"));
  const contents = await fromAsyncThrowable(() => readFile(path, "utf8"))();
  if (contents.isErr()) {
    const code = z.object({ code: z.string() }).safeParse(contents.error);
    if (code.success && code.data.code === "ENOENT")
      return ok(defaultJuliaCompileSlots());
    return err(asError(contents.error));
  }
  const parsedToml = fromThrowable(() => Bun.TOML.parse(contents.value))();
  if (parsedToml.isErr())
    return err(new Error(`cannot parse slot declaration '${path}'`));
  const parsed = z
    .object({
      schema: z.literal(1),
      julia_compile: z.number().int().positive(),
    })
    .strict()
    .safeParse(parsedToml.value);
  if (!parsed.success)
    return err(
      new Error(
        `slot declaration '${path}' must contain schema=1 and a positive julia_compile count`,
      ),
    );
  return ok(parsed.data.julia_compile);
}

function pidAlive(pid: number): boolean {
  const probe = fromThrowable(() => process.kill(pid, 0))();
  if (probe.isOk()) return true;
  const error = z.object({ code: z.string() }).safeParse(probe.error);
  return error.success && error.data.code === "EPERM";
}

async function readEntry(path: string): Promise<Entry | null> {
  const text = await fromAsyncThrowable(() => readFile(path, "utf8"))();
  if (text.isErr()) return null;
  const parsed = jsonOf(EntrySchema).safeParse(text.value);
  return parsed.success ? parsed.data : null;
}

async function releaseLock(path: string): Promise<void> {
  const ownerPath = join(path, "owner.json");
  const owner = await readEntry(ownerPath);
  if (owner?.pid !== process.pid) return;
  await fromAsyncThrowable(async () => {
    await unlink(ownerPath);
    await rmdir(path);
  })();
}

function errorCode(error: unknown): string | undefined {
  const parsed = z.object({ code: z.string() }).safeParse(error);
  return parsed.success ? parsed.data.code : undefined;
}

async function withLock<T>(
  path: string,
  action: () => Promise<Result<T, Error>>,
): Promise<Result<T, Error>> {
  const parent = await fromAsyncThrowable(() =>
    mkdir(join(path, ".."), { recursive: true, mode: 0o700 }),
  )();
  if (parent.isErr()) return err(asError(parent.error));
  const deadline = performance.now() + LOCK_WAIT_MS;
  while (performance.now() < deadline) {
    const created = await fromAsyncThrowable(async () => {
      await mkdir(path, { mode: 0o700 });
      await writeFile(
        join(path, "owner.json"),
        `${JSON.stringify({ pid: process.pid, token: randomUUID(), created_at: Temporal.Now.instant().epochMilliseconds })}\n`,
        { flag: "wx", mode: 0o600 },
      );
    })();
    if (created.isOk()) {
      const result = await action();
      await releaseLock(path);
      return result;
    }
    if (errorCode(created.error) !== "EEXIST")
      return err(asError(created.error));
    const owner = await readEntry(join(path, "owner.json"));
    const lockStat = await fromAsyncThrowable(() => stat(path))();
    const oldEnough =
      lockStat.isOk() &&
      Temporal.Now.instant().epochMilliseconds - lockStat.value.mtimeMs >=
        LOCK_STALE_MS;
    if (oldEnough && (owner === null || !pidAlive(owner.pid))) {
      await fromAsyncThrowable(async () => {
        await unlink(join(path, "owner.json"));
        await rmdir(path);
      })();
      continue;
    }
    await Bun.sleep(POLL_MS);
  }
  return err(
    new Error(`timed out acquiring compile-slot state lock '${path}'`),
  );
}

async function liveEntries(directory: string): Promise<Result<Entry[], Error>> {
  const names = await fromAsyncThrowable(() => readdir(directory))();
  if (names.isErr()) return err(asError(names.error));
  const entries: Entry[] = [];
  for (const name of names.value) {
    if (!name.endsWith(".json")) continue;
    const path = join(directory, name);
    const entry = await readEntry(path);
    if (entry !== null && pidAlive(entry.pid)) {
      entries.push(entry);
      continue;
    }
    await fromAsyncThrowable(() => unlink(path))();
  }
  return ok(
    entries.toSorted((left, right) => {
      if (left.created_at !== right.created_at)
        return left.created_at - right.created_at;
      return left.token.localeCompare(right.token);
    }),
  );
}

export type CompileSlotOptions = {
  stateDirectory: string;
  capacity: number;
  pollMs?: number;
  report?: (line: string) => void;
};

export type CompileSlotLease = { release: () => void };

/** Acquire a host-wide Julia compile slot in ticket order; dead owners are reclaimed on sight. */
export async function acquireJuliaCompileSlot(
  options: CompileSlotOptions,
): Promise<Result<CompileSlotLease, Error>> {
  const capacity = options.capacity;
  if (!Number.isSafeInteger(capacity) || capacity < 1)
    return err(
      new Error("julia-compile slot capacity must be a positive integer"),
    );
  const root = options.stateDirectory;
  const queue = join(root, "julia-compile", "queue");
  const holders = join(root, "julia-compile", "holders");
  const lock = join(root, "julia-compile", ".lock");
  const setup = await fromAsyncThrowable(async () => {
    await mkdir(queue, { recursive: true, mode: 0o700 });
    await mkdir(holders, { recursive: true, mode: 0o700 });
  })();
  if (setup.isErr()) return err(asError(setup.error));
  const token = randomUUID();
  const createdAt = performance.timeOrigin + performance.now();
  const ticketPath = join(
    queue,
    `${createdAt.toString().padStart(20, "0")}-${token}.json`,
  );
  const pendingTicketPath = join(queue, `.${token}.tmp`);
  const ticketWrite = await fromAsyncThrowable(async () => {
    await writeFile(
      pendingTicketPath,
      `${JSON.stringify({ pid: process.pid, token, created_at: createdAt })}\n`,
      { flag: "wx", mode: 0o600 },
    );
    await rename(pendingTicketPath, ticketPath);
  })();
  if (ticketWrite.isErr()) return err(asError(ticketWrite.error));

  let acquiredPath: string | null = null;
  let waitingReported = false;
  while (acquiredPath === null) {
    const state = await withLock<{
      path: string | null;
      holders: number;
      ahead: number;
    }>(lock, async () => {
      const queueEntries = await liveEntries(queue);
      if (queueEntries.isErr()) return err(asError(queueEntries.error));
      const holderEntries = await liveEntries(holders);
      if (holderEntries.isErr()) return err(asError(holderEntries.error));
      const position = queueEntries.value.findIndex(
        (entry) => entry.token === token,
      );
      if (position === -1)
        return err(new Error("compile-slot queue ticket disappeared"));
      if (
        holderEntries.value.length < capacity &&
        position < capacity - holderEntries.value.length
      ) {
        const path = join(holders, `${token}.json`);
        const holder = await fromAsyncThrowable(() =>
          writeFile(
            path,
            `${JSON.stringify({ pid: process.pid, token, created_at: createdAt })}\n`,
            { flag: "wx", mode: 0o600 },
          ),
        )();
        if (holder.isErr()) return err(asError(holder.error));
        const removed = await fromAsyncThrowable(() => unlink(ticketPath))();
        if (removed.isErr()) return err(asError(removed.error));
        return ok({ path, holders: holderEntries.value.length + 1, ahead: 0 });
      }
      return ok({
        path: null,
        holders: holderEntries.value.length,
        ahead: position,
      });
    });
    if (state.isErr()) {
      await fromAsyncThrowable(() => unlink(ticketPath))();
      return err(asError(state.error));
    }
    acquiredPath = state.value.path;
    if (acquiredPath === null && !waitingReported) {
      options.report?.(
        `WAIT slot=julia-compile holders=${state.value.holders}/${capacity} ahead=${state.value.ahead}`,
      );
      waitingReported = true;
    }
    if (acquiredPath === null) await Bun.sleep(options.pollMs ?? POLL_MS);
  }

  let released = false;
  const holderPath = acquiredPath;
  return ok({
    release: () => {
      if (released) return;
      released = true;
      fromAsyncThrowable(() => unlink(holderPath))();
    },
  });
}
