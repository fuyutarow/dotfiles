import { existsSync } from "node:fs";
import { cli } from "cleye";

// Consumer: agent/human verdict lines for a Blind-spot packet.
// Structural floor only: this cannot validate creativity, completeness, importance, or truth.

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

type Table = Readonly<{
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}>;

type Verdict = Readonly<{
  id: string;
  label: string;
  status: "PASS" | "WARN" | "FAIL";
  detail: string;
}>;

const primarySlots = [
  "OBJECT",
  "RELATION",
  "OBSERVATION",
  "REGIME",
  "VALUE",
  "ACTION",
  "OPEN",
];

const requiredSections = [
  "Object under review",
  "Decision at stake",
  "Search budget",
  "Assumption ledger",
  "Open-set residual",
  "Tacit-knowledge probes",
  "Depth trace",
  "Discoveries",
  "Handoff",
  "Stop reason",
];

const allowedProbeTargets = new Set([
  "IGNORED-ANOMALY",
  "UNPUBLISHED-FAILURE",
  "NEGATIVE-RESULT",
  "EXPERT-WORKAROUND",
  "EXCEPTION",
  "INSTITUTIONAL-CONSTRAINT",
  "DISSENT",
]);

const humanProvenancePattern = /^HUMAN:[^@\s]+@\S+$/i;
const syntheticAnswerPattern =
  /\b(?:MODEL[- ]SIMULATED|SIMULATED[- ]HUMAN|ROLE[- ]PLAYED|FABRICATED)\b/i;

function cleanInline(value: string): string {
  return value
    .trim()
    .replace(/^`|`$/g, "")
    .replace(/^(?:\*\*|__)|(?:\*\*|__)$/g, "")
    .trim();
}

function placeholder(value: string): boolean {
  const normalized = cleanInline(value);
  return (
    normalized === "" ||
    /^\[(?:\.\.\.|…| *)\]$/.test(normalized) ||
    /^(?:TBD|N\/?A|NA|未回答|未記入|未定|-|—|ー|―|\?+)$/i.test(normalized)
  );
}

function headingLabel(line: string): string | undefined {
  const match = line.match(/^#{1,6}\s+(.+?)\s*$/);
  return match?.[1] === undefined ? undefined : cleanInline(match[1]);
}

function sectionBody(text: string, label: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => headingLabel(line) === label);
  if (start === -1) return undefined;
  const relativeEnd = lines
    .slice(start + 1)
    .findIndex((line) => headingLabel(line) !== undefined);
  const end = relativeEnd === -1 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start + 1, end).join("\n").trim();
}

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map(cleanInline);
}

function separatorRow(cells: readonly string[]): boolean {
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell.replaceAll(" ", "")))
  );
}

function parseTable(body: string | undefined): Table | undefined {
  if (body === undefined) return undefined;
  const lines = body.split(/\r?\n/).filter((line) => line.includes("|"));
  if (lines.length < 2) return undefined;
  const headers = tableCells(lines[0]);
  const rows = lines
    .slice(1)
    .map(tableCells)
    .filter((cells) => !separatorRow(cells));
  if (rows.length === 0) return undefined;
  return { headers, rows };
}

function column(table: Table, name: string): number | undefined {
  const index = table.headers.findIndex(
    (header) => header.toLowerCase() === name.toLowerCase(),
  );
  return index === -1 ? undefined : index;
}

function cell(
  row: readonly string[],
  index: number | undefined,
): string | undefined {
  return index === undefined ? undefined : row[index];
}

function fieldValue(body: string | undefined, label: string): string | undefined {
  if (body === undefined) return undefined;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    String.raw`^\s*(?:[-*+]\s+)?(?:\*\*|__)?${escaped}(?:\*\*|__)?\s*[：:]\s*(.+?)\s*$`,
    "i",
  );
  for (const line of body.split(/\r?\n/)) {
    const value = line.match(pattern)?.[1];
    if (value !== undefined) return cleanInline(value);
  }
  return undefined;
}

