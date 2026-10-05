// The dispatch roster (agents/models/dispatch-roster.toml), read and rendered in ONE place.
// Consumers: the dispatch hook (agents/claude/hooks/enforce-dispatch-contract.ts), `codex-run
// --choice` (agents/skills/driving-codex/scripts/codex-run.ts) and scripts/render-home.ts (which
// writes rosterPolicy into the deployed ~/.claude/CLAUDE.md).
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

/** The dispatch policy that opens the deployed ~/.claude/CLAUDE.md: the rule, the table, and how
 * to choose and run. scripts/render-home.ts puts it between the roster markers at deploy time, so
 * the repo's agents/claude/CLAUDE.md holds only the markers — one writer per file. */
export function rosterPolicy(r: Roster): string {
  const claudeOn = enabledChoices(r).some((c) => c.route === "claude");
  return [
    `- **Every dispatch goes through \`agent-router run\`: Jev picks one row of this roster from the brief (zero-shot, logged with its probabilities), or you name one with \`--choice\` — no justification line. Luna first: when Jev is unsure or unavailable the default \`${r.default}\` runs, and the receipt says why.**`,
    `  AA = Artificial Analysis Intelligence Index; TB4 = Terminal-Bench 4.0 and SciCode, AA's own runs (percent); list price USD per 1M tokens; as of ${r.as_of}.`,
    "",
    ...rosterTable(r)
      .split("\n")
      .map((l) => (l === "" ? "" : `  ${l}`)),
    "",
    ...(claudeOn
      ? [
          `  How to choose: leave luna rows to Jev; raise the luna effort before leaving luna; take a Claude row for long terminal or agentic loops (the TB4 gap) or judgment.`,
          "  How to run: a luna row is `agent-router run --prompt-file <brief> --cd <dir> --sandbox read-only|workspace-write` from Bash — the one entry point: without --choice Jev picks the row from the brief (falls back to the default, with the reason, when unsure), with `--choice <id>` it takes yours; it logs the pick, shows the run in the statusline, and prints a JSON receipt. Several in the background for parallel work; `agent-router ls` / `agent-router stats`. A Claude row is the Agent tool with `subagent_type` set to the id. The Workflow tool is not used; the dispatch hook denies it, and any off-roster, disabled or luna `subagent_type`, and prints this table.",
        ]
      : [
          `  How to choose: leave it to Jev; name a row only when you know better (e.g. one effort higher after a failed run; \`luna-max\` is the ceiling in this config).`,
          "  How to run: `agent-router run --prompt-file <brief> --cd <dir> --sandbox read-only|workspace-write` from Bash — the one entry point: without --choice Jev picks the row from the brief (falls back to the default, with the reason, when unsure), with `--choice <id>` it takes yours; it logs the pick, shows the run in the statusline, and prints a JSON receipt. Several in the background for parallel work; `agent-router ls` / `agent-router stats`. This config enables no Claude row, so the Agent tool and the Workflow tool dispatch nothing; the dispatch hook denies both and prints this table.",
        ]),
  ].join("\n");
}
