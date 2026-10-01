# Forge verification ledger — planning-experiment-iterations

This is the F3 ledger for the initial v2609.1.0 forge. Append on reforge; do not overwrite.

## 0. Existence gate

- Knowledge artifact: the ITERATION_PLAN row, which makes each test a crucial test between named rivals, sized to about 2 min.
- Blocking failure removed (2026-09-27, firedancer, live session):
  - A 12-arena battery ran about 1.5 h on an unregistered harness, then was retracted.
  - A permute arm took 1,873 s.
  - Earlier O(n²) runs took 30–120 min.
  - Comparator and re-measurement batteries filled idle capacity. Their 6 GiB reservations then blocked the GPU job's admission.
  - The owner had to repeat "GPU first" and "no sweeps or large runs" several times.
- Expected decision-time delta: one discriminating receipt per 6-minute iteration, instead of one per 30–120 min.

## 1. Harvest (read-only inventory of 9 skills, 2026-09-27)

Existing owners, now cited instead of restated:

| Owner | Rule |
|---|---|
| `directing-research-sections` | Minimal existence/discriminator first; the scale/sweep/port release; WIP=1 |
| `orchestrating-agents` | P7 envelopes and reserves; GPU-first `gpu_status`; peak/release receipts; C4 hard deadlines |
| `validating-experimental-evidence` | EV0–EV4 |
| `acting-on-hypotheses` | Pin the threshold before building |

Duplicates found (left at their altitudes, now pointed to from here):

| Rule | Places |
|---|---|
| Idle capacity never creates work | 4 |
| Minimal-first | 2 |
| Negatives count | 2 |
| Commit the criterion before measuring | 3 |

Conflict found: `commanding-research-fleets` forbids clock-keyed Director instructions, while C4 and `RUN_INTENT` require deadlines. The Routing row resolves it: a ticket deadline is a resource control, not Director content.

Gaps this skill fills:
- a crucial test between named rivals;
- Build→Break→Fix;
- the wall-clock box;
- a scale basis taken from the prediction gap;
- main-thread work while runs execute;
- the per-iteration row;
- the CPU justification for learner runs.

## 2. Findings and resolution

| Date | Lens | Finding | Resolution |
|---|---|---|---|
| 2026-09-27 | placement | `directing-research-sections` claimed 「局所的な実験計画」 but fires only under a SECTION_MANDATE, so everyday iterations had no owner | PURPOSE cut: authority there, test shape here; pointer added there |
| 2026-09-27 | calibration | The model's default failure is to fill idle capacity and to size tests by the registered battery | Free-resource table and scale table placed in SKILL.md, not in a reference |

## 3. Mechanical record

- Structural floor: `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/planning-experiment-iterations`.
- F3 solo-tier waiver (2026-09-27): the trigger set was desk-checked serially; no live model trigger eval ran.

## 4. Reforge v2609.1.1 — 2026-09-27

### Scope, source, and acceptance

- User request: postmortem the supplied firedancer reports and distill the lessons into skills.
- Author/acceptor: codex-ac1c61c6aaf5c510. Audit: `postmortem-2026-09-27.md`.
- Transition: bounded episode reports → inspect planning failures → revise the existing iteration
  manual/template → check whether counterexamples still permit invalid planning or inference.
- Knowledge artifact: a scoped decision from the next interpretable test, including a diagnostic
  result. Removed delay: dependent runs and repeated compilation before the prerequisites are known.
- Extend this owner, add no skill. Keep scientific evidence disposition, admission, and resource
  execution with their existing owners. No research runs or programme transitions are authorized here.
- Acceptance: stop the documented invalid inferences without blocking a bounded useful diagnostic;
  template and gates agree; structural floor passes; no new listing charge exceeds the ceiling.
- Target files had no pre-existing edits. Unrelated dirty files in the shared checkout are excluded.

The report author wrote the initial skill during this same episode (attachment L855–866).
Its later changes are therefore evidence about how a remedy was chosen, not independent proof
that the remedy worked. In particular, “one arena per GPU job” was an incident reaction retained
as a general rule; the later phase timing contradicts its unconditional use.

### Source grading — sole home for this reforge

| Rule / finding | Grade | Source claim / locus | Applicability and added convention |
|---|---|---|---|
| Baseline and no-effect-control failures | third-party | Supplied outward reports, L528–529, L1183–1197 | Scores are reported, not rerun; the logical criterion mismatch is inspectable |
| Oracle scope and reference revisions | third-party | L1352–1367, L1528, L1686 | No independent validation of the project's theory or code |
| Phase-cost and launch-ownership failures | third-party | L1382–1456 | Reported phase explanation; no independent profiler or scheduler trace |
| Bounded exclusion rather than cause certainty | constructed | Compare L1602 with L1648–1650 | Logical audit of the proposition actually tested; no new root-cause claim |
| I0 readiness; oracle type; outcome regions | skill-supplied | Repairs mapped in the postmortem | Prospective planning fields consuming evidence-owner verdicts |
| Diagnostic/mechanism/confirmation kinds | skill-supplied | This reforge | Planning distinction, not a new admission state machine |
| Phase plan and conditional warm-process reuse | skill-supplied | Phase-cost failure above | Conditional optimization; no promised speedup or mandatory resident service |
| 120 s target / 600 s default cap | third-party | Existing skill and supplied report L520–546 | Bounded-iteration house default, not a universal law of experimental science |
| Decision cases D01–D20 | constructed | `decision-cases.md` | Counterexamples and limiting cases; not measured executor reliability |

### Calibration inversion

| | Episode's corrective push | Agent-consumer failure and correction |
|---|---|---|
| Objective | More hypothesis eliminations and GPU work per report cycle | Overclaims exclusions and fills slots; prioritize valid decision changes |
| Small tests | Reduce n/K to finish quickly | Can remove the required mechanism or power; preserve a discriminating scale or report infeasibility |
| GPU first | Fill idle VRAM with verification runs | Repeats CPU/compile work; plan phases and reuse only fingerprint-matched artifacts |
| Strong inference | List rivals and an elimination table | Treats causes as exclusive and assumes auxiliaries; require scoped result regions and inconclusive branches |

### Signed file treatment

| File | Treatment / acceptance oracle |
|---|---|
| `SKILL.md` | Replace objective, readiness, oracle, inference and phase rules; retain artifact ownership and minimal-first discipline |
| `assets/ITERATION-PLAN.md` | Add binding, readiness, scoped outcome table, phase costs and execution receipts; embed in canonical records |
| `tests/postmortem-2026-09-27.md` | Frozen bounded audit, line locators and source digest; no raw transcript copied |
| `tests/decision-cases.md` | 20 adversarial cases, including overcorrection cases; distinguish desk check from live eval |
| `tests/triggers.md` | Preserve existing routes; add diagnostic/phase-cost asks and audit/manual-edit no-fire cases |
| This ledger | Preserve v2609.1.0 record; append provenance, limits, and verification |

F2 boundary review: `directing-research-sections` already consumes the planning row.
`validating-experimental-evidence` still owns validity/footing and its canonical disposition.
The new fields consume those verdicts; they do not define a second evidence store or launcher.
Owner-named deferral: broader reciprocal routing edits in evidence/resource/kernel skills are
outside this single-skill repair; their existing ownership text takes precedence.

### Verification record

- `mise exec -- bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/planning-experiment-iterations`:
  exit 0, no structural failures or prose-debt warnings in the changed skill.
- `mise run lint:skills-floor`: exit 0; 74 skills, 65,104 charged characters.
  Collection reports 109 existing prose warnings across 58 other skills; no ceiling change.
- Trigger desk check: 8 fire, 8 no-fire, 4 ordered co-fire cases; serial review against actual
  planning, evidence, section, audit and forge boundaries. No live trigger-selection eval.
- Decision desk check: D01–D20 have explicit limiting actions in the revised manual.
  Old-vs-new comparison is textual; no claim of experimentally measured performance improvement.
- Independent semantic review: pending at this checkpoint; read-only Terra reviewer, no author
  expected-answer file or conversation history supplied. Final receipt appended below.