function provenance(value: string): "HUMAN" | "ARTIFACT" | "INFERENCE" | "UNELICITED" | undefined {
  const normalized = cleanInline(value);
  const token = normalized.split(/\s+(?:—|-|:)\s+/, 1)[0] ?? normalized;
  if (humanProvenancePattern.test(token)) return "HUMAN";
  if (/^ARTIFACT:.+/i.test(normalized)) return "ARTIFACT";
  if (/^INFERENCE(?:\s*(?:—|-|:).*)?$/i.test(normalized)) return "INFERENCE";
  if (/^UNELICITED(?:\s*(?:—|-|:).*)?$/i.test(normalized))
    return "UNELICITED";
  return undefined;
}

function verdict(
  id: string,
  label: string,
  status: Verdict["status"],
  detail: string,
): Verdict {
  return { id, label, status, detail };
}

function checkSections(text: string): Verdict {
  const missing = requiredSections.filter((label) => {
    const body = sectionBody(text, label);
    return body === undefined || placeholder(body);
  });
  const budget = sectionBody(text, "Search budget") ?? "";
  const unboundedBudget =
    /\b(?:unlimited|unbounded|exhaustive|until (?:complete|everything)|no limit)\b|無制限|網羅するまで/i.test(
      budget,
    );
  if (unboundedBudget) {
    return verdict(
      "B1",
      "packet fields",
      "FAIL",
      "Search budget is unbounded; declare a finite cap",
    );
  }
  return missing.length === 0
    ? verdict("B1", "packet fields", "PASS", "all 10 required sections are present")
    : verdict(
        "B1",
        "packet fields",
        "FAIL",
        `missing or blank: ${missing.join(", ")}`,
      );
}

type LedgerState = Readonly<{
  loadBearingIds: ReadonlySet<string>;
  table: Table | undefined;
  verdicts: readonly Verdict[];
}>;

