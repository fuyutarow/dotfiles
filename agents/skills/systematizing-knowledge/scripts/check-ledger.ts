/**
 * Consumer: an agent or human maintaining a systematizing-knowledge JSONL claim ledger.
 * Contract: check structural provenance and reference integrity only; never judge semantic truth.
 */

import { existsSync } from "node:fs";
import { cli } from "cleye";
import { jsonText, z } from "../../../hooks/zod.ts";

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

const claimTypes = new Set([
  "definition",
  "empirical",
  "methodological",
  "open-question",
  "synthesis",
  "theoretical",
]);
const sourceClaimTypes = new Set([
  "definition",
  "empirical",
  "methodological",
  "theoretical",
]);
const assessmentStatuses = new Set([
  "not-comparable",
  "supported",
  "supported-with-limitations",
  "uncertain",
  "unsupported",
]);
const relationTypes = new Set([
  "conflicts",
  "extends",
  "not-comparable",
  "qualifies",
  "supports",
]);

type ClaimNode = {
  derivedFrom: string[];
  id: string;
  line: number;
  relationTargets: string[];
};

type FileResult = {
  claims: number;
  findings: number;
  loadBearing: number;
};

function reportRelationTarget(
  node: ClaimNode,
  target: string,
  nodes: Map<string, ClaimNode>,
  report: (line: number, message: string) => void,
): void {
  if (target === node.id) {
    report(node.line, `relation target must reference another row: ${node.id}`);
  } else if (!nodes.has(target)) {
    report(node.line, `unresolved relation target: ${node.id} -> ${target}`);
  }
}

const RecordSchema = z.record(z.string(), z.unknown());
const NonemptyStringSchema = z.string().refine((text) => text.trim().length > 0);

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  const parsed = RecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const nonemptyString = (value: unknown): string | undefined => {
  const parsed = NonemptyStringSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
};

const messageFrom = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const stringArray = (
  value: unknown,
  field: string,
  report: (message: string) => void,
): string[] => {
  if (!Array.isArray(value)) {
    report(`${field} must be an array of strings`);
    return [];
  }

  const values: string[] = [];
  for (const item of value) {
    const text = nonemptyString(item);
    if (text === undefined) {
      report(`${field} must contain only non-empty strings`);
      continue;
    }
    values.push(text);
  }
  return values;
};

const validateSources = (
  value: unknown,
  report: (message: string) => void,
): number => {
  if (!Array.isArray(value)) {
    report("sources must be an array");
    return 0;
  }

  let validSources = 0;
  for (const [index, source] of value.entries()) {
    const sourceRecord = asRecord(source);
    if (sourceRecord === undefined) {
      report(`sources[${index}] must be an object`);
      continue;
    }

    let valid = true;
    if (nonemptyString(sourceRecord.source_id) === undefined) {
      report(`sources[${index}].source_id must be a non-empty string`);
      valid = false;
    }
    if (nonemptyString(sourceRecord.locator) === undefined) {
      report(`sources[${index}].locator must be a non-empty string`);
      valid = false;
    }
    if (
      sourceRecord.role !== undefined &&
      nonemptyString(sourceRecord.role) === undefined
    ) {
      report(`sources[${index}].role must be a non-empty string when present`);
    }
    if (valid) {
      validSources += 1;
    }
  }
  return validSources;
};

const validateAssessment = (
  value: unknown,
  required: boolean,
  report: (message: string) => void,
): void => {
  if (value === undefined) {
    if (required) {
      report("load-bearing claim requires assessment");
    }
    return;
  }
  const assessment = asRecord(value);
  if (assessment === undefined) {
    report("assessment must be an object");
    return;
  }

  const status = nonemptyString(assessment.status);
  if (status === undefined || !assessmentStatuses.has(status)) {
    report(
      `assessment.status must be one of: ${[...assessmentStatuses].join(", ")}`,
    );
  }
  if (nonemptyString(assessment.basis) === undefined) {
    report("assessment.basis must be a non-empty string");
  }
  if (!Array.isArray(assessment.limitations)) {
    report("assessment.limitations must be an array of strings");
    return;
  }
  if (
    !assessment.limitations.every((item) => nonemptyString(item) !== undefined)
  ) {
    report("assessment.limitations must contain only non-empty strings");
  }
};