### Independent review and final acceptance

- Reviewer: `/root/verify_planning`, requested `gpt-5.6-terra`, fresh context, read-only.
  Read-set: manual/template and actual sibling boundaries. Expected-answer cases and this ledger
  were withheld. Resource declaration: NONCOMPUTE. No nested fanout or numerical run.
- Initial verdict: three medium findings. I5 could imply admission authority; the timing profile
  lacked a justified exception; unconditional GPU selection could delay a cheap CPU diagnostic.
- Accepted fixes: explicit owner receipts and no-authorization clause; prelaunch domain/resource
  approval for a timing exception; cost-evidenced, scope-limited CPU diagnostics when task rules permit.
- Recheck: PASS, no findings; static recheck only. D21–D23 capture the reviewer counterexamples.
  Final decision-case set: 23 cases (the earlier 20-case count records the initial checkpoint).
- Author acceptance: all three findings resolved; the owner map and canonical evidence store remain unchanged.
- F3 limitation/waiver: one independent semantic reviewer plus serial architecture, sibling-cut,
  trigger, and textual comparative passes. No blind OLD-vs-NEW execution or live trigger eval ran.
  The manual is improved against explicit counterexamples; behavioral reliability is unmeasured.
- `mise run link:skills`: exit 0. Existing skill links resolve to the edited repository directory.
  This verifies deployment on disk, not an automatic reload into already-running agent contexts.

## 5. Follow-up v2609.1.2 — 2026-09-27

**Source and boundary.** `postmortem-2026-09-27-followup.md` owns the full bounded audit,
source digest, overlap warning, and cross-skill repair map. The user explicitly requested a
second postmortem and related skill distillation. Reports are third-party assertions; no raw
scientific run or claimed launcher enforcement was reproduced.

**Signed transition and scope.** Requested acceptance condition + historical evidence → select
one useful diagnostic/mechanism/confirmation → plan its authorized, dependency-ready launch.
This skill owns GOAL_LINK and LAUNCH_WHEN, not programme allocation or execution permission.
LAUNCH_PATH consumes the evidence owner's EV0 rule. Extend existing skills, create none.

**Calibration.** The report's proposed cure for idle GPUs was unconditional prelaunching of the
next run. The consumer's failure is overproduction without result-dependent selection, not lack
of a queue. Fixed comparison arms and separate independent questions remain parallelizable.
A repair may yield valid knowledge while leaving the user's capability/conformance objective open.

| Rule | Grade | Source / applicability |
|---|---|---|
| Dependency-aware queue | skill-supplied | Report L1377–1387; applies to successor selection/validity, not a universal serial barrier |
| Goal-linked repairs and requested conformance | skill-supplied | L964–1019, L1307–1333; uses current user acceptance conditions, not the report author's inferred mandate |
| Authorized launch locator | skill-supplied | L1136–1147; target-specific exclusivity belongs to EV0/project policy |
| D24–D31 | constructed | Static adversarial cases; no measured fresh-executor reliability |

**File treatment.** Core and template add goal/launch-dependency fields; decision cases test
conditional vs fixed-arm execution, unrelated repair, conformance, launcher, and weakened claims.
The new bounded audit retains one provenance home. Existing first-audit findings are not re-counted
as new independent incidents. Descriptions and collection membership are unchanged.

**Independent review.** Fresh Terra reviewer `/root/verify_pm2_planning_evidence` inspected
core/template plus evidence-rule diffs against base `3ebbedb`, without author tests or ledger.
Verdict PASS, no findings; static contract review only. Its remit included unnecessary serialization,
invalidations, post-hoc rescue, and authority boundaries. Author retains final acceptance.
The subsequent wording-only split in the evidence reference does not change that decision contract.

**F3 scope.** Added D24–D31 desk-checked, including D25 (fixed arms) and D26 (unrelated valid path)
as overblocking controls. No live trigger or blind old/new execution eval. Existing trigger surface
is unchanged. No throughput gain or runtime enforcement is claimed.

**Workspace.** Base checkout had two unrelated unmerged paths. Edits and checks use isolated
worktree branch `codex/distill-research-postmortem-875d`, base `3ebbedb`. No conflict resolution,
staging of peer changes, or repointing of shared skill links is part of this reforge.

**Mechanical receipt.** Isolated worktree dependencies restored with
`mise exec -- bun install --frozen-lockfile` (no global `bun link`). The first collection task had
failed only because this fresh worktree lacked `cleye`; after the restore, `mise run lint:skills-floor`
exited 0: 74 skills / 65,104 charged characters; unchanged ceiling and descriptions.
Target skill-check for all three edited skills: exit 0, zero FAIL and zero prose warnings.
Collection warnings remain 109 across 58 untouched skills. `git diff --check`: exit 0.
The three skills add 20 constructed behavior cases in total (planning 8, evidence 8, Tiger 4).
The final Tiger review found and closed one additional identity-binding loophole; all semantic
reviews ended PASS. These receipts do not establish live invocation or downstream compliance.

## 6. Third packet v2609.1.3 — 2026-09-27

**Audit/source.** `postmortem-2026-09-27-third.md` owns the bounded audit of attachment
`98bfb11c-6e50-41df-8916-a72f40f2901d` and its digest. Reports remain third-party assertions;
no scientific run, safety classifier, or source theorem is independently validated here.
The control-state, equivalence and recovery changes are owned by the evidence/Tiger siblings.

**Policy reconciliation.** The actual main-branch change `a1feb9e` removes missing-GPU-path
fallback for learner runs. It was cherry-picked into the isolated integration branch as
`ff708fc` before this delta. The existing CPU-exception table and D13/D22 examples were then
narrowed to CPU-specific reference proofs and non-learner diagnostics. A run's ticket label
cannot change its executed workload. This preserves the adopted house policy; it is not a
universal scientific claim that CPU cannot execute learners, nor permission to override a
future explicit user instruction.

**Signed map and scope.** Evidence + adopted device constraint → classify actual workload →
GPU learner run, GPU-path prerequisite, or narrowly justified non-learner/reference check.
Existing budgets also apply to data-only oracles; no sweep exemption follows from the label.
No new skill, resource admission mechanism, or launcher is introduced.

| Delta | Grade | Evidence / limit |
|---|---|---|
| Workload-based device exceptions | skill-supplied | Actual repository policy a1feb9e; report L1–23, L240–287 illustrates relabeling risk |
| D13/D22 alignment; D32/D33 | constructed | Static cases, not an empirical execution evaluation |
| Third audit's episode findings | third-party / bounded logical inspection | Source locators and limitations live in the audit |

**Independent review.** Fresh Terra `/root/verify_pm3_gpu_recovery`, no author tests/ledger,
found that the old deny-list still permitted CPU learner runs given a DEVICE_REASON. The
entry now forbids that exception; recheck PASS with no findings. This is static semantic
verification, not evidence of compliance by a live research agent.

**Workspace scope.** Continue the isolated branch from the previous reforge. Main checkout's
unrelated conflicts remain outside scope. A pre-existing worktree mise.toml change from Bun
1.3.14 to 1.4 is also excluded from staging and this commit.

**Verification receipt.** Target skill-check over the three edited skills: exit 0, no FAIL/prose
warnings. `mise run lint:skills-floor`: exit 0, 74 skills / 65,104 listing characters; unchanged
109 warnings in 58 other skills. `git diff --check`: exit 0. Added 16 constructed cases across
the three skills; two older device-policy cases were reconciled with a1feb9e. Trigger descriptions
are unchanged. No live trigger/old-vs-new execution test or shared-link deployment is claimed.

## 2026-09-27 theory prediction handoff

`systematizing-theories` now supplies exact prediction statement versions and open obligations.
This skill still selects/bounds the test; validated findings return to the theory owner for content
updates. A successful run cannot silently promote a conjecture to a theorem. Static reciprocal-cut
review passed; no experiment admission or runtime schema changed.

## 7. Full redesign v2609.2.0 — driving-bibifi-cycles, 2026-09-27

