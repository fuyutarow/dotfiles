import { z } from "./zod.ts";

export const DoctorRecord = z.object({
  tool: z.string().min(1),
  object: z.string().min(1),
  finding: z.string().min(1),
  remedy: z.string().min(1),
});
export type DoctorRecord = z.output<typeof DoctorRecord>;

/** Projection of released C1 CLI JSON, not agx's private persistence format.
 * Ignore additive fields and accept finding names introduced by the owner.
 */
export const DoctorFindings = z.object({
  schema: z.literal(1),
  kinds: z.record(z.string(), z.number().int().nonnegative()),
  lost: z.number().int().nonnegative(),
  complete: z.boolean(),
  captured_at: z.number(),
  stale: z.boolean().optional(),
});

/** Only the findings portion of agx status is consumed by dotfiles doctor. */
export const DoctorStatus = z.object({
  schema: z.literal(1),
  findings: DoctorFindings.pick({ schema: true, complete: true, stale: true })
    .extend({
      findings: z.array(DoctorRecord),
      total: z.number().int().nonnegative(),
    })
    .nullable(),
});
