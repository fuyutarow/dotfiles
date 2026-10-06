// PreToolUse gate — the Agent, Task and Workflow tools dispatch nothing; every worker starts
// through `agent-router run`. matcher: Agent|Task|Workflow   (settings.json: run.sh --fail-closed)
//
// THE ROSTER (agents/models/dispatch-roster.toml, read through agents/models/roster.ts) is the one
// home of what may be dispatched, and agent-router is the one entry point: Jev picks a row from the
// brief, luna rows run `codex exec` (codex-run), claude rows run `claude -p` (driving-claude's
// run-claude.ts, bounded by the roster's [claude_run]). Every run is logged, shown on the statusline
// Run: row and gradable — none of which an Agent or Workflow call would be.
//
// History: until 2026-10-06 a claude row ran as the Agent tool (`subagent_type: "<id>"`) and the
// roster switched rows on and off with `enabled`. Owner 2026-10-06: Jev routes everything, luna
// first by a declared bias, no on/off switch — so this hook no longer judges subagent types: it
// denies the tools and points at the entry point, with the table.
//
// FAIL CLOSED: an unreadable roster or any hook error denies; run.sh also denies when bun is
// missing.

import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { strAt } from "../../hooks/narrow.ts";
import { loadRoster, rosterTable } from "../../models/roster.ts";
import { decidePre, readStdinJson } from "./lib.ts";

const ROSTER_FILE = "agents/models/dispatch-roster.toml";
const ENTRY =
  "`agent-router run --prompt-file <brief> --cd <dir> --sandbox read-only|workspace-write` " +
  "from Bash with run_in_background: true";

async function main(): Promise<void> {
  const payload = readStdinJson();
  const tool = strAt(payload, "tool_name") ?? "";
  if (tool !== "Agent" && tool !== "Task" && tool !== "Workflow") return;

  // Test seam: the hook tests point this at a fixture roster. Unset in normal use.
  const rosterPath = process.env.DISPATCH_ROSTER_PATH;
  const loaded = await (rosterPath === undefined || rosterPath === ""
    ? loadRoster()
    : loadRoster(rosterPath));
  if (!loaded.ok) {
    // FATAL: without the roster the coordinator cannot be shown what to run; the one fix is the file.
    decidePre(
      "deny",
      `dispatch-contract: cannot read ${ROSTER_FILE} (${loaded.error}) — fix it, then re-invoke.`,
    );
  }

  // SINGLE-AXIS: one question (is this the entry point?) — the tool is never it, whatever its input.
  decidePre(
    "deny",
    `dispatch-contract: the ${tool} tool dispatches nothing — every worker, luna or claude, starts with ${ENTRY}. ` +
      `Jev picks the row from the brief (luna first: a claude row must be rated well above the best luna row); ` +
      `put scope, risk and difficulty in the brief, and declare the resource class there. ` +
      `For parallel work start several in the background.\nRoster (${ROSTER_FILE}):\n${rosterTable(loaded.value)}`,
  );
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
