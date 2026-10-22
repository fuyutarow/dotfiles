# tools/ architecture

This is the single in-repo home of the architecture of the `tools/` programme: the dispatch
pipeline (v3), the capacity domain (measure, guard, admit, recover, report), and the oracle rule
for refactor programmes. It replaces three retrospectives as the thing to read; the retrospectives
stay the evidence, this file is the contract.

Measures: Unix philosophy (one job per part, one writer per state, parts compose through data and
names) and Tiger style (state the precondition at the door, stop when it breaks, tie every
invariant to a check). An invariant with no check is a wish, so every row below says which check
enforces it or which ticket will add one.

## 1. How to read the status column

| status | meaning |
| --- | --- |
| ENFORCED | a named test or doctor check exists at this revision and covers the whole invariant |
| PARTIAL | a named check covers part of the invariant; the rest names its ticket |
| UNCHECKED | no check exists at this revision; the named ticket will add it |
| RED | the named check exists but fails at this revision; the named ticket repairs it |

Checks are named by file and test title, never by line number, so they survive edits. Run them with
`mise run test` (everything), `mise run test:agx`, `mise run test:scripts`, `mise run test:hooks`,
`mise run test:resource-control`, or `mise run doctor`.

A ticket named below is one of: **queued** or **running** in the dispatch queue, **not started**
(a release in section 8 with no ticket yet), or **to file** (the coordinator must file it; the
section 11 index lists them). No invariant is marked enforced on the strength of a ticket.

Sources (evidence, kept outside this repository):

- `2026-10-15-dispatch-architecture.md` (v1, v2, v3): components, I1 to I17, negative space, R1 to R7
- `2026-10-15-self-recovery-contradiction-retro.md`: capacity domain, I-R1 to I-R9
- `2026-10-15-no-sync-oracle-retro.md`: the oracle rule, I-N1 to I-N5
- `2026-10-15-devx-progress-blockers-retro.md` section 5: the MECE table for the capacity domain

The source documents refer to a six-layer model (L1 to L6) and use only L2 (mechanisms), L3
(guards) and L5 (stateless systemd units that compose L2 mechanisms) by name. The full layer table is
not in them; this file does not invent it. Section 7 records the one layer rule they do state.

## Suite

The `agx` executable dispatches four tools on PATH: `agx worker`, `agx ws`, `agx ticket`, and `agx status`.
Accepted command forms are `agx <tool> ARGS` and `agx-<tool> ARGS`, where
`<tool>` is `worker`, `ticket`, `ws`, or `status`. Use `jex` for oracle classification.

| part | one job | single home | what it does not hold |
| --- | --- | --- | --- |
| `agx` | Route argv to a part CLI and relay its exit | `tools/agx/` | No run, workspace, or ticket state; no routing judgment or acceptance decision |
| `agx-worker` | Check tickets; dispatch, record, fold, and judge runs | `tools/agx-worker/`; run records remain under `~/.local/state/agx-next/` | No workspace lifecycle or ticket-file lifecycle |
| `agx-ws` | Create, ready, refresh, remove, and collect jj workspaces | `tools/agx-ws/`; jj owns workspace metadata | No run ledger or ticket state |
| `agx-ticket` | Issue tickets and derive their lifecycle from run/workspace facts | `tools/agx-ticket/`; ticket files stay in the repository's declared directory | No run ledger, workspace lifecycle, or acceptance judgment |
| `agx-status` | Fold run, workspace, ticket and doctor state into one JSON view | `tools/agx-status/` | No state |

Parts import only their own directory and `tools/shared/`; a part never imports another part.
The `agx` entry imports no part code and calls each part's CLI in a child process.

## 2. Components: one job, one state owner

