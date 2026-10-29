# AGX selection mechanism provenance (2026-10-21)

## Scope and result

**Proposition.** Explain apparent Sol bias from routing provenance, not presumed preference.

**Scoped observation.** The supplied coordinator override is a one-row `terra-high` roster, not a Sol roster. A run that loaded that file could only choose Terra. It therefore cannot evidence a Sol-selection bias for those runs; display or coordinator identity must not be substituted for the run's recorded `row`. This is not a global verdict before the separate run-history count is joined.

No run-history count is asserted here: that is owned by the parallel report, and a checked-in roster is not proof that every historical run loaded it.

## Evidence table

| Claim | Exact evidence | Warranted conclusion |
| --- | --- | --- |
| Normal checked-in auto-routing admits only Codex rows and declares `luna-high` as default. | `agents/models/dispatch-roster.toml:20-34,80-91` | Claude rows are excluded before selection; Sol is one of 20 Codex candidates, not the checked-in default. |
| The observed override has one choice, `terra-high`. | `/tmp/dotfiles-coord-terra-high-roster-20261021.toml:20-22,55-69` | Under `DISPATCH_ROSTER_PATH` pointing to this file, no Sol row exists for Jev or fallback to select. |
| The router loads `DISPATCH_ROSTER_PATH`; it filters route, masked/cooling rows, TB4 floor, then live route availability. | `tools/agx-worker/src/next/route.ts:35-73` | Effective eligibility is runtime-dependent. A checked-in row alone does not establish eligibility for a particular run. |
| `terminal-agentic` or `long-tool-loop` imposes TB4 >= 30. | `tools/agx-worker/src/next/route.ts:53-66` | On the regular roster, all five Sol rows qualify (TB4 30.8–56.1), but so do `terra-max` (35.4) and all five Astra rows (41.9–59.6): `agents/models/dispatch-roster.toml:181-268,270-343`. This gate does not uniquely select Sol. |
| Cheap/common work has lower-cost Codex competitors. | Luna rows are explicitly for narrow/bulk/default work at $0.10/$0.50 per M input/output: `agents/models/dispatch-roster.toml:56-118`; Terra- and Sol-specific `use_for` begin only after stated Luna insufficiency: `agents/models/dispatch-roster.toml:120-208`. | A broad brief can nevertheless steer Jev upward, but the configuration does not objectively make Sol the cheapest adequate row. |
| Jev receives the brief (first 2,400 chars), task-size class, capability tags, route usage, per-row `use_for`, measured fields, price multiple, and graded history. | `tools/agx-worker/src/next/route.ts:81-127`; `agents/models/roster.ts:148-174` | The choice is Jev's decision over eligible rows, with no post-choice override in this path. Broad task wording can make several rows appear suitable; this is an explanation to inspect, not proof of a bias. |
| Jev failure/invalid output falls back to default if eligible, otherwise the first effort-sorted candidate. | `tools/agx-worker/src/next/route.ts:67-71,128-173` | The result depends on the capability case; see the qualified fallback table below. The override yields `terra-high` only when that row remains eligible. |
| Continuation is row-pinned before routing. | `tools/agx-worker/src/next/continue.ts:19-64` and `tools/agx-worker/docs/scope.md:71-76` | A resumed Sol run is provenance of an earlier Sol selection, not a fresh Sol decision. |
| Installed command is not this workspace checkout. | Probe, 2026-10-21: `command -v agx` -> `/home/fuyu/.bun/bin/agx`; `readlink -f` -> `/home/fuyu/dotfiles/tools/agx/src/agx.ts`; `agx --version` -> `1.0.0`; `agx worker --help` -> `agx-worker v8.0.1`. Workspace `tools/agx/package.json:1-8` declares `agx` 1.0.0. | Static findings in this checkout require a run receipt to prove that the installed implementation and effective roster matched for any particular dispatch. |

## Complete static call path

