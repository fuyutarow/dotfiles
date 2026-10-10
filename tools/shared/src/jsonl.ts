import {
  createReadStream,
  closeSync,
  openSync,
  readSync,
  statSync,
} from "node:fs";
import { open, stat, type FileHandle } from "node:fs/promises";
import { createInterface } from "node:readline";
import { StringDecoder } from "node:string_decoder";

const READ_CHUNK_BYTES = 64 * 1024;
export const DEFAULT_JSONL_TAIL_BYTES = 4 * 1024 * 1024;

export type JsonlTail = Readonly<{ text: string; startOffset: number }>;
export type JsonlInput = string | Iterable<string>;

function readRange(fd: number, start: number, end: number): Buffer[] {
  const chunks: Buffer[] = [];
  let offset = start;
  while (offset < end) {
    const length = Math.min(READ_CHUNK_BYTES, end - offset);
    const chunk = Buffer.allocUnsafe(length);
    const read = readSync(fd, chunk, 0, length, offset);
    if (read === 0) break;
    chunks.push(chunk.subarray(0, read));
    offset += read;
  }
  return chunks;
}

function nextNonEmptyLine(text: string): {
  line: string | undefined;
  rest: string;
} {
  let rest = text;
  while (true) {
    const newline = rest.indexOf("\n");
    if (newline < 0) return { line: undefined, rest };
    const value = rest.slice(0, newline);
    rest = rest.slice(newline + 1);
    const line = value.endsWith("\r") ? value.slice(0, -1) : value;
    if (line === "") continue;
    return { line, rest };
  }
}

function* iterableJsonlLines(input: Iterable<string>): Generator<string> {
  for (const value of input) {
    const line = value.endsWith("\r") ? value.slice(0, -1) : value;
    if (line === "") continue;
    yield line;
  }
}

function tailStartOffset(fd: number, size: number, maxBytes: number): number {
  const candidate = Math.max(0, size - Math.max(0, maxBytes));
  if (candidate === 0) return 0;

  const previous = Buffer.allocUnsafe(1);
  if (readSync(fd, previous, 0, 1, candidate - 1) === 1 && previous[0] === 0x0a)
    return candidate;

  let offset = candidate;
  while (offset < size) {
    const length = Math.min(READ_CHUNK_BYTES, size - offset);
    const chunk = Buffer.allocUnsafe(length);
    const read = readSync(fd, chunk, 0, length, offset);
    if (read === 0) break;
    const newline = chunk.subarray(0, read).indexOf(0x0a);
    if (newline >= 0) {
      const boundary = offset + newline + 1;
      return boundary < size ? boundary : size;
    }
    offset += read;
  }
  return size;
}

// Sync tail API remains for synchronous ledger handlers; render warning reads use readJsonlTail.
/** Read a bounded tail and discard any partial first line. */
export function readJsonlTailSync(path: string, maxBytes: number): JsonlTail {
  const size = statSync(path).size;
  const fd = openSync(path, "r");
  const startOffset = tailStartOffset(fd, size, maxBytes);
  const chunks = readRange(fd, startOffset, size);
  closeSync(fd);
  return {
    text: Buffer.concat(chunks).toString("utf8"),
    startOffset,
  };
}

export async function readJsonlTail(
  path: string,
  maxBytes: number,
): Promise<JsonlTail> {
  const size = (await stat(path)).size;
  await using fd = await open(path, "r");
  const startOffset = await tailStartOffsetAsync(fd, size, maxBytes);
  const chunks = await readRangeAsync(fd, startOffset, size);
  return { text: Buffer.concat(chunks).toString("utf8"), startOffset };
}

async function readRangeAsync(
  fd: FileHandle,
  start: number,
  end: number,
): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  let offset = start;
  while (offset < end) {
    const length = Math.min(READ_CHUNK_BYTES, end - offset);
    const chunk = Buffer.allocUnsafe(length);
    const { bytesRead } = await fd.read(chunk, 0, length, offset);
    if (bytesRead === 0) break;
    chunks.push(chunk.subarray(0, bytesRead));
    offset += bytesRead;
  }
  return chunks;
}

async function tailStartOffsetAsync(
  fd: FileHandle,
  size: number,
  maxBytes: number,
): Promise<number> {
  const candidate = Math.max(0, size - Math.max(0, maxBytes));
  if (candidate === 0) return 0;

  const previous = Buffer.allocUnsafe(1);
  const prior = await fd.read(previous, 0, 1, candidate - 1);
  if (prior.bytesRead === 1 && previous[0] === 0x0a) return candidate;

  let offset = candidate;
  while (offset < size) {
    const length = Math.min(READ_CHUNK_BYTES, size - offset);
    const chunk = Buffer.allocUnsafe(length);
    const { bytesRead } = await fd.read(chunk, 0, length, offset);
    if (bytesRead === 0) break;
    const newline = chunk.subarray(0, bytesRead).indexOf(0x0a);
    if (newline >= 0) {
      const boundary = offset + newline + 1;
      return boundary < size ? boundary : size;
    }
    offset += bytesRead;
  }
  return size;
}

/** Stream non-empty JSONL lines without retaining the file or an array of lines. */
export async function* readJsonlLines(path: string): AsyncGenerator<string> {
  const lines = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of lines) if (line !== "") yield line;
}

/** A synchronous streaming JSONL reader for commands with synchronous handlers. */
export class JsonlLineReader implements IterableIterator<string> {
  private readonly fd: number;
  private readonly decoder = new StringDecoder("utf8");
  private readonly buffer = Buffer.allocUnsafe(READ_CHUNK_BYTES);
  private pending = "";
  private ended = false;
  private closed = false;

  constructor(path: string) {
    this.fd = openSync(path, "r");
  }

  [Symbol.iterator](): IterableIterator<string> {
    return this;
  }

  next(): IteratorResult<string> {
    while (!this.ended) {
      const line = nextNonEmptyLine(this.pending);
      this.pending = line.rest;
      if (line.line !== undefined) return { done: false, value: line.line };

      const read = readSync(this.fd, this.buffer, 0, this.buffer.length, null);
      if (read === 0) {
        this.pending += this.decoder.end();
        this.ended = true;
        break;
      }
      this.pending += this.decoder.write(this.buffer.subarray(0, read));
    }

    this.close();
    const value = this.pending.endsWith("\r")
      ? this.pending.slice(0, -1)
      : this.pending;
    this.pending = "";
    return value === ""
      ? { done: true, value: undefined }
      : { done: false, value };
  }

  return(): IteratorResult<string> {
    this.close();
    return { done: true, value: undefined };
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    closeSync(this.fd);
  }
}

/** Iterate lines from in-memory JSONL text or an iterable, without split-created line arrays. */
export function* jsonlLines(input: JsonlInput): Generator<string> {
  if (typeof input !== "string") {
    yield* iterableJsonlLines(input);
    return;
  }

  let start = 0;
  for (let offset = 0; offset < input.length; offset += 1) {
    if (input.codePointAt(offset) !== 10) continue;
    const value = input.slice(start, offset);
    const line = value.endsWith("\r") ? value.slice(0, -1) : value;
    if (line !== "") yield line;
    start = offset + 1;
  }
  if (start < input.length) {
    const value = input.slice(start);
    const line = value.endsWith("\r") ? value.slice(0, -1) : value;
    if (line !== "") yield line;
  }
}
