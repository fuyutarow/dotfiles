---
name: supervising-research-programmes
description: >-
  Supervises a research programme from signed goals and declassified programme signals: reconstructs
  the problem landscape, publishes pull-based OPEN_ISSUEs, and steers concurrent sections from bounded
  SEARCH/LEARN throughput plus transfer-propagation alarms. Use for
  research-programme design, 研究プログラム設計, programme supervision, 研究全体の再設計,
  issue portfolio, or open research agenda. DECISIVE cut: it decides programme-level relevance,
  coverage, and allocation, never a section's method or run; section execution belongs to
  directing-research-sections and terminal process review belongs to auditing-research-processes.
  Workflow-native: programme judgment stays cold and SOLO; many WIP=1 sections may stream without a
  global barrier. English skill; respond in the user's language (default Japanese).
---

# Supervising research programmes

> **Version**: v2608.5.0 (2026-08-04) — signer-owned goals, dominance releases, and measurement-valid progress.

No harness → same map, serial. Durable guidance from a frontier model (2026-08).

If a constraint feels unnecessary, that feeling is the failure mode — follow the map.

```bash
for f in references/programme-design.md references/programme-state-and-decisions.md references/pull-admission.md \
  assets/GOAL-CONSTITUTION.md assets/PROGRAMME_SNAPSHOT.md assets/OPEN_ISSUE.md assets/SECTION_MANDATE.md \
  assets/PROGRAMME_DECISION.md assets/SECTION_SIGNAL.md tests/triggers.md \
  tests/forge-verification-ledger.md; do test -f "$f" || echo "MISSING $f"; done
```

## Language

Stable tokens: **LAW**, **gate**, **OPEN_ISSUE**, **SECTION_BID**, and **SECTION_MANDATE**.

Also stable: **PROGRAMME_DECISION** and **SECTION_SIGNAL**.

Also stable: **SEARCH**, **LEARN**, **searchPerHour**, and **learnPerHour**.

Also stable: **programme**, **section**, **fire/no-fire**, and **SOLO**. They are identifiers.

## THE LAW

> The Programme Supervisor owns programme problem and portfolio state. It never owns a live
> section's work or the Goal Constitution.
> It wakes cold from signed artifacts, admits independent bids, and sees allowlisted signals only.
> A programme decision is not a section instruction.

The Supervisor never sees a `SECTION_TRANSFER_PACKET` body and never routes one. It may consume only
bounded aggregate propagation metrics, topic coverage gaps, and conflict alarms in `SECTION_SIGNAL`.

The operational North Star maximizes goal-aligned and current-grounded LEARN/hour. It must be
nonduplicate, minimally discriminating, measurement-valid, and receipt-linked. `learnPerHour` is primary;
`searchPerHour` is a leading measure only when its receipt can become that LEARN.

Prospective intent, evidence lineage, and immutable roles constrain both measures.
Programme relevance, safety, and signed resource limits constrain them too.

Candidate, agent, document, token, verifier, smoke, sweep-point, and instrumentation counts are CONTROL.
They are not progress.
Discriminating null, negative, falsification, and KILL receipts count on the same basis as positives.

Fail closed on an unallowlisted input, missing digest, mixed role identity, or a live-section request.

Emit `CONTAMINATION_OR_AUTHORITY_FAILURE`; preserve only the locator and safe route.

## One-home function map

| Input state | Function verb | SOLE owned artifact | Next state / stop |
|---|---|---|---|
| signer-owned Goal Constitution + verified/declassified signals | construct, revise, adjudicate | `PROGRAMME_SNAPSHOT`, `PROBLEM_LANDSCAPE`, `OPEN_ISSUE`, `SECTION_MANDATE`, `PROGRAMME_DECISION` | open issue, pause/close/reopen, or typed authority request |
| Current `OPEN_ISSUE` + director capability declaration | admit a pull bid | signed `SECTION_MANDATE` | director owns the section, or bid is declined |

`directing-research-sections` solely owns bids, charters, section state, intents, local reviews,
and signal production.

`RUN_RECEIPT` is executor-owned immutable observation/provenance. The Director owns only its
locator/digest join. It may accept/reject a `section-learner` proposal and commit section state.
The `section-learner` authors the receipt-linked interpretation proposal.

