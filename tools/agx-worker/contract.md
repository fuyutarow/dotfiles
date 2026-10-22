# agx-worker CLI contract

`agx-worker` owns worker runs. Its package bin points to `src/next/cli.ts`. The suite also accepts `agx worker`.

| Command | Purpose |
| --- | --- |
| `agx worker run TICKET [--cd TREE] [--sandbox MODE] [--continue RUN_ID] [--session ID]` | Route a ticket to a roster worker, run it, and append run records. |
| `agx worker check TICKET [--cd TREE]` | Validate a ticket and its premises without starting a worker. |
| `agx worker ls [SELECTOR] [--workspace PATH] [--json]` | List runs and judgments; SELECTOR is a run id, unique run-id prefix, or exact ticket name. Ticket selections put the newest run last. |
| `agx worker judge RUN_ID accept\|reject [--note TEXT]` | Append an acceptance or rejection judgment. |
| `agx worker stats [--import-legacy]` | Report run counts; optionally import legacy run records. |
| `agx worker dispatch TICKET [--ws SLUG] [--unit NAME]` | Obtain a workspace through `agx ws` and start a durable worker unit. |
| `agx worker roster TICKET` | Print one selected roster row. `roster --json` prints the full validated roster and routing objective. |
| `agx worker doctor` | Diagnose worker records as tool/object/finding/remedy JSON Lines. |

The top-level `objective` field in `roster --json` is the routing objective text used to select workers; the per-ticket `roster TICKET` output remains one selected row.

Tickets are caller-owned files. `agx worker run` accepts positional ticket paths and optionally a working
tree and sandbox mode. A continuation uses the previous run ID and resumes its vendor session,
except for the capacity recovery described below.
Run events, progress, and judgments are stored in one append-only `records.jsonl` file. The default
state directory keeps its `agx-next` name for compatibility; the real state directory is not
migrated by this CLI switch.
Local judgments and graded run summaries remain audit data and do not enter the Jev request or
deterministic fallback ranking. Selection uses the ticket, roster evidence, explicit route and
capability policy, live quota availability, and operational capacity guards.

Use `agx worker ls --json` as the machine-readable view. Its rows include the run ID, ticket, state,
workspace, selected roster row, write globs, judgment, report path, progress path, and continuation
metadata. `scripts/land.ts` consumes this view alongside legacy run records when deciding whether a
workspace has an accepted run.

`ls --workspace PATH` compares real absolute paths, including symlink resolution. A missing or
unresolvable path exits 2 with one diagnostic line. It combines with `--json`, `--all`,
`--running`, selectors and `--summary`; it cannot combine with `--latest` or `--wait`.
Filtering happens before the human output limit and running counts. JSON run objects retain
the ordinary listing fields and observation-time elapsed values.

The owner publishes complete per-workspace folds under `workspaces/<sha256-of-real-path>.json`
alongside `current-runs.json`. These include all ended runs and running runs, without an age
cutoff. A workspace read validates the log's device, inode, size, modification time and change
time using metadata, then reads only that workspace's fold and rechecks liveness with the
ordinary listing producer. Its work scales with the selected workspace's runs and output,
not the number of historical records or runs in other workspaces. Missing publications
(including those from older writers), invalid publications and stale log identities trigger
the existing replay path with an explicit stderr diagnostic. Listing does not write or repair
publications. The next owner publication produces them; rollout must update that writer.

`scripts/agx-accept.ts SELECTOR`, exposed as `mise run accept -- SELECTOR`, composes the selected
latest run's verification exits, report preview, workspace diff stat, and suggested judge/land
commands. It is read-only; the coordinator runs those commands separately.

`dispatcher_session` uses `--session ID` first, then `AGX_DISPATCHER_SESSION`,
`CLAUDE_CODE_SESSION_ID`, and `CODEX_SESSION_ID`. If none is available, the run records `null`
and emits a `WARN` line. A durable systemd user unit does not inherit its caller's environment;
forward both supported dispatcher variables explicitly:

```sh
systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agt_<slug> --collect -- agx worker run TICKET.md
```

Harness VCS reads in premise checks, official-execution tracking and repo-retrieve run inside
OS-enforced write denial before jj/Git starts: Landlock ABI >=3 on Linux x64/arm64 and
`sandbox-exec` on macOS. An unavailable boundary fails closed. CLI read flags alone do not
prevent backend metadata writes. See [the call-site and patch inventory](docs/ref-writer-inventory.md).

The dispatcher does not detach, amend, or create ticket stores and does not run a pre-dispatch
grader. `agx worker run` records an interim return as progress and continues the worker until completion or
its timeout. After the worker exits, effective `[verify].always` commands run in array order,
followed by the ticket's `verify` commands. Both use the same working directory, environment,
per-command logs, exit classification and outcome handling; any nonzero verification exit
prevents an `ok` outcome. As with ticket verification, all commands run even after a failure.

Repositories may declare `[verify]` with `always = ["command", "another command"]` in L1
`agx.toml` or their XDG L2 repository override. The table is strict: only `always` is accepted,
and its value must be an array of non-empty strings. The default is `[]`; L1 then L2 replace
the array rather than concatenating it. An omitted key inherits, while `always = []` clears it.
Resolution follows the existing immutable L1 and machine-local L2 reader for the execution
repository. `agx worker check` prints effective non-empty always commands without executing them.
Always command results carry `source: "[verify].always"` in the run's `verify` array and
diagnostic output. When always commands are configured, the saved report also includes the
complete ordered `verify` results. Without the key, existing output and verification behavior
are preserved. Capacity runs skip both always and ticket verification.

Vendor capacity ends a run with outcome `capacity` and temporary-unavailability exit 75. Codex's
`Selected model is at capacity` and Claude's documented HTTP 529 `overloaded_error` are vendor
unavailability, not worker failures ([Claude error reference](https://platform.claude.com/docs/en/api/errors)).
The wrappers stop on either error immediately, allow one second for termination, then force a kill;
pipe draining has a further one-second bound. No vendor retry is started by the wrapper.

The initial model wait is bounded to 120 seconds, allowing ordinary startup and network latency
without consuming a long ticket's budget. Session/turn metadata and reconnect messages do not
renew this bound. Substantive model output or tool activity ends the initial wait; an active
worker then has the ticket's normal timeout. Expiring the initial wait also yields `capacity`.

The selected row remains in the run record. A capacity outcome excludes that row, and every
effort variant for its vendor model, for 300 seconds after completion. Five minutes prevents
immediate relaunch loops while allowing automatic recovery. Existing capability, subscription,
route-allowlist and Jev/fallback rules choose among the remaining rows; exhausting them refuses
dispatch rather than waiting or retrying a cooled model. Capacity runs skip ticket verification,
do not require a worker judgment, and never contribute to graded worker acceptance/failure counts.

`--continue` on a capacity run always routes away from the old vendor model, even after its
cool-down expires. A recorded Codex session can resume on another Codex model using `-m/--model`
(verified with `codex exec resume --help`). Otherwise the command announces a fresh dispatch and
records `supersedes` with `continues: null`. A resumed session records `continues` normally.

See [next-records.md](docs/next-records.md) for the append-only record schema and JSON listing.