| component | one job | state it writes (only it writes it) | input to output |
| --- | --- | --- | --- |
| ticket (a file) | the spec of one issue | the ticket file, written by the coordinator | intent to outcome, writes, verify, premises |
| `agx worker check` | validate a ticket | none | ticket and tree to OK, or a refusal with reasons |
| `agx worker run` | choose a row, confine a worker, run it, record the result | `records.jsonl` (append only) | ticket and tree to a run record |
| router (inside `agx-worker`) | choose the row | none (reads roster, usage, records) | needs, route capability, usage, judged history to a row, or stop |
| `agx worker ls` | fold, select | none (reads records) | selector to rows or JSON |
| `agx worker judge` | record a judgment | append to `records.jsonl` | run and verdict to a judgment row |
| `agx worker stats` | fold statistics | none | records to numbers |
| `agx ws` (`tools/agx-ws`, queued as workspace-tool) | the life of a run's working tree | none (reads jj, per-repo config, agx-worker records) | slug, rev to `<repo>.ws/ws_<slug>`; reclaim |
| systemd | process lifetime, durability | unit state | command to unit, exit |
| integrator (not started; today `mise run land`) | the only writer of trunk | trunk, an integrator-only tree, a lock | accepted diffs to trunk (pushed) |
| guard (hook, jj wrapper) | enforce the worker boundary | none | worker command to allow or deny |
| `agent-resource-run` | admit compute | the reservation | resource envelope to a reservation or a wait |
| deploy | reflect trunk on the machine | files written under `$HOME` | trunk to `$HOME` |
| statusline | show | a display cache only | records, usage to a display |

The capacity components are in section 6. The state of "accepted but not yet integrated" is not
stored anywhere; it is derived from records and the jj ancestry (invariant I2).

## 3. Data flow, by names

```text
intent -> ticket -- agx worker check
            \-> agx ws add ws_<slug> -> systemd: agx worker run
                                      (router -> sandboxed worker -> snapshot at run end -> record)
                                      \-> coordinator wakes (R1: agx worker ls --wait)
                                          \-> agx worker judge (verify against the trunk baseline)
                                              \-> integrator (rebase or merge -> gate -> commit -> push;
                                                  a conflict goes back to a worker as an issue)
                                                  \-> trunk -> deploy -> machine
                                                  \-> agx ws gc (finished lineage, nothing unlanded)
```

Parts are joined by **names**, not by a ledger:

- session: `<project-slug>-<role>_<id>`
- worker and unit: `agt_<slug>`
- working tree: `ws_<slug>`

One slug lets a name find its unit, tree and run, so an entry point holds no state of its own.

## 4. Policy and mechanism

The mechanism (`agx-worker`, `agx-ws`, the integrator slot, guards, `agent-resource-run`) is common and knows no
repository. The policy of each repository has one home: `.agx.toml` at the repository root (read
today by `tools/shared/src/workspace-policy.ts` for `workspace_exclude`). Five sites run five different policies
(trunk, integration shape, gate, after-integrate steps, worker commits), so none of them may be
compiled into the mechanism. Acceptance of the design is that the same mechanism runs two real,
different `.agx.toml` files (dotfiles and coralbase) with no change to its computation. Status: not
started (release R5).

Keys the declaration is to carry: `trunk`, `integrate` (`rebase`, `jj-merge`, `command`),
`integrate_command`, `gate`, `gate_skip_if_tested_diff_zero`, `after_integrate`, `push`,
`worker_bookmarks`, `readiness`, `readiness_at`, `union_merge`, `workspace_exclude`, `resources`.

## 5. Dispatch invariants I1 to I17

