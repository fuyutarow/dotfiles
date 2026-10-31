import { err, ok, type Result } from "neverthrow";
import { execAsyncWithin } from "./bounded.ts";
import { jsonOf, z } from "./zod.ts";

export const Rows = z.array(
  z.object({
    id: z.string(),
    ticket: z.string(),
    dispatcher_session: z.string().nullable(),
    elapsed_seconds: z.number().nonnegative(),
  }),
);
export type AgxJobRows = z.output<typeof Rows>;

/** A fresh sampler listing; a failed listing never reuses old rows. */
export async function readAgxJobRuns(): Promise<Result<AgxJobRows, string>> {
  const executable = Bun.which("agx", { PATH: process.env["PATH"] ?? "" });
  if (executable === null) return err("no agx");
  const result = await execAsyncWithin(
    "agx",
    executable,
    ["worker", "ls", "--json", "--running"],
    2000,
  );
  if (result.isErr()) return err(result.error.why.replace(/^agx /u, ""));
  const parsed = jsonOf(Rows).safeParse(result.value);
  return parsed.success ? ok(parsed.data) : err("invalid worker listing");
}
