// Codex PreToolUse gate for spawn_agent (hook tool name "Agent"): every subagent names its model
// AND reasoning_effort explicitly, as one of the owner's allowed pairs (ALLOWED below), and declares
// exactly one resource class. Nothing is injected. Fail closed: malformed input exits 2.
// The allowlist is mechanical only; role rationale belongs in orchestrating-agents. The generation
// floor is shared with enforce-model-floor.ts (agents/hooks/model-floor.toml).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resourceDeclarationResult } from "../../../tools/agent-resource-run/src/lib/dispatch-declaration.ts";
import { attempt } from "../../hooks/attempt.ts";
import {
  compareVersions,
  exampleSlug,
  floorOf,
  modelName,
  parseFloorConfig,
  type Floors,
} from "../../../tools/shared/src/model-orders.ts";
import { at, obj, parseJson, str, strAt } from "../../hooks/narrow.ts";

// Codex spawn_agent (hooks see it as tool "Agent") takes per-call `model` and
// `reasoning_effort` overrides — both keys observed in this machine's own session records
// (2026-09-27: 132 of 628 spawn_agent calls carried reasoning_effort). Nothing is implicit: both
// must be present and form an allowed pair, so Codex's default_subagent_model /
// default_subagent_reasoning_effort never decide silently.
//
// Two owners, two files. WHICH GENERATION may be ordered is the shared floor in
// agents/hooks/model-floor.toml (sol >= 6.1, ...; a newer generation passes with no edit here).
// WHICH EFFORT each family may run at is this table (owner's allowlist, 2026-09-27); a family
// absent from it is not dispatchable at all, whatever its floor says.
const EFFORTS: Record<string, readonly string[] | "any"> = {
  terra: ["high"],
  sol: ["medium", "high"],
  luna: "any",
};

const CONFIG_PATH =
  process.env.MODEL_FLOOR_CONFIG ??
  join(import.meta.dir, "..", "..", "hooks", "model-floor.toml");

function effortsFor(family: string): string {
  const efforts = EFFORTS[family];
  if (efforts === "any") return "any value";
  return (efforts ?? []).map((e) => `'${e}'`).join(" or ");
}

/** The dispatchable slug of a family at its floor, e.g. `gpt-6.1-sol`, or the family name if it has no floor row. */
function slugAtFloor(floors: Floors, family: string): string {
  const row = floors.get(`openai:${family}`);
  return row === undefined ? family : exampleSlug(row);
}

function allowedHelp(floors: Floors): string {
  return Object.keys(EFFORTS)
    .map((family) => {
      const slug = slugAtFloor(floors, family);
      const efforts = EFFORTS[family];
      return efforts === "any"
        ? `model:'${slug}' (or newer) with any reasoning_effort`
        : `model:'${slug}' (or newer) with reasoning_effort:${effortsFor(family)}`;
    })
    .join(", ");
}

// One finding for the (model, reasoning_effort) choice: the observed values plus the smallest
// exact edit, or null when the pair is allowed.
function pairProblem(
  model: string | null,
  effort: string | null,
  floors: Floors,
): string | null {
  const help = allowedHelp(floors);
  if (model === null && effort === null) {
    return `no model and no reasoning_effort — add one of: ${help}`;
  }
  if (model === null) {
    const fits = Object.keys(EFFORTS).filter((family) => {
      const efforts = EFFORTS[family];
      return efforts === "any" || (efforts ?? []).includes(effort ?? "");
    });
    return `model is missing (reasoning_effort '${effort}') — add model: ${fits.map((f) => `'${slugAtFloor(floors, f)}'`).join(" or ")}`;
  }
  const name = modelName(model, "codex");
  const efforts = name === undefined ? undefined : EFFORTS[name.family];
  if (name === undefined || efforts === undefined) {
    return `model '${model}' is not allowed — ${help}`;
  }
  const row = floorOf(floors, name);
  if (row === undefined) {
    return `model '${model}' is not allowed — family '${name.family}' has no floor in agents/hooks/model-floor.toml; ${help}`;
  }
  if (compareVersions(name.version, row.min) < 0) {
    return `model '${model}' is generation ${name.version}, below the ${name.family} floor >= ${row.min} — use '${exampleSlug(row)}' or any newer ${name.family}`;
  }
  if (effort === null) {
    return `reasoning_effort is missing for model '${model}' — add reasoning_effort: ${effortsFor(name.family)}`;
  }
  if (efforts !== "any" && !efforts.includes(effort)) {
    return `model '${model}' with reasoning_effort '${effort}' is not allowed — set reasoning_effort: ${effortsFor(name.family)}`;
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
  if (parsed.value === undefined) denyMalformed("invalid JSON payload");
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
  const floors = await attempt(() =>
    parseFloorConfig(Bun.TOML.parse(readFileSync(CONFIG_PATH, "utf8"))),
  );
  if (!floors.ok) denyMalformed(`cannot read ${CONFIG_PATH}`);
  if (!floors.value.ok)
    denyMalformed(
      `${CONFIG_PATH} is invalid — ${floors.value.errors.join("; ")}`,
    );
  const pair = pairProblem(model, effort, floors.value.floors);
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
