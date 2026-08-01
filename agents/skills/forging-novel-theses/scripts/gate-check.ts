import { existsSync } from "node:fs";
import { typeFlag } from "type-flag";

// Consumer: agent/human verdict lines for candidate packets and batches.
// Mechanical floor only: this script cannot establish novelty, value, or truth.

const seedProvenanceValues = [
  "OBSERVATION",
  "ACCOUNT",
  "CONSTRAINT",
  "ANALOGY",
  "TACIT",
  "NEGATIVE-SPACE",
  "OTHER",
] satisfies readonly string[];

const transformationTargetValues = [
  "OBJECT",
  "RELATION",
  "REPRESENTATION",
  "REGIME",
  "EVIDENCE",
  "CONSTRAINT",
  "OTHER",
] satisfies readonly string[];

const operationValues = [
  "INVERT",
  "REMOVE",
  "SUBSTITUTE",
  "TRANSFER",
  "DECOMPOSE",
  "COUPLE",
  "GENERALIZE",
  "BOUND",
  "OTHER",
] satisfies readonly string[];

const groundedControl = "NONE — grounded control";
const collapseRecovery =
  "ONE targeted regeneration in an unoccupied legitimate cell; then COVERAGE GAP";
const humanAttestationPattern = /^HUMAN:[^@\s]+@[^@\s]+$/i;

type Severity = "PASS" | "WARN" | "FAIL" | "MISSING";

type Reporter = (
  id: string,
  severity: Severity,
  message: string,
) => void;

type CandidateSection = Readonly<{
  body: string;
  id: string;
}>;

type CandidateData = Readonly<{
  discriminator: string;
  id: string;
  operation: string;
  premise: string;
  target: string;
}>;

type Gate = Readonly<{
  id: string;
  label: string;
  validate?: (value: string) => string | undefined;
  warn?: (value: string) => string | undefined;
}>;

function rejectUnknownFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

function fieldPattern(label: string): RegExp {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    String.raw`^\s*(?:[-*+]\s+|#{1,6}\s+)?(?:\*\*|__)?${escaped}(?:(?:\*\*|__)\s*[：:]|\s*[：:](?:\*\*|__)?)`,
    "i",
  );
}

function valueAfterColon(line: string): string {
  const normalized = line.replace(/←.*$/, "").replaceAll("：", ":");
  const index = normalized.indexOf(":");
  return index === -1
    ? ""
    : normalized
        .slice(index + 1)
        .trim()
        .replace(/^(?:\*\*|__)\s*/, "")
        .replace(/^　+|　+$/g, "");
}

function readField(lines: readonly string[], label: string): string | undefined {
  const pattern = fieldPattern(label);
  const line = lines.find((candidate) => pattern.test(candidate));
  return line === undefined ? undefined : valueAfterColon(line);
}

function placeholder(value: string): boolean {
  return (
    value === "" ||
    /\[\.\.\.\]|\[…\]|\[ *\]/.test(value) ||
    /^(未回答|未記入|未定|TBD|N\/?A|NA|-|—|ー|―|\?+)$/i.test(value)
  );
}

function coordinateParts(
  value: string,
): Readonly<{ detail?: string; token: string }> | undefined {
  const match = value.match(
    /^([A-Z]+(?:-[A-Z]+)*)(?:\s*(?:—|–|:|\s-\s)\s*(.+))?$/i,
  );
  if (match === null) return undefined;
  const token = match[1]?.toUpperCase();
  if (token === undefined) return undefined;
  const detail = match[2]?.trim();
  return detail === undefined ? { token } : { detail, token };
}

function validateCoordinate(
  values: readonly string[],
  field: string,
): (value: string) => string | undefined {
  return (value) => {
    const parts = coordinateParts(value);
    if (parts === undefined || !values.includes(parts.token)) {
      return `${field} must start with one allowed uppercase token`;
    }
    if (parts.token === "OTHER" && placeholder(parts.detail ?? "")) {
      return `${field}: OTHER must name the open-set value`;
    }
    return undefined;
  };
}

