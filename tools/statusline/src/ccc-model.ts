import { z } from "./zod.ts";
import { within } from "./bounded.ts";

export const CCC_PROBE_TTL_MS = 60_000;
export const CCC_INDEX_THRESHOLD_MS = 15 * 60_000;
export const CccIndexSchema = z.object({
  at: z.number().int().nonnegative(),
  pid: z.number().int().positive().nullable(),
  since: z.number().int().nonnegative().nullable(),
  deferring: z.string().optional(),
});
export type CccIndex = z.output<typeof CccIndexSchema>;

export function cccBadge(
  observation: CccIndex | undefined,
  now: number,
): string | undefined {
  if (
    observation?.deferring !== undefined &&
    within(observation.at, now, CCC_PROBE_TTL_MS + 15_000)
  )
    return `ccc deferring (${observation.deferring})`;
  if (
    observation === undefined ||
    observation.pid === null ||
    observation.since === null ||
    !within(observation.at, now, CCC_PROBE_TTL_MS + 15_000)
  )
    return undefined;
  const elapsed = now - observation.since;
  return elapsed > CCC_INDEX_THRESHOLD_MS
    ? `ccc indexing ${Math.floor(elapsed / 60_000)}m`
    : undefined;
}
