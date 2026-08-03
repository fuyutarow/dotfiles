# Pull-based issue admission

## SOLE owner: publication, bid admission, and contamination boundary

`OPEN_ISSUE -> SECTION_BID -> SECTION_MANDATE` is the default direction. The Supervisor publishes
an addressable problem; independently authorised Directors pull it by bid. A named push assignment
is forbidden unless a future, explicitly signed authority extension changes this contract.

## Issue publication

An `OPEN_ISSUE` is valid only when it includes: Goal Constitution locator/digest and `OBJECTIVE_ID`/
`SUCCESS_OBSERVABLE_ID`; programme snapshot revision/fence; the uncertainty
to reduce; scope and exclusion boundary; eligibility; duplicate boundary; resource/safety limits;
required evidence interface; success and kill/reopen observable; expiry/review event; and bid
selection criteria. It must not contain a suggested method, candidate, protocol, live work order,
or director identity. It also publishes lease constraints: allowed action classes, terminal target,
lease expiry, first-intent deadline, and WIP budgets. These are budgets and evidence interfaces,
never a method, candidate, protocol, or run instruction.

## Bid admission

Read a `SECTION_BID` only as a capability/coverage declaration against the issue. It must carry
`ISSUE_ID`, open-issue locator/digest, director identity/role grant, capability/coverage claim,
constraints/conflicts, requested resource envelope, proposed local boundary/handoff, and
digest/provenance as applicable. Admit or decline by the seven programme criteria in
`programme-state-and-decisions.md`. On acceptance, issue a `SECTION_MANDATE` that freezes issue ID,
allowed authority, expected declassified signal fields, resource ceiling, expiry/fence, and return
route. The mandate lease must have `startedAt`, `expiresAt`, `firstIntentDueAt` no later than the
lesser of start+30m or 20% of lease duration, `maxControlEventsBeforeIntent` 0..2,
`maxProposalEventsBeforeIntent` 0..1, nonempty allowed action classes from `PROOF | BUILD |
EXPERIMENT | MEASUREMENT`, and terminal target from `PROOF_RECEIPT | RUN_RECEIPT | KILL_RECEIPT |
EXACT_BLOCKER`. Reject a mandate missing any field or allowing no scientific action path. It does
not specify local method or execution.

Many admitted sections may hold independent leases concurrently. Each section has one in-flight
candidate from admission through Director commit. No issue, mandate, or programme decision may impose
a global wave, “all Directors returned”, minimum batch count, or wait-for-other-section barrier.

A blocked issue must expose its upstream invalidator/existence-test locator and exact release condition.
`PROGRAMME_DECISION` releases only portfolio-level issue eligibility. The mandate must not require the
later Section-owned grounding packet. After mandate, the Director writes `SECTION_CHARTER`; grounding
exact-joins that charter and is mandatory before candidate genesis/search or admission. Free capacity is
not an admission criterion.

## Exact input allowlist

The Supervisor may receive only:

| Input type | Required fields |
|---|---|
| Goal Constitution / typed human programme feedback | type, signer, authority, digest, timestamp |
| `PROGRAMME_SNAPSHOT`, `OPEN_ISSUE`, `PROGRAMME_DECISION` | schema, signer, role, revision, fence, digest |
| `SECTION_BID` | ISSUE_ID, open-issue locator/digest, director identity/role grant, capability/coverage claim, constraints/conflicts, requested resource envelope, proposed local boundary/handoff, digest/provenance |
| `SECTION_SIGNAL` | exact `research-section-signal/v2` schema in asset; all required fields; declassification assertion |
| `SECTION_REOPEN_REQUEST` | issue/section IDs, mandate locator/digest, programme revision/fence, reason class, evidence locator/digest, request digest; never an enactment |
| `AUDIT_RECOMMENDATION` | exact `research-audit-recommendation/v2` fields: recommendation/audit/episode/issue/section IDs, auditability, recommendation type, programme question, audit locator/digest, auditor and declassifier identities/assertion, raw-content=`NO`, authority=`RECOMMENDATION_ONLY` |

Forbidden inputs: raw method proposals, candidate prose, local ranking notes, protocol/run text,
transcripts, prompts, tool traces, workspace dumps, unredacted human method suggestions, and any
live-section context. A field that can reconstruct such material is forbidden even if relabelled.

