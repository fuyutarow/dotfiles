/**
 * Structural floor for TASK-CONTINUATION.md.
 * Consumer: agent/human verdict lines. Exit 0 valid, 1 findings, 2 CLI/environment fatal.
 */

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import {
	bindContinuationSlot,
	continuationProjectRoot,
	continuationWorkspaceRootFromSlot,
	inspectContinuationRecord,
} from "./continuation-record";

class UsageError extends Error {}

function rejectPrototypeFlag(type: string, flag: string): void {
	if (type === "unknown-flag" && flag === "__proto__") {
		throw new UsageError(`unknown option '--${flag}'`);
	}
}

function nonEmptyPath(value: string): string {
	if (value === "") throw new UsageError("--path requires a non-empty value");
	return value;
}

function inside(root: string, candidate: string): boolean {
	const pathFromRoot = relative(root, candidate);
	return (
		pathFromRoot !== "" &&
		pathFromRoot !== ".." &&
		!pathFromRoot.startsWith(`..${sep}`) &&
		!isAbsolute(pathFromRoot)
	);
}

function main(): void {
	const parsed = cli(
		{
			name: "continuation-check.ts",
			parameters: [],
			flags: { path: nonEmptyPath, bindSlot: nonEmptyPath },
			strictFlags: true,
			ignoreArgv: rejectPrototypeFlag,
		},
		undefined,
		Bun.argv.slice(2),
	);
	if (parsed._.length > 0) {
		throw new UsageError(`unexpected positional argument: ${parsed._[0]}`);
	}
	const path = parsed.flags.path;
	if (path === undefined)
		throw new UsageError("required option: --path <TASK-CONTINUATION.md>");

	const absolutePath = resolve(path);
	const bindSlot = parsed.flags.bindSlot;
	const cwdRoot = continuationProjectRoot(process.cwd());
	const recordRoot = continuationProjectRoot(dirname(absolutePath));
	const inferredRoot =
		recordRoot !== undefined && existsSync(join(recordRoot, ".git"))
			? recordRoot
			: cwdRoot !== undefined && inside(cwdRoot, absolutePath)
				? cwdRoot
				: recordRoot;
	const workspaceRoot =
		bindSlot === undefined
			? inferredRoot
			: continuationWorkspaceRootFromSlot(resolve(bindSlot));
	const inspection = inspectContinuationRecord(absolutePath, workspaceRoot);
	if (inspection.status === "valid") {
		if (bindSlot !== undefined) {
			const findings = bindContinuationSlot(bindSlot, absolutePath);
			if (findings.length > 0) {
				for (const finding of findings) {
					process.stdout.write(
						`FAIL ${resolve(bindSlot)}: ${finding.code} ${finding.message}\n`,
					);
				}
				process.stdout.write(`FAIL=${findings.length}\n`);
				process.exitCode = 1;
				return;
			}
			process.stdout.write(`BOUND ${resolve(bindSlot)} -> ${absolutePath}\n`);
		}
		process.stdout.write(
			`PASS ${absolutePath}: TASK-CONTINUATION schema valid\nFAIL=0\n`,
		);
		return;
	}
	if (inspection.status === "absent") {
		process.stdout.write(
			`FAIL ${absolutePath}: TCR00 record does not exist\nFAIL=1\n`,
		);
		process.exitCode = 1;
		return;
	}
	for (const finding of inspection.findings) {
		process.stdout.write(
			`FAIL ${absolutePath}: ${finding.code} ${finding.message}\n`,
		);
	}
	process.stdout.write(`FAIL=${inspection.findings.length}\n`);
	process.exitCode = 1;
}

try {
	main();
} catch (error) {
	process.stderr.write(
		`FATAL: ${error instanceof Error ? error.message : String(error)}\n` +
			"usage: bun continuation-check.ts --path <TASK-CONTINUATION.md> [--bind-slot <ACTIVE>]\n",
	);
	process.exitCode = 2;
}
