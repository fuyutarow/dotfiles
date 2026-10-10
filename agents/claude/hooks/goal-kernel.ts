/** claude protocol adapter; semantics remain in agents/goal-kernel. */
import { readFileSync } from "node:fs";
import { jsonText } from "../../hooks/zod.ts";
import { processHookEvent } from "../../goal-kernel/kernel.ts";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { hookJson, hookStderr } from "./lib.ts";
import { parseJson } from "../../hooks/narrow.ts";

async function main(): Promise<void> {
  const input = await attempt(() => readFileSync(0, "utf8"));
  const parsed = input.ok ? jsonText.safeParse(input.value) : undefined;
  if (!input.ok || parsed?.success !== true) {
    const reason = input.ok
      ? (parsed?.error?.issues.map((issue) => issue.message).join("; ") ?? "")
      : errorMessage(input.error);
    hookStderr(`goal-kernel: malformed hook JSON: ${reason}`);
    process.exitCode = 1;
    return;
  }
  const processed = await attempt(() =>
    processHookEvent("claude", parsed.data),
  );
  if (!processed.ok) {
    hookStderr(`goal-kernel: ${errorMessage(processed.error)}`);
    process.exitCode = 1;
    return;
  }
  const result = processed.value;
  if (result.stdout !== "")
    process.stdout.write(`${hookJson(parseJson(result.stdout))}\n`);
  if (result.stderr !== "") hookStderr(result.stderr);
  process.exitCode = result.exit_code;
}
await main();
