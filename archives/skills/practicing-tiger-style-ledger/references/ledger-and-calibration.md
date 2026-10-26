# Ledger and calibration

> **SOLE owner:** T1–T4 fields, risk tiers, error classes, exceptions, and acceptance.
> T0 fields live in `architecture-decisions.md`; promotion lives in `rd-and-language-translation.md`.

## Risk classification

Classify the affected failure consequence, not the technology or the whole repository.
Evaluate these rules in order; the first established match wins:

1. **High:** failure can destroy the sole recoverable copy of trusted state.
   Other High triggers are external effects beyond the rollback/reconciliation contract,
   safety/financial violations, or exceeding a declared non-disposable resource budget.
   Record the triggering loss and its contract.
   Complete all selected rows and an independent check for each High consequence.
2. **Low:** all outputs are disposable and no consumer relies on them.
   No state/effect survives disposal; execution stays within an explicit disposable budget.
   All these conditions must hold. Use domain checks; no release ledger.
   An explicit Tiger design/review may still use a compact record.
3. **Medium:** neither rule above applies.
   The component is retained or a consumer relies on its result.
   Both conditions must hold.
   Complete all selected rows and targeted checks.
   An independent check is optional unless the governing requirement demands one.

If a classification fact is unknown, record `risk_tier: unresolved` and the missing fact.
Proceed with scoped inspection/design and check plans.
Withhold implementation acceptance until classification is resolved.
Evidence is OPEN unless an uncovered observed violation takes precedence as STOP.
Do not default to Low or High. A disk cache rebuilt from trusted inputs can be Medium;
mere persistence does not make it High. A nominally disposable experiment with irreversible external effects is High.
Containment must be established, not assumed from the word "cache" or "prototype".

Tier changes verification strength, not whether selected contracts need evidence.
Distinguish a capacity limit from the allowed consequence of exceeding it.
A cache entry cap alone is not a High-tier loss budget.
For the resource trigger, name the declared non-disposable loss/exposure budget and the loss of exceeding it.
Task mode and applicable constraints are selected by `SKILL.md`; they are not determined by tier.
An explicit Tiger design request can start at any tier using labeled workload assumptions.

## T1 — record the consequence

```text
ledger_id:
scope:
risk_tier: Low | Medium | High | unresolved
failure_mode:
why_now:
accepted_outcome:
task_mode: Design | Review | Change
assessment_scope: design-only | implemented-boundary
design_ids_or_existing_design_locus:
release_or_use_decision: proposed or accepted use, with responsible owner
```

Name a concrete loss, corruption, misleading result, or resource waste.
Use the existing response/document as the record. Compact prose can carry these fields.
T0–T4 name record sections, not a mandatory execution order.
For an existing design, link its locus and affected boundary.
For a cross-component change, complete the relevant T0 map before adding detailed assertions.

## T2 — connect decisions to obligations

| Field | Required content | Invalid substitute |
|---|---|---|
| `row_id` | Stable local identifier for multiple/coupled rows; omit for one unambiguous local requirement | Renumbering every review |
| `design_id_or_existing_design_locus` | T0 choice or affected current boundary | Unrelated design document |
| `invariant` | Positive observable condition | “Correctness” |
| `negative_case` | Consequential violation or transition | “Bad input” |
| `bound` | For capacity/performance: unit, scope, justified limit and overrun condition. Otherwise a logical predicate/proof obligation; no numeric limit required | Folklore number |
| `handling` | Observable rejection, propagation, recovery, or fail-fast policy | “Handle error” |
| `evidence` | Check plan or observed result, explicitly distinguished | Author confidence |
| `check_status` | planned / observed-pass / observed-fail / unavailable | Green despite never running |
| `owner` | Role responsible for interpreting failure and disposition | Nobody assigned |
| `depends_on` | Material design/row dependencies, or none with reason; compact prose suffices | Treating coupled capacity and memory rows as independent |

Use these fields for an observation:

```text
command_or_locus:
implementation_locus_or_digest: # Immutable revision, snapshot, or content digest
workload_identity: # Inputs, shape, limits or contract that bound this observation
raw_result:
observed_at:
independence_note:
```