function validateSeedProvenance(value: string): string | undefined {
  const coordinateFailure = validateCoordinate(
    seedProvenanceValues,
    "Seed provenance",
  )(value);
  if (coordinateFailure !== undefined) return coordinateFailure;

  const parts = coordinateParts(value);
  const detail = parts?.detail ?? "";
  if (placeholder(detail) || detail.length < 8) {
    return "Seed provenance must name the specific seed or source after the token";
  }
  if (parts?.token !== "TACIT") return undefined;
  if (/\bUNELICITED\b/i.test(detail)) {
    return "TACIT seed cannot cite an UNELICITED answer";
  }
  const citesPacket = /blind[- ]spot packet/i.test(detail);
  const citesProbe = /\b(?:probe\s*)?P\d+\b/i.test(detail);
  const humanTokens = detail.match(/\bHUMAN:[^\s,;]+/gi) ?? [];
  const citesHuman =
    humanTokens.length === 1 &&
    humanAttestationPattern.test(humanTokens[0] ?? "");
  if (!(citesPacket && citesProbe && citesHuman)) {
    return "TACIT seed must cite a Blind-spot packet probe ID and exactly HUMAN:<owner>@<attestation-locus>";
  }
  return undefined;
}

function validatePremise(value: string): string | undefined {
  if (value === groundedControl) return undefined;
  if (/^NONE\b/i.test(value)) {
    return `Premise challenged must be specific or exactly ${groundedControl}`;
  }
  if (value.length < 10) return "Premise challenged is too vague to audit";
  if (
    /^(?:a |the )?(?:premise|assumption|default|status quo|conventional wisdom|current approach)(?: is (?:wrong|false))?\.?$/i.test(
      value,
    ) ||
    /^(?:前提|仮定|常識|従来手法)(?:を疑う|が間違い)?$/.test(value)
  ) {
    return "Premise challenged names a category, not a specific premise";
  }
  return undefined;
}

function validateTransformationTrace(value: string): string | undefined {
  if (
    /^(?:use|apply|take|adopt)?\s*(?:a\s+)?(?:more\s+)?(?:innovative|holistic|novel|creative|adaptive|ai[- ]powered)(?:\s+and\s+(?:innovative|holistic|novel|creative|adaptive|ai[- ]powered))*\s+(?:approach|method|strategy)\.?$/i.test(
      value,
    )
  ) {
    return "Transformation trace contains only novelty adjectives";
  }
  if (value.length < 24) {
    return "Transformation trace must expose a before-state, operation, and after-state";
  }
  if (
    !/(?:->|→|=>|\breplac|\btransform|\bremove|\bsubstitut|\btransfer|\bdecompos|\bcoupl|\bgenerali[sz]|\bbound|\bfrom\b.+\bto\b|置換|変換|除去|転移|分解|結合|一般化|境界)/i.test(
      value,
    )
  ) {
    return "Transformation trace lacks an observable transformation operation";
  }
  return undefined;
}

function validateClaim(value: string): string | undefined {
  if (value.length < 20) return "Thesis claim is too vague to inspect";
  if (
    /^(?:use|apply|adopt)\s+(?:an?\s+)?(?:innovative|holistic|novel|creative).+$/i.test(
      value,
    )
  ) {
    return "Thesis claim is an approach label, not a testable claim";
  }
  return undefined;
}

function validatePrediction(value: string): string | undefined {
  if (value.length < 20) return "New testable prediction is too vague";
  if (
    /^(?:research\s+)?(?:results?|outcomes?|performance|quality|accuracy)\s+(?:will\s+)?(?:improve|increase|be better)\.?$/i.test(
      value,
    ) ||
    /^(?:研究)?(?:結果|成果|性能|品質|精度)(?:が|は)?(?:改善|向上)する。?$/.test(
      value,
    )
  ) {
    return "New testable prediction states generic improvement, not an observable consequence";
  }
  return undefined;
}

function validateDiscriminator(value: string): string | undefined {
  if (value.length < 24) return "New discriminator is too vague";
  if (
    /^(?:results?|outcomes?|performance)\s+(?:will\s+)?(?:differ|be different|improve|be better)\.?$/i.test(
      value,
    )
  ) {
    return "New discriminator states only difference or improvement";
  }
  if (
    !/(?:\bvs\.?\b|\bversus\b|\bwhereas\b|\brather than\b|\bwhile\b|\bbut\b|\bcompared\b|\bonly\b|\bif\b.+\bthen\b|に対して|一方|なら|比較|有無|差)/i.test(
      value,
    )
  ) {
    return "New discriminator must contrast candidate and alternative outcomes";
  }
  return undefined;
}

