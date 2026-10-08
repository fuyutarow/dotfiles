import { jsonOf, z } from "../hooks/zod.ts";
import { fromThrowable } from "neverthrow";

const CacheSchema = z.looseObject({
  host: z.string(),
  available: z.boolean(),
});
const RunSchema = z.looseObject({
  kind: z.literal("run"),
  host: z.string(),
  started_at: z.string(),
  pick: z.looseObject({ source: z.string() }),
  route: z.enum(["codex", "claude"]).optional(),
  stats: z
    .looseObject({ route: z.enum(["codex", "claude"]).optional() })
    .optional(),
});

export function dispatchWarning(
  log: string,
  routeCache: string,
  host: string,
  now: number,
): string | undefined {
  const cache = jsonOf(CacheSchema).safeParse(routeCache);
  if (!cache.success || cache.data.host !== host || !cache.data.available)
    return undefined;
  const cutoff = now - 24 * 60 * 60 * 1000;
  const picks = log
    .split("\n")
    .filter((line) => line !== "")
    .flatMap((line) => {
      const parsed = jsonOf(RunSchema).safeParse(line);
      if (!parsed.success) return [];
      const run = parsed.data;
      const parsedAt = fromThrowable(
        () => Temporal.Instant.from(run.started_at).epochMilliseconds,
        (error) => error,
      )();
      const at = parsedAt.isOk() ? parsedAt.value : Number.NaN;
      if (
        run.host !== host ||
        run.pick.source !== "jev" ||
        !Number.isFinite(at) ||
        at < cutoff ||
        at > now
      )
        return [];
      const route = run.route ?? run.stats?.route;
      return route === undefined ? [] : [{ ...run, route }];
    });
  if (picks.length < 5 || picks.some((run) => run.route === "codex"))
    return undefined;
  return `codex 0/${picks.length} picks ⚠`;
}
