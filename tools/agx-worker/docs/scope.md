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
`dispatch` obtains its workspace through `agx ws add --json`; workspace creation stays in `agx ws`.
`roster TICKET` prints one selected row; legacy `roster --json` prints the full roster.
`doctor` reports worker findings as JSON Lines.
`check TICKET [--cd TREE]` runs the same input preflights as `run`: ticket schema and write-glob shape, ticket home, worker commit and premises, target mise environment/trust, running workspace, ownerless ref locks, sandbox, replacement/continuation references and roster eligibility. It prints every discoverable failure on its own line with a repair and exits 2 if any fail. A malformed input can prevent dependent checks, but independent checks still run. `dispatch` checks its selected workspace before starting the service and includes those failures alongside service/workspace findings. `check` also reports overlapping live write globs as warnings; it does not reserve writes, create a workspace, route a worker or launch a service. Launch-time commit and workspace-lock checks remain necessary because state can change after a check. The event log is the single durable run-event data file. A run also creates per-run brief, report, and progress artifacts alongside that log.

Tickets live in `<repo>/.agents/tickets/`, or in the home declared by `tickets = "<path>"`
in the repository's optional `agx.toml` at `trunk()` (Git: `HEAD`), with required `schema = 1`.
For jj, the repository root is its `default` workspace, even when `--cd` selects a secondary
workspace. Relative homes resolve from that repository root. Machine-local overrides live in
`$XDG_CONFIG_HOME/agx/repos/*.toml` (default `~/.config/agx/repos/*.toml`). Each file requires
`schema = 1` and `root = "<absolute main-checkout real path>"`. The one file claiming that root
overrides L1 per key and allows absolute ticket paths; duplicate claims fail with exit 2.
Repository working files do not supply L2 overrides. Absolute paths in `agx.toml` are refused
and must move to the XDG override. Revision and premise checks still use the dispatch workspace.
A declared home is honoured even under `/tmp`. Both `check`
and `run` refuse tickets outside the default and declared homes with exit 2 and a `WARN` naming
the declared home and `agx ticket new`. Symlinks cannot make an outside file appear to belong to a home.
Uncommitted changes to `agx.toml` do not change the accepted home. Both tools use the shared
configuration reader. Unknown keys and missing or unsupported schema values fail with exit 2;
a `[ws]` table is accepted for the workspace consumer. A leftover `.agx.toml` in the working
files or inspected revisions fails with exit 2 and a rename instruction.

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

`agx-worker` owns fold and selection for `agx worker ls [SELECTOR] [--json]`, which accepts a run id, a unique run-id prefix, or an exact ticket name. Ticket selection returns that ticket's runs oldest first, with the newest run last. `agx worker ls --ticket TICKET --latest [--json]` prints only the latest run's `id`, `state`, `outcome`, `verify_exits`, and `report_path`; a continuation run is the latest run for its ticket and supersedes its parent. Callers read the report through `report_path`. Ambiguous ID prefixes and unmatched selectors exit 2 with one line naming candidates. `agx worker ls --wait SELECTOR` is the one way to wait, and it is a read-only fold, not state: it takes an initial read, then re-reads the records file at a bounded poll interval (`AGX_WAIT_POLL_MS`, default 1000). A run-id selector preserves immediate lookup and returns at once if that run is already `ended`. An exact ticket selector ignores runs already terminal on the initial read; it waits until a run that was running on that read, or a run first recorded later, becomes `ended` (including derived `lost`, so a missing final report cannot hide a finished run), then prints that run's row in `ls` format (JSON with `--json`). It writes no file, not even the fold snapshot, and an empty, ambiguous, or unmatched selector exits 2 at once. The acceptance view is composed outside agx-worker by `scripts/agx-accept.ts`; agx-worker deliberately does not render reports or inspect workspace diffs.

## 2. agx-worker does not

