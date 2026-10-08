import { jsonText, z } from "../../shared/src/zod.ts";
import { overlappingGlobs, parseTicket } from "./ticket.ts";
import { floorTicketGrade } from "./ticket-grade.ts";
import { TicketGradeSchema, type TicketGrade } from "./report.ts";

const PieceSchema = z.strictObject({
  title: z.string().min(1),
  outcome: z.string().min(1),
  consumer: z.string().min(1),
  first_return: z.string().min(1),
  writes: z.array(z.string().min(1)),
  verify: z.array(z.string().min(1)),
  depends_on: z.array(z.string()),
});

export const AgentGradeSchema = z.strictObject({
  verdict: z.enum(["pass", "split", "clarify"]),
  violations: TicketGradeSchema.shape.violations,
  pieces: z.array(PieceSchema).optional(),
  questions: z
    .array(
      z.strictObject({
        question: z.string().min(1),
        unblocks: z.string().min(1),
      }),
    )
    .optional(),
  estimated_first_return_s: z.number().int().nonnegative().optional(),
  basis: z.string().optional(),
});
export type AgentGrade = z.output<typeof AgentGradeSchema>;
type AgentPiece = z.output<typeof PieceSchema>;

const GRADE_FENCE = /```agent-dispatch-grade\s*\n([\s\S]*?)\n```/u;
const GRADE_OPEN = /```agent-dispatch-grade\s*\n/u;

export const GRADE_WORKER_PROMPT = (brief: string): string =>
  `Grade this brief as a meaningful remand judgment. Decide whether it should pass, split, or clarify; for split, say what the pieces are and why. Do not edit or write files.\n\n` +
  `## Brief\n${brief}\n\n` +
  `## BIBIFI microticket rules\n` +
  `- One ticket has one consumed decision.\n` +
  `- The first useful return is within 6 minutes.\n` +
  `- Two or more independently checkable deliverables mean the brief is a container and should split.\n` +
  `- A queue held by one worker is still a container.\n` +
  `- A long run must not be obtained by chaining pieces.\n\n` +
  `## Output\n` +
  `Return one JSON object in an \`\`\`agent-dispatch-grade fenced block. Use exactly this shape; omit optional keys when unused:\n` +
  `\`\`\`json\n{ "verdict": "pass|split|clarify", "violations": [{ "rule": "...", "quote_from_brief": "...", "why_it_blocks_a_6min_first_return": "...", "fix": "..." }], "pieces": [{ "title": "...", "outcome": "...", "consumer": "...", "first_return": "...", "writes": ["..."], "verify": ["..."], "depends_on": [] }], "questions": [{ "question": "...", "unblocks": "..." }], "estimated_first_return_s": 120, "basis": "..." }\n\`\`\``;

export type ParsedAgentGrade =
  | { valid: true; grade: AgentGrade }
  | { valid: false; reason: string };

export function parseAgentGrade(message: string): ParsedAgentGrade {
  const match = GRADE_FENCE.exec(message);
  if (match === null)
    return {
      valid: false,
      reason: GRADE_OPEN.test(message)
        ? "unterminated agent-dispatch-grade block"
        : "missing agent-dispatch-grade block",
    };
  const decoded = jsonText.safeParse(match[1]);
  if (!decoded.success)
    return {
      valid: false,
      reason: "agent-dispatch-grade block is not valid JSON",
    };
  const parsed = AgentGradeSchema.safeParse(decoded.data);
  if (!parsed.success)
    return {
      valid: false,
      reason: `agent-dispatch-grade block has the wrong shape: ${parsed.error.issues
        .slice(0, 3)
        .map(
          (issue) =>
            `${issue.path.length === 0 ? "(root)" : issue.path.join(".")}: ${issue.message}`,
        )
        .join("; ")}`,
    };
  const validation = validateAgentGrade(parsed.data);
  return validation === undefined
    ? { valid: true, grade: parsed.data }
    : { valid: false, reason: validation };
}