| id | invariant | enforced by | status |
| --- | --- | --- | --- |
| I1 | One writer per state. Trunk is written only by the integrator the repository declares; a rescue fast-forward is a recorded integrator step. Tools never write a linked file. | `scripts/tests/one-writer-check.test.ts` (`lint:one-writer`: a deployed path that is still a symlink fails); `scripts/tests/lint-ignore.test.ts` (`lint:ignore`); `scripts/tests/land.test.ts` ("LAND-OWN-TREE refuses its dirty tree with exact paths before rebase") | PARTIAL; a declared integrator that is the only trunk writer: R6 (integrator, not started) |
| I2 | No component holds a copy of another's state. "Unintegrated" derives from records, ancestry and `integrated_query`. | `tools/agx-worker/tests/startup.test.ts` ("help and bare invocation do not touch run state") | PARTIAL for agx; `agx ws` and the integrator: workspace-tool (queued), R6 |
| I3 | Fail first. Check at the door: `agx worker check` passes, colocated jj, session id, the Claude sandbox settings, the integrator's declared scope is clean. | `tools/agx-worker/tests/next/run.test.ts` ("refuses dispatch when the target has an ownerless ref lock"); `tools/agx-worker/tests/premises.test.ts`; `tools/agx-worker/tests/run-claude.test.ts` ("passes sandbox settings to Claude for scoped shell execution"); `tools/agx-worker/tests/codex.test.ts` ("omitting sandbox remains refused before Codex starts") | PARTIAL; gaps: colocated-jj precondition (R3), a missing session id only warns (`run.test.ts` asserts the `WARN dispatcher session is unavailable` line), the router falls back instead of stopping (`tools/agx-worker/tests/next/route.test.ts` "an invalid Jev choice records the fallback reason and probabilities" documents the fallback; ticket: router-fail-first, queued) |
| I4 | A worker never rewrites shared state: op restore, revert, undo; another's commits; trunk; bookmarks and pushes outside its declared namespace. `refs/jj/keep` is not shared state (read-only jj writes it). | none. `tools/disk-reclaim/tests/worker-guard.test.ts` guards disk-reclaim only, not jj. | UNCHECKED: worker-jj-guard (queued) |
| I5 | A worker writes only its working tree, its declared namespace, and the declared `external_writers` via. How far this holds is stated per route: codex workspace-write is OS-enforced; Claude's Bash and its children are OS-enforced and its tools are bounded by permission rules; `--sandbox none` guarantees nothing. Declared external data and excluded paths are readable, read-only. | `tools/agx-worker/tests/codex.test.ts` ("omitting sandbox remains refused before Codex starts"); `tools/agx-worker/tests/run-claude.test.ts` ("passes sandbox settings to Claude for scoped shell execution", `failIfUnavailable`) | PARTIAL; `external_writers` and declared read-only data: R5 (not started) |
| I6 | A result derives from facts: the diff after the snapshot, declared byproducts excluded, declared verification targets, one report shape. Abnormal exit and timeout still recover the artifacts and the report. Load (loadavg, reservation wait) is recorded. | `tools/shared/tests/run-result.test.ts` ("zero turns or no output can never be delivered", "a missing required verification result cannot be delivered"); `tools/agx-worker/tests/next/run.test.ts` ("a sub-two-minute zero-change exit without RETURN fails its lineage"); `tools/agx-worker/tests/report.test.ts` ("empty, non-JSON and wrong-shape messages are errors that say which") | PARTIAL; timeout facts, declared byproducts, load record: run-outcome2 (queued) |
| I7 | Accepted work is not lost. Accepted means the declared push succeeded. | `scripts/tests/land.test.ts` ("a failed push retains the successful commit verdict and does not deploy"); `scripts/tests/land-verdict.test.ts` ("land verdict covers only its commit and push") | PARTIAL (dotfiles landing only); `after_integrate` and a declared push means: R6 (not started) |
| I8 | No jj or git process is ever killed. The integrator resumes idempotently (a `command` integrator brings its own fixture). | `tools/shared/tests/ref-locks.test.ts` and `run.test.ts` (ownerless ref lock blocks dispatch) detect the damage; nothing proves that no harness kills a writer | UNCHECKED for the kill rule: jjsafe4 (queued) |
| I9 | The gate depends on the tree being integrated only. Consumers own and commit copies of configuration dotfiles distributes. | `scripts/tests/gate-land.test.ts` ("pre-commit runs exactly the gate:land checks plus staged formatting"); `scripts/tests/land.test.ts` ("LAND-OWN-TREE ignores main lint failures, commits only the worker and pushes alpha"); `presets/tests/oxlint-custom.test.ts`; `mise run test:presets` | ENFORCED |
| I10 | Overlap of write sets is information, within one repository, never a refusal. `union_merge` lists only truly append-only files. | none. `overlapWarnings` in `tools/agx-worker/src/next/store.ts` is called by `check` and `run`, but no test asserts the `WARN overlap` line | UNCHECKED: spec-check-i10 (to file) |
| I11 | A removed feature has a concrete replacement that is actually used. | none; the control is a review step on any change that removes a feature | UNCHECKED: spec-check-i11 (to file; G9) |
| I12 | A component knows no repository; the repository declares its differences in configuration. A tool brings its own runtime. A tool imports only its own directory and `tools/shared/`. | none found: no test or lint enforces the import boundary (searched `scripts/lint-bun.ts`, `scripts/doctor.ts`, `scripts/tests`) | UNCHECKED: R5 (`.agx.toml`, not started); spec-check-i12 (to file) for the import boundary |
| I13 | Continuation keeps the original row and vendor session and re-reads the ticket; if it cannot, it stops before launch. | `tools/agx-worker/tests/next/continue.test.ts` ("a codex run resumes on its codex row even when the router would prefer claude", "a run without a vendor session exits 2 before any worker starts", "a run whose row left the roster exits 2 before any worker starts", "the ticket file is re-read on continue") | ENFORCED (continue-pin, landed 367abb54) |
| I14 | A unit's environment is assembled explicitly by the entry point, never inherited from the systemd manager. | `tools/agx-worker/tests/environment.test.ts` ("forwards the complete declared allow-list and AGX namespace", "excludes coordinator continuation and vendor session state"); `tools/agx-worker/tests/codex.test.ts` ("Codex receives the declared worker environment without coordinator state") | PARTIAL (the worker's environment); the unit's environment: R3 (not started) |
| I15 | Resources pass admission: tokens, GPU, localnet, gas, network permission. The coordinator's dispatch also respects machine capacity. | `tools/agent-resource-run/tests/agent-resource-run.test.ts`, `cgroup-memory.test.ts`, `compile-slot.test.ts` (`mise run test:resource-control`) | PARTIAL (compute only); declared footprint, tokens, localnet, gas, network, dispatch cap: R7 (admission, not started) and footprint-admission |
| I16 | An interim return is progress and does not end the unit; records tell `returned` from `interim`. | `tools/agx-worker/tests/report.test.ts` ("RETURN accepts an optional boolean interim marker and rejects other values", "stream interim journal retains checkpoints once and parsing chooses the last RETURN") | PARTIAL; the record distinction: run-outcome2 (queued) |
| I17 | An operation refused by permissions is never executed through another session or worker; it goes back to the owner. | none; the rule is prose in the coordinator's instructions | UNCHECKED: spec-check-i17 (to file) |

