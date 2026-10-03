/**
 * Structural contract and safe locator for TASK-CONTINUATION.md.
 * Consumer: continuation-check CLI and Codex/Claude compact hooks.
 * Zero dependencies: hook code must never auto-install at lifecycle time.
 */

import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	parse,
	relative,
	resolve,
	sep,
} from "node:path";
import { fromThrowable } from "neverthrow";

export const MAX_RECORD_BYTES = 65_536;

/** `.code` of a caught Node error, if it has one (ENOENT, EEXIST, ...). */
function errorCode(error: unknown): string | undefined {
	if (typeof error !== "object" || error === null) return undefined;
	if (!Reflect.has(error, "code")) return undefined;
	const code: unknown = Reflect.get(error, "code");
	return String(code);
}

const parseInstant = fromThrowable((value: string) =>
	Temporal.Instant.from(value),
);

const statPath = fromThrowable(
	(path: string) => lstatSync(path),
	(error) => errorCode(error),
);

const readPath = fromThrowable(
	(path: string) => readFileSync(path, "utf8"),
	(error) => errorCode(error),
);

export type Platform = "claude" | "codex";

export type Finding = Readonly<{
	code: string;
	message: string;
}>;

export type RecordInspection =
	| Readonly<{ status: "absent" }>
	| Readonly<{ status: "invalid"; findings: readonly Finding[] }>
	| Readonly<{ status: "valid" }>;

export type ContinuationBinding =
	| Readonly<{ status: "unbound"; slot: string }>
	| Readonly<{ status: "invalid"; slot: string; findings: readonly Finding[] }>
	| Readonly<{ status: "bound"; slot: string; record: string }>;

const requiredHeadings = [
	"# TASK CONTINUATION",
	"## Contract",
	"## Established state",
	"## Decisions and assumptions",
	"## Material changes",
	"## Validation",
	"## Drift and blockers",
	"## Handoff",
] as const;

const secretPatterns = [
	/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
	/\b(?:sk|rk|pk)-(?:live|test|proj)-[A-Za-z0-9_-]{12,}\b/,
	/\bgh[opusr]_[A-Za-z0-9]{20,}\b/,
	/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/,
	/\bAKIA[0-9A-Z]{16}\b/,
	/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*\b/i,
	/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|cookie|authorization)\s*[:=]\s*(?!<?redacted>?|\[redacted\]|(?:secret-manager|vault|env):)[^\s]{8,}/i,
	/\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\s*=\s*(?!<?REDACTED>?|\[REDACTED\]|(?:SECRET_MANAGER|VAULT|ENV):)[^\s]{8,}/,
] satisfies RegExp[];

const unsafeReasoningHeading =
	/^#{1,6}\s*(?:chain[- ]of[- ]thought|internal (?:thoughts?|reasoning)|private reasoning|思考過程|内部思考|頭の中)\s*$/im;

