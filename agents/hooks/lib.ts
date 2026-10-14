// Shared plumbing for VENDOR-NEUTRAL hooks (agents/hooks/), the hook analogue of agents/skills/:
// one source, wired into every agent CLI from hooks.toml by scripts/render-home.ts. Bun runtime,
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

import { readFileSync, readSync } from "node:fs";
import { obj, parseJson } from "./narrow.ts";
import { slugForScript } from "./slugs.ts";

export { bashCwd } from "../../tools/shared/src/bash-cwd.ts";
export { findExe } from "../../tools/shared/src/find-executable.ts";

/** Registry identity, also passed by the renderer for launcher diagnostics. */
export function hookSlug(): string {
  return process.env.HOOK_SLUG ?? slugForScript(Bun.main);
}

export const HOOK_NAMESPACE = "dotfiles";

export function hookPrefix(slug = hookSlug()): string {
  return `[${HOOK_NAMESPACE}:${slug.replace(/^dotfiles:/u, "")}] `;
}

export function hookMessage(text: string, slug = hookSlug()): string {
  // Replace historic ad-hoc labels, preserving everything after them.
  const old = text.replace(
    /^(?:enforce-|detect-|remind-|log-|suggest-|record-)?(?:storage-headroom|model-floor|search-route|repo-bash-deny|reply-language|dispatch-contract|supervised-execution|official-execution|background-waits|no-new-bash|ccc-gpu-hold|goal-kernel|task-continuity|agx-usehooks):\s*/u,
    "",
  );
  const prefix = hookPrefix(slug);
  if (old.startsWith(prefix)) return old;
  const bare = `[${slug}] `;
  return `${prefix}${old.startsWith(bare) ? old.slice(bare.length) : old}`;
}

const MESSAGE_KEYS = new Set([
  "permissionDecisionReason",
  "reason",
  "additionalContext",
  "systemMessage",
  "stopReason",
]);

/** Encode protocol JSON without altering decisions, event names or vendor-specific fields. */
export function hookJson(value: unknown, slug = hookSlug()): string {
  const root = obj(value);
  if (root === undefined) return JSON.stringify(value);
  const prefixFields = (
    record: Record<string, unknown>,
  ): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(record).map(([key, entry]) => [
        key,
        MESSAGE_KEYS.has(key) && typeof entry === "string"
          ? hookMessage(entry, slug)
          : entry,
      ]),
    );
  const specific = obj(root.hookSpecificOutput);
  return JSON.stringify({
    ...prefixFields(root),
    ...(specific === undefined
      ? {}
      : { hookSpecificOutput: prefixFields(specific) }),
  });
}

/** Each stderr line is independently attributable, including multiline Stop diagnostics. */
export function hookStderr(text: string, slug = hookSlug()): void {
  for (const line of text.trimEnd().split("\n")) {
    process.stderr.write(`${hookMessage(line, slug)}\n`);
  }
}

// The event JSON as `unknown`: read fields through ./narrow.ts (obj/str/strAt/...), which return a
// value only if it really has that type. It used to be `any`, which type-checked any field access.
export function readStdinJson(): unknown {
  return parseJson(readFileSync(0, "utf8"));
}

/** Continuity hooks retain their existing 1 MiB input bound. */
export function readBoundedStdinJson(maxBytes = 1_048_576): unknown {
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(65_536, maxBytes - total + 1));
    const count = readSync(0, chunk, 0, chunk.length, null);
    if (count === 0) break;
    total += count;
    if (total > maxBytes) return undefined;
    chunks.push(chunk.subarray(0, count));
  }
  return parseJson(Buffer.concat(chunks, total).toString("utf8"));
}

// PreToolUse decision — print JSON and exit 0. `extra` merges into hookSpecificOutput
// (e.g. updatedInput). This is the JSON channel: callers must not also exit 2.
export function decidePre(
  decision: "allow" | "deny" | "ask",
  reason: string,
  extra: Record<string, unknown> = {},
): never {
  console.log(
    hookJson({
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