## 6. Capacity domain: measure, guard, admit, recover, report

The pipeline above never said who keeps the machine alive. The incident of 2026-10-15 (five storage
incidents in one day, none closed by a recovery with no human or agent step) was one design defect:
detection was built as a gate on the agent, and recovery was handed to the same agent that the gate
exists to distrust. The domain is five parts with one owner each. Failure of any part is loud to its
caller.

| part | one job | owner today | owner target | state it writes |
| --- | --- | --- | --- | --- |
| measure | read free bytes, inodes and capacity of a drive | five places: the storage-headroom hook, `tools/shared/src/storage-headroom.ts`, `tools/disk-reclaim`, `scripts/wsl-capacity-recover.ts`, a second guest controller | one library, `tools/shared/src/storage-headroom.ts`, one drive table, `agents/hooks/storage-headroom.toml` | none |
| guard | deny writes below the deny line | `agents/hooks/enforce-storage-headroom.ts` (denies reads too) | the same hook, denying writes only, naming declared tasks or "recovery running, wait" | none |
| admit | refuse a run that cannot fit before it starts | none for disk; `agent-resource-run` for compute | `agent-resource-run` and the ticket's declared `[resources]` footprint | the reservation |
| recover | bring a drive above warn with no human or agent step | `wsl-capacity-recover` (systemd) for host C: and tmpfs only; `tools/disk-reclaim` as its mechanism | ONE controller unit with one stage per guarded drive (L5), composing disk-reclaim filters (L2) | `$XDG_STATE` receipts only |
| report | tell the owner the recoverer works or does not | none | statusline and doctor read the recover unit's result | display cache only |

Neighbouring parts, not part of the domain: `rip` (graveyard, owned by shell config), `mise run
reclaim` (the declared task a deny may name), `disk-reclaim` (the mechanism recover composes; it
is to become filters: find, then check against policy, then remove, each its own CLI).

### 6.1 Root causes the invariants answer

- RC1: recovery had no owner; the gate's only exit was the party it distrusts.
- RC2: the deny line and the recover stage do not match drive for drive.
- RC3: the reclaim criterion ("older than 60 minutes", "fully pushed") cannot see the actual
  producers: live fixtures, integrated but unpushed workspaces, per-unit repo copies, scratch dumps.
- RC4: failure of the recoverer is silent.
- RC5: the gate is too wide (it denies reads) and too high (it denied work that fit).
- RC6: the deny path depends on a non-deterministic classifier verdict.
- RC7: root causes did not become acceptance criteria of a running ticket.
- RC8: the architecture lived only in a retrospective with no check per layer; the L3 guard shipped
  without its L5 counterpart.

### 6.2 Negative space

What must exist and does not (each is a gap a ticket closes):

