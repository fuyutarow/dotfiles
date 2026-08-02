import {
  AUDITABILITY_VALUES,
  addFinding,
  EPISODE_DISPOSITIONS,
  type Finding,
  field,
  INTENT_KEYS,
  JUDGMENT_KEYS,
  LENS_VERDICTS,
  type LoadedPacket,
  PLACEHOLDER,
  RECEIPT_KEYS,
  REQUIRED_LENS_IDS,
  RESULT_CLASSES,
  TERMINAL_STATUSES,
  TRANSITIONS,
  withoutComments,
} from "./model";
import {
  validateDigestField,
  validateLocatorField,
  validateRequiredKeys,
  validateSchema,
  validateStableId,
  validateTimestampField,
} from "./primitives";

export function validateIntent(
  packet: LoadedPacket,
  findings: Finding[],
): void {
  validateRequiredKeys(packet, INTENT_KEYS, findings);
  validateSchema(packet, "research-run-intent/v1", findings);
  validateStableId(packet, "RUN_ID", findings);
  validateTimestampField(packet, "REGISTERED_AT", false, findings);
  for (const key of ["PRECOMMITMENT_SHA256", "ACTOR_OVERLAY_SHA256"])
    validateDigestField(packet, key, findings);
  for (const key of [
    "PROGRAMME_OR_QUESTION_LOCUS",
    "PRECOMMITMENT_LOCUS",
    "ACTOR_OVERLAY_LOCUS",
    "EVIDENCE_SINK",
  ])
    validateLocatorField(packet, key, findings);
  for (const key of [
    "ACCESS_BOUNDARY",
    "REGISTERED_EXPECTATION",
    "DISCRIMINATING_OUTCOMES",
    "NEXT_ACTIONS_BY_OUTCOME",
  ])
    if (field(packet, key) === "NONE")
      addFinding(findings, "RR003", packet.path, `${key} cannot be NONE`);
}

export function validateReceipt(
  packet: LoadedPacket,
  findings: Finding[],
): void {
  validateRequiredKeys(packet, RECEIPT_KEYS, findings);
  validateSchema(packet, "research-run-receipt/v1", findings);
  validateStableId(packet, "RUN_ID", findings);
  for (const key of ["INTENT_SHA256", "OBSERVATION_SHA256"])
    validateDigestField(packet, key, findings);
  validateTimestampField(packet, "STARTED_AT", true, findings);
  validateTimestampField(packet, "ENDED_AT", true, findings);
  for (const key of ["OBSERVATION_LOCATOR", "CONTROL_AND_ARTIFACT_CHECK_LOCI"])
    validateLocatorField(packet, key, findings);
  const status = field(packet, "STATUS");
  if (status !== undefined && !TERMINAL_STATUSES.has(status))
    addFinding(
      findings,
      "RR005",
      packet.path,
      `STATUS must be one of ${[...TERMINAL_STATUSES].join("|")}`,
    );
  if (
    status !== undefined &&
    status !== "succeeded" &&
    field(packet, "FAILURE_OR_EXCLUSION_REASON")?.startsWith("NONE")
  )
    addFinding(
      findings,
      "RR005",
      packet.path,
      `${status} receipt requires a concrete failure/exclusion reason`,
    );
  const digests = field(packet, "CODE_CONFIG_DATA_DIGESTS");
  if (digests !== undefined && !/[a-f0-9]{64}/.test(digests))
    addFinding(
      findings,
      "RR006",
      packet.path,
      "CODE_CONFIG_DATA_DIGESTS must contain at least one lowercase SHA-256",
    );
}

function tableCells(line: string): string[] | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;
  const cells: string[] = [];
  let cell = "";
  let codeTicks = 0;
  for (let index = 1; index < trimmed.length; index += 1) {
    const character = trimmed[index] ?? "";
    if (character === "\\" && index + 1 < trimmed.length) {
      cell += `${character}${trimmed[index + 1] ?? ""}`;
      index += 1;
      continue;
    }
    if (character === "`") {
      let runLength = 1;
      while (trimmed[index + runLength] === "`") runLength += 1;
      if (codeTicks === 0) codeTicks = runLength;
      else if (codeTicks === runLength) codeTicks = 0;
      cell += "`".repeat(runLength);
      index += runLength - 1;
      continue;
    }
    if (character === "|" && codeTicks === 0) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += character;
  }
  return cell === "" && codeTicks === 0 ? cells : undefined;
}

