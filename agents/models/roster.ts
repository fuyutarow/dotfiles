// The dispatch roster (agents/models/dispatch-roster.toml), read and rendered in ONE place.
// Consumers: the dispatch hook (agents/claude/hooks/enforce-dispatch-contract.ts), `codex-run
// --choice` (agents/skills/driving-codex/scripts/codex-run.ts) and scripts/render-roster.ts.
// Zero-install like the hooks: zod comes from agents/hooks/zod.ts (the committed bundle).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "../hooks/zod.ts";

export const ROSTER_PATH = join(import.meta.dir, "dispatch-roster.toml");

const ChoiceSchema = z.object({
  id: z.string().regex(/^[a-z]+-[a-z]+$/),
  route: z.enum(["luna", "claude"]),
  model: z.string(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  aa_index: z.number().optional(),
  tb4: z.number().optional(),
  scicode: z.number().optional(),
  coding_agent: z.number().optional(),
  price_in: z.number(),
  price_out: z.number(),
  use_for: z.string(),
});
export type Choice = z.output<typeof ChoiceSchema>;

const RosterSchema = z
  .object({
    schema: z.literal(1),
    as_of: z.string(),
    default: z.string(),
    choice: z.array(ChoiceSchema).min(1),
  })
  .refine((r) => r.choice.some((c) => c.id === r.default), {
    message: "default names no choice id",
  })
  .refine((r) => new Set(r.choice.map((c) => c.id)).size === r.choice.length, {
    message: "choice ids must be unique",
  });
export type Roster = z.output<typeof RosterSchema>;

/** The parsed roster; throws (with zod's reason) when the file is missing or malformed. */
export function loadRoster(path = ROSTER_PATH): Roster {
  return RosterSchema.parse(Bun.TOML.parse(readFileSync(path, "utf8")));
}

const num = (v: number | undefined): string => (v === undefined ? "–" : `${v}`);
const price = (v: number): string => `$${v.toFixed(v < 1 ? 2 : 0)}`;

/** The radio table a coordinator picks from: one row per choice, the default marked ●. */
export function rosterTable(r: Roster): string {
  const head =
    "| pick | id | runs as | AA | TB4 | SciCode | $in/$out | use for |\n" +
    "| :-: | --- | --- | --: | --: | --: | --- | --- |";
  const rows = r.choice.map(
    (c) =>
      `| ${c.id === r.default ? "●" : "○"} | \`${c.id}\` | ${c.route === "luna" ? `\`codex-run --choice ${c.id}\`` : `Agent \`subagent_type:"${c.id}"\``} | ${num(c.aa_index)} | ${num(c.tb4)} | ${num(c.scicode)} | ${price(c.price_in)}/${price(c.price_out)} | ${c.use_for} |`,
  );
  return [head, ...rows].join("\n");
}
