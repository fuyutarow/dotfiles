# Ledger and calibration

> **SOLE owner:** T1–T4 fields, risk tiers, error classes, exceptions, and acceptance.
> T0 fields live in `architecture-decisions.md`; promotion lives in `rd-and-language-translation.md`.

## Admission

Choose the smallest tier that covers the actual consequence.

| Tier | Condition | Required work |
|---|---|---|
| Low | Disposable sketch with no trusted consumer | Domain checks; no release ledger |
| Medium | Retained component or result guiding a decision | Selected contracts and targeted checks |
| High | Durable state, costly work, irreversible effect, or material safety/financial exposure | Complete affected rows, independent checks, residual-risk decision |

An explicit Tiger design request can start T0 at any tier.
Use provisional workload assumptions when necessary; do not invent a consequence to justify paperwork.

## T1 — record the consequence

```text
ledger_id:
scope:
risk_tier: Low | Medium | High
failure_mode:
why_now:
accepted_outcome:
assessment_scope: design-only | implemented-boundary
design_ids_or_existing_design_locus:
release_or_use_decision: proposed or accepted use, with responsible owner
```

Name a concrete loss, corruption, misleading result, or resource waste.
For an existing design, link its locus and affected boundary.
For a cross-component change, complete the relevant T0 map before adding detailed assertions.

## T2 — connect decisions to obligations

| Field | Required content | Invalid substitute |
|---|---|---|
| `row_id` | Stable local identifier | Renumbering every review |
| `design_id_or_existing_design_locus` | T0 choice or affected current boundary | Unrelated design document |
| `invariant` | Positive observable condition | “Correctness” |
| `negative_case` | Consequential violation or transition | “Bad input” |
| `bound` | Unit, scope, justified limit or proof obligation, overrun condition | Folklore number |
| `handling` | Observable rejection, propagation, recovery, or fail-fast policy | “Handle error” |
| `evidence` | Check plan or observed result, explicitly distinguished | Author confidence |
| `check_status` | planned / observed-pass / observed-fail / unavailable | Green despite never running |
| `owner` | Role responsible for interpreting failure and disposition | Nobody assigned |

Use these fields for an observation:

```text
command_or_locus:
raw_result:
observed_at:
independence_note:
```

Positive space names accepted states, units, order, and ownership.
Negative space names a distinct event that threatens the contract.
For example: a lease belongs to one generation; an older generation's late completion must be rejected.
Do not demand exhaustive enumeration of arbitrary invalid values.

One check can support several rows only if it actually exercises each stated property.
Link both the enforcement locus and the check where a property crosses component boundaries.
A test of one handler does not close an untested acknowledgment or replay path.

For a material performance revision accepted through this ledger, create separate T2 rows
for speed and semantics.
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

## T3 — exceptions

Use an exception only to weaken a specific material obligation.

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

## T4 — acceptance

A command alone is a test plan.
Close a row with an observed result or inspected locus that establishes the claimed property.
For that material performance revision, T4 observes speed and semantics on the same workload.
Use the predeclared speed floor and semantic oracle. Use an exact oracle for a bit-preserving
change. Otherwise freeze a justified tolerance or behavior relation before the run.
Do not trade a semantic failure for a speed PASS, or count unchanged output as a speed PASS.
When either observation is an experimental benchmark result, link its
`validating-experimental-evidence` disposition. A quarantined or incomparable score
cannot close the corresponding T4 obligation.
For High-tier boundaries, seek a check independent of the authoring path or context.
Examples include consumer validation, replay, fault injection, or an independently specified oracle.
Record any missing independent check as an open row or explicitly accepted exception.

| Decision | Conditions | Next action |
|---|---|---|
| DESIGN-READY | T0 choices, assumptions, and planned checks are explicit | Handoff for implementation; no runtime or release claim |
| PASS | T1–T4 close the stated scope; material rows have observations or valid accepted exceptions | Handoff evidence and residual risks to the use/release owner |
| STOP | Contradiction, incomplete material contract, or invalid exception | Withhold acceptance of the affected claim; resolve the missing evidence |
| HAND-OFF | Remaining work belongs to language, implementation, or experiment design | Pass the affected design/row IDs to that owner |

PASS is scoped to the inspected boundary, not the entire software system.
Model agreement, coverage alone, or a same-context generated test alone cannot establish independent closure.
Keep authorized reversible work moving while acceptance remains open.
This ledger does not create deployment authority or a new user-approval requirement.
