# CONFIGURATION CONTRACT — dispatch roster

The contract for `agents/models/dispatch-roster.toml`. The roster is the source of worker rows;
`agents/models/roster.ts` validates it, the router selects a row, and the hook renders the table.

- Consumer: `agx worker run`, the dispatch-contract hook, and `scripts/render-home.ts`
- Authority / writer: the dotfiles owner, by commit to this repository
- Effective configuration: the checked-out `agents/models/dispatch-roster.toml`; the deployed Claude policy is a rendered view
- Source representation: TOML parsed with `Bun.TOML.parse` and validated by the strict roster schema
- Trust regime: human-authored model, route, capability, and price data
- Schema / version: `schema = 1`; unknown keys and duplicate choice ids are rejected
- Selection: `agx worker run` sends the ticket and eligible roster rows to Jev, then records the selected row id in the run record. Jev selection uses ticket and roster evidence, never local graded feedback. Sol 6.1 uses its historical `sol-low` through `sol-max` ids; retired ids are not repointed to another generation.
- Capacity eligibility: recent `capacity` outcomes temporarily exclude the row and its vendor-model effort variants before Jev and fallback selection. Bounds and continuation recovery are defined in [the worker contract](../../tools/agx-worker/contract.md).
- Route eligibility: optional `[auto].routes` limits auto-pick to the listed routes (`codex`, `claude`); omission allows every route. An empty list or unknown name rejects roster loading and names the known routes. The committed policy allows only `codex`. Capability and subscription filters apply within this allowlist; Jev and fallbacks cannot select an excluded row.
- Subscription window exhaustion: `[auto].on_window_exhausted` is an optional table with keys `codex` and `claude`, each `"continue"` or `"stop"`; any other key or value rejects roster loading. An omitted route, or an omitted table, means `"continue"`. A non-stale window at 100% or more marks the route exhausted; only a route declared `"stop"` is then unavailable for usage, dispatch, `check` and continuation. A `"continue"` route stays eligible because a vendor may still serve it from purchased credits. Real vendor refusals are learned through `capacity` outcomes and the cooldown above, which exclude the row regardless of this declaration.
- Model generation exclusivity: roster loading checks every candidate row before selection. Within each recognized model family, all rows must use one generation; rows for multiple efforts of the same exact model remain valid, as do independent families. A conflict reports the family and exact model slugs and tells the owner to keep one generation by removing or updating rows. Historical run records remain unchanged.
- Recognized slug grammar: `gpt-<numeric-generation>-<family>` for any lowercase lexical family (for example, `gpt-6.1-sol`); `claude-<family>-<major>-<minor>` for any lowercase lexical family (for example, `claude-sonnet-5-5`). Numeric version components are normalized for comparison. A malformed slug that names one of these families rejects with its required shape. Other opaque custom slugs remain valid for compatibility but receive no family collision check until their grammar is explicitly added here and in `roster.ts`.
- Diagnostics: `agx worker check` and the no-capability-eligible-row error show the active route filter. The full roster table and Claude agent types retain all rows.
- Commands: `agx worker dispatch`, `agx worker run`, `agx worker check`, `agx worker ls`, `agx worker judge`, and `agx worker stats`
- Ticket ownership: callers own ticket files and pass their paths to `agx worker run` or `agx worker check`
- Run history: append-only records are read through `agx worker ls --json`; legacy run logs can be imported by `agx worker stats --import-legacy`
- Continuation: `agx worker run TICKET.md --continue RUN_ID` continues the selected run's vendor session only when its recorded row remains in the active roster. A retired choice id is rejected before a worker starts; it must not be resolved to a newer model. Capacity-ended runs select another model or record a fresh dispatch as `supersedes`.
- Durable execution: `agx worker dispatch TICKET.md [--ws SLUG] [--unit NAME] [--sandbox MODE] [--continue RUN_ID]`
- Verification command: `bun test agents/models/tests/roster.test.ts agents/models/tests/roster-generation.test.ts`
- Positive case: the roster loads, every row renders, `agx worker run` records the selected row, and the documented worker commands are available
- Negative case: an unknown roster key, malformed source or supported-family slug, duplicate choice id, invalid default, or multiple generations in one recognized family rejects roster loading

## Residual

- Benchmark and price values are human-maintained snapshots; this contract does not establish that they remain current or that Jev's selection is good.
- The worker state directory name is retained to preserve existing records; command entrypoints are `agx worker` and `agx-worker`.
- Future provider slug formats remain opaque until declared; this contract does not infer family identity by stripping numeric tokens.

## Sol 6.1 snapshot

The five `sol-*` rows restore their frozen 2026-10-08 Sol 6.1 snapshot and source URLs. Each effort clears the 30.0 TB4 terminal/agentic floor. These are published benchmark and list-price inputs; local grades do not affect selection. The generation loader rejects a mixed Sol roster before Jev is called.
