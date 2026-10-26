---
name: practicing-tiger-style
description: >-
  Applies Tiger Style to design, implementation, and review by defining what must stay true,
  making state ownership and resource limits explicit, and checking consequential failures.
  Use for Tigerレビュー or consequential state, concurrency, capacity, recovery,
  and performance contracts, including prototype promotion and costly R&D.
  Produces scoped design decisions or findings with checks and remaining uncertainty.
  Bug diagnosis follows repository instructions and the relevant domain owner; language mechanisms to writing-*;
  skill revision to forging-skills. Disposable sketches use ordinary domain checks.
  English skill; respond in the user's language.
---

# Practicing Tiger Style

> **Version**: v2610.1.1 (2026-10-26) — negative-space enforcement through types and runtime boundaries.

## Purpose — define, enforce, and try to break the contract

Start with what must stay true when the system is busy or failing.
Then decide who owns state, how much work may exist, and what happens when an operation cannot finish.
Check those decisions with a case that would expose their failure.
The three commitments are explicit state ownership, bounded work, and defined failure behavior.
Preserve required correctness when trading speed or convenience; estimate the work before tuning it.

```text
required behavior and unacceptable loss
  → state owners, resource bounds, and failure handling
  → enforcement in the design/code
  → checks of normal behavior and consequential violations
```

**LAW:** every selected requirement must connect to an enforcement boundary and a check.
An assertion count or a passing local test cannot establish a whole-system guarantee.
The procedure and record below are this skill's adaptations of the existing synthesis.
They are not an official TigerBeetle certification scheme.

Respond in the user's language. Explain requirements in ordinary words.
T0–T4 are record labels; knowing them is not a prerequisite for doing the work.

## Negative space — type safety plus runtime enforcement

**Make forbidden states unrepresentable where practical; prevent forbidden operations at the runtime boundary.**
For each material prohibition, identify the forbidden value or transition, its enforcer, and a violating case.
A list of prohibitions, a warning, or a successful preflight check does not establish enforcement.

| Boundary | Required design decision | Discriminating check |
|---|---|---|
| Stable value or state shape | Use types and controlled construction where they exclude the named invalid case. Parsers return the checked representation, not a boolean that callers can discard. `designing-type-contracts` owns placement. | Try the forbidden construction through public APIs and decoding, with an allowed control. |
| Mutable external fact or concurrent transition | Name the authoritative state owner and the mechanism that couples authorization to the effect: transaction, lock, reservation, or equivalent. Cover every competing writer and effect path. | Change or revoke the fact between planning and execution; the forbidden effect must not occur. |
| Internal contract | Use Design by Contract: explicit preconditions, postconditions, invariants, and assertions at relevant boundaries. | Exercise the contradiction and its containment; do not treat expected input or I/O failures as programmer errors. |

A typed permission snapshot can expire. A recheck followed by an unprotected effect still races.
If another writer can bypass the mechanism, retain that limitation as OPEN; a lock name alone proves nothing.
An assertion after an irreversible effect detects a violation but does not prevent or undo it.
Retain the existing failure/recovery obligations for effects that may already have happened.
Record these decisions in the existing requirement/enforcement/check row; do not add a parallel artifact.

This is the skill's engineering synthesis, not a claim that TigerBeetle coined Runtime Enforcement.
TigerBeetle's contract programming and paired assertions are sourced in
[source-ledger.md](references/source-ledger.md).

## Choose the task mode

Choose from the requested action, before selecting checks:

| Requested action | Mode | Required output and completion condition |
|---|---|---|
| Review or assess an existing design/code | Review | Inspect selected boundaries; report each finding, evidence, untested condition, and clearing check. Finish the review even if the implementation remains unverified. Do not edit the target. |
| Design without implementation | Design | Propose enforcement and checks for every selected requirement; expose unresolved decisions and assumptions. Finish with design readiness, not runtime acceptance. |
| Build, fix, optimize, or harden | Change | Follow repository instructions and the relevant domain owner when diagnosing failures. For new behavior, define the relevant contracts before implementation. Implement within authorization, run applicable checks, and report remaining gaps. |

A request combining review and changes uses Change mode only for the authorized edits.
History or explanation alone uses ordinary explanation or `systematizing-knowledge`.
A disposable sketch outside an explicit Tiger request uses domain checks; no Tiger record.
An explicit Tiger request can use the procedure at any risk tier.

