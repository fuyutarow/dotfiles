// Test helpers — each hook is exercised END-TO-END: spawned as a real process with a
// synthetic payload on stdin, asserting on exit code / stdout JSON / stderr. That tests
// the actual hook contract, not just the library functions.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../../../hooks/zod.ts";
import { parseJson } from "../../../hooks/narrow.ts";
import { decoded } from "../../../hooks/tests/decode.ts";
import { AGENT_ROUTER_WORKER_ENV } from "../../../hooks/worker-env.ts";

const HOOKS_DIR = join(import.meta.dir, "..");

export function runHook(
  name: string,
  payload: unknown,
  env: Record<string, string> = {},
  cwd?: string,
): { code: number | null; stdout: string; stderr: string } {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_HOOK_QUIET: "1",
    ...env,
  };
  delete childEnv[AGENT_ROUTER_WORKER_ENV];
  const r = spawnSync(process.execPath, [join(HOOKS_DIR, name)], {
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    encoding: "utf8",
    env: childEnv,
    ...(cwd !== undefined && cwd !== "" ? { cwd } : {}),
  });
  return { code: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

// The hookSpecificOutput a hook prints; only the fields the tests read are named, any other key
// is kept untouched. Every named field is optional because most decisions carry only some of them.
const DecisionSchema = z.looseObject({
  permissionDecision: z.string().optional(),
  permissionDecisionReason: z.string().optional(),
  additionalContext: z.string().optional(),
  hookEventName: z.string().optional(),
  sessionTitle: z.string().optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;
const DecisionEnvelope = z.looseObject({ hookSpecificOutput: DecisionSchema });

// PreToolUse hooks print one decision JSON on stdout (or nothing = silent pass). A caller of
// decisionOf expects a decision: it used to get null on empty stdout and then die on the first
// property read; it now dies here, naming the cause.
export async function decisionOf(
  stdout: string,
): Promise<{ ok: true; value: Decision } | { ok: false; error: string }> {
  if (stdout.trim() === "") {
    return {
      ok: false,
      error:
        "decisionOf: the hook printed nothing (silent pass), so there is no decision",
    };
  }
  return Promise.try(() => decoded(DecisionEnvelope, parseJson(stdout))).then(
    (value) => ({ ok: true as const, value: value.hookSpecificOutput }),
    (error: unknown) => ({ ok: false as const, error: String(error) }),
  );
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
