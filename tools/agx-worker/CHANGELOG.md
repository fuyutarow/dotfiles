# Changelog

## 10.0.1 — 2026-10-23

- Move roster consumers into the worker-owned roster module.

## 10.0.0 — 2026-10-23

- Unify worker state under AGX_STATE_DIR and agx with read-only legacy-v1 imports and explicit migration refusals

## 9.1.4 — 2026-10-23

- Record lost run endings under owner locks during publication and preserve live units.

## 9.1.3 — 2026-10-23

- Keep continuation dispatch in the recorded workspace and refuse missing or unregistered paths.

## 9.1.2 — 2026-10-23

- Report preflight tree revision and child failure while keeping check judgments independent of inspection delays
- Return temporary failure for bounded inspections without reporting a preflight verdict

## 9.1.1 — 2026-10-23

- Cover worker checks from old workspace bases without retired-file refusal

## 9.1.0 — 2026-10-23

- Run declared always verification before ticket checks and record its source

## 9.0.0 — 2026-10-23

- Read ticket homes through shared agx.toml policy and XDG root-selected overrides; reject retired .agx.toml.

## 8.8.1 — 2026-10-23

- Allow workspace-write workers to update the code-search index cache from the shared-cache list.

## 8.8.0 — 2026-10-23

- Add workspace-filtered worker listing backed by complete workspace publications

## 8.7.0 — 2026-10-23

- Add independent roster catalog and policy loader

## 8.6.0 — 2026-10-23

- Make the dispatch roster the codex worker model authority and remove hook floor reads

## 8.5.0 — 2026-10-23

- current-runs.json also publishes endedRuns (24 h) and acceptedRuns (existing workspace) so agx-status reads no records.jsonl

## 8.4.3 — 2026-10-23

- Keep codex dispatchable when its subscription window is exhausted; the roster declares per route whether an exhausted window stops it

## 8.4.2 — 2026-10-23

- Wait longer for dispatched run records and report the timeout bound

## 8.4.1 — 2026-10-23

- Allow workspace-write Codex workers to use the declared shared Bun package cache.

## 8.4.0 — 2026-10-23

- Use shared JEV_URL endpoint selection and reject retired overrides

## 8.3.0 — 2026-10-23

- Expose the routing objective in the full roster JSON view

## 8.2.0 — 2026-10-23

- Replace doctor quiet environment control with --quiet and reject the retired variable.

## 8.1.1 — 2026-10-23

- Import zod from shared module

## 8.1.0 — 2026-10-23

- Rename worker executable override to AGX_WORKER_BIN

## 8.0.5 — 2026-10-22

- Restore active Sol 6.1 choices while keeping history-free selection

## 8.0.4 — 2026-10-22

- Use sourced Sol6.0 rows, reject mixed model generations, and remove local judgment feedback from selection

## 8.0.3 — 2026-10-22

- Recognize native Claude HTTP 529 retry events as capacity before vendor retries.

## 8.0.2 — 2026-10-22

- Preserve explicit roster configuration across dispatch

## 8.0.1 — 2026-10-19

- Record one late event when a worker misses its interim-return deadline

## 8.0.0 — 2026-10-19

- Remove the agx-next bin and Jev subcommand; use agx worker and jex

## 7.1.4 — 2026-10-19

- Limit overlap warnings to the checked ticket repository

## 7.1.3 — 2026-10-19

- Use the last valid final report and warn on trailing text

## 7.1.2 — 2026-10-19

- Report all worker preflight failures with repairs in check, run and dispatch before launch.

## 7.1.1 — 2026-10-19

- Classify vendor capacity promptly, bound model startup waits to 120 seconds, cool unavailable models for 300 seconds, and reroute capacity continuations.

## 7.1.0 — 2026-10-19

- Add latest ticket run selection with verification exits and report path

## 7.0.0 — 2026-10-19

- Remove the deprecated agx-next bin and worker Jev transport command while preserving the record store path.

## 6.0.1 — 2026-10-19

- Keep the deprecated alias CLI surface conformant

## 6.0.0 — 2026-10-19

- Rename the run engine to agx-worker, move dispatch into it, and retain agx-next as a deprecated PATH shim

## 5.4.0 — 2026-10-17

- Attach opaque file content and SHA-256 with repeatable agx judge --evidence; deprecate agx jev in favour of jex.

## 5.3.4 — 2026-10-17

- Standardize -V/--version, plain deterministic help, and typed unknown-flag diagnostics.

## 5.3.3 — 2026-10-17

- Support repository tickets with a non-repository --cd, omit base_rev there, and run verification in the worker directory.

## 5.3.2 — 2026-10-17

- Block ls --wait on file notifications and replay only appended record bytes, with a five-second liveness fallback.

## 5.3.1 — 2026-10-17

- Report only actionable orphaned and unjudged runs in doctor; keep legacy, pre-contract and judged history silent.

## 5.3.0 — 2026-10-17

- Add optional machine summaries of running workers by dispatcher session.
- Publish bounded current run snapshots after record appends so ended workers leave statusline immediately

## 5.2.7 — 2026-10-17

- Resolve ticket repositories from ticket paths before worker directories and skip invalid repository markers with path-aware diagnostics.

