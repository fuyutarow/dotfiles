# CONFIGURATION CONTRACT — dispatch roster

The contract for `agents/models/dispatch-roster.toml`. The roster is the source of worker rows;
`agents/models/roster.ts` validates it, the router selects a row, and the hook renders the table.

- Consumer: `agx run`, the dispatch-contract hook, and `scripts/render-home.ts`
- Authority / writer: the dotfiles owner, by commit to this repository
- Effective configuration: the checked-out `agents/models/dispatch-roster.toml`; the deployed Claude policy is a rendered view
- Source representation: TOML parsed with `Bun.TOML.parse` and validated by the strict roster schema
- Trust regime: human-authored model, route, capability, and price data
- Schema / version: `schema = 1`; unknown keys and duplicate choice ids are rejected
- Selection: `agx run` sends the ticket and eligible roster rows to Jev, then records the selected row in the run record
- Commands: `agx run`, `agx check`, `agx ls`, `agx judge`, and `agx stats`
- Ticket ownership: callers own ticket files and pass their paths to `agx run` or `agx check`
- Run history: append-only records are read through `agx ls --json`; legacy run logs can be imported by `agx stats --import-legacy`
- Continuation: `agx run TICKET.md --continue RUN_ID` continues the selected run's vendor session
- Durable execution: `systemd-run --user --unit=agx-<name> --collect -- agx run TICKET.md`
- Verification command: `bun test agents/models/tests/roster.test.ts agents/claude/hooks/tests/enforce-dispatch-contract.test.ts tools/agx/tests/next/run.test.ts`
- Positive case: the roster loads, every row renders, `agx run` records the selected row, and all five commands are available
- Negative case: an unknown roster key, malformed source, duplicate choice id, or invalid default rejects the roster load

## Residual

- Benchmark and price values are human-maintained snapshots; this contract does not establish that they remain current or that Jev's selection is good.
- `agx-next` remains a package alias for this release. Its state directory name is retained to preserve existing records.
