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