function validateFrameUpdate(value: string): string | undefined {
  if (/^NO$/i.test(value)) return undefined;
  if (/^YES\s*(?:—|–|:|\s-\s)\s*\S.+$/i.test(value)) return undefined;
  return "Frame update flag must be NO or YES with the frame change";
}

const candidateGates = [
  {
    id: "C1",
    label: "Input problem/frame",
  },
  {
    id: "C2",
    label: "Seed provenance",
    validate: validateSeedProvenance,
  },
  {
    id: "C3",
    label: "Transformation target",
    validate: validateCoordinate(
      transformationTargetValues,
      "Transformation target",
    ),
  },
  {
    id: "C4",
    label: "Operation",
    validate: validateCoordinate(operationValues, "Operation"),
  },
  {
    id: "C5",
    label: "Premise challenged",
    validate: validatePremise,
  },
  {
    id: "C6",
    label: "Transformation trace",
    validate: validateTransformationTrace,
  },
  {
    id: "C7",
    label: "Thesis claim",
    validate: validateClaim,
  },
  {
    id: "C8",
    label: "New testable prediction",
    validate: validatePrediction,
  },
  {
    id: "C9",
    label: "New discriminator",
    validate: validateDiscriminator,
  },
  {
    id: "C10",
    label: "Nearest prior / novelty delta",
    warn: (value: string) =>
      /\bUNVERIFIED\b/i.test(value)
        ? "UNVERIFIED is explicit; verify the nearest prior before selection"
        : undefined,
  },
  {
    id: "C11",
    label: "Frame update flag",
    validate: validateFrameUpdate,
  },
  {
    id: "C12",
    label: "Status",
    validate: (value: string) =>
      value === "CANDIDATE"
        ? undefined
        : "Status must be exactly CANDIDATE; this floor does not certify a thesis",
  },
] satisfies readonly Gate[];

function normalizeCandidateId(value: string): string {
  return value.trim().replace(/^\[/, "").replace(/\]$/, "");
}

function candidateSections(text: string): readonly CandidateSection[] {
  const lines = text.split("\n");
  const starts: { id: string; line: number }[] = [];
  const heading =
    /^\s*#{1,6}\s+Candidate(?:\s+\[([^\]]+)\]|\s+(.+?))\s*$/i;

  for (const [line, value] of lines.entries()) {
    const match = value.match(heading);
    if (match === null) continue;
    const rawId = match[1] ?? match[2] ?? `candidate-${starts.length + 1}`;
    starts.push({ id: normalizeCandidateId(rawId), line });
  }

  if (starts.length === 0) return [{ body: text, id: "single" }];

  return starts.map((start, index) => {
    const next = starts[index + 1];
    const end = next?.line ?? lines.length;
    return {
      body: lines.slice(start.line + 1, end).join("\n"),
      id: start.id,
    };
  });
}

function validateCandidate(
  section: CandidateSection,
  report: Reporter,
): CandidateData {
  const lines = section.body.split("\n");
  const values = new Map<string, string>();

  for (const gate of candidateGates) {
    const value = readField(lines, gate.label);
    const prefix = `${section.id}/${gate.id}`;
    if (value === undefined) {
      report(prefix, "MISSING", `${gate.label}: required field not found`);
      continue;
    }
    values.set(gate.label, value);
    if (placeholder(value)) {
      report(prefix, "FAIL", `${gate.label}: value is blank or a placeholder`);
      continue;
    }
    const failure = gate.validate?.(value);
    if (failure !== undefined) {
      report(prefix, "FAIL", failure);
      continue;
    }
    const warning = gate.warn?.(value);
    if (warning !== undefined) {
      report(prefix, "WARN", `${gate.label}: ${warning}`);
      continue;
    }
    report(prefix, "PASS", `${gate.label}: present`);
  }

  return {
    discriminator: values.get("New discriminator") ?? "",
    id: section.id,
    operation: values.get("Operation") ?? "",
    premise: values.get("Premise challenged") ?? "",
    target: values.get("Transformation target") ?? "",
  };
}

function preciseExemption(value: string): boolean {
  if (!/^EXEMPT\s*(?:—|–|:|\s-\s)\s*\S/i.test(value)) return false;
  return value.length >= 32 && !placeholder(value);
}

