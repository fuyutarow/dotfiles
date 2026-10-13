# agx run lifecycle inventory

Inventory captured 2026-10-13 from the workspace source. “Reclaimer” means the code path that
retires or removes the state; `none` means the inspected implementation leaves it for manual or
external cleanup. This is a present-state map, not a claim that each item is sound.

## Current state stores

| Store / view | State represented and current derivation | Writer | Reclaimer / retention |
| --- | --- | --- | --- |
| `~/.local/state/agx/runs.jsonl` and `runs-YYYY-MM-DD.jsonl` | Run receipts plus `started`, `interim`, `verify`, `acceptance`, `abandoned`, `lease-released`, and other judgment/receipt rows. `ledgerLines` merges archives then live file; `ps`, `show`, `wait`, lease folding and hook facts read it. It is not one event stream: rows have several shapes, and `land` appends directly. | agx dispatch/worker completion and ledger commands via `appendLedgerLine`; `scripts/land.ts::recordWorkspaceAcceptance` appends directly without the ledger lock. | `rotateRunsLog` archives a prefix after 16 MiB and retains an 8 MiB live tail. Archives remain. No lifecycle horizon compaction. |
| `events/<run-id>.jsonl` | Per-run dispatch journal: admission/start context, interim/verification and related events used for recovery, follow/wait and migration. | agx dispatch and worker orchestration. | No routine per-run reclaimer found. Migration may remove the old source tree after checking live runs. |
| `admissions/<hash(run-id)>.json` | Durable lease admission metadata (run, repo, workspace, declared writes, session, predecessor, PID). Lease folding reads these alongside the ledger and journals. | `claimWriteLease` atomically writes/fsyncs/renames after admission checks. | No routine reclaimer found; records persist. Migration is the only inspected tree-level mover. |
| `write-leases/<repo-hash>/<hash(run-id)>.json` | Materialized repository write-lease projection. Current decisions fold admissions, ledger/journal evidence, liveness and a fresh jj/filesystem observation; lease files are not trusted as input. | `claimWriteLease` and `reconcileWriteLeases` rebuild the directory from held decisions. `releaseWriteLease` appends a ledger row and unlinks its file. | Every rebuild deletes existing JSON projections and writes current held leases. This is a cache, but a mutable directory still exists today. |
| `active/<run-id>.json` | Current worker marker: live PID/unit, ticket, workspace, session, resource and statusline metadata. `ps`, `show`, `wait`, statusline and agx-usehooks use it to identify live workers. | agx router writes at start and updates fields; worker orchestration updates through `writeActiveMarker`. | Normal completion/failure cleanup removes it; `collectDeadMarkers`/dispatch or `ledger gc` removes stale markers and records abandonment. A process stopped outside agx may leave it until that path runs. |
| `active/<run-id>.progress.json` | Latest progress/cost/activity record for a running worker; statusline Run rows read it beside the marker. | Codex/Claude worker adapters stream vendor output into the file. | agx removes it during terminal cleanup; a crash can leave it with the marker until GC. |
| `active/<run-id>.activity`, `worker-receipts/<run-id>.last.txt`, `worker-receipts/<run-id>.interim.jsonl` | Activity byte count, current vendor message, and interim RETURN evidence used for stall detection and continuation. | Worker adapters via environment paths; agx records interim details. | agx clears/replaces `last.txt` at continuation boundaries and removes run-local brief/marker/progress/activity at cleanup. No general receipt-directory horizon was found. |
| `worker-receipts/` and run receipt rows | Worker outcome/session/usage and dispatch receipt data used by `show`, resume and stats. | Worker wrapper and agx dispatch completion. | Run-local temporary material is selectively removed; durable run rows and receipts are retained. |
| `briefs/<sha256>.md`, `briefs/<run-id>.md`, ticket files | Immutable original brief by content hash; mutable ticket amendments and per-run worker prompt are instructions, not lifecycle state. | agx stores content-addressed briefs, dispatch writes worker copies, ticket commands append amendments. | Worker copies are removed at run cleanup; content-addressed briefs and tickets have no routine reclaimer. |
| systemd/launchd unit and jj workspace | Actual process liveness and workspace contents/changes, neither fully derivable from the log after the fact. | agx starts detached units and prepares workspaces; workers change workspace files. | Unit manager reaps exited processes. agx GC observes a missing unit/process and records abandonment. `mise run land` records acceptance, then forgets/removes the workspace unless `--keep-workspace`; failures and keep mode can leave it for a later operator. |
| coordinator continuation record / memory | Open work, ticket ownership and handoff instructions. The dispatcher names the continuation path in the promise; its contents are external to agx. | Coordinator/worker writes the record; succession is currently conveyed in the successor prompt and coordinator context. | No agx reclaimer. Human/coordinator closes or transfers it. This ownership handoff must become explicit event data, while the record body remains an external payload. |
| `scripts/land.ts` acceptance | Finds completed run rows whose `cwd` realpaths to the landed workspace, then appends `acceptance{accept:true}` for each run. | `recordWorkspaceAcceptance` in land after local deploy. | Acceptance is retained in `runs.jsonl`; no inverse/removal. Workspace deletion is a separate later effect. |
| `~/.local/state/agx/land/<root-hash>/queue.jsonl`, queue/runner/land locks | Separate land scheduling journal: `enqueue`, `start`, `result`; `queueStatus` folds it to pending/running/OK/FAIL. It is operational scheduling state, not agx worker lifecycle. | `scripts/land-queue.ts`: `enqueue`, `runQueue`, `journal`; append-only JSONL under `queue.lock`. | No queue-log compaction/removal found; completed rows persist. Scoped lock objects release queue/runner/land locks. Keep separate unless a land operation is admitted as an agx run. |

