import { err, ok, type Result } from "neverthrow";
import { execAsyncWithin } from "./bounded.ts";
import { jsonOf, recoverInvalid, z } from "./zod.ts";

export const Rows = z.array(
  z.object({
    id: z.string(),
    ticket: z.string(),
    dispatcher_session: z.string().nullable(),
    started_at: z.string().optional(),
    elapsed_seconds: z.number().nonnegative(),
    row: recoverInvalid(z.string()),
    worker_name: recoverInvalid(z.string()),
    workspace_name: recoverInvalid(z.string()),
    phase: recoverInvalid(z.string()),
    progress: z.unknown().optional(),
    cwd: recoverInvalid(z.string()),
    pick_source: recoverInvalid(z.string()),
    continues: z.string().nullable().optional(),
  }),
);
export type AgxJobRows = z.output<typeof Rows>;

/** A bounded sampler listing; the owner retains the last successful result. */
export async function readAgxJobRuns(
  boundMs = 30_000,
): Promise<Result<AgxJobRows, string>> {
  const executable = Bun.which("agx", { PATH: process.env["PATH"] ?? "" });
  if (executable === null) return err("no agx");
  const result = await execAsyncWithin(
    "agx",
    executable,
    ["worker", "ls", "--json", "--running"],
    boundMs,
  );
  if (result.isErr()) return err(result.error.why.replace(/^agx /u, ""));
  const parsed = jsonOf(Rows).safeParse(result.value);
  return parsed.success ? ok(parsed.data) : err("invalid worker listing");
}