const tomlStringArray = (values: string[]): string =>
  `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;

function pieceBrief(piece: AgentPiece): string {
  return [
    "+++",
    "schema = 2",
    `outcome = ${JSON.stringify(piece.outcome)}`,
    `consumer = ${JSON.stringify(piece.consumer)}`,
    `first_return = ${JSON.stringify(piece.first_return)}`,
    `writes = ${tomlStringArray(piece.writes)}`,
    `verify = ${tomlStringArray(piece.verify)}`,
    "+++",
    piece.title,
  ].join("\n");
}

function orderedBefore(
  from: string,
  to: string,
  pieces: AgentPiece[],
): boolean {
  const byTitle = new Map(pieces.map((piece) => [piece.title, piece]));
  const visit = (title: string, seen: Set<string>): boolean => {
    if (seen.has(title)) return false;
    seen.add(title);
    const piece = byTitle.get(title);
    return (
      piece?.depends_on.includes(from) === true ||
      (piece?.depends_on.some((dependency) => visit(dependency, seen)) ?? false)
    );
  };
  return visit(to, new Set());
}

function unorderedWriteOverlap(
  pieces: AgentPiece[],
): [AgentPiece, AgentPiece] | undefined {
  for (const [index, first] of pieces.entries()) {
    const second = pieces
      .slice(index + 1)
      .find(
        (candidate) =>
          overlappingGlobs(first.writes, candidate.writes).length > 0 &&
          !orderedBefore(first.title, candidate.title, pieces) &&
          !orderedBefore(candidate.title, first.title, pieces),
      );
    if (second !== undefined) return [first, second];
  }
  return undefined;
}

function validateAgentGrade(grade: AgentGrade): string | undefined {
  if (grade.verdict === "pass")
    return grade.violations.length === 0
      ? undefined
      : "a pass grade cannot contain violations";
  if (grade.violations.length === 0)
    return "a remand must state violations with a reason and fix";
  if (grade.verdict === "clarify")
    return (grade.questions?.length ?? 0) > 0
      ? undefined
      : "a clarify grade must include at least one question";
  const pieces = grade.pieces ?? [];
  if (pieces.length < 2)
    return "a split grade must contain at least two pieces";
  const titles = new Set(pieces.map((piece) => piece.title));
  if (titles.size !== pieces.length) return "piece titles must be unique";
  for (const piece of pieces) {
    if (
      piece.depends_on.some(
        (title) => !titles.has(title) || title === piece.title,
      )
    )
      return `piece ${piece.title} has an unknown or self dependency`;
    const parsed = parseTicket(pieceBrief(piece));
    if (parsed.kind !== "ticket")
      return `piece ${piece.title} is not a valid schema 2 ticket`;
    if (floorTicketGrade(pieceBrief(piece), parsed).verdict !== "pass")
      return `piece ${piece.title} does not pass the schema 2 ticket floor`;
  }
  const overlap = unorderedWriteOverlap(pieces);
  if (overlap !== undefined)
    return `pieces ${overlap[0].title} and ${overlap[1].title} have overlapping writes without a depends_on order`;
  return undefined;
}

export function mergeTicketGrades(
  floor: TicketGrade,
  grader: AgentGrade,
  graderRecord: NonNullable<TicketGrade["grader"]>,
): TicketGrade {
  let verdict: TicketGrade["verdict"] = "pass";
  if (floor.verdict === "split" || grader.verdict === "split")
    verdict = "split";
  if (floor.verdict === "clarify" || grader.verdict === "clarify")
    verdict = "clarify";
  return {
    verdict,
    source: "floor+grader",
    violations: [...floor.violations, ...grader.violations],
    ...(grader.pieces === undefined ? {} : { pieces: grader.pieces }),
    ...(grader.questions === undefined ? {} : { questions: grader.questions }),
    ...(grader.estimated_first_return_s === undefined
      ? {}
      : { estimated_first_return_s: grader.estimated_first_return_s }),
    ...(grader.basis === undefined ? {} : { basis: grader.basis }),
    grader: graderRecord,
  };
}

export function renderGradeRemand(grade: TicketGrade): string[] {
  const lines = grade.violations.map(
    (item) =>
      `agent-dispatch: remand ${item.rule}: ${item.why_it_blocks_a_6min_first_return} Fix: ${item.fix}`,
  );
  for (const [index, piece] of (grade.pieces ?? []).entries()) {
    lines.push(
      [
        `agent-dispatch: split piece ${index + 1}: ${piece.title}`,
        `  outcome: ${piece.outcome}`,
        `  consumer: ${piece.consumer}`,
        `  first_return: ${piece.first_return}`,
        `  writes: ${JSON.stringify(piece.writes)}`,
        `  verify: ${JSON.stringify(piece.verify)}`,
        ...(piece.depends_on.length === 0
          ? []
          : [`  depends_on: ${JSON.stringify(piece.depends_on)}`]),
      ].join("\n"),
    );
  }
  for (const question of grade.questions ?? [])
    lines.push(
      `agent-dispatch: clarify: ${question.question} Unblocks: ${question.unblocks}`,
    );
  return lines;
}