## Read-only consumers and derived views

| Consumer | Current inputs and derivation | Writes / cleanup |
| --- | --- | --- |
| `agx ps` / `show` | Ledger rows plus active markers; `ps --leases` recomputes leases from admissions, ledger/journals and external liveness/workspace observations. | Read path; lease listing does not reconcile or create cache state. |
| `agx wait` / `follow` | Replays ledger and per-run journals, watches state/events/active paths, and checks marker/PID when no terminal receipt appears. `wait` can report a synthesized failure to its caller when the router vanished. | Read/watch only; `follow` does not append the synthesized terminal. GC/admission is the persistent abandonment writer. |
| statusline `Job:` and Run rows | Reads shared active marker schemas and progress files; derives live runs and displayed activity. `dispatch-runs.ts` has no agx-specific persistent cache. | Read-only for this view; cache/state belongs to the generic statusline's other probes, not this Job source. |
| `agx-usehooks` project Stop/Prompt consumers (wired by `tools/agx-usehooks/consumers.toml`, currently firedancer) | Run/lane selectors read active markers and process/unit state; result-history facts read the tail of current and recent archived `runs.jsonl`. Stop may present a blocking reason from these facts; it does not own run lifecycle. | No agx run-state write or reclaimer. Hook runtime emits context/decision only. |
| `mise run land` | Reads jj workspace state; matches `runs.jsonl` rows to the workspace; appends acceptance then may forget and recursively remove the workspace. | Writes acceptance directly to the ledger and performs workspace reclamation. It does not currently append a first-class `disposed` lifecycle event. |

## Consequence for the proposed lifecycle

No inspected run state requires a second mutable *run-state* store: current markers, admissions,
lease projections, and per-run journals can be represented as events and rebuilt views. The log
cannot itself observe a process kill, a jj tree change, or a human decision. Those are inputs from
the unit manager, workspace observer, and coordinator; the executor must append the resulting
observation/decision before publishing it as run state. Continuation-record contents, briefs and
workspace bytes remain payloads/artifacts, while ownership, liveness, judgment, and disposition
belong in the log. This preserves the single-source claim without pretending a fold can sense the
outside world.

Current gaps to close in slices: `land` bypasses the ledger lock; admission records and run
journals are separate lifecycle authorities; ledger rotation only bounds the live file; `wait`
can synthesize a terminal only in output; and external stop/release/disposal require later GC or a
human land action. The contract in `../contract.md` defines their target event meanings and order.
