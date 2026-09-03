// Test helpers — each hook is exercised END-TO-END: spawned as a real process with a
// synthetic payload on stdin, asserting on exit code / stdout JSON / stderr. That tests
// the actual hook contract, not just the library functions.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
    env: { ...process.env, CLAUDE_HOOK_QUIET: "1", ...env },
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

export function writeTranscript(entries: unknown[]): string {
  const p = join(tempDir("hooktest-"), "transcript.jsonl");
  writeFileSync(p, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return p;
}

export const user = (text: string) => ({
  type: "user",
  message: { content: [{ type: "text", text }] },
});
export const assistant = (text: string) => ({
  type: "assistant",
  message: { content: [{ type: "text", text }] },
});
// A tool_result carrier — type "user" but no text blocks (bounds the turn like a real one).
export const toolResultUser = () => ({
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: "x" }] },
});

// A HOME with an existing .claude/ dir (for hooks that write logs under ~/.claude).
export function tempHome(): string {
  const home = tempDir("hookhome-");
  mkdirSync(join(home, ".claude"));
  return home;
}
