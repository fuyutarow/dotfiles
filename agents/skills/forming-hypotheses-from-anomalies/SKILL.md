---
name: forming-hypotheses-from-anomalies
description: >-
  Turns an ANOMALY into a licensed hypothesis: fixes the explanandum as a contrast (P observed,
  Q expected), declares what was SUPPLIED (vocabulary, variables, background, candidate set),
  exhausts the closed-vocabulary explanation FIRST, and only then licenses a term outside the
  current vocabulary — emitting one ABDUCTION LICENSE. Use for アブダクション, 仮説形成,
  創造的仮説, 異常から仮説を立てる, 説明がつかない, 前提の外側, 語彙の外, 「なぜPでQでないのか」,
  新しい概念を導入したい, or before writing any hypothesis for an observation the current account
  does not predict. LAW: an anomaly does not license a new term — the RECORDED FAILURE of the
  cheap explanation does; and a novelty judgment is a novelty detector, not a quality detector.
  DECISIVE cut vs forging-novel-theses: frame already selected and a seed/DONOR SET frozen → there
  (it generates CANDIDATES); an anomaly with no license yet → HERE (it emits a LICENSE, never
  candidates), then hand off. Cuts: premise audit of an existing artifact → surfacing-blind-spots;
  is the anomaly even real → raising-resolution FIRST; one selected costly bet →
  acting-on-hypotheses; literature corpus → systematizing-knowledge; obvious cause in code →
  implementing-and-debugging. Workflow-native: the closed-route attempt and adversarial refutation
  may fan out; the contrast, the introduction type, and signing the LICENSE stay SOLO. English
  skill; respond in the user's language (default Japanese).
---

# Forming hypotheses from anomalies — earn the right to leave your vocabulary

> **Version**: v2609.1.0 (2026-09-05) — first forge. Distilled from the signed corpus position
> `sok/introducing_a_term_outside_the_current_vocabulary`, plus its seven siblings.
> Grades, calibration table, and findings: `tests/forge-verification-ledger.md`.

```bash
for f in gates introduction-types boundaries calibration; do test -f references/$f.md || echo MISSING $f; done; test -f scripts/license-check.ts || echo MISSING license-check.ts; test -f tests/triggers.md || echo MISSING triggers; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

## Language & stable tokens

English body; respond in the user's language. These tokens stay unchanged, including inside
Japanese prose — they are identifiers, not translatable words:

- `ANOMALY`, `CONTRAST`, `SUPPLIED`, `CLOSED ROUTE`, `ABDUCTION LICENSE`, `LICENSE`

- `INTRODUCTION TYPE`, `DISCRIMINATOR`, `EXHAUSTED`, `NOT-EXHAUSTED`, `NO-LICENSE`

## THE LAW

> **An anomaly does not license a new term. The recorded failure of the cheap explanation does.**
>
> Fix the explanandum as a CONTRAST before writing any hypothesis. Name what you SUPPLIED before
> calling anything new. Leave your vocabulary only after the closed route has been attempted, and
> its failure written down.
>
> Deciding whether a new term is *needed* is undecidable. So the license is a RECORDED FAILURE,
> never a judgement, and these gates REPORT — they never certify necessity.
>
> Your sense that an idea is novel is a novelty detector, not a quality detector. Judged
> creativity tracks novelty at r²=.80 and usefulness at r²=.16. Never use it as evidence.
>
> This skill emits a LICENSE. It never emits candidates, never ranks, never tests.

## The four gates — A1 / A2 / A3 / A4

Each gate is a ROW in the LICENSE. No row → gate un-passed. `scripts/license-check.ts` owns the
greppable floor; judgement owns the rest.

| Gate | Inverts (the error) | ARTIFACT — the row that must exist |
|---|---|---|
| **A1 CONTRAST** | explaining a bare P — the answer set is undefined until the foil is named, and two people "explain the same thing" while answering different questions | `Contrast:` naming BOTH the observed case and the foil, in the form `P observed, Q expected` |
| **A2 SUPPLY** | claiming novelty without naming the frame it is novel against — every mechanised generator in the corpus had its vocabulary, variables or skeleton supplied first, usually stated by the system's own authors | `Supplied:` listing the vocabulary/variables/background/candidate set you fixed before searching |
| **A3 EXHAUSTION** | jumping to a new mechanism while the boring one is untried — "some explanation" is cheap; "an explanation containing my favourite term" is the expensive one | `Closed route:` `EXHAUSTED — <what was tried, what failed>` or `NOT-EXHAUSTED — <why not>` |
| **A4 DISCRIMINATION** | a new term that buys no new observation — it renames the anomaly instead of predicting past it | `Discriminator:` an observation the OLD vocabulary could not express, plus what outcome would kill the introduction |

**A3 is the license.** A1/A2/A4 are payable in any order. A vocabulary-introducing hypothesis with
no `EXHAUSTED` row, and no argued `NOT-EXHAUSTED`, is `NO-LICENSE`. Emit that verdict and stop.

## The ABDUCTION LICENSE packet

Emit exactly one per anomaly. Run `bun scripts/license-check.ts <file>` before handing it off.

```markdown
## ABDUCTION LICENSE [ID]

