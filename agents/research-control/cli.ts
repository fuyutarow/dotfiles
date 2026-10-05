import { resolve } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../hooks/attempt.ts";
import { jsonText } from "../hooks/zod.ts";
import { checkTrace } from "./trace.ts";

class UsageError extends Error {}
function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__")
    throw new UsageError(`unknown option '--${flag}'`);
}
async function main(): Promise<void> {
  const parsed = await cli(
    {
      name: "research-section-trace",
      parameters: ["<trace>"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length !== 1)
    throw new UsageError(
      "research-section-trace accepts exactly one trace path",
    );
  const traceText = await attempt(() =>
    Bun.file(resolve(parsed._.trace)).text(),
  );
  if (!traceText.ok) {
    throw new UsageError(
      `trace is unreadable JSON: ${errorMessage(traceText.error)}`,
    );
  }
  const parsedTrace = jsonText.safeParse(traceText.value);
  if (!parsedTrace.success) {
    throw new UsageError(
      `trace is unreadable JSON: ${parsedTrace.error.issues[0]?.message ?? "invalid JSON"}`,
    );
  }
  const result = checkTrace(parsedTrace.data);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
if (import.meta.main)
  main().catch((error: unknown) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
