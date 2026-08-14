---
name: issuing-technical-memoranda
description: >-
  Issues a TECHNICAL MEMORANDUM — the individually-authored, internally-circulated document
  (技術メモ, 社内技術文書, テクニカルメモランダム, 覚書, 議事録, design doc, decision memo, ADR,
  internal RFC, incident write-up, working paper) — by fixing what the genre actually regulates: the
  COVER (title, date, stable id, author + reachable contact, abstract, size counts), the AUTHORITY
  line (personal by default; organizational only with a named signer), the ADDRESSEE declared
  BEFORE the body is finished, and the RELEASE marking. Use for 「メモを書いて」「TM を起こして」
  「社内向けに文書化して」「design doc を書いて」「これ誰に配るべき?」, circulating an unfinished
  finding, or auditing a draft memo. LAW — the body is deliberately UNREGULATED: never present a
  body-section template as "the standard technical-memorandum format"; no primary source defines
  one (grounded record: references/genre-record.md). Cuts — WRAPPER-vs-BODY vs
  structuring-documents: the body's own section graph, MECE, 前方参照, 章立て → there. PURPOSE vs
  linting-prose: words, register, 冗長. CARDINALITY vs governing-research-documentation: the
  portfolio's lifecycle, admission, authority-key, retirement. PURPOSE vs arguing-research-papers:
  external venue submission and reviewer response. DECISIVE vs designing-presentations: slides and
  decks stay there, but its STEP-0 "prose memo" branch hands off HERE. Workflow-native: cover, authority, addressee and release stay SOLO; body
  drafting and reviewer collection may fan out. English skill; respond in the user's language
  (default Japanese).
---

# Issuing technical memoranda — the wrapper, not the body

> **Version**: v2608.1.0 (2026-08-10) — forged from a signed corpus position on this genre.
> Every dated citation and claim strength lives in `references/genre-record.md`.
> F3 artifacts: the fire/no-fire table below + `tests/forge-verification-ledger.md`.

```bash
test -f references/genre-record.md || echo MISSING genre-record; test -f scripts/tm-check.ts || echo MISSING tm-check; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

## THE LAW

> A technical memorandum regulates **its cover, its authority, its addressee, and its release**.
> It deliberately does **not** regulate its body.
>
> **Why** — this skill's own inference, graded `skill-supplied` in the ledger, not an archival
> finding. The body is free BECAUSE the other four are fixed. An organization that mandates the
> body must own what the body says. Owning it plausibly requires an approval gate. That gate would
> cost the genre's one attested advantage. The advantage: an individual circulates an unfinished
> finding across organizational lines **today**. Nobody signs off on whether it is right.
> No source states this chain. It is the reading that makes the four-vs-one split cohere.
>
> **What IS archival** is the split itself. The record regulates the cover in detail, down to figure
> and reference counts. It regulates authority explicitly — a memo carries "only his personal
> authority". A supervisor may approve circulation **while disagreeing**. It regulates the
> addressee: the distribution draft travels WITH the review draft. It regulates release.
> It regulates the body **nowhere**. Every body template attributed to this genre is
> retro-attribution (`references/genre-record.md` §3).

## The three gates — T1 / T2 / T3

No gate passes on feeling. Each names an artifact `scripts/tm-check.ts` can see, or a decision
written into the cover block.

| Gate | Inverts (the error) | ARTIFACT |
|---|---|---|
| **T1 COVER** | body-first drafting: a polished document arrives with nothing scannable on its front, so a reader must open it to learn whether to open it | The cover block below, complete. `bun scripts/tm-check.ts <file>` FAILs on any missing key |
| **T2 AUTHORITY** | authority drift: the reader cannot tell whose view this is, so the memo either over-binds (read as policy) or is ignored (read as noise) | An `authority:` line. `personal` is the DEFAULT and needs no signer. `organizational:<name>` requires a named human and a separate signed transmittal — never a self-declared upgrade |
| **T3 ADDRESSEE + RELEASE** | write-then-wonder-who: the recipient list is invented after the body is done, and release is never decided at all | `to:` (full text) and optional `cc:` (cover only), drafted **before the body is finished**, plus a `release:` marking. Both are cover-block keys; the script FAILs when absent |

**T3's ordering is load-bearing, and it rests on the one measurement in the whole record.**
Authors believed their distribution reached about 80% of the people who should see it.
Measured reach was **under 50%**. Mechanical routing roughly doubled it (`TMC-019`, `TMC-020`).
Carry the limit wherever you carry the number. The comparative study behind it is an unpublished
internal report, known only through a paper citing it (`genre-record.md` §2).
Even so, the recipient list is not a formality to add at the end. It is the part you are plausibly
worst at, so it goes into the draft that other people review.

## The cover block — the artifact

Front matter, so it is machine-checkable and survives any renderer:

```yaml
---
tm: 2026-08-10-phototypesetter-reverse-engineering   # stable id; never reused, never renamed
title: What we learned reverse-engineering the 202
date: 2026-08-10
author: <name> <reachable contact>
authority: personal                # or: organizational:<signer name>
release: internal                  # or: cleared:<scope>/<approver>/<YYYY-MM-DD>
to: [<who gets the full text>]
cc: [<who gets the cover only>]    # optional; omit rather than leave empty
size: text=11 other=2 figures=5 tables=0 refs=3
---

