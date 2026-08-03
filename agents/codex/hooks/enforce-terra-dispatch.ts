// Consumer: Codex PreToolUse JSON envelope. Fail closed: malformed input exits 2.
// The allowlist is mechanical only; role rationale belongs in orchestrating-agents.

import { readFileSync } from "node:fs";
import {
  RESOURCE_DECLARATION_HELP,
  resourceDeclarationResult,
} from "../../resource-control/lib/dispatch-declaration.ts";

const TERRA = "gpt-5.6-terra";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function denyMalformed(reason: string): never {
  process.stderr.write(`dispatch-contract: ${reason}\n`);
  process.exit(2);
}

function output(
  decision: "allow" | "deny",
  reason: string,
  updatedInput?: Record<string, unknown>,
): void {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
        ...(updatedInput === undefined ? {} : { updatedInput }),
      },
    })}\n`,
  );
}

function main(): void {
  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    denyMalformed("invalid JSON payload");
  }
  if (
    !isRecord(payload) ||
    payload.tool_name !== "Agent" ||
    !isRecord(payload.tool_input)
  ) {
    denyMalformed("unverifiable Agent payload");
  }

  const input = payload.tool_input;
  const dispatchText =
    typeof input.message === "string"
      ? input.message
      : typeof input.prompt === "string"
        ? input.prompt
        : null;
  if (dispatchText === null)
    denyMalformed("Agent message/prompt must be a string");
  const resource = resourceDeclarationResult(dispatchText);
  if (!resource.ok) {
    output(
      "deny",
      `dispatch-contract: ${resource.reason}. Require ${RESOURCE_DECLARATION_HELP}.`,
    );
    return;
  }
  if (!("model" in input)) {
    output("allow", "dispatch-contract: injected model:'gpt-5.6-terra'", {
      ...input,
      model: TERRA,
    });
    return;
  }
  if (typeof input.model !== "string") denyMalformed("model must be a string");
  if (input.model === TERRA) return;
  output(
    "deny",
    `dispatch-contract: model '${input.model}' is not allowed; omit model or use '${TERRA}'.`,
  );
}

main();
