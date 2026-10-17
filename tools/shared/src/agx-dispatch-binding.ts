import { z } from "./zod.ts";

export const DispatchBindingSchema = z.strictObject({
  id: z.uuid(),
  ticket: z.string().min(1),
  workspace: z.string().min(1),
  unit: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_.@-]*$/u),
});

export type DispatchBinding = z.output<typeof DispatchBindingSchema>;
