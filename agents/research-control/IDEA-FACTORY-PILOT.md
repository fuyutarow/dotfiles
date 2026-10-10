# Idea Factory pilot charter — specification only

## Status, authority, and frozen inputs

**Status: SPECIFICATION ONLY.** This document creates no live engine, provider, hook, broker,
database/DBOS, delivery, or scientific run. `SEARCH=0` and `LEARN=0` remain unchanged. Any future
DBOS work is a separately authorized synthetic pilot, not authorized here.

This pre-observation charter is bound to repository HEAD
`146d0ee63d0cb89b13e7225fa8896e97e8279174`, accepted SoK SHA-256
`ce8196cd05ae6bbf8c177cfc33a3e411007dbbc92da472f1667320571d8d9d17`, and claims-ledger SHA-256
`de24cd0f5d9363b4f3574379ee25e25c40e6fe9f97d475898ccdd9f0b122561d`.

The governing LAW is: **An encounter may create attention; it may not create belief, a candidate,
a decision, or scientific credit.** The broker stops at immutable `ENCOUNTER_RECEIPT`; it never
authors candidate/test, run, scientific receipt, `LEARN`, programme signal, or lateral committed
learning. The lifecycle and authority meanings are sole to
[`encounter-loop.md`](../skills/brokering-research-encounters/references/encounter-loop.md) and
[`visibility-and-authority.md`](../skills/brokering-research-encounters/references/visibility-and-authority.md).
This charter instantiates their measurement seam; agreement is substantive, not byte-diff.

The metrics definitions, eligibility, exact joins, formulas, exclusions, and generic gate order
are sole to [`metrics-and-pilot.md`](../skills/brokering-research-encounters/references/metrics-and-pilot.md).
This charter owns only the concrete arms, numerical margins, sample/window minimums, fixtures, and
stops. Repeated zero thresholds below are a deliberate frozen seam, not a second lifecycle spec.

## Phase S — shadow structural fixtures

Phase S uses only synthetic or already declassified artifacts. It has no recipient delivery,
Director behaviour observation, productivity claim, or scientific credit. Read-only
fixture/schema validation may fan out; fixture adjudication is SOLO. Helpers cannot counterfeit
consent, Director acts, or scientific `LEARN`. No harness means the same serial focused checks.

| Fixture | Precondition / action | Expected result and count |
|---|---|---|
| Consent absent | No explicit current consent | no offer; one bounded negative `CONSENT_ABSENT`. |
| Consent expired | Consent validity ended before offer | no offer; one bounded negative `CONSENT_EXPIRED`. |
| Declass denied | Encounter material not declassified for route | no offer; one bounded negative `DECLASS_DENIED`. |
| Exact-key mismatch | Normalized required and encounter keys differ by bytes | no offer; one bounded negative `EXACT_MISMATCH`. |
| Canonical key serializer | Exercise fixed ASCII/SHA components, NFC-equivalent recipient/revision strings, forbidden surrounding whitespace/controls, and all three arrays under `BROKER-KEY-CANON-v1` | NFC-equivalent valid inputs yield the same RFC-8785 UTF-8 bytes/key; forbidden or ill-typed inputs are rejected before hashing. |
| Open to expiry | One valid offer remains unpulled through expiry | exactly one immutable `EXPIRED` receipt. |
| Open to withdrawal | One open offer is withdrawn | exactly one immutable `WITHDRAWN` receipt. |
| Pull then withdrawal before local admission | Valid pull, then withdrawal before Director disposition | exactly one immutable `WITHDRAWN` receipt; no local admission. |
| Pull then reject | Valid pull and Director local reject | exactly one immutable `PULLED_REJECT` receipt. |
| Pull then defer | Valid pull and Director local defer | exactly one immutable `PULLED_DEFER` receipt; later reconsideration needs a new offer. |
| Pull then admit | Valid pull, exactly joined local `HUMAN-METHOD-INPUT`, local admit | exactly one immutable `PULLED_ADMIT` receipt; no broker-authored candidate/test. |
| Duplicate offer replay | Repeat identical encounter/need/recipient/consent revision | same one `OFFER_ID` / idempotency key; only a non-productivity replay-attempt diagnostic may increment; no new offer, exposure, or denominator. |
| Duplicate pull replay | Repeat one canonical Director pull with the same frozen `HUMAN-METHOD-INPUT`; then try conflicting bytes/actor evidence under the same key | identical replay returns the same `PULL_ID`, input bytes, and digest with no new pull/exposure/count; conflict is rejected as structural integrity failure. |
| Duplicate terminal replay | Replay a closed identical request | byte-identical existing terminal receipt; no new receipt, denominator, or credit. |
| Equal-time total precedence | Exercise every valid same-instant pair under `WITHDRAW < EXPIRE < PULL < REJECT < DEFER < ADMIT` | first valid event in that order wins; withdrawal beats expiry and every disposition; expiry beats a pull at deadline; pull enables a same-instant disposition; conflicting dispositions choose reject/defer/admit order and are also detected as structural integrity failure. |
| Late withdrawal | Withdrawal after terminal receipt | history records late withdrawal and blocks future offers; terminal receipt unchanged. |
| Convergent sources | Multiple eligible offers later join one downstream `LEARN_ID` | one scientific numerator only; `MULTI_SOURCE=true`; no double credit. |
| No acknowledgement/global join | Source/recipient/unrelated progress while no acknowledgement arrives | no wait, quorum, barrier, or blocked source, recipient, or unrelated work. |