function checkLedger(body: string | undefined, fullText: string): LedgerState {
  const table = parseTable(body);
  if (table === undefined) {
    return {
      loadBearingIds: new Set(),
      table,
      verdicts: [
        verdict("B2", "typed assumptions", "FAIL", "Assumption ledger table not found"),
        verdict("B3", "separate axes", "FAIL", "four axis columns cannot be checked"),
        verdict("B4", "depth selection", "FAIL", "LOAD-BEARING rows cannot be checked"),
      ],
    };
  }

  const requiredColumns = [
    "ID",
    "Primary slot",
    "Assumption",
    "Cross-tags",
    "Evidence",
    "Uncertainty",
    "Frame damage",
    "Search cost",
    "Selection",
  ];
  const missingColumns = requiredColumns.filter(
    (name) => column(table, name) === undefined,
  );
  const idIndex = column(table, "ID");
  const primaryIndex = column(table, "Primary slot");
  const assumptionIndex = column(table, "Assumption");
  const crossTagsIndex = column(table, "Cross-tags");
  const evidenceIndex = column(table, "Evidence");
  const uncertaintyIndex = column(table, "Uncertainty");
  const damageIndex = column(table, "Frame damage");
  const costIndex = column(table, "Search cost");
  const selectionIndex = column(table, "Selection");

  const covered = new Set<string>();
  const ids = new Set<string>();
  const loadBearingIds = new Set<string>();
  const typedProblems: string[] = [];
  const axisProblems: string[] = [];

  for (const [rowNumber, row] of table.rows.entries()) {
    const displayRow = rowNumber + 1;
    const id = cleanInline(cell(row, idIndex) ?? "");
    const primary = cleanInline(cell(row, primaryIndex) ?? "").toUpperCase();
    const assumption = cleanInline(cell(row, assumptionIndex) ?? "");
    const crossTags = cleanInline(cell(row, crossTagsIndex) ?? "").toUpperCase();
    const selection = cleanInline(cell(row, selectionIndex) ?? "").toUpperCase();
    const evidence = cleanInline(cell(row, evidenceIndex) ?? "");
    const uncertainty = cleanInline(cell(row, uncertaintyIndex) ?? "").toUpperCase();
    const damage = cleanInline(cell(row, damageIndex) ?? "").toUpperCase();
    const cost = cleanInline(cell(row, costIndex) ?? "").toUpperCase();

    if (placeholder(id) || ids.has(id))
      typedProblems.push(`row ${displayRow}: ID missing or duplicated`);
    else ids.add(id);

    if (!primarySlots.includes(primary))
      typedProblems.push(
        `row ${displayRow}: Primary slot must be exactly one canonical slot`,
      );
    else covered.add(primary);

    if (placeholder(assumption))
      typedProblems.push(`row ${displayRow}: Assumption is blank`);

    if (crossTags !== "NONE") {
      const tags = crossTags.split(",").map((tag) => tag.trim());
      if (tags.some((tag) => !primarySlots.includes(tag)))
        typedProblems.push(`row ${displayRow}: Cross-tags contain an unknown slot`);
    }

    if (
      !/^(?:ARTIFACT:.+|INFERENCE|NONE)$/i.test(evidence) &&
      !humanProvenancePattern.test(evidence)
    )
      axisProblems.push(`row ${displayRow}: invalid Evidence`);
    if (!["SUPPORTED", "CONTESTED", "UNKNOWN", "UNELICITED"].includes(uncertainty))
      axisProblems.push(`row ${displayRow}: invalid Uncertainty`);
    if (!["LOCAL", "FRAME", "DECISION", "DISCRIMINATOR"].includes(damage))
      axisProblems.push(`row ${displayRow}: invalid Frame damage`);
    if (!["NOW", "BOUNDED", "EXTERNAL", "INACCESSIBLE"].includes(cost))
      axisProblems.push(`row ${displayRow}: invalid Search cost`);

    if (selection === "LOAD-BEARING") {
      if (/^NONE SURFACED\b/i.test(assumption))
        typedProblems.push(`row ${displayRow}: NONE SURFACED cannot be LOAD-BEARING`);
      if (!placeholder(id)) loadBearingIds.add(id);
    } else if (selection !== "NOT-SELECTED") {
      typedProblems.push(
        `row ${displayRow}: Selection must be LOAD-BEARING or NOT-SELECTED`,
      );
    }
  }

  const missingSlots = primarySlots.filter((slot) => !covered.has(slot));
  if (missingSlots.length > 0)
    typedProblems.push(`typed sweep omitted: ${missingSlots.join(", ")}`);
  if (missingColumns.length > 0)
    typedProblems.push(`missing columns: ${missingColumns.join(", ")}`);

  if (table.headers.some((header) => /\bscore\b/i.test(header)))
    axisProblems.push("scalar Score column is forbidden");
  if (
    /\b(?:overall|aggregate|weighted|combined)\s+(?:risk\s+|priority\s+)?score\b|\b(?:risk|priority)\s+score\s*[:=]/i.test(
      fullText,
    )
  )
    axisProblems.push("packet-level scalar score is forbidden");
  if (missingColumns.some((name) =>
    ["Evidence", "Uncertainty", "Frame damage", "Search cost"].includes(name),
  ))
    axisProblems.push("the four axes do not have separate columns");

  const selectionCount = loadBearingIds.size;
  const selectionProblem =
    selectionCount < 1 || selectionCount > 3
      ? `expected 1-3 LOAD-BEARING rows; found ${selectionCount}`
      : undefined;

  return {
    loadBearingIds,
    table,
    verdicts: [
      typedProblems.length === 0
        ? verdict(
            "B2",
            "typed assumptions",
            "PASS",
            "all seven primary slots covered; one primary home per row",
          )
        : verdict("B2", "typed assumptions", "FAIL", typedProblems.join("; ")),
      axisProblems.length === 0
        ? verdict(
            "B3",
            "separate axes",
            "PASS",
            "evidence, uncertainty, frame damage, and search cost remain separate",
          )
        : verdict("B3", "separate axes", "FAIL", axisProblems.join("; ")),
      selectionProblem === undefined
        ? verdict(
            "B4",
            "depth selection",
            "PASS",
            `${selectionCount} LOAD-BEARING assumption(s) selected`,
          )
        : verdict("B4", "depth selection", "FAIL", selectionProblem),
    ],
  };
}

