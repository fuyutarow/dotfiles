import { z } from "./zod.ts";

// The fields dotfiles consumes from each agx roster choice. The roster's top-level
// projection differs by consumer, but choice rows share this contract.
export const AgxRosterChoiceSchema = z.object({
  id: z.string(),
  route: z.string(),
  aa_index: z.number().optional(),
  tb4: z.number().optional(),
  tb4_source: z.string().optional(),
  scicode: z.number().optional(),
  scicode_source: z.string().optional(),
  price_in: z.number().optional(),
  price_cached_in: z.number().optional(),
  price_out: z.number().optional(),
  use_for: z.string().optional(),
});