function normalizedCoordinate(value: string): string {
  return coordinateParts(value)?.token ?? value.trim().toUpperCase();
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function validateBatch(
  text: string,
  candidates: readonly CandidateData[],
  report: Reporter,
): void {
  const lines = text.split("\n");
  const requestedRaw = readField(lines, "Requested candidate count");
  const requested =
    requestedRaw !== undefined && /^[1-9]\d*$/.test(requestedRaw)
      ? Number(requestedRaw)
      : undefined;

  if (requested === undefined) {
    report(
      "B1",
      requestedRaw === undefined ? "MISSING" : "FAIL",
      "Requested candidate count must be a positive integer",
    );
  } else if (candidates.length < requested) {
    report(
      "B1",
      "FAIL",
      `Batch returned ${candidates.length} candidates for ${requested} requested`,
    );
  } else {
    report("B1", "PASS", `Requested candidate count: ${requested}`);
  }

  const ids = new Set(candidates.map((candidate) => candidate.id));
  if (ids.size !== candidates.length) {
    report("B2", "FAIL", "Candidate IDs must be unique within a batch");
  } else {
    report("B2", "PASS", "Candidate IDs are unique");
  }

  const groundedIdRaw = readField(lines, "Grounded control candidate");
  const groundedId =
    groundedIdRaw === undefined
      ? undefined
      : normalizeCandidateId(groundedIdRaw);
  const groundedCandidate = candidates.find(
    (candidate) => candidate.id === groundedId,
  );
  if (groundedId === undefined) {
    report("B3", "MISSING", "Grounded control candidate is required");
  } else if (groundedCandidate === undefined) {
    report("B3", "FAIL", `Grounded control candidate ${groundedId} not found`);
  } else if (groundedCandidate.premise !== groundedControl) {
    report(
      "B3",
      "FAIL",
      `Grounded control ${groundedId} must use exactly ${groundedControl}`,
    );
  } else {
    report("B3", "PASS", `Grounded control candidate: ${groundedId}`);
  }

  const antiDefaultRaw = readField(
    lines,
    "Premise-breaking anti-default candidate",
  );
  const antiDefaultId =
    antiDefaultRaw === undefined
      ? undefined
      : normalizeCandidateId(antiDefaultRaw);
  const antiDefault = candidates.find(
    (candidate) => candidate.id === antiDefaultId,
  );
  const exemption = readField(lines, "Anti-default EXEMPT");
  let exemptionAccepted = false;

  if (antiDefaultId !== undefined && exemption !== undefined) {
    report(
      "B4",
      "FAIL",
      "Use an anti-default candidate or Anti-default EXEMPT, not both",
    );
  } else if (antiDefaultId === undefined && exemption === undefined) {
    report(
      "B4",
      "MISSING",
      "Premise-breaking anti-default candidate or precise EXEMPT is required",
    );
  } else if (antiDefaultId !== undefined && antiDefault === undefined) {
    report("B4", "FAIL", `Anti-default candidate ${antiDefaultId} not found`);
  } else if (antiDefault !== undefined && antiDefault.premise === groundedControl) {
    report(
      "B4",
      "FAIL",
      `Anti-default candidate ${antiDefault.id} must challenge a specific premise`,
    );
  } else if (antiDefault !== undefined) {
    report("B4", "PASS", `Premise-breaking anti-default: ${antiDefault.id}`);
  } else if (exemption !== undefined && preciseExemption(exemption)) {
    exemptionAccepted = true;
    report(
      "B4",
      "WARN",
      "Anti-default EXEMPT is mechanically specific; legitimacy still needs judgment",
    );
  } else {
    report(
      "B4",
      "FAIL",
      "Anti-default EXEMPT must name a precise reason after EXEMPT —",
    );
  }

  const recovery = readField(lines, "Collapse recovery");
  if (recovery === undefined) {
    report("B5", "MISSING", "Collapse recovery rule is required");
  } else if (recovery !== collapseRecovery) {
    report(
      "B5",
      "FAIL",
      `Collapse recovery must be exactly: ${collapseRecovery}`,
    );
  } else {
    report("B5", "PASS", "Collapse recovery is bounded to one attempt");
  }

  const completeCoordinates = candidates.filter(
    (candidate) =>
      candidate.premise !== "" &&
      candidate.target !== "" &&
      candidate.operation !== "" &&
      candidate.discriminator !== "",
  );
  if (completeCoordinates.length !== candidates.length) {
    report(
      "B6",
      "FAIL",
      "Coverage matrix cannot be derived until every candidate has all coordinate fields",
    );
    return;
  }

  const premises = new Set(
    candidates.map((candidate) => normalizedText(candidate.premise)),
  );
  const targets = new Set(
    candidates.map((candidate) => normalizedCoordinate(candidate.target)),
  );
  const discriminators = new Set(
    candidates.map((candidate) => normalizedText(candidate.discriminator)),
  );
  const cells = new Set(
    candidates.map((candidate) =>
      [
        normalizedText(candidate.premise),
        normalizedCoordinate(candidate.target),
        normalizedCoordinate(candidate.operation),
        normalizedText(candidate.discriminator),
      ].join(" × "),
    ),
  );

  if (premises.size === 1 && !exemptionAccepted) {
    report("B6P", "FAIL", "All candidates share one challenged premise");
  } else if (premises.size === 1) {
    report(
      "B6P",
      "WARN",
      "Premise coverage is exempted; semantic dedup may still force COVERAGE GAP",
    );
  } else {
    report("B6P", "PASS", `${premises.size} premise cells occupied`);
  }

  if (targets.size === 1) {
    report("B6T", "FAIL", "All candidates share one transformation target");
  } else {
    report("B6T", "PASS", `${targets.size} target cells occupied`);
  }

  if (discriminators.size === 1) {
    report("B6D", "FAIL", "All candidates share one discriminator");
  } else {
    report(
      "B6D",
      "PASS",
      `${discriminators.size} discriminator cells occupied`,
    );
  }

  const minimumUnique = Math.min(3, requested ?? candidates.length);
  if (cells.size < minimumUnique) {
    report(
      "B7",
      "FAIL",
      `Coverage has ${cells.size} unique cells; minimum is ${minimumUnique}`,
    );
  } else {
    report(
      "B7",
      "PASS",
      `Coverage has ${cells.size} unique premise×target×operation×discriminator cells`,
    );
  }

  for (const candidate of candidates) {
    process.stdout.write(
      `MATRIX  ${candidate.id}  premise=${candidate.premise} | target=${normalizedCoordinate(candidate.target)} | operation=${normalizedCoordinate(candidate.operation)} | discriminator=${candidate.discriminator}\n`,
    );
  }
}

async function input(): Promise<string> {
  const parsed = typeFlag({}, Bun.argv.slice(2), {
    ignore: rejectUnknownFlag,
  });
  const unknownFlag = Object.keys(parsed.unknownFlags)[0];
  if (unknownFlag !== undefined) {
    throw new Error(`unknown option '--${unknownFlag}'`);
  }
  const [path, ...extra] = parsed._;
  if (extra.length > 0) {
    throw new Error("usage: bun gate-check.ts [candidate.md|-]");
  }
  if (path === undefined || path === "-") {
    return new Response(Bun.stdin.stream()).text();
  }
  if (!existsSync(path)) throw new Error(`gate-check: file not found: ${path}`);
  return Bun.file(path).text();
}

async function main(): Promise<void> {
  const text = await input();
  const sections = candidateSections(text);
  let failures = 0;
  let warnings = 0;
  const report: Reporter = (id, severity, message) => {
    process.stdout.write(`${id}  ${severity.padEnd(7)}  ${message}\n`);
    if (severity === "FAIL" || severity === "MISSING") failures += 1;
    if (severity === "WARN") warnings += 1;
  };

  const candidates = sections.map((section) =>
    validateCandidate(section, report),
  );
  const batch =
    sections.length >= 2 ||
    /^\s*#{1,6}\s+Batch contract\s*$/im.test(text) ||
    readField(text.split("\n"), "Requested candidate count") !== undefined;
  if (batch) validateBatch(text, candidates, report);

  process.stdout.write("----\n");
  process.stdout.write(
    `${batch ? "candidate batch" : "candidate packet"}: FAIL=${failures} WARN=${warnings} (structural/mechanical floor only; does not establish novelty, value, or truth)\n`,
  );
  if (failures > 0) {
    process.stdout.write(
      "→ Repair failed fields or coverage before comparison, selection, or testing.\n",
    );
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
