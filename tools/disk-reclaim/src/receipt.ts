import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statfsSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { acquire } from "../../shared/src/dir-lock.ts";
import { fromThrowable, jsonOf } from "../../shared/src/zod.ts";
import { Receipt, type ReceiptV1, type ReceiptV2 } from "./model.ts";

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
export const freeBytes = (path = homedir()): number => {
  const s = statfsSync(path);
  return s.bavail * s.bsize;
};
export async function waitForLock(name: string, dir = stateDir()) {
  const waitS = Number(process.env.RECLAIM_LOCK_WAIT_S ?? "900");
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
    pollMs: Math.max(1, Math.min(2000, waitS * 1000)),
    onWait: (h) => {
      process.stderr.write(
        `disk-reclaim: ${name} waits for ${h === undefined ? "a lock being taken" : `${h.what} (pid ${h.pid} on ${h.host}, since ${h.since})`}\n`,
      );
    },
  });
  if (typeof lock === "function")
    return { exit: 0, error: null, release: lock };
  return {
    exit: 3,
    error: `lock stayed busy for ${waitS}s${lock === undefined ? "" : `, held by ${lock.what} (pid ${lock.pid} on ${lock.host}, since ${lock.since})`}`,
    release: null,
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
export function readReceipts(last = 10, dir = stateDir()) {
  const path = join(dir, "log.jsonl");
  if (!existsSync(path)) return { receipts: [], errors: [] };
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "");
  const receipts: (ReceiptV1 | ReceiptV2)[] = [];
  const errors: string[] = [];
  for (const [index, line] of lines.entries()) {
    const parsed = jsonOf(Receipt).safeParse(line);
    if (!parsed.success) {
      errors.push(`${path}:${index + 1}: ${parsed.error.message}`);
      continue;
    }
    receipts.push(parsed.data);
  }
  return { receipts: last === 0 ? [] : receipts.slice(-last), errors };
}
export function finalLine(receipt: ReceiptV1, path: string): void {
  process.stderr.write(
    `disk-reclaim: ${receipt.name} exit ${receipt.exit} · free ${gib(receipt.free_before)} → ${gib(receipt.free_after)} · receipt ${path}\n`,
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
