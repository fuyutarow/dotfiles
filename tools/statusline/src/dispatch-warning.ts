// Consumer projection of C5 routing statistics; no owner state-file knowledge.
import { hostname } from "node:os";
import { z } from "./zod.ts";

export const RoutingStatsSchema = z.object({
  schema: z.literal(1),
  observation: z.object({
    window: z.literal("24h"),
    duration_ms: z.literal(86_400_000),
  }),
  host: z.string(),
  jev: z.object({
    denominator: z.number().int().nonnegative(),
    codex_pick_count: z.number().int().nonnegative(),
    codex_share: z.number().min(0).max(1).nullable(),
  }),
  routes: z.object({ codex: z.object({ state: z.string() }) }),
});

export function dispatchWarning(
  stats: z.output<typeof RoutingStatsSchema>,
  host = hostname(),
): string | undefined {
  // C5 1.5.0 reports only unknown/unavailable. Only an affirmative public
  // capability observation may enable this warning; eligibility is not proof.
  if (
    stats.host !== host ||
    stats.routes.codex.state !== "available" ||
    stats.jev.denominator < 5 ||
    stats.jev.codex_pick_count !== 0 ||
    stats.jev.codex_share !== 0
  )
    return undefined;
  return `codex ${stats.jev.codex_pick_count}/${stats.jev.denominator} picks ⚠`;
}