Also forbidden are `SECTION_TRANSFER_PACKET`, subscription, delivery, admission, and transfer-commit
bodies or per-recipient acknowledgements. The Supervisor is never a lateral routing hop.

## Fail-closed contamination response

1. Do not read or summarize the content beyond enough metadata to classify it.
2. Record `CONTAMINATION_OR_AUTHORITY_FAILURE`, input locator/digest if available, received type,
   and safe route. Never copy forbidden payload into a programme artifact.
3. Return a route: method/local work to `directing-research-sections`; terminal integrity to
   `auditing-research-processes`; control-plane policy to `orchestrating-agents`.
4. Do not issue a decision, mandate, or issue revision from contaminated input.

## Section signal declassification

Allowed signals use the exact `research-section-signal/v2` intake template. Every listed field is
required. The template permits only bounded identifiers, assertions, classes, locators/digests, and
declared uncertainty; it never permits a method, candidate, protocol, transcript, prompts,
workspace, or narrative reasoning. A missing field or `RAW_CONTENT_INCLUDED` other than `NO` rejects
the signal; plausible prose does not repair it.

Propagation fields are bounded aggregates only: packet/delivery/admission counts, commit-to-delivery and
delivery-to-admission latency, replay drops, unrouted count, visibility violations, topic coverage gaps,
and conflict alarms. Require `TRANSFER_PACKET_BODY_INCLUDED: NO` and the throughput-exclusion assertion.
No aggregate field may reconstruct a packet body or recipient decision.

## Progress denominator intake

Programme progress is derived only from a declassified terminal scientific class backed by tracked,
nonignored evidence. The exact signal adds one bounded nonzero observation window and aggregate
`candidateInventory`, `builds`, `searchReceipts`, `learningCommits`, `searchPerHour`, `learnPerHour`,
`learningCompletion`, latency, idle/utilization, blocker/wait, abandoned, and expired counters.
`learnPerHour` is primary and `searchPerHour` is leading. Counts are rejected when their window is
zero, overlapping without declaration, replay-inflated, or inconsistent with the receipt/commit joins.

`PREDECLARED_OBSERVABLE_ID`, `RECEIPT_DIGESTS`, `OUTCOME_CLASS`, `UNCERTAINTY`,
`LIFECYCLE_TOKEN`, and `COVERAGE_DUPLICATION_ASSERTION` preserve denominator accounting without
exposing raw local content. The assertion must identify counted, ignored, and pending receipt
identifiers/digests or say `NONE`; an ignored/transient locator and any `.agent-state` locator cannot
support science. Negative/KILL counts are included only when discriminating and intent-linked.

The following are CONTROL only: bids, mandates, charters, candidate packets, denominator freezes,
normalization, audit briefs, continuation records, and verification attempts. They never count as
programme scientific progress. V2/V3 model verification is promotion-only; a timeout writes
`PENDING_VERIFICATION` for that promotion and does not stop in-mandate search/learn.

Transfer fan-out/replay likewise never increments `searchReceipts`, `learningCommits`, `searchPerHour`,
or `learnPerHour`. A source receipt and Director commit are counted once before any lateral propagation.

The Supervisor is forbidden from the reversible candidate hot path. It does not schedule, admit,
approve execution, interpret a receipt, commit learning, or act as a ready-queue barrier. A verifier
is likewise forbidden before promotion.

## Stalled lease

The Supervisor is event-woken, never always hot. It does not direct a stalled section's method or
next action. When an allowlisted signal reports missed first-intent/WIP limits or a valid exact
blocker, a `PROGRAMME_DECISION` releases, pauses, or reopens the lease/issue. No named Director is
dispatched.

Ordinary wakes are section close/pause/reopen, a programme-declared coverage or resource threshold,
or a bounded periodic wake. Candidate/build/receipt/learning events remain section-local and never
wait for a programme wake.

## Audit recommendation declassification

The raw `RESEARCH_PROCESS_AUDIT` is forbidden Programme Supervisor visibility. It may receive only
the exact `AUDIT_RECOMMENDATION` allowlist row. The recommendation cannot enact `reopen`, `retire`,
or any programme transition. The Supervisor must make an independent decision and write a new
`PROGRAMME_DECISION`, or leave state unchanged.
