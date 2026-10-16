// PreToolUse transport adapter for Claude Code and Codex.
// FAIL CLOSED on runtime errors (run.sh --fail-closed); policy lives in tools/storage-headroom.
import { join } from "node:path";
import { decide } from "../../tools/storage-headroom/src/decision.ts";
import { requestGuestRecovery } from "../../tools/shared/src/storage-headroom.ts";
import { decidePre, hookJson, hookStderr, readStdinJson } from "./lib.ts";

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
