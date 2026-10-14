// Test helpers for the vendor-neutral hooks — each hook runs END-TO-END as a real process with a
// synthetic payload on stdin, the same way both Claude Code and Codex invoke it.

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect } from "bun:test";
import { at, obj, parseJson, strAt } from "../narrow.ts";

const HOOKS_DIR = join(import.meta.dir, "..");

export function runHook(
  name: string,
  payload: unknown,
  env: Record<string, string> = {},
  cwd?: string,
): { code: number | null; stdout: string; stderr: string } {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const baseline =
    name === "enforce-search-route.ts"
      ? process.env.SEARCH_ROUTE_BASELINE_HOOK
      : undefined;
  const hookEnv = {
    ...process.env,
    ...env,
    ...(baseline === undefined ? {} : { HOOK_SLUG: "dotfiles:search-route" }),
  };
  const execute = (script: string) =>
    spawnSync(process.execPath, [script], {
      input,
      env: hookEnv,
      ...(cwd !== undefined && cwd !== "" ? { cwd } : {}),
    });
  const r = execute(join(HOOKS_DIR, name));
  if (baseline !== undefined) {
    const before = execute(baseline);
    expect({
      code: r.status,
      stdout: r.stdout ?? Buffer.alloc(0),
      stderr: r.stderr ?? Buffer.alloc(0),
    }).toEqual({
      code: before.status,
      stdout: before.stdout ?? Buffer.alloc(0),
      stderr: before.stderr ?? Buffer.alloc(0),
    });
  }
  return {
    code: r.status,
    stdout: (r.stdout ?? Buffer.alloc(0)).toString("utf8"),
    stderr: (r.stderr ?? Buffer.alloc(0)).toString("utf8"),
  };
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
  const parsed = parseJson(stdout);
  expect(parsed).not.toBeUndefined();
  const out = at(parsed, "hookSpecificOutput");
  if (obj(out) === undefined) return null;
  return {
    permissionDecision: strAt(out, "permissionDecision"),
    permissionDecisionReason: strAt(out, "permissionDecisionReason"),
    additionalContext: strAt(out, "additionalContext"),
  };
}

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