**Authority and purpose.** The user rejected a planning/gate-first manual and requested a full
redesign around microticket BIBIFI throughput. Their supplied original prompt specifies six-minute
JST operation/report windows, experiments targeting two minutes with a ten-minute maximum,
critical-path priority, useful work on spare resources, and bounded worker lifetimes. Their latest
correction explicitly rejects resource-consuming filler and demands an active search for useful work.
These current instructions supersede historical policy choices recorded above.

**Signed transition (root author/acceptor).** Authorized goal + actual queue/resources/results →
drive the smallest useful Build/Break/Fix loop → checked artifact and decision → immediate next
allocation, until completion or a concrete remaining constraint. The existing plan/log owner is
renamed, not duplicated. No new schema, admission authority, database or daemon is introduced.
`planning-experiment-iterations` retires; historical references retain their original names.

**Calibration correction.** The prior manual treated overproduction as the dominant risk and
underweighted passive waiting, integration delay, and idle capacity. Both failures occur.
The new LAW puts earliest critical dependency first, then actively searches useful independent
work. Every ticket names a decision it can change or a delivery dependency it can remove.
An empty ready queue requires examining blocker, successor and preparation slices. It does not
authorize unchanged benchmarks, decorative artifacts or speculative batches. No utilization target
or nominal ticket count substitutes for useful completed feedback cycles.

| Rule/source | Grade | Locus and limit |
|---|---|---|
| Six-minute cadence, two-minute target, ten-minute cap, useful resource allocation and worker limits | author-confirmed | Current user's original prompt and subsequent corrections; an operating requirement, not an empirical optimum |
| Critical-path breakthrough plus no filler | author-confirmed | Current user's “リソース遊休を赦さない姿勢 / クリティカルから突破していく姿勢” clarification |
| Missing constructor, mismatched component interface and wrong-model runner | third-party | Attachment `56ad0d36-c191-4aa7-bb8b-69271d346577/Pasted text.txt`, L1010–1388; reported code state, not independently reproduced |
| Rolling queue, execution/interpretation/promotion dependency distinction, compact inherited context | skill-supplied | Operational response to those failures; scientific validity/admission remain with existing owners |
| Scheduling cases and worked window | constructed | Engineered cases, not measured GPU runs or performance gains |

Source digest: `36d64c8605ab50aead69cc9774e04289e748849e28f3b13dbc7969c96ab7ff4d`.
The user prompt is controlling; the episode author's claimed remedy is not proof that it worked.

| File set | Signed treatment / acceptance |
|---|---|
| Core | Replace gate spine with action/result/replan loop, active capacity search and explicit two-clock semantics |
| Template | Shared context plus compact microticket and completion record; reuse existing canonical records |
| Microticket reference | Concrete integration, GPU slice, dependency and finite-worker examples |
| Scheduling tests | 28 adversarial timing, usefulness, capacity and lifecycle cases |
| Decision tests | Retain 33 evidence safeguards; reconcile D21 cap and D32 explicit device constraint |
| Triggers/index/sibling pointers | Rename sole owner; preserve section WIP/admission and resource-owner mechanics |
| Historical audits/ledger | Preserve, append this superseding policy; no rewritten incident history |

**Verification and findings.** A bounded Terra boundary audit preceded the rewrite. A fresh Terra
reviewer `/root/bibifi_final_review` inspected core/template/reference and actual section/resource
boundaries without author cases/ledger. It found one overbroad demand for resource ceilings on
NONCOMPUTE workers. The core/template now distinguish P7 compute envelopes from NONCOMPUTE
declarations while retaining ticket, deadline, lifetime and hand-back requirements for both.

Fresh Terra arms `/root/bibifi_forward_old` and `/root/bibifi_forward_new` received the same
constructed scheduling prompt in the same turn. OLD read `cb4fcdb`'s manual; NEW read the draft.
Neither saw expected answers, the other arm, or this ledger. Both selected critical repair plus
useful independent GPU work, rejected filler, retained a lawful run across a report boundary,
and continued an already authorized branch immediately. NEW unnecessarily blocked source work
on a compute envelope and mislabeled initial schedule/delay statuses. These were regressions,
not wins: the first overlapped the independent finding; explicit initial-baseline, run-vs-release
ETA, and ontime/delta/pivot definitions fix the second. S27/S28 preserve the counterexamples.
No claim of superiority or measured throughput improvement follows from this single paired case.
Post-fix verification is a static recheck; a fresh behavioral rerun remains unmeasured.

**Mechanical receipt.** Target skill-check exits 0 with zero core/reference prose warnings.
`mise run lint:skills-floor` exits 0: 73 skills / 64,299 charged characters, unchanged ceiling.
`mise exec -- bun scripts/lint-skills-index.ts` and `git diff --check` pass.
Existing sibling prose debt is scoped out: section core 3/reference 80; orchestration reference 13.
The orchestration edit adds no warning; the new driver has none. Collection has 107 warning
groups across 57 other skills. Trigger routing was desk-checked against the named sibling owners;
no live trigger-selection or runtime resource-enforcement claim is made.

**Reconciliation.** RECONCILED_AT: 2026-09-27T05:46:03Z plus subsequent tool receipts.
DRIFT: injected continuation record belongs to the closed theory task (WRITER none); current
TASK_CONTINUATION_SLOT is absent. It remains read-only; no resumability or ownership is claimed.
Current working scope reconciles with `cb4fcdb`, branch alpha, no paused operation/unmerged files,
and only this redesign's enumerated skill/index edits. This ledger is a forge receipt, not a
replacement continuation authority. Next authorized work is narrow final verification and linking.

**Final fixes and deployment.** Independent recheck accepted the report-status definitions and
found the compact template still demanding compute fields from NONCOMPUTE work. Both compact
FIT/LIMITS and completion COST/RELEASE now branch explicitly by class. Root checked this exact
repair against the queue and core; no new envelope or fictitious memory measurement is required.
`mise run link:skills` and `mise run lint:skills-wiring` exited 0; the central linker removed the
old Claude skill link and installed the new name. Fresh-session discovery remains unmeasured.

## 8. Premise invalidation v2609.2.1 — 2026-09-27

**User correction / author-confirmed.** Faster BIBIFI results can make other workers' entire
assignments pointless while they are still executing. Microtickets bound that exposure to changing
conditions, not merely process duration. The user further emphasized continuously changing
conditions and explicitly requested linking the revised skill.

**Signed delta.** Root retains the existing owner and replaces deadline-only scheduling with
premise-aware microticket commitments. Each ticket cites current premises and invalidating results.
Changed findings revisit running as well as queued work; affected owners stop obsolete work and
confirm release. Unaffected work continues. Preauthorized successors recheck current premises;
warm-worker reuse never preserves obsolete assignments. Large milestones remain organizational
containers, not executable long tickets. No new state schema or authority is introduced.

**Verification.** S29–S33 are constructed counterexamples covering purpose independence,
early cancellation, stale queues, unnecessary fleet barriers and false negative-result credit.
Root desk-checked the core, compact template and concrete representation/optimizer example.
F3 delta waiver: this narrow follow-up used serial contradiction, scope and trigger checks;
no new independent or paired behavioral evaluation. The trigger description/owner is unchanged.
`mise exec -- bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/driving-bibifi-cycles`
exited 0 with no warnings; `git diff --check` passed. `mise run link:skills` and
`mise run lint:skills-wiring` passed. Both Codex and Claude links resolve to the canonical directory;
`cmp` confirms each linked SKILL.md matches the revised source. Live cancellation latency is unmeasured.

## 9. Parent coordination v2609.2.2 — 2026-09-27

**Source and design responsibility.** The user supplied the 15:14 packet and explicitly demanded
a postmortem and strict rejection of wholesale delegation. Source digest, line evidence and limits
live in `postmortem-2026-09-27-coordination.md`. Outward reports are third-party evidence of the
reported operation, not independently reproduced runs. The user's required parent responsibility
is author-confirmed. First partial return, consumer and intervention records are skill-supplied.

