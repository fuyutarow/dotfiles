# Programme state and decisions

## SOLE owner: programme state vocabulary and decision semantics

This reference defines what the Programme Supervisor may read, write, and decide. Section-local
execution belongs to `directing-research-sections`; terminal process integrity belongs to
`auditing-research-processes`. The seam agrees in substance; do not byte-diff it.

## Authoritative state

`GOAL-CONSTITUTION` is signer-owned external authority. The Supervisor may validate, cite, and carry it;
it never authors, alters, amends, or supersedes it. `PROGRAMME_SNAPSHOT` is the rehydration root. Its mandatory `PROBLEM_LANDSCAPE` component is the
SOLE programme-owned semantic artifact for target/comparator/horizon and programme residuals. The
snapshot names the Goal Constitution, active/open/closed issues, portfolio coverage, constraints, resource envelope,
allowlisted signal locators, bounded throughput windows, decision history, revision, and fence. It is semantic authority; a
runtime database is only an operational pointer and cannot replace it.

Cold start has two fail-closed paths:

1. **GENESIS.** Require a signed Goal Constitution, explicit `NO_CURRENT_SNAPSHOT`, and an
   authority-declared initial revision/fence. Create the first snapshot at revision 0 or 1 exactly
   as declared. Any existing snapshot, absent condition, or ambiguous fence stops genesis.
2. **REHYDRATE.** Resolve the current snapshot locator and exact digest. Check signer/actor instance,
   role grant, revision, and fence. Load only explicitly linked and allowlisted artifacts.
3. If either path is absent, stale, unsigned, role-mixed, or contradictory, emit
   `PROGRAMME_STATE_UNUSABLE` with safe locators. Never infer state from chat history.

## Programme landscape

Each revision states: Goal `OBJECTIVE_ID` and `SUCCESS_OBSERVABLE_ID`; target family; comparator; horizon;
scaling regime; distribution/access assumptions;
tolerance; resource/safety constraints; known evidence; unresolved assumptions; covered and
uncovered programme questions; and a one-observation kill or reopen condition. A broad aspiration
without these fields is `problem-underconstructed`, not a license to invent a local method.

## Decision semantics

`PROGRAMME_DECISION` may publish, revise, defer, pause, close, retire, **release** a receipt-blocked
downstream action, or **reopen** an
`OPEN_ISSUE`; accept or decline a bid; change a portfolio allocation; or request a typed human
authority decision. A `SECTION_REOPEN_REQUEST` is evidence/request only: the Programme Supervisor
alone decides and enacts programme reopen through this artifact. Every decision cites the snapshot
revision and considered allowlisted inputs.

Admission and portfolio decisions use these distinct criteria:

| Criterion | Programme question |
|---|---|
| Relevance | Does the proposed section bear on a live programme uncertainty? |
| Coverage | Which load-bearing issue becomes observable that was not already covered? |
| Diversity | Does it reduce correlated-bet exposure rather than rename a duplicate? |
| Duplication | What active/closed issue overlaps, and why is overlap justified or disqualifying? |
| Constraints | Does it fit stated access, safety, governance, and time constraints? |
| Resources | Does it fit the declared envelope without silently displacing a protected bet? |
| State | Is the issue active and the evidence interface still valid? |

Never add local-method quality, candidate plausibility, protocol preference, or run outcome as a
criterion here. Those are section-local questions.

Goal-axis, comparator, horizon, scaling-regime, or success-observable changes require a signer-owned Goal
amendment or supersession. Capacity is not authority for such a change.

Throughput may inform allocation only as an allowlisted bounded aggregate. `learnPerHour` is primary,
`searchPerHour` is leading, and neither overrides relevance, safety, or resource integrity. The
Supervisor never schedules a candidate, drains a ready queue, or interprets an individual receipt.

Propagation may inform coverage only through aggregate transfer metrics, topic coverage gaps, conflict
alarms, and delivery lag. Packet, subscription, delivery, admission, and transfer-commit bodies are
forbidden programme state and cannot justify a decision directly.

## Human input typing

Admissible human inputs are: goal constitution changes, programme constraints, safety/resource
limits, comparator/horizon priorities, and an explicit authority decision. Record their type and
provenance. A human method suggestion is not admissible programme evidence: its content never
enters a snapshot, issue, mandate, decision, or signal; only a quarantine locator and routing
event may be retained by the surrounding control plane.
