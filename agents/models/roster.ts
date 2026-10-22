// The dispatch roster (agents/models/dispatch-roster.toml), read and rendered in ONE place.
// Consumers: the dispatch hook (agents/claude/hooks/enforce-dispatch-contract.ts), the codex worker's
// `--choice` (tools/agx-worker/src/workers/codex.ts) and scripts/render-home.ts (which
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
  id: z.string().regex(/^[a-z]+[0-9]*-[a-z]+$/u),
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

// What an exhausted subscription window (used_percent >= 100, not stale) does to a route. "continue"
// keeps dispatching on the route, because a vendor may still serve it from purchased credits;
// "stop" vetoes it in usage, dispatch, check and continuation. Real vendor refusals are learned
// separately as capacity outcomes.
const WindowExhaustionSchema = z.enum(["continue", "stop"]);
export type WindowExhaustion = z.output<typeof WindowExhaustionSchema>;
export type RouteName = z.output<typeof RouteSchema>;

const AutoSchema = z.strictObject({
  routes: z
    .array(RouteSchema)
    .min(1, "auto.routes must not be empty; known routes: codex, claude")
    .optional(),
  on_window_exhausted: z
    .strictObject({
      codex: WindowExhaustionSchema.optional(),
      claude: WindowExhaustionSchema.optional(),
    })
    .optional(),
  max_task_chars: z.number().int().positive(),
  timeout_ms: z.number().int().positive(),
  max_codex_workers: z.number().int().positive().optional(),
  no_egress: z.array(z.string()),
  pick_temperature: z.number().min(0).max(5),
  jev: JevEndpointSchema,
});
export type AutoPolicy = z.output<typeof AutoSchema>;

/** The exhausted-window action per route; an omitted route declaration means "continue". */
export const exhaustionPolicy = (
  auto: AutoPolicy,
): Readonly<Record<RouteName, WindowExhaustion>> => ({
  codex: auto.on_window_exhausted?.codex ?? "continue",
  claude: auto.on_window_exhausted?.claude ?? "continue",
});

/** The active eligibility filter; omission preserves eligibility for every route. */
export const routeFilterLabel = (auto: AutoPolicy): string =>
  `routes=${auto.routes === undefined ? "all (codex, claude)" : JSON.stringify(auto.routes)}`;

// Bounds on a claude worker (run through tools/agx-worker/src/workers/run-claude.ts): a run has a budget and a
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

type ModelGeneration = Readonly<{ family: string; generation: string }>;
type ModelGenerationParse =
  | { readonly ok: true; readonly value: ModelGeneration | undefined }
  | { readonly ok: false; readonly error: string };

function normalizeGeneration(parts: string[]): string {
  const normalized = parts.map((part) => BigInt(part).toString());
  while (normalized.length > 1 && normalized.at(-1) === "0") normalized.pop();
  return normalized.join(".");
}

/** Recognize only the provider slug shapes represented in the committed catalog. */
function parseModelGeneration(model: string): ModelGenerationParse {
  const gpt = /^gpt-(\d+(?:\.\d+)?)-([a-z]+)$/u.exec(model);
  if (gpt !== null) {
    const family = gpt[2];
    const generation = gpt[1];
    if (family === undefined || generation === undefined)
      return {
        ok: false,
        error: `cannot read model slug ${JSON.stringify(model)}`,
      };
    return {
      ok: true,
      value: {
        family,
        generation: normalizeGeneration(generation.split(".")),
      },
    };
  }

  const malformedGptFamily = /^gpt-[\d.]+-([a-z]+)(?:-.+)?$/u.exec(model);
  if (malformedGptFamily !== null) {
    const family = malformedGptFamily[1];
    return {
      ok: false,
      error:
        `model slug ${JSON.stringify(model)} names supported family ${family} ` +
        `but must use gpt-<numeric-generation>-${family}`,
    };
  }

  const claude = /^claude-([a-z]+)-(\d+)-(\d+)$/u.exec(model);
  if (claude !== null) {
    const family = claude[1];
    const major = claude[2];
    const minor = claude[3];
    if (family === undefined || major === undefined || minor === undefined)
      return {
        ok: false,
        error: `cannot read model slug ${JSON.stringify(model)}`,
      };
    return {
      ok: true,
      value: {
        family: `claude-${family}`,
        generation: normalizeGeneration([major, minor]),
      },
    };
  }

  const malformedClaudeFamily = /^claude-([a-z]+)-(?=.*\d).+$/u.exec(model);
  if (malformedClaudeFamily !== null) {
    const family = malformedClaudeFamily[1];
    return {
      ok: false,
      error:
        `model slug ${JSON.stringify(model)} names supported family claude-${family} ` +
        `but must use claude-${family}-<major>-<minor>`,
    };
  }

  return { ok: true, value: undefined };
}