## Required procedure

### 1. State the scope and what must not be lost

Name the affected operation, its consumer, required result, and concrete failure consequence.
Read its existing design/code, or mark proposed behavior and workload estimates for new work.
Classify the consequence using the ordered rules in
[ledger-and-calibration.md](references/ledger-and-calibration.md#risk-classification).
Unknown consequences stay unknown; do not guess a tier or acceptance.

### 2. Select the applicable constraints and decide enforcement

Apply every matching row below within the affected operation.
Skip a row only when its condition is absent.
Record a short reason for skips; leave unresolved applicability open.
This selection is recorded once, not once per obligation.

| Condition present | Required design decision and check |
|---|---|
| Mutable state or overlapping operations | Name allowed writers and ordering/ownership transfer. Check a conflicting, duplicate, or late completion as relevant. |
| Queues, retries, allocation, or work sized by external input | Bound total queued, in-flight, retrying, and retained work. Name units and overflow handling. Check the limiting input or slow consumer across the whole path. |
| An operation can fail, time out, or be cancelled | Distinguish internal contradiction from operational failure. Name propagation, bounded retry, rejection, or containment. Check the selected failure and cleanup. |
| Writes/effects can survive a failed operation or restart | Define acknowledgment, replay, deduplication, or reconciliation. Check failure between the relevant steps and subsequent reads/use. |
| A performance requirement or speed change is requested | Model dominant work/resources. Define speed and preserved behavior separately, then check both on the same workload. |
| A consumer relies on replay or reproducibility | Specify what must repeat and control its time/randomness/I/O inputs. Check the required equivalence. |
| An external dependency enforces a selected property | Inspect that dependency's contract and version at the boundary. Check the property there; do not infer it from the caller alone. |

For each selected requirement, name the enforcement boundary, failure response, and observable check.
For a new or changed design choice, also name the rejected alternative and sacrificed property.
For an unchanged design, cite its existing boundary; do not invent rejected alternatives.
Read [architecture-decisions.md](references/architecture-decisions.md) for a new design or a path crossing components.
Trace such a path from admission to completion/recovery, including displaced queues and cleanup ownership.

### 3. Connect the requirement, enforcement, and evidence

Keep one record in the existing design/review or inline response.
For each selected requirement, record:

| Requirement | Enforcement and failure response | Normal/violating check | Evidence and gap |
|---|---|---|---|
| Observable condition; justified limit if relevant | Design/code boundary and its responsible owner | Input/event and expected result | Planned or observed, implementation/workload identity, untested coverage |

For check closure or exceptions, use
[ledger-and-calibration.md](references/ledger-and-calibration.md).
Compact prose may carry those fields; separate files and identifiers are unnecessary for a single local requirement.
For several coupled requirements, use stable row IDs and link their dependencies in the same record.

### 4. Check and report; stop at the task's output boundary

In Design mode, specify checks without pretending to run an absent implementation.
In Review mode, inspect supplied evidence and run authorized read-only checks when useful.
In Change mode, execute the applicable checks against the changed implementation.
Check normal behavior and a consequential violating event for each selected property.
A proof or static inspection may replace execution only for the property it establishes.

High-risk implemented boundaries need a check independent of the authoring path or context.
Use an independently specified oracle, consumer validation, replay, or fault injection.
A second agent is not required. Missing evidence stays open.
Changed enforcement or assumptions reopen dependent checks; preserve old observations with their old identities.

Report three separate things using the definitions in
[ledger-and-calibration.md](references/ledger-and-calibration.md#completion-and-reporting):

- **Design readiness:** DESIGN-READY or OPEN, with unresolved decisions.
- **Implementation evidence:** PASS, ACCEPTED-WITH-EXCEPTIONS, OPEN, or STOP, scoped to selected requirements.
- **Next action:** concrete implementation, repair, measurement, or handoff with its owner.

A completed review can report OPEN or STOP. Neither means halt all authorized work.
PASS requires observed support for every selected requirement and no waived obligation.
Acceptance with exceptions must preserve the original unmet requirement.
This procedure adds no deployment authority or user-approval requirement.

## Conditional work and omissions

| Work | Required only when | Otherwise |
|---|---|---|
| Full component trace | Ownership, capacity, or effects cross components | Cite the affected local boundary |
| Cost model and speed comparison | Performance is a selected requirement | Omit performance work; still enforce selected capacity limits |
| Recovery/replay checks | Failed work can leave state/effects that will be used later | State why whole-run discard or absence of persistent effects suffices |
| Exception record | A responsible owner proposes accepting a specific unmet obligation | Write `exceptions: none`; skip T3 |
| Source verification | Attribution, official mandates, or portable source rules are asserted | Reuse the existing synthesis; no fresh survey for routine application |
| Research promotion record | A consumer starts relying on a new property | Omit stage paperwork |
| Delegation | An independent factual uncertainty benefits from authorized delegation | Work serially; independence is about the check, not headcount |

An exception is optional. Do not solicit one merely to make acceptance green.
Use [source-ledger.md](references/source-ledger.md) for source claims and
[evidence-and-limits.md](references/evidence-and-limits.md) for effect or universality claims.
Use [rd-and-language-translation.md](references/rd-and-language-translation.md) at research promotion boundaries.
Use [execution-model.md](references/execution-model.md) only for delegated fact collection.

## Worked local review — a rebuildable disk cache

Input: a retained cache has one writer, trusted source data, and atomic replacement.
It has no external effect. The caller sets a 32 MiB load-allocation budget.
The loader is isolated; an entry failure loses only rebuildable cache data and disposable work.
The decoder allocates its full output without a limit; the size check runs afterward.

Scope: one cache load; Medium because the stated losses are rebuildable and contained.
Ownership, allocation, failure handling, and persisted cache contents apply.
Replay determinism, speed comparison, and external-provider contracts do not apply.

| Selected requirement | Inspected evidence / finding | Clearing check or remaining coverage |
|---|---|---|
| Only the cache writer replaces an entry | One writer and atomic replacement are given; ordering during load is untested | Load while replacing; observe only a complete old/new entry |
| Load allocation stays within 32 MiB | Full output allocation precedes the check; this violates the budget for oversized output | Bound encoded/decoded allocation; check a valid entry and compressed expansion beyond budget |
| Decode failure releases resources and reports failure | No failure/cleanup evidence supplied | Invalid entry rejects visibly, releases partial allocation, and allows rebuild |
| A failed write cannot leave cache data trusted on later load | Atomic replacement is given; interrupted-write behavior is untested | Interrupt replacement, then load or visibly reject/rebuild the surviving entry |

Finish with design readiness OPEN and implementation evidence STOP for allocation.
Other untested properties remain OPEN. Assign the next action to the cache implementation owner.
Aggregate evidence is STOP. `exceptions: none`.
The review is complete; cache acceptance remains unresolved.
The numbers are constructed example inputs, not Tiger thresholds.

## Boundaries

| Question | Owner / relationship |
|---|---|
| Root cause or observable behavior change | Follow repository instructions and the relevant domain owner; this skill adds the selected constraints |
| Behavior-preserving structural change | `refactoring-code`; apply this procedure only to consequential boundaries |
| Type/schema invariant placement or language mechanism | `designing-type-contracts` or `writing-*`; link their enforcement into the record |
| General decomposition or deployment choice | Task/domain owner; this skill checks selected state/resource/failure constraints |
| Configuration authority or integrity | `governing-configuration-systems`; consume its contract |
| Untested expensive or hard-to-reverse bet | `acting-on-hypotheses` first; this skill checks execution integrity |
| Benchmark validity or leakage | `validating-experimental-evidence`; consume its disposition |
| Fleet resource admission or cross-actor priorities | `orchestrating-agents` or `codifying-doctrine` |
| Skill wording, organization, or verification | `forging-skills` |

## Maintenance

T1 records scope/consequence; T0 records design; T2 records obligations.
T3 records exceptions only; T4 records observations and assessment.
They are fields in one **Tiger conformance ledger**, not five mandatory sequential gates.
Detailed schemas live in the references above.
Selection and behavioral cases live in [tests/triggers.md](tests/triggers.md).
Revision evidence lives in [tests/forge-verification-ledger.md](tests/forge-verification-ledger.md).

Package check from the repository root:

```sh
skill-check agents/skills/practicing-tiger-style
```
