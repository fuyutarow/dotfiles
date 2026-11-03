// Bounded backward reader for Claude transcripts (JSONL).
//
// Stop hooks decide on the current turn, which is at the end of the file. Reading the whole
// transcript makes their cost grow with session length, so they stream entries newest-first
// and stop as soon as their decision is determined. Memory is one chunk plus the partial line
// that straddles it; CPU is proportional to the bytes the consumer actually reaches.
//
// Line semantics match readTranscript (lib.ts): split on "\n", skip blank lines, skip lines
// that are not JSON, and keep only the fields the hooks read. Newline is ASCII, so per-line
// UTF-8 decoding yields the same strings as decoding the whole file.

import { open, type FileHandle } from "node:fs/promises";
import { arr, at, parseJson, str, strAt } from "../../../hooks/narrow.ts";

export type TranscriptEntry = {
  type?: string | undefined;
  message?: { content?: unknown } | undefined;
};

// One transcript line, read field by field (a field of the wrong type is simply absent).
export function entryOf(line: unknown): TranscriptEntry {
  return {
    type: strAt(line, "type"),
    message: { content: at(line, "message", "content") },
  };
}

const CHUNK_BYTES = 64 * 1024;
const NEWLINE = 0x0a;

function parseLine(bytes: Buffer): TranscriptEntry | undefined {
  const line = bytes.toString("utf8");
  if (line.trim() === "") return undefined;
  const parsed = parseJson(line);
  return parsed === undefined ? undefined : entryOf(parsed);
}

// Reads up to `length` bytes at `start`; shorter only at end of file.
async function readRange(
  handle: FileHandle,
  start: number,
  length: number,
): Promise<Buffer> {
  const bytes = Buffer.alloc(length);
  let filled = 0;
  while (filled < length) {
    const { bytesRead } = await handle.read(
      bytes,
      filled,
      length - filled,
      start + filled,
    );
    if (bytesRead === 0) break;
    filled += bytesRead;
  }
  return bytes.subarray(0, filled);
}

function lastNewline(data: Buffer, end: number): number {
  return end > 0 ? data.lastIndexOf(NEWLINE, end - 1) : -1;
}

// Complete lines of `data`, newest first, and the unterminated head before the first newline.
function splitBackward(data: Buffer): { lines: Buffer[]; head: Buffer } {
  const lines: Buffer[] = [];
  let end = data.length;
  for (
    let newline = lastNewline(data, end);
    newline >= 0;
    newline = lastNewline(data, end)
  ) {
    lines.push(data.subarray(newline + 1, end));
    end = newline;
  }
  return { lines, head: data.subarray(0, end) };
}

function* entriesOf(lines: Buffer[]): Generator<TranscriptEntry> {
  for (const line of lines) {
    const entry = parseLine(line);
    if (entry !== undefined) yield entry;
  }
}

// Yields transcript entries from the last line backward. The caller may stop at any point;
// the file handle is closed when the generator returns (break, return, or exhaustion).
export async function* readTranscriptTail(
  path: string,
): AsyncGenerator<TranscriptEntry> {
  const handle = await open(path, "r");
  await using _closeOnExit = {
    [Symbol.asyncDispose]: () => handle.close(),
  };
  let position = (await handle.stat()).size;
  // The line whose head begins before the chunk already read: its tail is in `carry`.
  let carry: Buffer = Buffer.alloc(0);
  while (position > 0) {
    const length = Math.min(CHUNK_BYTES, position);
    position -= length;
    const chunk = await readRange(handle, position, length);
    const data = carry.length === 0 ? chunk : Buffer.concat([chunk, carry]);
    const { lines, head } = splitBackward(data);
    yield* entriesOf(lines);
    carry = Buffer.from(head);
  }
  yield* entriesOf([carry]);
}

// Text blocks of a message content: a whole string, or each `type: "text"` block's text.
export function textBlocks(content: unknown): string[] {
  const whole = str(content);
  if (whole !== undefined) return [whole];
  return (arr(content) ?? []).flatMap((b) => {
    const text = strAt(b, "text");
    return strAt(b, "type") === "text" && text !== undefined ? [text] : [];
  });
}
