import { z } from "./zod.ts";
import { CccIndexSchema } from "./ccc-model.ts";

export const MemReadingSchema = z.object({
  frac: z.string(), // e.g. "16.2/54.9G"
  pct: z.number(), // used/total*100, unrounded — pctFmt() rounds at render time
  gpuAvg15: z.number().nullable().optional(),
  gpuSamples15: z.number().optional(),
  cccIndexing: CccIndexSchema.optional(),
  // Set only when this is the last GOOD sample served because the fresh one failed (VRAM only):
  // how old it is and why the fresh one failed. render() prints it, so an old number is never
  // shown as if it were current.
  stale: z.object({ secs: z.number(), why: z.string() }).optional(),
});
export type MemReading = z.output<typeof MemReadingSchema>;
export function memReading(
  usedG: number,
  totalG: number,
): MemReading | undefined {
  if (!Number.isFinite(usedG) || !Number.isFinite(totalG) || totalG <= 0)
    return undefined;
  return {
    // used right-aligned to the total's width, so 9.6/170.9 and 19.6/170.9 take the same columns
    frac: `${usedG.toFixed(1).padStart(totalG.toFixed(1).length)}/${totalG.toFixed(1)}G`,
    pct: (usedG / totalG) * 100,
  };
}
