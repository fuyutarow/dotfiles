import { open, stat, type FileHandle } from "node:fs/promises";

const READ_CHUNK_BYTES = 64 * 1024;

export type JsonlTail = Readonly<{ text: string; startOffset: number }>;
export type JsonlInput = string | Iterable<string>;

function* iterableJsonlLines(input: Iterable<string>): Generator<string> {
  for (const value of input) {
    const line = value.endsWith("\r") ? value.slice(0, -1) : value;
    if (line === "") continue;
    yield line;
  }
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
