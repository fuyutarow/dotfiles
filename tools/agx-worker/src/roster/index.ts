import type { Choice, Roster } from "./load.ts";
export { loadRoster } from "./load.ts";
export type { Choice, Roster, RosterLoad, LoadRosterOptions } from "./load.ts";
export type AutoPolicy = Roster["auto"];
export type JevEndpoint = AutoPolicy["jev"];
export type RouteName = Choice["route"];
export type WindowExhaustion = "continue" | "stop";

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
