/**
 * Consumer: humans/agents checking an OKF v0.2 R&D knowledge bundle before review or merge.
 * Contract: exit 0 clean, 1 deterministic findings, 2 invocation/environment fatal; never judge truth.
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	relative,
	resolve,
	sep,
} from "node:path";
import { typeFlag } from "type-flag";
import { parseDocument } from "yaml";

type Layer =
	| "OKF"
	| "RD_ADMISSION"
	| "RD_INTEGRITY"
	| "RD_LIFECYCLE"
	| "RD_REFERENCE"
	| "RD_SCHEMA";

type Mode = "okf" | "profile";
type Role = "canonical" | "evidence" | "generated_view" | "review_request";
type Status = "deprecated" | "draft" | "stable";
type ReviewState =
	| "accepted"
	| "changes_requested"
	| "open"
	| "rejected"
	| "withdrawn";

export type ResearchDocsFinding = {
	code: string;
	layer: Layer;
	message: string;
	path: string;
};

export type ResearchDocsInspection = {
	concepts: number;
	findings: ResearchDocsFinding[];
	mode: Mode;
	root: string;
};

export type ResearchDocsOptions = {
	base?: string;
	mode?: Mode;
	rawRoot?: string;
	today?: string;
};

type ParsedMarkdown = {
	body: string;
	frontmatterText?: string;
	meta?: Record<string, unknown>;
};

type SourceRef = {
	id: string;
	resource: string;
};

type EvidenceLocator =
	| { kind: "json-pointer"; tokens: string[] }
	| { end: number; kind: "line"; start: number }
	| { kind: "whole" };

type ReviewQuestion = {
	acceptIf: string;
	evidence: string[];
	id: string;
	question: string;
};

type ReviewContract = {
	candidate: string;
	candidateSha256: string;
	decidedAt?: string;
	decision: string;
	questions: ReviewQuestion[];
	reviewer: string;
	state: ReviewState;
};

type Concept = {
	absolutePath: string;
	body: string;
	generatedAt?: string;
	meta: Record<string, unknown>;
	path: string;
	review?: ReviewContract;
	role?: Role;
	sources: SourceRef[];
	status?: Status;
	supersedes: string[];
};

type ReservedDocument = {
	absolutePath: string;
	body: string;
	kind: "index" | "log";
	meta?: Record<string, unknown>;
	path: string;
};

type LocalReference = {
	absolutePath?: string;
	kind: "bundle" | "external" | "outside" | "raw";
};

class UsageError extends Error {}

const roles = new Set([
	"canonical",
	"evidence",
	"generated_view",
	"review_request",
]);
const reviewStates = new Set([
	"accepted",
	"changes_requested",
	"open",
	"rejected",
	"withdrawn",
]);
const standardFields = new Set([
	"attester",
	"computation",
	"description",
	"executor",
	"generated",
	"parameters",
	"resource",
	"runtime",
	"sources",
	"stale_after",
	"status",
	"tags",
	"title",
	"type",
	"usage_window",
	"verified",
]);
const profileFields = new Set([
	"rd_authority_key",
	"rd_evidence",
	"rd_expires_at",
	"rd_generated_from",
	"rd_owner",
	"rd_retire_when",
	"rd_retired_reason",
	"rd_review",
	"rd_role",
	"rd_supersedes",
]);
const layerOrder: Record<Layer, number> = {
	OKF: 0,
	RD_SCHEMA: 1,
	RD_REFERENCE: 2,
	RD_INTEGRITY: 3,
	RD_LIFECYCLE: 4,
	RD_ADMISSION: 5,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isNonemptyString = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0;

const posixPath = (value: string): string => value.split(sep).join("/");

const insideOrEqual = (root: string, candidate: string): boolean => {
	const fromRoot = relative(root, candidate);
	return (
		fromRoot === "" ||
		(fromRoot !== ".." &&
			!fromRoot.startsWith(`..${sep}`) &&
			!isAbsolute(fromRoot))
	);
};

const validDate = (value: string): boolean => {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(parsed.valueOf()) &&
		parsed.toISOString().slice(0, 10) === value
	);
};

const validDateTime = (value: string): boolean => {
	const match =
		/^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
			value,
		);
	return (
		match !== null &&
		match[1] !== undefined &&
		validDate(match[1]) &&
		!Number.isNaN(Date.parse(value))
	);
};

const validActor = (value: string): boolean =>
	/^(?:human|process):[A-Za-z0-9][A-Za-z0-9._@-]*$/.test(value) ||
	/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:+-]*$/.test(value);

const validOwner = (value: string): boolean =>
	/^(?:human|process):[A-Za-z0-9][A-Za-z0-9._@-]*$/.test(value);

const validAuthorityKey = (value: string): boolean =>
	/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/.test(
		value,
	);

const parseEvidenceLocator = (value: string): EvidenceLocator | undefined => {
	if (value === "whole") return { kind: "whole" };
	const line = /^line:([1-9]\d*)(?:-([1-9]\d*))?$/.exec(value);
	if (line?.[1] !== undefined) {
		const start = Number.parseInt(line[1], 10);
		const end = Number.parseInt(line[2] ?? line[1], 10);
		if (end >= start) return { end, kind: "line", start };
		return undefined;
	}
	if (!value.startsWith("json-pointer:")) return undefined;
	const pointer = value.slice("json-pointer:".length);
	if (pointer === "") return { kind: "json-pointer", tokens: [] };
	if (!pointer.startsWith("/")) return undefined;
	const tokens: string[] = [];
	for (const token of pointer.slice(1).split("/")) {
		if (/~(?:[^01]|$)/.test(token)) return undefined;
		tokens.push(token.replaceAll("~1", "/").replaceAll("~0", "~"));
	}
	return { kind: "json-pointer", tokens };
};

const locatorResolutionError = async (
	path: string,
	locator: EvidenceLocator,
): Promise<string | undefined> => {
	if (locator.kind === "whole") return undefined;
	const content = await Bun.file(path).text();
	if (locator.kind === "line") {
		const lines = content.split(/\r?\n/);
		if (lines.at(-1) === "") lines.pop();
		if (locator.end > lines.length) {
			return `line range ${locator.start}-${locator.end} exceeds ${lines.length} lines`;
		}
		return undefined;
	}

	let current: unknown;
	try {
		current = JSON.parse(content);
	} catch (error) {
		return `json-pointer requires valid JSON: ${error instanceof Error ? error.message : String(error)}`;
	}
	for (const token of locator.tokens) {
		if (Array.isArray(current)) {
			if (!/^(?:0|[1-9]\d*)$/.test(token)) {
				return `JSON array token is not an index: ${token}`;
			}
			const index = Number.parseInt(token, 10);
			if (index >= current.length)
				return `JSON array index is absent: ${token}`;
			current = current[index];
			continue;
		}
		if (!isRecord(current) || !Object.hasOwn(current, token)) {
			return `JSON object key is absent: ${token}`;
		}
		current = current[token];
	}
	return undefined;
};

const reviewStateType = (value: string): ReviewState | undefined => {
	switch (value) {
		case "accepted":
		case "changes_requested":
		case "open":
		case "rejected":
		case "withdrawn":
			return value;
		default:
			return undefined;
	}
};

const parseMarkdown = (
	content: string,
	onError: (code: string, message: string) => void,
): ParsedMarkdown => {
	const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
	if (lines[0] !== "---") return { body: content };

	const close = lines.slice(1).indexOf("---");
	if (close < 0) {
		onError("OKF002", "frontmatter has no closing --- delimiter");
		return { body: "" };
	}

	const end = close + 1;
	const frontmatterText = lines.slice(1, end).join("\n");
	const body = lines.slice(end + 1).join("\n");
	try {
		const document = parseDocument(frontmatterText, {
			prettyErrors: true,
			strict: true,
			stringKeys: true,
			uniqueKeys: true,
			version: "1.2",
		});
		if (document.errors.length > 0) {
			const duplicate = document.errors.find(
				(error) => error.code === "DUPLICATE_KEY",
			);
			const error = duplicate ?? document.errors[0];
			onError(
				duplicate === undefined ? "OKF004" : "OKF003",
				`frontmatter is not parseable YAML: ${error?.message ?? "unknown YAML error"}`,
			);
			return { body, frontmatterText };
		}
		const value: unknown = document.toJS({ maxAliasCount: 100 });
		if (!isRecord(value)) {
			onError("OKF005", "frontmatter must parse to a YAML mapping");
			return { body, frontmatterText };
		}
		return { body, frontmatterText, meta: value };
	} catch (error) {
		onError(
			"OKF004",
			`frontmatter is not parseable YAML: ${error instanceof Error ? error.message : String(error)}`,
		);
		return { body, frontmatterText };
	}
};

const stripCode = (body: string): string => {
	let inFence = false;
	return body
		.split(/\r?\n/)
		.map((line) => {
			if (/^\s*(```|~~~)/.test(line)) {
				inFence = !inFence;
				return "";
			}
			if (inFence) return "";
			return line.replace(/`[^`\n]*`/g, "");
		})
		.join("\n");
};

const markdownLinkTargets = (body: string): string[] => {
	const targets: string[] = [];
	const text = stripCode(body);
	const inlinePattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
	for (const match of text.matchAll(inlinePattern)) {
		const raw = match[1]?.trim();
		if (raw === undefined || raw === "") continue;
		if (raw.startsWith("<")) {
			const close = raw.indexOf(">");
			if (close > 1) targets.push(raw.slice(1, close));
			continue;
		}
		const target = raw.split(/\s+/)[0];
		if (target !== undefined) targets.push(target);
	}
	const normalizeLabel = (value: string): string =>
		value.trim().replace(/\s+/g, " ").toLowerCase();
	const definitions = new Map<string, string>();
	const bodyWithoutDefinitions = text
		.split(/\r?\n/)
		.map((line) => {
			const definition = /^\s*\[(?!\^)([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))/.exec(
				line,
			);
			const label = definition?.[1];
			const target = definition?.[2] ?? definition?.[3];
			if (label === undefined || target === undefined) return line;
			definitions.set(normalizeLabel(label), target);
			return "";
		})
		.join("\n");

	const referencedLabels = new Set<string>();
	const withoutExplicitReferences = bodyWithoutDefinitions.replace(
		/!?\[([^\]]+)\]\[([^\]]*)\]/g,
		(_match, label: string, reference: string) => {
			referencedLabels.add(
				normalizeLabel(reference === "" ? label : reference),
			);
			return "";
		},
	);
	const withoutInlineLinks = withoutExplicitReferences.replace(
		/!?\[[^\]]*\]\([^)]+\)/g,
		"",
	);
	for (const match of withoutInlineLinks.matchAll(/!?\[(?!\^)([^\]]+)\]/g)) {
		const label = match[1];
		if (label !== undefined) referencedLabels.add(normalizeLabel(label));
	}
	for (const label of referencedLabels) {
		const target = definitions.get(label);
		if (target !== undefined) targets.push(target);
	}
	return targets;
};

const nonstandardLinkSyntax = (body: string): string[] => {
	const text = stripCode(body);
	const findings: string[] = [];
	if (/\[\[[^\]]+\]\]/.test(text)) findings.push("Obsidian/wiki link");
	if (/<a\s+[^>]*href\s*=/i.test(text)) findings.push("raw HTML anchor");
	return findings;
};

const inlineCitationIds = (body: string): Set<string> => {
	const ids = new Set<string>();
	const text = stripCode(body)
		.split(/\r?\n/)
		.filter((line) => !/^\s*\[\^[^\]]+\]:/.test(line))
		.join("\n");
	for (const match of text.matchAll(/\[\^([^\]\s]+)\]/g)) {
		const id = match[1];
		if (id !== undefined) ids.add(id);
	}
	return ids;
};

const allCitationIds = (body: string): Set<string> => {
	const ids = new Set<string>();
	for (const match of stripCode(body).matchAll(/\[\^([^\]\s]+)\]/g)) {
		const id = match[1];
		if (id !== undefined) ids.add(id);
	}
	return ids;
};

const citationDefinitions = (body: string): Set<string> => {
	const ids = new Set<string>();
	for (const line of stripCode(body).split(/\r?\n/)) {
		const id = /^\s*\[\^([^\]]+)\]:/.exec(line)?.[1];
		if (id !== undefined) ids.add(id);
	}
	return ids;
};

const localReference = (
	ownerPath: string,
	rawValue: string,
	root: string,
	rawRoot: string,
): LocalReference => {
	const value = rawValue.trim();
	if (value === "" || value.startsWith("#")) {
		return { absolutePath: ownerPath, kind: "bundle" };
	}
	if (/^file:/i.test(value)) return { kind: "outside" };
	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith("//")) {
		return { kind: "external" };
	}

	const pathPart = value.split(/[?#]/, 1)[0] ?? "";
	let decoded = pathPart;
	try {
		decoded = decodeURIComponent(pathPart);
	} catch {
		return { kind: "outside" };
	}
	let absolutePath = decoded.startsWith("/")
		? resolve(root, `.${decoded}`)
		: resolve(dirname(ownerPath), decoded);
	if (
		(decoded.endsWith("/") ||
			(existsSync(absolutePath) && statSync(absolutePath).isDirectory())) &&
		absolutePath !== ownerPath
	) {
		absolutePath = resolve(absolutePath, "index.md");
	}
	const realizedPath = existsSync(absolutePath)
		? realpathSync(absolutePath)
		: absolutePath;
	if (insideOrEqual(root, absolutePath)) {
		return insideOrEqual(root, realizedPath)
			? { absolutePath: realizedPath, kind: "bundle" }
			: { absolutePath: realizedPath, kind: "outside" };
	}
	if (insideOrEqual(rawRoot, absolutePath)) {
		return insideOrEqual(rawRoot, realizedPath)
			? { absolutePath: realizedPath, kind: "raw" }
			: { absolutePath: realizedPath, kind: "outside" };
	}
	return { absolutePath: realizedPath, kind: "outside" };
};

const stringArray = (
	value: unknown,
	field: string,
	report: (code: string, message: string) => void,
): string[] => {
	if (!Array.isArray(value)) {
		report("RDS020", `${field} must be an array of non-empty strings`);
		return [];
	}
	const result: string[] = [];
	for (const [index, item] of value.entries()) {
		if (!isNonemptyString(item)) {
			report("RDS021", `${field}[${index}] must be a non-empty string`);
			continue;
		}
		result.push(item);
	}
	return result;
};

const normalizedVerified = (
	value: unknown,
	report: (code: string, message: string) => void,
): Array<{ at: string; by: string }> => {
	if (value === undefined) return [];
	const items = Array.isArray(value) ? value : [value];
	const events: Array<{ at: string; by: string }> = [];
	for (const [index, item] of items.entries()) {
		if (!isRecord(item)) {
			report("RDS030", `verified[${index}] must be a mapping`);
			continue;
		}
		if (!isNonemptyString(item.by) || !validActor(item.by)) {
			report(
				"RDS031",
				`verified[${index}].by must use the OKF actor convention`,
			);
		}
		if (!isNonemptyString(item.at) || !validDateTime(item.at)) {
			report(
				"RDS032",
				`verified[${index}].at must be an ISO-8601 datetime with timezone`,
			);
		}
		if (
			isNonemptyString(item.by) &&
			validActor(item.by) &&
			isNonemptyString(item.at) &&
			validDateTime(item.at)
		) {
			events.push({ at: item.at, by: item.by });
		}
	}
	return events;
};

const parseSources = (
	value: unknown,
	report: (code: string, message: string) => void,
): SourceRef[] => {
	if (value === undefined) return [];
	if (!Array.isArray(value)) {
		report("RDS040", "sources must be an array");
		return [];
	}
	const result: SourceRef[] = [];
	const ids = new Set<string>();
	for (const [index, item] of value.entries()) {
		if (!isRecord(item)) {
			report("RDS041", `sources[${index}] must be a mapping`);
			continue;
		}
		if (
			!isNonemptyString(item.id) ||
			!/^[A-Za-z][A-Za-z0-9._-]*$/.test(item.id)
		) {
			report(
				"RDS042",
				`sources[${index}].id must match ^[A-Za-z][A-Za-z0-9._-]*$`,
			);
		} else if (ids.has(item.id)) {
			report("RDS043", `duplicate sources[].id: ${item.id}`);
		} else {
			ids.add(item.id);
		}
		if (!isNonemptyString(item.resource)) {
			report("RDS044", `sources[${index}].resource must be non-empty`);
		}
		if (isNonemptyString(item.id) && isNonemptyString(item.resource)) {
			result.push({ id: item.id, resource: item.resource });
		}
	}
	return result;
};

const parseReview = (
	value: unknown,
	report: (code: string, message: string) => void,
): ReviewContract | undefined => {
	if (!isRecord(value)) {
		report("RDS100", "rd_review must be a mapping");
		return undefined;
	}
	const state = value.state;
	const candidate = value.candidate;
	const candidateSha256 = value.candidate_sha256;
	const reviewer = value.reviewer;
	const decision = value.decision;
	const parsedState = isNonemptyString(state)
		? reviewStateType(state)
		: undefined;
	if (parsedState === undefined) {
		report(
			"RDS101",
			`rd_review.state must be one of: ${[...reviewStates].join(", ")}`,
		);
	}
	if (!isNonemptyString(candidate)) {
		report("RDS102", "rd_review.candidate must be a non-empty path");
	}
	if (
		!isNonemptyString(candidateSha256) ||
		!/^[a-f0-9]{64}$/.test(candidateSha256)
	) {
		report(
			"RDS113",
			"rd_review.candidate_sha256 must be 64 lowercase hex characters",
		);
	}
	if (
		!isNonemptyString(reviewer) ||
		!reviewer.startsWith("human:") ||
		!validActor(reviewer)
	) {
		report("RDS103", "rd_review.reviewer must be a human:<id> actor");
	}
	if (!isNonemptyString(decision)) {
		report("RDS104", "rd_review.decision must name a concrete decision");
	}

	const questions: ReviewQuestion[] = [];
	const questionIds = new Set<string>();
	if (!Array.isArray(value.questions) || value.questions.length === 0) {
		report("RDS105", "rd_review.questions must be a non-empty array");
	} else {
		for (const [index, item] of value.questions.entries()) {
			if (!isRecord(item)) {
				report("RDS106", `rd_review.questions[${index}] must be a mapping`);
				continue;
			}
			const id = item.id;
			const question = item.question;
			const acceptIf = item.accept_if;
			const evidence = stringArray(
				item.evidence,
				`rd_review.questions[${index}].evidence`,
				report,
			);
			if (!isNonemptyString(id) || !/^[A-Za-z][A-Za-z0-9._-]*$/.test(id)) {
				report(
					"RDS107",
					`rd_review.questions[${index}].id must be a stable key`,
				);
			} else if (questionIds.has(id)) {
				report("RDS108", `duplicate review question id: ${id}`);
			} else {
				questionIds.add(id);
			}
			if (!isNonemptyString(question)) {
				report(
					"RDS109",
					`rd_review.questions[${index}].question must be non-empty`,
				);
			}
			if (!isNonemptyString(acceptIf)) {
				report(
					"RDS110",
					`rd_review.questions[${index}].accept_if must be non-empty`,
				);
			}
			if (
				isNonemptyString(id) &&
				isNonemptyString(question) &&
				isNonemptyString(acceptIf) &&
				evidence.length > 0
			) {
				questions.push({ acceptIf, evidence, id, question });
			}
		}
	}

	const decidedAt = value.decided_at;
	if (parsedState !== undefined && parsedState !== "open") {
		if (!isNonemptyString(decidedAt) || !validDateTime(decidedAt)) {
			report(
				"RDS111",
				"a closed rd_review requires decided_at as an ISO-8601 datetime with timezone",
			);
		}
	} else if (parsedState === "open" && decidedAt !== undefined) {
		report("RDS112", "an open rd_review must not carry decided_at");
	}

	if (
		parsedState === undefined ||
		!isNonemptyString(candidate) ||
		!isNonemptyString(candidateSha256) ||
		!/^[a-f0-9]{64}$/.test(candidateSha256) ||
		!isNonemptyString(reviewer) ||
		!reviewer.startsWith("human:") ||
		!validActor(reviewer) ||
		!isNonemptyString(decision) ||
		questions.length === 0
	) {
		return undefined;
	}
	return {
		candidate,
		candidateSha256,
		decidedAt:
			isNonemptyString(decidedAt) && validDateTime(decidedAt)
				? decidedAt
				: undefined,
		decision,
		questions,
		reviewer,
		state: parsedState,
	};
};

const roleType = (value: string): Role | undefined => {
	switch (value) {
		case "canonical":
		case "evidence":
		case "generated_view":
		case "review_request":
			return value;
		default:
			return undefined;
	}
};

const statusType = (value: string): Status | undefined => {
	switch (value) {
		case "deprecated":
		case "draft":
		case "stable":
			return value;
		default:
			return undefined;
	}
};

const readAllMarkdown = async (root: string): Promise<string[]> => {
	const paths: string[] = [];
	const glob = new Bun.Glob("**/*.md");
	for await (const path of glob.scan({
		cwd: root,
		dot: true,
		onlyFiles: true,
	})) {
		paths.push(path);
	}
	return paths.sort();
};