## Abstract
<3–6 sentences. What was done, what was found, what the reader should do about it.>
```

**This YAML is this skill's own operationalization**, graded `skill-supplied` in the ledger. The
archival forms used other field names, in a printed two-column layout. They varied by department
and era (`TMC-007`). What is archival is the four CATEGORIES, not these key names.

Rules that change what you write:

- **`tm:` is frozen at issue.** The title may be rewritten; the id may not. Citation runs on the
  id, so renaming it breaks every reference to the document.
- **`size:` is not bureaucracy.** It is the reader's cost estimate, printed before the cost is
  incurred. Fill it truthfully or delete the key. A wrong count is worse than none.
- **Abstract on the cover; conclusions may stay at the end.** The one memorandum readable
  end-to-end in the record puts conclusions **last** (`TMC-014`). Abstract-first is archival.
  BLUF-in-the-body is a different 規範 lineage, from military correspondence (`TMC-017`).
  Adopt BLUF if you want it, but cite it as that. Do not fuse the two and call it tradition.
- **`cc:` implies a pull path.** If you list cover-only recipients, say in one line how they get
  the full text. The archival form printed a fold-and-return self-mailer on the reverse
  (`TMC-021`). Yours can be a link — but it must exist.

## Scale — the minimum legal memorandum

Over-firing is this skill's own failure mode. **A cover block plus one sentence is a complete,
legitimate memorandum.** Note the provenance — it is exactly the distinction the NEVER guard
turns on. The archival genre attests **no** minimum, maximum, or body shape at all. What is
written down belongs to a KINDRED institution. RFC 3 encourages notes "timely rather than
polished" and sets a one-sentence minimum (`TMC-024`, `genre-record.md` §4). This skill adopts
that rule on its own authority. The archival genre's silence licenses brevity rather than
forbidding it. This is not "how memoranda were written".

**The gating variable is the ADDRESSEE, not the length.** A cover block earns its cost when the
document must reach someone outside the conversation, or stay findable later. One named reader
in a live thread needs neither. That single test reconciles the row below with the
"one-line update to one person" no-fire row.

| Situation | What to produce |
|---|---|
| One finding, a team, reversible | Cover block + 1–3 sentences. Nothing else. Do not grow it |
| A decision others will build on | Cover block + abstract + body + an explicit "what would change this" line |
| A finding you are unsure of | Issue it anyway with `authority: personal`, and say what you are unsure of. That is what personal authority is FOR |
| Anything leaving the organization | STOP. `release:` is not yours to set. Route to whoever owns external release — that gate is the one the record shows actually existed (`TMC-010`) |

## NEVER — the first-class guard

**Never present a body-section template as "the standard technical-memorandum format."**

This is the failure the skill exists to prevent. It is fabrication, not style. Asked how a
technical memorandum should be structured, a model reliably produces a confident, tidy schema.
Background / Hypothesis / Data / Conclusion. Or Observed Facts / Working Model / Speculation.
Then it attributes that schema to the institution that made the genre famous.
**No primary source establishes either** (`TMC-015`, `TMC-016`). Both may be good practice.
Neither is a citable norm of this genre.

The absence is not carelessness on that institution's part. It ran writing courses and published
two internal textbooks. It staffed writing centres. It shipped a style checker whose default
standard was a corpus of memoranda vetted by department heads (`genre-record.md` §2.5).
**It regulated writing heavily and still did not regulate the body.** Which is the point.

When you propose a body shape, label which kind of thing it is:

| Label | Say it as |
|---|---|
| Your own choice | "I'd structure it X / Y / Z — that's my call for this document, not a standard" |
| A named published norm | Cite it by document. The abstract mandate, the memorandum-tier definition, and BLUF are all in `references/genre-record.md` §4 |
| Attributed to the archival genre | **Only** the cover, authority, addressee and release. Nothing else survives verification |

## MUST-NOT-FIRE — and the fire / no-fire set

Desk-check this table after ANY description edit. Read only `name` + `description`, then answer
fire / no-fire / co-fire.

FIRES:

| Ask | Why here |
|---|---|
| 「調査結果を社内メモにまとめて。誰に回すべきかも」 | Cover plus T3 addressee — the core transition |
| "write up this incident as a memo for the platform team" | Issuing one addressed internal document |
| "I have a half-finished finding — is it OK to circulate it?" | T2 personal authority answers it; no headline keyword in the ask |
| 「TM ってどう書くのが正しいの?」 | The fabrication guard fires precisely here |
| "review this design doc draft before I send it" (attaches a .md with no cover) | CO-FIRE. T1/T2/T3 here FIRST, then hand the body to `structuring-documents` per the WRAPPER-vs-BODY seam |
| "who should be on the distribution list for this?" | T3 alone; the rest of the memo may already exist |
| 「この design doc、社外にも出していい?」 | T3 release, and the STOP row in Scale |

MUST NOT fire — each row names the owner that fires instead:

| Ask | Route |
|---|---|
| "this doc repeats itself and references things before defining them" | `structuring-documents` — the body's section graph, not the wrapper |
| 「この文章、AI っぽいので直して」 | `linting-prose` — words and register |
| "we have three docs answering the same question — which is canonical?" | `governing-research-documentation` — portfolio lifecycle, not one document's issue |
| "turn this into a paper for the workshop deadline" | `arguing-research-papers` — external venue, reviewer addressing |
| "make slides for Thursday's review" | `designing-presentations` — unless its STEP-0 picks prose memo, then co-fire HERE |
| "should this become a repo-admitted evidence document?" | `governing-research-documentation` — admission, not authorship |
| "summarize these 40 papers" | `systematizing-knowledge` — a corpus position is not a memorandum |
| a one-line update to one person | Nothing fires. A cover block on a sentence to one reader is ceremony |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `structuring-documents` | **WRAPPER-vs-BODY** — this skill's canonical cut. Question: *is the fix inside the body's own section graph, or in the wrapper that makes the document circulable?* Section order, MECE, 前方参照, 目標規定文, 重点先行 → THERE. Cover, authority, addressee, release, id stability → HERE. Co-fire order and the seam contract: ledger, "WRAPPER-vs-BODY" (2026-08-10) |
| `linting-prose` | PURPOSE cut — sentence, word and register readability → there. This skill never edits prose. It may REFUSE to issue a memo whose abstract is unreadable, and hand it over |
| `governing-research-documentation` | CARDINALITY cut: 書くのか、統べるのか. ONE document authored and issued → HERE. The PORTFOLIO's rules — admission, authority-key uniqueness, retirement, expiry, lineage → THERE. A memo that later becomes a durable repository document crosses the seam: issued here, admitted there |
| `designing-presentations` | DECISIVE cut at its own STEP 0 (deck vs prose memo vs demo). Deck or demo stays there. **Prose memo hands off HERE** — that branch previously had no downstream owner. Reciprocal pointer sits at its STEP-0 row |
| `arguing-research-papers` | PURPOSE cut — audience and gate. Internal, individually-authored, self-released → HERE. External venue with reviewers, editors and a submission gate → THERE. The record's own memo-to-journal promotion path crosses this seam in that direction only |
| `systematizing-knowledge` | Co-fire, sequential. A memo REPORTING a corpus position is issued here; the position itself is signed there, first |
| `codifying-doctrine` | CARDINALITY cut: one document for one occasion → here. The trade-off ordering that governs actors across occasions → there |

## Execution model

**SOLO, always:** the cover block, the authority decision, the addressee list, the release
marking. These are four judgments about one document. Split across agents, they produce a memo
whose front page disagrees with itself.

**May fan out:** drafting independent body sections under a signed outline. Collecting reviewer
comments, one agent per reviewer perspective. Claim-checking the body against its sources.
Reviewer fan-out mechanizes one attested quality mechanism: colleague draft review (`TMC-011`).
It is not the only one — courses, textbooks and a style checker also existed (`genre-record.md`
§2.5) — but it is the one an agent fleet can actually imitate.

**Never fan out:** deciding who receives it. That is the judgment the evidence says humans are
worst at. A fleet averaging its guesses does not correct a systematic bias.

## Language

English body. These tokens stay fixed even inside Japanese prose — they are identifiers:

```text
LAW · gate · T1 / T2 / T3 · cover block · authority line · addressee · release
fire / no-fire · WRAPPER-vs-BODY · solo / fan-out
```

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/genre-record.md` | The grounded record. §1 the archival cover and its fields; §2 the one measured claim; §3 what is NOT regulated, and the retro-attributed templates; §4 currently-published citable norms, with dates; §5 the claim-id map | Before asserting what this genre requires, or when a user asks "is that actually true?" |
| `scripts/tm-check.ts` | Mechanical floor over a draft's cover block. NOT a semantic check — it sees absence, never wrongness | Before issuing any memo; after editing any cover block |
| `tests/forge-verification-ledger.md` | F3 artifacts: function map, calibration inversion, source grades, seam contracts, verification findings, open defects | Reforging this skill; auditing whether a rule here is grounded |
