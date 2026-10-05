/**
 * Structural floor for TASK-CONTINUATION.md.
 * Consumer: agent/human verdict lines. Exit 0 valid, 1 findings, 2 CLI/environment fatal.
 */

import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import {
  bindContinuationSlot,
  continuationProjectRoot,
  continuationWorkspaceRootFromSlot,
  inspectContinuationRecord,
} from "./continuation-record";

class UsageError extends Error {}

type CheckResult<T> = Result<T, UsageError>;

function inside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot !== "" &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
}

function printBindingFindings(
  slot: string,
  findings: ReturnType<typeof bindContinuationSlot>,
): void {
  for (const finding of findings) {
    process.stdout.write(
      `FAIL ${resolve(slot)}: ${finding.code} ${finding.message}\n`,
    );
  }
  process.stdout.write(`FAIL=${findings.length}\n`);
}

function bindSlotHasFindings(slot: string, path: string): boolean {
  const findings = bindContinuationSlot(slot, path);
  if (findings.length === 0) return false;
  printBindingFindings(slot, findings);
  return true;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

function main(): CheckResult<number> {
  const parsed = cli(
    {
      name: "continuation-check.ts",
      parameters: [],
      flags: { path: String, bindSlot: String },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    return err(
      new UsageError(`unexpected positional argument: ${parsed._[0]}`),
    );
  }
  const path = parsed.flags.path;
  if (path === undefined) {
    return err(
      new UsageError("required option: --path <TASK-CONTINUATION.md>"),
    );
  }
  if (path === "") {
    return err(new UsageError("--path requires a non-empty value"));
  }
  const bindSlot = parsed.flags.bindSlot;
  if (bindSlot === "") {
    return err(new UsageError("--path requires a non-empty value"));
  }

  const absolutePath = resolve(path);
  const cwdRoot = continuationProjectRoot(process.cwd());
  const recordRoot = continuationProjectRoot(dirname(absolutePath));
  function inferRoot(): string | undefined {
    if (recordRoot !== undefined && existsSync(join(recordRoot, ".git"))) {
      return recordRoot;
    }
    if (cwdRoot !== undefined && inside(cwdRoot, absolutePath)) return cwdRoot;
    return recordRoot;
  }
  const inferredRoot = inferRoot();
  const workspaceRoot =
    bindSlot === undefined
      ? inferredRoot
      : continuationWorkspaceRootFromSlot(resolve(bindSlot));
  const inspection = inspectContinuationRecord(absolutePath, workspaceRoot);
  if (inspection.status === "valid") {
    if (bindSlot !== undefined && bindSlotHasFindings(bindSlot, absolutePath)) {
      return ok(1);
    }
    if (bindSlot !== undefined) {
      process.stdout.write(`BOUND ${resolve(bindSlot)} -> ${absolutePath}\n`);
    }
    process.stdout.write(
      `PASS ${absolutePath}: TASK-CONTINUATION schema valid\nFAIL=0\n`,
    );
    return ok(0);
  }
  if (inspection.status === "absent") {
    process.stdout.write(
      `FAIL ${absolutePath}: TCR00 record does not exist\nFAIL=1\n`,
    );
    return ok(1);
  }
  for (const finding of inspection.findings) {
    process.stdout.write(
      `FAIL ${absolutePath}: ${finding.code} ${finding.message}\n`,
    );
  }
  process.stdout.write(`FAIL=${inspection.findings.length}\n`);
  return ok(1);
}

const mainResult = fromThrowable(main)()
  .andThen((result) => result)
  .mapErr(
    (error) =>
      new UsageError(error instanceof Error ? error.message : String(error)),
  );
mainResult.match(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(
      `FATAL: ${error.message}\n` +
        "usage: bun continuation-check.ts --path <TASK-CONTINUATION.md> [--bind-slot <ACTIVE>]\n",
    );
    process.exit(2);
  },
);