- Anomaly: [what was observed, with its locus]
- Contrast: [P observed, Q expected — both named]
- Contrast source: [OBSERVED | PREDICTED-BY-ACCOUNT | CHOSEN — say which, the foil is a choice]
- Supplied: [vocabulary / variables / background / candidate set fixed before searching]
- Closed route: [EXHAUSTED — what was tried and how it failed | NOT-EXHAUSTED — why not]
- Hole type: [THEORY | OBSERVATION | UNDECIDED — is the gap in the account or in the measurement?]
- Introduction type: [NONE | COMMON-CAUSE | TRANSFER | NEW-PREDICATE | EXPANSIVE-PARTITION | OTHER — named]
- Introduced terms: [the words in your hypothesis that do not occur in what you cited, or NONE]
- Discriminator: [an observation the old vocabulary could not express]
- Kill condition: [what outcome retires this introduction]
- Minimality claim: [NONE | LOCAL — no element removable | GLOBAL — nothing smaller works; GLOBAL needs its own argument]
- Status: LICENSED | NO-LICENSE
- Handoff: [forging-novel-theses for candidate generation | acting-on-hypotheses if one costly bet | none]
```

`Introduction type: NONE` is a first-class, common, and usually correct outcome: the closed route
worked. That packet is terminal here — no handoff, no candidates.

## Procedure

1. **Check the anomaly is real.** If the surprising fact is unverified, stop and run
   `raising-resolution` first. An anomaly built on a misread is the cheapest failure available.
2. **Fix the CONTRAST.** Write `P observed, Q expected`. If you cannot name Q, you do not yet have
   an anomaly — you have a fact. Record whether the foil was observed, predicted, or chosen.
3. **Declare what you SUPPLIED.** Vocabulary, variables, background theory, candidate set. This
   row is what any later novelty claim is novel *against*.
4. **Attempt the CLOSED ROUTE.** Explain the contrast using only the supplied vocabulary. Fan this
   out if it is worth several independent attempts. Write down what failed, or that it succeeded.
5. **Decide the hole type.** Is the gap in the account or in the measurement? An observation-hole
   sends you back to step 1, not forward to a new term.
6. **If licensed, type the introduction** and pay that type's extra requirement
   (`references/introduction-types.md`). An untyped `OTHER` fails the floor.
7. **Write the DISCRIMINATOR before acting.** An introduction that buys no observation the old
   vocabulary could not express is a rename. Emit `NO-LICENSE`.
8. **Run the floor, then hand off.** Never rank, never test, never call it validated here.

## MUST-NOT-FIRE — and the fire / no-fire set

Over-firing is the liability: ceremony on a routine bug is this skill failing its own LAW. Full
set with expected verdicts: `tests/triggers.md`.

FIRES:

| Ask | Why here |
|---|---|
| 「説明がつかない現象がある。仮説を立てたい」 | the core transition: anomaly → licensed hypothesis |
| "the measurement contradicts what the model predicts — what's going on?" | an anomaly with no hypothesis yet |
| 「創造的なアブダクションがしたい」/ "I need a genuinely new hypothesis, not a variant" | the vocabulary-introduction decision is owned here |
| "we keep proposing the same three explanations and none of them fit" | the closed route is exhausted; A3 is exactly this |
| 「この結果、既存の枠組みでは言葉にできない」 | a new-predicate introduction is on the table |
| "why did it fail HERE and not on the other host?" (contrast already implicit, no keyword) | A1 is already half-paid; finish the packet |

MUST NOT fire (with route):

| Ask | Route |
|---|---|
| "the stack trace names the line — fix it" | `implementing-and-debugging`; no anomaly, the account predicts this |
| "generate 5 thesis candidates for this frame; here's the donor set" | `forging-novel-theses` — frame selected, seed frozen |
| "what assumptions is this plan making?" | `surfacing-blind-spots` — premise audit of an artifact, no anomaly |
| "is this number actually right?" | `raising-resolution` — establishing the fact, not explaining it |
| "should we commit to this hypothesis? it's expensive" | `acting-on-hypotheses` — one selected tree |
| "what does the literature say about X?" | `systematizing-knowledge` — corpus, not anomaly |
| "turn our signed position's gaps into next work" | `operationalizing-research-gaps` |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `forging-novel-theses` | **DECISIVE, sequential**: is a frame SELECTED and a provenance-bearing seed or frozen `DONOR SET` in hand? **Yes** → there; it owns GENESIS and emits `CANDIDATE`/`MAPPING-BREAK`. **No, there is an anomaly and no license** → HERE; it emits an `ABDUCTION LICENSE` and never a candidate. The LICENSE is a legitimate seed for that skill's entry-gate item 4. Reciprocal row lives in its routing table. |
| `raising-resolution` | **ORDER cut, co-fire**: that skill establishes THIS fact; this skill fires only once the fact is established AND conflicts with the account. Unverified surprising fact → there FIRST, always. |
| `surfacing-blind-spots` | **PURPOSE cut**: input is an existing plan/frame/decision ARTIFACT to audit → there (Blind-spot packet). Input is an OBSERVATION the account does not predict → here. A Blind-spot packet may supply this skill's `Supplied:` row; it never supplies the contrast. |
| `acting-on-hypotheses` | **CARDINALITY/PURPOSE cut**: one SELECTED hypothesis, costly or hard to reverse, question is commit/pivot/kill → there. No hypothesis exists yet → here. |
| `systematizing-knowledge` | **Co-fire, sequential never racing**: a literature corpus runs as an SoK there FIRST; its signed position is what this skill's `Supplied:` row cites. Never survey from inside a LICENSE. |
| `operationalizing-research-gaps` | **PURPOSE cut**: a SIGNED corpus position's gaps → typed expiring `OPENING` rows there. A live anomaly in front of you → here. An `OPENING` is a bill of work; a `LICENSE` is permission to leave a vocabulary. |
| `implementing-and-debugging` | **PREDICATE cut**: does the current account already predict this failure (a named bug, a stack trace, a known cause)? **Yes** → there, no ceremony. **No — the account says this should not happen** → here. |

## Execution model — fan out the attempt, sign the license solo

The CLOSED ROUTE attempt (step 4) fans out read-only, and so does adversarial refutation of a
proposed introduction. Independent attempts genuinely cover more than one. A refuter who did not
write the hypothesis beats the author's own doubt.

Everything that fixes meaning stays SOLO: the contrast, the hole type, the introduction type, and
signing the packet. Agent count is never evidence of exhaustion. Record what was attempted, not
how many attempted it.
No harness → the same steps as serial focused passes.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/gates.md` | A1–A4 argued, each traced to the corpus claim behind it; what each gate cannot catch | writing or disputing a gate row; a reviewer challenges a LICENSE |
| `references/introduction-types.md` | The five introduction types, the extra requirement each carries, and the failure each is prone to | step 6; `Introduction type` is anything but `NONE` |
| `references/boundaries.md` | Sibling cuts argued, co-fire orders, and the two mutual-deferral risks | a sibling could plausibly own the ask; handoff sequencing |
| `references/calibration.md` | Provenance grade table (which corpus claim backs which rule), the calibration inversion, what this skill SUBSUMES vs its own delta | auditing whether a rule is earned; before any reforge |
