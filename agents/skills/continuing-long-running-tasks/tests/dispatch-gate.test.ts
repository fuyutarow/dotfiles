import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
	bindContinuationSlot,
	continuationSlotPath,
} from "../scripts/continuation-record";
import { countTranscript, handleDispatchGate } from "../scripts/dispatch-gate";

const temporary: string[] = [];
const temp = (prefix: string): string => {
	const directory = mkdtempSync(join(tmpdir(), prefix));
	temporary.push(directory);
	return directory;
};

let root: string;
beforeEach(() => {
	root = temp("dispatch-gate-root-");
	mkdirSync(join(root, ".git"));
	process.env.CONTINUATION_GATE_STATE_DIR = temp("dispatch-gate-state-");
});
afterEach(() => {
	delete process.env.CONTINUATION_GATE_STATE_DIR;
	for (const d of temporary.splice(0)) rmSync(d, { recursive: true, force: true });
});

const dispatchLine = (name = "Agent") =>
	JSON.stringify({
		type: "assistant",
		message: { content: [{ type: "tool_use", name, input: {} }] },
	});
const compactLine = () =>
	JSON.stringify({ type: "system", subtype: "compact_boundary" });
// A tool RESULT that merely mentions the markers must not count.
const decoyLine = () =>
	JSON.stringify({
		type: "user",
		message: {
			content: [
				{ type: "tool_result", content: '"type":"tool_use","name":"Agent" compact_boundary' },
			],
		},
	});

function transcript(lines: string[]): string {
	const path = join(temp("dispatch-gate-tx-"), "t.jsonl");
	writeFileSync(path, `${lines.join("\n")}\n`);
	return path;
}

const dispatch = (session: string, tx?: string, tool = "Agent") =>
	handleDispatchGate("claude", {
		hook_event_name: "PreToolUse",
		cwd: root,
		session_id: session,
		tool_name: tool,
		...(tx === undefined ? {} : { transcript_path: tx }),
	});
const compactStart = (session: string, tx?: string) =>
	handleDispatchGate("claude", {
		hook_event_name: "SessionStart",
		source: "compact",
		cwd: root,
		session_id: session,
		...(tx === undefined ? {} : { transcript_path: tx }),
	});
const denied = (out: string | undefined) =>
	out !== undefined &&
	JSON.parse(out).hookSpecificOutput?.permissionDecision === "deny";

function bindValidRecord(session: string): void {
	const slot = continuationSlotPath("claude", root, session);
	if (slot === undefined) throw new Error("no slot");
	const path = join(root, ".agent-state", "tasks", "t", "TASK-CONTINUATION.md");
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(
		path,
		`# TASK CONTINUATION

SCHEMA: 1
TASK_ID: t
STATE: active
REVISION: 1
PATH: ${path}
WRITER: session:claude-0123456789abcdef
UPDATED: 2026-09-25T12:00:00+09:00 + Claude
RECONCILED_AT: 2026-09-25T12:00:00+09:00 + git status

## Contract

- Objective: keep the gate honest
- Scope in: gate
- Scope out: everything else
- Constraints: none

## Established state

- Fact: gate exists
  Evidence: scripts/dispatch-gate.ts:1

## Decisions and assumptions

- Decision: count by events; because: scripts/dispatch-gate.ts:1
- Assumption: none; resolution: n/a

## Material changes

- Revision 1: scripts/dispatch-gate.ts; added; git diff

## Validation

- VERIFY: bun test
- RESULT: pass — 1 test

## Drift and blockers

- DRIFT: none
- BLOCKER: none

## Handoff

- NEXT: run the tests
- SUCCESS: tests pass
- DO_NOT_REDO: none
`,
	);
	expect(bindContinuationSlot(slot, path)).toEqual([]);
}

describe("dispatch gate", () => {
	test("one-shot: dispatches without any compaction are never gated", () => {
		for (let i = 0; i < 5; i++) expect(dispatch("s")).toBeUndefined();
	});

	test("compaction without any dispatch is never gated", () => {
		expect(compactStart("s")).toBeUndefined();
		expect(compactStart("s")).toBeUndefined();
	});

	test("dispatched then compacted: next dispatch is denied with the bind command and slot", () => {
		expect(dispatch("s")).toBeUndefined();
		const context = compactStart("s");
		expect(context).toContain("REQUIRED NOW");
		const out = dispatch("s");
		expect(denied(out)).toBe(true);
		const reason: string = JSON.parse(out as string).hookSpecificOutput
			.permissionDecisionReason;
		expect(reason).toContain("--bind-slot");
		expect(reason).toContain(".agent-state/continuations/");
		expect(reason).toContain("no record is bound");
	});

	test("a bound, valid record lets the orchestrating session dispatch", () => {
		dispatch("s");
		compactStart("s");
		bindValidRecord("s");
		expect(dispatch("s")).toBeUndefined();
	});

	test("Workflow and legacy Task dispatches count and are gated like Agent", () => {
		dispatch("s", undefined, "Workflow");
		compactStart("s");
		expect(denied(dispatch("s", undefined, "Task"))).toBe(true);
	});

	test("a session already running when the gate arrives is seeded from its transcript", () => {
		const tx = transcript([dispatchLine("Workflow"), compactLine()]);
		expect(denied(dispatch("old", tx))).toBe(true);
	});

	test("transcript seeding ignores tool results that merely quote the markers", () => {
		const tx = transcript([decoyLine(), decoyLine(), dispatchLine()]);
		expect(countTranscript(tx)).toEqual({ dispatches: 1, compactions: 0 });
		expect(dispatch("quoted", tx)).toBeUndefined();
	});

	test("other tools and other events pass untouched", () => {
		dispatch("s");
		compactStart("s");
		expect(
			handleDispatchGate("claude", {
				hook_event_name: "PreToolUse",
				cwd: root,
				session_id: "s",
				tool_name: "Bash",
			}),
		).toBeUndefined();
		expect(
			handleDispatchGate("claude", {
				hook_event_name: "SessionStart",
				source: "startup",
				cwd: root,
				session_id: "s",
			}),
		).toBeUndefined();
	});
});