function generationExclusivityError(roster: Roster): string | undefined {
  const families = new Map<string, Map<string, Set<string>>>();
  for (const row of roster.choice) {
    const parsed = parseModelGeneration(row.model);
    if (!parsed.ok) return parsed.error;
    if (parsed.value === undefined) continue;
    const generations =
      families.get(parsed.value.family) ?? new Map<string, Set<string>>();
    const models =
      generations.get(parsed.value.generation) ?? new Set<string>();
    models.add(row.model);
    generations.set(parsed.value.generation, models);
    families.set(parsed.value.family, generations);
  }

  const conflicts = [...families].flatMap(([family, generations]) => {
    if (generations.size < 2) return [];
    const versions = [...generations].map(
      ([generation, models]) =>
        `${[...models].join(", ")} (generation ${generation})`,
    );
    return [
      `model family ${family} has multiple generations: ${versions.join("; ")}`,
    ];
  });
  return conflicts.length === 0
    ? undefined
    : `${conflicts.join(". ")}. Keep one generation for each family by removing or ` +
        "updating the conflicting roster rows.";
}

/** The parsed roster, or why not (missing file, bad TOML, or zod's reason) — never a throw. */
export async function loadRoster(path = ROSTER_PATH): Promise<RosterLoad> {
  const raw = await attempt(async () =>
    Bun.TOML.parse(await readFile(path, "utf8")),
  );
  if (!raw.ok) return { ok: false, error: errorMessage(raw.error) };
  const r = RosterSchema.safeParse(raw.value);
  if (!r.success) return { ok: false, error: r.error.message };
  const generationError = generationExclusivityError(r.data);
  return generationError === undefined
    ? { ok: true, value: r.data }
    : { ok: false, error: generationError };
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

/** Judgment counts remain an audit/history representation; routing does not consume them. */
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
  "Objective: get an accepted, useful result for this ticket fast and cheaply within subscription limits. Logic tree: A. Capability sufficiency (hard): satisfy required capability tags, task size, and long terminal/agentic work; use the brief and measured capabilities to assess sufficiency. B. Expected time to an accepted return: weigh likely success, latency, and rework; choose sufficient effort. C. Cost and subscription health: weigh 7-day windows most; 5-hour windows are secondary information. Keep the intended bias toward the codex route. Pace = used fraction minus elapsed fraction; negative means quota may expire unused. Stale or unknown usage is neutral. agx supplies the objective and evidence; Jev decides.";

/** What Jev reads about one row: its route, measured capability, and relative price. */
export function criterionFor(r: Roster, c: Choice): string {
  const measured = [
    c.aa_index === undefined ? undefined : `AA ${c.aa_index}`,
    c.tb4 === undefined ? undefined : `TB4 ${c.tb4}% (long terminal/agentic)`,
    c.scicode === undefined ? undefined : `SciCode ${c.scicode}%`,
  ].filter((x) => x !== undefined);
  return (
    `Route ${c.route}. ${c.use_for}. Published benchmark snapshot (Artificial Analysis, ${r.as_of}): ${measured.length === 0 ? "unknown" : measured.join(", ")}. ` +
    `Price ${price(c.price_in)}/${price(c.price_out)} per 1M tokens in/out = ${costMultiple(r, c) ?? "unknown"}x the cheapest row.`
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
    `- **Every worker starts with \`agx worker run <ticket>\`. The router chooses from the roster using the ticket, measured model evidence, and current operational availability.**`,
    `  AA = Artificial Analysis Intelligence Index; TB4 = Terminal-Bench 4.0 and SciCode, AA's own runs (percent); list price USD per 1M tokens; cost = blended price relative to the cheapest priced row; sourced snapshot ${r.as_of}.`,
    "",
    ...rosterTable(r)
      .split("\n")
      .map((l) => (l === "" ? "" : `  ${l}`)),
    "",
    "  How to choose: describe the task, expected outcome, writable paths, and verification in the ticket. The router selects an available roster row and records it with the run.",
    "  Managed dispatch: `agx worker dispatch <ticket.md> [--ws SLUG] [--unit NAME] [--sandbox MODE] [--continue RUN_ID]` starts a durable worker run.",
    `  How to run: \`agx worker run <ticket.md> [--cd TREE] [--sandbox none|read-only|workspace-write] [--session ID]\`. Validate a ticket with \`agx worker check <ticket.md> [--cd TREE]\`. Use \`agx worker ls [--json]\` to inspect runs, \`agx worker judge <run> accept|reject [--note TEXT]\` to record a judgment, and \`agx worker stats [--import-legacy]\` for run statistics. Continue a session with \`agx worker run <ticket.md> --continue <run>\`. Durable runs use \`systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agt_<slug> --collect -- agx worker run <ticket.md>\`.`,
    "  Ticket home: ticket files stay in the project that owns them and are passed to agx by path. Run records and judgments live in `records.jsonl` under non-empty `AGX_STATE_DIR`, otherwise `$XDG_STATE_HOME/agx` (or `~/.local/state/agx` by default); `agx worker ls --json` reports each run's ticket, workspace, status, and judgment.",
    "  Ticket time boxes: `timeout_s` defaults to 600 seconds. `--continue` resumes the selected run's vendor session. An interim `agx-return` is saved as run progress; the worker continues until its timeout or final return. `agx worker check` validates the ticket and its declared premises before dispatch.",
  ].join("\n");
}
