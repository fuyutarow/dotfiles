---
name: operationalizing-research-gaps
description: >-
  Converts a SIGNED corpus position into an `OPENINGS SHEET`: typed, test-bound, addressed, expiring
  `OPENING` rows carrying `AUTHORITY: NONE`, each retired only by a pre-declared observation. Use for
  turning a finished survey into next work — 研究の空白を次の一手にする, SoK の gap を操作可能にする,
  未解決問題の棚卸し, research gap, open problem list, 生きている空白, 更新条件が受け身で使えない,
  evidence gap map, 空白の型付け, 「調査は済んだが次に何をすべきか」, referee を切る, 反証観測を決める.
  DECISIVE cut vs systematizing-knowledge: it owns what a gap IS — typology, claim ledger, `DONOR SET`
  — and signs the position FIRST; HERE owns only what makes a gap OPERABLE (reason class,
  discriminating observation, addressee, expiry, retirement). CARDINALITY cut vs
  supervising-research-programmes: N unselected non-authoritative rows carrying no allocation here;
  selection, ranking, `OPEN_ISSUE`, allocation there. PURPOSE cuts: target correspondence or thesis →
  forging-novel-theses; running one selected costly test → acting-on-hypotheses; delivering a row to a
  section that declared a need → NO OWNER TODAY, so this skill stops at addressing; durable authority
  → governing-research-documentation. LAW: an `OPENING` is a bill of work, never a finding; it may never
  create, upgrade, or soften a claim, and the sheet is measured by retirements only. Workflow-native:
  typing and test-drafting may fan out per row; the burial declaration, the tail cap, and every
  retirement stay SOLO. English skill; respond in the user's language (default Japanese).
---

# Operationalizing research gaps — from a signed position to a bill of work

> **Version**: v2608.1.0 (2026-08-05) — first forge; corpus position signed in
> `agents/research-control/GENERATIVE-SOK.md`. Findings and waivers: `tests/forge-verification-ledger.md`.

```bash
for f in references/opening-types.md references/test-and-referee.md \
  references/circulation-and-accounting.md references/sources.md \
  assets/OPENINGS-SHEET.md scripts/openings-check.ts \
  tests/triggers.md tests/forge-verification-ledger.md; do
  test -f "$f" || echo "MISSING $f"
done
test ! -f README.md || echo "STALE-FILE README.md"
test ! -f references/gap-typology.md || echo "STALE-FILE references/gap-typology.md"
bun scripts/openings-check.ts assets/OPENINGS-SHEET.md
bun ../forging-skills/scripts/skill-check.ts .
```

## Language and stable tokens

English body; answer the user in their language. These are identifiers, not translatable words:

```text
OPENING | OPENINGS SHEET | RETIREMENT LEDGER | signed position | anchor | referee
GAP | CONTRADICTION | NON-ADJACENCY | TASK
AUTHORITY: NONE | RETIRED-BY | EXPIRES | BURIED | reason class
RETIRED-BY-EVIDENCE | SUPERSEDED | EXPIRED | WITHDRAWN
gate O1..O5 | licensed rule GL1..GL18 | forbidden rule GF1..GF8 | SOLO
```

`gap` is the trigger word a user types; `OPENING` is the artifact. An `OPENING` is the operable form
of anything the corpus left open. Four shapes: gap, live contradiction, non-adjacency, refereed task.

## THE LAW — an opening is a bill of work, never a finding

> An `OPENING` carries what the signed position established, plus the one observation that retires it.
> It may never create, upgrade, or soften a claim. The sheet is measured by what it RETIRED, never by
> what it wrote.

Three corollaries, each enforced by the deny-list and the floor script:

- **Writing a synthesis is not neutral.** Papers cited inside a formal review lose future citations.
  The few named as bridges gain disproportionate attention (`GENERATIVE-SOK.md` §G2). So a sheet
  declares what it is `BURIED`-ing. And it carries live conflicts as rows rather than smoothing them
  into one verdict line.
- **Rigor is the conventional core, not the obstacle.** The measured high-impact shape is exceptional
  conventionality *plus* an intruding tail of unusual combinations. That is ~2× the hit rate (§G3).
  The claim ledger is never loosened to make room for this layer, and the atypical tail is capped.
- **Expiry is the modal outcome.** Stated research needs are mostly not taken up, and priority-setting
  processes generally never check (§G9). A sheet that treats an untouched row as a failure is
  mis-calibrated. A sheet with no pre-fixed self-retirement threshold is unfalsifiable.

## Function map — SOLE owner

```text
signed corpus position          [owned by systematizing-knowledge: coverage contract, claim ledger,
   + its gap rows + DONOR SET]   gap typology, DONOR SET — this skill reads them, never rewrites them]
  -- type | bind a retiring observation | address | date | cap the tail -->
OPENINGS SHEET                  (AUTHORITY: NONE, anchored, expiring, tail-capped, BURIED declared)
  -- someone else acts, or the clock runs out -->
RETIREMENT LEDGER               (RETIRED-BY-EVIDENCE | SUPERSEDED | EXPIRED | WITHDRAWN + uptake rate)
```

