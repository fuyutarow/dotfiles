# Forge verification ledger — issuing-technical-memoranda (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set lives inline in `SKILL.md`
and is re-run after any description edit.

## CURRENT STATE

**Invariants (live)** — each is ARGUED in `SKILL.md`; these are pointers, verified against it on
the date shown. Do not re-argue them here.

- **WRAPPER-vs-BODY cut** vs `structuring-documents` — `SKILL.md` Routing table. This skill owns
  the phrasing; the sibling side agrees in SUBSTANCE, do NOT diff for byte-identity, re-diff only
  if either question clause changes. Verified 2026-08-10, no drift.
- **The body is unregulated, and that is a finding, not an omission** — `SKILL.md` THE LAW.
  Note the grade: the four-regulated split is archival; the *causal* explanation (mandate → owned
  content → approval gate → lost circulation speed) is **skill-supplied inference**, marked as
  such in the LAW's own text since 2026-08-10. No source states that chain.
- **`personal` is the default authority; a model may never self-declare `organizational:`** —
  `SKILL.md` gate T2.

**Open defects:** none recorded.

**Retired decisions (do not resurrect):** none yet.

## §0 Function map + existence gate (pipeline step 0)

```text
a finding or decision that must reach named people
  --[issue]-->
a document with a fixed cover, a declared authority, a declared addressee, a release marking
  -->
circulated, citable by a stable id, and correctly bounded in who may read it
```

Stop condition: the cover block is complete and `scripts/tm-check.ts` exits 0. Handoff: the body
goes to `structuring-documents`; the prose goes to `linting-prose`; a durable repository life
goes to `governing-research-documentation`.

**Ownership void proved before forging** (2026-08-10, sweep over 57 house skills via the
declared-query-shape router): `memorand`, `メモランダム`, `覚書`, `テクニカルメモ`, `cover sheet`,
`distribution list`, `社内技術文書` all return NO_MATCH across `agents/skills/`, `AGENTS.md`,
`CLAUDE.md` and `references/epistemics.md`. The word "memo" appears three times as an incidental
exemplar and never as an owned genre.

The seam that proves the void is reusable, not incidental: `designing-presentations` STEP 0 makes
the user choose deck vs **prose memo** vs demo, and the prose-memo branch had no downstream owner.
It fell through to generic IA (`structuring-documents`) and generic wording (`linting-prose`),
neither of which owns cover, authority, addressee or release. Two existing skills DO carry
genre-with-required-fields machinery — `arguing-research-papers/genre-playbooks.md` and
`systematizing-knowledge/references/delivery.md` — but both are scoped to their own artifact and
neither covers an addressed internal document. `governing-research-documentation`'s document
"class" is a different axis: a closed four-value lifecycle-role taxonomy that explicitly forbids
minting a fifth role, orthogonal to rhetorical genre.

Conclusion: reusable ownership void, distinct stop condition, typed cuts available against every
neighbour. FORGE, not EXTEND.

## Calibration inversion (distilling §4 — mandatory)

| | Source's audience | This skill's agent consumer |
|---|---|---|
| dominant error | Human engineers who under-circulated: they polished, waited, and reached under half the people who needed the document | **INVERSE, plus a fabrication mode.** The model produces polished prose readily. It fails by shipping a body with no addressee, no authority line, and no release decision — and, asked how the genre is "supposed" to be structured, it invents a canonical body template and attributes it to the institution |
| corrective bias | Circulate earlier, route mechanically, put the abstract where a supervisor can scan it | Decide the wrapper BEFORE the body. Refuse to supply a body standard. Keep the minimum legal memo genuinely minimal |
| what to make prominent | The cover-sheet form itself | **The NEVER guard is first-class** (own section, own greppable check), because fabrication is the dominant model failure and it is invisible to the reader it misleads. **T3's ordering rule is second**, because it is the only claim in the record with a measurement behind it |

The fabrication mode is not hypothetical. It was observed in-session on 2026-08-10: a
general-purpose assistant produced a confident "Observed Facts / Working Model / Speculation"
mandate and a three-loop cadence model for this genre, both of which survive no primary source.
Live-session observation is the highest-grade source a skill can acquire, and it is why the guard
outranks everything else in the body.

