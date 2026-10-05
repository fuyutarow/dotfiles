// PreToolUse gate — every dispatch picks exactly one roster choice, like a radio button, and
// declares its resource class. Luna first.
// matcher: Agent|Task|Workflow   (settings.json: run.sh --fail-closed)
//
// THE ROSTER (agents/models/dispatch-roster.toml, read through agents/models/roster.ts) is the one
// home of what may be dispatched. Each row is luna (gpt-6-luna, run as `codex-run --choice <id>`
// from the main loop's Bash) or claude (the Agent tool, `subagent_type: "<id>"`).
//
// Policy (owner, 2026-10-05: 「workflowの起動をむしろ禁止すればいいだけでは？？ simplify」):
//   - Agent/Task: subagent_type must be a roster id whose route is "claude". A `model` param, if
//     given, must name that row's family; omitted, the agent definition supplies it. A luna id is
//     denied with the `codex-run` line to run instead: luna is not a subagent, because a luna
//     subagent needs ANTHROPIC_BASE_URL through a gateway, which turns Remote Control off for the
//     whole session (code.claude.com/docs/en/remote-control). Any other name (fork, Explore,
//     general-purpose, …) is denied the same way.
//   - Every Agent/Task prompt declares exactly one resource class (unchanged; see
//     agents/resource-control/lib/dispatch-declaration.ts).
//   - Workflow: denied. Its agents can only be Claude models; luna fan-out is several
//     `codex-run` calls in the background, Claude fan-out is several Agent calls.
//   - No justification line (the old ESCALATE(OPUS)): the choice is the table.
// Every deny prints the table, so the coordinator can pick at once.
//
// FAIL CLOSED: an unreadable roster or any hook error denies; run.sh also denies when bun is
// missing.

import {
  RESOURCE_DECLARATION_HELP,
  resourceDeclarationResult,
} from "../../resource-control/lib/dispatch-declaration.ts";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { at, obj, strAt } from "../../hooks/narrow.ts";
import { loadRoster, rosterTable, type Roster } from "../../models/roster.ts";
import { decidePre, readStdinJson } from "./lib.ts";

const ROSTER_FILE = "agents/models/dispatch-roster.toml";

function familyPattern(family: string): RegExp {
  return new RegExp(`(?:^|[-_])${family}(?:$|[-_])`, "i");
}

function pickHelp(roster: Roster): string {
  return (
    `Pick one row (● = default) from ${ROSTER_FILE}:\n${rosterTable(roster)}\n` +
    `Luna: run \`codex-run --choice <id> --sandbox read-only --cd <dir> --prompt-file <brief>\` from Bash ` +
    `(background it for parallel work). Claude: the Agent tool with subagent_type set to the id.`
  );
}

function lunaLine(id: string): string {
  return `codex-run --choice ${id} --sandbox read-only --cd <dir> --prompt-file <brief>`;
}

function promptResourceProblem(prompt: string | null): string | null {
  if (prompt === null) {
    return `no inspectable prompt, so the resource class cannot be verified; require ${RESOURCE_DECLARATION_HELP}`;
  }
  const resource = resourceDeclarationResult(prompt);
  return resource.ok ? null : resource.reason;
}

async function main(): Promise<void> {
  const payload = readStdinJson();
  const tool = strAt(payload, "tool_name") ?? "";
  if (tool !== "Agent" && tool !== "Task" && tool !== "Workflow") return;

  const loaded = await attempt(() => loadRoster());
  if (!loaded.ok) {
    // FATAL: without the roster no choice can be judged; the one fix is to repair the file.
    decidePre(
      "deny",
      `dispatch-contract: cannot read ${ROSTER_FILE} (${errorMessage(loaded.error)}) — fix it, then re-invoke.`,
    );
  }
  const roster = loaded.value;

  if (tool === "Workflow") {
    // FATAL: the tool itself is not used, so nothing inside the script is worth checking.
    decidePre(
      "deny",
      "dispatch-contract: the Workflow tool is not used (luna first: its agents can only be Claude models). " +
        "Fan out instead: luna workers as several `codex-run --choice <id>` calls in the background from Bash; " +
        `Claude workers as Agent calls.\n${pickHelp(roster)}`,
    );
  }

  const ti = obj(at(payload, "tool_input"));
  if (ti === undefined) {
    // FATAL: with no object there is no prompt and no subagent_type, so no axis can be located.
    decidePre(
      "deny",
      "dispatch-contract: Agent/Task input is malformed and cannot be verified.",
    );
  }

  const problems: string[] = [];
  const subagentType = strAt(ti, "subagent_type") ?? null;
  const model = strAt(ti, "model") ?? null;
  const row = roster.choice.find((c) => c.id === subagentType);
  if (row === undefined) {
    problems.push(
      `${subagentType === null ? "subagent_type is missing" : `subagent_type '${subagentType}' is not a roster choice`}. ${pickHelp(roster)}`,
    );
  } else if (row.route === "luna") {
    problems.push(
      `'${row.id}' is a luna choice, and luna is not a subagent — run it from Bash instead: \`${lunaLine(row.id)}\` ` +
        `(background it for parallel work; it returns a JSON receipt)`,
    );
  } else if (model !== null && !familyPattern(row.model).test(model)) {
    problems.push(
      `model '${model}' does not match subagent_type '${row.id}' (${row.model}) — set model:"${row.model}" or omit it`,
    );
  }

  const prompt = strAt(ti, "prompt") ?? strAt(ti, "message") ?? null;
  const resourceProblem = promptResourceProblem(prompt);
  if (resourceProblem !== null) problems.push(resourceProblem);

  // BATCHED(choice, resource): the roster choice and the resource class are independent, so a
  // caller violating both is told about both at once.
  if (problems.length > 0) {
    decidePre(
      "deny",
      problems.length === 1
        ? `dispatch-contract: ${problems[0] ?? ""}`
        : `dispatch-contract: ${problems.length} violations — fix them all, then re-invoke.\n` +
            problems.map((p) => `  - ${p}`).join("\n"),
    );
  }
}

const r = await attempt(main);
if (!r.ok) {
  // FATAL: the hook itself failed, so no axis could be evaluated; fail closed.
  decidePre(
    "deny",
    `dispatch-contract: hook error while verifying (${errorMessage(r.error)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-dispatch-contract.ts.`,
  );
}
process.exit(0);
