import { stat } from "node:fs/promises";
import { join } from "node:path";
import { readReceipts, stateDir } from "./receipt.ts";
import { fromThrowable, z } from "@dotfiles/shared/src/zod.ts";
import { fromAsyncThrowable } from "neverthrow";

// Isolated process: no probes, child processes, or writes are reachable here.
export async function receiptsProbe(last: string | undefined) {
  const dir = stateDir();
  const path = join(dir, "log.jsonl");
  const status = await fromAsyncThrowable(() => stat(path))();
  const code = status.isErr()
    ? z.object({ code: z.string() }).safeParse(status.error)
    : null;
  const result =
    status.isErr() && !(code?.success === true && code.data.code === "ENOENT")
      ? status
      : fromThrowable(() => readReceipts(Number(last), dir))();
  if (result.isErr()) {
    process.stderr.write(`${String(result.error)}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`${JSON.stringify(result.value)}\n`);
}
