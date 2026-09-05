# Calibration — the inversion, what is subsumed, and the grade of every rule

> **Scope**: pipeline steps 1–2 for this skill. Owns the calibration inversion table, the
> SUBSUMES/NEW split, and the provenance grade table for every rule in SKILL.md. The findings from
> the forge's own verification live in `tests/forge-verification-ledger.md`.

## 1. Source class and engine

SURVEY / corpus. Per `forging-skills` `references/distilling.md` §1, a corpus is NOT distilled raw.
The method-fit synthesis runs first, and the RESULT is distilled. That synthesis is the signed position in the SoK corpus. It has eight units and 103 captures, and
is floor-green. Its claim ledger carries a judgement and a reversal condition per row. This skill distils the ledger rows, not the papers.

## 2. The calibration inversion — this is why the gates point the way they do

| | The sources' audience | This skill's agent consumer |
|---|---|---|
| dominant error | humans under-generate: they stay inside the obvious frame, stop at the first plausible cause, and need to be pushed to expand | **INVERSE**: a capable model over-generates fluently. It will produce a novel-sounding mechanism on demand, before the boring explanation has been tried |
| corrective bias | the ideation literature pushes OUTWARD — break the frame, use the catalogue, force the analogy | this skill pushes INWARD FIRST: exhaust the closed route and record the failure before any new term is licensed |
| what to make prominent | the generation technique (the 40 principles, the morphological box, the four operators) | **the gates and MUST-NOT-FIRE are first-class; no generation technique is taught at all** |

The inversion is not a guess. Three measured results in the corpus describe the model's failure
direction specifically:

- Judged creativity tracks novelty (r²=.80) and barely tracks usefulness (r²=.16). Producing more
  ideas raises novelty scores, not usefulness scores (EFF-013). A generator scoring its own
  output is running a novelty detector.
- Ideas judged more novel than expert ideas at ideation lost that advantage on every metric once
  experts executed them. Rankings flipped on many metrics (MCH-012).
- Exposure to an example leaves the idea COUNT unchanged. The example's features, including its
  stated defects, are reproduced significantly more often. The producer cannot see it happening
  (EFF-007).

A skill teaching generation techniques to this consumer would push on the axis where it is already
strong. It would be silent on the axis where it measurably fails.

## 3. SUBSUMES vs NEW — the 既視感 kill, stated explicitly

**SUBSUMED** (classic tools, not this skill's contribution, not claimed as novel):

| Move | Already owned by |
|---|---|
| state the problem as a contrast | Mill's method of difference; the contrast-class treatment of why-questions |
| force a cross-domain mapping | structure-mapping and its computational descendants |
| add an unexpected property to an object | the restrictive/expansive partition distinction in design theory |
| catalogue-driven generation | the inventive-principles and morphological traditions — whose measured effect on outcomes is thin (EFF-009, EFF-012, EFF-Y001) |

**NEW as an operating rule for an agent** (this skill's own delta — skill-supplied, never attributed
to a source):

1. **The exhaustion license.** Making the RECORDED FAILURE of the closed route the precondition for
   introducing a term. Two theorems make it the only defensible form. Necessity is
   undecidable where introduction helps. Introduction is useless where necessity is decidable.
   Both exist in the corpus. Using them to shape a reporting gate does not.
2. **The reporting asymmetry as a design rule.** No source says "therefore your gate must not fail
   closed". That is this skill's own inference from VOC-003.
3. **The SUPPLY row as a standing obligation.** The corpus shows every mechanised generator naming
   its supplied set. Requiring the agent to do the same before claiming novelty is this skill's own
   operationalisation.
4. **The introduction-type-specific extra requirement.** The types are drawn from the corpus. The
   per-type obligation attached to each is engineered here.

## 4. Provenance grade table — SOLE home for this skill

Grades follow `forging-skills` `references/distilling.md` §3. Corpus claim ids are ledger rows in the signed
position. Each carries its own judgement, reversal condition, and limitations there.

| Rule in SKILL.md | Backing | Grade | Handling |
|---|---|---|---|
| A1 CONTRAST exists | CON-001 (contrast class is part of the question's identity) | author-confirmed (verbatim capture, full text) | may be stated as the source's position |
| A1's residue (unobserved antecedents) | CON-003 (Mill's own statement), CON-008 (multi-bug failure of bare correlation) | author-confirmed | may be stated as the source's position |
| A2 SUPPLY exists | MCH-001, MCH-003, MCH-004, MCH-005, CLV-005, VOC-008 | author-confirmed; MCH-005/MCH-012 partly abstract-level | quote the systems' own admissions, not a generalisation about "AI" |
| A3 license = recorded failure | VOC-003, VOC-004 (undecidability + uselessness pair) | author-confirmed, **single-route capture** — verified independently at forge time (ledger §3) | state the theorem; do NOT state that necessity is decidable in any regime not named |
| A3 cheap-vs-targeted asymmetry | CLV-003 | author-confirmed | Horn-clause result; do not generalise the complexity claim beyond it |
| A3 cannot inspect closure | CLV-009, CLV-Y002 | author-confirmed | diagnosis context; the generalisation to "settings" is skill-supplied |
| A4 no general quality criterion | VOC-006 | author-confirmed | 2022 survey's own statement |
| A4 self-rating is a novelty detector | EFF-013, MCH-012 | abstract-level captures | keep the r² figures attached to their study; never restate as a general law about models |
| Introduction types list | VOC-007, TRF-002/005, Schurz's selective/creative split (GEN-003) | third-party taxonomy + skill-supplied obligations | the types are drawn; the per-type requirement is engineered, say so |
| Restrictive/expansive as a lexical test | VOC-007 | author-confirmed | holds in that formalisation's setting; the packet's `Introduced terms` row is a skill-supplied shadow, weaker |
| The reporting asymmetry | inference from VOC-003 | **skill-supplied** | never present as a source's conclusion |
| Fan-out placement (attempt yes, meaning no) | none | **constructed** — engineered, not measured | say so; no corpus claim measures agent-count effects on exhaustion |

**Reflexive corollary.** This skill demands that its user name what they supplied. Its own supplied set is the eight-unit corpus position, plus its coverage boundaries. Each unit's
protocol names what it did not reach. Nothing else. Where a rule is skill-supplied or constructed, the table says so
rather than borrowing a source's voice.

## 5. What this skill does not know

- The corpus found **no primary source showing that pre-test quality judgements predict real
  outcomes** (EFF-Y002). Every "this is a good hypothesis" signal here, its own
  gates included, is unvalidated against downstream success. The gates buy auditability,
  not accuracy, and saying otherwise would fail the skill's own LAW.
- The corpus found **no controlled experiment on whether teaching a design theory improves
  ideation output** (EFF-012). This skill therefore makes no claim that following it produces better
  hypotheses. It claims only that the steps it demands are recorded rather than assumed.