**Signed map/root acceptance scope.** Current findings and authorized work → parent slices,
dispatches and consumes short returns → critical dependency advances or gets explicitly re-sliced.
The parent owns coordination even when implementation is delegated. This skill owns scientific work
selection and the six-minute first-return requirement; orchestration C0 owns dispatch accountability.
The first return is a checkable partial result, not a whole experiment six-minute kill rule.
Long-run C2 cannot override this loop's experiment cap or authorize whole-component delegation.

**File treatment.** Core/template expose parent blocker, observed artifact, intervention deadline
and consumer join. S34–S39 cover relabeling, waiting, quantity substitution, invalidation and autonomy.
The new postmortem records design fault and a concrete replacement for the final reported situation.
Orchestration core/reference remove under-twenty-minute permission and stop-only-at-final-report
wording, define observable coordination failure and its correction, and preserve blind boundaries.
No new schema, process monitor, agent quota or approval flow is introduced.

**Verification.** Root authored the audit and patch; Terra `/root/parent_coordination_review`
received only a 90-second read-only diff review, first-return/consumer/stop conditions and NONCOMPUTE.
It found four holes: residual child polling to completion, unbounded first-return time, ungrounded
coordination records, and potentially revealing blind updates. All were repaired in core/reference
and template. Root rejected no substantive finding; stopping a compromised blind arm is not proof
of preserved independence. The independent recheck is recorded below when returned.
Root desk-checked six new scheduling cases and ten orchestration cases against actual sibling cuts.
F3 scope: narrow static delta review and textual old/new comparison; no fresh paired behavior run.
Static improvements do not prove deployed agents comply or that actual interruption latency improves.

`skill-check.ts` for both changed skills exits 0. Driver core/references have zero prose warnings.
Orchestration retains exactly its baseline 13 reference warnings; no new prose debt was added.
`mise run lint:skills-floor` passes: 73 skills / 64,299 listing characters; ceiling unchanged.
`git diff --check` passes. Parent coordination criteria are semantic instructions, not a new runtime hook.

Independent recheck found one remaining visibility hole: the board itself could expose cross-arm
artifact/consumer links. C0 and the template now keep those details in existing parent-only visibility;
blind arms receive neutral control instructions, not the shared record. Root checked the exact fix.
`mise run link:skills` and `mise run lint:skills-wiring` passed; source-linked files are updated.

## 10. Queue and ownership reforge v2609.2.3 — 2026-09-27

**Signed design/root acceptance.** User requested a new postmortem and practical concept
split/merge. Source digest, exact report locators and bounded findings are in
`postmortem-2026-09-27-queues.md`. Reported execution is third-party evidence; current user
requirements are author-confirmed. The actor's claims that skill defects are small, that every
experiment must finish under two minutes, and that four workers/one function is the right unit
are not adopted as policy. Runtime enforcement is not inferred from a manual or self-report.

**One-home treatment.** Keep seven existing semantic owners; add no skill. BIBIFI owns conditional
next-work selection, predecessor retrieval and short actual-consumer integration. Orchestration
owns finite admission retries, reservations and supported read/write isolation. Evidence EV1 owns
material loaded dependencies and GPU claim scope; EV3 owns effective ablations/model classes.
Section WIP admits partial coordination without invented terminal receipts. Theory changes hand
versioned impact to live work selection. Fleet roles are narrowed to explicit profiles; local PI
coordination is preserved and legacy benchmark/E4 rules no longer gate formal v2. The shipped
fleet prompt now points to those same rules; project-specific overrides are untouched. Forging
verification now requires sequential event exercises for loop/control-plane revisions.

**Static review.** Terra `queue_evidence_review` inspected queue/evidence/section/theory deltas
without cases/ledger and returned PASS. Terra `fleet_scope_review` found role wording ambiguity,
legacy E4/launch conditions leaking into v2 and PI-birth policy ambiguity. Root repaired the
profile, detailed references and shipped policy together. The reviewer’s claim that an actor's
responsibility and a skill's semantic ownership must be mutually exclusive was not adopted:
PI still coordinates dispatch using C0. Wording now distinguishes execution from coordination.
A recheck exposed remaining unconditional checklist text, now explicitly legacy-only. The
suggested E4 reference qualification was already present; root reread and confirmed it.

**Forward exercise.** Fresh Terra `queue_forward_old` and `queue_forward_new` received the
same four events separately, with bounded returns and no expected-answer files. OLD read the
6a8582b BIBIFI/core delegation manuals; NEW read the revised pair. Both prioritized the short
consumer repair, stopped an owned lower-priority test at a safe point, rejected a five-arena replay,
withheld launch under incomplete identity, and accepted a properly bound 150-second follow-up.
NEW explicitly offered narrow serialization if snapshot support is absent; OLD stopped at the
capability/binding check. Both preserved the scoped null and declined global mechanism conclusions.
Outcome: no demonstrated broad behavioral win; clearer explicit fallback in this one case only.
No numerical jobs were run, and real scheduling latency/throughput remains unmeasured.
The changed evidence/fleet content was statically reviewed, not loaded into those two forward arms.

**Verification.** S40–S45 plus the four-event fixture and six cross-owner cases cover the changed
paths. Fleet fire/no-fire cases now exclude generic R&D from the thin-Director profile. Target
skill floor and fleet structural checker pass. Collection floor passes: 73 skills / 64,359 listing
characters, unchanged ceiling. `git diff --check` passes. Driver, evidence and theory remain zero
prose warnings. Scoped existing debt: fleet core18/reference70 (down from19/76), section core3/
reference80, forge core15/reference85 plus2 long cells, orchestration reference13. These existing
prose-cleanup scopes are deferred; the delta adds no warning. No package, proof, GPU kernel, actual
Firedancer run, hook enforcement, or runtime schema was changed.

**Deployment receipt.** `mise exec -- bun test agents/claude/hooks/tests/assign-lib.test.ts`:
17 pass / 0 fail, including project override and shipped fleet-policy fallback loading.
`mise run link:skills`, `mise run lint:skills-wiring`, index check and `git diff --check` pass.
Codex source-directory and Claude fleet links resolve to this repository. Existing sessions and
project-specific fleet_policy overrides are not claimed to have reloaded the new policy.

## 11. Discovery throughput, parallelism and performance v2609.2.4 — 2026-09-27

**Source and priority.** Both supplied packets, hashes, overlap limits and scoped observations
live in `postmortem-2026-09-27-performance.md`. User instructions explicitly reaffirm broad
parallel microtickets and “Maximizing the throughput of knowledge discovery from Experimental
and Formal Methods”. These are author-confirmed objectives. Episode timing, kernels and scores
remain third-party reports, not reproduced runs. Our parent-capacity language overcorrected toward
small teams; the current delta replaces that default, preserving actual host/platform/write limits.

**Root-signed treatment.** Core replaces proxy objectives with valid, relevant discovery per time.
Separate agent-ready work from compute admission; launch useful independent work broadly, using
compact returns and exception coordination. One question per ticket is not one question per fleet.
Template/reference/cases consume that rule. C0 now repairs return routing before throttling only
blocked branches. Single live-file writers coexist with isolated proposals. P7 binds real process
caps for loop tests/profiling and preserves evidence on overruns; BIBIFI chooses the next useful
repair instead of waiting for a queue to drain. EV2 owns batched shared-state update semantics;
EV3 owns throughput units and timing. GPU GKB/GK2 consume those contracts, separate stage and
whole-run gains, and stop only the affected performance acceptance rather than all development.
No new skill, database, simulator, schema or execution hook is introduced.

**Static review.** Fresh Terra `performance_semantics_review` found a possible waiver of required
GK3 acceptance tests. Fixed: targeted microticket oracle does not waive required acceptance tests;
broader tests retain finite coverage/budget. Fresh Terra `discovery_parallel_review` read core,
template and actual orchestration deltas without cases/ledger and returned PASS. Root owns design
and acceptance; reviewers performed bounded NONCOMPUTE tasks, no compute or nested fanout.

