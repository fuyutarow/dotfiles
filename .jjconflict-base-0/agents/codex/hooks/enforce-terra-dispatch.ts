// Codex PreToolUse gate for spawn_agent (hook tool name "Agent"): every subagent names its model
// AND reasoning_effort explicitly, as one of the owner's allowed pairs (ALLOWED below), and declares
// exactly one resource class. Nothing is injected. Fail closed: malformed input exits 2.
// The allowlist is mechanical only; role rationale belongs in orchestrating-agents.

import { readFileSync } from "node:fs";
import { resourceDeclarationResult } from "../../resource-control/lib/dispatch-declaration.ts";
import { attempt } from "../../hooks/attempt.ts";
import { at, obj, parseJson, str, strAt } from "../../hooks/narrow.ts";

// Codex spawn_agent (hooks see it as tool "Agent") takes per-call `model` and
// `reasoning_effort` overrides — both keys observed in this machine's own session records
// (2026-09-27: 132 of 628 spawn_agent calls carried reasoning_effort). Nothing is implicit: both
// must be present and form an allowed pair, so Codex's default_subagent_model /
// default_subagent_reasoning_effort never decide silently. The owner's allowlist (2026-09-27):
const ALLOWED: Record<string, readonly string[] | "any"> = {
  "gpt-5.6-terra": ["high"],
  "gpt-6-sol": ["medium", "high"],
  "gpt-6-luna": "any",
};
const ALLOWED_HELP =
  "model:'gpt-5.6-terra' with reasoning_effort:'high', model:'gpt-6-sol' with " +
  "reasoning_effort:'medium' or 'high', or model:'gpt-6-luna' with any reasoning_effort";

function effortsFor(model: string): string {
  const efforts = ALLOWED[model];
  if (efforts === "any") return "any value";
  return (efforts ?? []).map((e) => `'${e}'`).join(" or ");
}

// One finding for the (model, reasoning_effort) choice: the observed values plus the smallest
// exact edit, or null when the pair is allowed.
function pairProblem(
  model: string | null,
  effort: string | null,
): string | null {
  if (model === null && effort === null) {
    return `no model and no reasoning_effort — add one of: ${ALLOWED_HELP}`;
  }
  if (model === null) {
    const fits = Object.keys(ALLOWED).filter((m) => {
      const efforts = ALLOWED[m];
      return efforts === "any" || (efforts ?? []).includes(effort ?? "");
    });
    return `model is missing (reasoning_effort '${effort}') — add model: ${fits.map((m) => `'${m}'`).join(" or ")}`;
  }
  const efforts = ALLOWED[model];
  if (efforts === undefined) {
    return `model '${model}' is not allowed — ${ALLOWED_HELP}`;
  }
  if (effort === null) {
    return `reasoning_effort is missing for model '${model}' — add reasoning_effort: ${effortsFor(model)}`;
  }
  if (efforts !== "any" && !efforts.includes(effort)) {
    return `model '${model}' with reasoning_effort '${effort}' is not allowed — set reasoning_effort: ${effortsFor(model)}`;
  }
  return null;
}

function denyMalformed(reason: string): never {
  process.stderr.write(`dispatch-contract: ${reason}\n`);
  process.exit(2);
}

function output(decision: "allow" | "deny", reason: string): void {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decision,
        permissionDecisionReason: reason,
      },
    })}\n`,
  );
}

async function main(): Promise<void> {
  const parsed = await attempt(() => parseJson(readFileSync(0, "utf8")));
  if (!parsed.ok) denyMalformed("invalid JSON payload");
  const payload: unknown = parsed.value;
  const input = obj(at(payload, "tool_input"));
  if (
    obj(payload) === undefined ||
    strAt(payload, "tool_name") !== "Agent" ||
    input === undefined
  ) {
    denyMalformed("unverifiable Agent payload");
  }

  const dispatchText = str(at(input, "message")) ?? str(at(input, "prompt"));
  if (dispatchText === undefined)
    denyMalformed("Agent message/prompt must be a string");
  const rawModel = at(input, "model");
  if (rawModel !== undefined && typeof rawModel !== "string")
    denyMalformed("model must be a string");
  const rawEffort = at(input, "reasoning_effort");
  if (rawEffort !== undefined && typeof rawEffort !== "string")
    denyMalformed("reasoning_effort must be a string");
  const model = str(rawModel) ?? null;
  const effort = str(rawEffort) ?? null;

  const problems: string[] = [];
  const resource = resourceDeclarationResult(dispatchText);
  if (!resource.ok) {
    problems.push(resource.reason);
  }
  const pair = pairProblem(model, effort);
  if (pair !== null) problems.push(pair);
  if (problems.length === 0) return;
  // BATCHED(resource, pair): independent checks, reported together in one decision.
  output(
    "deny",
    problems.length === 1
      ? `dispatch-contract: ${problems[0]}.`
      : `dispatch-contract: ${problems.length} violations — fix them all, then re-invoke.\n` +
          problems.map((p) => `  - ${p}`).join("\n"),
  );
}

await main();
