# Cross-section learning — SOLE owner of lateral transfer semantics

This reference owns section-to-section learning publication, exact subscription matching, delivery,
recipient admission, and local adoption. Programme portfolio semantics remain with
`supervising-research-programmes`; generic dispatch infrastructure remains with `orchestrating-agents`.
The deterministic broker is neither an agent nor a semantic owner.

## Function map and exact joins

| Input state | Verb | SOLE artifact | Next state / stop |
|---|---|---|---|
| Valid learner proposal + source `SECTION_DIRECTOR_COMMIT` with `DECISION: COMMIT` | publish once | `SECTION_TRANSFER_PACKET` | source continues without waiting |
| Immutable current subscription + exact packet identifier match | route | `SECTION_TRANSFER_DELIVERY` | recipient wakes independently |
| Current recipient mandate/charter + delivery | admit | `SECTION_TRANSFER_ADMISSION` | `ADOPT`, `REJECT`, or `DEFER`; no state mutation |
| `ADOPT` admission + current local authority | commit adoption | `SECTION_TRANSFER_COMMIT` | local prior update or candidate/test input |

The source join is exact:

`RUN_RECEIPT -> SECTION_LEARNING_PROPOSAL -> SECTION_DIRECTOR_COMMIT(DECISION=COMMIT) -> SECTION_TRANSFER_PACKET`.

The recipient join is exact:

`SECTION_SUBSCRIPTION + SECTION_TRANSFER_PACKET -> SECTION_TRANSFER_DELIVERY -> SECTION_TRANSFER_ADMISSION(ADOPT) -> SECTION_TRANSFER_COMMIT`.

Every locator is digest-addressed. A missing or mismatched commit, proposal, receipt digest,
subscription, delivery, admission, role grant, revision, or fence fails closed.

## Source emission gate

Only the source Director may authorize a packet, and only after a valid learner proposal plus its
distinct Director commit. The commit must consume the same receipt digest carried by the packet.
Publish one packet for one committed learning transition by the charter's declared publish deadline.

The packet body is exactly `assets/SECTION-TRANSFER-PACKET.md`. It is
`SECTION_FEDERATION_ONLY`, `PROGRAMME_VISIBLE: NO`, and `AUTHORITY: PROPOSAL_ONLY`.

Raw human method content never crosses. An executed intent may trace to a quarantined human suggestion,
but only the receipt-grounded, Director-committed delta may be emitted. The packet must retain
`RAW_HUMAN_METHOD_INCLUDED: NO`.

Publishing releases the source immediately. Delivery, recipient admission, acknowledgement, replay,
conflict, or absence of subscribers never blocks its next SEARCH/LEARN transition.

## Immutable subscription and deterministic delivery

Each recipient declares `SECTION_SUBSCRIPTION` in its charter or as the separate immutable asset.
It freezes exact topic IDs, affected-premise IDs, interface IDs, accepted delta classes, current lease,
and event-log cursor. A newly leased Director rehydrates from the materialized event-log view at that
cursor. Repository search is discovery/recovery only; it is not the catch-up protocol.

The broker performs exact set membership only. It does not interpret applicability, merge conflicts,
rank packets, infer synonyms, ask an LLM, or form global truth. For every current exact match it appends
one independent `SECTION_TRANSFER_DELIVERY` and wakes only that recipient.

The idempotency key is packet SHA-256 plus recipient section ID. Transport may replay, but a replay
cannot create a second delivery admission, local commit, or transfer metric increment.

## Recipient admission and commit

Every recipient Director evaluates the packet independently under its current mandate and charter.
It writes `SECTION_TRANSFER_ADMISSION` with `ADOPT`, `REJECT`, or `DEFER`, the exact packet/delivery
digests, and a bounded reason. Conflicting packets coexist; the broker does not adjudicate them.

An admission has no state authority. `ADOPT` changes local state only through a distinct
`SECTION_TRANSFER_COMMIT`, which may update a local prior or create a candidate/test input. A later
candidate still passes ordinary local admission and WIP=1. `REJECT` and `DEFER` create no adoption
commit.

No recipient waits for another recipient, delivery quorum, acknowledgement, Supervisor, verifier,
global fan-in, or workflow wave. Source and recipient work proceed independently.

## Metric and visibility boundary

One source receipt and Director learning commit contribute once to SEARCH/LEARN. Packet publication,
fan-out delivery, replay, transfer admission, and transfer adoption are propagation metrics only; they
never increment `searchReceipts`, `learningCommits`, `searchPerHour`, or `learnPerHour`.

The Programme Supervisor may receive only bounded aggregate propagation fields through
`SECTION_SIGNAL`: packet/delivery/admission counts, commit-to-delivery and delivery-to-admission
latency, replay drops, unrouted count, programme-visibility violations, topic coverage gaps, and
conflict alarms. It never receives a packet, subscription, delivery, admission, commit body, premise
delta, method content, or per-recipient acknowledgement.

## Deterministic findings for the later runtime slice

The semantic acceptance names are `COMMITTED_LEARNING_NOT_PUBLISHED`, `TRANSFER_WITHOUT_COMMIT`,
`TRANSFER_REPLAY`, `SUPERVISOR_IN_TRANSFER_PATH`, `RAW_METHOD_LEAK_TO_PROGRAMME`,
`TRANSFER_AUTO_ENACTED`, and `TRANSFER_GLOBAL_BARRIER`. This skill defines their meaning only.
Runtime grammar, broker implementation, and deterministic fixtures belong to the later V0 slice.
