// Test helpers for the vendor-neutral hooks — each hook runs END-TO-END as a real process with a
// synthetic payload on stdin, the same way both Claude Code and Codex invoke it.

import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// PreToolUse hooks print one decision JSON on stdout (or nothing = silent pass).
export function decisionOf(stdout: string): any {
  if (stdout.trim() === "") return null;
  return JSON.parse(stdout).hookSpecificOutput;
}

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}