## 5.2.6 — 2026-10-17

- Record dispatcher-provided unit bindings on runs

## 5.2.5 — 2026-10-17

- Reject nonconforming ticket names for fresh dispatches and preserve legacy continuations

## 5.2.4 — 2026-10-17

- Prefix human-facing ticket names with tkt_ while preserving bare slugs in JSON and records.

## 5.2.3 — 2026-10-17

- Expose doctor health classification in JSON listings and document durable units as agt_<slug>.

## 5.2.2 — 2026-10-17

- Resolve ticket homes from the default jj workspace while checking revisions in the dispatch workspace

## 5.2.1 — 2026-10-17

- Read ticket homes from trunk and refuse undeclared ticket paths

## 5.2.0 — 2026-10-16

- Refuse out-of-home tickets and record original bytes, SHA-256, base and premise revisions, replacement links, and typed dispatch declarations.

## 5.1.2 — 2026-10-16

- Recheck ended records after owner loss observation and distinguish legacy history and missing returns in doctor

## 5.1.1 — 2026-10-16

- Add run lifecycle findings to the fleet doctor

## 5.1.0 — 2026-10-16

- Add auto.routes allowlist for router eligibility and report the active filter in checks and capability errors.

## 5.0.2 — 2026-10-16

- Keep the run CLI available through the agx suite and agx-run bin

## 5.0.1 — 2026-10-16

- Protect bounded premise VCS reads with OS-enforced filesystem write denial.

## 5.0.0 — 2026-10-16

- Replace orphaned run state with ended lost lease evidence; trap stop signals and keep ls folds read-only

## 4.11.7 — 2026-10-16

- Record worker and workspace names on agx runs

## 4.11.6 — 2026-10-16

- Route from one four-branch objective with compact graded history and usage inputs; retain fresh Codex usage across consecutive picks.

## 4.11.5 — 2026-10-16

- Narrow the Claude sandbox settings argument in the runner test.

## 4.11.4 — 2026-10-16

- Prevent concurrent runs in the same workspace with a nonblocking kernel lock, including continuations; allow restart after completion or dispatcher death.

## 4.11.3 — 2026-10-16

- Wait for the next ticket run to end

## 4.11.2 — 2026-10-16

- Await acceptance report reads and subprocesses without blocking the event loop.

## 4.11.1 — 2026-10-16

- Run verification with the worker's assembled user-tool and mise environment, and distinguish unrunnable and killed checks from code failures.

## 4.11.0 — 2026-10-16

- ls --wait SELECTOR blocks until a selected run is ended or orphaned and prints its row; read-only fold, writes no file

## 4.10.2 — 2026-10-16

- Derive run outcomes from workspace changes, verification and validated reports; expose outcomes in run listings and router history.

## 4.10.1 — 2026-10-16

- Keep stale temp cleanup non-fatal and preserve run records before cleanup.

## 4.10.0 — 2026-10-15

- Each run owns a temp directory under ~/.cache/agx/tmp/<run-id>: the worker and verify commands get TMPDIR, TMP and TEMP pointing at it, agx removes it when the run ends (including SIGINT/SIGTERM), the next run sweeps directories whose recorded pid is dead, and agx refuses a temp root that is /tmp itself.

## 4.9.4 — 2026-10-15

- agx run --continue never routes: it reuses the prior run's row and resumes its recorded vendor session, refuses with exit 2 when there is none, and the claude route records vendor_session

## 4.9.3 — 2026-10-15

- Route using fresh subscription pace and record auditable picks

## 4.9.2 — 2026-10-15

- Run Claude workspace-write workers inside a strict auto-approved Bash sandbox.

## 4.9.1 — 2026-10-15

- Refuse dispatch on ownerless Git ref locks and allow Codex thirty seconds to finish after SIGTERM.

## 4.9.0 — 2026-10-15

- Persist an atomic run-fold snapshot and replay only appended record bytes; add agx ls --running with read-time process liveness.

## 4.8.0 — 2026-10-15

- Constrain routing by measured task capabilities and timeout, and mask rows after early no-work quits.

## 4.7.0 — 2026-10-14

- Add run-id/prefix and exact ticket selectors to `agx ls`; ticket selections are ordered oldest first so the newest run is last.
- Report selector candidates on refusal and render elapsed time in statusline format, including running rows.
- Add the read-only `scripts/agx-accept.ts` composer through `mise run accept -- SELECTOR` for verify, report, workspace diff, and next-command presentation.

## 4.6.1 — 2026-10-14

- Forward the user bus, XDG, mise, TLS, identity, terminal, and graveyard environment required by worker tools; retain the AGX namespace while excluding coordinator continuation and vendor session state.

## 4.6.0 — 2026-10-14

- Launch Claude and Codex workers with an explicit environment allow-list, excluding coordinator continuation slots and vendor session IDs.
- Treat an unbound SessionStart as a worker-owned brief and workspace; dispatched agx workers do not bind continuation records.

## 4.5.0 — 2026-10-14

- Validate bookmark, mise task, and jj revision premises in the selected tree before dispatch; refusals name each premise and include command output.

## 4.4.0 — 2026-10-14

