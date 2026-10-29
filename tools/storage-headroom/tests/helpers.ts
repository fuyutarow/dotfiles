// Domain tests run the tools entry in an isolated process, without importing a hook.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect } from "bun:test";
import { at, obj, parseJson, strAt } from "@dotfiles/shared/src/narrow.ts";

const message = (text: string) =>
  `[dotfiles:storage-headroom] ${text.replace(/^storage-headroom:\s*/u, "")}`;

// Keep the existing assertions' transport-shaped view while exercising the neutral verdict.
export function runHook(
  _name: string,
  payload: unknown,
  env: Record<string, string> = {},
  cwd?: string,
) {
  // bounded: fixture decisions retain the suite's 30-second bound.
  const r = spawnSync(
    process.execPath,
    [join(import.meta.dir, "fixtures/decide.ts")],
    {
      input: typeof payload === "string" ? payload : JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, ...env },
      timeout: 30_000,
      ...(cwd !== undefined && cwd !== "" ? { cwd } : {}),
    },
  );
  const verdict = parseJson(r.stdout ?? "");
  const decision = strAt(verdict, "decision");
  const reason = strAt(verdict, "reason");
  const context = strAt(verdict, "additionalContext");
  const specific = {
    hookEventName: "PreToolUse",
    ...(decision === "deny" || reason !== undefined
      ? {
          permissionDecision: decision,
          permissionDecisionReason: message(reason ?? ""),
        }
      : {}),
    ...(context === undefined ? {} : { additionalContext: message(context) }),
  };
  return {
    code: r.status,
    stderr: r.stderr ?? "",
    stdout:
      decision === "warn" || decision === "deny" || reason !== undefined
        ? `${JSON.stringify({ hookSpecificOutput: specific })}\n`
        : "",
  };
}

export function decisionOf(stdout: string) {
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