const sha256File = async (path: string): Promise<string> => {
	const bytes = await Bun.file(path).bytes();
	return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
};

const gitOutput = async (
	cwd: string,
	commandLine: string[],
): Promise<{ exitCode: number; stderr: string; stdout: string }> => {
	// bounded: local git metadata/diff/show only; no network or credential prompts are involved.
	const shell = Bun.$`${commandLine}`.cwd(cwd).quiet().nothrow();
	const { exitCode, stderr, stdout } = await shell;
	return {
		exitCode,
		stderr: stderr.toString(),
		stdout: stdout.toString(),
	};
};

const gitRoot = async (root: string): Promise<string> => {
	const result = await gitOutput(root, ["git", "rev-parse", "--show-toplevel"]);
	if (result.exitCode !== 0 || result.stdout.trim() === "") {
		throw new UsageError(
			`--base requires a Git worktree: ${result.stderr.trim() || root}`,
		);
	}
	return realpathSync(result.stdout.trim());
};

type GitChange = {
	newPath?: string;
	oldPath: string;
	status: string;
};

const parseNameStatusZ = (output: string): GitChange[] => {
	const fields = output.split("\0");
	const changes: GitChange[] = [];
	let index = 0;
	while (index < fields.length) {
		let status = fields[index] ?? "";
		index += 1;
		if (status === "") continue;

		let firstPath: string | undefined;
		const tab = status.indexOf("\t");
		if (tab >= 0) {
			firstPath = status.slice(tab + 1);
			status = status.slice(0, tab);
		} else {
			firstPath = fields[index];
			index += 1;
		}
		if (firstPath === undefined || firstPath === "") continue;

		if (/^[RC]/.test(status)) {
			const newPath = fields[index];
			index += 1;
			changes.push({ newPath, oldPath: firstPath, status });
		} else {
			changes.push({ oldPath: firstPath, status });
		}
	}
	return changes;
};

