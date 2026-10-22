# agx worker run records

`agx-worker` stores one append-only JSONL file at `<state>/records.jsonl`.
State resolves from non-empty `AGX_STATE_DIR`, then non-empty `XDG_STATE_HOME` plus
`/agx`, then `~/.local/state/agx`. See [startup migration refusals](../contract.md).
Each line is one event. Readers ignore an incomplete trailing line and reject malformed
complete lines. Readers ignore unknown fields; writers may add fields; required fields never
change type. Event `at` values are RFC 3339 timestamps. Ticket paths are positional:
`agx worker check TICKET.md` and `agx worker run TICKET.md --cd TREE`.
Judgments use `agx worker judge RUN_ID accept|reject [--note TEXT]`; every `ls --json`
`judgment.decision` is `accept`, `reject`, or `null`. A continuation
uses `agx worker run TICKET.md --continue PREVIOUS_RUN_ID`.
`agx worker run` records `dispatcher_session` from `--session ID`, then `AGX_DISPATCHER_SESSION`,
`CLAUDE_CODE_SESSION_ID`, or `CODEX_SESSION_ID`; missing session context is recorded as `null`
with a `WARN` line.
verify should include `mise run gate:land` for a change that will land in dotfiles.

Human `agx worker ls` shows runs newest first, limited to the last 30 by default; `agx worker ls --all` shows
the full list. `agx worker ls --json` remains complete and preserves append/fold order when no selector
is supplied. `agx worker ls SELECTOR [--json]` selects an exact run id, unique run-id prefix, or exact
ticket name. A ticket selection is ordered oldest first so its latest run is last. Ambiguous
prefixes and unmatched selectors exit 2 with one candidate line.

JSON rows include `health`, computed by the same classification as `agx worker doctor`:
`orphaned`, `unjudged`, or `null` when there is no finding. Imported and pre-contract
history and judged runs have no finding and remain visible through `agx worker ls --all`.
The statusline's lost count counts only `orphaned` rows.

The next ticket schema requires `proposition.id`, `proposition.claim`, and
`proposition.refuted_by`; legacy `decides`, `serves`, and `graph_node` are optional
and ignored. Legacy-only fields such as `consumer`, `first_return`,
`read_only_diagnostic`, `timeout_reason`, and `RESOURCE-*` lines are ignored with
one `WARN` line per invocation. `capabilities` are sent to Jev for routing only.
Ticket validation and premise refusals exit 2.

Optional typed declarations supplement schema 2 tickets. A malformed declaration refuses both
`check` and `run`; missing required fields name the table, key and an example. These fields are
included in the worker brief. Resource admission remains the caller's job; `network` declares
the worker's task constraint and does not configure a host firewall.

```toml
base_rev = "0123456789012345678901234567890123456789" # exact --cd commit id
external_reads = ["/path/to/reference"]
first_return_s = 120 # positive integer, no greater than timeout_s (default 600)
network = "none" # none | allowed
sandbox = "workspace-write" # none | read-only | workspace-write
resources = { cpu = 2, ram_gb = 4, gpu = 0, vram_gb = 0 }
```

Resource `cpu` is positive; `ram_gb` and optional `vram_gb` are nonnegative numbers; optional
`gpu` is a nonnegative integer. If `resources` is supplied, `cpu` and `ram_gb` are required.
External reads are nonempty single-line strings. The sandbox declaration selects launch mode;
a conflicting `--sandbox` flag is refused. `first_return_s` is an interim-report deadline passed
to the worker, rather than a second process timeout. `supersedes = "RUN_ID"` (or
`--supersedes RUN_ID`) records replacement by a fresh dispatch; it cannot accompany `--continue`.

## Event lines

