# Fire / no-fire desk-check — directing-research (F3 artifact)

Re-run after ANY description edit. **Protocol**: read ONLY `name:` + `description:` of this skill AND
every plausibly-matching sibling, answer fire / no-fire / co-fire. A wrong answer is a description bug.
The sharpest boundary is `acting-on-hypotheses` (SINGLE bet) vs here (the judgment ACROSS bets + the
standing honesty policy).

## FIRES (≥5 — realistic-messy, ≥1 Japanese, ≥1 with no headline keyword)

| # | Ask | Why HERE |
|---|---|---|
| F1 | "I have three directions for the next 6 months — which is actually IMPORTANT vs just doable?" | selection by consequence across candidates = G1 |
| F2 | 「このベンチマークで94%出たけど何か怪しい。metric を game してない?」 (JP) | Goodhart / cheap-victory / the witness firewall = G2 |
| F3 | "should I DISTRUST this number and MANDATE a leakage audit before I trust it?" | the standing self-honesty policy / mandate the audit = G3 (the inspection ACT itself → raising-resolution; see C2) |
| F4 | "across my directions, is this whole LINE dead by its aggregate learning-rate, or keep one probe running?" | direction-level (aggregate) kill vs a single bet's pivot = G4 |
| F5 | "how do I formulate 'does this method help discovery' as an ML task without the metric drifting?" | 定式化 / un-gameable metric = G2 |
| F6 | "I got a suspiciously clean SOTA number and I'm about to write it up" (**no headline keyword**) | the denominator + generator≠auditor mechanisms = G3 |
| F7 | "how should I allocate compute across these 5 bets?" | portfolio / barbell allocation = G4 |
| F8 | 「研究テーマの選び方 / 重要な問題の見分け方 / 観察眼」 (JP) | research taste / selection = G1 |

## MUST NOT FIRE (≥5 — near-miss negatives, each names who fires instead)

| # | Ask | Route (who fires) |
|---|---|---|
| N1 | "test/commit/kill/pivot THIS one direction (however many experiments) / set a kill condition on THIS bet / spike it" | **acting-on-hypotheses** — ONE hypothesis tree (the sharpest cut; a single direction, even across many experiments, is its Map — NOT here) |
| N2 | "invent a novel research thesis worth betting a PhD on / is this idea novel as a bet" | **forging-novel-theses** — generate the idea |
| N3 | "inspect this dataset — what's actually in it / find the leaky feature in this pipeline" | **raising-resolution** — inspect a present, knowable fact |
| N4 | "fix the leaky preprocessing code / debug the training loop" | **implementing-and-debugging** — fix the code |
| N5 | "synthesize these 40 papers into what the field knows" | **systematizing-knowledge** — a CORPUS → one position |
| N5b | "is Smith et al.'s single reported result trustworthy?" | **raising-resolution** — a SINGLE external artifact (not a corpus, not your own pipeline) |
| N6 | "write the paper's contribution claim / make the defense slides" | **arguing-research-papers** / **designing-presentations** |
| N7 | "what learning-rate should I use for Adam?" | just answer — a factual hyperparameter question (the optimizer's learning-rate, not dLearning/dt), no ceremony |

## CO-FIRE (braided — state the order; the executable form of the description's cuts)

| # | Ask | Fires (in order) |
|---|---|---|
| C1 | "help me plan and run this research project" (broad) | **directing-research LEADS** (select + formulate + set the honesty policy + portfolio) → **acting-on-hypotheses** (run each individual bet) → **implementing-and-debugging** (build) → **arguing-research-papers** (write up). The judgment is the spine; the moves serve it. |
| C2 | "is my experiment fooling me AND is there a leak in the code?" | **directing-research** (distrust the number + MANDATE the audit — the standing G3 policy) → **raising-resolution** (inspect the pipeline for the specific leak) → **implementing-and-debugging** (fix it). Mandate here → inspect & fix there. |
| C3 | "which problem should I pick, and is it novel enough to bet on?" | **directing-research** (select by consequence + fresh lever — G1) + **forging-novel-theses** (generate & harden the novel thesis). Select here → invent there. |
| C4 | "should I commit to running THIS experiment?" | **acting-on-hypotheses LEADS** (it is ONE bet — size/commit/kill). directing-research co-fires ONLY if the ask is really about the whole DIRECTION/portfolio, not this one run. |
| C5 | "grade whether my own pipeline's number is real, then decide if the direction is dead" | **directing-research** (the own-number admission gate + the direction-level kill) — cut vs **systematizing-knowledge** (which grades OTHERS' numbers): own-pipeline hygiene is HERE. |
| C6 | "I found an unexpected correlation — can I reframe the paper's hypothesis around it?" | **directing-research** (the HARKing self-audit — was this predicted or postdicted? G3) → **arguing-research-papers** (how to frame the contribution honestly, IF it survives). The honesty gate here decides *whether* it may be reframed; the write-up is there. |
| C7 | "my model jumped to 99% out of nowhere and I'm excited — should I trust this surprising win?" (**no keyword**) | **directing-research** SOLO — the G3 self-deception mechanisms (denominator, generator≠auditor, symmetric stopping): a surprising favorable result is exactly where the asymmetric-stopping bias fires. |

## Notes on the closest cut

The make-or-break seam is `acting-on-hypotheses`. Its Scope explicitly includes "research direction", and
its Map/Loop/Leap runs a **whole hypothesis tree** — a single direction with sub-nodes, **however many
experiments it spans**. So the cut is **CARDINALITY-OF-INDEPENDENT-BETS**, not experiment-vs-program:
- **ONE hypothesis tree** (one direction, even across many experiments) → `acting-on-hypotheses`.
- This skill fires only on (a) **≥2 UNCORRELATED directions** — the portfolio (which problem earns effort,
  allocation across bets, killing a whole line on its *aggregate* learning-rate); (b) the **standing**
  honesty policy over **many** runs (pre-register / denominator / generator≠auditor as program discipline,
  not one bet's kill condition); or (c) **selection & formulation** (which problem, posed how).

Seam test: **ONE hypothesis tree → there; ≥2 uncorrelated directions, the standing honesty policy, or
problem-choice/formulation → here.** They co-fire in sequence (C1). The two share the word "kill": a single
tree's kill condition = acting-on-hypotheses; the *aggregate*-learning-rate kill across ≥2 directions = here.

**Unreciprocated-cut debt (LIVE, mitigated — owner named).** `acting-on-hypotheses`'s description
(≈1900 chars) is well over the ~1500 listing budget AND enumerates "research direction" as in-scope with
no cut ceding the ≥2-direction portfolio altitude here — so at stage-1 (descriptions alone) a
portfolio/allocation ask (F4, F7) is a **live race**, not a deferred-cosmetic one. Mitigations on MY side:
(1) the description now carries "portfolio / allocation across bets / ≥2 bets" and disambiguates the
learning-rate homonym; (2) the cardinality seam test above; (3) F4/F7 reworded to make the ≥2-directions
signal explicit. The genuine reciprocal cut still requires a-o-h's own trim-reforge (owner =
acting-on-hypotheses; body home `references/boundaries.md`). Recorded in `forge-verification-ledger.md`;
re-run this desk-check after any sibling reforge.
