import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";
import { errorMessage } from "../../shared/src/attempt.ts";
import { JsonlLineReader, readJsonlTailSync } from "../../shared/src/jsonl.ts";

const ARCHIVE_PATTERN = /^runs-\d{4}-\d{2}-\d{2}\.jsonl$/u;
const COPY_CHUNK_BYTES = 64 * 1024;

export const LIVE_LEDGER_MAX_BYTES = 16 * 1024 * 1024;
export const LIVE_LEDGER_KEEP_BYTES = 8 * 1024 * 1024;
const DEFAULT_ROTATION_POLICY = {
  maxBytes: LIVE_LEDGER_MAX_BYTES,
  keepBytes: LIVE_LEDGER_KEEP_BYTES,
};

type LockResult<T> = { ok: true; value: T } | { ok: false; error: string };

function staleLock(path: string): boolean {
  const text = fromThrowable(() => readFileSync(path, "utf8"), errorMessage)();
  const info = fromThrowable(() => statSync(path), errorMessage)();
  if (text.isOk()) {
    const owner = Number(text.value);
    if (Number.isSafeInteger(owner) && owner > 0) {
      const alive = fromThrowable(() => process.kill(owner, 0), errorMessage)();
      return alive.isErr() && alive.error.includes("ESRCH");
    }
  }
  return (
    info.isOk() &&
    Temporal.Now.instant().epochMilliseconds - info.value.mtimeMs > 60_000
  );
}

function runLocked<T>(
  lockPath: string,
  descriptor: number,
  operation: () => T,
): LockResult<T> {
  const initialized = fromThrowable(() => {
    writeSync(descriptor, String(process.pid));
    closeSync(descriptor);
  }, errorMessage)();
  if (initialized.isErr()) {
    fromThrowable(() => {
      unlinkSync(lockPath);
    }, errorMessage)();
    return { ok: false, error: initialized.error };
  }
  const result = fromThrowable(operation, errorMessage)();
  const released = fromThrowable(() => {
    unlinkSync(lockPath);
  }, errorMessage)();
  if (result.isErr()) return { ok: false, error: result.error };
  if (released.isErr()) return { ok: false, error: released.error };
  return { ok: true, value: result.value };
}

function withLedgerLock<T>(
  stateDir: string,
  operation: () => T,
): LockResult<T> {
  mkdirSync(stateDir, { recursive: true });
  const lockPath = join(stateDir, "runs.lock");
  const waitCell = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const opened = fromThrowable(
      () => openSync(lockPath, "wx"),
      errorMessage,
    )();
    if (opened.isOk()) return runLocked(lockPath, opened.value, operation);
    if (!opened.error.includes("EEXIST"))
      return { ok: false, error: opened.error };
    if (!existsSync(lockPath)) continue;
    if (staleLock(lockPath)) {
      fromThrowable(() => {
        unlinkSync(lockPath);
      }, errorMessage)();
      continue;
    }
    Atomics.wait(waitCell, 0, 0, 10);
  }
  return { ok: false, error: "timed out waiting for the ledger lock" };
}

export function ledgerFiles(stateDir: string): string[] {
  if (!existsSync(stateDir)) return [];
  const archives = readdirSync(stateDir)
    .filter((name) => ARCHIVE_PATTERN.test(name))
    .toSorted()
    .map((name) => join(stateDir, name));
  const live = join(stateDir, "runs.jsonl");
  return existsSync(live) ? [...archives, live] : archives;
}

export function* ledgerLines(stateDir: string): Generator<string> {
  for (const path of ledgerFiles(stateDir)) yield* new JsonlLineReader(path);
}

export function appendLedgerLine(
  stateDir: string,
  line: string,
): LockResult<void> {
  return withLedgerLock(stateDir, () => {
    appendFileSync(join(stateDir, "runs.jsonl"), line);
  });
}

function appendPrefix(
  source: string,
  destination: string,
  bytes: number,
): void {
  if (bytes <= 0) return;
  const input = openSync(source, "r");
  const output = openSync(destination, "a");
  const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES);
  let offset = 0;
  while (offset < bytes) {
    const length = Math.min(chunk.length, bytes - offset);
    const read = readSync(input, chunk, 0, length, offset);
    if (read === 0) break;
    let written = 0;
    while (written < read)
      written += writeSync(output, chunk, written, read - written);
    offset += read;
  }
  closeSync(output);
  closeSync(input);
}

export function rotateRunsLog(
  stateDir: string,
  policy: { maxBytes: number; keepBytes: number } = DEFAULT_ROTATION_POLICY,
): {
  archivedBytes: number;
  liveBytes: number;
  archive: string | undefined;
  error?: string;
} {
  const live = join(stateDir, "runs.jsonl");
  if (!existsSync(live))
    return { archivedBytes: 0, liveBytes: 0, archive: undefined };
  const result = withLedgerLock(stateDir, () => {
    const size = statSync(live).size;
    if (size <= policy.maxBytes)
      return { archivedBytes: 0, liveBytes: size, archive: undefined };

    const tail = readJsonlTailSync(live, policy.keepBytes);
    if (tail.startOffset === 0)
      return { archivedBytes: 0, liveBytes: size, archive: undefined };

    const date = Temporal.Now.instant().toString().slice(0, 10);
    const archive = join(stateDir, `runs-${date}.jsonl`);
    appendPrefix(live, archive, tail.startOffset);
    const temporary = `${live}.${process.pid}.tmp`;
    writeFileSync(temporary, tail.text);
    renameSync(temporary, live);
    return {
      archivedBytes: tail.startOffset,
      liveBytes: Buffer.byteLength(tail.text),
      archive,
    };
  });
  return result.ok
    ? result.value
    : {
        archivedBytes: 0,
        liveBytes: statSync(live).size,
        archive: undefined,
        error: result.error,
      };
}
