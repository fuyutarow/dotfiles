# agx run records

`agx` (also available as `agx-next` for one release) stores one append-only JSONL file at `$AGX_NEXT_STATE_DIR/records.jsonl`
(default: `$AGX_STATE_DIR/records.jsonl` when that override is set, otherwise
`$XDG_STATE_HOME/agx-next/records.jsonl` or `~/.local/state/agx-next/records.jsonl`).
Each line is one event. Readers ignore an incomplete trailing line and reject malformed
complete lines. Readers ignore unknown fields; writers may add fields; required fields never
change type. Event `at` values are RFC 3339 timestamps. Ticket paths are positional:
`agx check TICKET.md` and `agx run TICKET.md --cd TREE`.
Judgments use `agx judge RUN_ID accept|reject [--note TEXT]`; every `ls --json`
`judgment.decision` is `accept`, `reject`, or `null`. A continuation
uses `agx run TICKET.md --continue PREVIOUS_RUN_ID`.
`agx run` records `dispatcher_session` from `--session ID`, then `AGX_DISPATCHER_SESSION`,
`CLAUDE_CODE_SESSION_ID`, or `CODEX_SESSION_ID`; missing session context is recorded as `null`
with a `WARN` line.

Human `agx ls` shows runs newest first, limited to the last 30 by default; `agx ls --all` shows
the full list. `agx ls --json` remains complete and preserves append/fold order.

The next ticket schema requires `proposition.id`, `proposition.claim`, and
`proposition.refuted_by`; legacy `decides`, `serves`, and `graph_node` are optional
and ignored. Legacy-only fields such as `consumer`, `first_return`,
`read_only_diagnostic`, `timeout_reason`, and `RESOURCE-*` lines are ignored with
one `WARN` line per invocation. `capabilities` are sent to Jev for routing only.
Ticket validation and premise refusals exit 2.

## Event lines

- `started`: `{ "kind": "started", "id", "at", "ticket", "writes",
  "cwd", "workspace", "row", "dispatcher_session", "vendor_session", "pid",
  "continues?", "legacy_key?" }`.
  Session identifiers are nullable; `writes` is the ticket's relative path-glob list.
  `pid` is the dispatch process id used to distinguish running from orphaned records.
- `progress`: `{ "kind": "progress", "id", "at", "path", "legacy_key?" }`. `path` points to
  the per-run latest interim-return file, outside the checkout.
- `ended`: `{ "kind": "ended", "id", "at", "exit", "report_path",
  "vendor_session", "verify", "legacy_key?" }`. `exit` is the worker's exit code.
  `report_path` points to the worker's final report file, or is `null` for a legacy run
  whose report was embedded in the old log. `verify` is an ordered array of
  `{ "cmd", "exit", "log_path" }` facts; each command runs through `sh -c` in the
  `--cd` tree after the worker exits. Its log contains the last 20 lines of combined
  output and lives next to `report.json`. Older ended events without `verify` fold as
  an empty array.
- `judged`: `{ "kind": "judged", "id", "at", "decision", "note" }`.

Imported events may carry `legacy_key`, a deterministic deduplication key.
`agx stats --import-legacy` reads `runs*.jsonl` from `$AGX_STATE_DIR` (default
`~/.local/state/agx`), folds `run`, `acceptance`, `interim`, and `landed` rows into the same
event log, skips malformed lines, and reports import counts. Legacy `acceptance` rows become
`accept` or `reject`; `landed` becomes `accept`. Legacy `grade` and `grade-waived` rows are
ignored because grades are not judgments. Existing invalid `judged` decisions remain in the
append-only log but are ignored when folding; `landed` decisions from earlier imports fold as
`accept`. The latest valid judgment wins. Importing the same source again adds no duplicate
events.

Events are append-only. The current run view folds events by `id`: the latest
progress and judgment win; a `started` with no `ended` is `running` while its
dispatcher process exists and `orphaned` otherwise; a run with `ended` is `ended`.

## `agx ls --json`

The output is an array of objects with these contract fields:

| Field | Meaning |
| --- | --- |
| `id` | Run identifier. |
| `started_at` | RFC 3339 timestamp from the run's `started` event. |
| `ended_at` | RFC 3339 timestamp from the run's `ended` event, or `null` while running or orphaned. |
| `ticket` | Ticket name, or the prompt filename when unnamed. |
| `state` | `running`, `ended`, or `orphaned`. |
| `exit` | Worker exit code, or `null` while not ended. |
| `row` | Selected roster row. |
| `dispatcher_session` | Session identifier of the dispatching coordinator. |
| `cwd` | Working directory passed to the worker. |
| `workspace` | Workspace root used for write globs and premise checks. |
| `writes` | Ticket write globs. |
| `judgment` | `null` or `{ "decision": "accept" | "reject", "note" }`. |
| `report_path` | Final report path, or `null` until ended. |
| `verify` | Ordered `{ "cmd", "exit", "log_path" }` facts from ticket verification, or `[]` when no commands were declared / for older records. |
| `last_progress_path` | Most recent interim-return path, or `null`. |
| `continues` | Previous agx run id supplied via `--continue`, or `null` for a fresh run. |
| `vendor_session` | Latest worker vendor session identifier, or `null`. |

## Behavior notes

`run` and `check` print one `WARN` line for each live run whose declared write
globs intersect the current ticket's globs. Intersection is segment-exact: `*`
and `?` match within one path segment, `**` spans segments, and brace alternatives
are expanded. Overlap is reported and never blocks a command.

`check` evaluates declared premises in the `--cd` tree. The caller must pass an
up-to-date tree. `workspace` is the resolved `--cd` directory unless a ticket
declares a separate workspace.

Premises may be `file:<path>`, `symbol:<name>` or `symbol:<name>@<glob>`,
`bookmark:<name>` or `bookmark:<name>@<remote>`, `task:<mise-task>`, and
`rev:<jj-revset>`. Bookmark names are emitted with a jj template, excluding
human-readable commit descriptions. Bookmark and revision premises use jj when
the selected tree is a jj repository; bookmark checks fall back to Git refs in
a non-jj Git tree.
Task names come from `mise tasks --json`. All premise commands share a five
second total budget. A failed premise refuses `check` and `run` with exit 2,
including the premise and at most the last three trimmed lines of command output.
