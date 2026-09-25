/**
 * Continuation binding gate for orchestrating sessions (Claude Code hook adapter target).
 * Consumer: the PreToolUse (Agent|Task|Workflow) and SessionStart(compact) hooks.
 *
 * RULE (owner decision 2026-09-25): a session that has BOTH dispatched at least one agent or
 * workflow AND passed at least one compaction must have a bound, valid TASK-CONTINUATION record
 * before it dispatches again. One-shot work and sessions that never dispatch are never asked.
 * Why: a firedancer session ran two days across 29 compactions with no record; the compact
 * summaries dropped handoff facts (arena contract strings, known refutations) and a subagent
 * spent 50 minutes rediscovering them. A session that orchestrates is exactly the one whose
 * state outlives a summary.
 *
 * Counting: a per-session state file holds {dispatches, compactions}, advanced by the events
 * themselves (an allowed dispatch, a SessionStart with source "compact"). The first time the
 * gate sees a session it seeds both counts from the transcript once, so a session already
 * running when the gate was installed is judged by its whole history, not from zero. The
 * transcript can be hundreds of MB, which is why this happens once and not per dispatch.
 *
 * Fail direction: open on internal errors (with a visible systemMessage), like compact-hook.ts —
 * a broken helper must not wedge every dispatch in every session.
 */

import { createHash } from "node:crypto";
import {
	closeSync,
	mkdirSync,
	openSync,
	readFileSync,
	readSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	continuationProjectRoot,
	inspectContinuationRecord,
	type Platform,
	readContinuationBinding,
} from "./continuation-record";

const DISPATCH_TOOLS = new Set(["Agent", "Task", "Workflow"]);
const CHECK_SCRIPT =
	"bun ~/.claude/skills/continuing-long-running-tasks/scripts/continuation-check.ts";

type Counts = { dispatches: number; compactions: number };
type Input = Readonly<Record<string, unknown>>;

