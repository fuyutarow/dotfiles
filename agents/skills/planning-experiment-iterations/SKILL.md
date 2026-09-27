---
name: planning-experiment-iterations
description: >-
  Plans ONE bounded research iteration: readiness, oracle scope, discriminating outcomes,
  minimal scale, GPU-first phase costs, and the next decision. Use for 実験計画, 次の実験,
  6分報告, 最小実験, 空き資源. Owns ITERATION_PLAN/LOG; diagnosis before dependent mechanism tests.
  PURPOSE: admission→directing-research-sections; costly bet→acting-on-hypotheses;
  evidence validity→validating-experimental-evidence; envelopes→orchestrating-agents.
  Workflow-native: planning and interpretation stay solo; independent checks may fan out.
  English skill; respond in the user's language.
---

# Planning experiment iterations

> **Version**: v2609.1.2 (2026-09-27) — goal-linked repairs and dependency-aware launch queues.

```bash
test -f assets/ITERATION-PLAN.md
test -f tests/triggers.md
test -f tests/decision-cases.md
test -f tests/postmortem-2026-09-27.md
test -f tests/postmortem-2026-09-27-followup.md
test -f tests/forge-verification-ledger.md
bun ../forging-skills/scripts/skill-check.ts .
```

## LAW — maximize decision-changing valid learning per wall time

> Name the decision a result can change, then test its earliest unresolved prerequisite.
> Instrument repair, a narrowed cause, and an inconclusive result can all be useful outcomes.
> Hypothesis counts, records, occupied slots, and GPU utilization are not the objective.
> Freeze the plan before launch; accept only the conclusion its outcome table licenses.

Keep `ITERATION_PLAN`, `ITERATION_LOG`, `READINESS`, `ORACLE`, and `OUTCOMES` as stable field names.

## Function map — SOLE owner

| Input state | Verb | Owned artifact | Next state / stop |
|---|---|---|---|
| Evidence + decision + unresolved prerequisite | plan | `ITERATION_PLAN` (`assets/ITERATION-PLAN.md`) | ready for domain admission, or prerequisite repair |
| Terminal receipt, cap hit, or breach | record | `ITERATION_LOG` | next plan cites this entry |

Use these as fields in the project's existing run intent and finding, not a second record store.
This skill owns test selection and shape. Admission, raw receipts, and evidence validity retain their owners.

## Gates — each leaves a field in the row

| Gate | Decision | Required field | Fail → |
|---|---|---|---|
| I0 DECISION | Retrieve prior results; bind the requested acceptance condition, decision, and blocking prerequisite | `FROM_EVIDENCE`, `GOAL_LINK`, `DECISION`, `KIND`, `READINESS` | Missing validity prerequisite → diagnostic first; off-goal work → defer |
| I1 DISCRIMINATE | Predict the same observable under rivals and their auxiliary assumptions | `RIVALS`, `PREDICTIONS`, `OUTCOMES` | No decision-changing outcome → redesign |
| I2 ORACLE | Compute an applicable cheap oracle before its dependent learner test | `ORACLE`: type, scope, assumptions, value and locator; or `NONE` with reason | Unmatched scope → oracle diagnosis, no theory verdict |
| I3 BOX | Use the smallest scale that separates predictions with justified uncertainty | `SCALE_BASIS`, `PHASE_COSTS`, `TARGET_WALL_S`, `CAP_S` | No feasible discriminator within cap → report limit; do not shrink into a meaningless test |
| I4 FREEZE | Pin executed inputs, baseline, controls, tolerances, and resource plan | `BINDING`, `BASELINE`, `CONTROL`, `CRITERION`, `DEVICE`, `PLANNED` | Change → new plan ID; retain old result and its scope |
| I5 DISPATCH | Resolve the project's launch path and dependency condition; obtain required owner receipts | `OWNER`, `LAUNCH_PATH`, `LAUNCH_WHEN`, `ADMISSION`, `ENVELOPE`, `DEADLINE`, `STOP_IF`, `HAND_BACK` | Missing authority or unmet dependency → no launch; no launch receipt → not running |
| I6 RECORD | Apply the frozen outcome table after evidence validation; record peak and release | `ITERATION_LOG` | Invalid or inconclusive → no scientific elimination; next row cites the limitation |

## Readiness and oracle scope (I0–I2)

| Condition | Next action |
|---|---|
| Baseline, reference, adapter, or reveal order is suspect | `KIND: DIAGNOSTIC`. Name the failed/unknown check and the observation that closes it. Pause only tests depending on it |
| A mechanism comparison is ready | `KIND: MECHANISM`. Cite passing prerequisite receipts for the exact binding; require a same-stream baseline |
| Minimal valid evidence supports a registered claim | `KIND: CONFIRMATION`. Check the claim's required suite and controls through its domain owner; smoke does not establish suite coverage |
| Proposed work repeats a historical result | Cite the old result and the changed contract or unresolved question before spending a run |