- `started`: `{ "kind": "started", "id", "at", "ticket", "writes",
"cwd", "workspace", "row", "dispatcher_session", "vendor_session", "pid",
"continues?", "supersedes?", "base_rev?", "premise_commits?", "ticket_path?",
"ticket_orig_path?", "ticket_sha256?", "legacy_key?" }`.
  Session identifiers are nullable; `writes` is the ticket's relative path-glob list.
  `pid` is the dispatch process id. New runs include `lease: { pid, start, unit }`: start identifies the process (Linux boot id plus start ticks); unit is the owning systemd service when present.
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
`agx worker stats --import-legacy` reads legacy ledgers from `<state>/legacy-v1` (read-only), folds `run`, `acceptance`, `interim`, and `landed` rows into the same
event log, skips malformed lines, and reports import counts. Legacy `acceptance` rows become
`accept` or `reject`; `landed` becomes `accept`. Legacy `grade` and `grade-waived` rows are
ignored because grades are not judgments. Existing invalid `judged` decisions remain in the
append-only log but are ignored when folding; `landed` decisions from earlier imports fold as
`accept`. The latest valid judgment wins. Importing the same source again adds no duplicate
events.

Events are append-only. The current run view folds events by `id`: the latest
progress and judgment win; a `started` with no `ended` is `running` while its
owner lease matches and `ended` with outcome `lost` otherwise; a run with `ended` is `ended`. Legacy starts without a lease use their PID for liveness and migrate to the same closed view on read. Signal traps write outcome `stopped` with `signal` (SIGTERM, SIGINT, or SIGHUP). Derived loss includes `evidence` with expected/observed process identity and the systemd unit Result when available. A collected or unavailable unit has a null Result; loss still follows process evidence.

## `agx worker ls --json`

The output is an array of objects with these contract fields:

| Field                | Meaning                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                 | Run identifier.                                                                                                                                                                                              |
| `started_at`         | RFC 3339 timestamp from the run's `started` event.                                                                                                                                                           |
| `ended_at`           | RFC 3339 timestamp from the run's `ended` event, or `null` while running or for derived loss.                                                                                                                |
| `ticket`             | Ticket name, or the prompt filename when unnamed.                                                                                                                                                            |
| `state`              | `running` or `ended`; `outcome` is null while running and typed for ended runs.                                                                                                                              |
| `exit`               | Worker exit code, or `null` while running or for derived loss.                                                                                                                                               |
| `row`                | Selected roster row.                                                                                                                                                                                         |
| `dispatcher_session` | Session identifier of the dispatching coordinator.                                                                                                                                                           |
| `cwd`                | Working directory passed to the worker.                                                                                                                                                                      |
| `workspace`          | Workspace root used for write globs and premise checks.                                                                                                                                                      |
| `writes`             | Ticket write globs.                                                                                                                                                                                          |
| `judgment`           | `null` or `{ "decision": "accept"                                                                                                                                                                            | "reject", "note" }`. |
| `report_path`        | Final report path, or `null` until ended.                                                                                                                                                                    |
| `verify`             | Ordered `{ "cmd", "exit", "log_path" }` facts from ticket verification, or `[]` when no commands were declared / for older records.                                                                          |
| `last_progress_path` | Most recent interim-return path, or `null`.                                                                                                                                                                  |
| `continues`          | Previous agx worker run id supplied via `--continue`, or `null` for a fresh run.                                                                                                                             |
| `supersedes`         | Run replaced by this fresh dispatch, or `null`; absent in historical runs.                                                                                                                                   |
| `base_rev`           | Full commit id observed in the `--cd` tree before routing; absent when `--cd` has no repository and in historical runs.                                                                                      |
| `premise_commits`    | `{ premise, commit }` entries: revision/bookmark premises resolve their referenced commit; file, symbol and task checks are observed in the tree at `base_rev`, or omitted here when there is no repository. |
| `ticket_path`        | Absolute source ticket path.                                                                                                                                                                                 |
| `ticket_orig_path`   | Per-run provenance copy, preserved byte-for-byte.                                                                                                                                                            |
| `ticket_sha256`      | SHA-256 of those original bytes; also written to `ticket.orig.md.sha256`.                                                                                                                                    |
| `vendor_session`     | Latest worker vendor session identifier, or `null`.                                                                                                                                                          |

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

