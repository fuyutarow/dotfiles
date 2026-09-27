---
name: forming-hypotheses-from-anomalies
description: >-
  Builds ONE explanatory hypothesis from an ANOMALY, with the record of what entitled it: fixes the
  explanandum as a CONTRAST (P observed, Q expected), declares what was SUPPLIED (vocabulary,
  variables, background, candidates), explains inside that vocabulary FIRST, and only on its
  recorded failure introduces a term outside it, emitting one HYPOTHESIS packet. Use for アブダクション,
  仮説形成, 創造的仮説, 異常から仮説を立てる, 説明がつかない, 前提の外側, 語彙の外, 「なぜPでQでないのか」, 新しい概念を導入したい, or before writing a
  hypothesis for an observation the account does not predict. LAW: an anomaly does not license a new
  term — the RECORDED FAILURE of the cheap explanation does; a novelty judgment is a novelty
  detector, not a quality detector. PURPOSE cut vs forging-novel-theses: explain an observed contrast
  and account for its vocabulary → HERE; transform sourced seeds in a selected frame → there.
  Candidate count and possession of a donor set do not decide the route. Cuts: premise audit →
  surfacing-blind-spots; is the anomaly real → raising-resolution FIRST; one selected costly bet →
  acting-on-hypotheses; literature corpus → systematizing-knowledge; obvious cause in code →
  implementing-and-debugging. Workflow-native: the closed-vocabulary attempt and adversarial
  refutation fan out; the contrast, introduction type, and signing the packet stay SOLO.
  English skill; respond in the user's language (default Japanese).
---

# Forming hypotheses from anomalies — build the explanation, and earn the vocabulary it needs

> **Version**: v2609.3.0 (2026-09-27) — explanatory work and seed transformation compose without a handoff dead end.
> Source position, grades and the calibration table:
> `references/calibration.md`; forge findings and history: `tests/forge-verification-ledger.md`.

```bash
for f in gates introduction-types boundaries calibration; do test -f references/$f.md || echo MISSING $f; done; test -f scripts/hypothesis-check.ts || echo MISSING hypothesis-check.ts; test -f tests/triggers.md || echo MISSING triggers; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

## Language & stable tokens

English body; respond in the user's language. These tokens stay unchanged, including inside
Japanese prose — they are identifiers, not translatable words:

- `ANOMALY`, `CONTRAST`, `SUPPLIED`, `CLOSED ROUTE`, `HYPOTHESIS`

- `INTRODUCTION TYPE`, `DISCRIMINATOR`, `SUCCEEDED`, `EXHAUSTED`, `NOT-EXHAUSTED`

- `CLOSED-VOCABULARY`, `LICENSED`, `NO-LICENSE`

## THE LAW

> **A hypothesis answers a contrast, not a fact. And an anomaly does not license a new term —
> the recorded failure of the cheap explanation does.**
>
> Fix the explanandum as a CONTRAST before writing any hypothesis. Name what you SUPPLIED before
> calling anything new. Explain inside that vocabulary first, and write down how that attempt came
> out. Only a recorded failure lets you leave.
>
> Deciding whether a new term is *needed* is undecidable. So the vocabulary gate is a RECORDED
> OUTCOME, never a judgement, and these gates REPORT — they never certify necessity.
>
> Your sense that an idea is novel is a novelty detector, not a quality detector. Judged
> creativity tracks novelty at r²=.80 and usefulness at r²=.16. Never use it as evidence.
>
> This skill records one explanation per packet. Rivals may each have a packet; one packet is not an exhaustive candidate set.
> It neither ranks nor tests them. BIBIFI consumes the result and continues the authorized discovery loop.
>
> Construct an account of the contrast using the supplied relations, then expose its discriminator.
> If construction stalls, name the missing relation or evidence. Do not redirect merely because no hypothesis exists yet.
> For transformation where no adequate thesis exists, pass the selected frame and a located seed to `forging-novel-theses`.
> If an adequate explanation already exists, test its discriminator instead of generating alternatives as a ritual.
> A seed is sourced input, not an already successful hypothesis. No recipe guarantees discovery.

## The four gates — A1 / A2 / A3 / A4

Each gate is a ROW in the packet. No row → gate un-passed. `scripts/hypothesis-check.ts` owns the
greppable floor; judgement owns the rest.

| Gate | Inverts (the error) | ARTIFACT — the row that must exist |
|---|---|---|
| **A1 CONTRAST** | explaining a bare P — the answer set is undefined until the foil is named, and two people "explain the same thing" while answering different questions | `Contrast:` naming BOTH the observed case and the foil, in the form `P observed, Q expected` |
| **A2 SUPPLY** | claiming novelty without naming the frame it is novel against — every mechanised generator in the corpus had its vocabulary, variables or skeleton supplied first, usually stated by the system's own authors | `Supplied:` listing the vocabulary/variables/background/candidate set you fixed before searching |
| **A3 VOCABULARY** | jumping to a new mechanism while the boring one is untried — "some explanation" is cheap; "an explanation containing my favourite term" is the expensive one | `Closed route:` `SUCCEEDED — <the account>` or `EXHAUSTED — <what was tried, what failed>` or `NOT-EXHAUSTED — <why not>` |
| **A4 DISCRIMINATION** | a hypothesis that buys no new observation — it renames the anomaly instead of predicting past it | `Discriminator:` an observation that comes out differently if this hypothesis is false; where a term was introduced, one the OLD vocabulary could not express. Plus `Kill condition:` |

**A3 decides which branch you are in — never whether you have a hypothesis.** Every branch ends
with a filled `Hypothesis:` row; that row is the product.

| `Closed route:` | `Introduction type:` | `Status:` | What happened |
|---|---|---|---|
| `SUCCEEDED — <account>` | `NONE` | `CLOSED-VOCABULARY` | the supplied vocabulary explained the contrast. Terminal here — common, and usually the right answer |
| `EXHAUSTED — <what failed>` | typed | `LICENSED` | the cheap explanation was tried and written off; the introduction is warranted |
| `NOT-EXHAUSTED — <why not>` | typed | `LICENSED` only with the argument in that row | leaving early is allowed, but it is a claim you must defend |
| any | typed | `NO-LICENSE` | no discriminator, no kill condition, or an unnamed `OTHER` |

`NO-LICENSE` never deletes the hypothesis. It says the vocabulary-introducing FORM of it is not
earned yet. Which repair applies is keyed on why the floor said so:

| Why `NO-LICENSE` | Repair |
|---|---|
| `Closed route: SUCCEEDED` while `Introduction type` is not `NONE` | drop the introduction; the closed-vocabulary account already stands |
| `Discriminator` or `Kill condition` empty on an introducing packet | pay A4 — name the observation, and the outcome that retires it |
| `Introduction type: OTHER` with no name | name it, or pick one of the five typed introductions |
| the discriminator turns out expressible in the old vocabulary | nothing was introduced — move the packet to the `SUCCEEDED` branch |

## The HYPOTHESIS packet

Emit one per explanation; preserve rival IDs rather than force one cause per anomaly.
Reuse unchanged contrast/supply records by locator. Run `bun scripts/hypothesis-check.ts <file>` before handing off a completed packet.
If no explanation is available, return the failed attempt and next evidence need as unresolved work, never a fabricated completed packet.

```markdown
## HYPOTHESIS [ID]

