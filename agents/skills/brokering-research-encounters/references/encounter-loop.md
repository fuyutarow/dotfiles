# Encounter loop — SOLE owner of broker operation

**LAW:** An encounter may create attention; it may not create belief, a candidate, a decision,
or scientific credit.

This reference is the SOLE owner of broker input preconditions, `EXACT_MATCH`, lifecycle,
idempotency/replay, withdrawal precedence, pull handoff, terminal close, and manual operation.
Assets carry fields only; `visibility-and-authority.md` is the SOLE owner of who may see or
author them. `metrics-and-pilot.md` owns metric formulas;
`agents/research-control/IDEA-FACTORY-PILOT.md` owns instance thresholds.

## Function and preconditions

```text
consented declassifiable encounter + Director-authored need binding
  --record / declassify / deterministic exact-match / offer / close-->
ENCOUNTER_RECORD + TECHNICAL_MEMO_OFFER + ENCOUNTER_RECEIPT
  --> voluntary PULL as existing HUMAN-METHOD-INPUT | terminal non-adoption
```

Stop at an immutable terminal `ENCOUNTER_RECEIPT`. This is not candidate/test work, a RUN,
scientific receipt, `LEARN`, programme signal, or lateral committed-learning packet.

Before an offer, manually verify both inputs:

1. A human-originated encounter has explicit offer-routing consent. Record scope, revision,
   validity, restricted raw locus/digest, and declassification decision. Presence never implies
   consent.
2. A Director-authored need binding has a locator/digest, one recipient section,
   `REQUIRED_MATCH_KEYS`, the same normalization-rule ID/digest as the encounter, and its validity
   window. The broker owns the interface, never its meaning.

Invalid or expired consent, declassification denial, expired need, or mismatch creates no offer.
Retain only a bounded negative pilot record; do not invent a candidate or receipt.

## `EXACT_MATCH` gate

Normalize stable tokens once under the exact rule ID/digest bound by both inputs. `EXACT_MATCH`
holds only when the rule bindings agree, every `REQUIRED_MATCH_KEY` is byte-equal to a declassified
encounter `MATCH_KEY`, the recipient is inside consent scope, and both validity windows include the
action time. Do not use embeddings, similarity, ranking, or global search.

All offer, pull, and receipt keys use `BROKER-KEY-CANON-v1`:

1. Accept JSON strings only; reject nulls, numbers, implicit coercion, malformed Unicode, and empty
   components. Fixed schema/literal components are exact ASCII. SHA components must already be
   lowercase 64-character hexadecimal; reject rather than lowercase them.
2. Normalize recipient IDs and consent revisions to Unicode NFC. Reject leading/trailing Unicode
   `White_Space`, C0/C1 controls (`U+0000–U+001F`, `U+007F–U+009F`), and empty normalized values.
   Never trim, case-fold, or locale-transform.
3. Construct the exact ordered string array and serialize it with RFC 8785 JSON Canonicalization
   Scheme. Encode the serialized bytes as UTF-8 with no BOM and no trailing newline. The key is the
   lowercase hexadecimal SHA-256 of those bytes.

The exact arrays are offer `["v1", encounter_sha, need_sha, recipient_nfc,
consent_revision_nfc]`, pull `["v1", offer_sha, recipient_nfc, "pull"]`, and receipt
`["v1", offer_sha, "terminal"]`. The offer tuple yields at most one offer. The pull tuple yields
exactly one Director-authored `HUMAN-METHOD-INPUT` as pull evidence. The outcome-independent receipt
tuple prevents conflicting outcomes from minting two receipts. A separate recipient requires a
separate need, scope, offer, and lifecycle; never broadcast. Both key-bearing templates must bind
`KEY_CANONICALIZATION_RULE_ID: BROKER-KEY-CANON-v1`.

Set offer expiry to the earliest of current consent expiry, current need expiry, and any predeclared
shorter broker cap. Never extend a frozen offer in place; a changed consent or need revision requires
a new tuple and lifecycle.

## State machine and precedence

```text
DRAFT --consent + declassification + EXACT_MATCH--> OPEN
OPEN --voluntary Director PULL before expiry--> PULLED
OPEN --deadline--> EXPIRED (terminal)
OPEN|PULLED --source WITHDRAW before local admission--> WITHDRAWN (terminal)
PULLED --Director REJECT--> PULLED_REJECT (terminal)
PULLED --Director DEFER--> PULLED_DEFER (terminal; a later attempt needs a new offer)
PULLED --Director ADMIT--> PULLED_ADMIT (terminal; admission remains local)
```