| Input state | Verb | SOLE owned artifact | Next state / stop |
|---|---|---|---|
| A corpus position is signed and its gaps are stated but nothing selects an action | type + bind a test | `OPENING` row | The row is operable; nobody is committed to it |
| A set of rows exists and the source is about to circulate | anchor + cap + declare burial | `OPENINGS SHEET` | Published `AUTHORITY: NONE`; stop — delivery belongs to the broker |
| A row reached its pre-declared observation, was superseded, expired, or was withdrawn | account | `RETIREMENT LEDGER` row | Uptake rate updates; the loop closes |

This skill owns the operable form of an open question and nothing else. It does not own the gap
typology, the corpus position, an `OPEN_ISSUE`, a thesis, a run, or durable authority. It
stops the moment a row is selected, ranked, mapped to a target, or paid for.

## Gates O1–O5 — each leaves a grep-able artifact

| Gate | Decision | Required artifact / failure |
|---|---|---|
| **O1 SOURCE** | Is there a signed position to operate on, and exactly which version? | `SOURCE POSITION:` line with a locus and a date or digest. No signed position → run `systematizing-knowledge` first and say so; never open gaps against raw papers |
| **O2 TYPE** | What kind of opening is each row, and *why* does it exist? | Every row typed `GAP` / `CONTRADICTION` / `NON-ADJACENCY` / `TASK`, plus a reason class. Untyped rows do not ship (`references/opening-types.md`) |
| **O3 TEST** | What single observation would retire this row? | A `RETIRED-BY` cell naming the cheapest discriminating observation and the pre-declared outcome. No such observation → the row is reformulated or dropped, never shipped as prose (`references/test-and-referee.md`) |
| **O4 ADDRESS** | Who is this for, and until when? | An addressee and an `EXPIRES` date on every row; `AUTHORITY: NONE` on the sheet; `BURIED:` declared; the atypical tail capped (`references/circulation-and-accounting.md`) |
| **O5 ACCOUNT** | What did the sheet actually retire? | A `RETIREMENT LEDGER` row per closed opening and an uptake rate for the cycle, against a threshold fixed before the cycle began |

No artifact means the gate was not passed. `scripts/openings-check.ts` owns the mechanical floor over
the sheet's shape; it is not a semantic check and says so in its own header.

## Procedure

1. **Read the signed position and stop if there is none.** Take the coverage contract, the claim
   ledger, the stated gaps, and any `DONOR SET`. Record the exact locus and version. Openings inherit
   that coverage boundary and may never exceed it.
2. **Type each open item, and name why it is open.** Use the four row types and the reason class in
   `references/opening-types.md`. The reason selects the action: insufficient → measure,
   inconsistent → adjudicate. Biased → replicate under another design, wrong-question → reformulate.
3. **Bind the retiring observation before writing the prose.** Per row, name the cheapest observation
   that would settle it, and the outcome that counts as settled. A row whose retiring observation
   cannot be stated is `UNTESTABLE-AS-STATED` — reformulate it or drop it.
4. **Promote to a `TASK` wherever a referee can be written.** Apply the scorability test in
   `references/test-and-referee.md` §3. If a third party could score an attempt without asking you,
   write the referee now. Fix its threshold before any attempt exists.
5. **Anchor, and cap the tail.** Every row cites the signed position. `NON-ADJACENCY` rows may not
   outnumber the test-bound `GAP` + `TASK` rows. The measured shape is a conventional body with an
   intruding tail, not a sheet of leaps.
6. **Declare the burial.** State which sources this synthesis consolidates away. State which live
   conflicts it deliberately keeps open. Curation redistributes attention whether or not it is
   declared; declaring it makes the choice auditable.
7. **Address, date, and publish at one sentence.** Each row names a recipient and an expiry. The
   publication threshold is one sentence plus a retiring observation. An unpolished, question-shaped
   row is admissible. Holding one back until it looks presentable is the failure this form prevents.
   Mark the sheet `AUTHORITY: NONE`.
8. **Account at the close, and let the sheet fail.** Write the `RETIREMENT LEDGER` and report the
   uptake rate. Apply the self-retirement threshold that was fixed before the cycle. Expiry is a
   normal terminal class, not an incident.

## Deny-list — this skill MUST NOT

- create, upgrade, soften, negate, or re-adjudicate any claim in the signed position.
- prioritize, rank, score, weight, or allocate across openings, or emit an agenda.
- state, predict, or imply a relation between the two literatures on a `NON-ADJACENCY` row.
- resolve a `CONTRADICTION` row by choosing a side, averaging, or smoothing it into one verdict line.
- ship a row without a `RETIRED-BY` observation, an addressee, an `EXPIRES` date, or an anchor.
- write or adjust a referee after seeing an attempt, or move a fixed threshold post hoc.
- run the observation it specifies, dispatch anyone, or reserve any resource.
- map a row to a target frame, derive a target prediction, or write a thesis.
- broadcast the sheet, push a row to a section that declared no matching need, or fan it out to all.
- count written, delivered, or read openings as SEARCH, LEARN, or scientific progress.
- claim the layer accelerates discovery, or cite RFC 3 or the Bell Labs TM as evidence of results.
- present a `NON-ADJACENCY` row as a discovery, or a retirement as a change of belief.
- treat an expiry or a withdrawal as an incident, or let a non-adoption penalize anyone.

