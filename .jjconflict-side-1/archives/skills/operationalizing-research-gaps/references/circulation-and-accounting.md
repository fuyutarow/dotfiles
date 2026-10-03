# Circulation and accounting — the sheet, the cap, the burial, and the numbers

> **SOLE owner** of the sheet header contract, the anchoring rule, the tail cap, the burial
> declaration, addressing and expiry, the terminal classes, the uptake rate, and the self-retirement
> threshold. It does NOT own delivery: consent, need-matching, offers, and pull belong to
> NO SKILL in this collection today (see §5's declared residual); durable locus and authority belong to
> `governing-research-documentation`. This file decides what a sheet must contain and what its numbers
> may say.

## 1. Sheet header contract

Every `OPENINGS SHEET` opens with these lines, literally (the floor script checks the tokens):

```text
SOURCE POSITION: <locus of the signed position> @ <version or date or sha256>
COVERAGE: <the position's coverage contract, restated by pointer, never widened>
AUTHORITY: NONE
CYCLE: <start date> -> <close date>
RETIREMENT THRESHOLD: <the uptake rate below which this sheet's layer retires itself>
BURIED: <what this synthesis consolidates away, and which conflicts it keeps open>
```

`AUTHORITY: NONE` is on the sheet for the reason RFC 3 states about its own notes: a written statement
is read as authoritative by default, and this layer has earned no authority. The same token carries an
independent load in this population: multi-agent debate "often fail[s] to outperform simple
single-agent baselines" at higher inference cost (`GENERATIVE-SOK.md` §G8), so agreement between
workers is not evidence — both reasons apply and neither replaces the other.

`RETIREMENT THRESHOLD` is fixed **before** the cycle opens. A sheet whose threshold is written at
close time is unfalsifiable and its numbers may not be reported.

## 2. Anchoring — every row cites the core

Each row carries an anchor: a locus in the signed position (claim ID, gap row, discrepancy record, or
`DONOR SET` donor ID). A row with no anchor does not ship.

The rule is not bookkeeping. The measured high-impact shape is exceptional conventionality *plus* an
intrusion of unusual combinations (`GENERATIVE-SOK.md` §G3); an unanchored row is the
low-conventionality quadrant, which the evidence does not support.

## 3. The tail cap

```text
count(NON-ADJACENCY) <= count(GAP) + count(TASK)
```

Enforced mechanically by `scripts/openings-check.ts`. Unusual combinations enter as an *intrusion into*
a conventional body; a sheet that is mostly cross-domain leaps is a different shape with no evidence
behind it. When the cap binds, the correct response is to bind more retiring observations to the
conventional rows — never to delete the tail, and never to raise the cap.

The cap counts rows, not importance. It is not a ranking and must not be read as one.

## 4. The burial declaration

State two things, plainly, in `BURIED:`:

1. **What this synthesis consolidates away** — the sources it summarizes such that a reader will cite
   the summary instead of them.
2. **Which live conflicts it is deliberately keeping open** — the `CONTRADICTION` rows, named.

Papers cited inside a formal review generally lose future citations while the few named as bridges
gain disproportionate attention (`GENERATIVE-SOK.md` §G2). That redistribution happens whether or not
it is declared. Declaring it makes the choice auditable and makes an unnoticed smoothing visible.

The effect was measured on journal review articles, not on internal agent-facing sheets. Do not claim
the magnitude here; the rule is a design response to a mechanism, not a measured property of our own
artifacts.

## 5. Addressing and expiry

| Field | Contract |
|---|---|
| Addressee | a named role, section, or subscription term the recipient already declared. "Anyone" is not an addressee, and an unaddressed row does not ship |
| `EXPIRES` | an ISO date. Rows do not persist silently; an undated row becomes permanent furniture and stops being read |
| Publication threshold | one sentence plus a `RETIRED-BY` observation. An unpolished, question-shaped row is admissible — RFC 3's stated purpose was exactly to defeat the hesitancy to publish something unpolished, and holding a row until it is presentable is the failure this form prevents |

Addressing is not delivery. This skill writes who a row is for. Whether a row is offered, matched
against a declared need, consented to, and pulled is a **DECLARED RESIDUAL: no skill in this
collection owns it today** — an owner existed when this skill was forged and is no longer in the
repository. Until one exists, stop at addressing: never broadcast a sheet, never push a row at a
section that declared no matching need, and never implement a delivery channel here to fill the hole.
Say the residual out loud when a user asks for delivery.

## 6. Terminal classes

Exactly one per closed row:

| Class | Meaning |
|---|---|
| `RETIRED-BY-EVIDENCE` | the pre-declared observation was made and its outcome occurred |
| `SUPERSEDED` | a later signed position or a broader row covers it; the question was not answered |
| `EXPIRED` | the date passed with no action |
| `WITHDRAWN` | the author pulled it, or the referee was defective; the reason is recorded |

`EXPIRED` is a normal outcome, not an incident, and it penalizes nobody. Most stated research needs
are not taken up, and priority-setting processes generally never check whether theirs were
(`GENERATIVE-SOK.md` §G9). A layer that treats expiry as failure will manufacture activity instead of
retirements.

## 7. The numbers — and the two that are forbidden

```text
uptake rate = count(RETIRED-BY-EVIDENCE) / count(rows closed this cycle)
```

Report the numerator, the denominator, and the cycle window. Nothing else derived from row counts is
reportable.

**Forbidden numbers**, without exception:

- rows written, rows delivered, rows read, rows pulled, rows discussed;
- any of the above as SEARCH, LEARN, `searchReceipts`, `learningCommits`, `searchPerHour`, or
  `learnPerHour` — those counters have their own owners and this layer increments none of them;
- any acceleration, speed-up, or discovery-rate claim attributed to the layer.

The reason is not modesty. Ideation-stage judgment is directly discredited — executed LLM-generated
ideas fell significantly on every metric with rank flips against human ideas (`GENERATIVE-SOK.md`
§GF8) — and the uptake evidence says stated-need counts are uninformative about what happens next.

## 8. Self-retirement

Apply the threshold that was fixed in the header:

- Uptake rate at or below the threshold for **two consecutive cycles** → the layer retires itself for
  that corpus. Say so plainly, record the two cycles' numbers, and stop producing sheets there.
- A single bad cycle is not a retirement, and a threshold moved after seeing a cycle's result is a
  withdrawn threshold — record it as `WITHDRAWN` and fix a new one before the next cycle.

The self-retirement rule exists because the one thing the priority-setting literature reliably fails to
do is check whether its own priorities went anywhere. A generative layer without a condition it can
fail is advocacy with a table.
