# agx run records

`agx` (also available as `agx-next` for one release) stores one append-only JSONL file at `$AGX_NEXT_STATE_DIR/records.jsonl`
(default: `$AGX_STATE_DIR/records.jsonl` when that override is set, otherwise
`$XDG_STATE_HOME/agx-next/records.jsonl` or `~/.local/state/agx-next/records.jsonl`).
Each line is one event. Readers ignore an incomplete trailing line and reject malformed
complete lines. Event `at` values are RFC 3339 timestamps. Ticket paths are positional:
`agx check TICKET.md` and `agx run TICKET.md --cd TREE`.
Judgments use `agx judge RUN_ID accept|reject [--note TEXT]`; a continuation
uses `agx run TICKET.md --continue PREVIOUS_RUN_ID`.

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
  "vendor_session", "legacy_key?" }`. `report_path` points to the worker's final
  report file, or is `null` for a legacy run whose report was embedded in the old log.
- `judged`: `{ "kind": "judged", "id", "at", "decision", "note" }`.

Imported events may carry `legacy_key`, a deterministic deduplication key.
`agx stats --import-legacy` reads `runs*.jsonl` from `$AGX_STATE_DIR` (default
`~/.local/state/agx`), folds `run`, `acceptance`, `grade`, `grade-waived`, `interim`,
and `landed` rows into the same event log, skips malformed lines, and reports import
counts. Importing the same source again adds no duplicate events.

Events are append-only. The current run view folds events by `id`: the latest
progress and judgment win; a `started` with no `ended` is `running` while its
dispatcher process exists and `orphaned` otherwise; a run with `ended` is `ended`.

## `agx ls --json`

The output is an array of objects with these contract fields:

| Field | Meaning |
| --- | --- |
| `id` | Run identifier. |
| `ticket` | Ticket name, or the prompt filename when unnamed. |
| `state` | `running`, `ended`, or `orphaned`. |
| `exit` | Worker exit code, or `null` while not ended. |
| `row` | Selected roster row. |
| `dispatcher_session` | Session identifier of the dispatching coordinator. |
| `cwd` | Working directory passed to the worker. |
| `workspace` | Workspace root used for write globs and premise checks. |
| `writes` | Ticket write globs. |
| `judgment` | `null` or `{ "decision", "note" }`. |
| `report_path` | Final report path, or `null` until ended. |
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