const unsafeControlArtifact =
	/```|<\/?(?:system|developer|assistant|tool|invoke|thinking)\b|^\s*(?:system|developer|assistant|tool)\s*:|\b(?:ignore|disregard|override)\b.{0,40}\b(?:instructions?|prompts?|rules?)\b/im;

function metadataValues(text: string, key: string): string[] {
	const pattern = new RegExp(`^${key}:\\s*(.*)$`, "gm");
	return [...text.matchAll(pattern)].map((match) => match[1]?.trim() ?? "");
}

function bulletValues(text: string, key: string): string[] {
	const pattern = new RegExp(`^\\s*-\\s*${key}:\\s*(.*)$`, "gm");
	return [...text.matchAll(pattern)].map((match) => match[1]?.trim() ?? "");
}

function isPlaceholder(value: string): boolean {
	return value === "" || /<[^>]+>|\b(?:TBD|TODO|FIXME)\b|^\[.*\]$/i.test(value);
}

function isoTimestamp(value: string): boolean {
	const match = value.match(
		/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))\s+(.+)$/,
	);
	return (
		match?.[1] !== undefined &&
		match[2]?.trim() !== "" &&
		parseInstant(match[1]).isOk()
	);
}

function oneMetadata(
	findings: Finding[],
	text: string,
	key: string,
): string | undefined {
	const values = metadataValues(text, key);
	if (values.length !== 1) {
		findings.push({
			code: "TCR03",
			message: `${key} must occur exactly once`,
		});
		return undefined;
	}
	const value = values[0];
	if (value === undefined || isPlaceholder(value)) {
		findings.push({
			code: "TCR04",
			message: `${key} is blank or a placeholder`,
		});
		return undefined;
	}
	return value;
}

function oneBullet(
	findings: Finding[],
	text: string,
	key: string,
): string | undefined {
	const values = bulletValues(text, key);
	if (values.length !== 1) {
		findings.push({
			code: "TCR05",
			message: `${key} must occur exactly once`,
		});
		return undefined;
	}
	const value = values[0];
	if (value === undefined || isPlaceholder(value)) {
		findings.push({
			code: "TCR06",
			message: `${key} is blank or a placeholder`,
		});
		return undefined;
	}
	return value;
}

export function validateContinuationRecord(
	text: string,
	expectedPath?: string,
	workspaceRoot?: string,
): readonly Finding[] {
	const findings: Finding[] = [];

	if (Buffer.byteLength(text, "utf8") > MAX_RECORD_BYTES) {
		findings.push({
			code: "TCR01",
			message: `record exceeds ${MAX_RECORD_BYTES} bytes; compact narrative to evidence locators`,
		});
	}

	const presentHeadings = text.match(/^#{1,6}\s+.*$/gm) ?? [];
	let previousIndex = -1;
	for (const heading of requiredHeadings) {
		const occurrences = presentHeadings.filter(
			(candidate) => candidate === heading,
		).length;
		const index = text.indexOf(heading);
		if (occurrences !== 1) {
			findings.push({
				code: "TCR02",
				message: `${heading} must occur exactly once`,
			});
			continue;
		}
		if (index <= previousIndex) {
			findings.push({
				code: "TCR02",
				message: `heading out of order: ${heading}`,
			});
		}
		previousIndex = index;
	}
	for (const heading of presentHeadings) {
		if (!requiredHeadings.some((required) => required === heading)) {
			findings.push({
				code: "TCR31",
				message: `unexpected heading: ${heading}`,
			});
		}
	}

	const schema = oneMetadata(findings, text, "SCHEMA");
	if (schema !== undefined && schema !== "1") {
		findings.push({ code: "TCR07", message: "SCHEMA must be 1" });
	}

	const taskId = oneMetadata(findings, text, "TASK_ID");
	if (
		taskId !== undefined &&
		!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(taskId)
	) {
		findings.push({
			code: "TCR08",
			message: "TASK_ID must be a stable lowercase slug",
		});
	}

	const state = oneMetadata(findings, text, "STATE");
	if (
		state !== undefined &&
		!["active", "blocked", "awaiting-input", "closed"].includes(state)
	) {
		findings.push({ code: "TCR09", message: "STATE is not an allowed value" });
	}

	const revision = oneMetadata(findings, text, "REVISION");
	if (revision !== undefined && !/^[1-9]\d*$/.test(revision)) {
		findings.push({
			code: "TCR10",
			message: "REVISION must be a positive integer",
		});
	}

	const recordPath = oneMetadata(findings, text, "PATH");
	if (recordPath !== undefined && expectedPath !== undefined) {
		const mismatch = fromThrowable((): boolean => {
			const claimedPath = resolve(
				workspaceRoot ?? dirname(expectedPath),
				recordPath,
			);
			return recordPath.includes("\0") || claimedPath !== resolve(expectedPath);
		})();
		if (mismatch.isErr()) {
			findings.push({
				code: "TCR29",
				message: "PATH must be a valid canonical record locus",
			});
		} else if (mismatch.value) {
			findings.push({
				code: "TCR29",
				message: "PATH must resolve to the record being validated",
			});
		}
	}
	const writer = oneMetadata(findings, text, "WRITER");
	if (
		writer !== undefined &&
		writer !== "none" &&
		!/^session:(?:claude|codex)-[a-f0-9]{16}$/.test(writer)
	) {
		findings.push({
			code: "TCR33",
			message:
				"WRITER must be session:<trusted-slot-basename> or none when closed",
		});
	}
	const updated = oneMetadata(findings, text, "UPDATED");
	if (updated !== undefined && !isoTimestamp(updated)) {
		findings.push({
			code: "TCR11",
			message: "UPDATED must contain an ISO-8601 timestamp and actor/source",
		});
	}
	const reconciled = oneMetadata(findings, text, "RECONCILED_AT");
	if (reconciled !== undefined && !isoTimestamp(reconciled)) {
		findings.push({
			code: "TCR12",
			message:
				"RECONCILED_AT must contain an ISO-8601 timestamp and inspected surfaces",
		});
	}

	if (!/^\s+Evidence:\s*\S+/m.test(text)) {
		findings.push({
			code: "TCR13",
			message: "at least one evidence locator is required",
		});
	}

	const verify = oneBullet(findings, text, "VERIFY");
	const result = oneBullet(findings, text, "RESULT");
	if (result !== undefined && !/^(?:pass|fail|not-run)\b/i.test(result)) {
		findings.push({
			code: "TCR14",
			message: "RESULT must begin with pass, fail, or not-run",
		});
	}
	void verify;

	oneBullet(findings, text, "DRIFT");
	oneBullet(findings, text, "BLOCKER");
	const next = oneBullet(findings, text, "NEXT");
	oneBullet(findings, text, "SUCCESS");
	oneBullet(findings, text, "DO_NOT_REDO");

	if (
		state === "closed" &&
		next !== undefined &&
		next.toLowerCase() !== "none"
	) {
		findings.push({
			code: "TCR15",
			message: "closed records require NEXT: none",
		});
	}
	if (state !== undefined && state !== "closed" && writer === "none") {
		findings.push({
			code: "TCR32",
			message: "non-closed records require one named writer locus",
		});
	}
	if (state === "closed" && writer?.toLowerCase() !== "none") {
		findings.push({
			code: "TCR32",
			message: "closed records require WRITER: none",
		});
	}
	if (
		state !== undefined &&
		state !== "closed" &&
		next !== undefined &&
		next.toLowerCase() === "none"
	) {
		findings.push({
			code: "TCR16",
			message: "non-closed records require one executable NEXT",
		});
	}

	if (unsafeReasoningHeading.test(text)) {
		findings.push({
			code: "TCR17",
			message:
				"raw/private reasoning headings are forbidden; record decisions and evidence instead",
		});
	}
	if (secretPatterns.some((pattern) => pattern.test(text))) {
		findings.push({
			code: "TCR18",
			message:
				"probable credential material detected; use a redacted secret-manager locator",
		});
	}
	if (unsafeControlArtifact.test(text)) {
		findings.push({
			code: "TCR30",
			message:
				"prompt/control artifacts are forbidden; paraphrase them as data and evidence",
		});
	}

	return findings;
}

export function continuationProjectRoot(cwd: string): string | undefined {
	if (!isAbsolute(cwd) || cwd.includes("\0")) return undefined;
	let current = resolve(cwd);
	const filesystemRoot = parse(current).root;
	while (true) {
		if (existsSync(join(current, ".git"))) return current;
		if (current === filesystemRoot) return resolve(cwd);
		current = dirname(current);
	}
}

export function continuationSlotPath(
	platform: Platform,
	cwd: string,
	sessionId: string,
): string | undefined {
	const root = continuationProjectRoot(cwd);
	if (root === undefined || sessionId === "" || sessionId.includes("\0")) {
		return undefined;
	}
	const sessionHash = createHash("sha256")
		.update(`${platform}\0${sessionId}`)
		.digest("hex")
		.slice(0, 16);
	return join(
		root,
		".agent-state",
		"continuations",
		`${platform}-${sessionHash}`,
		"ACTIVE",
	);
}

function pathInside(root: string, candidate: string): boolean {
	const pathFromRoot = relative(root, candidate);
	return (
		pathFromRoot !== "" &&
		pathFromRoot !== ".." &&
		!pathFromRoot.startsWith(`..${sep}`) &&
		!isAbsolute(pathFromRoot)
	);
}

function unsafeAncestor(
	root: string,
	candidate: string,
	requireExisting: boolean,
): Finding | undefined {
	const parent = dirname(candidate);
	if (parent === root) return undefined;
	if (!pathInside(root, parent)) {
		return {
			code: "TCR23",
			message: "continuation paths may resolve only inside the workspace root",
		};
	}

	let current = root;
	for (const component of relative(root, parent).split(sep)) {
		current = join(current, component);
		const result = statPath(current);
		if (result.isErr()) {
			if (result.error === "ENOENT" && !requireExisting) return undefined;
			return {
				code: "TCR28",
				message: "continuation path ancestors could not be inspected safely",
			};
		}
		if (result.value.isSymbolicLink() || !result.value.isDirectory()) {
			return {
				code: "TCR27",
				message:
					"continuation path ancestors must be real directories, never symlinks",
			};
		}
	}
	return undefined;
}

export function continuationWorkspaceRootFromSlot(
	slot: string,
): string | undefined {
	if (basename(slot) !== "ACTIVE") return undefined;
	const sessionDirectory = dirname(slot);
	if (!/^(?:claude|codex)-[a-f0-9]{16}$/.test(basename(sessionDirectory))) {
		return undefined;
	}
	const continuationsDirectory = dirname(sessionDirectory);
	if (basename(continuationsDirectory) !== "continuations") return undefined;
	const stateDirectory = dirname(continuationsDirectory);
	if (basename(stateDirectory) !== ".agent-state") return undefined;
	return dirname(stateDirectory);
}

export function readContinuationBindingAtSlot(
	slotPath: string,
): ContinuationBinding | undefined {
	const slot = resolve(slotPath);
	const root = continuationWorkspaceRootFromSlot(slot);
	if (root === undefined) return undefined;
	const unsafeSlotAncestor = unsafeAncestor(root, slot, false);
	if (unsafeSlotAncestor !== undefined) {
		return {
			status: "invalid",
			slot,
			findings: [unsafeSlotAncestor],
		};
	}
	function fatalBinding(code: string | undefined): ContinuationBinding {
		return code === "ENOENT"
			? { status: "unbound", slot }
			: {
					status: "invalid",
					slot,
					findings: [
						{
							code: "TCR24",
							message: "continuation slot could not be inspected safely",
						},
					],
				};
	}

	const statResult = statPath(slot);
	if (statResult.isErr()) return fatalBinding(statResult.error);
	const stat = statResult.value;
	if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 4_096) {
		return {
			status: "invalid",
			slot,
			findings: [
				{
					code: "TCR21",
					message:
						"continuation slot must be a small regular file, never a symlink",
				},
			],
		};
	}
	const readResult = readPath(slot);
	if (readResult.isErr()) return fatalBinding(readResult.error);
	const match = readResult.value.match(/^TCR_PATH:\s*(\S+)\s*$/);
	const relativeRecord = match?.[1];
	if (
		relativeRecord === undefined ||
		isAbsolute(relativeRecord) ||
		relativeRecord.includes("\0")
	) {
		return {
			status: "invalid",
			slot,
			findings: [
				{
					code: "TCR22",
					message: "continuation slot has an invalid TCR_PATH",
				},
			],
		};
	}
	const record = resolve(root, relativeRecord);
	if (!pathInside(root, record)) {
		return {
			status: "invalid",
			slot,
			findings: [
				{
					code: "TCR23",
					message:
						"continuation slot may bind only to a record inside the workspace root",
				},
			],
		};
	}
	const unsafeRecordAncestor = unsafeAncestor(root, record, false);
	if (unsafeRecordAncestor !== undefined) {
		return {
			status: "invalid",
			slot,
			findings: [unsafeRecordAncestor],
		};
	}
	return { status: "bound", slot, record };
}

export function readContinuationBinding(
	platform: Platform,
	cwd: string,
	sessionId: string,
): ContinuationBinding | undefined {
	const slot = continuationSlotPath(platform, cwd, sessionId);
	return slot === undefined ? undefined : readContinuationBindingAtSlot(slot);
}

export function bindContinuationSlot(
	slotPath: string,
	recordPath: string,
): readonly Finding[] {
	const slot = resolve(slotPath);
	const root = continuationWorkspaceRootFromSlot(slot);
	if (root === undefined) {
		return [
			{
				code: "TCR25",
				message:
					"bind slot must be an injected .agent-state/continuations/.../ACTIVE path",
			},
		];
	}
	const record = resolve(recordPath);
	if (!pathInside(root, record)) {
		return [
			{
				code: "TCR23",
				message:
					"continuation slot may bind only to a record inside the workspace root",
			},
		];
	}
	const unsafeSlotAncestor = unsafeAncestor(root, slot, false);
	if (unsafeSlotAncestor !== undefined) return [unsafeSlotAncestor];
	const unsafeRecordAncestor = unsafeAncestor(root, record, false);
	if (unsafeRecordAncestor !== undefined) return [unsafeRecordAncestor];
	const recordInspection = inspectContinuationRecord(record, root);
	if (recordInspection.status === "absent") {
		return [{ code: "TCR00", message: "record does not exist" }];
	}
	if (recordInspection.status === "invalid") {
		return recordInspection.findings;
	}

	// The write closure records its temporary path here; a plain `let` would be narrowed to
	// `undefined` at the cleanup site because the compiler does not track closure assignments.
	const temporary: { path: string | undefined } = { path: undefined };
	const write = fromThrowable((): readonly Finding[] => {
		if (existsSync(slot) && lstatSync(slot).isSymbolicLink()) {
			return [
				{
					code: "TCR21",
					message: "continuation slot must be a regular file, never a symlink",
				},
			];
		}
		mkdirSync(dirname(slot), { recursive: true });
		const createdAncestorFinding = unsafeAncestor(root, slot, true);
		if (createdAncestorFinding !== undefined) {
			return [createdAncestorFinding];
		}
		const portablePath = relative(root, record).split(sep).join("/");
		const temporaryPath = `${slot}.tmp-${process.pid}-${randomUUID()}`;
		temporary.path = temporaryPath;
		writeFileSync(temporaryPath, `TCR_PATH: ${portablePath}\n`, {
			flag: "wx",
			mode: 0o600,
		});
		renameSync(temporaryPath, slot);
		temporary.path = undefined;
		return [];
	});
	const result = write();
	if (result.isOk()) return result.value;
	// Best effort: the exact randomized temporary path is never a binding.
	const leftover = temporary.path;
	if (leftover !== undefined) fromThrowable(() => unlinkSync(leftover))();
	return [
		{
			code: "TCR26",
			message: "continuation slot could not be written safely",
		},
	];
}

export function inspectContinuationRecord(
	path: string,
	workspaceRoot?: string,
): RecordInspection {
	function fatalInspection(code: string | undefined): RecordInspection {
		return code === "ENOENT"
			? { status: "absent" }
			: {
					status: "invalid",
					findings: [
						{ code: "TCR20", message: "record could not be inspected safely" },
					],
				};
	}

	const absolutePath = resolve(path);
	const validationRoot =
		workspaceRoot ?? continuationProjectRoot(dirname(absolutePath));
	if (validationRoot !== undefined) {
		const ancestorFinding = unsafeAncestor(validationRoot, absolutePath, false);
		if (ancestorFinding !== undefined) {
			return { status: "invalid", findings: [ancestorFinding] };
		}
	}
	const statResult = statPath(path);
	if (statResult.isErr()) return fatalInspection(statResult.error);
	const stat = statResult.value;
	if (stat.isSymbolicLink() || !stat.isFile()) {
		return {
			status: "invalid",
			findings: [
				{
					code: "TCR19",
					message:
						"record must be a regular file, never a symlink or special file",
				},
			],
		};
	}
	if (stat.size > MAX_RECORD_BYTES) {
		return {
			status: "invalid",
			findings: [
				{
					code: "TCR01",
					message: `record exceeds ${MAX_RECORD_BYTES} bytes; compact narrative to evidence locators`,
				},
			],
		};
	}
	const readResult = readPath(path);
	if (readResult.isErr()) return fatalInspection(readResult.error);
	const findings = validateContinuationRecord(
		readResult.value,
		absolutePath,
		validationRoot,
	);
	return findings.length === 0
		? { status: "valid" }
		: { status: "invalid", findings };
}
