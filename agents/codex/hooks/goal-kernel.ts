/** codex protocol adapter; semantics remain in agents/goal-kernel. */
import { errorMessage, Result } from "@dotfiles/shared/src/result.ts";
import { jsonText } from "@dotfiles/hooks/zod.ts";
import { processHookEvent } from "@dotfiles/goal-kernel/kernel.ts";
import { hookJson, hookStderr } from "#hooks/lib.ts";
import { parseJson } from "@dotfiles/hooks/narrow.ts";

async function main(): Promise<void> {
  const input = await Result.tryPromise({
    try: async () => {
      const chunks: Buffer[] = [];
      const source: AsyncIterable<Buffer | string> = process.stdin;
      for await (const chunk of source) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString("utf8");
    },
    catch: (e: unknown) => e,
  });
  const parsed = input.isOk() ? jsonText.safeParse(input.value) : undefined;
  if (input.isErr() || parsed?.success !== true) {
    const reason = input.isOk()
      ? (parsed?.error?.issues.map((issue) => issue.message).join("; ") ?? "")
      : errorMessage(input.error);
    hookStderr(`goal-kernel: malformed hook JSON: ${reason}`);
    process.exitCode = 1;
    return;
  }
  const processed = await Result.tryPromise({
    try: () => processHookEvent("codex", parsed.data),
    catch: (e: unknown) => e,
  });
  if (processed.isErr()) {
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