**Sequential OLD/NEW.** Fresh Terra `perf_forward_old` loaded804ac2c and `perf_forward_new` loaded
the current BIBIFI, EV2 and GPU manuals. Four separately delivered events tested process overrun,
batching semantics, mismatched throughput and sixteen useful independent agent tickets whileGPU
was full. Both stopped the overrun, rejected claimed sequential equivalence, and started all16
when slots/host/scopes fit. Thus no new broad parallelism gain was demonstrated by this text case.
Both rejected the inflated200k threshold yet retained the unsupported50k. Root added explicit
old-target justification in GPU/EV3. Fresh `throughput_target_recheck` received the isolated event
with self-set/underived threshold status clarified and correctly marked both pending. This is a
narrow post-fix check with clarified input, not an isolated causal estimate of the skill change.
Its additional “100x impossible” statement is accepted only under a nonoverlapping time model;
the manual correctly requires a critical timeline when work overlaps. No live throughput gain,
process killing, GPU behavior or target feasibility is certified by these symbolic exercises.

**Verification.** S46–S49, revisedS36, orchestration cases, four sequential events and the
additional static cases cover the delta. Target floor passes: BIBIFI/evidence zero prose warnings;
measured archive of804ac2c GPU reference debt208 unchanged; orchestration reference13 unchanged.
Those existing prose debts remain scoped cleanup work. `git diff --check` and collection floor
pass:73skills/64,415charged characters, unchanged ceiling. The listing now carries separate agent
scaling. Previous narrower skill versions and their recorded acceptance remain historical evidence.

Deployment: central `link:skills` and `lint:skills-wiring` pass; Codex/Claude BIBIFI links resolve
to the canonical source. Before commit, HEAD advanced to738eca7 through an unrelated host-snapshot
hook commit. Its four files do not overlap this delta; shared index was empty and no operation was
paused. Preserve it, stage only this task's enumerated skill files. No push or external deployment
is performed by this task; fresh-session runtime compliance remains unmeasured.

## 12. Full operating-manual rewrite v2609.3.0 — 2026-09-27

**Root-signed mandate.** User asked for a complete revision after rejecting another wording-only
postmortem. Control-plane source: attachment6b1fd301-c829-4dba-afad-72e3aee808cd,1278lines,
SHA2561f7d95fa092e1c1934660f3800d60ef9832cbb46e1a0fb1d1e492f40d68758c0.
The source includes an actor retrospective, not an independently verified single-cause account.
Current local old-name absence contradicts treating the retired planning skill as presently installed;
which version the historical executor loaded remains unknown. No live Firedancer files/jobs were changed.

**Design replacement.** Replace the309-line accumulated core with a178-line operating loop:
start from current goal/evidence, cut one consumed result, execute by observed event, scale useful
independent work and qualify/consume it. Keep one question per ticket and many tickets per fleet.
The compact template inherits context instead of accumulating gates. Supporting patterns and
scientific regression cases remain; old audits are preserved as history, not loaded operating rules.
No new skill, state database, launcher or runtime gate is added. The collection objective remains
valid discovery/time from Experimental and Formal Methods, not task counts or release activity.

**Typed boundaries.** BIBIFI selects work and consumes observations. C0 owns the current capability
receipts for worker delivery/update, P7 caps/cleanup, evidence-bound execution and actual hand-back.
Evidence/proof/theory owners retain qualification and formal section owners retain admission/WIP.
A missing capability repairs only its dependent action, not all useful independent work. Capability
receipts are reused while current, avoiding a universal startup barrier. Forging verification now
separates package lint, text reasoning, tool-backed rehearsal and real throughput evidence.

**Static review.** Fresh Terra v3_semantic_review compared old/new core/template and C0 without
expected cases/ledger. It caught loss of the next-ticket provenance rule. Root restored source/
consumed-evidence selection and separately restored explicit GPU-first/concrete CPU justification.
Floor now reports zero BIBIFI core/reference warnings. Retained sibling debt remains orchestration
reference13; forge core15/reference85 plus2long cells, unchanged. No assertion that skill prose
itself enforces platform actions or proves a live session reloaded a file is allowed.

### Actual capability trial, isolated from research work

Fixture root: /tmp/bibifi-v3-rehearsal.yyI0PD. The scenario/criteria were written first in
`tests/operational-rehearsal.md`. All agent tasks were declared NONCOMPUTE, no nested fanout or
numeric jobs, with disjoint output files and60second hand-back requests. Parent/root consumed the
actual files, not their self-reported success. These requested agent deadlines are not claimed
as platform-enforced agent termination.

- Independent interface and protocol workers produced actual artifacts. Interface v1 input hash:
  c2c3268ee751cc9088dad7be87f0df805f27103d852bc8371a1adabcbb69e224.
  Protocol hash:46c3ec531ac5a908106d6dd6f7686a3b18ad4db8d0ace55a12426464430e8f67.
  Root checked the repeated-key witness: sequential UNKNOWN/RED differs from deferred UNKNOWN/UNKNOWN.
- Root changed interface to v2 with hash6ce5d4a05f32eabd4ddac7c8156697555fe52d284ddeb89235a613e55349ce2a.
  Actual followup_task resumed the completed worker. Old return stayed unchanged at
  53d1d897e3986719af1cf0ebd0f9fd43f3f8c7e1b991f1c5864051efd43b25b8.
  New return135d1fb471682e4e276239c9f5d3707759d816e6e63f629fbb0ff98614cec8ec bound v2.
  Root's shell hash assertions rejected stale binding and wrote the current consumer wire.
- Final core snapshot7af6a333968237ab5fb65e2c74ada5ad3c6e2e7a7833128153bd506947935af0
  was given to a fresh consumer worker. Its actual receipt bound the same skill/input hashes and
  published the v2 wire, rejecting v1. Final consumer hash:
  66714c6072c38b7b823882763e7c4991b81706a6b8107dc902169e6e7957d3e9.
  Its chat summary mistyped the skill hash; the stored receipt and independent read-back were correct.
  This was a relay-summary defect caught by reading the artifact, not a failed binding silently accepted.
- P7 lifecycle probe used a64MiB CPU envelope, one thread, four-process bound,2second wall cap,
  one-second cleanup grace, and an owned shell/sleep child. Manifest hash:
  2e25f30fc5f4574562006230f87443fb034492c51aff54b398fe9a9227b6b659.
  `agent-resource-run --manifest .../resource.json --check-only` returned ADMIT.
  Real run returned BREACH reason=walltime, exit124 and RELEASE at2026-09-27T09:21:20.568Z.
  RAM sampled peak3985408bytes. ParentPID4003076 and childPID4003090 were absent on read-back;
  scope agent-resource-4003046-930f271f-1d41-4db0-b5c6-34bf54c3e948.scope was inactive/dead.
  A normal `true` run under the same released job/envelope then passed exit0 and released resources,
  at09:23:31.074Z, proving the probe does not merely kill every invocation. No GPU was used.

This proves only the observed local process cap/cleanup, completed-worker resume, artifact binding
and consumer read-back. It does not prove mid-execution agent interruption, GPU cleanup, high-fan-out
scaling, target launcher snapshots or actual knowledge-discovery throughput. Initial worker tests used
the pre-lint v3 draft without a captured skill hash; the fresh final consumer used the pinned final core.

### Paired operational comparison and final floor

Fresh Terra v3_pair_old/new ran the same file-consumption task on identical inputs with separate
outputs, launched in the same parent turn without expected answers. OLD read ba478fc core snapshot
5b4382ed61f78cdabfa36842d9478042dca5c7c17cb53a9cc58bb053f737c9fd; NEW read the pinned
7af6a333968237ab5fb65e2c74ada5ad3c6e2e7a7833128153bd506947935af0 candidate.
Both actually read files, rejected the stale proposal and wrote the current wire. `cmp` passed;
both output digests were e3d6302b858a2e5300b668ec5e02ababfd5f5bb9efcc290c62d0e80cfe3cd57f.
Thus this narrow operational task ties; no superiority or general reliability claim is warranted.
The manual shrank from309to178lines while preserving this tested outcome. The measured change is
instruction size, not scientific throughput. Root read back both receipts and corrected its own
protocol-hash transcription before commit; neither agent summaries nor this ledger bypass read-back.

