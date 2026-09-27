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
