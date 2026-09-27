// Shared plumbing for VENDOR-NEUTRAL hooks (agents/hooks/), the hook analogue of agents/skills/:
// one source, wired into every agent CLI by hooks.json → scripts/wire-hooks.ts. Bun runtime,
// node:-APIs only, zero npm deps — hooks must never trigger bun's auto-install at hook time.
//
// What makes a hook portable is its PROTOCOL SURFACE, and today Claude Code and Codex share it:
//   - stdin = event JSON with tool_name / tool_input / cwd. Codex canonicalizes every shell call
//     (exec_command, shell, the code-mode `exec` wrapper) to tool_name "Bash" with
//     tool_input.command (codex-rs/hooks/src/events/pre_tool_use.rs), so a Bash gate reads the
//     same field on both.
//   - PreToolUse decision = exit 0 + hookSpecificOutput JSON on stdout. Both honor
//     permissionDecision "deny"/"allow", permissionDecisionReason, and additionalContext.
//     "ask" is Claude-only — Codex marks it a FAILED hook run — so a portable hook never asks.

import { readFileSync } from "node:fs";

export function readStdinJson(): any {
  return JSON.parse(readFileSync(0, "utf8"));
}

// PreToolUse decision — print JSON and exit 0. `extra` merges into hookSpecificOutput
// (e.g. updatedInput). This is the JSON channel: callers must not also exit 2.
export function decidePre(
  decision: "allow" | "deny" | "ask",
  reason: string,
  extra: Record<string, unknown> = {},
): never {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
        ...extra,
      },
    }),
  );
  process.exit(0);
}