type ProbeState = Readonly<{
  allUnelicited: boolean;
  hasHumanAnswer: boolean;
  verdict: Verdict;
}>;

function checkProbes(body: string | undefined): ProbeState {
  const table = parseTable(body);
  if (table === undefined) {
    return {
      allUnelicited: false,
      hasHumanAnswer: false,
      verdict: verdict(
        "B5",
        "human provenance",
        "FAIL",
        "Tacit-knowledge probes table not found",
      ),
    };
  }

  const required = [
    "Probe",
    "Target",
    "Contrastive question",
    "Provenance",
    "Answer",
    "Decision change",
  ];
  const missing = required.filter((name) => column(table, name) === undefined);
  const targetIndex = column(table, "Target");
  const questionIndex = column(table, "Contrastive question");
  const provenanceIndex = column(table, "Provenance");
  const answerIndex = column(table, "Answer");
  const changeIndex = column(table, "Decision change");
  const problems: string[] = [];
  let hasHumanAnswer = false;
  let unelicitedCount = 0;

  if (table.rows.length < 1 || table.rows.length > 3)
    problems.push(`expected 1-3 probes; found ${table.rows.length}`);
  if (missing.length > 0) problems.push(`missing columns: ${missing.join(", ")}`);

  for (const [rowNumber, row] of table.rows.entries()) {
    const displayRow = rowNumber + 1;
    const target = cleanInline(cell(row, targetIndex) ?? "").toUpperCase();
    const question = cleanInline(cell(row, questionIndex) ?? "");
    const source = cleanInline(cell(row, provenanceIndex) ?? "");
    const answer = cleanInline(cell(row, answerIndex) ?? "");
    const change = cleanInline(cell(row, changeIndex) ?? "");

    if (!allowedProbeTargets.has(target))
      problems.push(`row ${displayRow}: invalid tacit Target`);
    if (placeholder(question))
      problems.push(`row ${displayRow}: Contrastive question is blank`);
    else if (
      !/\b(?:if|whether|versus|instead|rather than|otherwise|would|which)\b|なら|場合|どちら|対して|一方/i.test(
        question,
      )
    )
      problems.push(
        `row ${displayRow}: question does not expose a contrast between answer branches`,
      );
    if (placeholder(change))
      problems.push(`row ${displayRow}: Decision change is blank`);
    else if (
      /^(?:nothing|none|no change|unchanged|nothing changes|変わらない|変更なし)[.!。]?$/i.test(
        change,
      )
    )
      problems.push(`row ${displayRow}: Decision change says no branch can change`);

    if (humanProvenancePattern.test(source)) {
      if (placeholder(answer) || /^UNELICITED$/i.test(answer))
        problems.push(`row ${displayRow}: HUMAN provenance requires a real answer`);
      else if (syntheticAnswerPattern.test(answer))
        problems.push(`row ${displayRow}: HUMAN answer is explicitly synthetic`);
      else hasHumanAnswer = true;
    } else if (/^UNELICITED$/i.test(source)) {
      unelicitedCount += 1;
      if (!/^UNELICITED$/i.test(answer))
        problems.push(`row ${displayRow}: UNELICITED provenance requires UNELICITED answer`);
    } else {
      problems.push(
        `row ${displayRow}: Provenance must be HUMAN:<owner>@<attestation-locus> or UNELICITED`,
      );
    }
  }

  const allUnelicited =
    table.rows.length > 0 && unelicitedCount === table.rows.length;
  if (problems.length > 0) {
    return {
      allUnelicited,
      hasHumanAnswer,
      verdict: verdict("B5", "human provenance", "FAIL", problems.join("; ")),
    };
  }
  return {
    allUnelicited,
    hasHumanAnswer,
    verdict: allUnelicited
      ? verdict(
          "B5",
          "human provenance",
          "WARN",
          "all tacit probes are transparently UNELICITED",
        )
      : verdict(
          "B5",
          "human provenance",
          "PASS",
          "human provenance claim has an audit locator; authenticity remains semantic",
        ),
  };
}

