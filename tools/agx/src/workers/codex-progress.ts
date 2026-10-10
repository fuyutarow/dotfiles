// codex-progress — what a running `codex exec --json` is doing, folded from its JSONL events, for the
// statusline `Run:` row (tools/agx/src/state.ts ProgressSchema). agx feeds every
// stdout line through foldEvent and writes the result to AGX_CODEX_PROGRESS_FILE, at most once per
// WRITE_EVERY_MS and once more at the end. Nothing here calls a model: it reads events codex
// already prints, so it costs no tokens.
//
// Events used (codex exec --json): item.started / item.completed with item.type
// command_execution (command), file_change (changes[].path), agent_message (text),
// web_search (query). Any other line — not JSON, or another event — leaves the state as it was.
import { renameSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { STATE_SCHEMA, type Progress } from "../state.ts";
import { costUsd } from "../../../shared/src/dispatch-pricing.ts";

const Item = z.looseObject({
  type: z.string(),
  command: z.string().optional(),
  text: z.string().optional(),
  query: z.string().optional(),
  changes: z.array(z.looseObject({ path: z.string() })).optional(),
});
const Event = z.looseObject({
  type: z.string(),
  item: Item.optional(),
  thread_id: z.string().optional(),
  usage: z
    .looseObject({
      input_tokens: z.number().int().nonnegative().optional(),
      cached_input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
      reasoning_output_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type Tally = {
  last: string;
  commands: number;
  turns: number;
  files: ReadonlySet<string>;
  usage?: {
    input_tokens: number;
    cached_input_tokens: number;
    output_tokens: number;
    reasoning_output_tokens: number;
  };
  totalCostUsd?: number;
  // The vendor's own id for this worker (codex thread_id, claude session_id), once it has printed
  // it: how a coordinator names the worker, and what `codex exec resume` / `claude --resume` take.
  session?: string;
};
export const emptyTally = (): Tally => ({
  last: "starting",
  commands: 0,
  turns: 0,
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

const ToolItem = z.looseObject({
  type: z.string(),
  name: z.string().optional(),
  tool: z.string().optional(),
  tool_name: z.string().optional(),
  command: z.string().optional(),
  status: z.string().optional(),
  error: z.unknown().optional(),
  message: z.string().optional(),
  output: z.unknown().optional(),
  aggregated_output: z.unknown().optional(),
  result: z.unknown().optional(),
});
const ToolEvent = z.looseObject({
  type: z.string(),
  item: ToolItem.optional(),
});

type ToolResult =
  | { kind: "error"; tool: string; text: string }
  | { kind: "success" };

const scalarText = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null) return undefined;
  const parsed = z
    .looseObject({ message: z.string().optional() })
    .safeParse(value);
  return parsed.success ? parsed.data.message : undefined;
};

/** A tool result, if this JSONL event reports a completed or failed tool call. */
function toolResult(line: string): ToolResult | undefined {
  const parsed = jsonOf(ToolEvent).safeParse(line);
  if (!parsed.success || parsed.data.item === undefined) return undefined;
  const { type, item } = parsed.data;
  const toolItem = /tool|command_execution/u.test(item.type);
  if (!toolItem) return undefined;
  const tool = item.name ?? item.tool_name ?? item.tool ?? item.type;
  const failed =
    type === "item.failed" ||
    item.status === "failed" ||
    item.status === "error" ||
    item.error !== undefined;
  const error = failed
    ? (scalarText(item.error) ??
      item.message ??
      scalarText(item.output) ??
      scalarText(item.aggregated_output) ??
      scalarText(item.result))
    : undefined;
  if (error !== undefined && error.trim() !== "")
    return {
      kind: "error",
      tool,
      text: error.trim().replaceAll(/\s+/gu, " "),
    };
  if (
    type === "item.completed" &&
    item.status !== "failed" &&
    item.status !== "error"
  )
    return { kind: "success" };
  return undefined;
}

/** Stop after identical consecutive tool errors; any successful tool call or different error resets the streak. */
export function toolErrorStreak(
  limit: number,
): (line: string) => string | null {
  let previous: { tool: string; text: string } | undefined;
  let count = 0;
  return (line) => {
    const result = toolResult(line);
    if (result === undefined) return null;
    if (result.kind === "success") {
      previous = undefined;
      count = 0;
      return null;
    }
    if (previous?.tool === result.tool && previous.text === result.text) {
      count++;
    } else {
      previous = { tool: result.tool, text: result.text };
      count = 1;
    }
    return count >= limit
      ? `stopped: ${count} identical consecutive tool errors: ${result.text}`
      : null;
  };
}

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

/** The worker's session id (codex's thread_id) from a whole stdout, or undefined before codex named it. */
export const sessionOf = (events: string): string | undefined =>
  events.split("\n").reduce((acc, l) => foldEvent(acc, l), emptyTally())
    .session;

/** The tally after one stdout line. */
export function foldEvent(t: Tally, line: string): Tally {
  const parsed = jsonOf(Event).safeParse(line);
  if (!parsed.success) return t;
  const { type, item, thread_id: threadId } = parsed.data;
  if (type === "thread.started" && threadId !== undefined)
    return { ...t, session: threadId };
  if (type === "turn.completed") {
    const usage = parsed.data.usage;
    const withTurn = { ...t, turns: t.turns + 1 };
    if (usage === undefined) return withTurn;
    const previous = t.usage ?? {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
    };
    return {
      ...withTurn,
      usage: {
        input_tokens: previous.input_tokens + (usage.input_tokens ?? 0),
        cached_input_tokens:
          previous.cached_input_tokens + (usage.cached_input_tokens ?? 0),
        output_tokens: previous.output_tokens + (usage.output_tokens ?? 0),
        reasoning_output_tokens:
          previous.reasoning_output_tokens +
          (usage.reasoning_output_tokens ?? 0),
      },
    };
  }
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
  turns: t.turns,
  files: t.files.size,
  ...(t.usage === undefined ? {} : { usage: t.usage }),
  ...(t.totalCostUsd === undefined ? {} : { cost_usd: t.totalCostUsd }),
  ...(t.session === undefined ? {} : { session: t.session }),
});

const WRITE_EVERY_MS = 1_000;

/** A writer that keeps the file at most WRITE_EVERY_MS stale; `flush` writes the final state.
 *  `fold` reads one stdout line of the worker: codex events by default, claude stream-json events
 *  for run-claude (claude-progress.ts beside this file).
 *  A write that fails is dropped (the run must not die for its display) and counted, so the end
 *  line can say the display was incomplete instead of pretending it was live. */
export function progressWriter(
  path: string,
  fold: (t: Tally, line: string) => Tally = foldEvent,
  prices?: { input: number; cachedInput: number; output: number },
): {
  feed: (line: string) => void;
  flush: () => void;
  failedWrites: () => number;
} {
  let tally = emptyTally();
  let lastWrite = 0;
  let lastWrittenCommands = -1;
  let lastWrittenUsage = "";
  let failed = 0;
  const write = (): void => {
    const tmp = `${path}.tmp`;
    const computedCostUsd =
      tally.totalCostUsd ??
      (tally.usage === undefined || prices === undefined
        ? undefined
        : calculateCost(prices, tally.usage));
    const progress = toProgress(tally, Temporal.Now.instant().toString());
    const body = JSON.stringify({
      ...progress,
      ...(computedCostUsd === undefined ? {} : { cost_usd: computedCostUsd }),
    });
    const done = fromThrowable(() => {
      writeFileSync(tmp, body);
      renameSync(tmp, path);
    })();
    if (done.isErr()) failed++;
    lastWrite = performance.now();
    lastWrittenCommands = tally.commands;
    lastWrittenUsage = JSON.stringify(tally.usage ?? null);
  };
  return {
    feed: (line) => {
      tally = fold(tally, line);
      const usage = JSON.stringify(tally.usage ?? null);
      if (
        tally.commands > lastWrittenCommands ||
        usage !== lastWrittenUsage ||
        performance.now() - lastWrite >= WRITE_EVERY_MS
      )
        write();
    },
    flush: write,
    failedWrites: () => failed,
  };
}

const calculateCost = (
  prices: { input: number; cachedInput: number; output: number },
  usage: NonNullable<Tally["usage"]>,
): number | undefined =>
  costUsd(
    {
      price_in: prices.input,
      price_cached_in: prices.cachedInput,
      price_out: prices.output,
    },
    usage,
  );
