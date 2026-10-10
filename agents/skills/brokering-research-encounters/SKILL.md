---
name: brokering-research-encounters
description: >-
  Brokers consented research encounters into recipient-bound, non-authoritative technical memo
  offers / 技術メモ・オファー for voluntary Director pull. Use for encounter brokering / 研究交流の仲介,
  an Idea Factory pilot / アイデア・ファクトリー・パイロット, human method input / 人間の方法提案
  before it enters a section, or offer replay, expiry, and withdrawal. PURPOSE cut: pre-admission attention only; pulled input,
  admission, runs, LEARN, and SECTION_TRANSFER_PACKETs → directing-research-sections; programme work →
  supervising-research-programmes; corpus synthesis → systematizing-knowledge; document lifecycle →
  governing-research-documentation; dispatch topology → orchestrating-agents; candidate genesis →
  forging-novel-theses. It creates no candidate, decision, scientific credit, or raw upward visibility.
  Workflow-native: owning-actor acts and final broker/pilot adjudication stay SOLO; read-only frozen
  checks may fan out. English skill; respond in the user's language (default Japanese).
---

# Brokering research encounters

> **Version**: v2608.1.0 (2026-08-05) — consent-bounded pre-admission encounter bridge.

> Durable operating guidance from a frontier model (2026-08).
> If a constraint here feels unnecessary, that feeling is the failure mode — follow the map.

```bash
for f in references/encounter-loop.md references/visibility-and-authority.md references/metrics-and-pilot.md assets/ENCOUNTER-RECORD.md assets/TECHNICAL-MEMO-OFFER.md assets/ENCOUNTER-RECEIPT.md tests/triggers.md tests/forge-verification-ledger.md; do test -f "$f" || echo "MISSING $f"; done; test ! -f README.md || echo "STALE-FILE README.md"; bun ../forging-skills/scripts/skill-check.ts .
```

## Language and stable tokens

Keep these identifiers stable, including in Japanese:

```text
LAW, gate, fire / no-fire
ENCOUNTER_RECORD, TECHNICAL_MEMO_OFFER, ENCOUNTER_RECEIPT, HUMAN-METHOD-INPUT
AUTHORITY: NONE, PROGRAMME_VISIBLE: NO, EXACT_MATCH, PULL, PULL_ID
ADMIT, REJECT, DEFER, EXPIRE, WITHDRAW
```

## LAW

> An encounter may create attention; it may not create belief, a candidate, a decision, or scientific credit.

## Function map and sole owner

| Input state | Verb | SOLE artifact | Next state / stop |
|---|---|---|---|
| consented declassifiable encounter + Director-authored need binding | record / declassify / `EXACT_MATCH` / offer / close | `ENCOUNTER_RECORD` + `TECHNICAL_MEMO_OFFER` + `ENCOUNTER_RECEIPT` | voluntary `HUMAN-METHOD-INPUT` or immutable terminal non-adoption |

This skill alone owns the reusable transition above. Stop at the immutable terminal
`ENCOUNTER_RECEIPT`.

`directing-research-sections` owns pulled-offer local admission. It alone records
`HUMAN-METHOD-INPUT` and writes `ADMIT`, `REJECT`, or `DEFER`.

## B0–B6 gates

| gate | Decision | Required artifact / consequence |
|---|---|---|
| B0 `CONSENT` | Is explicit offer-routing consent current, scoped to one recipient, and revision-bound? | `ENCOUNTER_RECORD`; never infer consent |
| B1 `DECLASSIFY` | Is bounded material approved for the consented route? | `ENCOUNTER_RECORD`; denial makes no offer |
| B2 `BIND` | Is one current Director-authored need locator/digest bound to one recipient? | immutable need binding; broker owns interface only |
| B3 `EXACT_MATCH` | Do both inputs bind one normalization-rule digest, byte-equal keys, and current validity windows? | one idempotency key; mismatch/expired need makes no offer |
| B4 `OFFER` | Can the exact tuple create or replay at most one voluntary offer? | `TECHNICAL_MEMO_OFFER`; no broadcast, no acknowledgement wait |
| B5 `PULL` | Did the named Director voluntarily pull before expiry? | one Director-owned local `HUMAN-METHOD-INPUT` carrying canonical `PULL_ID` and actor evidence; it carries no admission |
| B6 `CLOSE` | Has expiry, withdrawal, or Director disposition produced one terminal outcome? | immutable `ENCOUNTER_RECEIPT`; replay is byte-identical |

No artifact means its gate did not pass. Use the SOLE rules in
`references/encounter-loop.md`; do not restate lifecycle or replay semantics here.

## Procedure

1. Record the human-originated encounter only with explicit consent scope and validity. Record its
   restricted raw locus/digest and a declassification decision. Raw material is neither indexed nor
   Supervisor-visible.