function checkDepth(
  body: string | undefined,
  loadBearingIds: ReadonlySet<string>,
  hasHumanAnswer: boolean,
): Verdict {
  const root = fieldValue(body, "Root assumption");
  const level1 = fieldValue(body, "Level 1");
  const level2 = fieldValue(body, "Level 2");
  const problems: string[] = [];
  const hasDepthContent = (value: string | undefined): boolean =>
    value !== undefined &&
    /\s+(?:—|-)\s+\S.{7,}$/.test(value) &&
    !syntheticAnswerPattern.test(value);

  if (root === undefined || !loadBearingIds.has(root))
    problems.push("Root assumption must name a LOAD-BEARING ID");
  if (
    level1 === undefined ||
    placeholder(level1) ||
    provenance(level1) === undefined ||
    !hasDepthContent(level1)
  )
    problems.push("Level 1 needs explicit provenance and content");
  if (
    level2 === undefined ||
    placeholder(level2) ||
    provenance(level2) === undefined ||
    !hasDepthContent(level2)
  )
    problems.push("Level 2 needs explicit provenance and content");
  if (
    hasHumanAnswer &&
    provenance(level1 ?? "") !== "HUMAN" &&
    provenance(level2 ?? "") !== "HUMAN"
  )
    problems.push("elicited human evidence is absent from the two-level trace");

  return problems.length === 0
    ? verdict(
        "B6",
        "depth trace",
        "PASS",
        "one LOAD-BEARING branch is traced through Level 1 and Level 2",
      )
    : verdict("B6", "depth trace", "FAIL", problems.join("; "));
}

function checkOpenResidual(body: string | undefined): Verdict {
  const normalized = body ?? "";
  const problems: string[] = [];
  if (placeholder(normalized)) problems.push("Open-set residual is blank");
  if (!/\bOPEN\b/.test(normalized)) problems.push("literal OPEN marker missing");
  if (!/\bNON-EXHAUSTIVE\b/.test(normalized))
    problems.push("literal NON-EXHAUSTIVE marker missing");
  return problems.length === 0
    ? verdict(
        "B7",
        "open residual",
        "PASS",
        "OPEN — NON-EXHAUSTIVE remains explicit",
      )
    : verdict("B7", "open residual", "FAIL", problems.join("; "));
}

function stopCode(body: string | undefined): string | undefined {
  if (body === undefined) return undefined;
  return body.match(
    /\b(DECISION-INSENSITIVE|BUDGET-SPENT|HUMAN-UNAVAILABLE)\b/,
  )?.[1];
}

function checkStop(
  body: string | undefined,
  allUnelicited: boolean,
  depthBody: string | undefined,
): Verdict {
  const code = stopCode(body);
  const rationale = body ?? "";
  const problems: string[] = [];
  if (code === undefined) problems.push("canonical strategic stop code missing");
  if (
    code === "DECISION-INSENSITIVE" &&
    (!/\b(?:no|cannot|can't|would not|does not|without)\b.{0,50}\b(?:change|alter|reopen)\b|変わらない|変更しない|再開しない/i.test(
      rationale,
    ) ||
      /\b(?:would|could|will)\s+change\b.{0,50}\b(?:continue|ask more)\b|\bcontinue\b|変わるので続け/i.test(
        rationale,
      ))
  )
    problems.push(
      "DECISION-INSENSITIVE needs a non-change rationale and cannot instruct continuation",
    );
  if (
    code === "BUDGET-SPENT" &&
    !/\b(?:budget|cap|limit|time|token|question|source pass).{0,40}\b(?:spent|exhaust|reached|used)\b|予算|上限|時間切れ/i.test(
      rationale,
    )
  )
    problems.push("BUDGET-SPENT needs the exhausted cap in its rationale");
  if (
    code === "HUMAN-UNAVAILABLE" &&
    !(
      /\b(?:human|owner|operator|expert|researcher).{0,40}\b(?:unavailable|absent|missing|not available)\b/i.test(
        rationale,
      ) ||
      /\b(?:unavailable|absent|missing|not available).{0,40}\b(?:human|owner|operator|expert|researcher)\b/i.test(
        rationale,
      ) ||
      /人間|担当者|不在/.test(rationale)
    )
  )
    problems.push("HUMAN-UNAVAILABLE needs the absent human owner in its rationale");
  if (
    (allUnelicited || /\bUNELICITED\b/.test(depthBody ?? "")) &&
    code === "DECISION-INSENSITIVE"
  )
    problems.push(
      "UNELICITED depth cannot justify DECISION-INSENSITIVE; use the binding budget or human stop",
    );
  return problems.length === 0
    ? verdict("B8", "strategic stop", "PASS", `stop code: ${code}`)
    : verdict("B8", "strategic stop", "FAIL", problems.join("; "));
}

