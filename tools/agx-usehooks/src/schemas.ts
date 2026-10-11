import { z } from "../../shared/src/zod.ts";
import { GpuReadingSchema } from "../../shared/src/gpu-samples.ts";

export { GpuReadingSchema };
export const GpuUnavailableSchema = z.object({ unavailable: z.string() });
export const GpuSchema = z.union([GpuReadingSchema, GpuUnavailableSchema]);
export const RunSchema = z.object({
  id: z.string(),
  lane: z.string(),
  row: z.string(),
  name: z.string().optional(),
  kind: z.string().optional(),
  labels: z.array(z.string()).optional(),
});
export const RunsSchema = z.array(RunSchema);
export const LaneCountSchema = z.number().int().nonnegative();
export type GpuReading = z.output<typeof GpuReadingSchema>;
export type GpuUnavailable = z.output<typeof GpuUnavailableSchema>;
export type Gpu = z.output<typeof GpuSchema>;
export type Run = z.output<typeof RunSchema>;
export type Runs = z.output<typeof RunsSchema>;
export type LaneCount = z.output<typeof LaneCountSchema>;

/** Contract failures are diagnosed and fail open with a separately parsed fallback. */
export function validated<S extends z.ZodType>(
  schema: S,
  value: unknown,
  fallback: z.output<S>,
): Promise<z.output<S>> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return Promise.resolve(parsed.data);
  process.stderr.write(`agx-usehooks contract: ${parsed.error.message}\n`);
  const recovery = schema.safeParse(fallback);
  if (recovery.success) return Promise.resolve(recovery.data);
  process.stderr.write("agx-usehooks contract: invalid recovery value\n");
  return process.exit(2);
}