2. Bind one Director-authored need by stable locator/digest, recipient section, required exact keys,
   and validity. A separate recipient requires a separate need, scope check, offer, and lifecycle.
3. Require both inputs to bind the same normalization-rule ID/digest, then compare stable tokens.
   Every required need key must byte-equal a declassified encounter key. Embeddings, ranking,
   similarity, and global search are prohibited.
4. Deterministically create one offer for the encounter/need/recipient/consent-revision tuple, or
   return its existing ID. The offer is voluntary, pre-admission, and non-credit. It never waits for
   acknowledgement, quorum, Supervisor, verifier, or unrelated work.
5. On valid `PULL`, hand only the offer locator/digest and bounded declassified body to the Section
   Director. The Director records exactly one local `HUMAN-METHOD-INPUT`. It binds the canonical
   `PULL_ID`, Director/grant evidence, source/time/scope, and `AUTHORITY: NONE`. Duplicate pull replay
   returns that same frozen record. Only the Director may decide `ADMIT`, `REJECT`, or `DEFER`.
6. Close on `EXPIRE`, `WITHDRAW`, or the cited Director disposition. Preserve bounded negative pilot
   records. Late withdrawal appends consent history and prevents new offers; it never rewrites a
   terminal receipt. Privacy/legal purge is separate.

## MUST-NOT-FIRE and typed routing

| Ask | Route / reason |
|---|---|
| Synthesize a corpus into an accepted position | `systematizing-knowledge` — source corpus → position; this skill consumes an accepted SoK only |
| As recipient Director, record an already-pulled offer as `HUMAN-METHOD-INPUT` or decide `ADMIT` / `REJECT` / `DEFER` | `directing-research-sections` — pre-admission bridge stops before local admission |
| Publish a committed `LEARN` laterally or use packet/subscription/delivery/transfer-commit semantics | `directing-research-sections` — committed learning only |
| Create an issue, mandate, portfolio decision, or inspect method bodies upward | `supervising-research-programmes` — programme control; no raw method, offer body, need body, or lateral packet |
| Govern durable locus, lineage, review, retirement, or deletion | `governing-research-documentation` — documentation lifecycle, no semantic admission |
| Design actors, dispatch, visibility topology, vetoes, or acceptance | `orchestrating-agents` — control-plane topology only |
| Generate a candidate from a memo or offer | `forging-novel-theses` — candidate genesis; broker never auto-generates |
| Build a generic matcher, provider, hook, or durable engine unrelated to this encounter contract | `implementing-and-debugging` plus the platform owner |

Never author candidate/test, run, scientific receipt, `LEARN`, programme signal, or a lateral
committed-learning packet. Never decide admission or counterfeit consent or Director action. Never
treat delivery, replay, offers, tokens, or fan-out as scientific credit.

A later implementation of this specific encounter contract co-fires this skill for domain gates.
`implementing-and-debugging` and the platform owner alone own code/runtime changes. This forge and
pilot authorize no live implementation.

## Execution model

Evidence archetype: `AUTHORITY-RECEIPT`. Evidence is the exact artifact join plus the act authored
by its owning actor.

Helpers may relay or validate. They never counterfeit human consent, Director need, pull/admission,
or scientific `LEARN`. Worker PASS opinion is not evidence. The modal invocation is one encounter,
SOLO, zero helpers. SOLO: function/visibility interpretation, each disposition, metrics adjudication,
final acceptance. FAN-OUT: read-only schema/lifecycle checks on disjoint frozen artifacts.
`EXACT_MATCH` and idempotency are deterministic/serial; do not use an agent for grep. HUMAN/named
owner: source consent, Director pull/admission, pilot release. No harness means the same map runs serially.

## Reference index

| File | SOLE ownership | Read when |
|---|---|---|
| `references/encounter-loop.md` | lifecycle meanings and manual decision procedure | recording, matching, offering, replaying, or closing |
| `references/visibility-and-authority.md` | authority and visibility boundary | evaluating consent, declassification, raw visibility, or handoff |
| `references/metrics-and-pilot.md` | metrics, pilot structure, and credit boundary | planning or adjudicating the Idea Factory pilot |
| `assets/ENCOUNTER-RECORD.md` | copy-out encounter field template | recording a consented and declassified encounter |
| `assets/TECHNICAL-MEMO-OFFER.md` | copy-out offer field template | freezing one exact recipient-bound offer |
| `assets/ENCOUNTER-RECEIPT.md` | copy-out immutable terminal field template | closing or replaying one offer lifecycle |
| `tests/triggers.md` | F3 fire/no-fire and co-fire desk check | changing description or routing |
| `tests/forge-verification-ledger.md` | source grades, F1/F2/F3 evidence, and pending verification | freezing, auditing, or reforging |