function checkDiscoveries(body: string | undefined): Verdict {
  const table = parseTable(body);
  if (table === undefined)
    return verdict(
      "B9",
      "integrated provenance",
      "FAIL",
      "Discoveries table not found",
    );
  const required = ["Discovery", "Source", "Consequence"];
  const missing = required.filter((name) => column(table, name) === undefined);
  const discoveryIndex = column(table, "Discovery");
  const sourceIndex = column(table, "Source");
  const consequenceIndex = column(table, "Consequence");
  const problems: string[] = [];
  if (missing.length > 0) problems.push(`missing columns: ${missing.join(", ")}`);
  for (const [rowNumber, row] of table.rows.entries()) {
    const displayRow = rowNumber + 1;
    const discovery = cleanInline(cell(row, discoveryIndex) ?? "");
    const source = cleanInline(cell(row, sourceIndex) ?? "");
    const consequence = cleanInline(cell(row, consequenceIndex) ?? "");
    if (placeholder(discovery))
      problems.push(`row ${displayRow}: Discovery is blank`);
    if (
      !/^(?:ARTIFACT:.+|INFERENCE)$/i.test(source) &&
      !humanProvenancePattern.test(source)
    )
      problems.push(`row ${displayRow}: Source provenance is invalid`);
    if (syntheticAnswerPattern.test(discovery))
      problems.push(`row ${displayRow}: Discovery is explicitly synthetic`);
    if (placeholder(consequence))
      problems.push(`row ${displayRow}: Consequence is blank`);
  }
  return problems.length === 0
    ? verdict(
        "B9",
        "integrated provenance",
        "PASS",
        "discoveries retain source provenance",
      )
    : verdict("B9", "integrated provenance", "FAIL", problems.join("; "));
}