- N1: no component whose job is "end above warn with no human or agent step" (I-R1)
- N2: no guest-drive recovery stage (I-R2, I-R8)
- N3: no way to stop a live producer; reclaim touches only the dead (I-R4)
- N4: no signal when the recoverer is broken (I-R3)
- N5: no "integrated" criterion for repositories that never push (I-R5)
- N6: no declared write budget per run, so no admission before filling (I15, footprint-admission)
- N7: no deny-path step guaranteed to pass the classifier (I-R6)
- N8: the incident blocks its own record and the owner's own fix (I-R7)
- N9: no durable home for live coordinator state outside tmpfs (I-R9)
- N10: no check that each L3 guard has its L5 recoverer (I-R2)

What must never exist (the negative space of recovery):

- never delete a workspace or change that is not an ancestor of trunk, or has uncommitted changes
- never delete a live session's scratch or tmpfs state, or a declared store
- never reclaim by moving data into a graveyard on the same pressured drive
- never ask an agent to bypass the classifier; never run `--tier blind` without a reviewed plan
- never block reads; never raise a deny line without a matching recover stage
- never rely on a restart or a human resizing the disk as recovery

### 6.3 Capacity invariants I-R1 to I-R9

| id | invariant | enforced by | status |
| --- | --- | --- | --- |
| I-R1 | Recovery completes with no human and no agent step; the recoverer is a systemd unit (L5). | none; the acceptance test replays the 20:30 incident (a full tmpfs with a live writer falls below 80% within N minutes, the journal shows the unit acted, no agent tool call) | UNCHECKED: self-heal (running) |
| I-R2 | Every drive with a deny line has a recover stage, one to one (L3 guard to L5 recoverer). | none; a test must enumerate the hook's drives and the unit's stages and fail `mise run doctor` on a mismatch | UNCHECKED: recover-guest, arch-layer-pair-check (to file) |
| I-R3 | A failed recoverer (FATAL, timeout, reclaimed zero while above warn) shows red in the statusline within one minute and fails doctor. | none. `scripts/tests/doctor.test.ts` ("tmpfs capacity FAILs for byte or inode pressure at the threshold") measures pressure, not recoverer failure | UNCHECKED: recover-health (running) |
| I-R4 | A live producer above its declared budget is stopped (declared agx units only), then reclaimed; nothing else is killed. | none; the acceptance fixtures are a unit writing past budget (stopped) and an undeclared process (untouched). Related, narrower: `scripts/tests/wsl-capacity-recover.test.ts` ("only this user's compute work is selected; dedicated units are stopped whole") | UNCHECKED: self-heal (running) |
| I-R5 | Reclaim deletes only regenerable or integrated items (ancestor of local trunk, no uncommitted changes), a receipt per item; never into a graveyard on the same drive; never live scratch or declared stores. | `tools/disk-reclaim/tests/jj/safety.test.ts` ("an unknown check is ASK, never RECLAIM", "conflicts are KEEP; other failures are ASK", "untracked entries must be regenerable, including nested ones; empty dirs are fine"); `tools/disk-reclaim/tests/liveness/predicate.test.ts` ("an open fd under scratch is live") | PARTIAL; the ancestor-of-local-trunk criterion for a repository that never pushes (today the jj remote set is `remote_bookmarks` plus `trunk()`): integrated-ws (after reclaim-fix) |
| I-R6 | Reads are never denied. The deny text names only declared tasks or "recovery running, wait". | none; `tools/storage-headroom/tests/decision.test.ts` ("denies every non-allowlisted tool call under the deny line") asserts the opposite for reads, and `[deny].advice` in `agents/hooks/storage-headroom.toml` still names `disk-reclaim run --tier blind --yes` | UNCHECKED: deny-text (that test is inverted by this ticket) |
| I-R7 | Threshold configuration is editable under the deny line. | none | UNCHECKED: deny-text |
| I-R8 | The guest deny line is 6 GiB (owner ruling 2026-10-15, applied in `agents/hooks/storage-headroom.toml`). A warn line (15 to 40 GiB, to decide) triggers automatic reclaim of regenerable builds in idle, integrated workspaces. | `tools/shared/tests/storage-headroom.test.ts` ("loads guest / and host C: thresholds from the authoritative TOML"); deny-line arithmetic in `tools/storage-headroom/tests/decision.test.ts` | RED: the named test still asserts `deny_gib: 40` for the guest and fails at this revision; the warn-line half is UNCHECKED. Tickets: recover-guest (warn line); the stale assertion belongs to whoever owns `tools/shared/tests` (to file: spec-check-ir8) |
| I-R9 | Coordinator state never lives on tmpfs. | none. The doctor graveyard check (`scripts/doctor.ts`, "is on tmpfs/ramfs") covers only the rip graveyard | UNCHECKED: state-off-tmpfs |