- Close stdin for Codex and Claude worker processes; classify a stalled Codex stdin-wait diagnostic and repeated identical tool errors as distinct receipt outcomes.

## 4.3.0 — 2026-10-14

- Add each run's `started_at` and nullable `ended_at` event timestamps to `agx ls --json`.

## 4.2.0 — 2026-10-14

- Record dispatcher sessions from `--session`, `AGX_DISPATCHER_SESSION`, `CLAUDE_CODE_SESSION_ID`, or `CODEX_SESSION_ID`; warn when no session is available.
- Forward caller session variables in durable systemd runs with `-E NAME`.

## 4.1.0 — 2026-10-14

- Keep record readers forward-compatible with unknown fields, and document that required fields retain their types. Land the verify facts recorded in commit `19769560`.
- Add package-backed `agx --version`, newest-first bounded human `agx ls` with `--all`, and continuation amendment guidance in `agx run --help`.

## 4.0.0 — 2026-10-14

- Switch `agx` to the five-command CLI: `run`, `check`, `ls`, `judge`, and `stats`; retain `agx-next` as a one-release alias.
- Remove the legacy dispatch router, ticket store, lease/lifecycle implementation, grader, detach controls, and old command modules.
- Remove resource-declaration requirements from dispatch hooks and policy; use `systemd-run --user --unit=agt_<slug> --collect -- agx run …` for durable runs.

## 3.8.0 — 2026-10-14

- Add the parallel `agx-next` CLI with five commands and one append-only event log; preserve the existing `agx` entrypoint.
- Accept positional ticket paths, pass the selected sandbox to workers, and import legacy run, judgment, and interim rows idempotently from real `runs*.jsonl` logs.
- Add positional `judge RUN_ID accept|reject`, dispatcher-session fallback, and `run --continue RUN_ID` lineage with vendor-session resume.

## 3.7.0 — 2026-10-13

- Derive write leases from `lifecycle.jsonl` and serialize only the fold recheck plus `admitted` append on that log; remove admission/cache files and the 3.5.0 compatibility path.
- Hold ordinary leases only while runs are live; terminal events release them, while exclusive leases remain hard until disposal or reject judgment.
- Exclude paths covered by repository ignore rules while leasing untracked and not-yet-created paths; support workspace-root lease scope.
- Fold admissions from the latest in-log snapshot offset; keep judgment to one lifecycle append without lease folding, ledger scans or pruning.
- Terminalize an amend/restart predecessor before admitting its successor; remove soft holds and lineage lease transfers.

## 3.6.0 — 2026-10-13

- Add lifecycle migration slice 1: a schema-tagged, append-only `lifecycle.jsonl`, native flock serialization, sequence/event IDs, corrupt-tail refusal and read-only run/session/live folds.
- Mirror admissions, confirmed worker starts, all recorded terminal endings and ledger judgments while existing stores remain authoritative. Mirror failures are reported without changing dispatch outcomes.
- Add `agx events [--mine] [--follow] [--json]` as a read-only lifecycle filter.

## 3.5.4 — 2026-10-13

- Let ledger notes wait up to 60 seconds for a live attempt to finalize after RETURN, pinning the attempt even if its ticket resumes. Refusals include the observed state and an exact retry command.
- Require acceptance to name an existing independent review with `--review <run_id>` or explain its absence with `--no-review "<reason>"`. Persist `review` or `no_review` in the acceptance row and expose the latest judgment in human and JSON show output. Rejection needs neither flag.

## 3.5.3 — 2026-10-13

- Complete detached validation, routing, worker-slot and write-lease admission in the dispatcher before workspace creation or OS-manager handoff. Pass the admitted pick, launch data and roster snapshot to the unit; it never routes or reclaims the lease. Lease refusals, including lock timeouts, exit 2 in the dispatcher without printing a run handle.
- Show routed lease refusals as `refused` with their reason in `ps`. Read acceptance and landing records without requiring routing fields, across the live ledger, dated shards and run journals; `show` reports the latest judgment. Resolve the latest ticket run chronologically, including timestamps with different fractional precision.

## 3.5.2 — 2026-10-13

- Move workspace and process liveness observations out of the repository write-lease critical section; admission rechecks current evidence and overlapping write scopes while holding the lock, then records the admission only after a conflict-free decision.
- Bound repository write-lease lock waits to 30 seconds, reclaim locks with dead owners, include holder pid/run/ticket and held duration in timeout refusals, and use exit code 75 for lock timeouts.

## 3.5.1 — 2026-10-13

- Require a lease-aware admission; run history alone never creates holders. Recognize a 3.5.0 lease receipt only when its run ID, repository, workspace, ticket and writes match independent run metadata, and upgrade it to an explicit admission during GC or admission. Transfer ownership to an amend/resume/repick successor and propagate judgment through predecessor links.
- Intersect write globs segment by segment: `*` and `?` never cross `/`, `**` spans segments, and literal suffixes, character classes and brace alternatives distinguish disjoint paths. Fix frame_rev6/fo_rel2 false overlap.
- Ignore backfilled 3.5.0 receipts for terminal runs admitted before `2026-10-12T13:39:37Z` (alpha `54746865`). Live runs with declared writes hold in every era. `AGX_LIVE_RUN_IDS_FILE` accepts a complete JSON host-liveness snapshot for read-only sandboxed probes.

