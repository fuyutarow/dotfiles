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
  warnings: z.array(z.string()).optional(),
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

const GRADE_FENCE =
  /```agent-dispatch-grade[ \t]*\r?\n([\s\S]*?)\r?\n```[ \t]*/u;
const GRADE_OPEN = /```agent-dispatch-grade[ \t]*\r?\n/u;

export const GRADE_WORKER_PROMPT = (brief: string): string =>
  `Grade this brief as a meaningful remand judgment. Decide whether it should pass, split, or clarify; for split, say what the pieces are and why. Do not edit or write files.\n\n` +
  `## Brief\n${brief}\n\n` +
  `## BIBIFI microticket rules\n` +
  `- One ticket has one consumed decision.\n` +
  `- first_return is the early checkpoint of the same final deliverable, never a separate deliverable; one artifact plus its first_return is a microticket.\n` +
  `- A change and its own acceptance check are one deliverable: build X so check Y passes. This includes tests, dry-runs, seal or hash checks, params/config files the change needs to run, and paired halves of one claim (such as lower and upper bounds, or both directions of an equivalence).\n` +
  `- Split only when there are at least two independently checkable FINAL deliverables.\n` +
  `- A split is warranted only when each piece delivers an independently consumable result.\n` +
  `- For a read-only ticket (writes = [] or read_only_diagnostic), split only when its parts answer independent questions; derived or mutually-referencing sections stay together.\n` +
  `- A ticket with split_from in its front matter is already a piece and must not be split again.\n` +
  `- A queue held by one worker is still a container.\n` +
  `- A long run must not be obtained by chaining pieces.\n\n` +
  `- If two pieces' writes overlap, order them with depends_on, or merge them into one piece.\n` +
  `- When split pieces have depends_on, name one integration/acceptance piece that consumes the others; if none is named, add a question.\n` +
  `- When the brief names functions or files it relies on but declares no premises, add a warning-level question suggesting \`premises = [...]\` with those names.\n` +
  `- When there is one final deliverable, return pass even if it is underspecified; put needed questions in questions with verdict pass.\n\n` +
  `## Output\n` +
  `Return one JSON object in an \`\`\`agent-dispatch-grade fenced block. Use exactly this shape; omit optional keys when unused:\n` +
  `\`\`\`json\n{ "verdict": "pass|split|clarify", "violations": [{ "rule": "...", "quote_from_brief": "...", "why_it_blocks_a_6min_first_return": "...", "fix": "..." }], "pieces": [{ "title": "...", "outcome": "...", "consumer": "...", "first_return": "...", "writes": ["..."], "verify": ["..."], "depends_on": [] }], "questions": [{ "question": "...", "unblocks": "..." }], "estimated_first_return_s": 120, "basis": "..." }\n\`\`\``;

export type ParsedAgentGrade =
  | { valid: true; grade: AgentGrade }
  | { valid: false; reason: string };

export function parseAgentGrade(
  message: string,
  parentBrief?: string,
): ParsedAgentGrade {
  const match = GRADE_FENCE.exec(message);
  if (match === null)
    return {
      valid: false,
      reason: GRADE_OPEN.test(message)
        ? "unterminated agent-dispatch-grade block"
        : "missing agent-dispatch-grade block",
    };
  const block = match[1] ?? "";
  const decoded = jsonText.safeParse(block);
  const tolerantDecoded = decoded.success
    ? decoded
    : jsonText.safeParse(stripTrailingCommas(block));
  if (!tolerantDecoded.success)
    return {
      valid: false,
      reason: "agent-dispatch-grade block is not valid JSON",
    };
  const parsed = AgentGradeSchema.safeParse(tolerantDecoded.data);
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
  const normalized = normalizeDependencies(parsed.data);
  const validation = validateAgentGrade(normalized.grade, parentBrief);
  return validation === undefined
    ? { valid: true, grade: normalized.grade }
    : { valid: false, reason: validation };
}

function stripTrailingCommas(text: string): string {
  return text.replaceAll(
    /"(?:\\.|[^"\\])*"|(,)(\s*[}\]])/gu,
    (match: string, comma: string | undefined, closing: string | undefined) =>
      comma === undefined ? match : (closing ?? ""),
  );
}

function normalizePieceDependencies(
  piece: AgentPiece,
  titles: Set<string>,
  warnings: string[],
): AgentPiece {
  const depends_on = piece.depends_on.filter((title) => {
    if (titles.has(title) && title !== piece.title) return true;
    warnings.push(
      `piece ${piece.title} has a dropped ${title === piece.title ? "self" : "unknown"} dependency: ${title}`,
    );
    return false;
  });
  return Object.assign({}, piece, { depends_on });
}