## MUST-NOT-FIRE and sibling cuts

| Ask | Route |
|---|---|
| "Synthesize this corpus / what is known, uncertain, disputed, missing?" | `systematizing-knowledge` — DECISIVE cut: it owns what a gap IS and signs the position; HERE only makes it operable |
| "Classify what kind of gap this is" (coverage / evidence / inconsistency / comparability / …) | `systematizing-knowledge` `references/delivery.md` §5 — SOLE owner of the gap typology; this skill points at it and adds only the reason class and the test |
| "Find target-agnostic source relations for this frame" | `systematizing-knowledge` K5 `DONOR SET` — relation seeds there; open questions here |
| "Map this donor to my target / write the thesis / predict what follows" | `forging-novel-theses` — an opening is never a candidate |
| "Which of these should we do first / allocate the budget / publish an `OPEN_ISSUE`" | `supervising-research-programmes` — CARDINALITY cut: selection and allocation over ≥2 directions there; N unselected, unranked rows here |
| "We picked this bet and it is expensive — commit, pivot, or kill?" | `acting-on-hypotheses` — one selected costly tree there; the unselected specification here |
| "Run this cheap deterministic probe" | domain/plain executor — this skill writes the observation, it never performs it |
| "Deliver this row to the section that asked about X" | **DECLARED RESIDUAL** — no skill owns delivery (consent, need-matching, offer, pull) in this collection today. Say so; address the row and stop. Never broadcast or push it (`references/circulation-and-accounting.md` §5) |
| "Where does this sheet live, who owns it, when is it retired as a document?" | `governing-research-documentation` — durable locus and document authority there; the row's expiry and terminal class here |
| "Postmortem the frozen episode where this sheet was mishandled" | `auditing-research-processes` — a frozen episode or run there; a live sheet's own cycle accounting (O5) here |
| "Verify this one fact before I claim it" | `raising-resolution` — one cited observation there |
| "Reorganize this document / dedupe the sections" | `structuring-documents` — information architecture there |
| "Reforge this `SKILL.md`" | `forging-skills` — the domain skill is the audit subject, not the craft owner |
| A finished survey whose gaps name no observation anyone could make | **HERE** |

The complete fire and near-miss regression set is `tests/triggers.md`.

**Seam with `systematizing-knowledge`** — agrees in substance; do not diff for byte identity.
Re-diff only if either question clause changes. That skill's `references/delivery.md` §5 is the SOLE owner of
the gap typology, and of the rule that priorities are never manufactured from the literature. This
skill inherits both and restates neither. One question resolves the cut at runtime. **Is the output
a statement of the evidence state, or a bill of work derived from one?** Statement → theirs. Bill of
work → here.

## Execution model

Reading the signed position, declaring the burial, capping the tail, and every retirement stay
**SOLO**. Each is one editor's judgment over the whole sheet. A sheet assembled from shards has no
cap and no burial declaration. Typing rows and drafting retiring observations may fan out one
read-only worker per row, with no barrier. Each row is independent and carries its own anchor. Never
run a debate or a vote on whether a row belongs. Agreement between workers is not evidence that an
opening is real. No harness means the same map runs serially.

## Reference index — load only the branch in use

| File | Sole ownership | Read when |
|---|---|---|
| `references/opening-types.md` | the four row types, their admission tests, the reason classes, per-type evidential license, and the `UNTESTABLE-AS-STATED` disposal | typing any row, or deciding whether an item is an opening at all |
| `references/test-and-referee.md` | what counts as a retiring observation, the promotion test to `TASK`, the referee triple, threshold pre-fixing, and the anti-post-hoc rules | writing gate O3, or promoting a row |
| `references/circulation-and-accounting.md` | the sheet header contract, anchoring, the tail cap, the burial declaration, addressing and expiry, terminal classes, uptake rate, and the self-retirement threshold | assembling or closing a sheet, or reporting any number |
| `references/sources.md` | dated source table with verification classes, the `GL`/`GF` rule map, and the staleness triggers | verifying a rule's basis, or reforging this skill |
| `assets/OPENINGS-SHEET.md` | the copyable sheet and row template | starting a sheet |
| `scripts/openings-check.ts` | non-semantic floor: required tokens, row typing, `RETIRED-BY`/`EXPIRES`/anchor presence, tail cap, referee presence, forbidden ranking tokens | after editing a sheet, and in the build-order check |
| `tests/triggers.md` | fire and near-miss desk-check — gate F3 | after any description or cut edit |
| `tests/forge-verification-ledger.md` | forge findings, source grades, verification receipts, waivers, staleness triggers | reforging or auditing this skill |