- Derive write leases from admission, run journals and full ledger history. Fold acceptance, rejection and landing over runs with the same ticket and workspace; live processes or units hold their writes in every dispatch mode, including foreground workspace dispatch.
- Make `ps --leases` read-only. Admission and GC rebuild the lease cache from the same computation and record unfinished externally stopped runs as abandoned. Current workspace checks use read-only jj and fail closed with a recovery command when unavailable.

## 3.5.0 — 2026-10-12

- Add repository-wide write leases at new-run admission. Release them after acceptance or rejection, landing, abandonment, a terminal run with no changed files, or workspace removal. `agx ps --leases` and `agx ledger gc` use the same pruning rules; historical runs never create lease files. Detached dispatch completes ticket, RESOURCE, premise and lease admission before starting its OS unit, so refusals exit 2 without printing a run_id.

## 3.4.2 — 2026-10-12

- Preserve Claude dispatcher attribution when the internal override is blank, and reject ticket workspace routing instead of silently using the prior cwd.

## 3.4.1 — 2026-10-12

- Add optional requires_gpu = true ticket metadata. Detached GPU work checks for visible GPU 0 with bounded retry/backoff, skips the probe for CPU-only tickets, and distinguishes a timed-out probe from an absent GPU or missing nvidia-smi binary.

## 3.4.0 — 2026-10-12

- Preserve the dispatch repository root across detached workspace launches and clean up a prepared workspace when the OS manager refuses to start it. Refuse workspace dispatch below measured backing-drive headroom: (live sparse workspaces + 1) × one measured sparse checkout.
- Deny raw jj workspace add in .agx.toml repositories through the shared storage-headroom predicate; direct workers to agx dispatch --workspace.
- Allow agx follow --all-live without a ticket, print compact ticket/state/summary/cost lines by default, and hide runs superseded by resume or amendment from agx ps unless --all is set. JSON output retains its existing shape and includes superseded rows only with --all.

## 3.3.1 — 2026-10-12

- Enforce the existing hard mask during stalled-worker escalation, preventing an unjustified xhigh/max choice from being downgraded back to the failed row.

## 3.3.0 — 2026-10-12

- Make agx follow wait for filesystem changes, with a 2-second fallback that reads only appended ledger and event bytes. Keep agx wait behavior unchanged.

## 3.2.0 — 2026-10-12

- Route tickets labeled `julia-compile` through the host-wide `agent-resource-run` compile slot,
  preserving the ticket's declared resource envelope.

## 3.1.0 — 2026-10-12

- Resolve default ticket projects from the backing jj repository so workspaces share ticket state; explicit `--project` still takes precedence.
- Make pre-worker refusals exit 2 with a first-line `agx: REFUSED:` receipt and reason count, including dispatch, detached dispatch and pick.
- Add `agx ps --mine` and show dispatcher session ids in table and JSON output.

## 3.0.1 — 2026-10-12

- Keep hard-masked xhigh/max rows out of stall escalation so launch cannot fall back to the row that stalled; preserve the AA floor and same-family price tie-break.

## 3.0.0 — 2026-10-11

- BREAKING: one ticket schema. Plain briefs, `schema = 1` and `--legacy-brief` are gone; a brief without `+++` front matter is refused with a pointer to `agx ticket new`. `--choice` (kept only to be refused) is removed; `--row` with `--approval` stays the one override.
- BREAKING: `outcome`, `consumer`, `first_return`, `writes` and `verify` (or `read_only_diagnostic = true`) are required by the zod schema instead of by a floor rule that dispatch filtered down to `verify` alone. The model-free floor now checks only xhigh/max justification.
- BREAKING: a strict `[proposition]` table is required: `id`, one-line `claim` and `refuted_by`, `decides` (decisive | mechanism | prerequisite | infrastructure), `graph_node` for decisive/mechanism, non-empty `serves` for prerequisite/infrastructure. The recap opens the worker's promise block, goes verbatim to Jev as `state.proposition`, is printed by `agx pick`, and its id is recorded on the marker and run and shown by `agx ps` and `agx show`. Split pieces inherit it.

## 2.10.1 — 2026-10-11

- Capture the caller's dispatcher session explicitly in detached unit environment and acknowledgement history. A fake OS manager regression verifies session-filtered `runningRuns` counts the detached run independently of the manager's session.

## 2.10.0 — 2026-10-11

- Record sandbox, ticket, row and directory before worker dispatch. Preserve the known vendor session and sandbox when a continuation exits without a receipt; resume, amendment and repick keep the same ticket. Historical failed continuations can recover sandbox from their recorded ancestor.
- Require structured `capabilities = [{ need, lower_effort_lacks }]` justification for xhigh/max. Plain tags still route; inadmissible picks fall back to the highest admissible lower effort of the same model family, with the mask and fallback recorded.
- Warn about potential new files under tools/ or scripts/ without `reuses = [...]`, directing authors to `rr exists '<capability>'` first. Validate tickets and sandbox write scopes before workspace creation; automatic workspace names include a UUID and creation takes an atomic claim.
- Add `agx wait <ticket|run> [--all-live]` and `agx follow <ticket|run> [--json]`. Keep foreground resume and amendment attached through completion. Detached acknowledgements print the wait command; detached continuations retain their assigned run ID and workspace.