function normalizeDependencies(grade: AgentGrade): { grade: AgentGrade } {
  const titles = new Set((grade.pieces ?? []).map((piece) => piece.title));
  const warnings: string[] = [];
  const pieces = (grade.pieces ?? []).map((piece) =>
    normalizePieceDependencies(piece, titles, warnings),
  );
  return {
    grade: {
      ...grade,
      ...(grade.pieces === undefined ? {} : { pieces }),
      warnings: [...(grade.warnings ?? []), ...warnings],
    },
  };
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

const filePath = /(?:\.{1,2}\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.[a-z\d]{1,12}\b/giu;

function normalizedOperation(piece: AgentPiece): string {
  let outcome = piece.outcome.toLocaleLowerCase();
  for (const write of [...piece.writes].toSorted((a, b) => b.length - a.length))
    outcome = outcome.replaceAll(write.toLocaleLowerCase(), "<path>");
  return outcome.replaceAll(filePath, "<path>").replaceAll(/\s+/gu, " ").trim();
}

function splitOnlyByFileList(pieces: AgentPiece[]): boolean {
  return (
    new Set(pieces.map((piece) => normalizedOperation(piece))).size === 1 &&
    new Set(pieces.map((piece) => JSON.stringify(piece.writes))).size ===
      pieces.length
  );
}

const acceptanceCheckLanguage =
  /\b(?:tests?|testing|verify|verification|checks?|seal(?:s|ed|ing)?|dry[- ]runs?|bounds?|params?|parameters?|configs?|configuration|hash(?:es|ed|ing)?)\b/iu;

function splitSeparatesChangeFromItsCheck(pieces: AgentPiece[]): boolean {
  // This is a deliberately small lexical heuristic: acceptance language in a dependent
  // piece's outcome/checkpoint signals that it may only verify or complete its dependency.
  // It cannot determine semantic read sets, so unrelated staged work with such wording can
  // be rejected; graders should keep genuinely independent pieces free of false dependencies.
  return pieces.some(
    (piece) =>
      piece.depends_on.length > 0 &&
      acceptanceCheckLanguage.test(`${piece.outcome} ${piece.first_return}`),
  );
}

function validateAgentGrade(
  grade: AgentGrade,
  parentBrief?: string,
): string | undefined {
  if (grade.verdict === "pass") return undefined;
  if (grade.violations.length === 0)
    return "a remand must state violations with a reason and fix";
  if (grade.verdict === "clarify")
    return (grade.questions?.length ?? 0) > 0
      ? undefined
      : "a clarify grade must include at least one question";
  const pieces = grade.pieces ?? [];
  if (pieces.length < 2)
    return "a split grade must contain at least two pieces";
  if (splitOnlyByFileList(pieces))
    return "split pieces repeat one operation over different file lists; file count is not a separate deliverable";
  if (splitSeparatesChangeFromItsCheck(pieces))
    return "split separates a change from its own check";
  const parent =
    parentBrief === undefined ? undefined : parseTicket(parentBrief);
  if (parent?.kind === "ticket" && parent.ticket.split_from !== undefined)
    return `ticket is already a split piece (split_from=${parent.ticket.split_from}) and cannot be split again`;
  if (
    parent?.kind === "ticket" &&
    (parent.ticket.writes?.length === 0 ||
      parent.ticket.read_only_diagnostic === true) &&
    pieces.some((piece) => piece.depends_on.length > 0)
  )
    return "split separates dependent read-only sections";
  if (parent?.kind === "ticket" && parent.ticket.first_return !== undefined) {
    const firstReturn = parent.ticket.first_return
      .trim()
      .toLocaleLowerCase()
      .replaceAll(/\s+/gu, " ");
    const checkpointPiece = pieces.find((piece) =>
      firstReturn.includes(
        piece.outcome.trim().toLocaleLowerCase().replaceAll(/\s+/gu, " "),
      ),
    );
    if (checkpointPiece !== undefined)
      return `piece ${checkpointPiece.title} outcome is the parent's first_return checkpoint, not a separate final deliverable`;
  }
  const titles = new Set(pieces.map((piece) => piece.title));
  if (titles.size !== pieces.length) return "piece titles must be unique";
  for (const piece of pieces) {
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
  else if (floor.verdict === "clarify" || grader.verdict === "clarify")
    verdict = "clarify";
  return {
    verdict,
    source: "floor+grader",
    violations: [...floor.violations, ...grader.violations],
    ...((floor.warnings?.length ?? 0) === 0 &&
    (grader.warnings?.length ?? 0) === 0
      ? {}
      : { warnings: [...(floor.warnings ?? []), ...(grader.warnings ?? [])] }),
    ...(grader.pieces === undefined ? {} : { pieces: grader.pieces }),
    ...(grader.questions === undefined ? {} : { questions: grader.questions }),
    ...(grader.estimated_first_return_s === undefined
      ? {}
      : { estimated_first_return_s: grader.estimated_first_return_s }),
    ...(grader.basis === undefined ? {} : { basis: grader.basis }),
    grader: graderRecord,
  };
}

export function renderGradeRemand(
  grade: TicketGrade,
  splitFrom?: string,
): string[] {
  const lines = grade.violations.map(
    (item) =>
      `agent-dispatch: ${grade.verdict === "pass" ? "warning" : "remand"} ${item.rule}: ${item.why_it_blocks_a_6min_first_return} Fix: ${item.fix}`,
  );
  for (const warning of grade.warnings ?? [])
    lines.push(`agent-dispatch: warning: ${warning}`);
  for (const [index, piece] of (grade.pieces ?? []).entries()) {
    lines.push(
      [
        `agent-dispatch: split piece ${index + 1}: ${piece.title}`,
        "+++",
        "schema = 2",
        ...(splitFrom === undefined
          ? []
          : [`split_from = ${JSON.stringify(splitFrom)}`]),
        `outcome = ${JSON.stringify(piece.outcome)}`,
        `consumer = ${JSON.stringify(piece.consumer)}`,
        `first_return = ${JSON.stringify(piece.first_return)}`,
        `writes = ${JSON.stringify(piece.writes)}`,
        `verify = ${JSON.stringify(piece.verify)}`,
        ...(piece.depends_on.length === 0
          ? []
          : [`# depends_on = ${JSON.stringify(piece.depends_on)}`]),
        "+++",
      ].join("\n"),
    );
  }
  for (const question of grade.questions ?? [])
    lines.push(
      `agent-dispatch: clarify: ${question.question} Unblocks: ${question.unblocks}`,
    );
  return lines;
}