Both identities are required for an observed check closing an implemented-boundary row.
For static inspection, cite the versioned source and inspected scope in those fields.
A design-only plan may use an explicit N/A reason; it cannot close a runtime obligation.

Positive space names accepted states, units, order, and ownership.
Negative space names a distinct event that threatens the contract.
For example: a lease belongs to one generation; an older generation's late completion must be rejected.
Do not demand exhaustive enumeration of arbitrary invalid values.

One check can support several rows only if it actually exercises each stated property.
Link both the enforcement locus and the check where a property crosses component boundaries.
A test of one handler does not close an untested acknowledgment or replay path.

For conformance, cite the governing requirement/version separately from the test that checks it.
Record a predicate/oracle distinguishing satisfaction from violation, using a bounded test or checkable argument.
At a reject/accept boundary, also record a known violating case and its expected rejection.
Name untested clauses. A static name/type scan cannot close an unrelated behavioral or scaling obligation.
Resolve meaning from the governing requirement. If ambiguity remains, state competing readings and a scoped interpretation.
Withhold unqualified strict conformance; seek an owner's decision only when an authoritative choice is needed.
Authorized bounded investigation and scoped assessment may continue while the ambiguity is open.

An origin citation for a parameter does not justify its chosen value in this workload.
Record whether that value is mandated, derived with assumptions, empirically selected, or an explicit design choice.
A comment naming a theory is not a derivation, and moving a literal into configuration does not establish necessity.

For a material performance revision, separate speed and semantics into distinct T2 rows.
State what output must be preserved. State the comparison workload, metric, unit,
threshold, and oracle before changing code. A previous implementation's speed is context,
not a cost bound. The language or device skill derives the platform-specific work budget.
This ledger links to that budget; it does not copy the method.

## Choose handling by error class

| Class | Example | Disposition |
|---|---|---|
| Programmer error | Internal impossible state under the declared contract | Appropriate fail-fast with diagnostic context |
| Operational error | Timeout, conflict, exhausted capacity, malformed external input, cancellation | Propagate, bounded retry, compensate, quarantine, or visibly fail |
| Expected experimental failure | Deliberately explored unstable region | Tag and preserve under the experiment protocol |

Choose the class from the contract, not the exception's name.
Do not crash on every operational failure or silently continue after an internal contradiction.

If an operation can write derived or speculative state before detecting invalid input, name the recovery boundary.
Stopping future writes does not remove prior writes or their dependent effects.
Choose containment: staged publication, provenance-based invalidation, checkpoint/replay, or quarantine.
Test a late-detected contradiction after at least one dependent write, then exercise subsequent reads or predictions.
Preserve trusted observations or explain their reconstruction.
Disabling a rule does not establish recovery of baseline state.
Link invalidated claims to `validating-experimental-evidence`.
This ledger owns state recovery, not result retraction.

## T3 — exceptions

Use an exception only to weaken a specific material obligation.
Without a proposed exception, record `exceptions: none` and omit the fields below.
An untested check is an open obligation, not an automatic request for a waiver.

```text
exception_id:
row_id:
reason_and_tradeoff:
compensating_observation_or_containment:
risk_owner:
reversal_trigger:
expiry_or_review_date:
decision_locus:
```

Reject ownerless or perpetual exceptions.
At expiry, stop the affected trusted use or renew with fresh evidence.
A changed workload, shared API, durable output, or larger budget reopens the affected rows.
Do not silently turn an experiment's provisional choice into a production guarantee.

A test allowlist, expected-failure annotation or waiver does not amend the governing requirement by itself.
An accepted exception may permit a scoped use; still report the original unmet clause and exception locus.
Do not claim strict conformance to the original requirement from checks of a relaxed contract.
If the requirement explicitly permits no exceptions, the evaluator cannot create one to make its test green.

## T4 — acceptance