## 2.9.1 — 2026-10-11

- Add ticket `return_policy` with a `hard-blockers-only` default and an `any-contradiction` option. The shared worker promise block now tells Codex and Claude how to handle routine discrepancies and when to RETURN.

## 2.9.0 — 2026-10-11

- Make the ticket the work handle across dispatch, resume, amendment, repick, show, ledger notes and ps. Prompt-file dispatches create a durable anonymous ticket in the per-project state home, named by `--name`, the brief's `name`, or a generated name. Keep the source brief untouched, ticket history append-only, and existing run/vendor identifiers readable and accepted.
- Allow `--repick` with `--file` and `--prompt-file` continuation instructions, retaining the ticket while selecting a fresh row and vendor session with a compact handoff.
- Show live row, picked probability, cumulative cost, phase, last activity and elapsed time by ticket; keep the ticket name visible in ps and resume hints. Resolve ledger acknowledgements to the actual run ID, including repeated runs in the same vendor session.
- Remove the repeated ungraded-run dispatch warning. Returned and stopped runs automatically receive a `grade-waived` record with `decision: "no-decision"`; this records an absence of grading without inventing a pass or acceptance.

## 2.8.3 — 2026-10-11

- Create empty sparse workspaces before selecting tracked top-level paths. Share `.agx.toml` `workspace_exclude` and the measured size fallback with the storage hook; print exclusions, measured bytes and checkout size. Name workspaces for their repository and run mise/Bun setup only when declared.

## 2.8.2 — 2026-10-11

- Amend live prompt-file runs through their recorded brief without resolving a ticket home, then resume the same vendor session. Validate the amendment before interrupting the worker.

## 2.8.1 — 2026-10-11

- Lower the default pick temperature to 0.5 and remove epsilon smoothing. Sample categorically from p_i^(1/T) / sum_j p_j^(1/T) over all eligible rows, with no probability floor or top-p cutoff; positive temperatures never trigger an argmax shortcut. Preserve reasoned eligibility masks, ticket/CLI overrides, and receipt temperature plus tempered picked probability. Legacy epsilon receipt fields remain readable.
- Computed effect for Jev probabilities 0.70/0.20/0.06/0.02/0.01/0.01:

| T   | Runner-up | Each 1% row |
| --- | --------- | ----------- |
| 1   | 20.00%    | 1.000%      |
| 0.7 | 13.83%    | 0.191%      |
| 0.5 | 7.49%     | 0.019%      |

## 2.8.0 — 2026-10-10

- Default tickets to per-project agx state when no repository ticket home exists; add `--home state`, `--project`, and selection-rule output in `ticket ls`.
- Copy existing tickets with `ticket import`, preserving all bytes and ids, normalizing undated filenames and counting imported files and skipped name collisions without overwriting. Record import lineage so removing the source home does not lose a resumable vendor session.
- Fall through from `dispatch --amend` on an exited worker to ticket amendment and redispatch, resuming the previous vendor session when possible.
- Record explicit `interim: true` RETURNs as progress and continue the same vendor session within the original hard timeout; retain interim reports in live state, `show`, and final receipts. Unmarked RETURNs still finish the run.

## 2.7.0 — 2026-10-10

- Keep one ticket id and file through append-only `ticket amend`; ticket homes may be declared by CLI, environment, or `.agx.toml`.
- Dispatch named tickets, gracefully interrupt and amend live workers before resuming their vendor session, and allow `resume --repick` to start a fresh selected row with a compact handoff.
- Tell workers that a tool-specific stop is not a task-wide stop.

## 2.6.0 — 2026-10-10

- Derive one run result from recorded worker, verification, change, and RETURN facts; keep scope violations as warnings and historical grades readable.
- Add agx show, live-first newest-first agx ps, ticket-name resume lookup, and a worker preamble that lets workers resolve routine housekeeping.
- Record Codex turn counts in progress so zero-turn runs cannot be delivered.

## 2.5.4 — 2026-10-10

- Pin Codex worker approval policy to never for fresh and resumed runs, preserving headless behavior when interactive sessions use automatic approval review.

## 2.5.3 — 2026-10-10

- Dispatch root `--version`, `--help` and bare invocations before loading the dispatcher; read recent run history from a bounded tail and stream full-history reports across dated archives.
- Rotate oversized `runs.jsonl` logs from GC into dated archives, preserving every JSONL record and keeping the live log bounded.

## 2.5.2 — 2026-10-10

- Persist the worker's final session, usage and cost in its active marker before verification; keep marker phase updated through verification and grading.

## 2.5.1 — 2026-10-10

- Validate active worker markers with the shared strict writer contract before publishing them.

## 2.5.0 — 2026-10-10

- Add `agx ps` for session-scoped run state and report summaries, plus `agx ledger gc` to record and remove dead markers; dispatch runs gc at startup.
- Add OS-managed detached dispatch (`systemd-run` on Linux, a logged launchd job on macOS), throttle wait messages to five minutes by default, and make recent throughput opt-in with `--verbose`.