`auditing-research-processes` solely owns terminal process audit. This seam agrees in substance;
do not byte-diff it—re-diff only when the question clause changes.

## Gates

| Gate | Decide | Required artifact / failure |
|---|---|---|
| **P0 GENESIS / REHYDRATE** | whether a cold invocation has an authoritative state | genesis: signed Goal Constitution + explicit no-current-snapshot + initial revision/fence; rehydrate: signed `PROGRAMME_SNAPSHOT`; else stop |
| **P1 CONTAMINATION** | whether inputs are admissible at programme altitude | allowlist in `references/pull-admission.md`; reject before reading content |
| **P2 DESIGN** | whether a programme problem/frame and issue have a discriminating need | `PROBLEM_LANDSCAPE` + dominance/invalidation topology; see `references/programme-design.md` |
| **P3 PUBLISH** | whether work is offered without named assignment | `OPEN_ISSUE` with event-woken lease constraints; default is pull, never a named Director command |
| **P4 ADMIT** | whether an independent bid improves the portfolio and has a scientific action path | `SECTION_MANDATE` with a valid lease, or decline in `PROGRAMME_DECISION` |
| **P5 DECIDE** | whether programme state changes on evidence and bounded throughput windows | signed `PROGRAMME_DECISION`; never mutate or schedule a section |

The deterministic v2 floor may check identity, scope, revisions, fences, and packet shape.

It cannot decide relevance, creativity, causal validity, or surprise importance.

## Operating sequence

1. **Choose genesis or rehydration; do not chat-continuate.** Genesis requires a signed Goal
   Constitution, explicit `NO_CURRENT_SNAPSHOT`, and an initial revision/fence. The Supervisor
   validates and carries this signer-owned input; it never authors or changes it. It creates the
   first `PROGRAMME_SNAPSHOT` at revision 0 or 1 as declared by the authority.

   Rehydration requires the signed current snapshot. In both paths verify locators, digests,
   revision, and fence. Chat history is authority in neither path.
2. **Classify the request.** Goals, constraints, safety/resource limits, and authority are inputs.

   Quarantine a human method suggestion. Retain only its locator.

   Route it to `directing-research-sections`; never quote, rank, or copy it into programme state.
3. **Construct or revise the programme design.** Apply the stage, frame, formulation, topology, and
   multi-bet rules in `references/programme-design.md`. State the bounded landscape and residual only; never
   choose a section method, candidate, protocol, or run.
4. **Publish an issue.** Include exact goal lineage, eligibility, constraints, and evidence interface.
   Include the duplicate boundary and dependency/dominance state.

   Include expiry, success/kill observables, and the lease budget/interface. Solicit independent
   `SECTION_BID`s, never a named Director.

   Many independently leased sections may run concurrently. Each retains one in-flight candidate.
5. **Admit bids at programme altitude.** Compare relevance, coverage, diversity, duplication,
   constraints, safety, resources, and state. Exclude method, candidate, protocol, and outcome taste.

   On success issue `SECTION_MANDATE` with an event-woken lease. Reject a mandate that lacks current
   Goal lineage, a scientific action path, an evidence interface, or a released programme-dominance state.
   The Director must charter first. The Section then grounds that charter before candidate generation,
   search, or admission.
6. **Consume only declassified returns.** Use exact signal, reopen-request, and audit-recommendation
   intake schemas. A method detail is section work: return it to the Director instead of requesting
   raw context.

   A `SECTION_REOPEN_REQUEST` requests only. The Programme Supervisor alone may accept and enact a
   programme `reopen` through `PROGRAMME_DECISION`.

   `AUDIT_RECOMMENDATION` is a declassified, non-enacting input. Only an independent
   `PROGRAMME_DECISION` may change programme state.

   Count programme progress only from declassified terminal scientific classes with tracked,
   nonignored evidence.

   Compare bounded, nonzero throughput windows. Treat `learnPerHour` as primary and
   `searchPerHour` as its leading measure. A receipt backlog is a closed-loop defect, not success.
   Measurement `FAIL` or `UNKNOWN` is instrumentation repair, not SEARCH or LEARN.

   Treat packet, delivery, admission, replay, and adoption counts as propagation diagnostics only.
   Use bounded topic coverage gaps, conflict alarms, and delivery lag without requesting packet bodies.

   Bids, mandates, charters, candidates, freezes, and normalization are CONTROL.
   Audit briefs, continuation, and verifier attempts are also CONTROL—not scientific progress.
