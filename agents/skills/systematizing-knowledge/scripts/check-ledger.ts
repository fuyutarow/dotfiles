/**
 * Consumer: an agent or human maintaining a systematizing-knowledge JSONL claim ledger.
 * Contract: check structural provenance and reference integrity only; never judge semantic truth.
 */

import { existsSync } from "node:fs";
import { cli } from "cleye";

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonemptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

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
    if (!isNonemptyString(item)) {
      report(`${field} must contain only non-empty strings`);
      continue;
    }
    values.push(item);
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
    if (!isRecord(source)) {
      report(`sources[${index}] must be an object`);
      continue;
    }

    let valid = true;
    if (!isNonemptyString(source.source_id)) {
      report(`sources[${index}].source_id must be a non-empty string`);
      valid = false;
    }
    if (!isNonemptyString(source.locator)) {
      report(`sources[${index}].locator must be a non-empty string`);
      valid = false;
    }
    if (source.role !== undefined && !isNonemptyString(source.role)) {
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
  if (!isRecord(value)) {
    report("assessment must be an object");
    return;
  }

  if (
    !isNonemptyString(value.status) ||
    !assessmentStatuses.has(value.status)
  ) {
    report(
      `assessment.status must be one of: ${[...assessmentStatuses].join(", ")}`,
    );
  }
  if (!isNonemptyString(value.basis)) {
    report("assessment.basis must be a non-empty string");
  }
  if (!Array.isArray(value.limitations)) {
    report("assessment.limitations must be an array of strings");
    return;
  }
  if (!value.limitations.every(isNonemptyString)) {
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
    if (!isRecord(relation)) {
      report(`relations[${index}] must be an object`);
      continue;
    }
    if (!isNonemptyString(relation.target)) {
      report(`relations[${index}].target must be a non-empty string`);
    } else {
      targets.push(relation.target);
    }
    if (!isNonemptyString(relation.type) || !relationTypes.has(relation.type)) {
      report(
        `relations[${index}].type must be one of: ${[...relationTypes].join(", ")}`,
      );
    }
    if (!isNonemptyString(relation.basis)) {
      report(`relations[${index}].basis must be a non-empty string`);
    }
  }
  return targets;
};

const findCycles = (
  nodes: Map<string, ClaimNode>,
  report: (line: number, message: string) => void,
): void => {
  const states = new Map<string, "visiting" | "visited">();
  const reported = new Set<string>();

  for (const start of nodes.keys()) {
    if (states.has(start)) {
      continue;
    }

    const stack = [{ dependencyIndex: 0, id: start }];
    const activeIndexes = new Map([[start, 0]]);
    states.set(start, "visiting");

    while (stack.length > 0) {
      const frame = stack.at(-1);
      if (frame === undefined) {
        break;
      }
      const dependencies = nodes.get(frame.id)?.derivedFrom ?? [];
      if (frame.dependencyIndex >= dependencies.length) {
        states.set(frame.id, "visited");
        activeIndexes.delete(frame.id);
        stack.pop();
        continue;
      }

      const dependency = dependencies[frame.dependencyIndex];
      frame.dependencyIndex += 1;
      if (dependency === undefined || !nodes.has(dependency)) {
        continue;
      }

      const state = states.get(dependency);
      if (state === "visited") {
        continue;
      }
      if (state === "visiting") {
        const cycleStart = activeIndexes.get(dependency) ?? 0;
        const cycle = [
          ...stack.slice(cycleStart).map((item) => item.id),
          dependency,
        ];
        const key = [...new Set(cycle)].sort().join("|");
        if (!reported.has(key)) {
          const node = nodes.get(dependency);
          report(node?.line ?? 1, `derivation cycle: ${cycle.join(" -> ")}`);
          reported.add(key);
        }
        continue;
      }

      activeIndexes.set(dependency, stack.length);
      states.set(dependency, "visiting");
      stack.push({ dependencyIndex: 0, id: dependency });
    }
  }
};

const checkFile = async (path: string): Promise<FileResult> => {
  const lines = (await Bun.file(path).text()).split(/\r?\n/);
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

    let value: unknown;
    try {
      value = JSON.parse(rawLine);
    } catch {
      report(line, "invalid JSON");
      continue;
    }

    if (!isRecord(value)) {
      report(line, "row must be a JSON object");
      continue;
    }

    const rowReport = (message: string): void => report(line, message);
    if (!isNonemptyString(value.claim_id)) {
      rowReport("claim_id must be a non-empty string");
      continue;
    }
    const claimId = value.claim_id;
    if (nodes.has(claimId)) {
      rowReport(`duplicate claim_id: ${claimId}`);
      continue;
    }

    if (!isNonemptyString(value.claim)) {
      rowReport("claim must be a non-empty string");
    }
    if (!isNonemptyString(value.scope)) {
      rowReport("scope must be a non-empty string");
    }
    if (typeof value.load_bearing !== "boolean") {
      rowReport("load_bearing must be a boolean");
    }
    if (
      !isNonemptyString(value.claim_type) ||
      !claimTypes.has(value.claim_type)
    ) {
      rowReport(`claim_type must be one of: ${[...claimTypes].join(", ")}`);
    }

    const validSourceCount = validateSources(value.sources, rowReport);
    const derivedFrom = stringArray(
      value.derived_from,
      "derived_from",
      rowReport,
    );
    const relationTargets = validateRelations(value.relations, rowReport);
    const isLoadBearing = value.load_bearing === true;
    if (isLoadBearing) {
      loadBearing += 1;
    }
    validateAssessment(value.assessment, isLoadBearing, rowReport);

    if (
      isNonemptyString(value.claim_type) &&
      sourceClaimTypes.has(value.claim_type) &&
      validSourceCount === 0
    ) {
      rowReport(`${value.claim_type} claim requires at least one source`);
    }
    if (
      (value.claim_type === "synthesis" ||
        value.claim_type === "open-question") &&
      validSourceCount === 0 &&
      derivedFrom.length === 0
    ) {
      rowReport(
        `${value.claim_type} claim requires a source or derived_from claim`,
      );
    }

    nodes.set(claimId, {
      derivedFrom,
      id: claimId,
      line,
      relationTargets,
    });
  }

  for (const node of nodes.values()) {
    for (const dependency of node.derivedFrom) {
      if (!nodes.has(dependency)) {
        report(
          node.line,
          `unresolved derived_from reference: ${node.id} -> ${dependency}`,
        );
      }
    }
    for (const target of node.relationTargets) {
      if (target === node.id) {
        report(
          node.line,
          `relation target must reference another row: ${node.id}`,
        );
      } else if (!nodes.has(target)) {
        report(
          node.line,
          `unresolved relation target: ${node.id} -> ${target}`,
        );
      }
    }
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

main().catch((error: unknown) => {
  process.stderr.write(`check-ledger: ${messageFrom(error)}\n`);
  process.exitCode = 2;
});
