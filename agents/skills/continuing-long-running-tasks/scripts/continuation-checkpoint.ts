/**
 * Single-writer checkpoint transaction for TASK-CONTINUATION.md.
 * A short exclusive lock plus revision/digest CAS prevents accidental stale overwrites.
 */

import { createHash, randomUUID } from "node:crypto";
import {
	closeSync,
	constants,
	fstatSync,
	fsyncSync,
	lstatSync,
	openSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { typeFlag } from "type-flag";
import {
	continuationProjectRoot,
	continuationWorkspaceRootFromSlot,
	inspectContinuationRecord,
	MAX_RECORD_BYTES,
	readContinuationBindingAtSlot,
	validateContinuationRecord,
} from "./continuation-record";

type Snapshot = Readonly<{
	path: string;
	revision: number;
	sha256: string;
	text: string;
	writer: string;
}>;

class TransactionError extends Error {
	constructor(
		readonly code: string,
		message: string,
		readonly exitCode = 1,
	) {
		super(message);
	}
}

function rejectUnknownFlag(
	type: "known-flag" | "unknown-flag" | "argument",
	flag: string,
): void {
	if (type === "unknown-flag") {
		throw new TransactionError("TCR39", `unknown option '--${flag}'`, 2);
	}
}

function nonEmpty(value: string): string {
	if (value === "") throw new TransactionError("TCR39", "empty option", 2);
	return value;
}

function positiveInteger(value: string): number {
	if (!/^[1-9]\d*$/.test(value)) {
		throw new TransactionError(
			"TCR39",
			"--base-revision requires a positive integer",
			2,
		);
	}
	return Number(value);
}

function sha256Value(value: string): string {
	if (!/^[a-f0-9]{64}$/.test(value)) {
		throw new TransactionError(
			"TCR39",
			"--base-sha256 requires 64 lowercase hex characters",
			2,
		);
	}
	return value;
}

function metadata(text: string, key: string): string {
	const values = [...text.matchAll(new RegExp(`^${key}:\\s*(.*)$`, "gm"))].map(
		(match) => match[1]?.trim() ?? "",
	);
	if (values.length !== 1 || values[0] === "") {
		throw new TransactionError("TCR49", `${key} metadata is not singular`);
	}
	return values[0] as string;
}

function digest(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function readRegularText(path: string, code: string): string {
	let descriptor: number | undefined;
	try {
		descriptor = openSync(
			path,
			constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
		);
		const stat = fstatSync(descriptor);
		if (!stat.isFile() || stat.size > MAX_RECORD_BYTES) {
			throw new TransactionError(
				code,
				`file must be regular and at most ${MAX_RECORD_BYTES} bytes`,
			);
		}
		return readFileSync(descriptor, "utf8");
	} catch (error) {
		if (error instanceof TransactionError) throw error;
		throw new TransactionError(code, "file could not be read safely");
	} finally {
		if (descriptor !== undefined) closeSync(descriptor);
	}
}

function workspaceRoot(recordPath: string, slot?: string): string {
	const fromSlot =
		slot === undefined
			? undefined
			: continuationWorkspaceRootFromSlot(resolve(slot));
	const root =
		fromSlot ?? continuationProjectRoot(dirname(resolve(recordPath)));
	if (root === undefined) {
		throw new TransactionError("TCR23", "workspace root is not trustworthy");
	}
	return root;
}

function snapshot(recordPath: string, root: string): Snapshot {
	const path = resolve(recordPath);
	const inspection = inspectContinuationRecord(path, root);
	if (inspection.status === "absent") {
		throw new TransactionError("TCR00", "record does not exist");
	}
	if (inspection.status === "invalid") {
		throw new TransactionError(
			inspection.findings[0]?.code ?? "TCR49",
			inspection.findings.map((finding) => finding.message).join("; "),
		);
	}
	const text = readRegularText(path, "TCR49");
	const findings = validateContinuationRecord(text, path, root);
	if (findings.length > 0) {
		throw new TransactionError(
			findings[0]?.code ?? "TCR49",
			findings.map((finding) => finding.message).join("; "),
		);
	}
	return {
		path,
		revision: Number(metadata(text, "REVISION")),
		sha256: digest(text),
		text,
		writer: metadata(text, "WRITER"),
	};
}

function writerForBoundSlot(slotPath: string, recordPath: string): string {
	const binding = readContinuationBindingAtSlot(resolve(slotPath));
	if (binding?.status !== "bound" || binding.record !== resolve(recordPath)) {
		throw new TransactionError(
			"TCR52",
			"writer slot is not validly bound to this record",
		);
	}
	return `session:${basename(dirname(binding.slot))}`;
}

function proposalText(proposalPath: string, recordPath: string): string {
	const proposal = resolve(proposalPath);
	if (
		proposal === resolve(recordPath) ||
		dirname(proposal) !== dirname(recordPath)
	) {
		throw new TransactionError(
			"TCR49",
			"proposal must be a distinct regular file beside the canonical record",
		);
	}
	try {
		const stat = lstatSync(proposal);
		if (stat.isSymbolicLink() || !stat.isFile()) {
			throw new TransactionError(
				"TCR49",
				"proposal must be a regular file, never a symlink",
			);
		}
	} catch (error) {
		if (error instanceof TransactionError) throw error;
		throw new TransactionError("TCR49", "proposal does not exist");
	}
	return readRegularText(proposal, "TCR49");
}

function requireSameMetadata(
	current: Snapshot,
	proposal: string,
	key: string,
): void {
	if (metadata(current.text, key) !== metadata(proposal, key)) {
		throw new TransactionError("TCR46", `${key} is immutable`);
	}
}

function validateProposal(
	current: Snapshot,
	proposal: string,
	root: string,
	handoffSlot?: string,
): Readonly<{ revision: number; writer: string }> {
	const findings = validateContinuationRecord(proposal, current.path, root);
	if (findings.length > 0) {
		throw new TransactionError(
			findings[0]?.code ?? "TCR49",
			findings.map((finding) => finding.message).join("; "),
		);
	}
	for (const key of ["SCHEMA", "TASK_ID", "PATH"]) {
		requireSameMetadata(current, proposal, key);
	}
	const revision = Number(metadata(proposal, "REVISION"));
	if (revision !== current.revision + 1) {
		throw new TransactionError(
			"TCR45",
			`proposal REVISION must be ${current.revision + 1}`,
		);
	}
	if (metadata(proposal, "UPDATED") === metadata(current.text, "UPDATED")) {
		throw new TransactionError(
			"TCR45",
			"proposal UPDATED must name this checkpoint",
		);
	}

	const writer = metadata(proposal, "WRITER");
	const state = metadata(proposal, "STATE");
	if (writer === current.writer) return { revision, writer };
	if (writer === "none" && state === "closed") return { revision, writer };
	if (handoffSlot !== undefined) {
		const targetWriter = writerForBoundSlot(handoffSlot, current.path);
		if (writer === targetWriter && state !== "closed") {
			return { revision, writer };
		}
	}
	throw new TransactionError(
		"TCR48",
		"WRITER may change only through a pre-bound handoff or an atomic close",
	);
}

function createProposal(path: string, output: string, text: string): string {
	const proposal = resolve(output);
	if (
		proposal === resolve(path) ||
		dirname(proposal) !== dirname(resolve(path))
	) {
		throw new TransactionError(
			"TCR49",
			"proposal must be a distinct file beside the canonical record",
		);
	}
	try {
		writeFileSync(proposal, text, { flag: "wx", mode: 0o600 });
	} catch {
		throw new TransactionError(
			"TCR49",
			"proposal already exists or could not be created",
		);
	}
	return proposal;
}

function applyCheckpoint(args: {
	baseRevision: number;
	baseSha256: string;
	handoffSlot?: string;
	path: string;
	proposal: string;
	writerSlot: string;
}): void {
	const path = resolve(args.path);
	const root = workspaceRoot(path, args.writerSlot);
	const caller = writerForBoundSlot(args.writerSlot, path);
	const lock = join(dirname(path), ".TASK-CONTINUATION.lock");
	let lockHeld = false;
	let temporary: string | undefined;

	try {
		try {
			writeFileSync(
				lock,
				`${JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), transaction: randomUUID() })}\n`,
				{ flag: "wx", mode: 0o600 },
			);
			lockHeld = true;
		} catch {
			throw new TransactionError(
				"TCR40",
				"checkpoint is locked; do not wait or reclaim automatically",
			);
		}

		const current = snapshot(path, root);
		if (current.revision !== args.baseRevision) {
			throw new TransactionError(
				"TCR42",
				`base revision is stale; current is ${current.revision}`,
			);
		}
		if (current.sha256 !== args.baseSha256) {
			throw new TransactionError("TCR43", "base digest is stale");
		}
		if (current.writer !== caller) {
			throw new TransactionError(
				"TCR44",
				`caller is ${caller}, record writer is ${current.writer}`,
			);
		}

		const candidateText = proposalText(args.proposal, path);
		const candidate = validateProposal(
			current,
			candidateText,
			root,
			args.handoffSlot,
		);

		const rechecked = snapshot(path, root);
		if (
			rechecked.revision !== current.revision ||
			rechecked.sha256 !== current.sha256
		) {
			throw new TransactionError(
				"TCR43",
				"record changed while the checkpoint was prepared",
			);
		}

		temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
		const mode = lstatSync(path).mode & 0o777;
		writeFileSync(temporary, candidateText, { flag: "wx", mode });
		const descriptor = openSync(temporary, constants.O_RDONLY);
		try {
			fsyncSync(descriptor);
		} finally {
			closeSync(descriptor);
		}
		renameSync(temporary, path);
		temporary = undefined;

		let proposalRemoved = true;
		try {
			unlinkSync(resolve(args.proposal));
		} catch {
			proposalRemoved = false;
		}
		process.stdout.write(
			`${JSON.stringify({
				path,
				proposal_removed: proposalRemoved,
				revision: candidate.revision,
				sha256: digest(candidateText),
				status: "applied",
				writer: candidate.writer,
			})}\n`,
		);
	} finally {
		if (temporary !== undefined) {
			try {
				unlinkSync(temporary);
			} catch {
				// The randomized incomplete file is never a canonical record.
			}
		}
		if (lockHeld) {
			try {
				unlinkSync(lock);
			} catch {
				// Fail closed on the next update; stale locks require human inspection.
			}
		}
	}
}

function main(): void {
	const parsed = typeFlag(
		{
			"base-revision": { type: positiveInteger },
			"base-sha256": { type: sha256Value },
			"handoff-slot": { type: nonEmpty },
			path: { type: nonEmpty },
			proposal: { type: nonEmpty },
			"writer-slot": { type: nonEmpty },
		},
		Bun.argv.slice(2),
		{ ignore: rejectUnknownFlag },
	);
	const unknown = Object.keys(parsed.unknownFlags);
	if (unknown.length > 0) {
		throw new TransactionError(
			"TCR39",
			`unknown option(s): ${unknown.map((flag) => `--${flag}`).join(", ")}`,
			2,
		);
	}
	if (parsed._.length !== 1) {
		throw new TransactionError(
			"TCR39",
			"expected exactly one action: snapshot or apply",
			2,
		);
	}
	const action = parsed._[0];
	const path = parsed.flags.path;
	if (path === undefined) {
		throw new TransactionError("TCR39", "required option: --path", 2);
	}

	if (action === "snapshot") {
		const root = workspaceRoot(path, parsed.flags["writer-slot"]);
		const current = snapshot(path, root);
		const proposal =
			parsed.flags.proposal === undefined
				? undefined
				: createProposal(path, parsed.flags.proposal, current.text);
		process.stdout.write(
			`${JSON.stringify({
				path: current.path,
				proposal,
				revision: current.revision,
				sha256: current.sha256,
				status: "snapshot",
				writer: current.writer,
			})}\n`,
		);
		return;
	}

	if (action !== "apply") {
		throw new TransactionError("TCR39", `unknown action: ${action}`, 2);
	}
	const baseRevision = parsed.flags["base-revision"];
	const baseSha256 = parsed.flags["base-sha256"];
	const proposal = parsed.flags.proposal;
	const writerSlot = parsed.flags["writer-slot"];
	if (
		baseRevision === undefined ||
		baseSha256 === undefined ||
		proposal === undefined ||
		writerSlot === undefined
	) {
		throw new TransactionError(
			"TCR39",
			"apply requires --base-revision, --base-sha256, --proposal, and --writer-slot",
			2,
		);
	}
	applyCheckpoint({
		baseRevision,
		baseSha256,
		handoffSlot: parsed.flags["handoff-slot"],
		path,
		proposal,
		writerSlot,
	});
}

try {
	main();
} catch (error) {
	const transactionError =
		error instanceof TransactionError
			? error
			: new TransactionError("TCR51", "checkpoint transaction failed", 2);
	process.stderr.write(
		`${JSON.stringify({ code: transactionError.code, message: transactionError.message, status: "error" })}\n`,
	);
	process.exitCode = transactionError.exitCode;
}
