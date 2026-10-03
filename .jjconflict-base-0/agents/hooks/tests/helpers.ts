// Test helpers for the vendor-neutral hooks — each hook runs END-TO-END as a real process with a
// synthetic payload on stdin, the same way both Claude Code and Codex invoke it.

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { at, obj, parseJson, strAt } from "../narrow.ts";

const HOOKS_DIR = join(import.meta.dir, "..");

export function runHook(
  name: string,
  payload: unknown,
  env: Record<string, string> = {},
  cwd?: string,
): { code: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [join(HOOKS_DIR, name)], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, ...env },
    ...(cwd ? { cwd } : {}),
  });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// The fields of a PreToolUse decision the hook tests read; a field the hook did not print is undefined.
export type Decision = {
  readonly permissionDecision: string | undefined;
  readonly permissionDecisionReason: string | undefined;
  readonly additionalContext: string | undefined;
};

// PreToolUse hooks print one decision JSON on stdout (or nothing = silent pass).
export function decisionOf(stdout: string): Decision | null {
  if (stdout.trim() === "") return null;
  const out = at(parseJson(stdout), "hookSpecificOutput");
  if (obj(out) === undefined)
    throw new Error(`hook stdout has no hookSpecificOutput object: ${stdout}`);
  return {
    permissionDecision: strAt(out, "permissionDecision"),
    permissionDecisionReason: strAt(out, "permissionDecisionReason"),
    additionalContext: strAt(out, "additionalContext"),
  };
}

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
