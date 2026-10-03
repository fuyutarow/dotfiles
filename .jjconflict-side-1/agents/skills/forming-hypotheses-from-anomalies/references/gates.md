# Gates A1–A4 — what each one inverts, and what it cannot catch

> **Scope**: the argument behind each gate in SKILL.md's gate table, traced to the corpus claim it
> rests on. SKILL.md owns the gate table and the packet contract. This file owns the reasoning and
> the stated limits. Grades: `references/calibration.md` §4.

## A1 CONTRAST — the answer set is undefined until the foil is named

**Rule.** Write `P observed, Q expected` before any hypothesis. Record whether the foil was
observed, predicted by the account, or chosen.

| Claim | What the source establishes | What it binds here |
|---|---|---|
| CON-001 | a why-question is identified by the triple (topic, contrast class, relevance relation) — the contrast class is part of the question's identity | the foil is not decoration; without it, "we disagree" and "we are answering different questions" are indistinguishable |
| CON-003 | Mill's own statement that ascertaining all antecedents is "hardly ever possible", except where the phenomenon can be produced artificially | unobserved common antecedents are an application condition, not bad luck |
| CON-008 | procedures ranking by bare pass/fail correlation "perform poorly when there are multiple bugs" | a single contrast statistic silently assumes one difference-maker |

**What it cannot catch.** The foil is a CHOICE. A badly chosen foil narrows the answer set to the
wrong region. The gate makes the choice visible. It cannot tell you the choice was good — which is
why the packet records `Contrast source`.

## A2 SUPPLY — novelty is relative to a frame you must name

**Rule.** List the vocabulary, variables, background theory, and candidate set fixed before
searching. Any later novelty claim is novel against THIS list.

**Why.** Every mechanised generator in the corpus had this supplied. In almost every case the
system's own authors said so:

| System class | What the authors state was supplied | Claim |
|---|---|---|
| law rediscovery | the program "begins a task by asking the user for the independent terms it should consider, the values of these terms it should examine, and the dependent variables it should inspect" | MCH-001 |
| symbolic regression | "One can control, to an extent, the type of law that the system might find by choosing what variables to provide" — in the paper titled "free-form" | MCH-003 |
| autonomous lab | the paper raises the Lovelace objection against itself: the knowledge "is implicit in the formulation of the problem and is therefore not novel" | MCH-004 |
| program search | an evaluate function plus a skeleton; "a fixed skeleton may constrain the space of programs that can be discovered" | MCH-005 |
| logic-based abduction | hypotheses are ground instances of a supplied set, over a supplied first-order language; no mechanism exists for one outside it | CLV-005 |
| design theory | expansive properties "can only come from existing knowledge hence from K" — the theory's own bound | VOC-008 |

**What it cannot catch.** Naming the supplied set does not make it a good one. The row is
self-reported. It converts an invisible assumption into an auditable one. That is all.

## A3 VOCABULARY — which branch you are in, and why it is a record rather than a judgement

**Rule.** Record how the closed-vocabulary attempt came out, in one of three rows.
`SUCCEEDED — <the account it produced>` ends the packet at `CLOSED-VOCABULARY`. Nothing was
introduced, so nothing needed licensing. `EXHAUSTED — <what was tried, what failed>` licenses an
introduction. `NOT-EXHAUSTED — <why not>` licenses one only with the argument written in that row.
A vocabulary-introducing packet with none of the three is `NO-LICENSE`.

`SUCCEEDED` is not the gate failing — it is the common outcome, and usually the correct one.
The first forge omitted it, which made that branch unrepresentable in its own packet.
`scripts/hypothesis-check.ts` now carries a clean good-packet case per branch (ledger 2026-09-05).

### Why a record and not a judgement

| Claim | Result |
|---|---|
| VOC-003 | deciding whether a task NEEDS new vocabulary is undecidable for first-order Horn logic; the proof reduces logical entailment to it |
| VOC-004 | in the function-free fragments where the question IS decidable, predicate invention is provably useless — any solution using invented predicates converts mechanically to one that does not |
| VOC-Y002 | together: where introducing a term can help, you cannot decide it is needed; where you can decide, it does not help |

A gate certifying necessity would certify what no procedure delivers. So it asks only for a record.

### Why the cheap route first

The cost asymmetry is a theorem, not a preference. For Horn clauses, finding *some* explanation is
polynomial. Finding an explanation *containing a specified hypothesis* is NP-hard (CLV-003).
"Explain this" and "explain this using my favourite mechanism" are different problems with
different costs. The second is the one you are about to pay for.

### Why you cannot inspect your way out of it

Whether a setting is genuinely closed is not decidable from the shape of its description. The
minimal-diagnosis characterisation breaks once fault models or exoneration axioms are added. No
simple syntactic condition ensuring it holds is known. That is stated by the authors themselves,
one of whom wrote the original theory (CLV-009, CLV-Y002). Hence the gate checks *that the closed route was
attempted*, never *that the setting was closed*.

**What it cannot catch.** A perfunctory attempt recorded as `EXHAUSTED`, or a thin account
recorded as `SUCCEEDED`. The floor sees a non-empty row and that the three branch rows agree.
Only a reader sees whether the attempt was serious. Fan out the attempt when it matters.

## A4 DISCRIMINATION — a hypothesis must buy an observation

**Rule.** Name an observation that comes out differently if the hypothesis is false, plus the
outcome that retires it. BOTH branches owe this row. An account that no observation could separate
from the one you already had is a rename too, even with nothing introduced.
Where a term WAS introduced, that observation must be one the OLD vocabulary could not express.
Otherwise the introduction is `NO-LICENSE`, though the hypothesis itself survives.

| Claim | Result | Consequence for the gate |
|---|---|---|
| VOC-006 | three decades after the first mechanism, the current survey still lists "How do we judge the quality of a new symbol?" as open; only 2 of 16 systems support invention at all | no general criterion exists, so the gate demands the specific one for THIS introduction |
| EFF-013 | judged creativity tracks judged novelty (r²=.80) and barely tracks judged usefulness (r²=.16); producing more ideas raises novelty scores and not usefulness scores | rating your own output as novel measures novelty, and nothing else |
| MCH-012 | the one study carrying ideas through to execution found the ideation-stage advantage significantly eroded on every metric | a generation-stage judgement does not predict the post-execution one |

**What it cannot catch.** Whether the named observation is actually obtainable. The gate requires a
discriminator to exist on paper. Obtaining it belongs downstream.

## The reporting asymmetry — stated once, here

All four gates REPORT. None certifies that an introduction was necessary, good, or true.

| Gate | Makes visible | Does not judge |
|---|---|---|
| A1 | the foil | whether it was well chosen |
| A2 | the frame | whether it was a good frame |
| A3 | the attempt and its outcome | whether a new term was necessary |
| A4 | the discriminator | whether it is obtainable |

VOC-003 is why this asymmetry is structural rather than timid. A gate failing closed on necessity
would assert something no procedure can compute.
