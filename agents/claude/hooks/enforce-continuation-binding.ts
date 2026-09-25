/** Claude Code protocol adapter; the rule and its reasons live in
 * continuing-long-running-tasks/scripts/dispatch-gate.ts. Register on PreToolUse
 * (Agent|Task|Workflow) and SessionStart (compact). The gate fails open by itself. */
import { runDispatchGate } from "../../skills/continuing-long-running-tasks/scripts/dispatch-gate";

runDispatchGate("claude");
