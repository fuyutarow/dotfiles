// PreToolUse transport adapter for Claude Code and Codex.
// FAIL CLOSED on runtime errors (run.sh --fail-closed); policy lives in tools/storage-headroom.
import { decide } from "../../tools/storage-headroom/src/decision.ts";
import { decidePre, hookJson, hookStderr, readStdinJson } from "./lib.ts";

// Compatibility for enforce-agx-workspace-add; this adapter owns no workspace policy.
export { agxWorkspaceAddReason } from "../../tools/storage-headroom/src/decision.ts";

async function main(): Promise<void> {
  const payload = readStdinJson();
  if (payload === undefined) {
    hookStderr("storage-headroom: invalid JSON payload\n");
    process.exitCode = 1;
    return;
  }
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