`GOAL_LINK` names the user's acceptance condition and the next check this iteration enables.
For unresolved requested conformance, name an implementation owner, dependency, and acceptance test.
A claim that compliance is possible does not close that requirement.
Before extending a repair chain, compare its remaining cost with an already-valid path to the same goal.
Record the repair's exit/reconsideration condition; do not make a full port an automatic prerequisite.
Instrument learning remains useful, but does not count as measured capability or conformance improvement.

`READINESS` cites `validating-experimental-evidence` checks; it does not duplicate their verdict store.
A diagnostic may run on a broken path to locate the break. It cannot establish the downstream mechanism.
For a retained implementation's consequential invariant or resource failure, hand repair to
`practicing-tiger-style` and `implementing-and-debugging`; writing a ledger does not close a failed check.

| `ORACLE` type | Permitted use |
|---|---|
| Exact expected output | Compare on the specified input, state, and scoring positions |
| Achievable reference | Predict learner performance only with a matching hypothesis class and applicable learning/regret bound |
| Upper/lower bound | Preserve the inequality direction; being below an upper bound is not a bug |
| Heuristic prediction | Treat mismatch as an anomaly; no theorem refutation |

Bind observable inputs, reveal order, episode reset, hypothesis family, depth, and scored window.
A privileged oracle may establish possibility, not learnability from the learner's information.
An oracle omitting gates, aggregation, or composition needs a transfer argument before bounding a richer learner.
Derive the margin from a bound or uncertainty model; do not invent a universal tolerance or chance-floor assertion.

## Outcome table (I1, I6)

Before launch, map each result region to: assumptions needed → scoped exclusion → next action.
Include overlap/inconclusive, failed validity control, and timeout/breach regions.
Rivals may coexist; do not force mutually exclusive or exhaustive causes.

| Observation | Inference limit |
|---|---|
| Another model succeeds through the runner | Excludes only a failure claimed to affect every model; model-specific paths remain open |
| Direct and adapter outputs differ | Localizes a path/state difference; does not exclude additional round or egress defects |
| A fix leaves output unchanged | Refutes that intervention as a sufficient repair on this witness; not every version of its cause |
| A subset of perturbations passes | Covers tested positions and perturbations only; a future-label test does not cover the current label |
| ON beats OFF but OFF fails its justified sanity check | Diagnose the baseline; no mechanism or scale promotion |
| A control misses its frozen interval in either direction | Record the miss; a positive gain is not a pass for a two-sided no-effect criterion |

Require absolute performance and mechanism-specific controls when the claim needs them.
For example, a capacity-matched sham arm can separate added voting capacity from a proposed inference rule.

## Scale and execution cost (I3–I5)

| If… | Then |
|---|---|
| Predictions separate beyond the justified margin at scale n | Use the smallest such n, depth, and family |
| No task budget is supplied | Default to about 120 s target and 600 s cap; include setup and teardown in planning |
| The cheapest useful test cannot fit the default cap | Route a justified exception to the domain/resource owners before launch; freeze the approved cap. Never override an explicit task limit |
| A pilot runs past the target | Locate the expensive phase before cutting scale or adding concurrency |
| The run hits its cap | Stop through the resource owner; retain partial data as incomplete, not a scientific negative |
| A minimal result meets all frozen controls and promotion criteria | Request registered-scale confirmation; freeze its scope and cap separately |
| The plan needs a parameter or seed sweep, a scale study, or a port | Route scale release to `directing-research-sections`; do not hide a battery inside this iteration |

| Device / phase condition | Action |
|---|---|
| A conforming GPU path exists for the tested code | Prefer GPU; apply the bounded diagnostic exception below only when task constraints permit |
| The subject is a CPU reference or data-only oracle | CPU is allowed; name that subject and its bounded cost |
| A bounded CPU diagnostic reaches the discriminator earlier, including queue/setup costs | Record phase-cost evidence and CPU-only inference scope; use it if the task permits. GPU performance/parity still requires GPU evidence |
| No conforming GPU path exists for a learner run | The GPU path becomes the critical-path prerequisite. Dispatch it, and write any new mechanism backend-generic from its first line. A learner run never falls back to CPU. "No GPU path" is not a `DEVICE_REASON` |
| The GPU path is unproven | Run a minimal diagnostic witness; expand coverage only when additional cases change the next decision |
| CPU preparation or compilation dominates | Separate reusable CPU references from GPU execution; consider bounded warm-process reuse before multiplying processes |

`PHASE_COSTS` covers queue/admission, CPU reference, compile, transfer, kernel, and record/teardown.
Use measured timings or mark estimates unknown and run a bounded pilot.
GPU-first selects the useful compute path; CPU exceptions never authorize an unbounded battery.
Reuse references only with matching code/config/data fingerprints; reset learner state between cases.
A warm process still needs per-case and whole-job caps, stop rules, and release receipts.