function isTableSeparator(line: string): boolean {
  const cells = tableCells(line);
  return cells?.length === 5 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function validateProcessLenses(
  packet: LoadedPacket,
  findings: Finding[],
): void {
  const lines = withoutComments(packet.text).split(/\r?\n/);
  const headings = lines
    .map((line, index) =>
      /^##\s+PROCESS LENSES\s*$/.test(line) ? index : undefined,
    )
    .filter((index) => index !== undefined);
  if (headings.length === 0) {
    addFinding(findings, "RR013", packet.path, "missing ## PROCESS LENSES");
    return;
  }
  if (headings.length !== 1)
    addFinding(
      findings,
      "RR013",
      packet.path,
      "RETROSPECTIVE JUDGMENT requires exactly one ## PROCESS LENSES",
    );
  let cursor = (headings[0] ?? 0) + 1;
  while (lines[cursor]?.trim() === "") cursor += 1;
  const headerIndex = cursor;
  const header = lines[cursor];
  const expectedHeader = [
    "Lens ID",
    "Evidence locus",
    "Verdict",
    "Causal consequence",
    "Repair / reopen",
  ];
  if (
    header === undefined ||
    tableCells(header)?.join("\u0000") !== expectedHeader.join("\u0000")
  )
    addFinding(
      findings,
      "RR013",
      packet.path,
      `PROCESS LENSES header must be ${expectedHeader.join(" | ")}`,
    );
  cursor += 1;
  if (!isTableSeparator(lines[cursor] ?? ""))
    addFinding(
      findings,
      "RR013",
      packet.path,
      "PROCESS LENSES requires one five-cell Markdown separator row",
    );
  const separatorIndex = cursor;
  cursor += 1;
  const rowStart = cursor;
  const ids: string[] = [];
  while (cursor < lines.length) {
    const line = lines[cursor] ?? "";
    if (line.trim() === "" || /^#{1,6}\s+/.test(line)) break;
    const cells = tableCells(line);
    if (cells?.length !== 5) {
      addFinding(
        findings,
        "RR013",
        packet.path,
        "each lens row needs five cells",
      );
      cursor += 1;
      continue;
    }
    const [id, evidence, verdict, consequence, repair] = cells;
    if (
      id === undefined ||
      evidence === undefined ||
      verdict === undefined ||
      consequence === undefined ||
      repair === undefined
    ) {
      cursor += 1;
      continue;
    }
    ids.push(id);
    if (
      [evidence, consequence, repair].some(
        (value) => value === "" || PLACEHOLDER.test(value),
      )
    )
      addFinding(
        findings,
        "RR013",
        packet.path,
        `lens ${id} needs evidence locus, causal consequence, and repair/reopen`,
      );
    if (!LENS_VERDICTS.has(verdict))
      addFinding(
        findings,
        "RR013",
        packet.path,
        `lens ${id} has invalid verdict ${verdict}`,
      );
    cursor += 1;
  }
  const rowEnd = cursor;
  const actual = new Set(ids);
  const required = new Set(REQUIRED_LENS_IDS);
  if (
    ids.length !== REQUIRED_LENS_IDS.length ||
    actual.size !== ids.length ||
    REQUIRED_LENS_IDS.some((id) => !actual.has(id)) ||
    ids.some((id) => !required.has(id))
  )
    addFinding(
      findings,
      "RR013",
      packet.path,
      `PROCESS LENSES must contain exactly once: ${REQUIRED_LENS_IDS.join(", ")}`,
    );
  for (const [index, line] of lines.entries()) {
    if (
      index === headerIndex ||
      index === separatorIndex ||
      (index >= rowStart && index < rowEnd)
    )
      continue;
    const id = tableCells(line)?.[0];
    if (id !== undefined && required.has(id))
      addFinding(
        findings,
        "RR013",
        packet.path,
        `stray or later PROCESS LENSES row for ${id}`,
      );
  }
}

function validateEnum(
  packet: LoadedPacket,
  key: string,
  allowed: ReadonlySet<string>,
  findings: Finding[],
): void {
  const value = field(packet, key);
  if (value !== undefined && !allowed.has(value))
    addFinding(
      findings,
      "RR005",
      packet.path,
      `${key} must be ${[...allowed].join("|")}`,
    );
}

export function validateJudgment(
  packet: LoadedPacket,
  findings: Finding[],
): void {
  validateRequiredKeys(packet, JUDGMENT_KEYS, findings);
  validateSchema(packet, "research-retrospective/v1", findings);
  validateStableId(packet, "JUDGMENT_ID", findings);
  validateDigestField(packet, "DENOMINATOR_SHA256", findings);
  validateLocatorField(packet, "AUDIT_CLEARANCE_LOCUS", findings);
  validateEnum(packet, "AUDITABILITY", AUDITABILITY_VALUES, findings);
  validateEnum(packet, "RESULT_CLASS", RESULT_CLASSES, findings);
  validateEnum(packet, "TRANSITION", TRANSITIONS, findings);
  validateEnum(packet, "EPISODE_DISPOSITION", EPISODE_DISPOSITIONS, findings);
  validateProcessLenses(packet, findings);
}