Target floor, full collection floor, index and diff checks pass. Collection remains73skills with
64,388charged characters, below unchanged ceiling. No new runtime implementation was published.

## 13. Observed batch progress, v2609.3.1 — 2026-09-27

Root-signed narrow correction after packet f8e7b9b0: blocker release is followed by observed start,
not an assumed retry. Requested, executed and consumed counts stay separate. Evidence owner
qualifies measurement and target achievement independently; low scores are not erased. Source,
cases and fresh tool-backed interpretation receipts live in evidence skill's result-states
postmortem and ledger v2609.1.4. Static cross-owner review PASS. No new state store, queue or
process mechanism is introduced. Core remains short and floor-clean; no real throughput gain claimed.

## 14. Corpus-grounded scientific direction, v2609.4.0 — 2026-09-27

**Authority and source.** User requested a practical retrospective revision grounded in the soks
concepts behind anomaly→abduction→rivals→prediction→discrimination→exclusion→candidate revision,
and then explicitly required domain-agnostic science/engineering use. The new bounded episode
is recorded in `tests/postmortem-2026-09-27-scientific-loop.md` with its digest and limits.
Reported Firedancer scores/causes are third-party evidence, not rerun or certified by this forge.
Soks source commit4971082d182592ee9daafda885568d519b812126 and exact position/claim IDs are
recorded once in `references/scientific-loop.md`. Root read positions, relevant ledgers and
source-evidence captures; no newly fetched or otherwise unread primary source is claimed read.
The corpus draft/depth/coverage limits remain. User's four-table form and operating decisions
are skill-supplied, not attributed to Platt or treated as settled IBE theory.

**Signed concept map and file treatment.** Keep BIBIFI's sole work-selection owner. Add its
scientific bridge as a lazy reference plus one compact optional template. Hypothesis genesis
stays with forming-hypotheses-from-anomalies/forging-novel-theses; validity/proof/theory and
admission retain their owners. Fix forming's stale “ranked batch” claim to match forging's
actual unranked candidate output, and add the cheap-test handoff. No new skill/database/runner.
The core links situation/contrast to scoped predictions and a candidate revision before scheduling.
Preserve the short event-driven loop, broad independent work and real execution boundaries.

**Domain cut.** The operating objects are hypotheses, models, designs and procedures. No learner,
architecture, code artifact or candidate machine is required. Machine-specific reconstructed
examples move to the episode audit. The old microticket reference is preserved unchanged as
`tests/microticket-patterns-v3-history.md`; its live replacement covers engineering, science,
formal obligations and observation procedures. GPU/resource rules apply when the workload uses
those resources. Source corpus titles are retained for identity, not as restrictions on consumers.

**Static refutation.** Fresh Terra scientific_loop_review found that a noisy aggregate difference
could update an account without its frozen uncertainty criterion; root fixed the table to preserve
observations and require the criterion for an effect inference. Fresh soks_derivation_review found
CONTRAST attributed too broadly to GEN; it is now explicitly a skill-supplied field, with the
MS-L75 distinction scoped as the source records it. Both reviewers saw content/sources but no tests
or ledger. Root retained design, edits and acceptance; all dispatches were bounded NONCOMPUTE.

**Actual artifact exercises.** Fresh old/new workers read identical synthetic evidence and frozen
old9cdafe6 versus draft-new manuals, then actually wrote four-table plans, a U/W finite logical
countermodel and next-action proposals. Source digest08d1aab18dc2f810cc04d83b53d7bd02517587aefc6ac4c48adeeab7835867f3.
Outputs: OLD34886952238a840f633843f3e4512a2d57d656815304009aa0795c8eab64f612;
NEWdec6c908468ee932332b0f7dee516ff65e1d82cb760f1044907c692d90437631.
Both rejected residual→favorite-cause and per-case→one-uniform-candidate inferences and selected
a short trace before integration. No broad behavioral win is established. Root found their
answer-informed arbitration probe ambiguous as a deployed repair; the method now explicitly
separates privileged diagnostics from prospective rules and requires an actual decision rule,
not only f(x,h). The first fresh bridge check still overclaimed causal localization from oracle
success. Root added a constant-output counterexample and required independent localization evidence.
A second actual artifact5454c1665db3ef2eba6d4b922a87d7049f210e024538dbb17e74ea815096578c
correctly derived the fair-independent-label1/2limit and kept the perfect oracle diagnostic-only.
This elementary countermodel was root-checked, not proof-assistant certified or a claim about Firedancer.

After the user's domain correction, a fresh transfer worker read the generalized reference/template
and produced an engineering coating-process and scientific biodiversity-monitoring plan. Artifact:
b044654dca38ef4520ec93ea37b0a1cc2d4bed34407e05ab2bc623c590315f4e.
Root read back its rival/auxiliary, confound, scope and revision decisions. It did not assume authority
to stop production or conduct field observations. Its prepared observation plan is enabling work,
not an actual field result despite loose “witness” phrasing. No engineering/scientific outcome,
R&D throughput gain or general domain-transfer reliability is claimed from this narrow exercise.

**Verification.** New audit carries ten frozen regression criteria; triggerF10 routes the full
Strong Inference request without stealing standalone hypothesis generation/proof ownership.
Target floor: both changed skills zero core/reference prose warnings. Collection floor passes:
73skills/64,439charged characters, ceiling unchanged. Index and diff checks pass. Soks and live
Firedancer repositories remain untouched. Commit, push and source-link verification close delivery,
not scientific efficacy; source provenance and operational checks remain distinct.

Deployment: `mise run link:skills` and `mise run lint:skills-wiring` pass. The canonical source
updates the linked Codex/Claude skill directories; running sessions are not assumed reloaded.

## 15. Explicit activation is work, not report formatting — v2609.4.1

Source: attachment49c8218a-6404-45ef-a4ed-4a1ac50d3566,1623lines,
SHA256ae8f81d69be299d2a76a90f1a30423bdfaffa84f9f174afadaf75f03b3369d07.
Bounded audit and frozen acceptance criteria live in `tests/postmortem-2026-09-27-report-only.md`.
The user's report of prompting the skill is authoritative context; exact historical loaded version
and every intervening tool call remain unverified. The audit describes passive behavior, not intent.
Positive diagnostics in the episode remain evidence; they are not erased to portray uniform failure.

**Root-signed treatment.** Put invocation semantics first: a direct BIBIFI invocation resumes the
current authorized work unless the user requests status only. Reporting is a checkpoint, not task
completion. A blanket release-wait claim requires current dependency evidence or a bounded check
of plausible independent blocker/reference/consumer work. Genuine waiting remains valid; no action,
agent or GPU-use quota is introduced. Existing valid dependency receipts are reused. Historical
references remain usable under matching conditions; age alone does not create a rerun obligation.
Existing scientific-method/source, evidence, orchestration and formal authority owners stay unchanged.

**Static review.** Terra activation_rule_review found that requiring all three searches could
create ceremony when a hard dependency was already established. Root narrowed it to plausible
options/current valid receipts and adjusted the template. Other scope/status-only/authority cuts
passed the review. No whole-workspace exhaustive search or new scheduler is required.

**Tool-backed activation test.** Fresh Terra activation_old/new received the same current-state
file and source artifacts, using old9f41899 or draft-new core/patterns, with isolated disjoint output
prefixes and90second NONCOMPUTE assignments. The task instruction was the bare skill invocation;
no desired independent task or expected finding was supplied. Both read actual files and wrote a
reference-footing finding rather than only repeating the release ETA. State digest:
3c04006ae8287e8b3594980dd9e9488e5005767557c3bc29ac5b024efd7deac6.
OLD result219cae4520ec8f6c560a53e539dcf5b36da527febbceac39fab1a6d8ff049dc5;
NEW result31140e37b314ee46a896df17a713c0bd78716901ebaceef1c88b872ef4384ad3.
Root read back both. The final-quarter versus full-window mismatch was valid. Their additional
emphasis that the result was historical did not itself disqualify it; root added the explicit
matched-reference preservation clause. NEW identified a matched predecessor reference as an
independent next branch; OLD kept acceptance waiting on the revision. Neither launched numerical work.
This narrow case did not reproduce the production report-only failure and establishes no general
initiative or R&D throughput gain. It does not show that the former wording was the sole cause.