const baseDocument = async (
	repositoryRoot: string,
	base: string,
	path: string,
): Promise<ParsedMarkdown | undefined> => {
	const result = await gitOutput(repositoryRoot, [
		"git",
		"show",
		`${base}:${path}`,
	]);
	if (result.exitCode !== 0) return undefined;
	return parseMarkdown(result.stdout, () => undefined);
};

const stableValue = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(stableValue);
	if (!isRecord(value)) return value;
	return Object.fromEntries(
		Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, stableValue(item)]),
	);
};

const canonicalContentFingerprint = (document: ParsedMarkdown): string => {
	const ignored = new Set([
		"generated",
		"rd_retired_reason",
		"rd_supersedes",
		"stale_after",
		"status",
		"verified",
	]);
	const contentMeta = Object.fromEntries(
		Object.entries(document.meta ?? {}).filter(([key]) => !ignored.has(key)),
	);
	return JSON.stringify(
		stableValue({ body: document.body, meta: contentMeta }),
	);
};

const checkGitIntegrity = async (
	root: string,
	rawRoot: string,
	base: string,
	add: (layer: Layer, code: string, path: string, message: string) => void,
): Promise<void> => {
	const repositoryRoot = await gitRoot(root);
	if (
		!insideOrEqual(repositoryRoot, root) ||
		!insideOrEqual(repositoryRoot, rawRoot)
	) {
		throw new UsageError(
			"--root and --raw-root must be inside the same Git worktree",
		);
	}
	const verify = await gitOutput(repositoryRoot, [
		"git",
		"rev-parse",
		"--verify",
		`${base}^{commit}`,
	]);
	if (verify.exitCode !== 0) {
		throw new UsageError(`--base is not a commit-ish: ${base}`);
	}
	const rootPath = posixPath(relative(repositoryRoot, root));
	const rawPath = posixPath(relative(repositoryRoot, rawRoot));
	const diff = await gitOutput(repositoryRoot, [
		"git",
		"diff",
		"--name-status",
		"-z",
		"--find-renames",
		base,
		"--",
		rootPath,
		rawPath,
	]);
	if (diff.exitCode !== 0) {
		throw new UsageError(`git diff failed: ${diff.stderr.trim() || base}`);
	}

	for (const change of parseNameStatusZ(diff.stdout)) {
		const status = change.status[0] ?? "";
		const oldPath = posixPath(change.oldPath);
		if (insideOrEqual(rawRoot, resolve(repositoryRoot, oldPath))) {
			if (status !== "A") {
				add(
					"RD_INTEGRITY",
					"RDI001",
					oldPath,
					`raw artifacts are append-only; Git status ${change.status} is forbidden`,
				);
			}
			continue;
		}
		if (
			!insideOrEqual(root, resolve(repositoryRoot, oldPath)) ||
			status === "A"
		) {
			continue;
		}

		const oldDocument = await baseDocument(repositoryRoot, base, oldPath);
		const oldMeta = oldDocument?.meta;
		const oldRole = isNonemptyString(oldMeta?.rd_role)
			? roleType(oldMeta.rd_role)
			: undefined;
		const oldStatus = isNonemptyString(oldMeta?.status)
			? statusType(oldMeta.status)
			: undefined;
		const oldReview = isRecord(oldMeta?.rd_review)
			? oldMeta.rd_review.state
			: undefined;

		if (oldRole === "evidence" && status !== "A") {
			add(
				"RD_INTEGRITY",
				"RDI002",
				oldPath,
				`evidence records are append-only; Git status ${change.status} is forbidden`,
			);
		}
		if (
			(status === "D" || status === "R" || status === "T") &&
			oldRole !== "generated_view"
		) {
			add(
				"RD_INTEGRITY",
				"RDI003",
				oldPath,
				"durable concepts must be deprecated or superseded, not deleted, renamed, or type-changed",
			);
		}
		if (
			status === "M" &&
			oldRole === "canonical" &&
			oldStatus === "deprecated"
		) {
			add(
				"RD_INTEGRITY",
				"RDI004",
				oldPath,
				"a previously deprecated canonical is immutable",
			);
		}
		if (
			status === "M" &&
			oldRole === "review_request" &&
			isNonemptyString(oldReview) &&
			oldReview !== "open"
		) {
			add(
				"RD_INTEGRITY",
				"RDI005",
				oldPath,
				"a closed review decision is immutable; open a new request instead",
			);
		}
		if (
			status === "M" &&
			oldRole === "canonical" &&
			oldDocument !== undefined
		) {
			const currentPath = resolve(repositoryRoot, change.newPath ?? oldPath);
			if (existsSync(currentPath)) {
				const currentDocument = parseMarkdown(
					await Bun.file(currentPath).text(),
					() => undefined,
				);
				if (
					currentDocument.meta !== undefined &&
					canonicalContentFingerprint(currentDocument) !==
						canonicalContentFingerprint(oldDocument)
				) {
					const oldGenerated = isRecord(oldMeta?.generated)
						? oldMeta.generated.at
						: undefined;
					const currentGenerated = isRecord(currentDocument.meta.generated)
						? currentDocument.meta.generated.at
						: undefined;
					if (
						!isNonemptyString(oldGenerated) ||
						!validDateTime(oldGenerated) ||
						!isNonemptyString(currentGenerated) ||
						!validDateTime(currentGenerated) ||
						Date.parse(currentGenerated) <= Date.parse(oldGenerated)
					) {
						add(
							"RD_INTEGRITY",
							"RDI006",
							oldPath,
							"canonical content changed without a strictly newer generated.at",
						);
					}
				}
			}
		}
	}
};