const validateRelations = (
  value: unknown,
  report: (message: string) => void,
): string[] => {
  if (!Array.isArray(value)) {
    report("relations must be an array");
    return [];
  }

  const targets: string[] = [];
  for (const [index, relation] of value.entries()) {
    const relationRecord = asRecord(relation);
    if (relationRecord === undefined) {
      report(`relations[${index}] must be an object`);
      continue;
    }
    const target = nonemptyString(relationRecord.target);
    if (target === undefined) {
      report(`relations[${index}].target must be a non-empty string`);
    } else {
      targets.push(target);
    }
    const relationType = nonemptyString(relationRecord.type);
    if (relationType === undefined || !relationTypes.has(relationType)) {
      report(
        `relations[${index}].type must be one of: ${[...relationTypes].join(", ")}`,
      );
    }
    if (nonemptyString(relationRecord.basis) === undefined) {
      report(`relations[${index}].basis must be a non-empty string`);
    }
  }
  return targets;
};

function reportCycle(
  dependency: string,
  stack: readonly { dependencyIndex: number; id: string }[],
  activeIndexes: Map<string, number>,
  nodes: Map<string, ClaimNode>,
  reported: Set<string>,
  report: (line: number, message: string) => void,
): void {
  const cycleStart = activeIndexes.get(dependency) ?? 0;
  const cycle = [...stack.slice(cycleStart).map((item) => item.id), dependency];
  const key = [...new Set(cycle)].toSorted().join("|");
  if (reported.has(key)) return;
  const node = nodes.get(dependency);
  report(node?.line ?? 1, `derivation cycle: ${cycle.join(" -> ")}`);
  reported.add(key);
}

function visitDependencies(
  start: string,
  nodes: Map<string, ClaimNode>,
  states: Map<string, "visiting" | "visited">,
  reported: Set<string>,
  report: (line: number, message: string) => void,
): void {
  const stack = [{ dependencyIndex: 0, id: start }];
  const activeIndexes = new Map([[start, 0]]);
  states.set(start, "visiting");

  while (stack.length > 0) {
    const frame = stack.at(-1) ?? { dependencyIndex: 0, id: "" };
    const dependencies = nodes.get(frame.id)?.derivedFrom ?? [];
    if (frame.dependencyIndex >= dependencies.length) {
      states.set(frame.id, "visited");
      activeIndexes.delete(frame.id);
      stack.pop();
      continue;
    }

    const dependency = dependencies[frame.dependencyIndex];
    frame.dependencyIndex += 1;
    if (dependency === undefined || !nodes.has(dependency)) continue;

    const state = states.get(dependency);
    if (state === "visited") continue;
    if (state === "visiting") {
      reportCycle(dependency, stack, activeIndexes, nodes, reported, report);
      continue;
    }

    activeIndexes.set(dependency, stack.length);
    states.set(dependency, "visiting");
    stack.push({ dependencyIndex: 0, id: dependency });
  }
}

const findCycles = (
  nodes: Map<string, ClaimNode>,
  report: (line: number, message: string) => void,
): void => {
  const states = new Map<string, "visiting" | "visited">();
  const reported = new Set<string>();
  for (const start of nodes.keys()) {
    if (states.has(start)) continue;
    visitDependencies(start, nodes, states, reported, report);
  }
};

