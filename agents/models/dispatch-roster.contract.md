# CONFIGURATION CONTRACT — dispatch roster

The contract for `agents/models/dispatch-roster.toml` (governing-configuration-systems). It
describes the configuration system; the roster itself is the configuration.

- Consumer: the owner (human editor); the dispatch hook `agents/claude/hooks/enforce-dispatch-contract.ts` (gate on Agent/Task/Workflow); `agent-router` (agents/routing-control/agent-router.ts — runtime: the one entry point; reads every enabled row and [auto] to ask Jev, falls back to `default`); `codex-run --choice` (runtime: model and effort of a luna row, called by agent-router); `scripts/render-home.ts` (renders the table block into the deployed `~/.claude/CLAUDE.md`, which the coordinating model reads at session start; the repo template keeps only the markers)
- Authority / writer: the owner, by a commit to `alpha` (`mise run commit`); the deployed CLAUDE.md block is written only by `scripts/render-home.ts` (`mise run link:dots`)
- Effective configuration: the working-tree file `agents/models/dispatch-roster.toml` of the checkout each machine runs (`~/.claude/hooks` links into it), read on every hook call and every `codex-run --choice`; the rendered block in `~/.claude/CLAUDE.md` is a derived view, frozen into a session when it starts
- Source representation: TOML 1.0 (Bun.TOML), one file, no includes
- Trust regime: human-authored, generated, gated-decision
- Signature / digest input: n/a (no signature; integrity of the derived block is `mise run doctor` (rendered: re-renders into a scratch HOME and compares bytes) and `mise run lint:one-writer` (no rendered lines in the repo template))
- Canonicalization profile: n/a
- Schema / version: `schema = 1`, zod `RosterSchema` in `agents/models/roster.ts` — strict objects (unknown keys rejected), `as_of` ISO date, `sources` map of URLs, `[auto]` (min_confidence 0–1, max_task_chars, timeout_ms, no_egress paths compared as real paths, and `[auto.jev]` = { api = "typesafe", url, model } | { api = "reseller", url }), every row requires `id`, `route` (luna | claude), `model`, `effort`, `price_in`, `price_out`, `use_for`, `enabled`; `default` must name an enabled row; ids unique
- Duplicate-key policy: reject — Bun.TOML refuses a redefined key ("Cannot redefine key"); duplicate row ids are rejected by the schema
- Number / Unicode policy: benchmark and price fields are TOML numbers (float or integer, rendered as written); an absent benchmark field means "not on a primary page" and renders as –, never as a default; text fields are UTF-8 strings used verbatim
- Precedence / merge: single source — the one file is the whole configuration; no layering, no environment override in normal use; the test seam `DISPATCH_ROSTER_PATH` replaces the whole file for the hook tests only
- Decision record: record: the commit message of each roster change (a6359ca7 luna only by config, 5a94aa5d enabled required) plus the dated owner quote in the file header; the quote is rationale, not an approval mechanism
- Exception encoding: none: there are no per-dispatch exceptions; the only switch is a row's `enabled`, and a disabled row is denied without an override path
- Verification command: `bun test agents/claude/hooks/tests/enforce-dispatch-contract.test.ts` (runs the real hook against the live file and against fixtures) and `bun test scripts/tests/render-home.test.ts`
- Positive case: the committed roster loads; `mise run link:dots` renders the table into `~/.claude/CLAUDE.md` and `mise run doctor` reports rendered PASS; with every row enabled (fixture), Agent `subagent_type:"sonnet-high"` passes the hook
- Negative case: a row without `enabled`, an unknown key (`allow_claude = true`), a redefined key, `enabled = "false"`, a disabled default, a duplicate id, or a non-URL source each fail the load, and the hook denies with "cannot read agents/models/dispatch-roster.toml" plus the reason

## Residual

- `[auto]` sends the head of each brief to the Jev endpoint named in `[auto.jev]` (2026-10-05:
  the reseller jevtypesafeai.com, owner-approved until an official TypeSafe key exists). The
  record of what was sent and answered is ~/.local/state/agent-router/runs.jsonl on each machine.

- The working tree is effective: an uncommitted edit takes effect on the next hook call, before
  any review or commit gate. The owner is the only writer on these machines, so this is accepted.
- A running session keeps the CLAUDE.md table it read at start; the hook, which re-reads the
  file, is the enforcement, and the table is only guidance.
- The checks prove the loader and the hook accept or reject inputs; they do not prove the
  benchmark numbers are current (see the file header for how they are refreshed).
