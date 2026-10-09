// claude-progress — what a running `claude -p --output-format stream-json --verbose` is doing, folded
// into the same Tally codex-progress keeps, for the statusline Run rows. Owner 2026-10-06: every
// Claude-route worker showed "no event yet" for its whole run, because run-claude asked for one
// JSON object at the end and so had nothing to show while it worked.
//
// Events used (claude 2.1.290, sampled 2026-10-06): `assistant` with message.content[] blocks —
// tool_use (name, input.command / input.file_path / input.pattern) and text. The final `result`
// event is the same object `--output-format json` prints, so it is the run's answer. Any other line
// leaves the state as it was. Nothing here calls a model.
import { basename } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { oneLine, type Tally } from "./codex-progress.ts";

const Block = z.looseObject({
  type: z.string(),
  name: z.string().optional(),
  text: z.string().optional(),
  input: z
    .looseObject({
      command: z.string().optional(),
      file_path: z.string().optional(),
      notebook_path: z.string().optional(),
      pattern: z.string().optional(),
    })
    .optional(),
});
const Event = z.looseObject({
  type: z.string(),
  session_id: z.string().optional(),
  total_cost_usd: z.union([z.number(), z.string()]).optional(),
  usage: z
    .looseObject({
      input_tokens: z.number().nonnegative().optional(),
      cached_input_tokens: z.number().nonnegative().optional(),
      output_tokens: z.number().nonnegative().optional(),
      reasoning_output_tokens: z.number().nonnegative().optional(),
      cache_read_input_tokens: z.number().nonnegative().optional(),
      cache_creation_input_tokens: z.number().nonnegative().optional(),
    })
    .optional(),
  message: z
    .looseObject({
      content: z.array(Block).optional(),
      usage: z
        .looseObject({
          input_tokens: z.number().nonnegative().optional(),
          cached_input_tokens: z.number().nonnegative().optional(),
          output_tokens: z.number().nonnegative().optional(),
          reasoning_output_tokens: z.number().nonnegative().optional(),
          cache_read_input_tokens: z.number().nonnegative().optional(),
          cache_creation_input_tokens: z.number().nonnegative().optional(),
        })
        .optional(),
    })
    .optional(),
});
const EDITS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

function foldBlock(t: Tally, b: z.output<typeof Block>): Tally {
  if (b.type === "text" && (b.text ?? "").trim() !== "")
    return { ...t, last: `“${oneLine(b.text ?? "")}”` };
  if (b.type !== "tool_use") return t;
  const input = b.input ?? {};
  if (b.name === "Bash")
    return {
      ...t,
      last: `$ ${oneLine(input.command ?? "")}`,
      commands: t.commands + 1,
    };
  const path = input.file_path ?? input.notebook_path;
  if (EDITS.has(b.name ?? "") && path !== undefined)
    return {
      ...t,
      last: `✎ ${basename(path)}`,
      files: new Set([...t.files, path]),
    };
  if (path !== undefined) return { ...t, last: `${b.name} ${basename(path)}` };
  if (input.pattern !== undefined)
    return { ...t, last: `⌕ ${oneLine(input.pattern)}` };
  return { ...t, last: b.name ?? t.last };
}

/** The tally after one stream-json line. */
export function foldClaudeEvent(t: Tally, line: string): Tally {
  const parsed = jsonOf(Event).safeParse(line);
  if (!parsed.success) return t;
  // claude names its session in the system init event (`claude --resume <id>`)
  const sessionId = parsed.data.session_id;
  if (parsed.data.type === "system" && sessionId !== undefined)
    return { ...t, session: sessionId };
  const usage = parsed.data.usage ?? parsed.data.message?.usage;
  const costValue = parsed.data.total_cost_usd;
  let totalCostUsd: number | undefined;
  if (typeof costValue === "number") totalCostUsd = costValue;
  else if (costValue !== undefined && costValue.trim() !== "")
    totalCostUsd = Number(costValue);
  if (parsed.data.type === "result")
    return {
      ...t,
      ...(usage === undefined
        ? {}
        : {
            usage: {
              input_tokens: usage.input_tokens ?? 0,
              cached_input_tokens:
                usage.cached_input_tokens ??
                (usage.cache_read_input_tokens ?? 0) +
                  (usage.cache_creation_input_tokens ?? 0),
              output_tokens: usage.output_tokens ?? 0,
              reasoning_output_tokens: usage.reasoning_output_tokens ?? 0,
            },
          }),
      ...(totalCostUsd === undefined || !Number.isFinite(totalCostUsd)
        ? {}
        : { totalCostUsd }),
    };
  if (parsed.data.type === "assistant" && usage !== undefined) {
    const previous = t.usage ?? {
      input_tokens: 0,
      cached_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
    };
    t = {
      ...t,
      usage: {
        input_tokens: previous.input_tokens + (usage.input_tokens ?? 0),
        cached_input_tokens:
          previous.cached_input_tokens +
          (usage.cached_input_tokens ??
            (usage.cache_read_input_tokens ?? 0) +
              (usage.cache_creation_input_tokens ?? 0)),
        output_tokens: previous.output_tokens + (usage.output_tokens ?? 0),
        reasoning_output_tokens:
          previous.reasoning_output_tokens +
          (usage.reasoning_output_tokens ?? 0),
      },
    };
  }
  if (parsed.data.type !== "assistant") return t;
  return (parsed.data.message?.content ?? []).reduce(
    (acc, b) => foldBlock(acc, b),
    t,
  );
}

const ResultEvent = z.looseObject({ type: z.literal("result") });

/** The run's answer: the last `result` event of a stream-json output, or undefined if it never came. */
export function resultEvent(
  stdout: string,
): Record<string, unknown> | undefined {
  return stdout
    .split("\n")
    .map((l) => jsonOf(ResultEvent).safeParse(l))
    .findLast((r) => r.success)?.data;
}
