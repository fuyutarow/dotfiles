# CONFIGURATION CONTRACT — dispatch roster

The contract for `agents/models/dispatch-roster.toml` (governing-configuration-systems). It
describes the configuration system; the roster itself is the configuration.

- Consumer: the owner (human editor); `agent-router` (agents/routing-control/agent-router.ts — runtime: the one entry point; sends every row to Jev as a criterion built by `criterionFor` in agents/models/roster.ts — use_for, measured AA/TB4/SciCode, cost multiple, graded record — and runs the row Jev picks: codex through `codex-run --choice`, claude through `agents/routing-control/workers/run-claude.ts` bounded by `[claude_run]`); the dispatch hook `agents/claude/hooks/enforce-dispatch-contract.ts` (denies Agent/Task/Workflow and prints the table); `scripts/render-home.ts` (renders the table block into the deployed `~/.claude/CLAUDE.md`, which the coordinating model reads at session start; the repo template keeps only the markers)
- Authority / writer: the owner, by a commit to `alpha` (`mise run commit`); the deployed CLAUDE.md block is written only by `scripts/render-home.ts` (`mise run link:dots`)
- Effective configuration: the working-tree file `agents/models/dispatch-roster.toml` of the checkout each machine runs, read on every agent-router run, hook call and `codex-run --choice`; the rendered block in `~/.claude/CLAUDE.md` is a derived view, frozen into a session when it starts
- Source representation: TOML 1.0 (Bun.TOML), one file, no includes
- Trust regime: human-authored, generated, gated-decision
- Signature / digest input: n/a (no signature; integrity of the derived block is `mise run doctor` (rendered: re-renders into a scratch HOME and compares bytes) and `mise run lint:one-writer` (no rendered lines in the repo template))
- Canonicalization profile: n/a
- Schema / version: `schema = 1`, zod `RosterSchema` in `agents/models/roster.ts` — strict objects (unknown keys rejected), `as_of` ISO date, `sources` map of URLs, `[auto]` (max_task_chars, timeout_ms, no_egress paths compared as real paths, and `[auto.jev]` = { api = "typesafe", url, model } | { api = "reseller", url }), `[claude_run]` (max_budget_usd > 0, max_turns, reason), every row requires `id`, `route` (codex | claude), `model`, `effort`, `use_for`; input, cached-input and output prices are independently optional; `default` must name a codex-route row; ids unique. There is no per-row switch, no weight and no confidence floor: a row in the file is a candidate, and Jev's choice is used as made
- Duplicate-key policy: reject — Bun.TOML refuses a redefined key ("Cannot redefine key"); duplicate row ids are rejected by the schema
- Number / Unicode policy: benchmark and price fields are TOML numbers (float or integer, rendered as written); an absent benchmark or price field means "not on a primary page / no list price" and renders as –, never as a default; text fields are UTF-8 strings used verbatim
- Precedence / merge: single source — the one file is the whole configuration; no layering, no environment override in normal use; the test seam `DISPATCH_ROSTER_PATH` replaces the whole file for tests only
- Decision record: record: the commit message of each roster change — a6359ca7 luna only by config, 5a94aa5d enabled required, d6b6826a enabled removed and claude rows run by agent-router, 36e42ce7 selection from the performance table and the brief with no hand-set weight, and the commit removing the confidence floor (owner 2026-10-06: 「一つに決めないといけないのだから」); the dated owner quotes in the files are rationale, not an approval mechanism
- Exception encoding: none: there are no per-dispatch exceptions and no override of Jev; `--choice` is refused. The `default` row runs only when there is no usable Jev answer (unreachable, a choice outside the roster) or the brief's cwd is under a no_egress path, and the reason is logged
- Verification command: `bun test agents/routing-control/tests agents/claude/hooks/tests/enforce-dispatch-contract.test.ts scripts/tests/render-home.test.ts`
- Positive case: the committed roster loads; Jev receives every row with its measured numbers and cost multiple and is asked for the cheapest sufficient row (agent-router test "Jev is asked for the cheapest sufficient row…"); a claude row Jev picks runs run-claude with `--max-budget-usd 2 --max-turns 60` and the row's model and effort; `mise run link:dots` renders the table into `~/.claude/CLAUDE.md`
- Negative case: a row carrying the retired `enabled` key, an unknown key, a redefined key, a non-codex default, a duplicate id, or a non-URL source each fail the load, and the hook denies with "cannot read agents/models/dispatch-roster.toml" plus the reason; a Jev answer outside the roster runs the default with the reason logged

## Residual

- `[auto]` sends the head of each brief, and every row's criterion, to the Jev endpoint named in
  `[auto.jev]` (2026-10-05: the reseller jevtypesafeai.com, owner-approved until an official
  TypeSafe key exists). The record of what was sent and answered is
  ~/.local/state/agent-router/runs.jsonl on each machine.
- A claude worker has no OS sandbox (agents/routing-control/workers/run-claude.ts: permissions are not containment): plan mode
  for read-only, acceptEdits plus Bash for workspace-write, under the same hooks every Claude
  session runs; its budget and turn bounds are the containment of cost, not of effect.
- The working tree is effective: an uncommitted edit takes effect on the next run, before any
  review or commit gate. The owner is the only writer on these machines, so this is accepted.
- A running session keeps the CLAUDE.md table it read at start; agent-router and the hook re-read
  the file on every call.
- The checks prove the loader, the router and the hook accept or reject inputs; they do not prove
  the benchmark numbers are current (see the file header for how they are refreshed), nor that
  Jev's picks are good — `agent-router grade` and `agent-router stats` measure that over time.