## 2.4.0 — 2026-10-10

- Make first_return_s a soft checkpoint: request an interim RETURN for the existing Codex session and record RETURN/progress observations without stopping either worker route.
- Stop as stalled only after stall_s (default 600 seconds) with flat process-tree CPU, declared-file mtime/size, and vendor stream activity. Print and retain the predicate inputs; never escalate a progressing worker stopped at its hard bound.
- Snapshot declared files at run start, resolve writes against the workspace root, and exclude concurrent runs' declared files from attribution and scope violations. Report them as changed by others (not attributed).
- Keep observation off the exit path: use cancellable asynchronous CPU/filesystem sampling, unref timers, bound scans to declared write prefixes, and cancel pending soft requests when the worker exits.
- Keep the stop handler as the sole receipt writer after interruption, including SIGTERM during verification; prevent a competing completion or non-delivery record.

## 2.3.0 — 2026-10-10

- Prepend the worker promise block, derive token/compute kind from RESOURCE, and preserve opaque labels in active markers and ledger resource metadata.
- Add repository-local `.agents/tickets` skeletons and inventory with `agx ticket new/ls/lint`; lint reports all local admission violations before routing without Jev or network.
- Grader split and clarify verdicts now warn, record pieces/questions in receipts, and run instead of refusing. Hard local schema, resource, timeout, verification and premise failures still refuse.

## 2.2.0 — 2026-10-10

- Reconcile mutable state during migration: keep the newer route-capability cache, imported routing record, and other singleton JSON/cache files by mtime; skip old locks and unfinished temporary writes; merge numeric counters with maximum values. Preserve strict conflicts for per-run and content-addressed files.
- Document the state writer inventory and cover mutable merges, live-run preservation, and crash recovery.

## 2.1.0 — 2026-10-09

- Accept explicit `--sandbox none` for workers that need network or ssh: Codex runs with `danger-full-access`, Claude has no sandbox restriction, and stderr announces the unsandboxed run. Keep `--sandbox` required and preserve existing Codex fallbacks with requested and effective modes in receipts, including resumed runs.

## 2.0.1 — 2026-10-09

- Merge previous state into an existing agx directory with deduplicated, timestamp-ordered JSONL logs and byte-checked file conflicts. Commit through temporary files and rename for crash-safe, idempotent retries.
- Preserve live run markers and owned files while migrating unrelated state; report remaining files with exit 3. Add `--wait` with 30-second polling and `--wait-max` (default four hours), and remove the old directory only after a complete merge empties it.

## 2.0.0 — 2026-10-09

- Rename the suite to `agx` with exactly four nouns: `ticket`, `pick`, `dispatch`, and `ledger`. Resume with `agx dispatch --resume`; replay tickets with `agx ticket replay`; acknowledge artifacts with `agx ledger note`. Remove the former command aliases.
- Move runtime state to `~/.local/state/agx/` with an explicit, guarded `agx:migrate-state` task; runtime readers never use the previous directory.

## 1.19.0 — 2026-10-09

- Preserve `returned` for valid RETURN blocks even with no changed files or failing verification; record verification separately and identify the first coordinator question in receipts and stderr. RETURNs never auto-escalate.
- Resume owner-approved rows in the same session on escalation. Other escalations deterministically choose the cheapest available row at or above the failed row's AA index, preferring the same family's next effort on price ties, without Jev sampling or epsilon. Assert and record the capability rule; stop for the coordinator when no safe escalation exists.
- Cover RETURN precedence, override resumes, sol-high/luna-low escalation, and downgrade rejection; align the fake Jev roster with required pricing fields.

## 1.18.0 — 2026-10-09

- Include declared-write filesystem mtime scans in progress and write-scope checks, including files ignored by VCS; use the scan when the target is not a repository.

## 1.17.0 — 2026-10-09

- Share Codex token pricing with the statusline and keep streaming usage/cost in progress files when the worker stream reports it.

## 1.16.0 — 2026-10-09

- Require a four-word free-text justification for xhigh/max rows and make epsilon exploration cost-aware, recording the rows that receive smoothing mass.

## 1.15.0 — 2026-10-09

- Persist cumulative worker token usage and row-priced live cost in progress files; prefer Claude's reported billed cost.
- Write worker cost to receipts and run records so the statusline can show the live dispatch cost.

## 1.14.0 — 2026-10-09

- Record declared-write runs with an empty checked delta as `non_delivery`, record an incident, and reuse the one-time stall escalation path; exclude non-delivery from accepted throughput and count it as a lineage failure.

## 1.13.0 — 2026-10-09

- Hard-mask Claude rows for tickets whose capabilities, write scopes, or timeout exceed their $2 and 60-turn run bound; record the reason in the pick receipt and fall back when all rows are masked.
- Tell Jev that Claude rows are bounded at $2 and 60 turns per run and should not be preferred for long multi-file implementation.

## 1.12.0 — 2026-10-09