## Source-grade table

| Grade | Where used | Handling |
|---|---|---|
| **author-confirmed** | Every §1–§2 row of `references/genre-record.md` — quotes read off the primary scans, then independently re-fetched and checked character-for-character by a separate refutation pass | May be stated as what the record says |
| **third-party** | The eyewitness memoir rows (Noll 2015) and the oral-history row (Kernighan/CHM) | Named as memoir/testimony, never as institutional record |
| **skill-supplied** | The cover-block YAML schema, the `authority:`/`release:` value grammars, the T1/T2/T3 gates, the Scale table, the fan-out split | THIS skill's operationalization. The archival record has no YAML and no gates. Never present these in the record's voice |
| **skill-supplied (reasoned inference)** | THE LAW's causal chain: body mandate → the organization owns the content → an approval gate → the loss of same-day cross-boundary circulation. Also the ADDRESSEE-not-length gating variable in Scale | Reasoned from the four-vs-one split, not stated by any source. Marked inline in `SKILL.md` since 2026-08-10 after a verification lens caught it stated in the archival voice |
| **adopted-from-a-kindred-institution** | The one-sentence minimum and "timely rather than polished" (RFC 3, `TMC-024`); the abstract mandate (`TMC-025`); the tier definition (`TMC-026`) | These are OTHER institutions' written norms. `genre-record.md` §4 carries a header note forbidding their carry-back into §1's voice. Adopting is legitimate; attributing is the fabrication the NEVER guard forbids |
| **constructed** | The fabrication-guard regex and its exemption list | Engineered, not measured |
| **UNSUPPORTED, carried deliberately** | `TMC-015`, `TMC-016` — the two body templates | Carried as named absences with inversion conditions, because naming them is what stops their re-invention |

Reflexive corollary: this skill demands citation discipline of its user, so its own claims carry
claim ids into a signed corpus ledger. A rule in `SKILL.md` with no `TMC-0NN` pointer and no
`skill-supplied` grade above is a defect.

## Forge verification — 2026-08-10 (v2608.1.0)

**Evidence provenance.** 13-agent survey: 3 read-only locate agents over the three candidate
repositories, 5 independent research angles, 5 refutation agents (one per angle, prompted to
refute rather than confirm). The refutation pass returned 16 non-SURVIVES findings across 100
claims: 3 page-citation errors, 1 wrong journal issue, 3 mis-transcribed dates, 4 clauses absent
from the cited source, 5 over-generalizations from a single specimen. **All 16 corrections were
applied before any line entered this skill.** Notable catches that would otherwise have shipped:
DA Pam 600-67 is 1986 not 1988; NASA SP-7084 is 1990 not 1998; the 1949 author is R. C. Mathes,
not the J. C. Mathes of the 1976 report-writing textbook.

**Floor runs.**

- `bun scripts/tm-check.ts` proven red then green on structural fixtures: no cover block (FAIL);
  malformed id / date / authority / release plus missing abstract (5 FAIL + 4 WARN); a complete
  memo (clean). Every structural rung has been seen firing.
