// PreToolUse gate — the Agent, Task and Workflow tools dispatch nothing; every worker starts
// through `agx run <ticket>`. matcher: Agent|Task|Workflow (settings.json: run.sh --fail-closed)
//
// THE ROSTER (agents/models/dispatch-roster.toml, read through agents/models/roster.ts) is the one
// home of what may be dispatched, and agx is the one entry point: Jev picks a row from the
// brief, codex rows run `codex exec` (agx-run), claude rows run `claude -p` (tools/agx-run/src/workers/run-claude.ts,
// run-claude.ts, bounded by the roster's [claude_run]). Every run is logged, shown on the statusline
// Run: row and gradable — none of which an Agent or Workflow call would be.
//
// History: until 2026-10-06 a claude row ran as the Agent tool (`subagent_type: "<id>"`) and the
// roster switched rows on and off with `enabled`. Owner 2026-10-06: Jev routes everything with no
// on/off switch — so this hook no longer judges subagent types: it
// denies the tools and points at the entry point, with the table.
//
// FAIL CLOSED: an unreadable roster or any hook error denies; run.sh also denies when bun is
// missing.

import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { strAt } from "../../hooks/narrow.ts";
import { loadRoster, rosterTable } from "../../models/roster.ts";
import { decidePre, readStdinJson } from "./lib.ts";

const ROSTER_FILE = "agents/models/dispatch-roster.toml";
const ENTRY = "`agx run <ticket>`";

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
    `dispatch-contract: the ${tool} tool dispatches nothing — every worker starts with ${ENTRY}. ` +
      "Use `agx check <ticket>` to validate a ticket, `agx ls` to inspect runs, " +
      "`agx judge <run> accept|reject` to record a judgment, and `agx stats` for run statistics. " +
      "For durable runs use `systemd-run --user --unit=agt_<slug> --collect -- agx run …`; " +
      `continue with \`agx run <ticket> --continue <run>\`.\nRoster (${ROSTER_FILE}):\n${rosterTable(loaded.value)}`,
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