- Stop a run at first_return_s when it has neither a valid RETURN nor any changed file (commands alone are not progress), record it as `stalled` with a `stalled_at_first_return` incident, and re-dispatch it once on a pick that masks the stalled row and every lower-or-equal effort of its model family; the receipt carries `escalated_from`.
- A second stall is recorded and exits non-zero without another escalation; runs with a RETURN or changed files keep running to their hard bound, and `resume` is unchanged.

## 1.11.0 — 2026-10-09

- Add an owner-approved row override: `agent-dispatch run --row <id> --approval "<owner approval>"` runs the worker on that roster row without a Jev pick and records the pick as source `override` with the approval note.
- Refuse `--row` without `--approval`, or with an unknown row id, with exit 2 and a named reason; `--choice` stays refused and its message points at `--row/--approval`.

## 1.10.0 — 2026-10-09

- Give Jev per-kind records and label thin history as “record thin → weigh benchmarks.”
- Export/import records per capability tag with `record export` and `record import` subcommands.
- Preserve comparable-ticket throughput, route masking, softmax sampling, and stale-worker marker handling.

## 1.9.0 — 2026-10-09

- Smooth eligible Jev row probabilities with default epsilon 0.1 before temperature sampling, preserving hard masks and recording epsilon plus sampled probability.

## 1.8.0 — 2026-10-09

- Add portable per-row record export/import and merge imported records into pick requests when local evidence has fewer than three runs.

## 1.7.0 — 2026-10-09

- Sample a reproducible row from Jev probabilities after route, budget, and effort masking; record the sampling decision and preserve it on resume.

## 1.6.0 — 2026-10-09

- For resource-envelope briefs, probe once per worker process whether Codex's sandbox blocks the host user bus or an available GPU device; fall back to unsandboxed execution with a recorded reason when it does. Noncompute briefs do not probe.

## 1.5.7 — 2026-10-09

- Give Jev per-ticket throughput from comparable capability tags and ticket size classes, mark the best observed row, and state thin history per row without substituting overall averages.
- Treat active markers held by dead pids as released for worker-name uniqueness.

## 1.5.6 — 2026-10-09

- Include seven-day per-capability records beside each row's overall record in Jev's request, marking records below five runs as little; cache the latest bounded statistics snapshot.
- Mask rows with two lineage failures, partial grades, or returned runs without acknowledgement from Jev's candidates; record reasons and keep the overall-record argmax available when every row would be masked.

## 1.5.5 — 2026-10-09

- Make `first_return_s` observational: record whether a RETURN or progress appeared by its deadline without interrupting Codex or forcing a wrap-up turn; `timeout_s` remains the worker kill bound. Keep process-group reaping after worker exit; this release cannot safely distinguish every tool-call descendant from other group members, and records any survivors.
- Let ungraded runs without verify emit one warning instead of blocking the next dispatch, and resolve both normalized and legacy hyphenated worker display IDs.

## 1.5.4 — 2026-10-09

- Normalize hyphens in named worker display IDs to underscores, resolve either spelling, and refuse other characters.

## 1.5.3 — 2026-10-09

- Apply the requested stats window consistently, report grading overhead by component while excluding ticket verification from `--check`, and explain that returned runs count as accepted only after acknowledgement.

## 1.5.2 — 2026-10-09

- Add case-preserving `agt_<name>` worker display IDs from `run --name` or ticket `name`, with host-live uniqueness, generated IDs, ID lookup, and resume continuity; show them in statusline worker rows.

## 1.5.1 — 2026-10-09

- Route by expected useful throughput using recent per-row first-return, timeout, acceptance, and cost-per-accepted records, with benchmark scores used when the record is thin.
- Add optional positive ticket `budget_usd` for the cost exclusion decision; bound record loading to the recent log tail and record stats-read failures without stopping dispatch.

## 1.5.0 — 2026-10-08

- Add optional schema 1 and 2 ticket premises for file paths and exact-text symbols; check them before Jev with a five-second bound, refuse missing premises before spawning, and record timeout skips.
- Ask the grader to suggest premises for named dependencies and require an integration/acceptance piece when split pieces depend on one another.

## 1.4.3 — 2026-10-08

- Keep a change with its own acceptance check in one deliverable, including tests, seals, required params/config, and paired claim bounds; the example-learner field report said roughly 12 briefs were remanded as containers in an hour while the GPU idled, including an implementation split from its bit-identity test, an implementation split from its seal and params files (remanded twice), and a theorem split between lower and upper bounds.
- Keep dependent or mutually-referencing sections of read-only design/proof tickets together; allow read-only splits only for independent questions, while exact-input requests remain clarifications.

## 1.4.2 — 2026-10-08

- Preserve grader pass violations as printed warnings, drop unknown/self split dependencies with recorded warnings, and tolerate trailing commas in grader JSON.

## 1.4.1 — 2026-10-08

- Keep grader `clarify` verdicts as recorded warnings with their questions; only a valid `split` refuses a schema 2 ticket, with `urgent_reason` still downgrading that refusal. The 1.4.0 replay over 32 real legacy briefs falsely refused all 4 successful small single-deliverable briefs; among 11 indivisible sol-max briefs it returned clarify 8 and split 1; among 11 decomposable briefs it returned split 6, clarify 3, pass 1 and failed 1. Four of 32 graders also proposed overlapping writes without `depends_on`.
- Tell the grader to order overlapping writes with `depends_on` or merge those pieces, and to pass a single final deliverable while placing underspecification questions in `questions`.

