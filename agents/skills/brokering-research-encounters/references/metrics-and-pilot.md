# Metrics and pilot contract

> SOLE home for reusable broker measurement definitions, joins, formulas, and gate order.
> Concrete arms, numerical margins, samples, windows, fixtures, and stops belong only in
> `agents/research-control/IDEA-FACTORY-PILOT.md`.

## Credit LAW and reusable event vocabulary

`ENCOUNTER_RECORD`, `TECHNICAL_MEMO_OFFER`, `HUMAN-METHOD-INPUT`, and
`ENCOUNTER_RECEIPT` are broker-boundary artifacts. Lifecycle and visibility meanings remain sole
to [encounter-loop.md](encounter-loop.md) and
[visibility-and-authority.md](visibility-and-authority.md); this file does not re-authorize them.

| Event / field | Required measurement meaning |
|---|---|
| `PILOT_REVISION_DIGEST`, `CHARTER_DIGEST`, `ARM_ID`, `NEED_WINDOW_ID` | Frozen protocol and one preassigned comparable need-window arm; joins never cross revisions. |
| `ENCOUNTER_ID`, `NEED_LOCATOR`, `NEED_DIGEST`, `RECIPIENT_ID`, `CONSENT_REVISION`, `IDEMPOTENCY_KEY` | Exact encounter/need/recipient/consent tuple and replay fence. |
| `NORMALIZED_REQUIRED_KEYS`, `NORMALIZED_ENCOUNTER_KEYS`, `EXACT_MATCH` | Byte-equal normalized-key evidence; no similarity, ranking, or model score. |
| `OFFER_ID`, `OFFER_EXPOSURE_AT`, `PULL_ID`, `PULL_IDEMPOTENCY_KEY`, `PULL_EVIDENCE_SHA256`, `PULL_AT`, `TERMINAL_AT`, `RECEIPT_ID`, `RECEIPT_OUTCOME` | Treatment offer, Director-authored pull evidence, and immutable terminal join. Receipt outcomes: `EXPIRED`, `WITHDRAWN`, `PULLED_REJECT`, `PULLED_DEFER`, `PULLED_ADMIT`. |
| `HUMAN_METHOD_INPUT_ID`, `LOCAL_DISPOSITION`, `CANDIDATE_OR_TEST_ID`, `RUN_INTENT_ID`, `RUN_RECEIPT_ID`, `LEARN_PROPOSAL_ID`, `LEARN_ID`, `DIRECTOR_COMMIT_ID` | Downstream local chain fields; broker owns none of these acts. |
| `DISCOVERY_ITEM_ID`, `DISCOVERY_ITEM_KIND`, `EXPOSURE_AT` | First exposure: treatment is one `TECHNICAL_MEMO_OFFER`; baseline is one repo-search result or manual share exposed to the Director, never an invented offer. |
| `TERMINAL_DISCOVERY_ID`, `TERMINAL_DISCOVERY_KIND`, `TERMINAL_DISCOVERY_OUTCOME` | Treatment binds `ENCOUNTER_RECEIPT`; baseline binds a pilot-ledger terminal record to the Director disposition without pretending it is a broker receipt. |
| `ARM_WALL_CLOCK_START`, `ARM_WALL_CLOCK_END`, `ITEM_CYCLE_START`, `ITEM_CYCLE_END`, `ACTIVE_ATTENTION_MINUTES`, `TIMER_RULE_ID` | Predeclared arm wall-clock denominator, item-cycle diagnostics, and attention accounting. |
| `REPLAY_OF`, `MULTI_SOURCE`, `NEGATIVE_REASON`, `EXCLUSION_REASON` | Replay, convergent-source, negative, and prespecified-exclusion audit fields. |

**LAW:** An encounter may create attention; it may not create belief, a candidate, a decision,
or scientific credit. `SEARCH_CREDIT=0` and `LEARN_CREDIT=0` on every encounter receipt. An
`ENCOUNTER_RECEIPT` is not a scientific `RUN_RECEIPT`.

## Eligibility, joins, and accounting units

An **eligible need-window** is a preassigned arm opportunity under a current protocol revision and
its predeclared eligibility rules. Assignment occurs before consent/declassification result, body,
or outcome access. A window therefore remains in the opportunity denominator after a valid
negative: absent/denied/expired consent, declassification denial, exact-key mismatch, no exposure,
no pull, expiry, withdrawal, rejection, or deferral. A `DISCOVERY_ITEM` exists only when an item is
actually exposed. Prespecified exclusions may remove a window only before outcome access and must
retain `EXCLUSION_REASON`; duplicate/replay is deduplicated, not newly eligible.

Within an eligible treatment window, offer creation requires the exact tuple, current consent and
declassification, current need validity, and `EXACT_MATCH=true`. A failed prerequisite produces no
offer or discovery exposure; it produces one bounded negative opportunity record. One
`ENCOUNTER_ID`/`NEED_DIGEST`/`RECIPIENT_ID`/`CONSENT_REVISION` has at most one `OFFER_ID` through
`IDEMPOTENCY_KEY`. The canonical pull key likewise yields one Director-authored pull-evidence
record. A repeat with the same identity and frozen bytes is `REPLAY_OF` but adds no offer, pull,
exposure, opportunity denominator, numerator, or credit; conflicting bytes are an integrity failure.
A diagnostic replay-attempt counter may increase only if it remains outside every productivity count.

