// The dispatch roster (agents/models/dispatch-roster.toml), read and rendered in ONE place.
// Consumers: the dispatch hook (agents/claude/hooks/enforce-dispatch-contract.ts), the codex worker's
// `--choice` (tools/agx/src/workers/codex.ts) and scripts/render-home.ts (which
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
  route: z.enum(["codex", "claude"]),
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
  max_task_chars: z.number().int().positive(),
  timeout_ms: z.number().int().positive(),
  max_codex_workers: z.number().int().positive().optional(),
  no_egress: z.array(z.string()),
  pick_temperature: z.number().min(0).max(5),
  jev: JevEndpointSchema,
});
export type AutoPolicy = z.output<typeof AutoSchema>;

// Bounds on a claude worker (run through tools/agx/src/workers/run-claude.ts): a run has a budget and a
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
  const raw = await attempt(() => Bun.TOML.parse(readFileSync(path, "utf8")));
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

export type Graded = Readonly<{ pass: number; partial: number; fail: number }>;

export const ROUTING_OBJECTIVE =
  "Objective: maximize this ticket's expected accepted-returns-per-hour: expected acceptance rate multiplied by 3600 and divided by expected time to first return, using the comparable-ticket tradeoff line (same capability tags and size class from writes-glob count and brief length). Weigh comparable-ticket median time to first return, timeout rate, accepted rate, and cost per accepted ahead of overall records and benchmark scores. Each row marks the best observed expected throughput; when comparable history is little, treat it as uncertainty and do not silently substitute overall averages. Choose the lowest effort that does not lower that throughput; xhigh/max only when the ticket names a capability lower effort measurably lacks. Among rows within noise of each other, pick the cheaper, and when a codex and a claude row are comparable, pick codex. Cost excludes a row only when its expected cost exceeds the ticket's declared budget.";

/** What Jev reads about one row: what it is for, its measured capability, its price relative to the
 *  cheapest row, and how its graded runs here went. SELECTION (owner 2026-10-06: 「model パフォーマン
 *  ステーブルと task brief によって選択されるべき」): the pick comes from these numbers against the
 *  brief — no hand-set weight or post-hoc route bias corrects Jev afterwards. The codex-over-claude
 *  tie-break is explicit in agx's question, and the route is part of each row's criterion. */
export function criterionFor(r: Roster, c: Choice, graded?: Graded): string {
  const measured = [
    c.aa_index === undefined ? undefined : `AA ${c.aa_index}`,
    c.tb4 === undefined
      ? undefined
      : `TB4 ${c.tb4}% (long terminal/agentic sessions; source: ${c.tb4_source ?? r.sources.aa_releases})`,
    c.scicode === undefined
      ? undefined
      : `SciCode ${c.scicode}% (source: ${c.scicode_source ?? r.sources.aa_releases})`,
  ].filter((x) => x !== undefined);
  const record =
    graded === undefined
      ? "no graded runs here yet"
      : `graded runs here: ${graded.pass} pass, ${graded.partial} partial, ${graded.fail} fail`;
  return (
    `Route ${c.route}. ${c.use_for}. Measured (Artificial Analysis, ${r.as_of}): ${measured.join(", ")}. ` +
    `Price ${price(c.price_in)}/${price(c.price_out)} per 1M tokens in/out = ${costMultiple(r, c) ?? "unknown"}x the cheapest row. ${record}.`
  );
}

