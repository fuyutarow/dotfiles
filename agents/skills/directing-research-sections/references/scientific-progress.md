# Scientific progress — SOLE owner of section progress semantics

This file is the sole semantic home for section `SEARCH` and `LEARN` progress, live-lease limits,
receipt consumption, and model-promotion gates. It does not define runtime checker grammar; that belongs
only to the runtime.

## What counts as progress

The operational North Star is goal-aligned, current-grounded, nonduplicate, minimally discriminating,
measurement-valid receipt-linked LEARN/hour. `learnPerHour` is the primary closed-loop measure;
`searchPerHour` is a leading measure and must not be raised by leaving receipts
unconsumed. Both are subordinate to prospective intent, evidence lineage, immutable role authority,
programme relevance, safety, and signed resource limits.

Control artifacts — including bids, mandates, charters, candidate packets, denominator records,
normalizations, audit briefs, continuations, and verification attempts — are necessary coordination but
never scientific progress. `.agent-state` is control state and cannot be scientific evidence.

`SEARCH` starts only when an executor writes a terminal receipt joined to a prospective intent. `LEARN`
starts only when a previously unconsumed receipt is consumed by a section-learner proposal and a distinct
Director makes a separate state commit. A receipt, exact blocker, or proposal without its required joins
does not advance the corresponding state.

A discriminating null, falsification, negative, or KILL receipt counts exactly like a positive result.
Replayed receipts, one observation split into several packets, nondiscriminating trivial runs, and
learning prose without a distinct Director commit count zero. Candidate, agent, document, prompt, token,
verifier, smoke, sweep-point, and instrumentation counts are reported separately and never enter SEARCH or LEARN.
Measurement validity `FAIL` or `UNKNOWN` is instrumentation repair, not scientific SEARCH or LEARN.

Cross-section transfer publication, delivery fan-out, replay, recipient admission, and recipient adoption
are also separate propagation activity. One source receipt and Director commit contribute once; no transfer
event creates another SEARCH receipt, LEARN commit, `searchPerHour`, or `learnPerHour` increment.

A proposal-only episode, including 100 minutes of proposal work, is `SEARCH_NOT_STARTED`,
`LEARN_NOT_STARTED`, and `SECTION_STALLED`. It is not a failed experiment, evidence result, or permission
to claim momentum.

## Immutable roles and handoffs

The programme supervisor publishes the issue and lease constraints. The Director admits local handoffs,
orders work, and commits local state. A searcher generates candidate/evidence packets; a builder produces
an executable specification; an executor performs the prospective work and owns the immutable receipt;
a section learner authors the evidence-linked learning proposal. These are distinct immutable actor
instances. The Director MUST NOT generate candidates, build, execute, observe, verify, or author a
learning proposal.

## Bounded live ledger

Use a live `SECTION_STATE` ledger, not a frozen batch denominator. Retain every negative, rejected,
deferred, mapping-break, and loser record with its reason, but do not require the entire candidate universe
to be frozen before work begins.

For a current lease, exactly one candidate/test may be admitted at a time. Before a further candidate
cycle, the preceding admitted item must reach a terminal receipt, learner proposal, and distinct Director
commit. The commit alone reopens the section WIP slot. This is the only progress loop:

`searcher handoff -> Director admission -> builder specification -> Director intent -> executor receipt -> learner proposal -> distinct Director commit -> next search`.

Each event wakes only the next eligible transition. A receipt wakes its learner immediately even while
other sections remain in search/build/execution; a learner proposal wakes Director commit immediately.
Never wait for unrelated sections, a global wave, all Directors, a minimum batch count, Supervisor review,
or a model verdict. When transitions are ready together, drain
`DIRECTOR_COMMIT > LEARNING > EXECUTION > BUILD > SEARCH`.

The exact-blocker branch is different: a valid executor-owned typed `EXACT_BLOCKER` closes or pauses the
lease. It claims neither `SEARCH` nor `LEARN`, needs no learner proposal, and cannot reopen candidate search
under that lease. Its only legal outcome is the applicable terminal local state or an external release event.

The first action in a candidate cycle must be one minimal existence/discriminator receipt. Inside an
already Programme-released mandate, full sweep, scale, or GPU port needs a receipt-linked
`DECISION=COMMIT`, `SCALE_RELEASE=ESCALATED_CONFIRMATION` Director release.
When both blocks apply, both releases are required; spare capacity never substitutes for either.

## Required semantic assets

A current `SECTION_LEASE` states its lease ID, section/mandate IDs, start and expiry, first-intent due time,
maximum control events before first intent (0–2), maximum proposals before first intent (0–1), permitted
action classes (at least one of `PROOF`, `BUILD`, `EXPERIMENT`, `MEASUREMENT`), and terminal target
(`PROOF_RECEIPT`, `RUN_RECEIPT`, `KILL_RECEIPT`, or `EXACT_BLOCKER`). The first intent is due no later
than the smaller of 30 minutes and 20% of the lease.

An intent is Director-authored and prospective. It exact-joins one admitted candidate/test to a builder's
executable specification, estimand, comparator, positive and negative controls, validity checks, measurement
contract digest, executor receipt sink, and terminal deadline. The executor receipt records the exact intent
digest, measurement-contract digest, observation evidence, and separate measurement-validity evidence. A typed exact blocker instead records a
failed prerequisite, evidence locator/digest, responsible external authority or event, and exact release
condition. `hard` and `unknown` are not blocker classes. An exact blocker ends or pauses the lease without
learning. A receipt becomes learning only through the learner/Director join.

A learner proposal cites one unconsumed receipt and declares `SCIENTIFIC` or `INSTRUMENTATION_REPAIR`.
Only `SCIENTIFIC` with measurement validity `PASS` may contribute LEARN. The distinct Director commit cites
that proposal and makes the only admissible local state transition. `REJECT` and `DEFER` earn no LEARN;
committed instrumentation repair also earns no LEARN.

## Time-normalized report

For every nonzero window, emit aggregate `candidateInventory`, `builds`, `searchReceipts`,
`learningCommits`, `searchPerHour`, `learnPerHour`, and `learningCompletion`; p50/p95 latency for
candidate-to-intent, intent-to-start, start-to-receipt, and receipt-to-commit; `readySlotIdleMs`;
`candidateComputeUtilization`; exact blocker/wait counts; and abandoned/expired attempts. Keep control
counts separate. Declassify only the bounded aggregate fields in `SECTION_SIGNAL`, never raw method,
candidate, implementation, receipt, or learning content.

Also emit grounding latency, known-duplicate rejection count, invalid-measurement rate, stale-work count,
and scale-release count. Utilization is diagnostic only.

## Model promotion and evidence boundary

Model V2/V3 verification may occur only after a completed output is eligible for promotion. It MUST NOT
fire before action, serve as a precondition for an in-mandate test, or replace the receipt-to-learning loop.
Verification timeout yields `PENDING_VERIFICATION`; it does not stop an otherwise valid in-mandate loop.

The Programme Supervisor and verifier are forbidden from the reversible per-candidate hot path. Section
Directors wake only for admission, prospective intent, and commit; they are not resident schedulers.

The same hot-path cut applies to lateral learning. Source and recipients never wait for broker delivery,
acknowledgement, another recipient, Supervisor, verifier, or global join. Exact transfer semantics live in
`cross-section-learning.md`.

Programme decisions and audits remain external: this skill emits only declassified signals or typed reopen
requests. Executor-owned receipts remain immutable. A local terminal packet may support audit, but no
audit, continuation, or control document is scientific evidence by itself.
