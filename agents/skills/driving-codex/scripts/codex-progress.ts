// codex-progress — what a running `codex exec --json` is doing, folded from its JSONL events, for the
// statusline `Run:` row (agents/routing-control/state.ts ProgressSchema). codex-run feeds every
// stdout line through foldEvent and writes the result to CODEX_RUN_PROGRESS_FILE, at most once per
// WRITE_EVERY_MS and once more at the end. Nothing here calls a model: it reads events codex
// already prints, so it costs no tokens.
//
// Events used (codex exec --json): item.started / item.completed with item.type
// command_execution (command), file_change (changes[].path), agent_message (text),
// web_search (query). Any other line — not JSON, or another event — leaves the state as it was.
import { renameSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../../../hooks/zod.ts";
import { STATE_SCHEMA, type Progress } from "../../../routing-control/state.ts";

const Item = z.looseObject({
  type: z.string(),
  command: z.string().optional(),
  text: z.string().optional(),
  query: z.string().optional(),
  changes: z.array(z.looseObject({ path: z.string() })).optional(),
});
const Event = z.looseObject({ type: z.string(), item: Item.optional() });

export type Tally = {
  last: string;
  commands: number;
  files: ReadonlySet<string>;
};
export const emptyTally = (): Tally => ({
  last: "starting",
  commands: 0,
  files: new Set(),
});

const LAST_CHARS = 72;
export const oneLine = (s: string): string => {
  const line = s.trim().split("\n")[0] ?? "";
  return line.length > LAST_CHARS ? `${line.slice(0, LAST_CHARS - 1)}…` : line;
};

// codex runs every command as `<shell> -lc '<command>'`; on the one-line Run: row the wrapper
// pushed the command itself out of view. Show the inner command; anything else stays as it is.
const SHELL_WRAP =
  /^(?:\S*\/)?(?:ba|z|da|k)?sh\s+-l?c\s+(["'])([\s\S]*)\1\s*$/u;
export const unwrapShell = (command: string): string =>
  SHELL_WRAP.exec(command.trim())?.[2] ?? command;

// codex reports a failure as a JSON event on stdout, not on stderr (sampled 2026-10-06: a closed
// port gives {"type":"error","message":"Reconnecting... waiting for network (…)"} lines, and a
// failed turn is {"type":"turn.failed","error":{"message":…}}). The stderr of a real failure on
// Vast held only "Reading additional input from stdin...".
const ErrorEvent = z.union([
  z.looseObject({ type: z.literal("error"), message: z.string() }),
  z.looseObject({
    type: z.literal("turn.failed"),
    error: z.looseObject({ message: z.string() }),
  }),
]);

const messageOf = (e: z.output<typeof ErrorEvent>): string =>
  e.type === "error" ? e.message : e.error.message;

/** The message of the LAST error event in codex's stdout, or undefined when it printed none. */
export function lastError(events: string): string | undefined {
  return events
    .split("\n")
    .map((l) => jsonOf(ErrorEvent).safeParse(l))
    .flatMap((r) => (r.success ? [messageOf(r.data)] : []))
    .at(-1);
}

/** The tally over a whole stdout: what the worker did, for the receipt. */
export function tallyOf(events: string): {
  last: string;
  commands: number;
  files: number;
} {
  const t = events
    .split("\n")
    .reduce((acc, l) => foldEvent(acc, l), emptyTally());
  return { last: t.last, commands: t.commands, files: t.files.size };
}

/** The tally after one stdout line. */
export function foldEvent(t: Tally, line: string): Tally {
  const parsed = jsonOf(Event).safeParse(line);
  if (!parsed.success) return t;
  const { type, item } = parsed.data;
  if (item === undefined) return t;
  if (type === "item.started" && item.type === "command_execution")
    return {
      ...t,
      last: `$ ${oneLine(unwrapShell(item.command ?? ""))}`,
      commands: t.commands + 1,
    };
  if (type !== "item.completed") return t;
  if (item.type === "file_change") {
    const paths = (item.changes ?? []).map((c) => c.path);
    const latest = paths.at(-1);
    if (latest === undefined) return t;
    return {
      ...t,
      last: `✎ ${basename(latest)}`,
      files: new Set([...t.files, ...paths]),
    };
  }
  if (item.type === "agent_message")
    return { ...t, last: `“${oneLine(item.text ?? "")}”` };
  if (item.type === "web_search")
    return { ...t, last: `⌕ ${oneLine(item.query ?? "")}` };
  return t;
}

export const toProgress = (t: Tally, at: string): Progress => ({
  schema: STATE_SCHEMA,
  at,
  last: t.last,
  commands: t.commands,
  files: t.files.size,
});

const WRITE_EVERY_MS = 1_000;

/** A writer that keeps the file at most WRITE_EVERY_MS stale; `flush` writes the final state.
 *  `fold` reads one stdout line of the worker: codex events by default, claude stream-json events
 *  for run-claude (driving-claude/scripts/claude-progress.ts).
 *  A write that fails is dropped (the run must not die for its display) and counted, so the end
 *  line can say the display was incomplete instead of pretending it was live. */
export function progressWriter(
  path: string,
  fold: (t: Tally, line: string) => Tally = foldEvent,
): {
  feed: (line: string) => void;
  flush: () => void;
  failedWrites: () => number;
} {
  let tally = emptyTally();
  let lastWrite = 0;
  let failed = 0;
  const write = (): void => {
    const tmp = `${path}.tmp`;
    const body = JSON.stringify(
      toProgress(tally, Temporal.Now.instant().toString()),
    );
    const done = fromThrowable(() => {
      writeFileSync(tmp, body);
      renameSync(tmp, path);
    })();
    if (done.isErr()) failed++;
    lastWrite = performance.now();
  };
  return {
    feed: (line) => {
      tally = fold(tally, line);
      if (performance.now() - lastWrite >= WRITE_EVERY_MS) write();
    },
    flush: write,
    failedWrites: () => failed,
  };
}