Known defect at this revision, in the recover part: `scripts/wsl-capacity-recover.ts` runs the mise
tasks `reclaim:host`, `reclaim:builds` and `reclaim:clean`, while `mise.toml` declares only
`reclaim` and `reclaim:yes`. Until recover-tasks (running) lands, the recoverer calls tasks that do
not exist. This is the evidence for the layer rule in section 7.

## 7. The layer rule

A guard and its recoverer ship together. Every L3 guard names its L5 recoverer, and a check fails
when either side is missing (I-R2, N10). The architecture is real only when each such rule has a
check; this section's check is UNCHECKED until arch-layer-pair-check exists. A controller's named
commands must also exist (wiring check; today UNCHECKED, covered by recover-tasks for the one known
case).

## 8. Releases R1 to R7

Order is by demonstrated harm (a run id exists), not by request. Status is as of this revision.

| release | content | harm that justified it | status |
| --- | --- | --- | --- |
| R1 | `agx worker ls --wait`: block until one selected run ends, return its row | missed completions (perf_gf2, mod_merge_r); watch loops were refused | not landed: `--wait` exists only in a historical entry of `tools/agx-worker/CHANGELOG.md`, not in `agx worker ls`; the 2026-10-14 switch removed waiting from agx on purpose (`tools/agx-worker/docs/scope.md`), so the replacement must be a fold over records, not state (I11) |
| R2 | Continuation (I13) and interim return (I16); session recorded for every route | 3e66a238, 01654343, sdk-layer, walrus 21eb1a84, mod_merge_v2, readlock | continue-pin landed (367abb54); the interim record distinction waits for run-outcome2 |
| R3 | Explicit environment (I14) and check before launch (I3) | hotfix leak, exit 127, statusline, a broken TOML launch | partly landed (worker environment); unit environment and colocated-jj check not started |
| R4 | Result and report shape from facts (I6) | a2319ea5, four stringified reports | run-outcome2 queued |
| R5 | `.agx.toml` as the one home of repository policy (first: trunk, worker_bookmarks, union_merge, readiness) | firedancer's commits; coralbase and polysearch collisions | not started |
| R6 | Integrator slot; dotfiles `land` becomes one implementation; coralbase `jj-merge`; soks `command` | coralbase MERGE18 to 22; hand-run `jj new` incidents | not started |
| R7 | Resource admission (I15) | integ5 out of budget, eleven localnets, GPU exit 69 | not started |

Queued with no release number: workspace-tool (`agx ws`, G1; carries the tree-lifecycle part of jjsafe4),
worker-jj-guard (I4, G7), jjsafe4 (I8), router-fail-first (I3, G3).

Deferred on purpose (one or fewer incidents; a manual workaround is cheap): swapping the brief of
a running run (stop and continue suffices), automatic drafts of conflict-resolution issues, a
multi-host completion test, a typed verifier run, a review-line floor.

## 9. Negative space of the dispatch pipeline

What each component intentionally does not do:

| component | does not |
| --- | --- |
| agx | create working trees, integrate, detach, keep a ledger or a lease, render acceptance views, re-pick a row on continue |
| `agx worker ls` | keep its own state or store polling results |
| ws | run workers, decide acceptance, keep state files |
| integrator | judge dirt outside its declared scope, permit a direct push |
| router | substitute a row silently, bias a route through roster wording, guess a route's capability |
| worker | commit, push, rewrite shared state, write outside its declaration, write to `/tmp` |
| boundary judgment | turn I10 into a refusal, judge overlap across repositories |
| unit | inherit an environment from the manager |
| coordinator | do issue-specific work, create working trees by hand once `agx ws` exists |
| mise | host a component that has a contract |

Still missing, with the thing that fills each: waiting (R1), environment (R3), results (R4), policy
file (R5), integrator (R6), resources and network (R7), report recovery before a timeout,
regenerated files, `external_writers`, `integrated_query`, a verify baseline with load record.
`tools/agx-worker/docs/scope.md` is the per-tool form of this table for agx-worker and is the first thing to
read before proposing an agx feature.

