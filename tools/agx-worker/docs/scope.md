# agx-worker scope and ownership

This table describes `agx-worker`, routed by the process-only `agx` suite entry. See the [suite
section of the tools architecture](../../spec/architecture.md#suite) for the part boundaries; the
architecture owns the whole pipeline, its invariants and their checks.

## 1. agx-worker does

agx-worker has four jobs:

- **Route:** Jev picks a roster row for a ticket.
- **Launch:** start the selected vendor worker in the tree passed with `--cd`.
- **Record:** append run events to the single event data file, `records.jsonl` (under the agx-worker state directory). After the worker exits, this job also executes each declared verify command in order through `sh -c` in the `--cd` tree, captures its exit and output tail beside `report.json`, and stores those facts in the `ended` event. Verification failures do not change the worker's run exit.
- **Fold:** `ls`, `stats`, and `judge` read or append those events. `judge` appends a judgment; `ls` and `stats` fold existing records.

Its worker commands are `dispatch`, `run`, `check`, `ls`, `judge`, `stats`, `roster`, and `doctor`.
`dispatch` obtains its workspace through `ws add --json`; workspace creation stays in ws.
`roster TICKET` prints one selected row; legacy `roster --json` prints the full roster.
Deprecated `jev` remains a transport filter for dx. `doctor` reports worker findings as JSON Lines.
 `check` validates ticket premises in the supplied tree and reports overlapping live write globs; it does not reserve writes. The event log is the single durable run-event data file. A run also creates per-run brief, report, and progress artifacts alongside that log.

Tickets live in `<repo>/.agents/tickets/`, or in the home declared by `tickets = "<path>"`
in the `--cd` repository's `.agx.toml` at `trunk()` (Git: `HEAD`). For jj, the repository root
is its `default` workspace, even when `--cd` selects a secondary workspace. Relative homes
resolve from that repository root; absolute homes are allowed. Revision and premise checks
still use the dispatch workspace. A declared home is honoured even under `/tmp`. Both `check`
and `run` refuse tickets outside the default and declared homes with exit 2 and a `WARN` naming
the declared home and `tkt new`. Symlinks cannot make an outside file appear to belong to a home.
Uncommitted changes to `.agx.toml` do not change the accepted home.

Before launching a worker, `run` writes the input bytes to `runs/<id>/ticket.orig.md`, writes
`ticket.orig.md.sha256`, and records `ticket_sha256`, the original and copied paths, `base_rev`
and `premise_commits` in its started event. This copy is provenance, not storage: users still
create, amend and version tickets in their repository's home. It preserves the exact dispatched
input after the source is edited or removed. A declared `base_rev` must equal the resolved
`--cd` commit; a mismatch refuses dispatch before routing or launch and names both ids.

A repository ticket can also launch a worker with `--cd` outside any repository for data or
survey work. Ticket placement still uses the ticket's repository. The run omits `base_rev`
and commit provenance for file, symbol and task premises in this case; those premises and
all verify commands still run in `--cd`. A declared `base_rev` or revision premise still
requires a resolvable worker commit. The router reports `no repository` for repository changes,
end commits and landing; those actions are unavailable and do not fail the worker run.
Content snapshots still count changed files in the promised write surface and derive the
outcome from the worker report and checks. A Git or jj worker directory records its own
commit as `base_rev`, including a scratch directory initialized with `jj git init`.

`agx-worker` owns fold and selection for `agx ls [SELECTOR] [--json]`, which accepts a run id, a unique run-id prefix, or an exact ticket name. Ticket selection returns that ticket's runs oldest first, with the newest run last. Ambiguous ID prefixes and unmatched selectors exit 2 with one line naming candidates. `agx ls --wait SELECTOR` is the one way to wait, and it is a read-only fold, not state: it takes an initial read, then re-reads the records file at a bounded poll interval (`AGX_WAIT_POLL_MS`, default 1000). A run-id selector preserves immediate lookup and returns at once if that run is already `ended`. An exact ticket selector ignores runs already terminal on the initial read; it waits until a run that was running on that read, or a run first recorded later, becomes `ended` (including derived `lost`, so a missing final report cannot hide a finished run), then prints that run's row in `ls` format (JSON with `--json`). It writes no file, not even the fold snapshot, and an empty, ambiguous, or unmatched selector exits 2 at once. The acceptance view is composed outside agx-worker by `scripts/agx-accept.ts`; agx-worker deliberately does not render reports or inspect workspace diffs.

## 2. agx-worker does not

| concern | owner | why |
| --- | --- | --- |
| Ticket storage, history, and amendments | Plain files plus jj | Tickets are inputs; `agx check` validates an input and does not own its history. |
| Write exclusion between workers | jj workspaces plus rebase at land | agx-worker only prints overlap `WARN` lines; it does not lock or block writes. |
| Workspace creation, readiness, collection and landing | `ws` (`tools/agx-ws`) / `mise run land` | agx-worker consumes a tree via `--cd`; creating, readying and collecting trees is `ws` (`tools/agx-ws`). Landing belongs to `mise run land`. |
| Durability or detach beyond the session | `systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agt_<slug> --collect -- agx run ...` | The caller chooses a service lifecycle; `-E NAME` carries the dispatcher's session into the unit. |
| CPU/GPU/RAM admission | `agent-resource-run` | Resource admission is outside agx-worker's routing and event-recording jobs. |
| Commits and pushes | `mise run commit` / `mise run land` | agx-worker records worker outcomes; repository publication belongs to the repository tasks. |
| Acceptance | A human or coordinator | Verify results are recorded facts; a human or coordinator reads them and decides acceptance. `agx judge` records the accept/reject decision and optional note; agx-worker does not decide acceptance. |
| Notifications and recap demands | Hooks consuming `agx ls --json` | Hooks can derive notifications from folded state; they must run the installed suite entry, not a checkout's working copy. |
| Waiting for a run | `agx ls --wait SELECTOR` (a read-only fold) | A stateful wait/detach command was removed on purpose; `ls --wait` only re-reads `records.jsonl` and writes nothing. |
| Searching code | `rr` | Code retrieval belongs to the repository search tool, not agx-worker. |
| Routing quality | Jev, corrected through the brief and roster `use_for` | Routing is Jev's choice among roster rows; agx-worker has no routing override. |
| Worker continuity records | The worker harness | A dispatched worker receives a bounded environment without coordinator slot or vendor session IDs. It owns its brief and workspace and does not bind a continuation record. |

## 3. Derived, not stored

Listed runs form the closed union `running{lease} | ended{outcome}`; `lost` is derived from owner lease evidence on every read without writing events or snapshots, while the `agx run` part traps SIGTERM/SIGINT/SIGHUP and records `ended{outcome: stopped, signal}`.

- A replaced run is named in a later fresh dispatch's `supersedes`, supplied by `--supersedes RUN`
  or the ticket's `supersedes` field. A resumed vendor session uses `--continue RUN` and records
  `continues`. These relationships are mutually exclusive.
- The ticket's latest run is the last recorded run for that ticket.
- Per-ticket judgment is the judgment on that latest run.
- `--continue` takes its timeout from the ticket supplied to that invocation: `ticket.timeout_s ?? 600` in [`src/next/run.ts`](../src/next/run.ts#L189-L213). The resumed vendor session does not carry a separate timeout field.

These are folds or interpretations of existing events and ticket inputs; they do not require new stored state fields.

## 4. How to triage a new ask

1. Does it fit one of agx-worker's four jobs?
2. If not, which owner in section 2 handles it?
3. Can a fold of existing events answer it?

Only an ask that fits a job and cannot be answered by folding existing events may add code to agx-worker.

## 5. Worker input and bounded outcomes

Codex and Claude workers receive a closed stdin stream. Their prompts remain explicit arguments
(the final `codex exec` argument and `claude -p <prompt>`), so a vendor cannot wait for an interactive
input stream. Their environment is rebuilt from `PATH`, `HOME`, `LANG`, `TZ`,
`AGX_DISPATCHER_SESSION`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`CLAUDE_CODE_OAUTH_TOKEN`, `OPENAI_API_KEY`, and `CODEX_API_KEY`, with `AGX_WORKER=1`. Coordinator
continuation slots and vendor session IDs are omitted; each vendor creates its own session identity.
When a worker hook has no
bound continuation record, the worker owns its brief and workspace and does not become read-only.
A Codex `Reading additional input from stdin...` stderr line with no subsequent stdout event for 30
seconds ends the worker with a `stdin-wait` receipt and the line as its cause. Five identical
consecutive tool errors end the worker with a `spin` receipt; a wall-clock bound remains `timeout`.

Cancellation sends the vendor SIGTERM and permits the existing 30-second cleanup window before
SIGKILL. External unit stops can still kill the whole cgroup. The harness VCS read boundary
protects the recovered read sites independently of this vendor cleanup grace.
