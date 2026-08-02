import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { cli } from "cleye";

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
const donorCheckPath = resolvePath(
	import.meta.dir,
	"../../systematizing-knowledge/scripts/check-donor-set.ts",
);

type Severity = "PASS" | "WARN" | "FAIL" | "MISSING";

type Reporter = (id: string, severity: Severity, message: string) => void;

type ArtifactSection = Readonly<{
	body: string;
	id: string;
	kind: "candidate" | "mapping-break";
}>;

type CandidateData = Readonly<{
	discriminator: string;
	id: string;
	operation: string;
	premise: string;
	target: string;
	transferAttemptId?: string;
}>;

type MappingBreakData = Readonly<{
	id: string;
	transferAttemptId?: string;
}>;

type Input = Readonly<{
	donorSetPath?: string;
	text: string;
}>;

type FrozenReference = Readonly<{
	digest: string;
	path: string;
}>;

type Gate = Readonly<{
	id: string;
	label: string;
	validate?: (value: string) => string | undefined;
	warn?: (value: string) => string | undefined;
}>;

function rejectPrototypeFlag(
	type: "known-flag" | "unknown-flag" | "argument",
	flag: string,
): void {
	if (type === "unknown-flag" && flag === "__proto__") {
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

function readField(
	lines: readonly string[],
	label: string,
): string | undefined {
	const pattern = fieldPattern(label);
	const line = lines.find((candidate) => pattern.test(candidate));
	return line === undefined ? undefined : valueAfterColon(line);
}

function duplicateFields(
	lines: readonly string[],
	labels: readonly string[],
): readonly string[] {
	return [...new Set(labels)].filter((label) => {
		const pattern = fieldPattern(label);
		return lines.filter((line) => pattern.test(line)).length > 1;
	});
}

function placeholder(value: string): boolean {
	return (
		value === "" ||
		/\[\.\.\.\]|\[…\]|\[ *\]/.test(value) ||
		/^(未回答|未記入|未定|TBD|N\/?A|NA|-|—|ー|―|\?+)$/i.test(value)
	);
}

function located(value: string): boolean {
	const fileLine =
		/(?:^|\s)[\w./-]+\.(?:md|txt|json|csv|pdf):\d+(?:-\d+)?\b/i.test(value);
	const externalSource = /\bdoi:\S+|https?:\/\/\S+/i.test(value);
	const externalAnchor =
		/#[A-Za-z0-9._:-]+|\b(?:p{1,2}\.\s*|p{1,2}\s+|pages?\s+|§\s*|section\s+|table\s+|figure\s+|fig\.\s*)[A-Za-z0-9.-]+/i.test(
			value,
		);
	return fileLine || (externalSource && externalAnchor);
}

function sameResolvedFile(first: string, second: string): boolean {
	if (!existsSync(first) || !existsSync(second)) return false;
	return realpathSync(first) === realpathSync(second);
}

function stableId(value: string): boolean {
	return /^[A-Za-z][A-Za-z0-9._-]*$/.test(value);
}

function commaSeparatedIds(value: string): readonly string[] | undefined {
	const ids = value
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id !== "");
	if (ids.length === 0 || ids.some((id) => !stableId(id))) return undefined;
	return ids;
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

function validateDonorSet(value: string): string | undefined {
	return frozenReference(value) === undefined
		? "Donor set must use path=<locus>; sha256=<64 lowercase hex>"
		: undefined;
}

function frozenReference(value: string): FrozenReference | undefined {
	const match = value.match(/^path=(\S.+?)\s*;\s*sha256=([a-f0-9]{64})$/);
	const path = match?.[1]?.trim();
	const digest = match?.[2];
	if (path === undefined || digest === undefined || path.length < 3) {
		return undefined;
	}
	return { digest, path };
}

function validateDonorIds(value: string): string | undefined {
	const ids = commaSeparatedIds(value);
	if (ids === undefined)
		return "Donor IDs must be a comma-separated stable ID list";
	if (new Set(ids).size !== ids.length) return "Donor IDs must be unique";
	return undefined;
}

function validateSourceComparison(value: string): string | undefined {
	if (/^SINGLE-DONOR LIMIT\s*(?:—|–|:|\s-\s)/.test(value)) {
		if (
			/hypothesis seed/i.test(value) &&
			/no abstract schema|not (?:an? )?schema/i.test(value) &&
			/no(?: [^;,.]+)? target transport|target transport.*not established/i.test(
				value,
			)
		) {
			return undefined;
		}
		return "SINGLE-DONOR LIMIT must retain hypothesis-seed, no-schema, and no-target-transport limits";
	}
	if (
		/compar(?:e|ed|ison)|common relation|共通.*関係|比較/i.test(value) &&
		value.length >= 32
	) {
		return undefined;
	}
	return "Source comparison must compare donors explicitly or retain SINGLE-DONOR LIMIT";
}

function validateSourceRelation(value: string): string | undefined {
	if (!located(value))
		return "Source relation / locator needs an exact source locus";
	if (value.length < 32) return "Source relation / locator is too vague to map";
	return undefined;
}

function validateCorrespondence(value: string): string | undefined {
	const pairs = value
		.split(/\s*;\s*/)
		.filter((part) => /(?:=|->|→)/.test(part));
	if (pairs.length < 2) {
		return "Correspondence map needs at least two explicit source-role to target-role pairs";
	}
	return undefined;
}

function validatePreservedRelation(value: string): string | undefined {
	if (value.length < 24 || /^(?:everything|all|same|identical)$/i.test(value)) {
		return "Preserved relation must name the bounded relation, not claim universal identity";
	}
	return undefined;
}

function validateNonCorrespondence(value: string): string | undefined {
	if (
		value.length < 24 ||
		/^(?:none|n\/a|domains? differ|different domains?)\.?$/i.test(value)
	) {
		return "Non-correspondence must name a concrete unmapped property or constraint";
	}
	return undefined;
}

function validateTransferBoundary(value: string): string | undefined {
	if (value.length < 24) return "Transfer boundary is too vague";
	if (
		!/(?:\bwhen\b|\bif\b|\bunless\b|\bwhere\b|breaks?|fails?|境界|場合|なら|とき|破綻|失敗)/i.test(
			value,
		)
	) {
		return "Transfer boundary must state the condition under which the mapping breaks";
	}
	return undefined;
}

function validatePrecisionLoss(value: string): string | undefined {
	if (value.length < 20 || /^(?:none|n\/a|no loss)$/i.test(value)) {
		return "Precision loss must state what becomes weaker, approximate, or unidentifiable";
	}
	return undefined;
}

function validateTargetCounterexample(value: string): string | undefined {
	if (value.length < 24) return "Target-side counterexample is too vague";
	if (/donor|source[- ]domain success|worked in the source/i.test(value)) {
		return "Target-side counterexample must be target-side; donor success is not target evidence";
	}
	return undefined;
}

const transferCandidateGates = [
	{
		id: "T1",
		label: "Transfer attempt ID",
		validate: (value: string) =>
			stableId(value) ? undefined : "Transfer attempt ID must be a stable ID",
	},
	{ id: "T2", label: "Donor set", validate: validateDonorSet },
	{ id: "T3", label: "Donor IDs", validate: validateDonorIds },
	{ id: "T4", label: "Source comparison", validate: validateSourceComparison },
	{
		id: "T5",
		label: "Source relation / locator",
		validate: validateSourceRelation,
	},
	{
		id: "T6",
		label: "Target relation before transfer",
		validate: (value: string) =>
			value.length >= 20
				? undefined
				: "Target relation before transfer is too vague",
	},
	{ id: "T7", label: "Correspondence map", validate: validateCorrespondence },
	{
		id: "T8",
		label: "Preserved relation",
		validate: validatePreservedRelation,
	},
	{
		id: "T9",
		label: "Non-correspondence",
		validate: validateNonCorrespondence,
	},
	{ id: "T10", label: "Transfer boundary", validate: validateTransferBoundary },
	{ id: "T11", label: "Precision loss", validate: validatePrecisionLoss },
	{
		id: "T12",
		label: "Target-side evidence",
		validate: (value: string) =>
			value === "UNTESTED"
				? undefined
				: "candidate-stage target-side evidence must be exactly UNTESTED; donor success is not target evidence",
	},
	{
		id: "T13",
		label: "Target-side counterexample",
		validate: validateTargetCounterexample,
	},
] satisfies readonly Gate[];

const mappingBreakGates = [
	{
		id: "M1",
		label: "Transfer attempt ID",
		validate: (value: string) =>
			stableId(value) ? undefined : "Transfer attempt ID must be a stable ID",
	},
	{ id: "M2", label: "Input problem/frame" },
	{ id: "M3", label: "Donor set", validate: validateDonorSet },
	{ id: "M4", label: "Donor IDs", validate: validateDonorIds },
	{ id: "M5", label: "Source comparison", validate: validateSourceComparison },
	{
		id: "M6",
		label: "Source relation / locator",
		validate: validateSourceRelation,
	},
	{
		id: "M7",
		label: "Target relation before transfer",
		validate: (value: string) =>
			value.length >= 20
				? undefined
				: "Target relation before transfer is too vague",
	},
	{
		id: "M8",
		label: "Attempted correspondence",
		validate: validateCorrespondence,
	},
	{
		id: "M9",
		label: "Non-correspondence axis",
		validate: (value: string) =>
			/^(?:OBJECT|RELATION|REPRESENTATION|REGIME|EVIDENCE|CONSTRAINT|OTHER)\s*(?:—|–|:|\s-\s)\s*\S.+$/.test(
				value,
			)
				? undefined
				: "MAPPING-BREAK requires a typed non-correspondence and concrete mismatch",
	},
	{
		id: "M10",
		label: "Failed invariant",
		validate: (value: string) =>
			value.length >= 24
				? undefined
				: "Failed invariant must name what relation could not be preserved",
	},
	{ id: "M11", label: "Transfer boundary", validate: validateTransferBoundary },
	{
		id: "M12",
		label: "Evidence / locator",
		validate: (value: string) =>
			located(value)
				? undefined
				: "Evidence / locator must cite the source relation and target mismatch",
	},
	{
		id: "M13",
		label: "Handoff",
		validate: (value: string) =>
			/directing-research/i.test(value) &&
			/TRANSFER DISPOSITION|denominator|preserv/i.test(value) &&
			!/\b(?:ADOPT|RETIRE|TEST|REOPEN)\b/.test(value)
				? undefined
				: "MAPPING-BREAK handoff must preserve the attempt for directing-research without deciding its disposition",
	},
	{
		id: "M14",
		label: "Status",
		validate: (value: string) =>
			value === "MAPPING-BREAK"
				? undefined
				: "Status must be exactly MAPPING-BREAK",
	},
] satisfies readonly Gate[];

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

function artifactSections(text: string): readonly ArtifactSection[] {
	const lines = text.split("\n");
	const starts: {
		id: string;
		kind: "candidate" | "mapping-break";
		line: number;
	}[] = [];
	const heading =
		/^\s*##\s+(Candidate|MAPPING-BREAK)(?:\s+\[([^\]]+)\]|\s+(.+?))\s*$/i;

	for (const [line, value] of lines.entries()) {
		const match = value.match(heading);
		if (match === null) continue;
		const kind =
			match[1]?.toUpperCase() === "MAPPING-BREAK"
				? "mapping-break"
				: "candidate";
		const rawId = match[2] ?? match[3] ?? `${kind}-${starts.length + 1}`;
		starts.push({ id: normalizeCandidateId(rawId), kind, line });
	}

	if (starts.length === 0) {
		return [{ body: text, id: "single", kind: "candidate" }];
	}

	return starts.map((start) => {
		const boundaryOffset = lines
			.slice(start.line + 1)
			.findIndex((line) => /^\s*#{1,6}\s+/.test(line));
		const end =
			boundaryOffset === -1 ? lines.length : start.line + 1 + boundaryOffset;
		return {
			body: lines.slice(start.line + 1, end).join("\n"),
			id: start.id,
			kind: start.kind,
		};
	});
}

function validateCandidate(
	section: ArtifactSection,
	report: Reporter,
): CandidateData {
	const lines = section.body.split("\n");
	const values = new Map<string, string>();
	for (const label of duplicateFields(lines, [
		...candidateGates.map((gate) => gate.label),
		...transferCandidateGates.map((gate) => gate.label),
	])) {
		report(
			`${section.id}/DUP`,
			"FAIL",
			`duplicate field in one candidate packet: ${label}`,
		);
	}

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

	const operation = values.get("Operation") ?? "";
	const transfer = normalizedCoordinate(operation) === "TRANSFER";
	let transferAttemptId: string | undefined;
	if (transfer) {
		for (const gate of transferCandidateGates) {
			const value = readField(lines, gate.label);
			const prefix = `${section.id}/${gate.id}`;
			if (value === undefined) {
				report(
					prefix,
					"MISSING",
					`${gate.label}: required for Operation TRANSFER`,
				);
				continue;
			}
			if (placeholder(value)) {
				report(
					prefix,
					"FAIL",
					`${gate.label}: value is blank or a placeholder`,
				);
				continue;
			}
			const failure = gate.validate?.(value);
			if (failure !== undefined) {
				report(prefix, "FAIL", failure);
				continue;
			}
			report(prefix, "PASS", `${gate.label}: present`);
			if (gate.label === "Transfer attempt ID") transferAttemptId = value;
		}

		const donorIds =
			commaSeparatedIds(readField(lines, "Donor IDs") ?? "") ?? [];
		const comparison = readField(lines, "Source comparison") ?? "";
		if (donorIds.length === 1 && !/^SINGLE-DONOR LIMIT\b/.test(comparison)) {
			report(
				`${section.id}/T14`,
				"FAIL",
				"transfer candidate must preserve the donor-set single-donor limit",
			);
		} else if (
			donorIds.length > 1 &&
			/^SINGLE-DONOR LIMIT\b/.test(comparison)
		) {
			report(
				`${section.id}/T14`,
				"FAIL",
				"SINGLE-DONOR LIMIT conflicts with multiple Donor IDs",
			);
		} else {
			report(`${section.id}/T14`, "PASS", "donor cardinality limit retained");
		}
	} else {
		const leakedTransferFields = transferCandidateGates
			.map((gate) => gate.label)
			.filter((label) => readField(lines, label) !== undefined);
		if (leakedTransferFields.length > 0) {
			report(
				`${section.id}/T0`,
				"FAIL",
				`Transfer fields require Operation: TRANSFER: ${leakedTransferFields.join(", ")}`,
			);
		}
	}

	return {
		discriminator: values.get("New discriminator") ?? "",
		id: section.id,
		operation,
		premise: values.get("Premise challenged") ?? "",
		target: values.get("Transformation target") ?? "",
		...(transferAttemptId === undefined ? {} : { transferAttemptId }),
	};
}

function validateMappingBreak(
	section: ArtifactSection,
	report: Reporter,
): MappingBreakData {
	const lines = section.body.split("\n");
	const values = new Map<string, string>();
	for (const label of duplicateFields(
		lines,
		mappingBreakGates.map((gate) => gate.label),
	)) {
		report(
			`${section.id}/DUP`,
			"FAIL",
			`duplicate field in one MAPPING-BREAK packet: ${label}`,
		);
	}
	for (const gate of mappingBreakGates) {
		const value = readField(lines, gate.label);
		const prefix = `${section.id}/${gate.id}`;
		if (value === undefined) {
			report(prefix, "MISSING", `${gate.label}: required for MAPPING-BREAK`);
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
		report(prefix, "PASS", `${gate.label}: present`);
	}

	for (const forbidden of [
		"Thesis claim",
		"New testable prediction",
		"New discriminator",
	]) {
		if (readField(lines, forbidden) !== undefined) {
			report(
				`${section.id}/M15`,
				"FAIL",
				`MAPPING-BREAK must not contain ${forbidden}; no candidate was generated`,
			);
		}
	}

	const donorIds = commaSeparatedIds(values.get("Donor IDs") ?? "") ?? [];
	const comparison = values.get("Source comparison") ?? "";
	if (donorIds.length === 1 && !/^SINGLE-DONOR LIMIT\b/.test(comparison)) {
		report(
			`${section.id}/M16`,
			"FAIL",
			"MAPPING-BREAK must preserve the donor-set single-donor limit",
		);
	} else if (donorIds.length > 1 && /^SINGLE-DONOR LIMIT\b/.test(comparison)) {
		report(
			`${section.id}/M16`,
			"FAIL",
			"SINGLE-DONOR LIMIT conflicts with multiple Donor IDs",
		);
	} else {
		report(`${section.id}/M16`, "PASS", "donor cardinality limit retained");
	}

	const transferAttemptId = values.get("Transfer attempt ID");
	return {
		id: section.id,
		...(transferAttemptId === undefined ? {} : { transferAttemptId }),
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
	} else if (
		antiDefault !== undefined &&
		antiDefault.premise === groundedControl
	) {
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

function markdownCells(line: string): readonly string[] {
	const trimmed = line.trim();
	if (!trimmed.startsWith("|")) return [];
	return trimmed
		.replace(/^\|/, "")
		.replace(/\|$/, "")
		.split("|")
		.map((cell) => cell.trim());
}

function donorRecordsFromSet(
	text: string,
): ReadonlyMap<string, string> | undefined {
	if (!/^\s*#\s+DONOR SET\s*$/im.test(text)) return undefined;
	const lines = text.split(/\r?\n/);
	const headerIndex = lines.findIndex(
		(line) => markdownCells(line)[0]?.toLowerCase() === "donor id",
	);
	if (headerIndex === -1) return undefined;

	const records = new Map<string, string>();
	for (const line of lines.slice(headerIndex + 1)) {
		if (/^\s*#{1,6}\s+/.test(line)) break;
		const cells = markdownCells(line);
		const id = cells[0];
		const locator = cells[1];
		if (cells.length === 0 || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
			continue;
		}
		if (
			id !== undefined &&
			locator !== undefined &&
			stableId(id) &&
			locator !== ""
		) {
			records.set(id, locator.replace(/\s+/g, " ").trim());
		}
	}
	return records.size === 0 ? undefined : records;
}

async function verifyFrozenDonorSet(
	sections: readonly ArtifactSection[],
	donorSetPath: string | undefined,
	report: Reporter,
): Promise<void> {
	const transferSections = sections.filter((section) => {
		if (section.kind === "mapping-break") return true;
		const operation = readField(section.body.split("\n"), "Operation") ?? "";
		return normalizedCoordinate(operation) === "TRANSFER";
	});

	if (transferSections.length === 0) {
		if (donorSetPath !== undefined) {
			report(
				"T15",
				"FAIL",
				"--donor-set was supplied but the packet contains no transfer artifact",
			);
		}
		return;
	}
	if (donorSetPath === undefined) {
		report(
			"T15",
			"FAIL",
			"transfer artifacts require --donor-set <path> for frozen-source verification",
		);
		return;
	}
	if (!existsSync(donorSetPath)) {
		throw new Error(`DONOR SET not found: ${donorSetPath}`);
	}
	if (!existsSync(donorCheckPath)) {
		throw new Error(`DONOR SET validator not found: ${donorCheckPath}`);
	}

	const bytes = await Bun.file(donorSetPath).bytes();
	const actualDigest = createHash("sha256").update(bytes).digest("hex");
	const donorText = new TextDecoder().decode(bytes);
	const upstream = Bun.spawnSync({
		cmd: ["bun", donorCheckPath, "-"],
		stderr: "pipe",
		stdin: new Blob([bytes]),
		stdout: "pipe",
		timeout: 10_000,
	});
	if (upstream.exitCode === 2) {
		throw new Error(
			`check-donor-set failed: ${upstream.stderr.toString().trim() || "fatal upstream validator error"}`,
		);
	}
	if (upstream.exitCode !== 0 && upstream.exitCode !== 1) {
		throw new Error(
			`check-donor-set could not complete (exit ${String(upstream.exitCode)}): ${upstream.stderr.toString().trim() || "upstream validator unavailable or timed out"}`,
		);
	}
	if (upstream.exitCode !== 0) {
		const findings = upstream.stdout
			.toString()
			.split(/\r?\n/)
			.filter((line) => /\s(?:FAIL|MISSING)\s/.test(line))
			.slice(0, 3)
			.join(" | ");
		report(
			"T15",
			"FAIL",
			`frozen DONOR SET failed systematizing-knowledge check${findings === "" ? "" : `: ${findings}`}`,
		);
		return;
	}

	const donorRecords = donorRecordsFromSet(donorText);
	if (donorRecords === undefined) {
		report(
			"T15",
			"FAIL",
			"frozen source is not a parseable DONOR SET with stable donor IDs",
		);
		return;
	}

	let verificationFailures = 0;
	const fail = (id: string, message: string): void => {
		verificationFailures += 1;
		report(id, "FAIL", message);
	};
	for (const section of transferSections) {
		const lines = section.body.split("\n");
		const reference = frozenReference(readField(lines, "Donor set") ?? "");
		if (reference === undefined) continue;
		if (!sameResolvedFile(reference.path, donorSetPath)) {
			fail(
				`${section.id}/T15`,
				"declared DONOR SET path does not match --donor-set",
			);
		}
		if (reference.digest !== actualDigest) {
			fail(
				`${section.id}/T16`,
				"declared DONOR SET SHA-256 does not match the frozen artifact",
			);
		}
		const declaredIds = commaSeparatedIds(readField(lines, "Donor IDs") ?? "");
		const sourceRelation = (readField(lines, "Source relation / locator") ?? "")
			.replace(/\s+/g, " ")
			.trim();
		for (const id of declaredIds ?? []) {
			const frozenLocator = donorRecords.get(id);
			if (frozenLocator === undefined) {
				fail(
					`${section.id}/T17`,
					`Donor ID ${id} is absent from the frozen DONOR SET`,
				);
			} else if (!sourceRelation.includes(frozenLocator)) {
				fail(
					`${section.id}/T18`,
					`Source relation / locator does not carry the frozen source locator for Donor ID ${id}`,
				);
			}
		}
	}

	if (verificationFailures === 0) {
		report(
			"T15",
			"PASS",
			`frozen DONOR SET verified: sha256=${actualDigest} donors=${donorRecords.size}`,
		);
	}
}

function nonEmptyString(value: string | undefined): string {
	if (value === undefined || value.trim() === "") {
		throw new Error("option requires a non-empty value");
	}
	return value;
}

async function input(): Promise<Input> {
	const parsed = cli(
		{
			name: "gate-check.ts",
			parameters: ["[candidate]"],
			flags: { donorSet: nonEmptyString },
			strictFlags: true,
			ignoreArgv: rejectPrototypeFlag,
		},
		undefined,
		Bun.argv.slice(2),
	);
	if (parsed._.length > 1) {
		throw new Error("gate-check.ts accepts at most one candidate path");
	}
	const path = parsed._.candidate;
	const donorSetPath = parsed.flags.donorSet;
	if (path === undefined || path === "-") {
		return {
			text: await new Response(Bun.stdin.stream()).text(),
			...(donorSetPath === undefined ? {} : { donorSetPath }),
		};
	}
	if (!existsSync(path)) throw new Error(`gate-check: file not found: ${path}`);
	return {
		text: await Bun.file(path).text(),
		...(donorSetPath === undefined ? {} : { donorSetPath }),
	};
}

async function main(): Promise<void> {
	const { donorSetPath, text } = await input();
	const sections = artifactSections(text);
	let failures = 0;
	let warnings = 0;
	const report: Reporter = (id, severity, message) => {
		process.stdout.write(`${id}  ${severity.padEnd(7)}  ${message}\n`);
		if (severity === "FAIL" || severity === "MISSING") failures += 1;
		if (severity === "WARN") warnings += 1;
	};

	const candidateSections = sections.filter(
		(section) => section.kind === "candidate",
	);
	const mappingBreakSections = sections.filter(
		(section) => section.kind === "mapping-break",
	);
	const candidates = candidateSections.map((section) =>
		validateCandidate(section, report),
	);
	const mappingBreaks = mappingBreakSections.map((section) =>
		validateMappingBreak(section, report),
	);
	await verifyFrozenDonorSet(sections, donorSetPath, report);

	const attempts = [
		...candidates.flatMap((candidate) =>
			candidate.transferAttemptId === undefined
				? []
				: [candidate.transferAttemptId],
		),
		...mappingBreaks.flatMap((mappingBreak) =>
			mappingBreak.transferAttemptId === undefined
				? []
				: [mappingBreak.transferAttemptId],
		),
	];
	const seenAttempts = new Set<string>();
	for (const attempt of attempts) {
		if (seenAttempts.has(attempt)) {
			report("T0", "FAIL", `duplicate transfer attempt ID: ${attempt}`);
		}
		seenAttempts.add(attempt);
	}
	if (attempts.length > 0 && attempts.length === seenAttempts.size) {
		report("T0", "PASS", `${attempts.length} unique transfer attempt IDs`);
	}

	const batch =
		candidateSections.length >= 2 ||
		/^\s*#{1,6}\s+Batch contract\s*$/im.test(text) ||
		readField(text.split("\n"), "Requested candidate count") !== undefined;
	if (batch) validateBatch(text, candidates, report);

	const packetLabel = batch
		? "candidate batch"
		: mappingBreaks.length > 0 && candidates.length > 0
			? "transfer bundle"
			: mappingBreaks.length > 0
				? "mapping-break packet"
				: candidates.some(
							(candidate) =>
								normalizedCoordinate(candidate.operation) === "TRANSFER",
						)
					? "transfer candidate packet"
					: "candidate packet";

	process.stdout.write("----\n");
	process.stdout.write(
		`${packetLabel}: FAIL=${failures} WARN=${warnings} (structural/mechanical floor only; does not establish novelty, value, target fit, or truth)\n`,
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
