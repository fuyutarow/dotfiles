// report — the typed final report every worker is asked to end with, in ONE place: the zod schema, its
// JSON-schema rendering for the two CLIs (claude --json-schema, codex exec --output-schema), the
// instruction the router appends to every worker prompt, the validator and the readable rendering.
// Owner 2026-10-06: coordinators dug final reports out of stream-json by hand, many workers ended with
// none, and prose reports vary in shape so a coordinator could not check them mechanically. Nothing
// here calls a model or fails a run: an invalid or missing report is recorded, never fatal.
import { jsonText, z } from "../hooks/zod.ts";

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

/** The schema as JSON-schema text (strict: every key required, no extra keys), for the CLIs' flags. */
export const reportJsonSchema = (): string =>
  // Claude's validator rejects the 2020-12 meta-schema, so emit draft-07 for both CLIs.
  `${JSON.stringify(z.toJSONSchema(WorkerReport, { target: "draft-7" }), null, 2)}\n`;

const SHAPE = `{ "summary": string,
  "changes": [{ "path": string, "what": string }],
  "checks": [{ "cmd": string, "exit": number, "result": string }],
  "for_coordinator": [string],
  "open": [string] }`;

/** Appended to every worker prompt, after the ticket's verify line. */
export const REPORT_INSTRUCTION = `## Final report (required)
Your last message must be ONE JSON object and nothing else (no prose before or after, no code fence), of this shape:
${SHAPE}
- summary: what you did and the outcome, in a few sentences.
- changes: one entry per file you changed or created (path, what changed); [] if none.
- checks: every command you ran to check your work (cmd, its exit code, one line on the result); [] if none.
- for_coordinator: commands the coordinator should run, or decisions it must make; [] if none.
- open: what is unfinished, uncertain or skipped; [] if nothing.`;

/** The prompt with the report instruction appended. */
export const withReportInstruction = (text: string): string =>
  `${text.trimEnd()}\n\n${REPORT_INSTRUCTION}\n`;

export type ParsedReport =
  | { ok: true; report: WorkerReport }
  | { ok: false; error: string };

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
      : jsonText.safeParse(FENCE.exec(text)?.[1] ?? text);
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

/** The report as readable sections (what `agent-router result` prints). */
export function renderReport(r: WorkerReport): string {
  return [
    `## Summary\n${r.summary}`,
    `## Changes\n${bullets(r.changes.map((c) => `${c.path}: ${c.what}`))}`,
    `## Checks\n${bullets(r.checks.map((c) => `[exit ${c.exit}] ${c.cmd} — ${c.result}`))}`,
    `## For the coordinator\n${bullets(r.for_coordinator)}`,
    `## Open\n${bullets(r.open)}`,
  ].join("\n\n");
}
