import { resolve } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../hooks/attempt.ts";
import { jsonText } from "../hooks/zod.ts";
import { checkTrace } from "./trace.ts";

let argvError: string | undefined;
function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__")
    argvError = `unknown option '--${flag}'`;
}
async function main(): Promise<void> {
  if (Bun.argv.slice(2).includes("--__proto__")) {
    process.stderr.write("FATAL: unknown option '--__proto__'\n");
    process.exit(2);
  }
  const parsed = cli(
    {
      name: "research-section-trace",
      parameters: ["<trace>"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (argvError !== undefined) {
    process.stderr.write(`FATAL: ${argvError}\n`);
    process.exitCode = 2;
    return;
  }
  if (parsed._.length !== 1) {
    process.stderr.write(
      "FATAL: research-section-trace accepts exactly one trace path\n",
    );
    process.exitCode = 2;
    return;
  }
  const traceText = await attempt(() =>
    Bun.file(resolve(parsed._.trace)).text(),
  );
  if (!traceText.ok) {
    process.stderr.write(
      `FATAL: trace is unreadable JSON: ${errorMessage(traceText.error)}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const parsedTrace = jsonText.safeParse(traceText.value);
  if (!parsedTrace.success) {
    process.stderr.write(
      `FATAL: trace is unreadable JSON: ${parsedTrace.error.issues[0]?.message ?? "invalid JSON"}\n`,
    );
    process.exitCode = 2;
    return;
  }
  const result = checkTrace(parsedTrace.data);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}
if (import.meta.main) {
  await main().catch((error: unknown) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  });
}
