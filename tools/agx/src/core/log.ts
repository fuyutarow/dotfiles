import { dlopen, FFIType } from "bun:ffi";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { jsonOf } from "../../../shared/src/zod.ts";
import {
  CoreEventSchema,
  type CoreEvent,
  type CoreEventInput,
} from "./events.ts";

const pathOf = (dir: string) => join(dir, "core.jsonl");
const flock = () =>
  dlopen(
    process.platform === "darwin" ? "/usr/lib/libSystem.B.dylib" : "libc.so.6",
    { flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } },
  );

export type ReadResult = {
  events: CoreEvent[];
  nextOffset: number;
  errors: string[];
};

/** Read complete JSONL records beginning at the byte offset; offsets should come from nextOffset. */
export function read(dir: string, fromOffset = 0): ReadResult {
  const raw = readFileSync(pathOf(dir));
  const start = Math.min(raw.length, Math.max(0, fromOffset));
  const tail = raw.subarray(start);
  const boundary = tail.lastIndexOf(10) + 1;
  const complete = tail.subarray(0, boundary);
  const lines = complete
    .toString("utf8")
    .split("\n")
    .filter((line) => line !== "");
  const events: CoreEvent[] = [];
  const errors: string[] = [];
  let previous = 0;
  for (const [index, line] of lines.entries()) {
    const parsed = jsonOf(CoreEventSchema).safeParse(line);
    if (!parsed.success || parsed.data.seq <= previous) {
      errors.push(
        `invalid or non-monotonic core event at offset ${start}, line ${index + 1}`,
      );
      break;
    }
    events.push(parsed.data);
    previous = parsed.data.seq;
  }
  return { events, nextOffset: start + complete.length, errors };
}

/** Append one event under flock; the lock inode is the log file and is never unlinked. */
export function append(
  dir: string,
  input: CoreEventInput,
): { ok: true; event: CoreEvent } | { ok: false; error: string } {
  mkdirSync(dir, { recursive: true });
  const path = pathOf(dir);
  const fd = openSync(path, "a+", 0o600);
  const lib = flock();
  const wait = new Int32Array(new SharedArrayBuffer(4));
  const deadline = performance.now() + 30_000;
  let locked = lib.symbols.flock(fd, 2 | 4) === 0;
  while (!locked && performance.now() < deadline) {
    Atomics.wait(wait, 0, 0, 2);
    locked = lib.symbols.flock(fd, 2 | 4) === 0;
  }
  if (!locked) {
    closeSync(fd);
    lib.close();
    return { ok: false, error: "could not acquire core log flock" };
  }
  const raw = readFileSync(path, "utf8");
  if (raw !== "" && !raw.endsWith("\n")) {
    closeSync(fd);
    lib.close();
    return { ok: false, error: "incomplete core log tail; repair required" };
  }
  const lastLine = raw.trimEnd().split("\n").at(-1);
  const last =
    lastLine === undefined || lastLine === ""
      ? undefined
      : jsonOf(CoreEventSchema).safeParse(lastLine);
  if (last !== undefined && !last.success) {
    closeSync(fd);
    lib.close();
    return { ok: false, error: "invalid core log tail; repair required" };
  }
  const lastSeq = last?.success === true ? last.data.seq : 0;
  const seq = input.seq ?? lastSeq + 1;
  if (seq <= lastSeq) {
    closeSync(fd);
    lib.close();
    return { ok: false, error: "core event seq must increase monotonically" };
  }
  const parsed = CoreEventSchema.safeParse({ ...input, seq });
  if (!parsed.success) {
    closeSync(fd);
    lib.close();
    return { ok: false, error: parsed.error.message };
  }
  const bytes = Buffer.from(`${JSON.stringify(parsed.data)}\n`);
  const written = writeSync(fd, bytes);
  closeSync(fd);
  lib.close();
  return written === bytes.length
    ? { ok: true, event: parsed.data }
    : { ok: false, error: "short core log write" };
}