`agx` forwards `worker` to `agx-worker` (`tools/agx/src/agx.ts:6-58`). For a fresh run, `route()` reads the roster selected by `DISPATCH_ROSTER_PATH`, filters eligible rows, gathers route usage and graded history, asks Jev, and records a pick audit (`tools/agx-worker/src/next/route.ts:35-173`). The chosen row is then passed to the route-specific worker. A continuation instead reuses its recorded row/session and rejects a missing or removed row (`tools/agx-worker/src/next/continue.ts:19-64`).

Precedence visible in this path is: continuation pin (when applicable) -> named `DISPATCH_ROSTER_PATH` or built-in roster loader -> route/mask/cooling/TB4/availability filters -> Jev -> eligible default/fallback. The public `run` flags shown in `tools/agx-worker/src/next/cli.ts:55-105` have no explicit row or model selector; this statement is limited to that public command surface, not every internal test or environment hook.

## Qualified fallback, normal roster

`fallback` is evaluated only after `candidates` is nonempty. It first seeks the declared default in that filtered, route-available array; otherwise it takes index 0 (`tools/agx-worker/src/next/route.ts:58-80,128-129`). The array is sorted by effort in the fixed order `low`, `medium`, `high`, `xhigh`, `max` (`tools/agx-worker/src/next/route.ts:67-71`); rows tied on effort retain their declared roster order.

| Capability case, assuming no row is masked/cooling and Codex is available | Declared default eligible? | Actual fallback row/model if Jev request/response falls back | Why |
| --- | --- | --- | --- |
| No `terminal-agentic` or `long-tool-loop` tag | Yes: `luna-high` | `luna-high` / `gpt-6-luna` | No TB4 floor applies; the candidate search finds the normal roster default: `agents/models/dispatch-roster.toml:20-29,80-91`. |
| Either `terminal-agentic` or `long-tool-loop` tag | No: `luna-high` has TB4 4.5, below 30 | `sol-low` / `gpt-6.1-sol` | The tag sets TB4 >= 30; `terra-high` is also excluded at TB4 1.5. The lowest-effort qualifying row first in declared order is `sol-low` (TB4 30.8), ahead of `astra-low` (41.9): `tools/agx-worker/src/next/route.ts:53-71`; `agents/models/dispatch-roster.toml:151-163,195-208,270-283`. |
| Observed one-row `terra-high` override with no long-session tag | Yes | `terra-high` / `gpt-5.6-terra` | It is its own default and sole candidate: `/tmp/dotfiles-coord-terra-high-roster-20261021.toml:20-22,55-69`. |
| Observed one-row `terra-high` override with either long-session tag | No: TB4 1.5 | No fallback; exit 2 before Jev | Filtering produces no eligible row, so the code exits before constructing `fallback`: `tools/agx-worker/src/next/route.ts:53-80`; `/tmp/dotfiles-coord-terra-high-roster-20261021.toml:55-69`. |

The two normal-roster rows above are baseline results, not live receipts. `maskedRows` and the per-row capacity cooldown are applied before sorting; route availability is applied afterward (`tools/agx-worker/src/next/route.ts:58-73`). Thus a masked or cooling `sol-low` makes the next qualifying stable candidate `astra-low`; unavailable Codex makes every normal-roster candidate unavailable and exits 2, rather than selecting another route because normal `auto.routes` permits only Codex (`agents/models/dispatch-roster.toml:28-29`).

## Interpretation and bounded next action

The evidence supports **policy-conforming candidate restriction and a Jev choice**, not demonstrated optimality. `use_for`, external benchmark fields dated 2026-10-08, prices, and weak graded history are decision inputs, not accepted-result throughput evidence for the owner's real task distribution.

To test an apparent Sol skew, the coordinator should join each counted run's recorded `row`, `pick_source`, roster digest/path or copied ticket context, capability tags, availability snapshot, and later acceptance judgment. Partition fresh picks from continuations and fallback picks. Do not use coordinator/display model identity as a proxy. No routing change is warranted from the static evidence alone.

## Unknowns deliberately retained

- Whether the coordinator actually exported the observed override for each run.
- Per-run Jev response/probabilities, live availability/cooling/masks, and resulting `pick_source`.
- Counts by selected row and accepted-result/cost/latency outcomes.
- Whether broad task labels, rather than comparative outcomes, explain any observed Sol concentration.
