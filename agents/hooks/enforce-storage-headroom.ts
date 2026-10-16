// PreToolUse transport adapter for Claude Code and Codex.
// FAIL CLOSED on runtime errors (run.sh --fail-closed); policy lives in tools/storage-headroom.
import { join } from "node:path";
import { decide } from "../../tools/storage-headroom/src/decision.ts";
import { requestGuestRecovery } from "../../tools/shared/src/storage-headroom.ts";
import { decidePre, hookJson, hookStderr, readStdinJson } from "./lib.ts";
import { strAt } from "./narrow.ts";
import { effective, parseShell } from "./shell-syntax.ts";
import { agxWorkspaceAddReason as legacyWorkspaceAddReason } from "../../tools/storage-headroom/src/decision.ts";

// Compatibility for enforce-agx-workspace-add; this adapter owns no workspace policy.
export {
  agxWorkspaceAddReason,
  agxWorkspaceAddWarning,
} from "../../tools/storage-headroom/src/decision.ts";

// Workspace writers belong in the dispatcher's foreground, before any bounded
// storage probe can start jj against the shared store.
function rawWorkspaceAddReason(command: string, cwd: string): string | null {
  const parsed = parseShell(command, cwd);
  for (const item of parsed?.commands ?? []) {
    const call = effective(item);
    if (
      call?.name !== "jj" ||
      call.args.some((arg) => arg === "--help" || arg === "-h")
    )
      continue;
    const workspace = call.args.indexOf("workspace");
    if (workspace >= 0 && call.args[workspace + 1] === "add")
      return "raw jj workspace add is refused; run ws add <ticket-name> [--from <rev>] in the dispatcher's foreground, outside worker units and deadline wrappers";
  }
  return legacyWorkspaceAddReason(command, cwd);
}

const CONFIG_PATH =
  process.env.STORAGE_HEADROOM_CONFIG ??
  join(import.meta.dir, "storage-headroom.toml");

async function main(): Promise<void> {
  const payload = readStdinJson();
  if (payload === undefined) {
    hookStderr("storage-headroom: invalid JSON payload\n");
    process.exitCode = 1;
    return;
  }
  const command = strAt(payload, "tool_input", "command");
  const workspaceReason =
    strAt(payload, "tool_name") === "Bash" && command !== undefined
      ? rawWorkspaceAddReason(command, strAt(payload, "cwd") ?? process.cwd())
      : null;
  if (workspaceReason !== null) {
    // SINGLE-AXIS: workspace preparation must not enter a worker's kill path.
    decidePre("deny", workspaceReason);
  }
  // Guest / and /tmp recover without a human or a tool permission: the pressure check runs on every
  // call, whatever the verdict, and only queues the declared systemd unit. Best effort: it can
  // never change the verdict; the unit's timer covers a hook that is not called.
  await Promise.try(() => requestGuestRecovery(CONFIG_PATH)).then(
    () => {},
    () => {},
  );
  const verdict = await decide(payload);
  if (verdict.decision !== "warn" && verdict.reason !== undefined) {
    decidePre(
      verdict.decision,
      verdict.reason,
      verdict.decision === "deny" && verdict.additionalContext !== undefined
        ? { additionalContext: verdict.additionalContext }
        : {},
    );
  }
  if (verdict.decision === "warn") {
    process.stdout.write(
      `${hookJson({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: verdict.additionalContext } })}\n`,
    );
  }
}

if (import.meta.main) await main();
