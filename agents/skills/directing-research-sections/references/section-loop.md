# Section loop — SOLE owner of local state and artifacts

This file owns the section-level sequence. Programme semantics belong to
`supervising-research-programmes`; process-audit semantics belong to
`auditing-research-processes`. These seams agree in substance; do not diff for byte identity.

## State sequence

`UNBOUND -> BID_SUBMITTED -> MANDATED -> CHARTERED -> GROUNDED -> CANDIDATE_READY -> ADMITTED -> BUILD_READY -> EXECUTABLE_READY -> INTENT_REGISTERED -> EXECUTION_READY -> DISPATCHED -> STARTED -> TERMINAL -> LEARNING_READY -> LEARNING_PROPOSED -> DIRECTOR_COMMITTED -> CANDIDATE_READY`, with terminal `{PAUSED | COMPLETE | REOPEN_REQUESTED}`. The alternate boundary is `INTENT_REGISTERED -> EXACT_BLOCKER_RECORDED -> {PAUSED | COMPLETE}`; it closes or pauses the lease and never enters learning.

Each event wakes only its next eligible transition. One candidate job is in flight per section, while
unrelated sections proceed concurrently. `WAIT_FOR_OTHER_SECTION`, `WAIT_FOR_WAVE`,
`WAIT_FOR_ALL_DESIGNS`, `SUPERVISOR_REVIEW`, and `MODEL_VERIFICATION` are invalid waits on this loop.
When transitions are ready together, drain `DIRECTOR_COMMIT > LEARNING > EXECUTION > BUILD > SEARCH`.

After `DIRECTOR_COMMITTED`, an eligible source commit may append one `SECTION_TRANSFER_PACKET` as a
nonblocking side transition. The local loop returns to `CANDIDATE_READY` without waiting for delivery.
Recipients process deliveries independently through
`TRANSFER_DELIVERED -> TRANSFER_ADMITTED -> {TRANSFER_COMMITTED | NO_LOCAL_CHANGE}`.

An `OPEN_ISSUE` plus immutable Director identity/capability permits `SECTION_BID` only. Only a current
`SECTION_MANDATE` moves a section from `BID_SUBMITTED` to `MANDATED`. The Director writes
`SECTION_CHARTER`; an ephemeral distinct grounder exact-joins it in `GROUNDING_PACKET`. Only the Director
writes `SECTION_CHARTER`, `SECTION_STATE`, `RUN_INTENT v2`, `SECTION_DIRECTOR_COMMIT`, `SECTION_REVIEW`,
`SECTION_SUBSCRIPTION`, `SECTION_TRANSFER_PACKET`, `SECTION_TRANSFER_ADMISSION`,
`SECTION_TRANSFER_COMMIT`, and a return packet. A
programme decision may supersede/revoke a mandate; the Director records that event but cannot replace it.

Candidate genesis through `forging-novel-theses` and all candidate search require a current
`SECTION_CHARTER` and a current `GROUNDING_PACKET` that exact-joins it; neither may run from a mandate alone.

## Local admission record

Each candidate or test gets one live `SECTION_STATE` row: `ADMIT | REJECT | DEFER`, charter criterion,
evidence locators, lineage, known-result disposition, value class, dominance state, author identity, and timestamp. Exactly one `ADMIT` may be in flight across search, build, execution, learning, and commit. `ADMIT` authorizes
only preparation of a run intent; it is not a claim that the candidate is globally useful or true.

## Run boundary

`RUN_INTENT v2` is prospective Director authorization. It must exist before the declared access boundary.
The first registered run is a minimal existence/discriminator test. A `SECTION_DIRECTOR_COMMIT` with
`DECISION=COMMIT` and `SCALE_RELEASE=ESCALATED_CONFIRMATION` alone releases scale, full sweep, or GPU port
from its linked minimal receipt within a Programme-released
mandate. When both blocks apply, the Programme eligibility release and Director scale release are required.
The executor writes one immutable terminal `RUN_RECEIPT` observation packet or a terminal typed exact
blocker. The receipt branch requires a distinct learner proposal from a previously unconsumed receipt and
a distinct Director commit. The receipt immediately wakes the learner, and the learner proposal
immediately wakes the Director commit; only that commit reopens the WIP slot. A valid exact blocker instead closes or pauses the lease; it is neither SEARCH
nor LEARN and requires no learner proposal. The Director may cite a receipt locator/digest and status, but
never edits, authors, observes, or interprets it as proof.

An executor receipt with `MEASUREMENT_VALIDITY=FAIL|UNKNOWN` enters only instrumentation repair. A learner
proposal is `SCIENTIFIC` or `INSTRUMENTATION_REPAIR`; `REJECT` and `DEFER` commits earn no LEARN, and neither
does a committed instrumentation repair.

## Lateral transfer boundary

The exact lateral branch belongs to `cross-section-learning.md`. A source packet requires the completed
receipt/proposal/Director-commit join. A deterministic broker alone writes delivery records from exact
subscriptions; it cannot decide applicability. A recipient admission has no state authority, and only a
distinct recipient transfer commit may enact `ADOPT` locally.

No source or recipient waits for delivery, acknowledgement, another recipient, Supervisor, verifier,
or global fan-in. Transfer publication, fan-out, replay, admission, and adoption do not reopen or increment
the source SEARCH/LEARN chain.

## Return grammar

Normal return uses an allowlisted `SECTION_SIGNAL` with the exact field set in `assets/SECTION-SIGNAL.md`.
`SECTION_REVIEW` remains local and is frozen for a terminal process audit; it is never transported raw to
programme state. Use `SECTION_REOPEN_REQUEST` only when the mandate's stated trigger is met. It is a
typed, declassified, request-only input to `supervising-research-programmes`; only a later
`PROGRAMME_DECISION` may enact reopening.

## Local stop rules

Stop and return `PAUSED` when the mandate is stale/revoked, the charter boundary is exhausted, a required
receipt is absent, the privacy class cannot be declassified, or the Director role grant is invalid. Do
not solve any of those by manufacturing a new mandate, role, signal, or receipt.