| Free-resource condition | Action |
|---|---|
| An admissible critical-path test fits RAM and VRAM | Plan its row |
| Nothing admissible is ready, or only off-path work is available | Idle is correct; name the missing prerequisite |
| Launches are denied while actual use is low | Inspect the denial: reservations, slots, locks, or gate state. Low utilization alone does not identify the cause |

While a run executes, prepare the next conditional branch or inspect its source and oracle.
Parallel arms require distinct discriminating contributions, fixed inputs, and independent mutable state.
Before a main-thread takeover, reconcile job IDs and ownership to prevent duplicate launches.
The planning row neither admits nor authorizes a run. `ADMISSION` cites the section/resource owners' required receipts.
Resolve `LAUNCH_PATH` through `validating-experimental-evidence` EV0; a resource runner is not launch authority.

## Queue the next experiment by dependency

Record `LAUNCH_WHEN` before dispatch. Preregistration alone does not make a successor independent.

| Successor relation | Allowed preparation / launch |
|---|---|
| Its choice, validity, or scale depends on a predecessor result | Prepare the conditional branch now; launch only after interpreting the required receipt |
| Fixed arms of one admitted comparison, with shared valid prerequisites | Arms may run before cross-arm analysis; preserve the frozen comparison and stop conditions |
| A separate useful question remains admissible under every predecessor outcome | May overlap within the resource budget; name that independent contribution |
| A shared prerequisite fails or its binding changes | Suspend dependent queued launches and quarantine affected results through the evidence owner |

An empty GPU queue never supplies the scientific reason for another run.

## Report (when the human set a cadence)

Order: decision changed and evidence limits → actual job/phase states → next row and resources → ETA.
Each ETA is `ontime`, `delta` (time moved), or `pivot` (goal/policy changed), with its reason and time zone.
Separate dispatched, admitted, running, and terminal states. No progress is fabricated to meet a report cadence.
When nothing changed, say so in one line.

## Deny-list

- Launch without applicable I0–I5 fields, or overwrite a frozen plan.
- Fill idle GPU or RAM with off-path work, or expand scale just to raise utilization.
- Choose CPU for a learner run without `DEVICE_REASON`.
- Raise a cap mid-run, or treat an OOM, breach, or invalid comparison as scientific refutation.
- Change a criterion after seeing its result, or broaden a scoped exclusion into a cause verdict.
- Choose the next test without citing prior evidence.
- Leave resources reserved after a run ends; miss a deadline without applying its stop/hand-back rule.

## Execution model

Planning and interpretation stay solo. The modal iteration needs no subagents.
Independent checks may fan out under `orchestrating-agents`; return bindings, raw receipts, and phase timings.
An agent's claimed PASS or root cause is not a substitute for those observations.
No harness → same map, serial.

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `directing-research-sections` | PURPOSE: mandate, admission, `RUN_INTENT`, and learning commit → there; test selection and shape → here. The existing reciprocal handoff consumes this row |
| `acting-on-hypotheses` | DECISIVE: costly or hard-to-reverse action → there; bounded reversible test → here |
| `forming-hypotheses-from-anomalies` | Sequential: anomaly with no explanation → there; explanation plus alternatives → here |
| `validating-experimental-evidence` | PURPOSE: measurement validity, footing, and claim scope → there; planning consumes its prerequisite checks and terminal disposition |
| `orchestrating-agents` | Mechanics: envelopes, admission, reservations, stop/release, delegation → there. Deadline controls resources, not Director research content |
| `optimizing-julia-gpu-kernels` | Kernel correctness and speed → there; device and phase plan for one test → here |

Other owners keep their existing artifacts; this skill only consumes their results.

## MUST NOT FIRE

| Ask | Route |
|---|---|
| "Should we commit the quarter to approach X?" | `acting-on-hypotheses` |
| "Design the whole research programme" | `supervising-research-programmes` |
| "Is this benchmark score leaking?" | `validating-experimental-evidence` |
| "Write the resource.json for this job" | `orchestrating-agents` |
| "Why is this kernel slow?" | `optimizing-julia-gpu-kernels` |

## Verification material

| File | Covers | Read when |
|---|---|---|
| `assets/ITERATION-PLAN.md` | Plan and result fields in the canonical record | Planning a run |
| `tests/triggers.md` | Fire/no-fire and ordered co-fire | Changing scope |
| `tests/decision-cases.md` | Adversarial planning and interpretation cases | Verifying a reforge |
| `tests/postmortem-2026-09-27.md` | Bounded episode audit and source limits | Auditing provenance |
| `tests/postmortem-2026-09-27-followup.md` | Overlapping follow-up audit and cross-skill repair map | Auditing later failures |
| `tests/forge-verification-ledger.md` | Source grades, design decisions, checks and waivers | Reforging |
