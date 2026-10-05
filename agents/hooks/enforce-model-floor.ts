// PreToolUse gate (matcher: Bash) — a command that RUNS a model CLI (codex, grok, claude, agy) must
// order a model of the CURRENT generation, never an older one that still answers.
//
// POLICY (owner, 2026-10-03: 「latest model 移行だけにしたい。sol なら 6.1 があるんだから、sol 6.2 や 7
// が出ても通るよう sol>=6.1 のように」, and 「sol, grok だけじゃない、他のモデルについても」). Floors per
// model family live in model-floor.toml beside this file; this file is the mechanism. The parsing of
// the command (quotes, heredocs, wrappers, each CLI's model flag) and the judgment are in
// model-orders.ts, which is pure and unit-tested; the gate only reads the payload, loads the floors,
// and decides.
//
// SCOPE. Only a command that actually runs one of the four CLIs is looked at; every other Bash call
// returns before the config is even read, so a broken floor file can deny `codex exec ...` but can
// never brick the session. A mention of an old order inside a quoted string, a commit message or a
// heredoc is data, not an order, and passes.
//
// FAIL CLOSED on hook errors for the commands in scope (run.sh --fail-closed, matcher "Bash").
// VENDOR-NEUTRAL: wired into Claude Code AND Codex from agents/hooks/hooks.toml, because a Codex
// session orders work from grok and claude the same way. There is deliberately NO bypass: a floor
// that one environment variable lifts is not a floor. MODEL_FLOOR_CONFIG points the hook at another
// config (the test suite's fixtures).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attempt, errorMessage } from "./attempt.ts";
import { decidePre, readStdinJson } from "./lib.ts";
import { strAt } from "./narrow.ts";
import { judge, ordersIn, parseFloorConfig } from "./model-orders.ts";

const CONFIG_PATH =
  process.env.MODEL_FLOOR_CONFIG ?? join(import.meta.dir, "model-floor.toml");

// The cheapest possible test of "might this run a model CLI": the word must appear at all.
const MAYBE_A_MODEL_CLI = /\b(?:codex|grok|claude|agy)\b/u;

const parseToml = (text: string): unknown => Bun.TOML.parse(text);

function loadConfig(): ReturnType<typeof parseFloorConfig> {
  return parseFloorConfig(parseToml(readFileSync(CONFIG_PATH, "utf8")));
}

async function main(): Promise<void> {
  const payload = readStdinJson();
  if (payload === undefined) {
    // FATAL: the payload is not JSON, so no axis could be evaluated; fail closed with the one fix
    decidePre(
      "deny",
      "model-floor: hook error while judging a model order (invalid JSON payload) — failing closed. " +
        "Fix agents/hooks/enforce-model-floor.ts in dotfiles before retrying.",
    );
  }
  if (strAt(payload, "tool_name") !== "Bash") return;
  const command = strAt(payload, "tool_input", "command");
  if (command === undefined || !MAYBE_A_MODEL_CLI.test(command)) return;

  const orders = ordersIn(command);
  if (orders.length === 0) return;

  const loaded = await attempt(loadConfig);
  if (!loaded.ok) {
    // FATAL: without the floors nothing can be judged; the one fix is to repair the file.
    decidePre(
      "deny",
      `model-floor: cannot read ${CONFIG_PATH} (${errorMessage(loaded.error)}). ` +
        `Restore agents/hooks/model-floor.toml, then retry.`,
    );
  }
  const config = loaded.value;
  if (!config.ok) {
    // FATAL: an invalid floor file must not silently fall back to "allow everything".
    decidePre(
      "deny",
      `model-floor: ${CONFIG_PATH} is invalid — ${config.errors.join("; ")}. ` +
        `Fix agents/hooks/model-floor.toml, then retry.`,
    );
  }

  const problems: string[] = [];
  for (const order of orders) {
    const problem = judge(order, config.floors);
    if (problem !== undefined) problems.push(problem);
  }
  if (problems.length === 0) return;

  // BATCHED(orders): every model CLI order in the command is judged independently and all the
  // violations are reported in this one decision, so one retry fixes them all.
  decidePre(
    "deny",
    problems.length === 1
      ? `model-floor: ${problems[0]}. Orders go to the CURRENT generation only; floors: agents/hooks/model-floor.toml.`
      : `model-floor: ${problems.length} violations — fix them all, then re-invoke.\n` +
          problems.map((p) => `  - ${p}`).join("\n") +
          `\nOrders go to the CURRENT generation only; floors: agents/hooks/model-floor.toml.`,
  );
}

const r = await attempt(main);
if (!r.ok) {
  // FATAL: the hook itself failed, so no order could be judged; fail closed with the one fix
  // (report the error) rather than guessing which orders would have been denied.
  decidePre(
    "deny",
    `model-floor: hook error while judging a model order (${errorMessage(r.error)}) — failing closed. ` +
      `Fix agents/hooks/enforce-model-floor.ts in dotfiles before retrying.`,
  );
}
process.exit(0);
