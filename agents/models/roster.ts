// The dispatch roster (agents/models/dispatch-roster.toml), read and rendered in ONE place.
// Consumers: the dispatch hook (agents/claude/hooks/enforce-dispatch-contract.ts), `codex-run
// --choice` (agents/skills/driving-codex/scripts/codex-run.ts) and scripts/render-home.ts (which
// writes rosterPolicy into the deployed ~/.claude/CLAUDE.md).
// Zero-install like the hooks: zod comes from agents/hooks/zod.ts (the committed bundle).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attempt, errorMessage } from "../hooks/attempt.ts";
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

// SELECTION (owner 2026-10-06: 「enabled = true はおかしい。全く tiger styleでもない。lunaが選ばれやすく
// なるbiasは欲しい」). A row in the roster is a candidate; there is no on/off switch, which hid what
// was in effect behind a boolean with no reason. Luna-first is a declared bias instead: Jev's
// probability for each row is multiplied by its route's weight and the highest product wins, so a
// claude row (weight w) is picked only when Jev rates it at least 1/w times the best luna row. The
// weight must state its reason, and both the raw and the weighted numbers are logged per pick.
const Weight = z.number().gt(0).max(1);
const SelectionSchema = z.strictObject({
  route_weight: z.strictObject({ luna: Weight, claude: Weight }),
  reason: z.string().min(40),
});
// Bounds on a claude worker (run through driving-claude's run-claude.ts): a run has a budget and a
// turn limit, both stated, never the CLI's defaults.
const ClaudeRunSchema = z.strictObject({
  max_budget_usd: z.number().gt(0),
  max_turns: z.number().int().positive(),
  reason: z.string().min(20),
});

const RosterSchema = z
  .strictObject({
    schema: z.literal(1),
    as_of: z.iso.date(),
    default: z.string(),
    auto: AutoSchema,
    selection: SelectionSchema,
    claude_run: ClaudeRunSchema,
    sources: z.record(z.string(), z.url()),
    choice: z.array(ChoiceSchema).min(1),
  })
  .refine(
    (r) => r.choice.some((c) => c.id === r.default && c.route === "luna"),
    {
      message:
        "default must name a luna choice id (the fallback must be the cheap route)",
    },
  )
  .refine((r) => new Set(r.choice.map((c) => c.id)).size === r.choice.length, {
    message: "choice ids must be unique",
  });
export type Roster = z.output<typeof RosterSchema>;

export type RosterLoad =
  | { readonly ok: true; readonly value: Roster }
  | { readonly ok: false; readonly error: string };

/** The parsed roster, or why not (missing file, bad TOML, or zod's reason) — never a throw. */
export async function loadRoster(path = ROSTER_PATH): Promise<RosterLoad> {
  const raw = await attempt(() => Bun.TOML.parse(readFileSync(path, "utf8")));
  if (!raw.ok) return { ok: false, error: errorMessage(raw.error) };
  const r = RosterSchema.safeParse(raw.value);
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, error: r.error.message };
}

/** The weight Jev's probability for this row is multiplied by (SELECTION above). */
export const weightOf = (r: Roster, c: Choice): number =>
  r.selection.route_weight[c.route];

const round3 = (x: number): number => Math.round(x * 1000) / 1000;

/** Jev's probability for each roster row times its route weight (roster SELECTION); the best row
 *  and its share of the weighted total. undefined when Jev gave no row any probability. */
export function weighted(
  roster: Roster,
  answer: {
    choice: string;
    probabilities?: Record<string, number> | undefined;
    confidence?: number | undefined;
  },
): { row: Choice; share: number; scores: Record<string, number> } | undefined {
  const probs = answer.probabilities ?? {
    [answer.choice]: answer.confidence ?? 0,
  };
  const scored = roster.choice.map((c) => ({
    row: c,
    score: (probs[c.id] ?? 0) * weightOf(roster, c),
  }));
  const total = scored.reduce((sum, s) => sum + s.score, 0);
  const best = scored.reduce<(typeof scored)[number] | undefined>(
    (top, s) => (top === undefined || s.score > top.score ? s : top),
    undefined,
  );
  if (best === undefined || total <= 0) return undefined;
  return {
    row: best.row,
    share: round3(best.score / total),
    scores: Object.fromEntries(scored.map((s) => [s.row.id, round3(s.score)])),
  };
}

const num = (v: number | undefined): string => (v === undefined ? "–" : `${v}`);
const price = (v: number): string => `$${v.toFixed(v < 1 ? 2 : 0)}`;

/** The roster as a table: every row is a candidate Jev may pick, the default marked ●, each with
 * its selection weight. */
export function rosterTable(r: Roster): string {
  const head =
    "| default | id | route | weight | AA | TB4 | SciCode | $in/$out | use for |\n" +
    "| :-: | --- | --- | --: | --: | --: | --: | --- | --- |";
  const rows = r.choice.map(
    (c) =>
      `| ${c.id === r.default ? "●" : "○"} | \`${c.id}\` | ${c.route} | ${weightOf(r, c)} | ${num(c.aa_index)} | ${num(c.tb4)} | ${num(c.scicode)} | ${price(c.price_in)}/${price(c.price_out)} | ${c.use_for} |`,
  );
  return [head, ...rows].join("\n");
}

/** The dispatch policy that opens the deployed ~/.claude/CLAUDE.md: the rule, the table, and how
 * to choose and run. scripts/render-home.ts puts it between the roster markers at deploy time, so
 * the repo's agents/claude/CLAUDE.md holds only the markers — one writer per file. */
export function rosterPolicy(r: Roster): string {
  const w = r.selection.route_weight;
  return [
    `- **Every dispatch goes through \`agent-router run\`: Jev alone picks one row of this roster from the brief (zero-shot, logged with its probabilities); \`--choice\` is refused — a wrong pick is fixed in the brief or the row's use_for, never by overriding Jev. Luna first by a declared bias: each row's probability is multiplied by its route weight (luna ${w.luna}, claude ${w.claude}), so a claude row wins only when Jev rates it ${Math.round(w.luna / w.claude)}x the best luna row. When Jev is unsure or unavailable the default \`${r.default}\` runs, and the receipt says why.**`,
    `  AA = Artificial Analysis Intelligence Index; TB4 = Terminal-Bench 4.0 and SciCode, AA's own runs (percent); list price USD per 1M tokens; as of ${r.as_of}.`,
    "",
    ...rosterTable(r)
      .split("\n")
      .map((l) => (l === "" ? "" : `  ${l}`)),
    "",
    `  How to choose: you do not — Jev does. Give it what it needs in the brief: scope (files, size), what is at risk (live hooks, harness), expected difficulty.`,
    `  How to run: \`agent-router run --prompt-file <brief> --cd <dir> --sandbox read-only|workspace-write\` from Bash, in the background — the one entry point for luna AND claude rows (a claude row runs \`claude -p\` through driving-claude's run-claude.ts, bounded at $${r.claude_run.max_budget_usd} and ${r.claude_run.max_turns} turns). It logs the pick, shows the run in the statusline, and prints a JSON receipt; \`agent-router grade\` records how it went. The Agent and Workflow tools dispatch nothing: the dispatch hook denies both and prints this table.`,
  ].join("\n");
}