const checkFile = async (path: string): Promise<FileResult> => {
  const lines = (await Bun.file(path).text()).split(/\r?\n/u);
  const nodes = new Map<string, ClaimNode>();
  let findings = 0;
  let loadBearing = 0;

  const report = (line: number, message: string): void => {
    findings += 1;
    process.stdout.write(`FAIL ${path}:${line}: ${message}\n`);
  };

  for (const [index, rawLine] of lines.entries()) {
    const line = index + 1;
    if (rawLine.trim().length === 0) {
      continue;
    }

    const decoded = jsonText.safeParse(rawLine);
    if (!decoded.success) {
      report(line, "invalid JSON");
      continue;
    }

    const row = asRecord(decoded.data);
    if (row === undefined) {
      report(line, "row must be a JSON object");
      continue;
    }

    const rowReport = (message: string): void =>{  report(line, message); };
    const claimId = nonemptyString(row.claim_id);
    if (claimId === undefined) {
      rowReport("claim_id must be a non-empty string");
      continue;
    }
    if (nodes.has(claimId)) {
      rowReport(`duplicate claim_id: ${claimId}`);
      continue;
    }

    if (nonemptyString(row.claim) === undefined) {
      rowReport("claim must be a non-empty string");
    }
    if (nonemptyString(row.scope) === undefined) {
      rowReport("scope must be a non-empty string");
    }
    if (typeof row.load_bearing !== "boolean") {
      rowReport("load_bearing must be a boolean");
    }
    const claimType = nonemptyString(row.claim_type);
    if (claimType === undefined || !claimTypes.has(claimType)) {
      rowReport(`claim_type must be one of: ${[...claimTypes].join(", ")}`);
    }

    const validSourceCount = validateSources(row.sources, rowReport);
    const derivedFrom = stringArray(row.derived_from, "derived_from", rowReport);
    const relationTargets = validateRelations(row.relations, rowReport);
    const isLoadBearing = row.load_bearing === true;
    if (isLoadBearing) {
      loadBearing += 1;
    }
    validateAssessment(row.assessment, isLoadBearing, rowReport);

    if (
      claimType !== undefined &&
      sourceClaimTypes.has(claimType) &&
      validSourceCount === 0
    ) {
      rowReport(`${claimType} claim requires at least one source`);
    }
    if (
      (claimType === "synthesis" || claimType === "open-question") &&
      validSourceCount === 0 &&
      derivedFrom.length === 0
    ) {
      rowReport(`${claimType} claim requires a source or derived_from claim`);
    }

    nodes.set(claimId, {
      derivedFrom,
      id: claimId,
      line,
      relationTargets,
    });
  }

  for (const node of nodes.values()) {
    for (const dependency of node.derivedFrom.filter((id) => !nodes.has(id)))
      report(
        node.line,
        `unresolved derived_from reference: ${node.id} -> ${dependency}`,
      );
    for (const target of node.relationTargets)
      reportRelationTarget(node, target, nodes, report);
  }

  findCycles(nodes, report);
  if (nodes.size === 0 && findings === 0) {
    report(1, "ledger contains no claims");
  }

  if (findings === 0) {
    process.stdout.write(
      `PASS ${path}: claims=${nodes.size} load-bearing=${loadBearing}\n`,
    );
  }

  return {
    claims: nodes.size,
    findings,
    loadBearing,
  };
};

const main = async (): Promise<void> => {
  const parsed = cli(
    {
      name: "check-ledger.ts",
      parameters: ["<claimsJsonl>"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length !== 1) {
    throw new Error("check-ledger.ts accepts exactly one claims JSONL path");
  }
  const path = parsed._.claimsJsonl;
  if (!existsSync(path)) {
    throw new Error(`file not found: ${path}`);
  }

  const result = await checkFile(path);

  if (result.findings > 0) {
    process.stdout.write(`RESULT: FAIL findings=${result.findings}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`RESULT: PASS claims=${result.claims}\n`);
};

await main().catch((error: unknown) => {
  process.stderr.write(`check-ledger: ${messageFrom(error)}\n`);
  process.exitCode = 2;
});
