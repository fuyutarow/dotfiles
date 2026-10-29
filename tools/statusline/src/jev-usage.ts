import { resolve } from "node:path";
import { err, ok, fromThrowable, type Result } from "neverthrow";
import { execAsyncWithin } from "./bounded.ts";
import { jsonOf, z } from "./zod.ts";

const USAGE = z.object({
  schema: z.literal(1),
  usage: z.literal("jev"),
  window: z.literal("7d"),
  interval: z.literal("[from,to)"),
  to: z.string(),
  captured_at: z.string(),
  estimated_cost_usd: z.number().nonnegative().nullable(),
});
const MAX_AGE_MS = 300_000;

export type JevUsage = { costUsd: number | undefined };

/** Sampler-only projection of released C6; no private state or local pricing. */
export async function readJevUsage(
  nowMs?: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Result<JevUsage | undefined, string>> {
  const executable = Bun.which("mise", { PATH: env["PATH"] ?? "" });
  if (executable === null) return err("Jev usage unavailable: no mise on PATH");
  const result = await execAsyncWithin(
    "Jev usage",
    executable,
    [
      "-C",
      resolve(import.meta.dir, "../../.."),
      "exec",
      "--",
      "agx",
      "worker",
      "stats",
      "--usage",
      "jev",
      "--window",
      "7d",
    ],
    5000,
    env,
  );
  if (result.isErr()) return err(result.error.why);
  if (result.value.length > 64 * 1024)
    return err("Jev usage output exceeds 64 KiB");
  const parsed = jsonOf(USAGE).safeParse(result.value);
  if (!parsed.success) return err("Jev usage returned invalid schema-1 JSON");
  const usage = parsed.data;
  const times = fromThrowable(() => ({
    to: Temporal.Instant.from(usage.to).epochMilliseconds,
    captured: Temporal.Instant.from(usage.captured_at).epochMilliseconds,
  }))();
  if (times.isErr()) return err("Jev usage has invalid observation time");
  const latest = nowMs ?? Temporal.Now.instant().epochMilliseconds;
  if (
    times.value.to > times.value.captured ||
    times.value.captured > latest ||
    latest - times.value.to > MAX_AGE_MS ||
    latest - times.value.captured > MAX_AGE_MS
  )
    return err("Jev usage observation stale or in the future");
  return ok({ costUsd: usage.estimated_cost_usd ?? undefined });
}

export { jevUsageSegment } from "./provider-display.ts";
