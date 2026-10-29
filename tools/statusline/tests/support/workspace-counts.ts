import { jsonOf, z } from "../../src/zod.ts";
import type { WorkspaceCounts } from "../../src/agx-snapshot.ts";
const WorkspaceCountsSchema = () =>
  z.object({
    total: z.number().int().nonnegative(),
    unlanded: z.number().int().nonnegative(),
    collectable: z.number().int().nonnegative(),
    legacy: z.number().int().nonnegative(),
    capturedAt: z.number(),
    stale: z.boolean().optional(),
    here: z.number().int().nonnegative().optional(),
    fleetKnown: z.boolean().optional(),
  });

export function workspaceCounts(
  output: string,
  capturedAt: number,
): WorkspaceCounts | undefined {
  const parsed = jsonOf(
    z.object({
      counts: WorkspaceCountsSchema().omit({ capturedAt: true }),
      complete: z.literal(true),
    }),
  ).safeParse(output);
  return parsed.success ? { ...parsed.data.counts, capturedAt } : undefined;
}