export async function inspectResearchDocs(
	rootInput: string,
	options: ResearchDocsOptions = {},
): Promise<ResearchDocsInspection> {
	const mode = options.mode ?? "profile";
	if (mode !== "okf" && mode !== "profile") {
		throw new UsageError("mode must be okf or profile");
	}
	if (!existsSync(rootInput) || !statSync(rootInput).isDirectory()) {
		throw new UsageError(`bundle root is not a directory: ${rootInput}`);
	}
	const root = realpathSync(rootInput);
	const rawInput = options.rawRoot ?? resolve(dirname(root), "raw");
	const rawRoot = existsSync(rawInput)
		? realpathSync(rawInput)
		: resolve(rawInput);
	const today = options.today ?? new Date().toISOString().slice(0, 10);
	if (!validDate(today)) {
		throw new UsageError(`--today must be YYYY-MM-DD: ${today}`);
	}
	if (mode === "okf" && options.base !== undefined) {
		throw new UsageError(
			"--base is a profile check and cannot be used with --mode okf",
		);
	}

	const findings: ResearchDocsFinding[] = [];
	const findingKeys = new Set<string>();
	const add = (
		layer: Layer,
		code: string,
		path: string,
		message: string,
	): void => {
		const key = `${layer}\0${code}\0${path}\0${message}`;
		if (findingKeys.has(key)) return;
		findingKeys.add(key);
		findings.push({ code, layer, message, path });
	};

	const concepts: Concept[] = [];
	const reserved: ReservedDocument[] = [];
	for (const relativePath of await readAllMarkdown(root)) {
		const absolutePath = resolve(root, relativePath);
		const path = posixPath(relativePath);
		const name = basename(path);
		const parsed = parseMarkdown(
			await Bun.file(absolutePath).text(),
			(code, message) => add("OKF", code, path, message),
		);

		if (name === "index.md" || name === "log.md") {
			reserved.push({
				absolutePath,
				body: parsed.body,
				kind: name === "index.md" ? "index" : "log",
				meta: parsed.meta,
				path,
			});
			continue;
		}
		if (parsed.meta === undefined) {
			add("OKF", "OKF001", path, "concept is missing YAML frontmatter");
			continue;
		}
		if (!isNonemptyString(parsed.meta.type)) {
			add("OKF", "OKF006", path, "concept requires a non-empty type");
		}
		concepts.push({
			absolutePath,
			body: parsed.body,
			meta: parsed.meta,
			path,
			sources: [],
			supersedes: [],
		});
	}

	const rootIndex = reserved.find((item) => item.path === "index.md");
	for (const document of reserved) {
		if (document.kind === "index") {
			if (document.path !== "index.md" && document.meta !== undefined) {
				add(
					"OKF",
					"OKF010",
					document.path,
					"a non-root index.md must not have frontmatter",
				);
			}
			if (document.path === "index.md" && document.meta !== undefined) {
				const keys = Object.keys(document.meta);
				if (keys.length !== 1 || keys[0] !== "okf_version") {
					add(
						"OKF",
						"OKF011",
						document.path,
						"root index frontmatter may contain only okf_version",
					);
				}
				if (document.meta.okf_version !== "0.2") {
					add(
						"OKF",
						"OKF012",
						document.path,
						'root index okf_version must be the string "0.2"',
					);
				}
			}
		} else {
			if (document.meta !== undefined) {
				add("OKF", "OKF013", document.path, "log.md must not have frontmatter");
			}
			for (const line of document.body.split(/\r?\n/)) {
				const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1];
				if (heading !== undefined && !validDate(heading)) {
					add(
						"OKF",
						"OKF014",
						document.path,
						`level-two log heading must be YYYY-MM-DD: ${heading}`,
					);
				}
			}
		}
	}

	if (mode === "okf") {
		findings.sort(
			(left, right) =>
				left.path.localeCompare(right.path) ||
				left.code.localeCompare(right.code),
		);
		return { concepts: concepts.length, findings, mode, root };
	}

	if (!existsSync(rawRoot) || !statSync(rawRoot).isDirectory()) {
		add(
			"RD_SCHEMA",
			"RDS001",
			posixPath(rawInput),
			"raw root is not a directory",
		);
	}
	if (insideOrEqual(root, rawRoot) || insideOrEqual(rawRoot, root)) {
		add(
			"RD_SCHEMA",
			"RDS002",
			".",
			"raw root and OKF bundle root must be separate, non-nested directories",
		);
	}
	if (rootIndex === undefined) {
		add("RD_SCHEMA", "RDS003", "index.md", "profile requires a root index.md");
	} else if (rootIndex.meta === undefined) {
		add(
			"RD_SCHEMA",
			"RDS004",
			"index.md",
			'profile requires root index frontmatter with okf_version: "0.2"',
		);
	}
	const verifiedByPath = new Map<string, Array<{ at: string; by: string }>>();
	for (const concept of concepts) {
		const report = (code: string, message: string): void =>
			add("RD_SCHEMA", code, concept.path, message);
		const meta = concept.meta;
		for (const key of Object.keys(meta)) {
			if (key === "timestamp") {
				report(
					"RDS005",
					"timestamp is legacy v0.1; use generated.at in OKF v0.2",
				);
			} else if (!standardFields.has(key) && !profileFields.has(key)) {
				report(
					"RDS006",
					`unknown profile field ${key}; local extensions must be declared rd_ fields`,
				);
			}
		}
		if (!isNonemptyString(meta.title)) {
			report("RDS007", "profile requires a non-empty title");
		}
		if (!isNonemptyString(meta.description)) {
			report("RDS008", "profile requires a non-empty description");
		}
		if (
			!isNonemptyString(meta.status) ||
			statusType(meta.status) === undefined
		) {
			report(
				"RDS009",
				"status must explicitly be draft, stable, or deprecated",
			);
		} else {
			concept.status = statusType(meta.status);
		}
		if (
			!isNonemptyString(meta.rd_role) ||
			roleType(meta.rd_role) === undefined
		) {
			report("RDS010", `rd_role must be one of: ${[...roles].join(", ")}`);
		} else {
			concept.role = roleType(meta.rd_role);
		}
		if (!isRecord(meta.generated)) {
			report("RDS011", "generated must be a mapping with by and at");
		} else {
			if (
				!isNonemptyString(meta.generated.by) ||
				!validActor(meta.generated.by)
			) {
				report("RDS012", "generated.by must use the OKF actor convention");
			}
			if (
				!isNonemptyString(meta.generated.at) ||
				!validDateTime(meta.generated.at)
			) {
				report(
					"RDS013",
					"generated.at must be an ISO-8601 datetime with timezone",
				);
			} else {
				concept.generatedAt = meta.generated.at;
			}
		}
		if (meta.stale_after !== undefined) {
			if (!isNonemptyString(meta.stale_after) || !validDate(meta.stale_after)) {
				report("RDS014", "stale_after must be YYYY-MM-DD");
			}
		}
		concept.sources = parseSources(meta.sources, report);
		verifiedByPath.set(
			concept.absolutePath,
			normalizedVerified(meta.verified, report),
		);
		if (meta.rd_supersedes !== undefined) {
			concept.supersedes = stringArray(
				meta.rd_supersedes,
				"rd_supersedes",
				report,
			);
		}
	}

	const conceptByAbsolute = new Map(
		concepts.map((concept) => [concept.absolutePath, concept]),
	);

	const resolvedSources = new Map<string, Map<string, LocalReference>>();
	for (const concept of concepts) {
		const byId = new Map<string, LocalReference>();
		for (const source of concept.sources) {
			const resolved = localReference(
				concept.absolutePath,
				source.resource,
				root,
				rawRoot,
			);
			byId.set(source.id, resolved);
			if (resolved.kind === "outside") {
				add(
					"RD_REFERENCE",
					"RDR001",
					concept.path,
					`source ${source.id} escapes the bundle and raw roots: ${source.resource}`,
				);
			} else if (
				resolved.kind !== "external" &&
				(resolved.absolutePath === undefined ||
					!existsSync(resolved.absolutePath))
			) {
				add(
					"RD_REFERENCE",
					"RDR002",
					concept.path,
					`source ${source.id} does not resolve: ${source.resource}`,
				);
			}
		}
		resolvedSources.set(concept.absolutePath, byId);

		const sourceIds = new Set(concept.sources.map((source) => source.id));
		for (const citation of allCitationIds(concept.body)) {
			if (!sourceIds.has(citation)) {
				add(
					"RD_REFERENCE",
					"RDR003",
					concept.path,
					`footnote [^${citation}] has no matching sources[].id`,
				);
			}
		}
		const definitions = citationDefinitions(concept.body);
		for (const citation of inlineCitationIds(concept.body)) {
			if (!definitions.has(citation)) {
				add(
					"RD_REFERENCE",
					"RDR004",
					concept.path,
					`inline citation [^${citation}] has no footnote definition`,
				);
			}
		}
	}

	for (const concept of concepts) {
		const meta = concept.meta;
		const role = concept.role;
		const status = concept.status;
		if (role === undefined || status === undefined) continue;

		const forbidden = (fields: string[]): void => {
			for (const field of fields) {
				if (meta[field] !== undefined) {
					add(
						"RD_SCHEMA",
						"RDS050",
						concept.path,
						`${field} is forbidden for rd_role: ${role}`,
					);
				}
			}
		};

		if (role === "canonical") {
			forbidden([
				"rd_evidence",
				"rd_expires_at",
				"rd_generated_from",
				"rd_review",
			]);
			if (
				!isNonemptyString(meta.rd_authority_key) ||
				!validAuthorityKey(meta.rd_authority_key)
			) {
				add(
					"RD_SCHEMA",
					"RDS051",
					concept.path,
					"canonical requires rd_authority_key as a normalized lowercase slug",
				);
			}
			if (!isNonemptyString(meta.rd_owner) || !validOwner(meta.rd_owner)) {
				add(
					"RD_SCHEMA",
					"RDS052",
					concept.path,
					"canonical rd_owner must be a human:<id> or process:<id> actor",
				);
			}
			if (!isNonemptyString(meta.rd_retire_when)) {
				add(
					"RD_SCHEMA",
					"RDS053",
					concept.path,
					"canonical requires an observable rd_retire_when condition",
				);
			}
			if (concept.sources.length === 0) {
				add(
					"RD_SCHEMA",
					"RDS054",
					concept.path,
					"canonical requires at least one evidence source",
				);
			}
			if (status !== "deprecated") {
				if (
					!isNonemptyString(meta.stale_after) ||
					!validDate(meta.stale_after)
				) {
					add(
						"RD_LIFECYCLE",
						"RDL001",
						concept.path,
						"an active canonical requires stale_after",
					);
				} else if (today >= meta.stale_after) {
					add(
						"RD_LIFECYCLE",
						"RDL002",
						concept.path,
						`canonical is stale on ${meta.stale_after}; evaluated ${today}`,
					);
				}
			}
			const sourceMap = resolvedSources.get(concept.absolutePath) ?? new Map();
			for (const source of concept.sources) {
				const target = sourceMap.get(source.id);
				const targetConcept =
					target?.absolutePath === undefined
						? undefined
						: conceptByAbsolute.get(target.absolutePath);
				if (
					target?.kind !== "bundle" ||
					targetConcept?.role !== "evidence" ||
					targetConcept.status !== "stable"
				) {
					add(
						"RD_REFERENCE",
						"RDR010",
						concept.path,
						`canonical source ${source.id} must resolve to stable evidence`,
					);
				}
			}
			const inline = inlineCitationIds(concept.body);
			for (const source of concept.sources) {
				if (!inline.has(source.id)) {
					add(
						"RD_REFERENCE",
						"RDR011",
						concept.path,
						`canonical source ${source.id} is not cited by a body claim`,
					);
				}
			}
			if (status === "stable" && concept.generatedAt !== undefined) {
				const currentGeneratedAt = Date.parse(concept.generatedAt);
				const hasCurrentHumanVerification = (
					verifiedByPath.get(concept.absolutePath) ?? []
				).some(
					(event) =>
						event.by.startsWith("human:") &&
						Date.parse(event.at) >= currentGeneratedAt,
				);
				if (!hasCurrentHumanVerification) {
					add(
						"RD_LIFECYCLE",
						"RDL003",
						concept.path,
						"stable canonical requires human verification at or after generated.at",
					);
				}
			}
		}

		if (role === "evidence") {
			forbidden([
				"rd_authority_key",
				"rd_expires_at",
				"rd_generated_from",
				"rd_retire_when",
				"rd_retired_reason",
				"rd_review",
				"rd_supersedes",
			]);
			if (status !== "stable") {
				add(
					"RD_SCHEMA",
					"RDS060",
					concept.path,
					"evidence must have status: stable",
				);
			}
			if (meta.stale_after !== undefined) {
				add(
					"RD_SCHEMA",
					"RDS061",
					concept.path,
					"evidence records do not expire; correct them additively",
				);
			}
			if (concept.sources.length !== 1) {
				add(
					"RD_SCHEMA",
					"RDS062",
					concept.path,
					"an evidence record must bind exactly one raw artifact",
				);
			}
			if (!isRecord(meta.rd_evidence)) {
				add(
					"RD_SCHEMA",
					"RDS063",
					concept.path,
					"evidence requires rd_evidence with source_id, sha256, and locator",
				);
			} else {
				const sourceId = meta.rd_evidence.source_id;
				const digest = meta.rd_evidence.sha256;
				const locator = meta.rd_evidence.locator;
				const locatorSpec = isNonemptyString(locator)
					? parseEvidenceLocator(locator)
					: undefined;
				if (!isNonemptyString(sourceId)) {
					add(
						"RD_SCHEMA",
						"RDS064",
						concept.path,
						"rd_evidence.source_id is required",
					);
				}
				if (!isNonemptyString(digest) || !/^[a-f0-9]{64}$/.test(digest)) {
					add(
						"RD_SCHEMA",
						"RDS065",
						concept.path,
						"rd_evidence.sha256 must be 64 lowercase hex characters",
					);
				}
				if (locatorSpec === undefined) {
					add(
						"RD_SCHEMA",
						"RDS066",
						concept.path,
						"rd_evidence.locator must be whole, line:<N>[-<M>], or json-pointer:<RFC6901 pointer>",
					);
				}
				const source = isNonemptyString(sourceId)
					? concept.sources.find((item) => item.id === sourceId)
					: undefined;
				if (source === undefined) {
					add(
						"RD_REFERENCE",
						"RDR020",
						concept.path,
						"rd_evidence.source_id must match the sole sources[].id",
					);
				} else {
					const target = resolvedSources
						.get(concept.absolutePath)
						?.get(source.id);
					if (target?.kind !== "raw" || target.absolutePath === undefined) {
						add(
							"RD_REFERENCE",
							"RDR021",
							concept.path,
							"evidence source must resolve inside the raw root",
						);
					} else if (existsSync(target.absolutePath)) {
						if (!statSync(target.absolutePath).isFile()) {
							add(
								"RD_REFERENCE",
								"RDR023",
								concept.path,
								"evidence source must resolve to a regular raw artifact file",
							);
						} else {
							if (isNonemptyString(digest)) {
								const actual = await sha256File(target.absolutePath);
								if (actual !== digest) {
									add(
										"RD_INTEGRITY",
										"RDI010",
										concept.path,
										`raw artifact SHA-256 mismatch: expected ${digest}, got ${actual}`,
									);
								}
							}
							if (locatorSpec !== undefined) {
								const locatorError = await locatorResolutionError(
									target.absolutePath,
									locatorSpec,
								);
								if (locatorError !== undefined) {
									add(
										"RD_REFERENCE",
										"RDR024",
										concept.path,
										`evidence locator does not resolve: ${locatorError}`,
									);
								}
							}
						}
					}
					if (!inlineCitationIds(concept.body).has(source.id)) {
						add(
							"RD_REFERENCE",
							"RDR022",
							concept.path,
							`evidence source ${source.id} is not cited by the observation`,
						);
					}
				}
			}
		}

		if (role === "review_request") {
			forbidden([
				"rd_authority_key",
				"rd_evidence",
				"rd_expires_at",
				"rd_generated_from",
				"rd_retired_reason",
				"rd_supersedes",
			]);
			if (!isNonemptyString(meta.rd_owner) || !validOwner(meta.rd_owner)) {
				add(
					"RD_SCHEMA",
					"RDS070",
					concept.path,
					"review rd_owner must be a human:<id> or process:<id> actor",
				);
			}
			if (!isNonemptyString(meta.rd_retire_when)) {
				add(
					"RD_SCHEMA",
					"RDS071",
					concept.path,
					"review request requires rd_retire_when",
				);
			}
			if (concept.sources.length === 0) {
				add(
					"RD_SCHEMA",
					"RDS072",
					concept.path,
					"review request requires candidate/evidence sources",
				);
			}
			concept.review = parseReview(meta.rd_review, (code, message) =>
				add("RD_SCHEMA", code, concept.path, message),
			);
			if (concept.review?.state === "open") {
				if (status !== "draft") {
					add(
						"RD_LIFECYCLE",
						"RDL010",
						concept.path,
						"an open review request must have status: draft",
					);
				}
				if (
					!isNonemptyString(meta.stale_after) ||
					!validDate(meta.stale_after)
				) {
					add(
						"RD_LIFECYCLE",
						"RDL011",
						concept.path,
						"an open review request requires stale_after",
					);
				} else if (today >= meta.stale_after) {
					add(
						"RD_LIFECYCLE",
						"RDL012",
						concept.path,
						`open review request expired on ${meta.stale_after}`,
					);
				}
			} else if (concept.review?.state === "withdrawn") {
				if (status !== "deprecated") {
					add(
						"RD_LIFECYCLE",
						"RDL013",
						concept.path,
						"a withdrawn review request must have status: deprecated",
					);
				}
			} else if (concept.review !== undefined && status !== "stable") {
				add(
					"RD_LIFECYCLE",
					"RDL014",
					concept.path,
					"a decided review request must have status: stable",
				);
			}
		}

		if (role === "generated_view") {
			forbidden([
				"rd_authority_key",
				"rd_evidence",
				"rd_owner",
				"rd_retire_when",
				"rd_retired_reason",
				"rd_review",
				"rd_supersedes",
			]);
			if (status !== "draft") {
				add(
					"RD_SCHEMA",
					"RDS080",
					concept.path,
					"generated_view must always have status: draft",
				);
			}
			if (meta.verified !== undefined) {
				add(
					"RD_SCHEMA",
					"RDS081",
					concept.path,
					"generated_view must not carry verified; verify the canonical instead",
				);
			}
			const generatedFrom = stringArray(
				meta.rd_generated_from,
				"rd_generated_from",
				(code, message) => add("RD_SCHEMA", code, concept.path, message),
			);
			if (generatedFrom.length === 0) {
				add(
					"RD_SCHEMA",
					"RDS082",
					concept.path,
					"generated_view requires non-empty rd_generated_from",
				);
			}
			if (!isNonemptyString(meta.stale_after) || !validDate(meta.stale_after)) {
				add(
					"RD_LIFECYCLE",
					"RDL020",
					concept.path,
					"generated_view requires stale_after",
				);
			}
			if (
				!isNonemptyString(meta.rd_expires_at) ||
				!validDate(meta.rd_expires_at)
			) {
				add(
					"RD_LIFECYCLE",
					"RDL021",
					concept.path,
					"generated_view requires rd_expires_at as YYYY-MM-DD",
				);
			} else if (meta.stale_after !== meta.rd_expires_at) {
				add(
					"RD_LIFECYCLE",
					"RDL022",
					concept.path,
					"stale_after and rd_expires_at must be identical",
				);
			}
			if (
				isNonemptyString(meta.rd_expires_at) &&
				validDate(meta.rd_expires_at) &&
				concept.generatedAt !== undefined
			) {
				const created = new Date(concept.generatedAt);
				const expires = new Date(`${meta.rd_expires_at}T00:00:00Z`);
				const days = (expires.valueOf() - created.valueOf()) / 86_400_000;
				if (days < 0 || days > 30) {
					add(
						"RD_LIFECYCLE",
						"RDL023",
						concept.path,
						"generated_view expiry must be within 30 days of generated.at",
					);
				}
				if (today >= meta.rd_expires_at) {
					add(
						"RD_LIFECYCLE",
						"RDL024",
						concept.path,
						`generated_view expired on ${meta.rd_expires_at}`,
					);
				}
			}
			if (concept.sources.length === 0) {
				add(
					"RD_SCHEMA",
					"RDS083",
					concept.path,
					"generated_view requires sources",
				);
			}
			const sourceTargets = new Set<string>();
			for (const source of concept.sources) {
				const target = resolvedSources
					.get(concept.absolutePath)
					?.get(source.id);
				if (target?.kind !== "bundle" || target.absolutePath === undefined) {
					add(
						"RD_REFERENCE",
						"RDR030",
						concept.path,
						`generated_view source ${source.id} must be a durable bundle concept`,
					);
					continue;
				}
				const targetConcept = conceptByAbsolute.get(target.absolutePath);
				if (
					targetConcept === undefined ||
					targetConcept.role === "generated_view"
				) {
					add(
						"RD_REFERENCE",
						"RDR031",
						concept.path,
						`generated_view source ${source.id} cannot be another generated view`,
					);
				}
				sourceTargets.add(target.absolutePath);
			}
			const derivedTargets = new Set<string>();
			for (const path of generatedFrom) {
				const target = localReference(
					concept.absolutePath,
					path,
					root,
					rawRoot,
				);
				if (target.kind !== "bundle" || target.absolutePath === undefined) {
					add(
						"RD_REFERENCE",
						"RDR032",
						concept.path,
						`rd_generated_from must point to a durable bundle concept: ${path}`,
					);
					continue;
				}
				const targetConcept = conceptByAbsolute.get(target.absolutePath);
				if (
					targetConcept === undefined ||
					targetConcept.role === "generated_view"
				) {
					add(
						"RD_REFERENCE",
						"RDR033",
						concept.path,
						`rd_generated_from cannot point to a generated view: ${path}`,
					);
				}
				derivedTargets.add(target.absolutePath);
			}
			if (
				[...sourceTargets].some((path) => !derivedTargets.has(path)) ||
				[...derivedTargets].some((path) => !sourceTargets.has(path))
			) {
				add(
					"RD_REFERENCE",
					"RDR034",
					concept.path,
					"sources and rd_generated_from must resolve to the same inputs",
				);
			}
		}
	}

	for (const concept of concepts.filter(
		(item) => item.role === "review_request",
	)) {
		const review = concept.review;
		if (review === undefined) continue;
		const candidateRef = localReference(
			concept.absolutePath,
			review.candidate,
			root,
			rawRoot,
		);
		const candidate =
			candidateRef.absolutePath === undefined
				? undefined
				: conceptByAbsolute.get(candidateRef.absolutePath);
		if (candidateRef.kind !== "bundle" || candidate?.role !== "canonical") {
			add(
				"RD_REFERENCE",
				"RDR040",
				concept.path,
				"rd_review.candidate must resolve to a canonical concept",
			);
		} else {
			const candidateDigest = await sha256File(candidate.absolutePath);
			if (
				review.state === "open" &&
				candidateDigest !== review.candidateSha256
			) {
				add(
					"RD_INTEGRITY",
					"RDI020",
					concept.path,
					`review candidate SHA-256 mismatch: expected ${review.candidateSha256}, got ${candidateDigest}`,
				);
			}
		}
		const requiredTargets = new Set<string>();
		if (candidateRef.absolutePath !== undefined) {
			requiredTargets.add(candidateRef.absolutePath);
		}
		for (const question of review.questions) {
			for (const evidencePath of question.evidence) {
				const evidenceRef = localReference(
					concept.absolutePath,
					evidencePath,
					root,
					rawRoot,
				);
				const evidence =
					evidenceRef.absolutePath === undefined
						? undefined
						: conceptByAbsolute.get(evidenceRef.absolutePath);
				if (
					evidenceRef.kind !== "bundle" ||
					evidence?.role !== "evidence" ||
					evidence.status !== "stable"
				) {
					add(
						"RD_REFERENCE",
						"RDR041",
						concept.path,
						`review question ${question.id} evidence must resolve to stable evidence: ${evidencePath}`,
					);
				}
				if (evidenceRef.absolutePath !== undefined) {
					requiredTargets.add(evidenceRef.absolutePath);
				}
			}
		}
		const sourceTargets = new Set<string>();
		for (const source of concept.sources) {
			const target = resolvedSources.get(concept.absolutePath)?.get(source.id);
			if (target?.kind !== "bundle" || target.absolutePath === undefined) {
				add(
					"RD_REFERENCE",
					"RDR042",
					concept.path,
					`review source ${source.id} must resolve inside the bundle`,
				);
				continue;
			}
			const targetConcept = conceptByAbsolute.get(target.absolutePath);
			if (targetConcept?.role === "generated_view") {
				add(
					"RD_REFERENCE",
					"RDR043",
					concept.path,
					`review source ${source.id} cannot be a generated view`,
				);
			}
			sourceTargets.add(target.absolutePath);
		}
		if (
			[...requiredTargets].some((path) => !sourceTargets.has(path)) ||
			[...sourceTargets].some((path) => !requiredTargets.has(path))
		) {
			add(
				"RD_REFERENCE",
				"RDR044",
				concept.path,
				"review sources must exactly match candidate plus question evidence",
			);
		}
	}

	for (const concept of concepts) {
		for (const syntax of nonstandardLinkSyntax(concept.body)) {
			add(
				"RD_REFERENCE",
				"RDR052",
				concept.path,
				`${syntax} is outside this OKF profile; use a standard Markdown link`,
			);
		}
		for (const targetValue of markdownLinkTargets(concept.body)) {
			const target = localReference(
				concept.absolutePath,
				targetValue,
				root,
				rawRoot,
			);
			if (target.kind === "external") continue;
			if (
				target.kind === "outside" ||
				target.absolutePath === undefined ||
				!existsSync(target.absolutePath)
			) {
				add(
					"RD_REFERENCE",
					"RDR050",
					concept.path,
					`broken or escaping Markdown link: ${targetValue}`,
				);
				continue;
			}
			const targetConcept = conceptByAbsolute.get(target.absolutePath);
			if (
				concept.role !== "generated_view" &&
				targetConcept?.role === "generated_view"
			) {
				add(
					"RD_REFERENCE",
					"RDR051",
					concept.path,
					`durable concept must not depend on generated view: ${targetValue}`,
				);
			}
		}
	}

	const activeByAuthority = new Map<string, Concept[]>();
	for (const concept of concepts) {
		if (
			concept.role !== "canonical" ||
			concept.status === "deprecated" ||
			!isNonemptyString(concept.meta.rd_authority_key)
		) {
			continue;
		}
		const entries = activeByAuthority.get(concept.meta.rd_authority_key) ?? [];
		entries.push(concept);
		activeByAuthority.set(concept.meta.rd_authority_key, entries);
	}
	for (const [key, entries] of activeByAuthority) {
		if (entries.length > 1) {
			for (const concept of entries) {
				add(
					"RD_LIFECYCLE",
					"RDL030",
					concept.path,
					`authority key ${key} has ${entries.length} active canonicals`,
				);
			}
		}
	}

	const successorIncoming = new Map<string, Concept[]>();
	const successorEdges = new Map<string, string[]>();
	for (const concept of concepts.filter((item) => item.role === "canonical")) {
		const edges: string[] = [];
		for (const targetPath of concept.supersedes) {
			const targetRef = localReference(
				concept.absolutePath,
				targetPath,
				root,
				rawRoot,
			);
			const target =
				targetRef.absolutePath === undefined
					? undefined
					: conceptByAbsolute.get(targetRef.absolutePath);
			if (targetRef.kind !== "bundle" || target?.role !== "canonical") {
				add(
					"RD_REFERENCE",
					"RDR060",
					concept.path,
					`rd_supersedes must resolve to a canonical: ${targetPath}`,
				);
				continue;
			}
			if (target.status !== "deprecated") {
				add(
					"RD_LIFECYCLE",
					"RDL031",
					concept.path,
					`rd_supersedes target must be deprecated: ${target.path}`,
				);
			}
			if (target.meta.rd_authority_key !== concept.meta.rd_authority_key) {
				add(
					"RD_LIFECYCLE",
					"RDL032",
					concept.path,
					`rd_supersedes target has a different authority key: ${target.path}`,
				);
			}
			edges.push(target.absolutePath);
			const incoming = successorIncoming.get(target.absolutePath) ?? [];
			incoming.push(concept);
			successorIncoming.set(target.absolutePath, incoming);
		}
		successorEdges.set(concept.absolutePath, edges);
	}

	const visitState = new Map<string, "done" | "visiting">();
	const visit = (path: string, trail: string[]): void => {
		const state = visitState.get(path);
		if (state === "done") return;
		if (state === "visiting") {
			const cycle = [...trail, path]
				.map((item) => conceptByAbsolute.get(item)?.path ?? item)
				.join(" -> ");
			add(
				"RD_LIFECYCLE",
				"RDL033",
				conceptByAbsolute.get(path)?.path ?? path,
				`rd_supersedes cycle: ${cycle}`,
			);
			return;
		}
		visitState.set(path, "visiting");
		for (const target of successorEdges.get(path) ?? []) {
			visit(target, [...trail, path]);
		}
		visitState.set(path, "done");
	};
	for (const path of successorEdges.keys()) visit(path, []);

	for (const concept of concepts.filter(
		(item) => item.role === "canonical" && item.status === "deprecated",
	)) {
		const incoming = successorIncoming.get(concept.absolutePath) ?? [];
		const hasReason = isNonemptyString(concept.meta.rd_retired_reason);
		if (incoming.length === 0 && !hasReason) {
			add(
				"RD_LIFECYCLE",
				"RDL034",
				concept.path,
				"deprecated canonical needs exactly one successor or rd_retired_reason",
			);
		}
		if (incoming.length > 1) {
			add(
				"RD_LIFECYCLE",
				"RDL035",
				concept.path,
				`deprecated canonical has ${incoming.length} successors`,
			);
		}
		if (incoming.length > 0 && hasReason) {
			add(
				"RD_LIFECYCLE",
				"RDL036",
				concept.path,
				"deprecated canonical must use a successor or retirement reason, not both",
			);
		}
	}

	const reviewsByCandidate = new Map<string, Concept[]>();
	for (const concept of concepts.filter((item) => item.review !== undefined)) {
		const review = concept.review;
		if (review === undefined) continue;
		const candidate = localReference(
			concept.absolutePath,
			review.candidate,
			root,
			rawRoot,
		).absolutePath;
		if (candidate === undefined) continue;
		const reviews = reviewsByCandidate.get(candidate) ?? [];
		reviews.push(concept);
		reviewsByCandidate.set(candidate, reviews);
	}
	for (const concept of concepts.filter((item) => item.role === "canonical")) {
		const reviews = reviewsByCandidate.get(concept.absolutePath) ?? [];
		const candidateDigest = await sha256File(concept.absolutePath);
		if (concept.status === "draft") {
			const open = reviews.filter(
				(item) =>
					item.review?.state === "open" &&
					item.review.candidateSha256 === candidateDigest,
			);
			if (open.length !== 1) {
				add(
					"RD_ADMISSION",
					"RDA001",
					concept.path,
					`draft canonical requires exactly one open review request for its current SHA-256; found ${open.length}`,
				);
			}
		}
		if (concept.status === "stable" && concept.generatedAt !== undefined) {
			const generatedAt = Date.parse(concept.generatedAt);
			const accepted = reviews.filter(
				(item) =>
					item.review?.state === "accepted" &&
					item.review.candidateSha256 === candidateDigest &&
					item.review.decidedAt !== undefined &&
					Date.parse(item.review.decidedAt) >= generatedAt,
			);
			if (accepted.length === 0) {
				add(
					"RD_ADMISSION",
					"RDA002",
					concept.path,
					"stable canonical requires an accepted review for its current SHA-256 decided at or after generated.at",
				);
			}
		}
	}

	const reservedByAbsolute = new Map(
		reserved.map((document) => [document.absolutePath, document]),
	);
	const reachableConcepts = new Set<string>();
	if (rootIndex !== undefined) {
		const seenIndexes = new Set<string>();
		const queue = [rootIndex.absolutePath];
		while (queue.length > 0) {
			const indexPath = queue.shift();
			if (indexPath === undefined || seenIndexes.has(indexPath)) continue;
			seenIndexes.add(indexPath);
			const index = reservedByAbsolute.get(indexPath);
			if (index?.kind !== "index") continue;
			for (const syntax of nonstandardLinkSyntax(index.body)) {
				add(
					"RD_REFERENCE",
					"RDR052",
					index.path,
					`${syntax} is outside this OKF profile; use a standard Markdown link`,
				);
			}
			for (const targetValue of markdownLinkTargets(index.body)) {
				const target = localReference(
					index.absolutePath,
					targetValue,
					root,
					rawRoot,
				);
				if (target.kind === "external") continue;
				if (
					target.kind !== "bundle" ||
					target.absolutePath === undefined ||
					!existsSync(target.absolutePath)
				) {
					add(
						"RD_REFERENCE",
						"RDR070",
						index.path,
						`index link does not resolve inside the bundle: ${targetValue}`,
					);
					continue;
				}
				const reservedTarget = reservedByAbsolute.get(target.absolutePath);
				if (reservedTarget?.kind === "index") queue.push(target.absolutePath);
				if (conceptByAbsolute.has(target.absolutePath)) {
					reachableConcepts.add(target.absolutePath);
				}
			}
		}
	}
	for (const concept of concepts) {
		if (
			concept.role !== "generated_view" &&
			!reachableConcepts.has(concept.absolutePath)
		) {
			add(
				"RD_REFERENCE",
				"RDR071",
				concept.path,
				"durable concept is not reachable from root index.md",
			);
		}
	}

	if (options.base !== undefined) {
		await checkGitIntegrity(root, rawRoot, options.base, add);
	}

	findings.sort(
		(left, right) =>
			layerOrder[left.layer] - layerOrder[right.layer] ||
			left.path.localeCompare(right.path) ||
			left.code.localeCompare(right.code) ||
			left.message.localeCompare(right.message),
	);
	return { concepts: concepts.length, findings, mode, root };
}

