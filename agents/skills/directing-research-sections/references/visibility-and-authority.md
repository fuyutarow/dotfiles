# Visibility and authority — SOLE owner of the section boundary

The `SECTION_MANDATE` is the programme-owned external contract. It supplies only the issue identifier,
revision/fence, target relation, hard constraints, allowed return fields, and revocation rule.
The `SECTION_CHARTER` is Director-owned local work design. It may choose method, protocol, candidate
criteria, test sequence, and local review cadence; it cannot reinterpret the target relation or change
the programme's issue set.

## Immutable bearer rule

One actor instance receives one immutable role grant in one context. Searcher, builder, executor, learner,
and Director are distinct actor instances; no role label change or same-instance handoff is valid even
when the same human or model provider is involved. Distinct instances and frozen packets are required.

## Input classes

| Class | May do | Cannot do |
|---|---|---|
| Director | admit local handoffs, order work, write charter/state/intent/commit/review/signal | candidate genesis, building, execution, observation, learning-proposal authorship, programme mutation, receipt authorship |
| Searcher | propose candidates, retrieve evidence | admission, state writing, build, execution, learning authority |
| Builder | write executable specification/implementation | admission, execution, observation, state or learning authority |
| Human method proposer | provide `HUMAN-METHOD-INPUT` | programme authority, direct admission, raw upward transport |
| Executor | create immutable terminal receipt/provenance | charter/admission/programme decision or learning-proposal authorship |
| Section learner | write a receipt-linked learning proposal | state commit, candidate genesis, build, execution, or receipt authorship |
| Deterministic broker | exact-match immutable subscriptions and append delivery records | interpretation, admission, state mutation, LLM judgment, global truth |
| Auditor/verifier | audit terminal packet / promote only V2/V3 output | loop repair, pre-action model verification, state commit |

Quarantine a human proposal with source identifier, timestamp, declared scope, conflict note, and the
literal token `AUTHORITY: NONE`. It is a local input, not a mandate amendment. Summarize only a
declassified effect in `SECTION_SIGNAL`; do not expose proposal wording upward.

The same rule applies laterally. A `SECTION_TRANSFER_PACKET` may carry only a receipt-grounded delta
authorized by the source Director after commit. It must state `VISIBILITY: SECTION_FEDERATION_ONLY`,
`PROGRAMME_VISIBLE: NO`, and `RAW_HUMAN_METHOD_INCLUDED: NO`.

## Upward allowlist

The Programme Supervisor receives only a `SECTION_SIGNAL` matching its intake superset or a typed,
declassified `SECTION_REOPEN_REQUEST`. `SECTION_REVIEW` stays local and belongs only in the frozen
terminal packet available to `auditing-research-processes`. The signal carries identifiers/digests,
revision/fence, lifecycle/outcome class, bounded evidence, uncertainty, coverage assertion, resource
delta, and decision request. It may not contain raw candidate prose, method/protocol details, transcript,
prompt, workspace, credential, or unreviewed human feedback. If a programme decision needs forbidden
content, return `DECLASSIFICATION-BLOCKED` with a safe locator and pause.

Transfer packet, subscription, delivery, admission, and adoption bodies are outside the upward allowlist.
Only bounded aggregate propagation metrics, topic coverage gaps, and conflict alarms may appear in the
byte-identical `SECTION_SIGNAL` interface.

## Reciprocal cuts

`supervising-research-programmes` owns programme questions and pull-based grants; this skill owns one
granted section's local execution. `auditing-research-processes` consumes terminal frozen packets and
returns recommendations; it cannot revise this section. `orchestrating-agents` owns dispatch topology,
not this domain's admission semantics.