A command alone is a test plan.
In Design mode, completing a check plan suffices for the design deliverable.
It does not close an implementation obligation.
Close a row with an observed result or inspected locus that establishes the claimed property.
An observed PASS applies to its recorded implementation, enforcement boundary, and workload.
When a decision, layout, bound, or code path changes, revisit the changed property and its material dependencies.
Reopen affected rows before trusted use; preserve previous observations under their original identities.
Carry an unaffected check forward only with old/new identities and an unchanged enforcement/assumption basis.
This need not rerun every check, but “one row fixed” cannot certify dependent memory or semantic obligations.
If an obligation is replaced, link its successor and observe the new enforcement boundary before closure.
For that material performance revision, T4 observes speed and semantics on the same workload.
Use the predeclared speed floor and semantic oracle. Use an exact oracle for a bit-preserving
change. Otherwise freeze a justified tolerance or behavior relation before the run.
Do not trade a semantic failure for a speed PASS, or count unchanged output as a speed PASS.
When either observation is an experimental benchmark result, link its
`validating-experimental-evidence` disposition. A quarantined or incomparable score
cannot close the corresponding T4 obligation.
For each selected High-tier consequence, require a check independent of the authoring path or context.
Examples include consumer validation, replay, fault injection, or an independently specified oracle.
Record any missing independent check as an open row or explicitly accepted exception.
Independence comes from the oracle or failure path, not merely another model/context or test filename.
State what can falsify the implementation without copying its reasoning.

## Completion and reporting

First determine whether the requested deliverable is complete:

| Mode | Finish when | Work that may remain open |
|---|---|---|
| Design | Each selected constraint has a proposal or explicit unresolved decision, enforcement/check plan, and next action | Implementation observations and unresolved workload assumptions |
| Review | Each selected constraint has inspected evidence, a finding or coverage statement, and a clearing check for every gap | Repairs, absent evidence, and release acceptance |
| Change | Authorized changes are implemented and applicable checks run; unavailable checks or external blockers have concrete reasons and next actions | Acceptance blocked by unavailable evidence; do not stop at a plan when authorized implementation is possible |

Then report separate axes. A review with findings is a completed review, not a failed task.

**Design readiness:** DESIGN-READY requires enforcement proposals and check plans for every selected constraint.
Assumed workload values are allowed when their validity range and resolving measurement are explicit.
An unresolved state owner, recovery policy, applicability decision, or risk classification makes readiness OPEN.
DESIGN-READY says implementation can proceed under the stated assumptions; it gives no runtime guarantee.

**Implementation evidence:** choose one aggregate status for the stated scope, in this order.
Keep individual observations intact, including observed failures on waived rows.

1. **STOP:** an observed violation/contradiction is not covered by a valid accepted exception.
   An expired or invalid exception cannot cover a known violation.
2. **OPEN:** no uncovered observed violation remains, but something required is missing or stale.
   This includes classification, contracts, applicable coverage, and evidence.
   A proposed exception is not accepted.
   Missing checks remain OPEN unless a valid exception explicitly covers them.
3. **ACCEPTED-WITH-EXCEPTIONS:** no uncovered violation or evidence gap remains.
   At least one selected obligation has a valid accepted exception.
   Name the unmet clause, use scope, risk owner, containment, expiry, and exception locus.
   This is not strict conformance.
4. **PASS:** every selected requirement has sufficient observed support.
   Required independent checks exist and no selected obligation is waived.

Absent implementation observations normally mean OPEN, even with DESIGN-READY.
Static inspection/proof can close only the properties it establishes; state all untested runtime clauses.
Never aggregate PASS from an empty selection.
Explain no applicable constraint and finish without a conformance assessment.

**Next action:** name the concrete repair, implementation, measurement, or handoff and its responsible owner.
HAND-OFF is an action, not an evidence status. PASS and handoff can coexist.
STOP withholds acceptance of the affected claim; it does not forbid reversible investigation or a requested repair.

PASS is scoped to the inspected boundary, implementation, workload, and selected requirements.
It does not assess the entire software system.
Model agreement, coverage alone, or a same-context generated test alone cannot establish independent closure.
Keep authorized reversible work moving while acceptance remains open.
This ledger does not create deployment authority or a new user-approval requirement.