Every `ENCOUNTER_RECORD` is one immutable consent revision. Withdrawal appends a successor consent
revision/history event and never mutates the record or offer already bound by digest. Order events
by RFC-3339 instant, then by this total same-instant precedence:

```text
WITHDRAW < EXPIRE < PULL < REJECT < DEFER < ADMIT
```

Process the first event that is valid for the state; the first valid terminal event closes the
lifecycle. `PULL` is nonterminal but precedes same-instant dispositions, so a Director may pull and
dispose at one instant. `EXPIRE` is valid only in `OPEN`, and a pull at the exact expiry instant is
therefore too late. `WITHDRAW` outranks every same-instant disposition as the consent-safe result.
Conflicting same-instant Director dispositions deterministically select `REJECT`, then `DEFER`, then
`ADMIT`; the conflict is also a protocol-integrity failure and cannot yield structural PASS. An
event after terminal closure appends history only: consent withdrawal prevents future offers but
never rewrites the terminal receipt or its evidence. Privacy/legal purge is a separate process.

## Manual decision procedure

```text
resolve the canonical offer by idempotency key
if no canonical offer exists:
  if consent invalid OR declassification not approved OR need invalid OR not EXACT_MATCH:
    preserve one bounded negative pilot record; stop
  freeze ENCOUNTER_RECORD; externally compute its SHA-256
  freeze TECHNICAL_MEMO_OFFER with that encounter SHA; externally compute its SHA-256
else:
  reuse its canonical ID and frozen bytes; do not increment offer/exposure/denominator counts
if terminal receipt exists for the canonical receipt key:
  return its byte-identical receipt and digest; do not replay attention or credit
if current state is OPEN: present the offer only to its recipient section
on PULL: resolve exactly one Director-authored HUMAN-METHOD-INPUT by the canonical pull key
  same key + same frozen bytes returns the same input ID/digest without another pull or exposure
  same key + different bytes/actor evidence is an integrity failure; create nothing
sort lifecycle events by instant and the total precedence table, then apply the first valid event
if current state is PULLED: require the exact Director-local HUMAN-METHOD-INPUT digest join
freeze one terminal ENCOUNTER_RECEIPT; later events append history only
```

`PULL` is voluntary and is never an admission. At this seam, the Section Director—not the broker—
authors and freezes exactly one local `HUMAN-METHOD-INPUT` as the pull-evidence record. It must bind
`PULL_ID`, the canonical pull key, `PULLED_AT`, `PULLED_BY_DIRECTOR_ID`, Director grant
locator/digest, recipient section, canonical `OFFER_ID`/offer digest, source/time/scope,
`AUTHORITY: NONE`, and the bounded declassified body. Its external SHA-256 is the pull-evidence
digest. A duplicate canonical pull returns the same input ID and byte-identical frozen record; a
conflicting duplicate is rejected and produces no second input or receipt. The Director alone later
writes `ADMIT`, `REJECT`, or `DEFER` under current local axes/WIP. The broker only verifies and cites
the existing evidence/disposition; it never authors it, a candidate, or a test.

Close with exactly one terminal outcome: `EXPIRED`, `WITHDRAWN`, `PULLED_REJECT`,
`PULLED_DEFER`, or `PULLED_ADMIT`. Every pulled outcome binds the existing
`HUMAN-METHOD-INPUT`/pull-evidence digest; a disposition outcome also binds the Director admission
record. `WITHDRAWN` binds that input only when it occurred post-pull and pre-admission. `EXPIRED`
and pre-pull `WITHDRAWN` use no pull evidence. Terminal replay returns byte-identical
receipt/digest. Never wait for acknowledgement, quorum, all recipients, Supervisor, verifier, or
a global join; source, recipient, and unrelated work continue.

## Metric seam

An encounter receipt is not `RUN_RECEIPT` and cannot create `LEARN`. Count a unique downstream
`LEARN_ID` at most once; retain negative terminals; treat shadow work as structural only. Formulas
belong to `metrics-and-pilot.md`; pilot thresholds belong to the pilot document, not this loop.