/** The roster as a table: every row is a candidate Jev may pick, the default marked ●. */
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
    `- **Every dispatch goes through \`agx dispatch\`: Jev alone picks one row of this roster from the brief and this table (each row's use, measured capability, price and graded record). Recent records include the overall seven-day window, records restricted to each capability tag on the ticket, and comparable-ticket tradeoffs grouped by exact capability tags and size class (writes-glob count and brief length); records below five runs say \`little record\`. A row with two lineage failures/partials or returns without ack-consumed is masked from Jev's candidates, with each row and reason in the receipt; if all rows are masked, the overall-record argmax remains available and is recorded. Jev alone picks among the remaining candidates. ${ROUTING_OBJECTIVE} \`--choice\` is refused — a wrong pick is fixed in the brief or the row's use_for, never by overriding Jev. When Jev is unreachable or answers outside the roster the default \`${r.default}\` runs, and the receipt says why.**`,
    `  AA = Artificial Analysis Intelligence Index; TB4 = Terminal-Bench 4.0 and SciCode, AA's own runs (percent); list price USD per 1M tokens; cost = blended price relative to the cheapest priced row; as of ${r.as_of}.`,
    `  Ticket premises: declare relied-on files or exact-text symbols as \`premises = ["file:<path>", "symbol:<name>", "symbol:<name>@<path-glob>"]\`; missing premises refuse before Jev, and checks time out after five seconds.`,
    "",
    ...rosterTable(r)
      .split("\n")
      .map((l) => (l === "" ? "" : `  ${l}`)),
    "",
    `  How to choose: Jev supplies row probabilities; the router samples one row at temperature T (default ${r.auto.pick_temperature}) with a recorded seed. Give Jev what it needs in the brief: scope (files, size), what is at risk (live hooks, harness), expected difficulty, how long a tool loop it needs. Ticket \`pick_temperature\` or CLI \`--pick-temperature\` overrides T; \`--pick-seed\` makes a run reproducible.`,
    `  How to run: \`agx dispatch --prompt-file <brief> --cd <dir> --sandbox none|read-only|workspace-write\` from Bash, in the background. Use explicit \`--sandbox none\` for workers that need network or ssh; omitting the option remains refused. \`--name\`/\`name\` gives the worker id agt_<name>, name in [A-Za-z0-9_] (hyphens become underscores). This is the one entry point for codex AND claude rows (a claude row runs \`claude -p\` through tools/agx/src/workers/run-claude.ts, bounded at $${r.claude_run.max_budget_usd} and ${r.claude_run.max_turns} turns). It logs the pick, shows the run in the statusline, and prints a JSON receipt (a failure names its cause; every receipt says what the worker did). Tickets may use schema 1 or 2. Declare \`outcome\`, \`consumer\`, \`first_return\` and \`writes\` for the promise; verification needs \`verify\` or \`read_only_diagnostic = true\`. The router records a model-free floor grade and runs a bounded read-only grader before the worker; the grader's Jev-picked row, status, usage and cost live inside the parent ticket grade. Grader split/clarify verdicts warn with pieces/questions, are recorded, and run. Local schema, RESOURCE, timeout, verify/diagnostic and premise violations refuse together before routing; \`--legacy-brief "<why>"\` records a one-release exception. A failed grader falls back to the floor verdict and never refuses a run. Use \`agx ticket replay <dir> [--expect <file.tsv>]\` to replay private fixture briefs without starting their real workers; \`--no-grader\` skips grading and is recorded. The worker gets a compact promise block (outcome, consumer, absolute writes, first_return seconds, verify, kind/labels and sandbox) before the prose; the router runs verify commands after exit and grades the run (or records a waiver). A finished run can be acknowledged with \`agx ledger note <run_id> [--consumed|--rejected] [--note "<why>"]\`. \`agx ledger stats [--since <ISO|duration>]\` shows throughput by row and dispatcher session, while retaining the prior view under \`legacy\`; \`--grading\` adds grader overhead and estimated saves, and \`--grading --check\` exits 1 when measured overhead exceeds those estimates. Offline routing comparisons use \`stats --replay <candidate.json>\`; candidates contain ordered \`rules\` with \`when\` predicates over row, effort, ticket_schema, capability_tags and confidence_bin, plus an alternative \`row\`. The comparison assumes row rates are independent of task. The Agent and Workflow tools dispatch nothing: the dispatch hook denies both and prints this table.`,
    `  Ticket home: \`agx ticket new <name> [--label L ...] [--cd DIR]\`, \`agx ticket ls [--cd DIR]\`, and offline \`agx ticket lint <file>\` use \`.agents/tickets/<YYMMDD>-<name>.md\`; dispatch accepts any prompt-file path. RESOURCE derives \`kind = token|compute\`; optional \`labels\` are opaque strings, recorded with kind in active markers and ledger resource metadata.`,
    `  Ticket time boxes: the hard worker bound defaults to 600 seconds (hard maximum 14400); values above 600 require \`timeout_reason\` / CLI \`--timeout-reason\`. \`first_return_s\` defaults to 360 (valid 60..360) and names the first useful artifact due. The router asks Jev to prefer the lowest effort of a model family; xhigh/max is admissible only when ticket \`capabilities\` says what lower effort measurably lacks. At first_return_s (T), Codex gets a soft request: send an interim RETURN by T if you can; never stop running jobs to do so. The receipt records whether a RETURN or progress appeared by the deadline. An ungraded run without verify prints one warning line and does not block the next dispatch. Claude records \`checkpoint: unsupported\` and remains bounded by the hard timeout. A valid \`agx-return\` block produces outcome \`returned\`: success, not a stats failure; ticket verification still runs.`,
  ].join("\n");
}
