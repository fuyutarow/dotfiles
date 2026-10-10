// report — the typed final report every worker is asked to end with, in ONE place: the zod schema, its
// JSON-schema rendering for the two CLIs (claude --json-schema, codex exec --output-schema), the
// instruction the router appends to every worker prompt, the validator and the readable rendering.
// Owner 2026-10-06: coordinators dug final reports out of stream-json by hand, many workers ended with
// none, and prose reports vary in shape so a coordinator could not check them mechanically. Nothing
// here calls a model or fails a run: an invalid or missing report is recorded, never fatal.
import { jsonText, z } from "../../shared/src/zod.ts";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export const WorkerReport = z.object({
  summary: z.string(),
  changes: z.array(z.object({ path: z.string(), what: z.string() })),
  checks: z.array(
    z.object({ cmd: z.string(), exit: z.number(), result: z.string() }),
  ),
  /** commands the coordinator should run, or decisions it must make */
  for_coordinator: z.array(z.string()),
  open: z.array(z.string()),
});
export type WorkerReport = z.output<typeof WorkerReport>;

/** The single structured record workers return when the dispatcher needs to choose what happens next. */
export const ReturnSchema = z.strictObject({
  interim: z.boolean().optional(),
  findings: z.array(
    z.strictObject({ text: z.string(), fleet: z.boolean().optional() }),
  ),
  evidence: z.array(z.string()),
  impact_on_brief: z.string(),
  proposed_next: z.string(),
  artifacts: z.array(z.string()),
});
export type ReturnRecord = z.output<typeof ReturnSchema>;

