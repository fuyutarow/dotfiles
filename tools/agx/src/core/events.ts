import { z } from "../../../shared/src/zod.ts";

const common = {
  seq: z.number().int().positive(),
  run_id: z.string().min(1),
  at: z.number().optional(),
};

/** Zod contract for each append-only core.jsonl row. */
export const CoreEventSchema = z.discriminatedUnion("type", [
  z.object({
    ...common,
    type: z.literal("admitted"),
    writes: z.array(z.string()),
    cwd: z.string(),
    workspace_root: z.string(),
    ticket: z.string(),
    lineage: z.string(),
  }),
  z.object({
    ...common,
    type: z.literal("running"),
    pid: z.number().int().positive().optional(),
    unit: z.string().optional(),
  }),
  z.object({
    ...common,
    type: z.literal("terminal"),
    outcome: z.enum(["done", "returned", "failed", "timeout", "abandoned"]),
  }),
  z.object({ ...common, type: z.literal("superseded"), by: z.string().min(1) }),
  z.object({
    ...common,
    type: z.literal("judged"),
    decision: z.string(),
    note: z.string().optional(),
    refs: z.array(z.string()).optional(),
  }),
  z.object({ ...common, type: z.literal("disposed"), how: z.string() }),
]);

export type CoreEvent = z.output<typeof CoreEventSchema>;
export type CoreEventInput = CoreEvent extends infer Event
  ? Event extends CoreEvent
    ? Omit<Event, "seq"> & { seq?: number }
    : never
  : never;

/** Stored as one validated JSON object plus newline; seq is strictly increasing within core.jsonl. */
export const parseCoreEvent = (value: unknown) =>
  CoreEventSchema.safeParse(value);