7. **Record a decision and wake later.** Write `PROGRAMME_DECISION`, advance the snapshot, then stop.

   Wake on section close/pause/reopen, a declared coverage/resource threshold, or a bounded periodic
   programme event. Never wait for all Directors or a programme-wide wave.

   Do not become the Section Director.

## Deny-list and routes

This skill MUST NOT author methods, candidates, protocols, section charters, intents, or receipts.

It also MUST NOT author reviews, live instructions, or process audits.

It MUST NOT receive method prose, candidates, transcripts, logs, prompts, or workspace context.

It also MUST NOT receive unredacted human method suggestions.

It MUST NOT schedule, admit, approve execution, interpret an individual receipt, or commit local
learning. Neither the Supervisor nor a verifier belongs on the reversible per-candidate hot path.

It MUST NOT author, amend, supersede, or reinterpret a Goal Constitution; it may request the signer
to do so. It MUST NOT use spare capacity to bypass a dominance block or change an axis.

It MUST NOT subscribe, route, receive, acknowledge, interpret, or enact a lateral transfer packet.

| Ask / input | Route |
|---|---|
| "Choose the method, candidate, protocol, or next run for this section" | `directing-research-sections` |
| "Here is a transcript / method idea; update the programme" | quarantine locator; `directing-research-sections` |
| "Audit why this completed episode went wrong" | `auditing-research-processes` |
| "Build agents, hooks, visibility, or enforcement" | `orchestrating-agents` |
| "Create a new thesis/candidate batch" | `forging-novel-theses` after the section owns a selected frame |
| "We spent 100 minutes proposing candidates; report programme progress" | report `SEARCH_NOT_STARTED` / `LEARN_NOT_STARTED`; control activity is not progress |

## Execution model

Modal work is **SOLO**: landscape, issue boundary, and portfolio decision need one programme view.

The Supervisor is cold and event-woken. Evidence collection may FAN-OUT under a frozen question.
Many independent WIP=1 sections may stream concurrently. No section waits for another section's stage.

The deterministic transfer broker is not an agent. It routes exact section subscriptions without a
Supervisor or verifier. It performs no semantic interpretation, acknowledgement, or global join.

Use `orchestrating-agents` for the generic dispatch contract.

Agent confidence is not evidence. Accept a signal only when schema, signer, revision/fence,
provenance, and allowlist validate. No harness → same map, serial.

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/programme-state-and-decisions.md` | SOLE programme state model, authority, decision criteria, and cold rehydration | constructing/revising a snapshot or decision |
| `references/programme-design.md` | SOLE programme-altitude stage, frame, formulation, and multi-bet design rules | P2 or a programme reopen/retire decision |
| `references/pull-admission.md` | SOLE bid admission, event-woken lease, visibility allowlist, contamination handling, and mandate issuance | publishing an issue, handling a bid/signal, or rejecting an input |
| `assets/PROGRAMME_SNAPSHOT.md` | authoritative programme state + mandatory `PROBLEM_LANDSCAPE` component | P0/P2/P5 |
| `assets/GOAL-CONSTITUTION.md` | signer-owned external objective contract; Supervisor validates/carries only | genesis or goal amendment |
| `assets/OPEN_ISSUE.md` | pull invitation template | P3 |
| `assets/SECTION_MANDATE.md` | programme-to-section authority boundary | P4 |
| `assets/PROGRAMME_DECISION.md` | auditable programme decision template | P4/P5 |
| `assets/SECTION_SIGNAL.md` | allowlisted declassified section intake | P1/P5 |
| `tests/triggers.md` | F3 fire/no-fire desk-check | changing the description/cut |
| `tests/forge-verification-ledger.md` | forge evidence and scoped limitations | before ship/reforge |