function rejectUnknownFlag(
	type: "argument" | "known-flag" | "unknown-flag",
	flag: string,
): void {
	if (type === "unknown-flag")
		throw new UsageError(`unknown option '--${flag}'`);
}

function nonEmptyString(value: string | undefined): string {
	if (value === undefined || value.trim() === "") {
		throw new UsageError("option requires a non-empty value");
	}
	return value;
}

function modeValue(value: string | undefined): Mode {
	if (value !== "okf" && value !== "profile") {
		throw new UsageError("--mode must be okf or profile");
	}
	return value;
}

async function main(): Promise<void> {
	const parsed = typeFlag(
		{
			base: { type: nonEmptyString },
			mode: { type: modeValue },
			"raw-root": { type: nonEmptyString },
			root: { type: nonEmptyString },
			today: { type: nonEmptyString },
		},
		Bun.argv.slice(2),
		{ ignore: rejectUnknownFlag },
	);
	const unknown = Object.keys(parsed.unknownFlags);
	if (unknown.length > 0) {
		throw new UsageError(
			`unknown option(s): ${unknown.map((flag) => `--${flag}`).join(", ")}`,
		);
	}
	if (parsed._.length > 0) {
		throw new UsageError(`unexpected positional argument: ${parsed._[0]}`);
	}
	const root = parsed.flags.root;
	if (root === undefined) {
		throw new UsageError("required option: --root <knowledge-bundle>");
	}
	const inspection = await inspectResearchDocs(root, {
		base: parsed.flags.base,
		mode: parsed.flags.mode ?? "profile",
		rawRoot: parsed.flags["raw-root"],
		today: parsed.flags.today,
	});
	if (inspection.findings.length === 0) {
		const label =
			inspection.mode === "okf"
				? "OKF v0.2 conformant"
				: "OKF v0.2 + R&D profile valid";
		process.stdout.write(
			`PASS ${inspection.root}: ${label}; concepts=${inspection.concepts}\nFAIL=0\n`,
		);
		return;
	}
	for (const finding of inspection.findings) {
		process.stdout.write(
			`FAIL [${finding.layer} ${finding.code}] ${finding.path}: ${finding.message}\n`,
		);
	}
	const okfFindings = inspection.findings.filter(
		(finding) => finding.layer === "OKF",
	).length;
	process.stdout.write(
		`FAIL=${inspection.findings.length} OKF=${okfFindings} PROFILE=${inspection.findings.length - okfFindings}\n`,
	);
	process.exitCode = 1;
}

if (import.meta.main) {
	main().catch((error) => {
		process.stderr.write(
			`FATAL: ${error instanceof Error ? error.message : String(error)}\n` +
				"usage: bun research-docs-check.ts --root <knowledge-bundle> [--raw-root <raw>] [--mode okf|profile] [--today YYYY-MM-DD] [--base <commit-ish>]\n",
		);
		process.exitCode = 2;
	});
}