Fixture records preserve exact input/output digests, terminal outcome, replay linkage, and bounded
negative evidence. Phase S structural PASS requires exact expected outcome/count/digest for every
fixture and all of: authority leakage `0`, auto-admission `0`, double credit `0`, global barrier
`0`. Any violation is `FAIL`, immediately stops the path to Phase M, and is not repaired in place
after observation.

## Phase M — prospective manual comparison

Phase M may begin only after Phase S structural PASS **and** explicit human/pilot release. It is a
prospective manual comparison, not runtime deployment. The baseline is current classified
repo-search plus manual sharing: a baseline discovery item is one repo-search result or one manual
share exposed to the Director. The treatment is manual use of frozen templates and byte-exact-match
offers: a treatment discovery item is one `TECHNICAL_MEMO_OFFER`. Baseline items must never be
relabeled as offers.

Before any need body or outcome is exposed, a human records a charter digest and assigns
comparable Director need-windows by randomized block assignment to `baseline` or `treatment`,
blocking on recipient section and a predeclared need-complexity stratum. Each need-window has
exactly one arm: no same-need crossover and no treatment body exposure to a baseline window.
Eligible windows have a current Director-authored need locator/digest, required exact keys,
validity interval, and preassignment. Ineligible windows (missing preassignment, invalid need
binding, prohibited visibility, or protocol revision mismatch) are excluded before outcomes with
a reason. Treatment consent, declassification, and exact match are evaluated only after assignment;
their failure creates no offer but remains a bounded negative eligible opportunity. Expiry,
withdrawal, reject, and defer likewise remain in the funnel denominator defined by the metrics contract.

### Frozen constructed minimums and margins

These are constructed, explicitly non-empirical planning minimums, frozen before outcome/body
access:

| Requirement | Frozen value |
|---|---:|
| Eligible Director need-windows | at least 12 per arm |
| Elapsed wall-clock hours | at least 40 per arm |
| Primary PASS margin | treatment North Star `>= 1.10 ×` baseline North Star |
| Secondary PASS margin | treatment `L_t/A_t` (unique valid receipt-linked `LEARN_ID`s per attention-hour) `>= 1.20 × L_b/A_b` |
| Positive values required | both arms’ scientific numerators and attention denominators must be positive |

Productivity PASS requires every row above, both defined ratios, and the metrics contract’s
structural precondition. If either arm lacks a positive scientific numerator or attention
denominator, or a ratio is undefined, report `INCONCLUSIVE`, never PASS. No threshold, assignment,
denominator, or sample change is permitted after charter digest or outcome access; a change creates
a later new revision, never a rewrite.

### Time and attention ledger

Arms have equal, predeclared observation duration of at least 40 real elapsed hours. The primary
wall-clock denominator is the fixed arm end minus arm start; it includes idle time, negative
outcomes, and parallel work, and is never summed across windows, sections, agents, or tokens.
Per-window activation-to-terminal/cutoff time is diagnostic only. Active attention logs start/stop
intervals for source declassification/preparation, broker exact-match review, Director triage, and
reconciliation; baseline logs search/query/manual sharing plus the same local review. Record raw
minutes, aggregate by arm first, then round each aggregate to the nearest whole minute (half minutes
round up) before converting to hours. These timer rules are frozen in the charter digest.

The primary report is unique receipt-linked scientific `LEARN` per elapsed arm wall-clock hour.
The secondary report is `L_a/A_a`: the same unique valid receipt-linked `LEARN_ID` numerator used
by the North Star, counted once across replay and `MULTI_SOURCE`, per attention-hour. Treatment terminal
discovery records bind `ENCOUNTER_RECEIPT`; baseline terminal records live only in the pilot ledger
and bind the existing Director disposition without pretending to be broker receipts or authority.
The report also includes full funnel counts, eligible no-offer opportunities, all negative terminals,
exclusions, `MULTI_SOURCE`, uncertainty, and the small-pilot limitation. Memos, offers, pulls,
agents, tokens, fan-out, replay, and delivery are diagnostics or cost only, never scientific credit;
do not optimize offer count. This comparison makes no general human-to-LLM efficacy claim.

## Independent outcomes and stops

| Outcome | Condition | Consequence |
|---|---|---|
| Structural PASS | Phase S exact fixtures/digests and all four zero thresholds pass | permits an explicit human/pilot decision to release Phase M only. |
| Structural FAIL | Any fixture mismatch, missing provenance/digest, authority leakage, auto-admission, double credit, or global barrier | immediate stop; Phase M is forbidden. |
| Productivity PASS | Phase M prospective/manual only, structural PASS, minimums and both frozen productivity margins/definedness conditions pass | may support a non-enacting recommendation only. |
| Productivity INCONCLUSIVE | insufficient capacity/time, positive-value failure, undefined ratio, or incomplete frozen observation | never PASS; preserve ledger. |
| Productivity FAIL | completed eligible observation does not meet a frozen margin | preserve ledger; no threshold edit. |

A combined advancement outcome is impossible unless Structural PASS and Productivity PASS are both
independently recorded; shadow work can never have Productivity PASS. Stop immediately for a
safety or authority violation, missing required provenance/digest, or the predeclared capacity/time
end. There is no recipient acknowledgement/quorum wait, and no adoption cannot stop the source or
another section. Raw human method feedback remains local and never goes to the Supervisor.

## Outputs and non-enacting recommendation

This task creates only this frozen pilot charter. A later authorized execution may produce a
completed fixture/result ledger preserving replay, expiry, withdrawal, exclusions, and negative
evidence. It may then issue exactly one non-enacting recommendation: `do not advance`, `repeat new
revision`, or `admit later synthetic/runtime pilot`. None enacts programme state, runtime state, a
broker, or scientific work. Final structural and productivity adjudication is SOLO.
