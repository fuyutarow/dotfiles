import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fromThrowable, jsonOf, z } from "../zod.ts";

const SCAN_BYTES = 8 * 1024 * 1024;
const LINE_BYTES = 64 * 1024;
const recordSchema = z.object({
  type: z.literal("user"),
  message: z.object({ role: z.literal("user"), content: z.string() }),
});
const stateSchema = z.object({
  path: z.string(),
  dev: z.number().int().nonnegative(),
  ino: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  size: z.number().int().nonnegative(),
  partial: z.string().max(LINE_BYTES * 2),
  skipping: z.boolean(),
  pending: z.boolean(),
  window: z.number().positive().optional(),
});
type State = z.output<typeof stateSchema>;

function scanLine(state: State, line: Buffer): void {
  const record = jsonOf(recordSchema).safeParse(line.toString("utf8"));
  if (!record.success) return;
  const content = record.data.message.content;
  if (content.includes("<command-name>/autocompact</command-name>")) {
    state.pending = true;
    return;
  }
  if (!state.pending) return;
  const match =
    /^<local-command-stdout>Auto-compact window for .+ set to ([0-9]+(?:\.[0-9]+)?)k tokens<\/local-command-stdout>$/u.exec(
      content,
    );
  const value = match === null ? undefined : Number(match[1]) * 1000;
  if (value !== undefined && Number.isFinite(value) && value > 0)
    state.window = value;
  state.pending = false;
}

function scanBytes(state: State, bytes: Buffer): void {
  const data = Buffer.concat([Buffer.from(state.partial, "base64"), bytes]);
  let start = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 10) continue;
    if (!state.skipping && i - start <= LINE_BYTES)
      scanLine(state, data.subarray(start, i));
    state.skipping = false;
    start = i + 1;
  }
  const remainder = data.subarray(start);
  if (state.skipping || remainder.length > LINE_BYTES) {
    state.skipping = true;
    state.partial = "";
  } else state.partial = remainder.toString("base64");
}

function readState(path: string): State | undefined {
  return fromThrowable(() => {
    // sync-ok: The small state file is read at the statusline stdin boundary.
    if (statSync(path).size > LINE_BYTES * 2 + 4096) return void 0;
    // sync-ok: State reads are bounded by the size check above.
    const parsed = jsonOf(stateSchema).safeParse(readFileSync(path, "utf8"));
    if (!parsed.success) return void 0;
    const state = parsed.data;
    if (
      state.offset > state.size ||
      Buffer.from(state.partial, "base64").toString("base64") !== state.partial
    )
      return void 0;
    return state;
  })().unwrapOr(undefined);
}

function saveState(path: string, state: State): void {
  const temp = `${path}.${randomUUID()}.tmp`;
  // sync-ok: Small per-session state is atomically written at the stdin boundary.
  writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
  // sync-ok: Rename publishes the complete state atomically.
  renameSync(temp, path);
}

function scan(path: string, statePath: string): number | undefined {
  // sync-ok: Open the transcript at the synchronous stdin boundary.
  const fd = openSync(path, "r");
  using _file = {
    [Symbol.dispose]: () => {
      // sync-ok: Close the transcript descriptor.
      closeSync(fd);
    },
  };
  // sync-ok: Identity and size determine whether scanning can resume.
  const info = fstatSync(fd);
  const previous = readState(statePath);
  const state: State =
    previous !== undefined &&
    previous.path === path &&
    previous.dev === info.dev &&
    previous.ino === info.ino &&
    info.size >= previous.size
      ? previous
      : {
          path,
          dev: info.dev,
          ino: info.ino,
          offset: 0,
          size: info.size,
          partial: "",
          skipping: false,
          pending: false,
        };
  const bytes = Buffer.alloc(Math.min(SCAN_BYTES, info.size - state.offset));
  // sync-ok: Each render reads at most SCAN_BYTES from the transcript.
  const count = readSync(fd, bytes, 0, bytes.length, state.offset);
  scanBytes(state, bytes.subarray(0, count));
  state.offset += count;
  state.size = info.size;
  saveState(statePath, state);
  return state.offset === info.size ? state.window : undefined;
}

export function claudeTranscriptWindow(
  path: string | undefined,
  sessionId: string | undefined,
): number | undefined {
  if (
    path === undefined ||
    path === "" ||
    sessionId === undefined ||
    sessionId === ""
  )
    return void 0;
  return fromThrowable(() => {
    const root = join(
      process.env["XDG_STATE_HOME"] ?? join(homedir(), ".local", "state"),
      "statusline",
    );
    // sync-ok: Ensure the private per-session state directory exists before the bounded scan.
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const key = createHash("sha256").update(sessionId).digest("hex");
    return scan(path, join(root, `claude-compact-${key}.json`));
  })().unwrapOr(undefined);
}