**True blocker.** Follow-up supplied a separate case with an already verified matching historical
reference, exhausted independent scope, unavailable external sample and no running owned job.
The worker correctly retained the reference and waited without filler. It incorrectly asserted
ontime despite no previous schedule. Root caught this on artifact read-back and required a real
file correction to UNKNOWN; current artifact0de75592829b3a58a07773ae9d46845053e13c05dffd1ed0c171214eaa60285f.
The waiting decision passed; the initial schedule assertion failed and was corrected. Do not label
this as an unqualified all-pass behavior trial. Existing ETA rules already covered that failure.

**Verification.** F11 and S50–S53 cover invocation, true waiting, status-only requests and repeated
finding credit. Target floor zero core/reference warnings. Collection floor passes73skills/
64,439charged characters with unchanged ceiling and listing. `git diff --check` passes. No live
Firedancer code, job, source corpus or runtime enforcement changed. This ships an instruction/
acceptance correction with measured limits, not a claim that prose alone guarantees initiative.

## 16. Related-skill composition — v2609.5.0

Root-signed retain/consolidate/retire decision and source bindings:
`tests/skill-boundaries-2026-09-27.md`. The current operator map lives only in
`references/skill-composition.md`. Keep specialist judgments separate, consolidate rolling
selection/consumption here, retire donor-first/cardinality routing and mandatory actor handoffs.
No skill added or deleted; no validator schema or runtime-enforcement claim changed.

Two independent Terra audits returned located genesis and evidence/proof/theory seams; root read
and adjudicated the findings. Follow-up review found the new reference missing from the build
inventory, a missing adequacy-gate qualification and a batch-only handoff; all three were repaired.
The second reviewer confirmed the section-authority boundary and requested clarification that
choosing a test does not adopt a candidate; the composition now says so explicitly.

S54–S58 and reciprocal trigger cases cover the changed seams. Structural checks and semantic
review are not a live R&D trial; no general throughput or initiative improvement is claimed.

A fresh Terra worker read only the three descriptions for ten routing prompts. Nine had the
expected owner; the observation-only seed case was ambiguous. Root made observation/account/
constraint explicit in forging's description. The targeted repeat routed that case to forging
when transformation was requested and retained forming for explanation; TRANSFER still required donors.
This was a description-level check, not tool-backed execution of the research loop.

Verification: hypothesis-check self-test passed (19 bad-packet findings, three good packets clean);
existing candidate checker suite passed 35 tests/156 assertions. No checker changed.
Collection floor passed 73 skills/64,628 charged characters under the unchanged ceiling.
BIBIFI and forming core/reference warnings zero; forging reference debt 32→31 with scoped waiver
in its ledger. `git diff --check` and the skills index passed.

## 17. Family-level MECE consolidation — v2609.6.0

Decision, coverage and scoped prose-debt waivers: `tests/research-family-mece-2026-09-27.md`.
The collection map is agents/skills/README.md, Research responsibility map; composition links it
instead of maintaining another table. This revision consolidates generic execution into BIBIFI,
retires automatic use of the legacy router and separates local content from programme authority.
It preserves theory, proof, corpus, evidence, candidate, commitment and control decisions as distinct owners.

Two bounded reviewers checked the content and execution seams; root consumed findings before revising.
A fresh reader checked fifteen task routes without reading the map, tests or ledgers. All reached
the intended owner(s); formal-section resumption and next-lemma work were correctly conditional on
existing authority and selection versus proof purpose. This is a semantic desk check, not live auto-trigger proof.
A targeted openings-description recheck separated corpus specification from local work selection;
root clarified that this skill writes the retiring observation of an unselected opening. Proof work
remains owned by proving-theorems; its name need not be repeated in every unrelated description.

The family lexical suite was red before the patch (three stale groups) and now passes ten tests.
Description-size enforcement stays with the common floor and unchanged aggregate ceiling.
The authored Markdown gate and skills index pass. No R&D throughput gain is claimed from these checks.

## 18. Bound budgets and useful concurrency — v2609.7.0

Source and bounded audit: `tests/postmortem-2026-09-28-contention.md` (801lines, source digest there).
Root retained the discovery objective and replaced envelope inflation with cap provenance and
pre-admission comparison. Targets, hard caps, launch allowances and absolute ticket deadlines are distinct.
P7 retains stop/release ownership. Queued retries have an interval, finite attempts and the same
absolute expiry; repeated admission failures cannot hold a worker indefinitely.
Compute concurrency is selected by useful returns and critical headroom, not utilization or job-count targets.
Independent agent reasoning remains available within actual host limits; no fixed single-GPU-job policy is introduced.

Terra's bounded semantic review found an unspecified polling budget and a phrase implying automatic
P7 comparison. Root fixed both. The proposal to extend runtime schema enforcement is not implemented
in this skill-only revision; current runner limits and the missing upstream-budget check stay explicit.

A fresh Terra worker inspected real isolated state/jobs/resources files and current skill files,
then wrote a prelaunch decision. It rejected the177minute/21600second side job and protected the
critical resource bundle, but incorrectly treated the120second target as a hard cap and withheld
independent source work without an identified conflicting phase. Root read the artifact and marked
the trial FAILED. The original artifact is preserved with SHA256
b6315b429c44102083cac849be0f3fe83e17be6f450dd20ba61f6126b200e644.
Root clarified those distinctions in the core and added S70–S71 before a targeted repeat.
The repeat is informed by the failure, not a fresh blind comparison; no before/after throughput claim is valid.
S61–S69 separately cover cap inflation, remaining allowance, contention, starvation and policy drift.

Root read the targeted second artifact: it rejects the21600second envelope under the600second cap,
protects4.5GiB of the4.8GiB available VRAM, keeps independent source work ready subject to actual
host fit, and distinguishes estimated t+120return from t+180ticket expiry and the120second launch allowance.
Second artifact SHA256e43c3f40dbe5b4fb6ae3cf57d1507f27df19a55c26512f53c0f7e3f6d7534468;
fixture/returns are under /tmp/bibifi-contention-review.BZ6FD2. The corrected decision passed
root read-back; neither pass is a real job admission/stop trial and the initial failure remains recorded.

Verification: target BIBIFI core/reference warnings zero; P7's13existing reference warnings retained
under its scoped waiver. Collection floor passes73skills/64,059charged characters, unchanged budget/listing.
Index, diff whitespace and installed skill wiring pass. No runtime policy, launcher schema or live job was changed.

## 19. Parent intervention rather than private queues — v2609.8.0

Root-signed source audit, scope and frozen criteria: `tests/postmortem-2026-09-30-parent-loop.md`.
Baseline97f2ab7 already required C0 intervention. This reforge removes the contradictory inspection
quota, separates operational readiness from independent verification, and replaces arbitrary
component-size thresholds with consumed first-return units across theory/build/integration/launch.
Future evidence-dependent work stays in a conditional parent backlog; guarded preauthorized
branches still self-run after checking current evidence, priority, capacity and remaining lifetime.

Independent Terra review found three boundary risks: readiness interpreted as semantic verification,
an incomplete self-run predicate, and narrow regressions overstated as final release. Root corrected
all three in C0/core. No role/model policy, scheduler, runtime schema or research source corpus changed.

