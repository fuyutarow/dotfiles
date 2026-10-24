import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statfsSync,
} from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { acquire, pidAlive } from "../../shared/src/dir-lock.ts";
import { fromThrowable, jsonOf, z } from "../../shared/src/zod.ts";
import {
  Receipt,
  ReclaimItemOutcome,
  type ReceiptV1,
  type ReceiptV2,
} from "./model.ts";

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
export const now = (): string => Temporal.Now.instant().toString();
const nonEmpty = (s: string | undefined) => (s === "" ? undefined : s);
const gib = (b: number) => `${(b / 2 ** 30).toFixed(1)}G`;
export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolve(
    nonEmpty(env.RECLAIM_STATE_DIR) ??
      join(
        nonEmpty(env.XDG_STATE_HOME) ?? join(homedir(), ".local/state"),
        "reclaim",
      ),
  );
}
const Waiter = z.object({
  pid: z.number().int().positive(),
  host: z.string(),
  since: z.string(),
});
type Waiter = z.output<typeof Waiter>;
const waiterDir = (dir: string) => join(dir, "foreground-waiters");
export async function registerForegroundWaiter(
  dir = stateDir(),
): Promise<() => Promise<void>> {
  const path = waiterDir(dir);
  await mkdir(path, { recursive: true, mode: 0o700 });
  const waiter: Waiter = { pid: process.pid, host: hostname(), since: now() };
  const file = join(path, `${process.pid}-${crypto.randomUUID()}.json`);
  await writeFile(file, `${JSON.stringify(waiter)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  return async () => {
    await rm(file, { force: true });
  };
}
export async function hasForegroundWaiter(dir = stateDir()): Promise<boolean> {
  const listed = await fromAsyncThrowable(() => readdir(waiterDir(dir)))();
  if (listed.isErr()) return false;
  for (const name of listed.value) {
    const file = join(waiterDir(dir), name);
    const contents = await fromAsyncThrowable(() => readFile(file, "utf8"))();
    if (contents.isErr()) continue;
    const parsed = jsonOf(Waiter).safeParse(contents.value);
    if (!parsed.success) continue;
    const waiter = parsed.data;
    if (waiter.host === hostname() && pidAlive(waiter.pid)) return true;
    if (waiter.host === hostname())
      await fromAsyncThrowable(() => rm(file, { force: true }))();
  }
  return false;
}
export const freeBytes = (path = homedir()): number => {
  const s = statfsSync(path);
  return s.bavail * s.bsize;
};
export async function waitForLock(
  name: string,
  dir = stateDir(),
  log: (text: string) => void = (text) => {
    process.stderr.write(`${text}\n`);
  },
  boundedWaitS?: number,
) {
  const started = performance.now();
  const waitS =
    boundedWaitS ?? Number(process.env.RECLAIM_LOCK_WAIT_S ?? "900");
  if (!Number.isFinite(waitS) || waitS < 0)
    return {
      exit: 2,
      error: "RECLAIM_LOCK_WAIT_S must be a non-negative number",
      release: null,
    };
  const me = {
    pid: process.pid,
    host: hostname(),
    what: `disk-reclaim:${name}`,
    since: now(),
  };
  const lock = await acquire(join(dir, "lock"), me, {
    waitMs: waitS * 1000,
    pollMs: Math.max(
      1,
      Math.min(boundedWaitS === undefined ? 2000 : 10, waitS * 1000),
    ),
    onWait: (h) => {
      log(
        `disk-reclaim: ${name} waits for ${h === undefined ? "a lock being taken" : `${h.what} (pid ${h.pid} on ${h.host}, since ${h.since})`}`,
      );
    },
  });
  if (typeof lock === "function")
    return { exit: 0, error: null, release: lock };
  return {
    exit: 3,
    error: `lock stayed busy for ${waitS}s${lock === undefined ? "" : `, held by ${lock.what} (pid ${lock.pid} on ${lock.host}, since ${lock.since})`}`,
    release: null,
    holder: lock ?? null,
    elapsed_ms: performance.now() - started,
  };
}
export function outputPath(name: string, dir = stateDir()): string {
  mkdirSync(join(dir, "runs"), { recursive: true });
  return join(
    dir,
    "runs",
    `${now().replaceAll(":", "")}-${name.replaceAll(/[^a-zA-Z0-9_-]/gu, "_")}-${crypto.randomUUID()}.log`,
  );
}
export function writeReceipt(
  receipt: ReceiptV1 | ReceiptV2,
  dir = stateDir(),
): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "log.jsonl");
  appendFileSync(path, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
  return path;
}
export function writeItemOutcomes(
  outcomes: Omit<ReclaimItemOutcome, "event">[],
  dir = stateDir(),
): void {
  if (outcomes.length === 0) return;
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "log.jsonl");
  appendFileSync(
    path,
    outcomes
      .map((outcome) => JSON.stringify({ event: "item-outcome", ...outcome }))
      .join("\n") + "\n",
    { mode: 0o600 },
  );
}
export function readReceipts(last = 10, dir = stateDir()) {
  const path = join(dir, "log.jsonl");
  if (!existsSync(path)) return { receipts: [], errors: [] };
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const receipts: (ReceiptV1 | ReceiptV2)[] = [];
  const errors: string[] = [];
  for (const [index, line] of lines.entries()) {
    const itemOutcome = jsonOf(ReclaimItemOutcome).safeParse(line);
    if (itemOutcome.success) continue;
    const parsed = jsonOf(Receipt).safeParse(line);
    if (!parsed.success) {
      errors.push(`${path}:${index + 1}: ${parsed.error.message}`);
      continue;
    }
    receipts.push(parsed.data);
  }
  return { receipts: last === 0 ? [] : receipts.slice(-last), errors };
}
export function finalLine(
  receipt: ReceiptV1,
  path: string,
  log: (text: string) => void = (text) => {
    process.stderr.write(`${text}\n`);
  },
): void {
  log(
    `disk-reclaim: ${receipt.name} exit ${receipt.exit} · free ${gib(receipt.free_before)} → ${gib(receipt.free_after)} · receipt ${path}`,
  );
}
export async function wrap(
  name: string,
  command: string[],
  interactive = false,
): Promise<number> {
  if (command.length === 0 || (interactive && !process.stdin.isTTY)) {
    process.stderr.write(
      "disk-reclaim: wrap requires a command; --interactive requires a TTY\n",
    );
    return 2;
  }
  const dir = stateDir();
  const lock = await waitForLock(name, dir);
  if (lock.release === null) {
    process.stderr.write(`disk-reclaim: ${lock.error}\n`);
    return lock.exit;
  }
  using _lock = { [Symbol.dispose]: lock.release };
  const result = await fromAsyncThrowable(async () => {
    const started = now();
    const before = freeBytes();
    const output = interactive ? null : outputPath(name, dir);
    const log = output === null ? undefined : Bun.file(output).writer();
    // bounded: forwarded owner command controls its own lifetime; interactive commands retain the terminal.
    const spawned = fromThrowable(() =>
      Bun.spawn(command, {
        stdin: interactive ? "inherit" : "ignore",
        stdout: interactive ? "inherit" : "pipe",
        stderr: interactive ? "inherit" : "pipe",
      }),
    )();
    let exit = 1;
    const tee = async (
      stream: ReadableStream<Uint8Array>,
      to: NodeJS.WriteStream,
    ) => {
      for await (const chunk of stream) {
        to.write(chunk);
        await log?.write(chunk);
      }
    };
    if (spawned.isOk()) {
      const proc = spawned.value;
      const [, , code] = await Promise.all([
        proc.stdout === null || proc.stdout === undefined
          ? Promise.resolve()
          : tee(proc.stdout, process.stdout),
        proc.stderr === null || proc.stderr === undefined
          ? Promise.resolve()
          : tee(proc.stderr, process.stderr),
        proc.exited,
      ]);
      exit = code;
    } else {
      const message = `reclaim: ${errorMessage(spawned.error)}\n`;
      process.stderr.write(message);
      await log?.write(message);
    }
    await log?.end();
    const receipt: ReceiptV2 = {
      schema: 2,
      target: name,
      tier: interactive ? "interactive" : "owner",
      actions: [],
      name,
      command,
      host: hostname(),
      pid: process.pid,
      started,
      ended: now(),
      exit,
      free_before: before,
      free_after: freeBytes(),
      output,
    };
    finalLine(receipt, writeReceipt(receipt, dir));
    return exit;
  })();
  if (result.isErr()) {
    process.stderr.write(`disk-reclaim: ${errorMessage(result.error)}\n`);
    return 2;
  }
  return result.value;
}
