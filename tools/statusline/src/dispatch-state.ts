import { fromThrowable } from "neverthrow";
import { z } from "./zod.ts";
import { actionLine } from "./dispatch-display.ts";
import type { RouteRun } from "./dispatch-runs.ts";

// Consumer projection of released C2 fields, never the private writer's schema.
const Progress = z.object({
  last: z.string().nullable(),
  at: z.string().nullable(),
  commands: z.number().nonnegative().nullable(),
  files: z.number().nonnegative().nullable(),
  cost_usd: z.number().nonnegative().nullable(),
  usage: z
    .object({
      input_tokens: z.number().nonnegative().nullish(),
      cached_input_tokens: z.number().nonnegative().nullish(),
      output_tokens: z.number().nonnegative().nullish(),
    })
    .nullish(),
  session: z.string().nullable(),
});
export function listingProgress(
  value: unknown,
  cwd?: string,
): RouteRun["doing"] {
  const parsed = Progress.safeParse(value);
  if (!parsed.success) return undefined;
  const p = parsed.data;
  let ageSecs: number | undefined;
  if (p.at !== null) {
    const at = p.at;
    ageSecs = fromThrowable(() =>
      Math.max(
        0,
        Math.floor(
          Temporal.Now.instant()
            .since(Temporal.Instant.from(at))
            .total("seconds"),
        ),
      ),
    )().unwrapOr(undefined);
  }
  return {
    last: p.last === null ? "n/a" : (actionLine(p.last, cwd) ?? ""),
    commands: p.commands ?? undefined,
    files: p.files ?? undefined,
    ageSecs,
    ...(p.cost_usd === null ? {} : { costUsd: p.cost_usd }),
    ...(p.usage === null || p.usage === undefined
      ? {}
      : {
          usage: {
            input: p.usage.input_tokens ?? undefined,
            cached: p.usage.cached_input_tokens ?? undefined,
            output: p.usage.output_tokens ?? undefined,
          },
        }),
    ...(p.session === null ? {} : { session: p.session }),
  };
}
