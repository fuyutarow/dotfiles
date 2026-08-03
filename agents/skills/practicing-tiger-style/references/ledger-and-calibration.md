# Ledger and calibration — the executable cross-language contract

> **Scope / SOLE declaration:** This is the **SOLE home** for the Tiger conformance ledger:
> its schema, admission tier, obligation rows, exception lifecycle, and PASS / STOP / hand-off
> decision. It owns neither R&D-stage rules nor Rust/Julia mechanisms; see
> `rd-and-language-translation.md` for those.

## Contents

1. [Admission and tier](#admission-and-tier)
2. [Ledger record](#ledger-record)
3. [Obligation rows](#obligation-rows)
4. [Error and space classification](#error-and-space-classification)
5. [Exceptions, reversal, and expiry](#exceptions-reversal-and-expiry)
6. [Decision protocol](#decision-protocol)

## Admission and tier

The ledger is an instrument for a named, consequential failure mode, not a style checklist.
Choose the smallest tier which covers the consequence; a higher tier must state why lower is
insufficient. Do not infer benefit from LLM self-review or claim that this discipline makes LLM
output safer, faster, or more correct.

| Tier | Admit when | Minimum record | Not an admission |
|---|---|---|---|
| Low | A disposable sketch needs only an exploration floor | consequence, experiment identity, selected floor, escalation trigger | a bare request for “Tiger Style” |
| Medium | A result may guide a decision, a component is being retained, or a failure can invalidate interpretation | one row per material contract plus targeted evidence | generic cleanup, a one-line edit, or language-only advice |
| High | Durable state, recovery, concurrent transitions, costly compute, safety/financial exposure, or irreversible external effects are present | complete obligation rows, independent check, residual-risk disposition | applying every rule to the algorithm under exploration |

**T1 consequence gate.** Record `risk_tier`, one concrete `failure_mode`, and `why_now` (what
becomes costly, irreversible, or misleading at this point). If this cannot be named, STOP
admission: retain only the exploration floor. A tier can rise when cost, reuse, or decision
weight rises; it can fall when the hypothesis is discarded and no artifact is retained.

## Ledger record

One ledger record names the change or experiment boundary. It is valid only if all required
fields are filled with observable content rather than adjectives such as “robust”.

```text
ledger_id: stable local identifier
scope: component / experiment / boundary under review
risk_tier: Low | Medium | High
failure_mode: named loss, corruption, misleading result, or resource waste
why_now: escalation condition and consequence
accepted_outcome: positive-space summary
release_or_use_decision: exploration | trusted-kernel | production (owner + date)
```

`accepted_outcome` is not a claim that “the code works.” It names the units, shape, ordering,
ownership, resource budget, or state transition that a downstream user may rely on. Every
assertion, test, type, `Result`, return code, metric, or review note must attach to a row below;
otherwise it is not conformance evidence.

## Obligation rows

**T2 obligation gate.** A Medium or High record has one row for each material boundary. A row
may be omitted only with a time-bounded exception. Multiple checks may support one row, but a
single vague test must not stand in for several invariants.

| Field | Required content | Invalid substitute |
|---|---|---|
| `invariant` | A positive, observable condition that must hold (for example: a checkpoint generation advances only after a complete durable write). | “correctness” or “valid input” |
| `negative_case` | A meaningful violation that could otherwise pass silently (partial write, duplicate apply, stale generation, non-finite result, budget overrun). | `not invariant`, “bad input”, or arbitrary-input exhaustiveness |
| `bound` | Unit, scope, value or proof obligation, and overrun condition. It may be a measured envelope rather than a fixed number. | copied folklore number; a bound without units or a response |
| `handling` | reject, quarantine, compensate/rollback, retry with limit, record-and-continue, or fail fast — plus the observable effect. | “handle error” |
| `evidence` | Command/query/check and raw result or stable locus; High tier needs an independent producer/consumer or external oracle where feasible. | author confidence, coverage percentage, or same-context generated test alone |
| `owner` | Person/role responsible for interpreting failure and approving disposition. | an unassigned team or “the LLM” |

Row template:

```text
row_id:
invariant:
negative_case:
bound:
handling:
evidence: {command_or_locus, raw_result, observed_at, independence_note}
owner:
```

The positive and negative spaces must be jointly useful but non-tautological. First state what
may proceed; then state a distinct violation and its treatment. For example, “a job lease is
owned by one active worker” and “a duplicate completion is rejected and recorded” differ in
both the bad event and response. “Success is accepted; failure fails” provides no executable
boundary. Do not demand enumeration of all invalid values: choose failures that threaten the
declared consequence.

## Error and space classification

Classify the failure before choosing a mechanism. This avoids converting recoverable operations
into crashes or silently continuing after an internal contradiction.

| Class | Meaning | Permitted handling | Evidence expectation |
|---|---|---|---|
| Programmer error | An internal invariant, impossible state, or corrupt logic under the program’s own contract. | language-appropriate fail-fast after preserving diagnostic context | invariant check plus a negative test or reviewable locus |
| Operational error | An expected external/runtime condition: I/O, timeout, conflict, capacity exhaustion, cancellation, malformed external input. | propagate, retry within a named policy, compensate/rollback, quarantine, or visibly fail | exercised failure path and caller/consumer disposition |
| Expected experimental failure | A hypothesis deliberately visits an unstable or unknown region. | tag, preserve inputs/seed/environment, bound cost, and continue only under the experiment protocol | recorded run and interpretation rule |

An error class is part of the obligation row’s `handling` rationale. “Fail fast” is not a
universal policy: operational errors need an explicit operational outcome, while intentional
experimental failure may be data rather than a release blocker.

## Exceptions, reversal, and expiry

**T3 reversal gate.** Exceptions remove or weaken a specific row; they never grant a blanket
opt-out. A valid exception is itself a ledger item:

```text
exception_id:
row_id / waived obligation:
reason_and_tradeoff:
compensating_observation_or_containment:
risk_owner:
reversal_trigger: condition that restores or raises the obligation
expiry_or_review_date:
decision_locus:
```

Reject ownerless, unbounded, or perpetual exceptions. On expiry, STOP the affected use or renew
with fresh evidence. On a reversal trigger — e.g. shared API, retained result, larger compute
budget, performance claim, durable state, or real consequence — reclassify the tier and add the
now-material rows. A discarded prototype may be de-escalated only after its artifacts are not
used as evidence or production input.

## Decision protocol

**T4 external-check gate.** Evidence closes a row only when it includes a runnable command,
raw result, or stable inspected locus. For High tier, seek a check independent of the code path
or authoring context (consumer validation, replay, external oracle, fault injection, or a
separately produced test). Agreement between reviewers, a green self-authored test, or an LLM
summary is useful input but not independent closure.

| Decision | Conditions | Required action |
|---|---|---|
| PASS | T1–T4 pass; every material row has evidence and owner; residual risks are accepted by a named owner or closed. | Hand off to the implementation/release owner with ledger ID and evidence loci. |
| STOP | Consequence is unclear; a material bound/negative case is missing; evidence contradicts the invariant; or an exception is invalid/expired. | Do not represent the change or result as trusted. Quarantine affected output, preserve diagnostic evidence, and return the missing decision to its owner. |
| HAND-OFF | The unresolved work is language-specific, implementation-specific, structural, or an experiment-design question outside this ledger. | Pass only the row and failure mode to the applicable owner; do not duplicate their mechanism catalog here. |

The ledger does not replace implementation, testing, or language guidance. It is complete when
it makes the next owner’s decision checkable — not when it has the most rows.