## 1.4.0 — 2026-10-08

- Add `ack` records for consumed/rejected artifacts. Make `stats` default to per-row and per-dispatcher throughput, with the prior report available as the legacy view; report accepted returns per worker hour, first-return median, timeout/acceptance rates, cost per accepted artifact, wasted tokens, and grading overhead/saves. `stats --grading --check` fails when grading time and cost exceed estimated saves.
- Add offline `stats --replay <candidate.json>` comparisons for accepted returns per hour, with the row-task independence assumption printed. Derive first-return timing, accepted artifacts, tokens, cost, and wasted tokens from run, grade, refusal, and acknowledgement rows.
- Refuse plain briefs and schema 1 tickets with model-free floor violations; `--legacy-brief "<why>"` records the one-release escape. Schema 1 floor-pass tickets still run.
- Make `grade-replay` show floor violations, grader status/verdict, piece count and validity, and failure/skip reasons per brief; report agreement and false-refusal both for merged verdicts and grader verdicts alone. Valid actionable splits now win over floor `clarify` while retaining floor violations, and CRLF fenced grader replies parse correctly.
- Treat `first_return` as a checkpoint of the same final deliverable and a same-rule multi-file operation as one deliverable. Reject checkpoint-only, recursive (`split_from`), and file-list-only splits; record rejected grader splits and count matching `--no-grader` overrides as likely false splits.
- Allow schema 2 grader remands to proceed with a recorded `urgent_reason` while preserving floor refusals. Count urgent and `--no-grader` overrides separately, and charge refusal overhead through the same dispatcher's next dispatch.
- Record and warn on worker `claims_without_diff` when a ticket declares writes but the worker claims edits without a writes diff; grade fail unless a passing verify proves otherwise. Isolate checkpoint test process groups so signal-based cleanup cannot terminate the test runner.

## 1.3.2 — 2026-10-08

- Run a bounded, read-only grader worker selected by Jev from the roster; record its pick, row, status, elapsed time, usage and cost inside the parent receipt, and fall back to the floor on any grader failure without refusing the run.
- Validate each proposed piece as a schema 2 ticket against the model-free floor, and reject overlapping writes unless `depends_on` orders the pieces. Schema 2 split/clarify grades remand with actionable violations and ready-to-paste pieces or questions; schema 1/plain grades remain warnings.
- Add `grade-replay <dir> [--expect <file.tsv>]` to grade fixture briefs without starting their real workers and report agreement plus false-refusal rate; `--no-grader` skips grading and records that choice.
- Fix checkpoint receipts so `worker.elapsed_s` covers the whole run and the wrap-up turn is recorded separately as `checkpoint.wrap_up_s`.
- Align the checkpoint timer and `fired_at_s` to the worker-start origin; a new resume starts a fresh first-return window.

## 1.3.1 — 2026-10-08

- Set the default worker bound to 600 seconds, add a 360-second first-return window, and require a reason above 600 seconds.
- Add model-free pre-run ticket remands and schema 2 enforcement; schema 1 and plain briefs receive warnings until refusal moves to 1.4.0.
- Ask Jev to prefer the lowest family effort unless ticket capabilities explain what lower effort measurably lacks.
- At `first_return_s`, Codex stops and resumes the same session with a RETURN prompt; a RETURN at that checkpoint is success. Claude receipts record `checkpoint: { supported: false, reason: "claude worker takes its prompt at start; no live injection" }` and Claude remains bounded by the hard timeout.

## 1.3.0 — 2026-10-08

- Set the default worker time box to 900 seconds; require a recorded reason above 1800 seconds, up to the 14400-second hard maximum.
- Add worker RETURN triggers and a validated `agent-dispatch-return` record; returned work is a success and remains eligible for ticket verification.
- Preserve RETURN data or an explicit no-RETURN note in timeout partial reports.

## 1.2.1 — 2026-10-08

- Add Codex guidance for safe `apply_patch` calls and stop workers after five identical consecutive tool errors, preserving a resumable partial report.

## 1.2.0 — 2026-10-08

- Add ticket and CLI worker wall-clock bounds up to 14400 seconds, with effective bound and source recorded per run.
- Show every blocking ungraded run with its cwd, label, finish time, and individual grade or waive commands.
- Always retain a harness-written partial report when the worker time bound expires.
- Correct the grading test to cover automatic waiver behavior when Jev is unavailable.

## 1.1.3 — 2026-10-08

- Add Claude Haiku 5.5 rows (`haiku-low` through `haiku-max`) with official pricing and Artificial Analysis figures.
- When codex is unavailable, the Claude fallback is now the cheapest Claude row, `haiku-low`.

## 1.1.1 — 2026-10-08

- Route Jev auto-picks through the official TypeSafe API.

## 1.1.0 — 2026-10-08

- Folded the Codex worker into agent-dispatch: removed the `codex-run` bin and moved the host declaration to `~/.config/agent-dispatch/host.toml`.

## 1.0.0 — 2026-10-07

- Moved from `agents/routing-control/`; behavior unchanged.