/** The pre-run remand record. Kept here as its single schema home so the later grader can fill it. */
export const TicketGradeSchema = z.strictObject({
  verdict: z.enum(["pass", "split", "clarify"]),
  source: z.enum(["floor", "floor+grader"]),
  violations: z.array(
    z.strictObject({
      rule: z.string(),
      quote_from_brief: z.string(),
      why_it_blocks_a_6min_first_return: z.string(),
      fix: z.string(),
    }),
  ),
  warnings: z.array(z.string()).optional(),
  pieces: z
    .array(
      z.strictObject({
        title: z.string(),
        outcome: z.string(),
        consumer: z.string(),
        first_return: z.string(),
        writes: z.array(z.string()),
        verify: z.array(z.string()),
        depends_on: z.array(z.string()),
      }),
    )
    .optional(),
  questions: z
    .array(z.strictObject({ question: z.string(), unblocks: z.string() }))
    .optional(),
  estimated_first_return_s: z.number().int().optional(),
  basis: z.string().optional(),
  grader: z
    .strictObject({
      status: z.enum(["ok", "failed", "skipped"]),
      reason: z.string().optional(),
      pick: z.unknown().optional(),
      row: z
        .strictObject({
          id: z.string(),
          route: z.enum(["codex", "claude"]),
          model: z.string(),
          effort: z.string(),
        })
        .optional(),
      elapsed_s: z.number().nonnegative().optional(),
      usage: z
        .strictObject({
          input_tokens: z.number().optional(),
          cached_input_tokens: z.number().optional(),
          output_tokens: z.number().optional(),
          reasoning_output_tokens: z.number().optional(),
          cost_usd: z.number().nonnegative().nullable().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type TicketGrade = z.output<typeof TicketGradeSchema>;

/** The schema as JSON-schema text (strict: every key required, no extra keys), for the CLIs' flags. */
export const reportJsonSchema = (): string =>
  // Claude's validator rejects the 2020-12 meta-schema, so emit draft-07 for both CLIs.
  `${JSON.stringify(z.toJSONSchema(WorkerReport, { target: "draft-7" }), null, 2)}\n`;

const SHAPE = `{ "summary": string,
  "changes": [{ "path": string, "what": string }],
  "checks": [{ "cmd": string, "exit": number, "result": string }],
  "for_coordinator": [string],
  "open": [string] }`;

const RETURN_SHAPE = `{ "interim"?: boolean, "findings": [{ "text": string, "fleet"?: boolean }],
  "evidence": [string],
  "impact_on_brief": string,
  "proposed_next": string,
  "artifacts": [string] }`;

const RETURN_FENCE = /```agx-return\s*\n([\s\S]*?)\n```/gu;
const RETURN_OPEN = /```agx-return\s*\n/u;

/** Appended to every worker prompt, after the ticket's verify line. */
export const REPORT_INSTRUCTION = `## Final report (required)
Housekeeping decisions are yours. Choose the obvious version number, CHANGELOG placement,
adjacent files needed for the change, fixture names, and meaning of a count; note the choice
in your report and continue. RETURN only for a decision that changes the outcome or contradicts
the brief.
Your final message must start with ONE JSON object and nothing else before it, of this shape:
${SHAPE}
- summary: what you did and the outcome, in a few sentences.
- changes: one entry per file you changed or created (path, what changed); [] if none.
- checks: every command you ran to check your work (cmd, its exit code, one line on the result); [] if none.
- for_coordinator: commands the coordinator should run, or decisions it must make; [] if none.
- open: what is unfinished, uncertain or skipped; [] if nothing.

## RETURN triggers and format
Stop and RETURN immediately when:
- you find something that contradicts the brief's premise, scope or method;
- you reach a decision whose options lead to diverging outcomes the dispatcher should choose between;
- you are told the time box is ending.
Returning early with findings is success. Include the final report JSON above, then append a fenced block tagged \`agx-return\` containing JSON of this shape:
${RETURN_SHAPE}
Do not wait to finish the planned work before returning.
For a first_return_s progress checkpoint, set "interim": true in the agx-return block.
An interim RETURN records progress and continues the same vendor session with:
"continue; send the final report when done". Keep running jobs. Omit interim (or set false)
for a final RETURN that needs the coordinator and ends the run.`;

/** The prompt with the report instruction appended. */
export const withReportInstruction = (text: string): string =>
  `${text.trimEnd()}\n\n${REPORT_INSTRUCTION}\n`;

export type ParsedReport =
  | { ok: true; report: WorkerReport }
  | { ok: false; error: string };

export type ParsedReturn =
  | { kind: "missing" }
  | { kind: "valid"; record: ReturnRecord }
  | { kind: "invalid"; error: string };

/** Parse the optional fenced RETURN record from a worker's final message. */
export function parseReturn(lastMessage: string): ParsedReturn {
  const block = [...lastMessage.matchAll(RETURN_FENCE)].at(-1);
  if (block === undefined) {
    return RETURN_OPEN.test(lastMessage)
      ? { kind: "invalid", error: "unterminated agx-return block" }
      : { kind: "missing" };
  }
  const decoded = jsonText.safeParse(block[1]);
  if (!decoded.success)
    return {
      kind: "invalid",
      error: `agx-return block is not valid JSON: ${decoded.error.issues[0]?.message ?? "unreadable"}`,
    };
  const parsed = ReturnSchema.safeParse(decoded.data);
  if (!parsed.success)
    return {
      kind: "invalid",
      error: `agx-return block has the wrong shape: ${parsed.error.issues
        .slice(0, 3)
        .map(
          (i) =>
            `${i.path.length === 0 ? "(root)" : i.path.join(".")}: ${i.message}`,
        )
        .join("; ")}`,
    };
  return { kind: "valid", record: parsed.data };
}

/** Retain stream checkpoints even when a later message replaces the vendor's last-message file. */
export function interimReturnWriter(path: string | undefined) {
  let previous: string | undefined;
  let pending = Promise.resolve();
  const record = (message: string): Promise<void> => {
    if (path === undefined || message === previous) return pending;
    const parsed = parseReturn(message);
    if (parsed.kind !== "valid" || parsed.record.interim !== true)
      return pending;
    previous = message;
    pending = pending.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      await appendFile(path, `${JSON.stringify({ last_message: message })}\n`);
    });
    return pending;
  };
  return Object.assign(record, { flush: (): Promise<void> => pending });
}

const FENCE = /^```(?:json)?\s*\n([\s\S]*?)\n```$/u;

/** The report in a worker's final message (a structured value from the vendor, else its text). */
export function parseReport(
  structured: unknown,
  lastMessage: string,
): ParsedReport {
  const text = lastMessage.trim();
  if (structured === undefined && text === "")
    return { ok: false, error: "the worker's final message is empty" };
  const candidate =
    structured !== undefined
      ? z.unknown().safeParse(structured)
      : jsonText.safeParse(
          (FENCE.exec(text)?.[1] ?? text).replace(RETURN_FENCE, "").trim(),
        );
  if (!candidate.success)
    return {
      ok: false,
      error: (candidate.error.issues[0]?.message ?? "unreadable").replace(
        /^not valid JSON: /u,
        "the final message is not JSON: ",
      ),
    };
  const parsed = WorkerReport.safeParse(candidate.data);
  if (parsed.success) return { ok: true, report: parsed.data };
  return {
    ok: false,
    error: `the final message is JSON of the wrong shape: ${parsed.error.issues
      .slice(0, 3)
      .map(
        (i) =>
          `${i.path.length === 0 ? "(root)" : i.path.join(".")}: ${i.message}`,
      )
      .join("; ")}`,
  };
}

const bullets = (items: string[], empty = "(none)"): string =>
  items.length === 0 ? `  ${empty}` : items.map((i) => `  - ${i}`).join("\n");

/** The report as readable sections (what `agx ledger result` prints). */
export function renderReport(r: WorkerReport): string {
  return [
    `## Summary\n${r.summary}`,
    `## Changes\n${bullets(r.changes.map((c) => `${c.path}: ${c.what}`))}`,
    `## Checks\n${bullets(r.checks.map((c) => `[exit ${c.exit}] ${c.cmd} — ${c.result}`))}`,
    `## For the coordinator\n${bullets(r.for_coordinator)}`,
    `## Open\n${bullets(r.open)}`,
  ].join("\n\n");
}