function checkBoundary(text: string): Verdict {
  const forbidden = new Set([
    "solution",
    "solutions",
    "solution candidates",
    "thesis",
    "thesis candidates",
    "experiment design",
    "recommendation",
    "recommendations",
    "commit decision",
    "kill decision",
  ]);
  const headings = text
    .split(/\r?\n/)
    .map(headingLabel)
    .filter((label) => label !== undefined);
  const leaked = headings.filter((label) =>
    forbidden.has(label.toLowerCase()),
  );
  const closureSurface = text
    .replace(/\bnot all (?:blind spots?|unknown unknowns).{0,50}\b(?:were )?(?:found|covered|enumerated|eliminated)\b/gi, "")
    .replace(/\b(?:did|does|do|can|could|will|would) not .{0,50}\b(?:all|every) (?:blind spots?|unknown unknowns)\b/gi, "");
  const closureClaim =
    /\b(?:all|every)\s+(?:blind spots?|unknown unknowns).{0,40}\b(?:found|covered|enumerated|eliminated)\b/i.test(
      closureSurface,
    ) ||
    /\bno\s+(?:material\s+|meaningful\s+|remaining\s+)?blind spots?\s+remain\b|\b(?:this\s+)?inventory\s+is\s+(?:complete|exhaustive)\b|\bnothing\s+(?:else\s+)?remains\s+to\s+(?:ask|consider|discover)\b/i.test(
      closureSurface,
    ) ||
    /(?:盲点|未知).{0,20}(?:完全に|すべて|全て).{0,20}(?:網羅|解消)/.test(
      closureSurface,
    );
  const readOrderViolation =
    /\b(?:did not|didn't|without)\s+read\b.{0,80}\b(?:ask|question)|\basked?\s+(?:first|before reading)\b|読まずに質問/i.test(
      text,
    );
  const handoff = sectionBody(text, "Handoff") ?? "";
  const handoffOwner =
    /\b(?:directing-research|forging-novel-theses|raising-resolution|acting-on-hypotheses|systematizing-knowledge|arguing-research-papers|forging-skills|orchestrating-agents|NONE)\b/i.test(
      handoff,
    );
  const handoffDecisionLeak =
    /\b(?:recommend|choose|select|adopt|implement|solution|thesis|commit|kill)\b|推奨|選択|解決策|仮説を生成|実装/i.test(
      handoff,
    );
  if (
    leaked.length === 0 &&
    !closureClaim &&
    !readOrderViolation &&
    handoffOwner &&
    !handoffDecisionLeak
  )
    return verdict(
      "B10",
      "output boundary",
      "PASS",
      "no obvious solution/thesis leak, closure claim, or ownerless handoff found",
    );
  const details = [
    leaked.length > 0 ? `forbidden headings: ${leaked.join(", ")}` : undefined,
    closureClaim ? "exhaustive blind-spot coverage claim found" : undefined,
    readOrderViolation ? "packet explicitly says questions preceded reading" : undefined,
    !handoffOwner ? "Handoff does not name an owner or NONE" : undefined,
    handoffDecisionLeak ? "Handoff contains a solution/selection/commit verdict" : undefined,
  ].filter((detail) => detail !== undefined);
  return verdict("B10", "output boundary", "FAIL", details.join("; "));
}

async function input(): Promise<string> {
  const parsed = cli(
    {
      name: "blind-spot-check.ts",
      parameters: ["[path]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  const path = parsed._.path;
  if (parsed._.length > 1)
    throw new Error("usage: bun blind-spot-check.ts [packet.md|-]");
  if (path === undefined || path === "-")
    return new Response(Bun.stdin.stream()).text();
  if (!existsSync(path))
    throw new Error(`blind-spot-check: file not found: ${path}`);
  return Bun.file(path).text();
}

async function main(): Promise<void> {
  const text = await input();
  const assumptionBody = sectionBody(text, "Assumption ledger");
  const probeBody = sectionBody(text, "Tacit-knowledge probes");
  const depthBody = sectionBody(text, "Depth trace");
  const ledger = checkLedger(assumptionBody, text);
  const probes = checkProbes(probeBody);
  const verdicts = [
    checkSections(text),
    ...ledger.verdicts,
    probes.verdict,
    checkDepth(depthBody, ledger.loadBearingIds, probes.hasHumanAnswer),
    checkOpenResidual(sectionBody(text, "Open-set residual")),
    checkStop(sectionBody(text, "Stop reason"), probes.allUnelicited, depthBody),
    checkDiscoveries(sectionBody(text, "Discoveries")),
    checkBoundary(text),
  ];

  let failures = 0;
  let warnings = 0;
  for (const result of verdicts) {
    process.stdout.write(
      `${result.id}  ${result.status.padEnd(4)}  ${result.label}: ${result.detail}\n`,
    );
    if (result.status === "FAIL") failures += 1;
    if (result.status === "WARN") warnings += 1;
  }
  process.stdout.write("----\n");
  process.stdout.write(
    `Blind-spot packet: FAIL=${failures} WARN=${warnings}  (structural floor only; semantic creativity and completeness remain unverified)\n`,
  );
  if (failures > 0)
    process.stdout.write(
      "→ Repair the failed packet fields before handing the artifact to another skill.\n",
    );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
