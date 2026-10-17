// The dispatch roster (agents/models/dispatch-roster.toml), read and rendered in ONE place.
// Consumers: the dispatch hook (agents/claude/hooks/enforce-dispatch-contract.ts), the codex worker's
// `--choice` (tools/agx-run/src/workers/codex.ts) and scripts/render-home.ts (which
// writes rosterPolicy into the deployed ~/.claude/CLAUDE.md).
// Zero-install like the hooks: zod comes from agents/hooks/zod.ts (the committed bundle).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { attempt, errorMessage } from "../hooks/attempt.ts";
import { z } from "../hooks/zod.ts";

export const ROSTER_PATH = join(import.meta.dir, "dispatch-roster.toml");

// STRICT objects: an unknown key (a typo such as `enabeld`, or a switch this code does not read,
// such as `allow_claude`) rejects the load instead of being silently dropped — the editor would
// otherwise believe it took effect. Optional numbers mean "not on a primary page", not a default.
const RouteSchema = z.enum(["codex", "claude"]);
const ChoiceSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+-[a-z]+$/u),
  route: RouteSchema,
  model: z.string(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  aa_index: z.number().optional(),
  tb4: z.number().optional(),
  tb4_source: z.url().optional(),
  scicode: z.number().optional(),
  scicode_source: z.url().optional(),
  coding_agent: z.number().optional(),
  price_in: z.number().optional(),
  price_cached_in: z.number().optional(),
  price_out: z.number().optional(),
  use_for: z.string(),
});
export type Choice = z.output<typeof ChoiceSchema>;

// Where Jev is reached: the official API takes a `model`; the reseller's endpoint takes none.
const JevEndpointSchema = z.discriminatedUnion("api", [
  z.strictObject({
    api: z.literal("typesafe"),
    url: z.url(),
    model: z.string().min(1),
    price_per_mtok_input: z.number().nonnegative().optional(),
    price_per_mtok_output: z.number().nonnegative().optional(),
  }),
  z.strictObject({
    api: z.literal("reseller"),
    url: z.url(),
    price_per_mtok_input: z.number().nonnegative().optional(),
    price_per_mtok_output: z.number().nonnegative().optional(),
  }),
]);
export type JevEndpoint = z.output<typeof JevEndpointSchema>;

const AutoSchema = z.strictObject({
  routes: z
    .array(RouteSchema)
    .min(1, "auto.routes must not be empty; known routes: codex, claude")
    .optional(),
  max_task_chars: z.number().int().positive(),
  timeout_ms: z.number().int().positive(),
  max_codex_workers: z.number().int().positive().optional(),
  no_egress: z.array(z.string()),
  pick_temperature: z.number().min(0).max(5),
  jev: JevEndpointSchema,
});
export type AutoPolicy = z.output<typeof AutoSchema>;

/** The active eligibility filter; omission preserves eligibility for every route. */
export const routeFilterLabel = (auto: AutoPolicy): string =>
  `routes=${auto.routes === undefined ? "all (codex, claude)" : JSON.stringify(auto.routes)}`;

// Bounds on a claude worker (run through tools/agx-run/src/workers/run-claude.ts): a run has a budget and a
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
    claude_run: ClaudeRunSchema,
    sources: z.record(z.string(), z.url()),
    choice: z.array(ChoiceSchema).min(1),
  })
  .refine(
    (r) => r.choice.some((c) => c.id === r.default && c.route === "codex"),
    {
      message:
        "default must name a codex-route choice id (the fallback must be the cheap route)",
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
  const raw = await attempt(async () =>
    Bun.TOML.parse(await readFile(path, "utf8")),
  );
  if (!raw.ok) return { ok: false, error: errorMessage(raw.error) };
  const r = RosterSchema.safeParse(raw.value);
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, error: r.error.message };
}

const num = (v: number | undefined): string => (v === undefined ? "–" : `${v}`);
function price(v: number | undefined): string {
  if (v === undefined) return "—";
  return `$${v.toFixed(v < 1 ? 2 : 0)}`;
}

const blended = (x: Choice): number | undefined =>
  x.price_in === undefined || x.price_out === undefined
    ? undefined
    : x.price_in + x.price_out;

/** How many times the cheapest row's blended price (input + output per 1M tokens) this row costs. */
export function costMultiple(r: Roster, c: Choice): number | undefined {
  const own = blended(c);
  const prices = r.choice.flatMap((row) => blended(row) ?? []);
  if (own === undefined || prices.length === 0) return undefined;
  const cheapest = Math.min(...prices);
  return Math.round((own / cheapest) * 10) / 10;
}

export type GradeCounts = Readonly<{
  accepted: number;
  partial: number;
  rejected: number;
}>;
export type Graded = Readonly<{
  here: GradeCounts;
  recent: GradeCounts;
  comparable?: GradeCounts;
}>;

