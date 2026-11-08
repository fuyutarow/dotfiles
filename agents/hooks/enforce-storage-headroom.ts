// PreToolUse transport adapter for Claude Code and Codex.
// FAIL CLOSED on runtime errors (run.sh --fail-closed); policy lives in tools/storage-headroom.
import { join } from "node:path";
import { homedir } from "node:os";
import { decide } from "../../tools/storage-headroom/src/decision.ts";
import {
  isReadOnlyBash,
  requestGuestRecovery,
  stateSubtreeBudget,
} from "../../tools/shared/src/storage-headroom.ts";
import { strAt } from "../../tools/shared/src/narrow.ts";
import { decidePre, hookJson, hookStderr, readStdinJson } from "./lib.ts";

const CONFIG_PATH =
  process.env["STORAGE_HEADROOM_CONFIG"] ??
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
  const stateWarnings = await stateSubtreeBudget(
    CONFIG_PATH,
    process.env["HOME"] ?? homedir(),
  ).catch(() => ["state subtree budgets: measurement failed"]);
  // Read-only Bash (no file output, every chained command read-only) passes below the deny line.
  const command = strAt(payload, "tool_input", "command");
  if (
    strAt(payload, "tool_name") === "Bash" &&
    command !== undefined &&
    isReadOnlyBash(command, strAt(payload, "cwd") ?? process.cwd())
  ) {
    if (stateWarnings.length > 0)
      process.stdout.write(
        `${hookJson({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: stateWarnings.join("\n") } })}\n`,
      );
    return;
  }
  const verdict = await decide(payload);
  if (
    verdict.decision === "allow" &&
    verdict.reason === undefined &&
    stateWarnings.length > 0
  ) {
    process.stdout.write(
      `${hookJson({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: stateWarnings.join("\n") } })}\n`,
    );
  }
  if (verdict.decision !== "warn" && verdict.reason !== undefined) {
    const context =
      verdict.decision === "deny" ? verdict.additionalContext : undefined;
    decidePre(
      verdict.decision,
      verdict.reason,
      context !== undefined || stateWarnings.length > 0
        ? {
            additionalContext: [context, ...stateWarnings]
              .filter(Boolean)
              .join("\n"),
          }
        : {},
    );
  }
  if (verdict.decision === "warn") {
    process.stdout.write(
      `${hookJson({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: [verdict.additionalContext, ...stateWarnings].filter(Boolean).join("\n") } })}\n`,
    );
  }
}

if (import.meta.main) await main();
