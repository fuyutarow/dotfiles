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
import { jsonOf, z } from "../../../hooks/zod.ts";
import {
  oneLine,
  type Tally,
} from "../../driving-codex/scripts/codex-progress.ts";

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
  message: z.looseObject({ content: z.array(Block).optional() }).optional(),
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
  if (!parsed.success || parsed.data.type !== "assistant") return t;
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