- Fabrication guard, 9 fixtures after the v2 broadening (below): 4 attribution phrasings fire
  (EN "standard … format", JA テクニカルメモの標準形式, "conventionally organized", "the usual TM
  layout"); both retro-credited section triads fire with the softer message; a triad LABELLED as
  the author's own call is exempt; an explicit denial is exempt; ordinary body prose is clean.
- `bun scripts/skill-check.ts` over this directory: 0 FAIL, 0 WARN.

## Adversarial verification round — 2026-08-10, 5 read-only lenses

Lenses: grounding/overclaim · corpus-doctrine compliance beyond the script · skill architecture vs
the forge's own law · sibling cuts and description races · forward test with no leaked context.
Returned **9 BLOCKER, 12 MAJOR, 8 MINOR**. Every BLOCKER and MAJOR was independently re-checked by
the editor and **all were real**. Resolutions:

| Finding | Resolution |
|---|---|
| Scale section said "the genre's own written norm says so" while citing RFC 3 — the mirror image of this skill's own NEVER guard, inside the same file | Rewritten to name RFC 3 as a KINDRED institution and to state that the archival genre attests no minimum at all. This was the most serious finding: the skill was committing its own headline error |
| THE LAW's causal chain carried no claim id and no grade, failing this ledger's own reflexive rule | Marked inline as skill-supplied inference; new grade row added above |
| `genre-record.md` §4 flagged "NOT from this genre" on one row only, which is the gap that let the Scale overclaim through | Header note added over the whole §4 table |
| The T3 measurement was invoked at its most load-bearing point without its limit | Limit carried inline at that sentence |
| Description said "Cuts, all WRAPPER-vs-BODY" while the body typed four of six differently | Each cut now names its real type in the description |
| Fabrication regex evaded by natural rephrasing and by JA genre-noun-first word order | Rewritten order-free as three independent signals (genre × form × attribution) plus two retro-triad patterns and an exemption list; 9 fixtures added |
| Corpus: `evi202608_0522`'s 観測 asserted an `abstract` field that no blockquote showed, and the pipe-joined quote silently skipped content | ABSTRACT captured verbatim as its own blockquote; omissions marked `[…]`; 観測 narrowed to what the quotes show |
| Corpus: `evi202608_0525` reconstructed a two-column form into one run-on line and its 観測 claimed a headcount not in the quote | Split into three quoted fragments with `[…]` markers; the 観測 now states explicitly that the routing list and the abstract were NOT captured, so the capture claims nothing about them |
| Corpus: `evi202608_0534`'s 観測 made a scoping judgment reserved for the position | Sentence removed from the capture; the judgment lives only in `TMC-017` |
| Corpus: the protocol's capture-mode sentence was two-way readable and false under its natural reading | Split onto its two real axes: all 16 captures are `verbatim`; one is `status: draft` for an unrelated reason |
| Corpus: one-home collision with `sok202608_0012` (`DIST-009` + two myth rows) was undisclosed | A claim-level correspondence table now opens `led202608_0021`, naming which side is canonical for what, and the position's 被覆境界 discloses the overlap. **Not fully resolved** — folding the先行 rows would edit a signed position, which is a separate decision |
| Design-doc FIRES row asserted sole ownership on an ask `structuring-documents` also matches | Row now states the co-fire order inline |
| Scale vs MUST-NOT-FIRE boundary was ambiguous at the exact case Scale exists to resolve | The gating variable is now named: the ADDRESSEE, not the length |
| Ledger re-argued three rules already argued in `SKILL.md` | Demoted to dated pointers |
| Three siblings had neither reciprocal pointers nor a disclosed deferral | Owner-named deferral row added |
| Description omitted 議事録 and ADR | Added |

Remaining MINOR items were folded into the edits above or judged not worth a line.

**Trigger desk-check.** The inline fire/no-fire table was run against the name+description alone,
including the near-miss rows aimed at `structuring-documents`, `linting-prose`,
`governing-research-documentation`, `arguing-research-papers`, `designing-presentations` and
`systematizing-knowledge`. All rows resolved as intended. The single hardest row — "review this
design doc draft before I send it" — resolves HERE because the wrapper decision precedes the body
critique, and the co-fire order is stated in the routing table so the follow-on to
`structuring-documents` is not lost.

**Reciprocal edits landed in the same change:** `designing-presentations` STEP-0 row now names
this skill as the prose-memo branch's owner.

## Verdict inversion — 2026-08-10, same day as the forge

**`TMC-012` flipped from UNSUPPORTED to SUPPORTED. The skill shipped with a wrong claim and was
corrected within hours.** Recording the mechanism, because it is the reusable part.

**Trigger.** The user pasted an LLM answer asserting that Bell Labs had internal writing guidelines,
naming one "Writing a Technical Memorandum". That answer also contained several claims this record
already contradicts (strict pre-publication peer review of TMs, TMs establishing IP priority, a
five-part body mandate) and one fabricated book title. The named guide matched, exactly, the
inversion condition `TMC-012` had been written with. A six-channel hunt was run rather than a
defence of the position.

**Outcome, split.** The title does not exist (`TMC-033`, archive.org full-text: zero hits). The
substance was right: a Technical Writing course taught by in-house instructors is listed in the
company's own house magazine in 1960; a full writing programme is described by one of its
instructors in 1986; two internal textbooks are registered as works for hire; a style checker
defaulted to comparing drafts against management-vetted memoranda. Five new captures
(`evi202608_0538`–`0542`) were admitted to the corpus and the ledger verdict updated additively —
no capture was edited, per the corpus's own correction rule.

**The actual defect, stated plainly.** The old verdict inferred absence from an eyewitness memoir's
silence. A memoir is not a census. The corpus protocol now carries the rule this violated: to claim
absence, name the place the thing would survive and go there. This skill inherits it — when
`genre-record.md` says something is unattested, that is a claim about where we looked, and the
where must be stated.

**What did NOT change.** `TMC-015`/`TMC-016` stand: nothing found regulates body sections. The
position is arguably stronger now — an institution with courses, textbooks, writing centres and a
style-checking tool still left the body free. The NEVER guard survives unchanged in substance and
gained the §2.5 argument.

**The gap is now addressed, not open-ended.** *The Bell Labs Writer* (1985, 135pp) and *The Bell
Labs Editor* (1986, 72pp) are unread; one survives as an access-restricted scan. **Reading either
is the single highest-value next action for this skill.** If either prescribes body sections, the
NEVER guard is rewritten, not softened.

**Second-order lesson, kept because it will recur.** A source can carry a fabricated citation and a
true claim simultaneously. The fabricated title was correctly identified as fabricated; treating
that as grounds to dismiss the substance would have preserved a wrong verdict. Grade the citation
and the claim separately.

## Deliberate deviations

| Deviation | Rationale | Dated |
|---|---|---|
| `description` is 1434 chars, above the 1024-char API-deployment validation cap | This skill targets the Claude Code listing path, where the observed truncation window starts around 1520 chars; the house collection's existing descriptions sit in the same range. It would need shortening before any API-deployment packaging | 2026-08-10 |
| No `assets/` template file ships | The cover block is short enough to live inline in `SKILL.md`, and a second copy on disk would be a second arguing home for the schema | 2026-08-10 |
| Reciprocal cut landed in `structuring-documents`' BODY (routing table + MUST-NOT-fire), not its description | That description is already 1648 chars, past the listing guidance. Adding to it would worsen a live truncation risk to fix a race that does not exist — its trigger tokens are all restructure-an-existing-doc, none of them memo-genre | 2026-08-10 |
| `linting-prose` and `governing-research-documentation` get one-directional pointers only | Neither description carries memo-genre vocabulary, so no race is possible from their side. Not a mutual-deferral void: this skill's cuts name an owner for every ask in both directions | 2026-08-10 |
| `arguing-research-papers`, `systematizing-knowledge`, `codifying-doctrine` get one-directional pointers only — OWNER-NAMED DEFERRAL | Each is cut on a variable no memo ask can satisfy accidentally: an external venue with reviewers; a paper CORPUS; a cross-occasion trade-off ordering. None of the three descriptions carries memo, 覚書, design-doc or addressee vocabulary, so a memo ask cannot lexically reach them. Reciprocal rows are queued for whichever of the three is reforged next; owner for landing them: this skill's next reforge | 2026-08-10 |

**PROSE-DEBT waiver for `designing-presentations` (2026-08-10).** That skill has no ledger file of
its own, so its waiver is recorded here. It sits at 23 prose sentences >120 chars, PRE-EXISTING.
The 2026-08-10 STEP-0 handoff edit was measured against the HEAD baseline and added **zero** debt.
Clearing is deferred to that skill's next reforge.

## Staleness triggers specific to this skill

- Any §4 norm in `references/genre-record.md` is revised (RFC style guide, NASA NPR, AR 25-50).
  Those are living documents; re-fetch on every reforge.
- The corpus position `sok202608_0021-technical_memorandum_composition` changes a verdict, or a
  new capture flips `TMC-015`/`TMC-016`. If a body-format primary source is ever found, the NEVER
  guard must be rewritten, not merely softened.
- A sibling adds memo-genre vocabulary to its description — re-run the sibling-cut lens across
  the family.
