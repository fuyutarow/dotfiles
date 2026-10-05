# CONFIGURATION CONTRACT — dispatch roster

The contract for `agents/models/dispatch-roster.toml` (governing-configuration-systems). It
describes the configuration system; the roster itself is the configuration.

- Consumer: the owner (human editor); the dispatch hook `agents/claude/hooks/enforce-dispatch-contract.ts` (gate on Agent/Task/Workflow); `codex-run --choice` (runtime: model and effort of a luna row); `scripts/render-roster.ts` (generator of the table block in `agents/claude/CLAUDE.md`, which the coordinating model reads at session start)
- Authority / writer: the owner, by a commit to `alpha` (`mise run commit`); the CLAUDE.md block is written only by `mise run roster:render`
- Effective configuration: the working-tree file `agents/models/dispatch-roster.toml` of the checkout each machine runs (`~/.claude/hooks` links into it), read on every hook call and every `codex-run --choice`; the rendered CLAUDE.md block is a derived view, frozen into a session when it starts
- Source representation: TOML 1.0 (Bun.TOML), one file, no includes
- Trust regime: human-authored, generated, gated-decision
- Signature / digest input: n/a (no signature; integrity of the derived block is the drift check `mise run lint:roster`, which re-renders from the TOML and compares bytes)
- Canonicalization profile: n/a
- Schema / version: `schema = 1`, zod `RosterSchema` in `agents/models/roster.ts` — strict objects (unknown keys rejected), `as_of` ISO date, `sources` map of URLs, every row requires `id`, `route` (luna | claude), `model`, `effort`, `price_in`, `price_out`, `use_for`, `enabled`; `default` must name an enabled row; ids unique
- Duplicate-key policy: reject — Bun.TOML refuses a redefined key ("Cannot redefine key"); duplicate row ids are rejected by the schema
- Number / Unicode policy: benchmark and price fields are TOML numbers (float or integer, rendered as written); an absent benchmark field means "not on a primary page" and renders as –, never as a default; text fields are UTF-8 strings used verbatim
- Precedence / merge: single source — the one file is the whole configuration; no layering, no environment override in normal use; the test seam `DISPATCH_ROSTER_PATH` replaces the whole file for the hook tests only
- Decision record: record: the commit message of each roster change (a6359ca7 luna only by config, 5a94aa5d enabled required) plus the dated owner quote in the file header; the quote is rationale, not an approval mechanism
- Exception encoding: none: there are no per-dispatch exceptions; the only switch is a row's `enabled`, and a disabled row is denied without an override path
- Verification command: `bun test agents/claude/hooks/tests/enforce-dispatch-contract.test.ts` (runs the real hook against the live file and against fixtures) and `mise run lint:roster`
- Positive case: the committed roster loads; `mise run lint:roster` prints "render-roster: up to date"; with every row enabled (fixture), Agent `subagent_type:"sonnet-high"` passes the hook
- Negative case: a row without `enabled`, an unknown key (`allow_claude = true`), a redefined key, `enabled = "false"`, a disabled default, a duplicate id, or a non-URL source each fail the load, and the hook denies with "cannot read agents/models/dispatch-roster.toml" plus the reason

## Residual

- The working tree is effective: an uncommitted edit takes effect on the next hook call, before
  any review or commit gate. The owner is the only writer on these machines, so this is accepted.
- A running session keeps the CLAUDE.md table it read at start; the hook, which re-reads the
  file, is the enforcement, and the table is only guidance.
- The checks prove the loader and the hook accept or reject inputs; they do not prove the
  benchmark numbers are current (see the file header for how they are refreshed).