**Actual OLD/NEW coordination.** Snapshot OLD from97f2ab7 before edits. Two fresh Terra coordinators
received separate same-shape fixture directories and actual preassigned file workers. Each read v1
and wrote an initial inspection before root delivered v2. Both observed the old worker's bounded
return, rebriefed it through the real follow-up tool, read the new artifact and accepted its actual hash.
The original declaration/payload and hash remain in initial-inspection.md; the worker then rewrote its current file to v2.
Final artifacts in both arms have SHA2566cc8d2215e70e9c6ecd69b4fa93552b0113b4f0626e6949cca3458f986f4b08d.
Root read both actual acceptance files: OLD c7b085d1e2253fed46467871557fe5e5137948291b2706b17583808880f4bf2b,
NEW72e4d3c299ea613b2f45e21c741825cc90d76d4ffa2530f6be3559fd6d6384bf.
This is a tie on current-artifact consumption, not evidence that NEW generally improves initiative.
Both classified the rejected readiness input as failed, not running; NEW also reported an allowed
readiness command exiting0. Root separately observed invalid env arguments exit125 and env/true exit0.

The initial workers returned after their60second bounded waits, before the contract revision was
consumed; no active interruption was needed for that comparison. Root separately resumed NEW's
worker for a45second file-only interruption probe, waited for a real partial witness, called
interrupt_agent (previous_status running), and observed agent_status interrupted via list_agents.
The v2 artifact hash remained unchanged. There was no child process or compute reservation;
this cannot certify GPU cleanup or P7 timeout enforcement. Fixture: /tmp/parent-loop-rehearsal.UgNiJ2.

The NEW arm read the initial revised core/C0; later review clarifications tightened scientific
scope and preauthorized-branch guards. Those final clauses were statically reviewed, not replayed
as new scientific tasks. S72–S76 and coordination-cases cover their required decisions.
No live Firedancer change or real discovery/time measurement was made. Runtime automatic
enforcement of parent intervention remains unverified; a written rule is not a runtime guard.

## 20. Reorganize useful-work selection — v2609.9.0

Source and scoped audit: `tests/postmortem-2026-09-30-ready-work.md`; baseline002d66d.
Replace scattered parallelism/idle-search prose with one core six-step loop before microticket construction.
Microticket patterns retain concrete dependency cuts and queue mechanics; scientific-loop owns the
intervention-to-observable check; P7 receives proposed slices and returns actual resource constraints.
Execution, claim, writer, optional-feature and worker-queue dependencies are explicitly distinguished.
Independent useful work and critical headroom are evaluated together; neither idle filling nor blanket throttling wins.

Terra audit identified duplicate scheduling homes and circular/serializing risks. Final review found
the explicit evidence binding and P7 admission could be lost during consolidation; root restored both.
The suggested closed candidate-list restriction was not adopted: current authorized open questions
may yield new grounded slices, but free capacity cannot invent an objective or replace evidence.
Reachability is not a prove-success gate. An unbuilt mechanism gets an intended path/first witness;
a valid experiment may return a genuine null. Scientific interpretation retains its evidence owner.

**File-backed staged trial.** Snapshot OLD before editing; fresh OLD/NEW Terra workers receive the
same task/path/release/capacity files and disjoint output directories, without expected answers.
Both inspect the files and produce a current scoped finding: C changes B while f reads only A,
so this preserved path cannot identify C's effect on f. Neither waits for full integration or launches filler.
After capacity changes from spare to fully reserved by critical work, both read the updated resource
file and write a revised decision that defers extra compute while retaining useful file-only work.
Root reads both stages back. This is a tie on the checked choices, not a demonstrated throughput gain.
The trial permits no actual GPU/numerical launch; admission and real contention performance are not tested.
Root's later provenance/admission wording clarifications are statically checked, not a new blind trial.

Fixture: /tmp/bibifi-work-selection.DFWsyn. Artifact SHA256:
- OLD initial b96017e4e55e92ce823e61c1a348866c978a1b09199186f0f70306110f9c804c;
- OLD update956204d3aa239b39b4fb81b53fa8f3f7d837730b242bf7a4d7475b900e1bc1b1;
- NEW initial a2d63e7e5e1f094ef681780b5e5b643aa56a9d6f791d7c25d33ac5ff43e193eb;
- NEW update aa395e895cb07346f503ea8fe36dbb7b365fa88e41b09e70d6df0d2f6119cbfd.

S77–S83 cover spare capacity, real blockers, contention, masked effects, honest nulls, feature
authority and unexplained fixed concurrency. Core243lines versus248; microticket reference79 versus95.
Target core/reference prose warnings zero; collection membership/listing/ceiling unchanged.
No new skill, scheduler, runtime schema or production job mutation is included.

## 21. Consume complete GPU path cost — v2609.9.1

GPU optimization tickets return complete train/infer accounting before this loop selects the next
speed slice. A normalized ratio increase or inference-only gain cannot close a learning-throughput target.
GPU craft owns work/span, design and profiling; EV3 owns comparison meaning. Their full revision
and file-backed verification live in optimizing-julia-gpu-kernels/tests/postmortem-2026-09-30-design.md
and its forge ledger. This pointer adds no new scheduling rule, runtime gate or scientific result.

## 22. Workload budgets and exact closure — v2609.10.0

The clock now explicitly covers official numerical confirmation, with exceptions bound to actual authority.
Labels cannot change budgets; authorized domain policy cannot relax an active user cap.
The existing work card carries workload/exception source and the obligation closed or consumer check still open.
EV3 owns closure meaning; P7 owns resource feasibility and observation. No duplicate result store is added.
S84–S88 cover relabeling, scoped explicit authorization, incomplete VRAM telemetry and check-only ADMIT.

Source/audit and paired file/check-only rehearsal:
validating-experimental-evidence/tests/postmortem-2026-09-30-boundaries.md and its forge ledger.
OLD and NEW made the same eight substantive decisions. Both withheld the over-budget launch even though
the real runner's check-only accepted its envelope. No throughput or runtime-enforcement improvement is claimed.
Descriptions/listing budget are unchanged. Scoped floor adds no core/reference warning.

## 23. Outcome admission before allocation — v2610.3.0

Source and limits: `tests/postmortem-2026-10-01-target-drift.md` now joins three
user-supplied report snapshots. The episode was active and the source was one-sided.
The target-specific function remains authorized outcome + current evidence →
select → execute → consume. Its artifact remains the existing iteration plan/log.
EV0–EV4 retain claim meaning; C1/C3a retain dispatch and writer identity.

The preceding v2610.2.0 retired `references/target-benchmark-loop.md`. Its work-selection
rows now live in the core decision loop and `references/microticket-patterns.md`;
its evidence-meaning prose was removed in favor of the EV owner. The core and
asset no longer require six-minute status reports. Six minutes still bounds the
first useful return, while external updates follow results, blockers or user
requests. No cron, second score store or new skill is admitted (F2/F4).

The earlier source showed two further misses: a toy conformance suite missed the
registered adapter path, and a blank replacement lost a prior working mechanism.
The predecessor rule and microticket pattern now demand a same-path carryover
witness before optimization. This is an engineering transfer obligation; an
ineligible predecessor does not become a current-concept achievement.

The follow-on source exposed a remaining design defect: independent work was
enumerated before its purpose and first return were admitted. “Useful” was an
unchecked adjective, and the six-minute rule appeared later in the manual.
v2610.3.0 replaces startup, scientific-direction and allocation prose with one
ordered admission table: outcome/constraints → purpose → first return → reuse/path
→ resource fit → consumption. The compact card now follows that same order.
The parent inspection is absolute, and a missed return blocks dependent successors.
A speculative success no longer supplies an unconditional release ETA.

Domain review found overgeneralization in unconditional predecessor preservation,
GPU selection and no-update controls. Device policy is inherited from the task;
carryover needs a declared obligation; no-update applies to learning claims.
CPU-only benchmarks, theorem work and explicitly changed designs retain their own
success conditions. No framework, precision, benchmark name or fixed model design
from the source becomes a shared operating requirement.

Static checks: revised S14/S28/S34/S72 and D13/D35–D39, plus F1/F5/F12/N11.
They test long-container relabeling, purpose-free side work, device substitution,
conditional ETA and domain near misses. No live OLD/NEW execution was performed.
Operational improvement and runtime enforcement remain unverified; current floor,
budget and installation receipts are recorded in the implementation turn.