function isInput(value: unknown): value is Input {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(input: Input, key: string): string | undefined {
	const value = input[key];
	return typeof value === "string" && value !== "" ? value : undefined;
}

function stateDir(): string {
	return (
		process.env.CONTINUATION_GATE_STATE_DIR ??
		join(homedir(), ".cache", "claude", "continuation-gate")
	);
}

function statePath(platform: Platform, sessionId: string): string {
	const hash = createHash("sha256")
		.update(`${platform}\0${sessionId}`)
		.digest("hex")
		.slice(0, 16);
	return join(stateDir(), `${hash}.json`);
}

function readCounts(path: string): Counts | undefined {
	try {
		const raw = JSON.parse(readFileSync(path, "utf8"));
		if (
			Number.isInteger(raw?.dispatches) &&
			Number.isInteger(raw?.compactions)
		) {
			return { dispatches: raw.dispatches, compactions: raw.compactions };
		}
	} catch {
		// Missing or corrupt: the caller seeds from the transcript.
	}
	return undefined;
}

function writeCounts(path: string, counts: Counts): void {
	mkdirSync(stateDir(), { recursive: true });
	const tmp = `${path}.tmp-${process.pid}`;
	writeFileSync(tmp, JSON.stringify(counts));
	renameSync(tmp, path);
}

function isDispatchLine(line: string): boolean {
	if (
		!line.includes('"type":"assistant"') ||
		!line.includes('"type":"tool_use"')
	) {
		return false;
	}
	try {
		const content = JSON.parse(line)?.message?.content;
		return (
			Array.isArray(content) &&
			content.some(
				(block) =>
					block?.type === "tool_use" && DISPATCH_TOOLS.has(block?.name),
			)
		);
	} catch {
		return false;
	}
}

function isCompactionLine(line: string): boolean {
	if (!line.includes('"compact_boundary"')) return false;
	try {
		const entry = JSON.parse(line);
		return entry?.type === "system" && entry?.subtype === "compact_boundary";
	} catch {
		return false;
	}
}

// Streams the transcript in 1 MiB chunks: a two-day session's JSONL measured 313 MB.
export function countTranscript(path: string): Counts {
	const counts: Counts = { dispatches: 0, compactions: 0 };
	const fd = openSync(path, "r");
	try {
		const buffer = Buffer.allocUnsafe(1 << 20);
		const decoder = new TextDecoder();
		let carry = "";
		while (true) {
			const read = readSync(fd, buffer, 0, buffer.byteLength, null);
			const text =
				carry +
				(read === 0
					? decoder.decode()
					: decoder.decode(buffer.subarray(0, read), { stream: true }));
			const lines = text.split("\n");
			carry = read === 0 ? "" : (lines.pop() ?? "");
			for (const line of lines) {
				if (isDispatchLine(line)) counts.dispatches += 1;
				else if (isCompactionLine(line)) counts.compactions += 1;
			}
			if (read === 0) break;
		}
	} finally {
		closeSync(fd);
	}
	return counts;
}

type BindingState =
	| { ok: true }
	| { ok: false; slot: string; problem: string };

function bindingState(
	platform: Platform,
	cwd: string,
	sessionId: string,
): BindingState | undefined {
	const binding = readContinuationBinding(platform, cwd, sessionId);
	if (binding === undefined) return undefined;
	const codes = (findings: readonly { code: string }[]) =>
		[...new Set(findings.map((f) => f.code))].slice(0, 8).join(",");
	if (binding.status === "unbound") {
		return { ok: false, slot: binding.slot, problem: "no record is bound" };
	}
	if (binding.status === "invalid") {
		return {
			ok: false,
			slot: binding.slot,
			problem: `the binding is invalid (${codes(binding.findings)})`,
		};
	}
	const record = inspectContinuationRecord(
		binding.record,
		continuationProjectRoot(cwd),
	);
	if (record.status === "valid") return { ok: true };
	return {
		ok: false,
		slot: binding.slot,
		problem:
			record.status === "absent"
				? `the bound record ${JSON.stringify(binding.record)} does not exist`
				: `the bound record ${JSON.stringify(binding.record)} fails validation (${codes(record.findings)})`,
	};
}

function requirement(counts: Counts, state: { slot: string; problem: string }) {
	return (
		`continuation-gate: this session has dispatched ${counts.dispatches} agent(s)/workflow(s) ` +
		`and been compacted ${counts.compactions} time(s), so it must carry a bound, valid ` +
		`TASK-CONTINUATION record — but ${state.problem}. Invoke $continuing-long-running-tasks: ` +
		"create one canonical TASK-CONTINUATION.md inside the workspace from its asset (C2 " +
		"INITIALIZE), fill it from verified state (not from the compact summary), then validate " +
		`and bind it with: ${CHECK_SCRIPT} --path '<record>' --bind-slot ` +
		`${JSON.stringify(state.slot)}. Further dispatches are refused until it validates.`
	);
}

export function handleDispatchGate(
	platform: Platform,
	rawInput: unknown,
): string | undefined {
	if (!isInput(rawInput)) return undefined;
	const input = rawInput;
	const event = field(input, "hook_event_name");
	const cwd = field(input, "cwd");
	const sessionId = field(input, "session_id");
	if (event === undefined || cwd === undefined || sessionId === undefined) {
		return undefined;
	}
	const isCompactStart =
		event === "SessionStart" && field(input, "source") === "compact";
	const isDispatch =
		event === "PreToolUse" &&
		DISPATCH_TOOLS.has(field(input, "tool_name") ?? "");
	if (!isCompactStart && !isDispatch) return undefined;

	const path = statePath(platform, sessionId);
	let counts = readCounts(path);
	const seeded = counts === undefined;
	if (counts === undefined) {
		const transcript = field(input, "transcript_path");
		counts =
			transcript === undefined
				? { dispatches: 0, compactions: 0 }
				: countTranscript(transcript);
	}

	if (isCompactStart) {
		// A freshly seeded count already includes this compaction's boundary line.
		if (!seeded) counts.compactions += 1;
		writeCounts(path, counts);
		if (counts.dispatches === 0) return undefined;
		const state = bindingState(platform, cwd, sessionId);
		if (state === undefined || state.ok) return undefined;
		return JSON.stringify({
			hookSpecificOutput: {
				hookEventName: "SessionStart",
				additionalContext: `REQUIRED NOW — ${requirement(counts, state)}`,
			},
		});
	}

	if (counts.dispatches >= 1 && counts.compactions >= 1) {
		const state = bindingState(platform, cwd, sessionId);
		if (state !== undefined && !state.ok) {
			writeCounts(path, counts);
			// SINGLE-AXIS: one condition (orchestrating + compacted + no valid binding) decides.
			return JSON.stringify({
				hookSpecificOutput: {
					hookEventName: "PreToolUse",
					permissionDecision: "deny",
					permissionDecisionReason: requirement(counts, state),
				},
			});
		}
	}
	counts.dispatches += 1;
	writeCounts(path, counts);
	return undefined;
}

export function runDispatchGate(platform: Platform): void {
	try {
		const output = handleDispatchGate(
			platform,
			JSON.parse(readFileSync(0, "utf8")),
		);
		if (output !== undefined) process.stdout.write(`${output}\n`);
	} catch (error) {
		// Fail open, visibly: a broken gate must not wedge every dispatch in every session.
		process.stdout.write(
			`${JSON.stringify({
				systemMessage: `continuation-gate failed open: ${error instanceof Error ? error.message : String(error)}`,
			})}\n`,
		);
	}
}