## 10. The oracle rule for refactor programmes

A programme with many tickets names its oracle (a lint rule or a test) and a ticket cannot dispatch
while the oracle is absent. The no-sync programme ran 39 landed units without it, because the
rule's removal (f1f0a2c4) did not fail any ticket and a rule enforced only by prose cannot hold across
70 workers. At this revision `node/no-sync` is absent from `.oxlintrc.json` and
`presets/oxlint/policy.toml`, so every row below is UNCHECKED; the ticket is nosync-rule.

Design: key exemptions by meaning at the call site, never by file path, so a code move is neither
a new exemption nor a removal round trip. Keep what the 2026-10-12 decision wanted (refactors and
durable fsync writes are never punished, no path-keyed ratchet) and restore what it lost (the rule).

| id | invariant | check it needs | status |
| --- | --- | --- | --- |
| I-N1 | `node/no-sync` is an error in non-test TypeScript. | `mise run lint:ts` fails on a fixture sync call | UNCHECKED: nosync-rule |
| I-N2 | An exemption lives at the call site (one comment with a reason, recognised by the rule config, or a small wrapper such as `syncRequired(reason, () => fs.fsyncSync(fd))`), never in a path list. | moving an exempted function to another file keeps lint green | UNCHECKED: nosync-rule |
| I-N3 | The no-disable check still forbids blanket disables; only the declared exemption form passes. | a fixture with a bare `oxlint-disable` fails. Today `scripts/tests/lint-ts-no-disable.test.ts` ("clean and planted files are checked in Git and a jj secondary workspace") forbids every disable, which is stricter and will have to admit the declared form | UNCHECKED: nosync-rule |
| I-N4 | Remaining sites are a lint-generated baseline (count per file) that only shrinks; a new site fails. | adding a sync call to a clean file fails; converting one lowers the baseline | UNCHECKED: nosync-rule |
| I-N5 | A programme ticket names its oracle in its verify. | every nosync ticket's verify runs the rule on its files; generally, dispatch refuses a programme ticket whose oracle is absent | UNCHECKED: nosync U45 to U82 (their verify); spec-check-oracle (to file) for the general dispatch check |

## 11. UNCHECKED index: tickets and what they add

A ticket here is the owner of the check, and the invariant is not enforced until the ticket
lands. "To file" means the coordinator must file it; no such ticket exists yet.

| ticket | status | invariants it adds a check for |
| --- | --- | --- |
| run-outcome2 | queued | I6, I16 (and R4) |
| workspace-tool | queued | I2 (ws part), I8 (tree lifecycle), G1 |
| worker-jj-guard | queued | I4 |
| jjsafe4 | queued | I8 |
| router-fail-first | queued | I3 (router part) |
| R3 (environment, check before launch) | not started | I3 (colocated jj), I14 (unit environment) |
| R5 (`.agx.toml`) | not started | I5 (`external_writers`), I12 |
| R6 (integrator) | not started | I1, I2, I7, I8 |
| R7 and footprint-admission (admission) | not started | I15, N6 |
| self-heal | running | I-R1, I-R4 |
| recover-tasks | running | the section 6 known defect |
| recover-health | running | I-R3 |
| reclaim-fix | running | speed at scale (precondition of integrated-ws) |
| recover-guest | listed in the retro | I-R2, I-R8 (warn line) |
| deny-text | listed in the retro | I-R6, I-R7 |
| integrated-ws | listed in the retro, after reclaim-fix | I-R5 |
| state-off-tmpfs | listed in the retro | I-R9 |
| nosync-rule and nosync U45 to U82 | listed in the retro | I-N1 to I-N5 |
| arch-layer-pair-check | to file | I-R2, N10, section 7 |
| spec-check-i10 | to file | I10 (a test that asserts the `WARN overlap` line) |
| spec-check-i11 | to file | I11 (a review step for removing a feature) |
| spec-check-i12 | to file | I12 (an import-boundary check for tools) |
| spec-check-i17 | to file | I17 |
| spec-check-ir8 | to file | I-R8 (fix the stale `deny_gib: 40` assertion) |
| spec-check-oracle | to file | I-N5 (general) |

When a ticket in this table lands, change its rows in section 5, 6.3 or 10 from UNCHECKED to
ENFORCED and name the test by file and title in the same change. A row whose named check does not
exist is a defect of this file, not a status.