The **valid downstream scientific chain** starts through one arm-specific discovery lineage:

```text
treatment: TECHNICAL_MEMO_OFFER -> Director HUMAN-METHOD-INPUT(PULL evidence)
  -> Director ADMIT -> ENCOUNTER_RECEIPT(PULLED_ADMIT)
baseline: repo-search/manual share -> voluntary review -> Director ADMIT -> BASELINE_TERMINAL_RECORD
  -> Director-admitted candidate/test
  -> RUN_INTENT
  -> immutable RUN_RECEIPT
  -> learner proposal
  -> Director COMMIT with LEARN_ID
```

Every arrow is an exact local-ID/digest join. The baseline terminal record is measurement-only and
must bind an existing Director disposition; it is neither an offer nor authority. Count a chain
only if it ends in a valid receipt-linked Director `COMMIT` and has a unique `LEARN_ID`. The
scientific numerator is unique such `LEARN_ID`s, counted once. Multiple items/offers/sources reaching
one `LEARN_ID` record `MULTI_SOURCE=true` and count one. Memos, offers, pulls, tokens, agents,
fan-out, delivery, replay, and terminal discovery records are never scientific numerator.

## Funnel and formulas

Keep both arms on this normalized diagnostic funnel, preserving terminal negative evidence:

```text
eligible need-window -> discovery item -> voluntary pull/review -> local ADMIT
               -> arm-specific terminal discovery record
               -> unique downstream receipt-linked LEARN
```

For arm `a`, let `L_a` be unique valid receipt-linked `LEARN_ID`s, `W_a` elapsed arm wall-clock
hours, `A_a` active attention hours, `N_a` eligible need-windows, `D_a` unique exposed discovery
items, `P_a` voluntary pulls/reviews, `M_a` local admits, and `T_a[o]` arm-specific terminal
discovery records by outcome `o`.

| Measure | Formula | Accounting rule |
|---|---|---|
| Primary North Star | `L_a / W_a` | Unique receipt-linked scientific LEARN per eligible wall-clock hour. |
| Attention-normalized chain rate | `L_a / A_a` | Same unique numerator; cost-sensitive secondary outcome. |
| Funnel | `N_a, D_a, P_a, M_a, Σ_o T_a[o], L_a` and adjacent ratios when defined | Report counts first; an eligible no-offer opportunity remains in `N_a`; do not substitute offer count for opportunity count. |
| Relative productivity | `(L_t/W_t) / (L_b/W_b)` | Defined only with positive finite denominators and concrete protocol-required positive numerators. |
| Relative attention chain rate | `(L_t/A_t) / (L_b/A_b)` | Same definedness rule; concrete margin belongs in the pilot charter. |

`W_a` is the predeclared fixed arm end minus arm start in real elapsed hours. It includes idle and
negative-outcome time and is never a sum of overlapping item, section, agent, or token hours.
Per-item cycle times are diagnostics only. `A_a` sums active source preparation/declassification,
broker exact-match review, Director triage, and reconciliation. Baseline includes search/query/manual
sharing plus the same local review. Freeze timer start/stop and rounding rules before outcomes;
only those rules may be applied.

## Structural gate before productivity

| Structural condition | PASS condition |
|---|---|
| Authority leakage | `0`: broker did not author consent, Director act, admission, candidate/test, run, scientific receipt, LEARN, or programme signal; raw method/need/offer body did not reach Supervisor. |
| Auto-admission | `0`: no pull or offer was treated as a Director local `ADMIT`. |
| Double credit | `0`: one `LEARN_ID` was never counted twice, including multi-offer and replay cases. |
| Global barrier | `0`: no acknowledgement, quorum, global join, or no-adoption blocked source, recipient, or unrelated progress. |
| Lifecycle exactness | Fixtures/records preserve match, idempotency/replay, expiry, withdrawal, and immutable terminal receipt semantics. |

Shadow work can PASS structural conditions only; it can never PASS productivity. Productivity PASS
requires a prospective manual phase after structural PASS and explicit human/pilot release. If a
baseline or treatment denominator/numerator makes a ratio undefined, productivity cannot PASS; the
concrete charter reports `INCONCLUSIVE` under its frozen rule.

## Freeze and interpretation discipline

Before outcome or body exposure, freeze every denominator, arm, assignment, sample, threshold,
stop condition, timer rule, and protocol digest. A change after outcome access invalidates that
revision and requires a new future pilot; it cannot rewrite prior charter, ledger, receipt, or
result. Report funnel counts, negative terminals, exclusions, replay, `MULTI_SOURCE`, uncertainty,
and small-pilot limitations. This tests a bounded manual comparison; it cannot establish general
human-to-LLM efficacy.