- Anomaly: [what was observed, with its locus]
- Contrast: [P observed, Q expected — both named]
- Contrast source: [OBSERVED | PREDICTED-BY-ACCOUNT | CHOSEN — say which, the foil is a choice]
- Supplied: [vocabulary / variables / background / candidate set fixed before searching]
- Closed route: [SUCCEEDED — the account it produced | EXHAUSTED — what was tried and how it failed | NOT-EXHAUSTED — why not]
- Hypothesis: [the claim itself: what is happening, that explains P and not Q]
- Hole type: [THEORY | OBSERVATION | UNDECIDED — is the gap in the account or in the measurement?]
- Introduction type: [NONE | COMMON-CAUSE | TRANSFER | NEW-PREDICATE | EXPANSIVE-PARTITION | OTHER — named]
- Introduced terms: [the words in the Hypothesis row that do not occur in what you cited, or NONE]
- Discriminator: [an observation that comes out differently if this hypothesis is false]
- Kill condition: [the outcome that retires this hypothesis]
- Minimality claim: [NONE | LOCAL — no element removable | GLOBAL — nothing smaller works; GLOBAL needs its own argument]
- Status: [CLOSED-VOCABULARY | LICENSED | NO-LICENSE]
- Handoff: [forging-novel-theses for a sourced transformation | driving-bibifi-cycles for a cheap discriminator | acting-on-hypotheses for one costly bet | none]
```

## Procedure

1. **Check the anomaly is real.** If the surprising fact is unverified, stop and run
   `raising-resolution` first. An anomaly built on a misread is the cheapest failure available.
2. **Fix the CONTRAST.** Write `P observed, Q expected`. If you cannot name Q, you do not yet have
   an anomaly — you have a fact. Record whether the foil was observed, predicted, or chosen.
3. **Declare what you SUPPLIED.** Vocabulary, variables, background theory, candidate set. This
   row is what any later novelty claim is novel *against*.
4. **Explain inside the supplied vocabulary.** Write the best account you can using only what step
   3 names. Fan this out if it is worth several independent attempts. Then record the outcome:
   `SUCCEEDED`, `EXHAUSTED`, or `NOT-EXHAUSTED`.
5. **Decide the hole type. Both branches owe it.** Is the gap in the account, or in the
   measurement? An observation-hole sends you back to step 1. It does not send you forward.
6. **If step 4 SUCCEEDED, write that account into `Hypothesis:` and go to step 8.** Set
   `Introduction type: NONE` and `Status: CLOSED-VOCABULARY`. You still owe A4.
7. **Build the introduction.** Type it and pay that type's extra requirement
   (`references/introduction-types.md`); an untyped `OTHER` fails the floor. Write the resulting
   claim into `Hypothesis:`, and list every word in it that your sources do not contain.
8. **Write the DISCRIMINATOR and the KILL CONDITION.** A hypothesis that no observation could
   separate from the account you already had is a rename. If a term was introduced and the
   discriminator is expressible in the old vocabulary, that introduction is `NO-LICENSE`.
9. **Run the floor, then hand off.** Never rank, never test, never call it validated here.
   For a bounded cheap test, BIBIFI consumes the packet into scoped rival predictions and next actions.
   It does not replace this skill's hypothesis-genesis provenance or certify the explanation from a table alone.

## MUST-NOT-FIRE — and the fire / no-fire set

Over-firing is the liability: ceremony on a routine bug is this skill failing its own LAW. Full
set with expected verdicts: `tests/triggers.md`.

FIRES:

| Ask | Why here |
|---|---|
| 「説明がつかない現象がある。仮説を立てたい」 | the core transition: anomaly → one grounded hypothesis |
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
| `forging-novel-theses` | **PURPOSE**: explain a contrast and justify its vocabulary → HERE. Transform a sourced observation/account/constraint in a selected frame → there, for one or several unranked candidates. A packet may be an ACCOUNT seed; TRANSFER still requires its frozen DONOR SET. |
| `driving-bibifi-cycles` | Owns the ongoing discovery loop and consumes this explanatory work into bounded discrimination and candidate revision. The same responsible agent may apply both; packet completion is not completion of the user's R&D task. |
| `raising-resolution` | **ORDER cut, co-fire**: that skill establishes THIS fact; this skill fires only once the fact is established AND conflicts with the account. Unverified surprising fact → there FIRST, always. |
| `surfacing-blind-spots` | **PURPOSE cut**: input is an existing plan/frame/decision ARTIFACT to audit → there (Blind-spot packet). Input is an OBSERVATION the account does not predict → here. A Blind-spot packet may supply this skill's `Supplied:` row; it never supplies the contrast. |
| `acting-on-hypotheses` | **LIFECYCLE/PURPOSE cut** (not cardinality — both sides hold exactly one): does a hypothesis already EXIST and is the question commit/pivot/kill on a costly, hard-to-reverse bet? **Yes** → there. **No, it has not been built yet** → here. This skill hands its packet over; it never decides the bet. |
| `systematizing-knowledge` | **Co-fire, sequential never racing**: a literature corpus runs as an SoK there FIRST; its signed position is what this skill's `Supplied:` row cites. Never survey from inside a packet. |
| `operationalizing-research-gaps` | **PURPOSE cut**: a SIGNED corpus position's gaps → typed expiring `OPENING` rows there. A live anomaly in front of you → here. An `OPENING` is a bill of work; a `HYPOTHESIS` is a claim about what is happening. |
| `implementing-and-debugging` | **PREDICATE cut**: does the current account already predict this failure (a named bug, a stack trace, a known cause)? **Yes** → there, no ceremony. **No — the account says this should not happen** → here. |

## Execution model — fan out the attempt, sign the packet solo

The CLOSED ROUTE attempt (step 4) fans out read-only, and so does adversarial refutation of the
hypothesis. Independent attempts genuinely cover more than one. A refuter who did not write the
hypothesis beats the author's own doubt.

Everything that fixes meaning stays SOLO: the contrast, the hole type, the introduction type, and
signing the packet. Agent count is never evidence of exhaustion. Record what was attempted, not
how many attempted it.
No harness → the same steps as serial focused passes.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/gates.md` | A1–A4 argued, each traced to the corpus claim behind it; what each gate cannot catch | writing or disputing a gate row; a reviewer challenges a packet |
| `references/introduction-types.md` | The five introduction types, the extra requirement each carries, and the failure each is prone to | step 7; `Introduction type` is anything but `NONE` |
| `references/boundaries.md` | Sibling cuts argued, co-fire orders, and the two mutual-deferral risks | a sibling could plausibly own the ask; handoff sequencing |
| `references/calibration.md` | Provenance grade table (which corpus claim backs which rule), the calibration inversion, what this skill SUBSUMES vs its own delta | auditing whether a rule is earned; before any reforge |
