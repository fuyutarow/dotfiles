// The dispatch roster (agents/models/dispatch-roster.toml), read and rendered in ONE place.
// Consumers: the dispatch hook (agents/claude/hooks/enforce-dispatch-contract.ts), `codex-run
// --choice` (agents/skills/driving-codex/scripts/codex-run.ts) and scripts/render-roster.ts.
// Zero-install like the hooks: zod comes from agents/hooks/zod.ts (the committed bundle).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "../hooks/zod.ts";

export const ROSTER_PATH = join(import.meta.dir, "dispatch-roster.toml");

// STRICT objects: an unknown key (a typo such as `enabeld`, or a switch this code does not read,
// such as `allow_claude`) rejects the load instead of being silently dropped — the editor would
// otherwise believe it took effect. Optional numbers mean "not on a primary page", not a default.
const ChoiceSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+-[a-z]+$/u),
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
  // The config switch: off keeps the row fully implemented but out of the table and denied.
  // REQUIRED, no default: a row that omits it fails to load (the hook then fails closed) instead
  // of becoming dispatchable by omission.
  enabled: z.boolean(),
});
export type Choice = z.output<typeof ChoiceSchema>;

// Where Jev is reached: the official API takes a `model`; the reseller's endpoint takes none.
const JevEndpointSchema = z.discriminatedUnion("api", [
  z.strictObject({
    api: z.literal("typesafe"),
    url: z.url(),
    model: z.string().min(1),
  }),
  z.strictObject({ api: z.literal("reseller"), url: z.url() }),
]);
export type JevEndpoint = z.output<typeof JevEndpointSchema>;

const AutoSchema = z.strictObject({
  min_confidence: z.number().min(0).max(1),
  max_task_chars: z.number().int().positive(),
  timeout_ms: z.number().int().positive(),
  no_egress: z.array(z.string()),
  jev: JevEndpointSchema,
});
export type AutoPolicy = z.output<typeof AutoSchema>;

const RosterSchema = z
  .strictObject({
    schema: z.literal(1),
    as_of: z.iso.date(),
    default: z.string(),
    auto: AutoSchema,
    sources: z.record(z.string(), z.url()),
    choice: z.array(ChoiceSchema).min(1),
  })
  .refine((r) => r.choice.some((c) => c.id === r.default && c.enabled), {
    message: "default names no enabled choice id",
  })
  .refine((r) => new Set(r.choice.map((c) => c.id)).size === r.choice.length, {
    message: "choice ids must be unique",
  });
export type Roster = z.output<typeof RosterSchema>;

/** The parsed roster; throws (with zod's reason) when the file is missing or malformed. */
export function loadRoster(path = ROSTER_PATH): Roster {
  return RosterSchema.parse(Bun.TOML.parse(readFileSync(path, "utf8")));
}

/** The rows the current config allows. */
export function enabledChoices(r: Roster): Choice[] {
  return r.choice.filter((c) => c.enabled);
}

const num = (v: number | undefined): string => (v === undefined ? "–" : `${v}`);
const price = (v: number): string => `$${v.toFixed(v < 1 ? 2 : 0)}`;

/** The radio table a coordinator picks from: one row per enabled choice, the default marked ●;
 * disabled rows are named under it so turning one on is discoverable. */
export function rosterTable(r: Roster): string {
  const head =
    "| pick | id | runs as | AA | TB4 | SciCode | $in/$out | use for |\n" +
    "| :-: | --- | --- | --: | --: | --: | --- | --- |";
  const rows = enabledChoices(r).map(
    (c) =>
      `| ${c.id === r.default ? "●" : "○"} | \`${c.id}\` | ${c.route === "luna" ? `\`agent-router run --choice ${c.id}\`` : `Agent \`subagent_type:"${c.id}"\``} | ${num(c.aa_index)} | ${num(c.tb4)} | ${num(c.scicode)} | ${price(c.price_in)}/${price(c.price_out)} | ${c.use_for} |`,
  );
  const off = r.choice.filter((c) => !c.enabled).map((c) => `\`${c.id}\``);
  const note =
    off.length === 0
      ? []
      : [
          "",
          `Disabled in this config: ${off.join(", ")} — set \`enabled = true\` in agents/models/dispatch-roster.toml to allow one.`,
        ];
  return [head, ...rows, ...note].join("\n");
}