| concern | owner | why |
| --- | --- | --- |
| Ticket storage, history, and amendments | Plain files plus jj | Tickets are inputs; `agx worker check` validates an input and does not own its history. |
| Write exclusion between workers | jj workspaces plus rebase at land | agx-worker only prints overlap `WARN` lines; it does not lock or block writes. |
| Workspace creation, readiness, collection and landing | `agx ws` (`tools/agx-ws`) / `mise run land` | agx-worker consumes a tree via `--cd`; creating, readying and collecting trees is `agx ws` (`tools/agx-ws`). Landing belongs to `mise run land`. |
| Durability or detach beyond the session | `systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agt_<slug> --collect -- agx worker run ...` | The caller chooses a service lifecycle; `-E NAME` carries the dispatcher's session into the unit. |
| CPU/GPU/RAM admission | `agent-resource-run` | Resource admission is outside agx-worker's routing and event-recording jobs. |
| Commits and pushes | `mise run commit` / `mise run land` | agx-worker records worker outcomes; repository publication belongs to the repository tasks. |
| Acceptance | A human or coordinator | Verify results are recorded facts; a human or coordinator reads them and decides acceptance. `agx worker judge` records the accept/reject decision and optional note; agx-worker does not decide acceptance. |
| Notifications and recap demands | Hooks consuming `agx worker ls --json` | Hooks can derive notifications from folded state; they must run the installed suite entry, not a checkout's working copy. |
| Waiting for a run | `agx worker ls --wait SELECTOR` (a read-only fold) | A stateful wait/detach command was removed on purpose; `ls --wait` only re-reads `records.jsonl` and writes nothing. |
| Searching code | `rr` | Code retrieval belongs to the repository search tool, not agx-worker. |
| Routing quality | Jev, corrected through the brief and roster `use_for` | Routing is Jev's choice among roster rows; agx-worker has no routing override. |
| Worker continuity records | The worker harness | A dispatched worker receives a bounded environment without coordinator slot or vendor session IDs. It owns its brief and workspace and does not bind a continuation record. |

## 3. Derived, not stored

Listed runs form the closed union `running{lease} | ended{outcome}`; `lost` is derived from owner lease evidence on every read without writing events or snapshots, while the `agx worker run` part traps SIGTERM/SIGINT/SIGHUP and records `ended{outcome: stopped, signal}`.

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
input stream. Their environment is rebuilt from the explicit allowlist in
[`src/workers/environment.ts`](../src/workers/environment.ts): `PATH`, `HOME`, `LANG`, `TZ`,
`USER`, `LOGNAME`, `SHELL`, `TERM`, `TMPDIR`, `TMP`, `TEMP`, `BUN_INSTALL_CACHE_DIR`,
`MISE_ACTIVATE_SHIMS`, `MISE_SHELL`, `MISE_CONFIG_DIR`, `MISE_DATA_DIR`, `MISE_CACHE_DIR`,
`MISE_INSTALLS_DIR`, `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`, `XDG_CONFIG_HOME`,
`XDG_STATE_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `GRAVEYARD`,
`RIP_GRAVEYARD`, `AGX_DISPATCHER_SESSION`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`,
`CLAUDE_CODE_OAUTH_TOKEN`, `OPENAI_API_KEY`, and `CODEX_API_KEY`, plus the `AGX_*` namespace,
with `AGX_WORKER=1`. Coordinator
continuation slots and vendor session IDs are omitted; each vendor creates its own session identity.
The same module's `workerSharedCaches` is the single shared-cache list: the Bun install cache
(`BUN_INSTALL_CACHE_DIR`, default `$HOME/.bun/install/cache`) and the code-search index cache
(`$XDG_CACHE_HOME/cocoindex-code`, default `$HOME/.cache/cocoindex-code`). Both paths resolve
to absolute paths. Codex receives the resolved Bun path in its environment; `XDG_CACHE_HOME`
keeps its original value. Only effective `workspace-write` receives these roots as
`sandbox_workspace_write.writable_roots` on both fresh and resumed runs; read-only receives
no shared writable roots. The daemon runtime directory (`$HOME/.cocoindex_code`) is not added:
the cocoindex client connects to the existing socket without creating files in its directory;
daemon startup owns runtime-file writes. No home-wide or temp-wide root is added. Workspace and existing
temporary-directory permissions remain Codex's responsibility. Claude isolation is unchanged.
When a worker hook has no
bound continuation record, the worker owns its brief and workspace and does not become read-only.
A Codex `Reading additional input from stdin...` stderr line with no subsequent stdout event for 30
seconds ends the worker with a `stdin-wait` receipt and the line as its cause. Five identical
consecutive tool errors end the worker with a `spin` receipt; a wall-clock bound remains `timeout`.

Cancellation sends the vendor SIGTERM and permits the existing 30-second cleanup window before
SIGKILL. External unit stops can still kill the whole cgroup. The harness VCS read boundary
protects the recovered read sites independently of this vendor cleanup grace.