## Incremental run view

`agx worker ls` and other `foldedRuns` callers cache event prefixes only in process memory. Each reader validates inode, device, size, and complete-line offset before reusing its prefix. Rotation and truncation rebuild it; incomplete UTF-8 tails remain unconsumed. Old `records.fold.json` snapshots are ignored. Neither `ls` nor `ls --wait` writes any file.

Process liveness and early-quit classification are recomputed on every read.
Before returning derived loss, readers check whether the log changed during
asynchronous process/unit observation and replay it if needed. An `ended` record
appended before the owner disappeared takes precedence over the earlier read.
`agx worker ls --running` filters to runs whose dispatcher PID is currently live, excluding
ended runs (including lost). It combines with selectors, `--json`, and `--all`; the
human limit and older-run count apply to the filtered runs. Warm reads consume
only appended log bytes, plus any previously incomplete tail; validating the memory cache,
checking liveness, and emitting rows still cost proportionally to the stored runs.

## Published snapshot (`current-runs.json`)

The owner publishes `$AGX_NEXT_STATE_DIR/current-runs.json` after each appended event, written
atomically under a kernel lock: one file, one writer. It is `{ "output", "capturedAt", "exit",
"endedRuns", "acceptedRuns" }`. `output` is the JSON text of `{ runs, summary }` for running and
orphaned rows, unchanged. Readers must ignore unknown fields. The two arrays let `agx-status` count
judgments without replaying `records.jsonl`; both hold rows
`{ "id", "dispatcher_session", "workspace", "ended_at", "judgment" }` with `judgment` either
`null` or `{ "decision" }`, in fold order, and only for runs that have an `ended` record (running
runs and derived loss carry no `ended_at` and are omitted):

| Field          | Contents                                                                                                                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endedRuns`    | Every ended run whose `ended_at` is within 24 h of `capturedAt` (judged or not). An unparsable `ended_at` is omitted. Readers re-apply their own 24 h cutoff.                                                          |
| `acceptedRuns` | Every ended run judged `accept`, with no age limit, whose `workspace` was an existing directory at `capturedAt`. These are the candidates for a reader's unlanded count; readers still check the directory themselves. |

Readers treat a snapshot older than `records.jsonl` as stale. A snapshot lacking either array comes
from an older writer; its judgment facts are unavailable, not zero.

## Doctor findings

`agx worker doctor` reports current states that require a person's action. It reports
`orphaned` only for an unjudged leased run whose owner is gone and
whose `ended` record is absent after the liveness recheck. A recorded completion
with an explicit `returned` flag and no judgment is `unjudged` immediately,
regardless of the flag's value, outcome or verification results. An absent flag
identifies a completion from before the return contract; it produces no finding.
For current writers, `returned` records the fenced
`agx-return` marker, not the existence of a final JSON report; this flag does not
establish process loss. Runs without a recorded lease, including legacy imports,
and runs with a judgment produce no run finding. History stays in `agx worker ls --all`;
none of these classifications rewrites it.

Each finding includes its one-line action:

| Kind                      | Action                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| `orphaned`                | Review the lost run and run `agx worker judge RUN_ID accept\|reject`.      |
| `unjudged`                | Review the completed run and run `agx worker judge RUN_ID accept\|reject`. |
| `outside-home`            | Move the ticket to the ticket home printed in the finding.                 |
| `accepted-landed-present` | Run the printed `agx ticket gc --repo REPO` to collect the ticket.         |
| `collectable`             | Run the printed `agx ws gc --include-unrecorded --repo REPO`.              |
| `unlanded-72h`            | Enter the printed workspace and run `mise run land`.                       |
| `stale`                   | Run the printed `agx ws refresh NAME --repo REPO`.                         |