export const ROUTING_OBJECTIVE =
  "Objective: get an accepted, useful result for this ticket fast and cheaply within subscription limits. Logic tree: A. Capability sufficiency (hard): satisfy required capability tags, task size, and long terminal/agentic work; use the brief and measured capabilities to assess sufficiency. B. Expected time to an accepted return: weigh likely success, latency, and rework; choose sufficient effort. C. Cost and subscription health: weigh 7-day windows most; 5-hour windows are secondary information. Keep the intended bias toward the codex route. Pace = used fraction minus elapsed fraction; negative means quota may expire unused. Stale or unknown usage is neutral. D. History is a weak prior for reference only, never the main criterion; little history means uncertainty, not a reason to avoid a row. Counts are accepted/partial/rejected, recent means 7 days, comparable means the same proposition when recorded. agx supplies the objective and evidence; Jev decides.";

const counts = (value: GradeCounts) =>
  `${value.accepted}/${value.partial}/${value.rejected}`;

/** What Jev reads about one row: what it is for, its measured capability, its price relative to the
 *  cheapest row, and how its graded runs here went. SELECTION (owner 2026-10-06: 「model パフォーマン
 *  ステーブルと task brief によって選択されるべき」): the pick comes from these numbers against the
 *  brief — no hand-set weight or post-hoc route bias corrects Jev afterwards. The route is part
 *  of each row's criterion. */
export function criterionFor(r: Roster, c: Choice, graded?: Graded): string {
  const measured = [
    c.aa_index === undefined ? undefined : `AA ${c.aa_index}`,
    c.tb4 === undefined ? undefined : `TB4 ${c.tb4}% (long terminal/agentic)`,
    c.scicode === undefined ? undefined : `SciCode ${c.scicode}%`,
  ].filter((x) => x !== undefined);
  const comparable =
    graded?.comparable === undefined ? "unknown" : counts(graded.comparable);
  const record =
    graded === undefined
      ? "no graded runs here yet"
      : `graded here ${counts(graded.here)}; recent ${counts(graded.recent)}; comparable ${comparable}`;
  return (
    `Route ${c.route}. ${c.use_for}. Measured (Artificial Analysis, ${r.as_of}): ${measured.join(", ")}. ` +
    `Price ${price(c.price_in)}/${price(c.price_out)} per 1M tokens in/out = ${costMultiple(r, c) ?? "unknown"}x the cheapest row. ${record}.`
  );
}

/** The full roster, including routes excluded from auto-pick; the default is marked ●. */
export function rosterTable(r: Roster): string {
  const head =
    "| default | id | route | AA | TB4 | SciCode | $in/cache/out | cost | use for |\n" +
    "| :-: | --- | --- | --: | --: | --: | --- | --: | --- |";
  const rows = r.choice.map(
    (c) =>
      `| ${c.id === r.default ? "●" : "○"} | \`${c.id}\` | ${c.route} | ${num(c.aa_index)} | ${num(c.tb4)}${c.tb4_source === undefined ? "" : ` ([AA](${c.tb4_source}))`} | ${num(c.scicode)}${c.scicode_source === undefined ? "" : ` ([AA](${c.scicode_source}))`} | ${price(c.price_in)}/${price(c.price_cached_in)}/${price(c.price_out)} | ${costMultiple(r, c) === undefined ? "—" : `${costMultiple(r, c)}x`} | ${c.use_for} |`,
  );
  return [head, ...rows].join("\n");
}

/** The dispatch policy that opens the deployed ~/.claude/CLAUDE.md: the rule, the table, and how
 * to choose and run. scripts/render-home.ts puts it between the roster markers at deploy time, so
 * the repo's agents/claude/CLAUDE.md holds only the markers — one writer per file. */
export function rosterPolicy(r: Roster): string {
  return [
    `- **Every worker starts with \`agx run <ticket>\`. The router chooses from the roster using the ticket and the recorded run history.**`,
    `  AA = Artificial Analysis Intelligence Index; TB4 = Terminal-Bench 4.0 and SciCode, AA's own runs (percent); list price USD per 1M tokens; cost = blended price relative to the cheapest priced row; as of ${r.as_of}.`,
    "",
    ...rosterTable(r)
      .split("\n")
      .map((l) => (l === "" ? "" : `  ${l}`)),
    "",
    "  How to choose: describe the task, expected outcome, writable paths, and verification in the ticket. The router selects an available roster row and records it with the run.",
    `  How to run: \`agx run <ticket.md> [--cd TREE] [--sandbox none|read-only|workspace-write] [--session ID]\`. Validate a ticket with \`agx check <ticket.md> [--cd TREE]\`. Use \`agx ls [--json]\` to inspect runs, \`agx judge <run> accept|reject [--note TEXT]\` to record a judgment, and \`agx stats [--import-legacy]\` for run statistics. Continue a session with \`agx run <ticket.md> --continue <run>\`. Durable runs use \`systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agt_<slug> --collect -- agx run <ticket.md>\`.`,
    "  Ticket home: ticket files stay in the project that owns them and are passed to agx by path. Run records and judgments live in `$XDG_STATE_HOME/agx-next/records.jsonl` (or `~/.local/state/agx-next/records.jsonl` by default); `agx ls --json` reports each run's ticket, workspace, status, and judgment.",
    "  Ticket time boxes: `timeout_s` defaults to 600 seconds. `--continue` resumes the selected run's vendor session. An interim `agx-return` is saved as run progress; the worker continues until its timeout or final return. `agx check` validates the ticket and its declared premises before dispatch.",
  ].join("\n");
}
