---
name: arguing-research-papers
description: >-
  Argue a WRITTEN research paper as ONE claim to a skeptical, absent peer-review audience — decide
  what to claim, calibrate its strength to the evidence you hold, position it against SPECIFIC prior
  work, and harden it to survive review. Owns the CLAIM and its defense (主張の仕方): contribution
  framing, novelty & positioning (Swales CARS), the intro funnel, abstract/title as genre, Toulmin
  warrant/qualifier/rebuttal, hedging-vs-boosting calibration, the anti-fabrication rule (never invent
  a cite/number/baseline), reviewer red-team, rebuttal. Use when writing/revising a paper's ARGUMENT /
  contribution / positioning, or when a reviewer says "not novel" / "overclaimed" / "clear but not
  exciting" — 論文の主張の仕方 / 貢献 / 新規性 / 位置づけ / 査読 / リバッタル / 事実と意見 / 絞る / so-what /
  面白くない / 新規性・有用性・信頼性. NOT a typo/format/word-count fix (trivial → linting-prose). Cuts
  (typed, runtime): organize/MECE/section-order info you've DECIDED to include → structuring-documents;
  sentence-level wording & over/under-claim → linting-prose (argument/evidence-level claim=evidence
  stays HERE); a LIVE talk/slides → designing-presentations; synthesize OTHERS' many papers →
  systematizing-knowledge; GENERATE the novel idea/bet → forging-novel-theses. Co-fires (argue HERE;
  organize/word/present THERE). Workflow-native: the claim, calibration, and reconciliation stay SOLO;
  red-team and citation/number verification fan out read-only. English skill; respond in the user's
  language (default Japanese).
---

# Arguing research papers — one claim, calibrated to evidence, hardened for review

> **Version**: v2607.1.0 (2026-07-08)
> **Scope**: the RHETORIC and EPISTEMICS of a written research paper — deciding WHAT to claim,
> calibrating claim-strength to the evidence, positioning against the literature, and surviving an
> absent, skeptical, skimming peer reviewer + the permanent record. Sits ABOVE document structure
> (`structuring-documents`) and sentence polish (`linting-prose`), BESIDE the live talk
> (`designing-presentations`).
> **Lineage**: distilled from a 15-agent adversarially-reconciled SoK survey (2026-07) of the
> paper-writing canon (Gopen-Swan through the Japanese 戸田山・木下・野矢・酒井 tradition). Full graded
> provenance: `references/sources.md`; the survey fleet: `tests/forge-verification-ledger.md`.
> **Build order (ATOMIC — ship in ONE commit; no pointer may dangle).** Verify from the skill dir:
> `for f in frameworks reconciliation calibration genre-playbooks reviewer-defense sources; do test -f references/$f.md || echo MISSING $f; done; test -x scripts/claim-check.sh || echo MISSING claim-check.sh; for t in triggers forge-verification-ledger; do test -f tests/$t.md || echo MISSING $t; done`
> (must print nothing).

## Language & stable tokens

This skill is **English**; respond to the user in their language (default Japanese). Keep these
tokens stable even inside Japanese prose — they are identifiers, not translatable words: **LAW**,
**gate (G1/G2/G3)**, **fire/no-fire**, **solo/fan-out**, **CLAIM SPEC**, **governing claim**,
**zone-split** (persuasion surface / record surface), **scope-hedge / importance-bold**, **anchor**,
**red-team**, and the domain terms **CARS**, **Toulmin**, **OCAR**, **ABT**, **主張 / 絞る /
問い・主張・論証 / 事実と意見 / 新規性・有用性・信頼性**.

## THE LAW

> A research paper is an **argument that makes ONE claim to a skeptical, absent expert community**
> and must survive a hostile, skimming reviewer and the permanent record — it is **not** a report of
> what you did. Its currency is **value to a community of expert readers** (McEnerney): value is
> earned by a *real instability with a cost to those readers*, not by effort or by a fluent summary.
>
> The bar — a paper that passes carries all of:
> 1. **ONE governing claim** ("This paper shows that ___") that survives *so what?* to a named
>    reader-cost; multiple contributions **ladder up** to it, never sit co-equal.
> 2. **Claim = evidence**: every claim **anchored to a real result** (a specific table / theorem /
>    figure — *never fabricated*); its **scope hedged** exactly to what the evidence licenses
>    (a Toulmin qualifier + rebuttal), while its **importance is asserted flatly**.
> 3. **Positioned** against a **SPECIFIC named** prior method by a **specific gap** (never bare
>    "unlike prior work"); the **sharpest hostile-reviewer objection** pre-empted or conceded.
> 4. **Zone-split honored**: narrative and value-framing live only on the **persuasion surfaces**
>    (title / abstract / intro / discussion); the **record surfaces** (methods / results / supplement)
>    stay austere and complete. **Persuasion changes SALIENCE and ORDER, never the facts or the
>    claim's reach.**
>
> Above all — the model-specific cardinal sin: **NEVER invent a citation, baseline, dataset, or
> number to make the argument land.** A fabricated support is not weak writing; shipped, it is
> misconduct. When a support is not grounded to a real, retrievable source, write an explicit
> **placeholder** (`[CITATION NEEDED]` / `[BASELINE — verify]` / `[VALUE — compute]`), never a
> plausible-looking reference. This gate outranks every persuasion rule below.

## The three gates — each demands a grep-able artifact in the CLAIM SPEC

同型 with the house discipline (systematizing-knowledge's ledger, forging-novel-theses' G1/G2/G3):
a gate is passed only when its **artifact exists in the filled CLAIM SPEC** (template below).
感触では通れない — no artifact, gate un-passed. `scripts/claim-check.sh` is the *floor* that checks the
load-bearing slots (governing claim, instability/cost, anchor, scope, positioning, objection) are
present and non-placeholder; it is NOT a semantic check, and it does not check every gate artifact
(contribution-type, warrant, novelty-scope are judged here, not by the floor).

| # | Gate | Inverts (the failure) | ARTIFACT (must exist, non-placeholder) |
|---|---|---|---|
| **G1** | **絞る — one claim** | coverage-seeking sprawl; a topic, not a problem; a flat list of co-equal "contributions" | the **governing-claim** line (ONE sentence) + the **instability + named reader-cost** + the contribution **type**; sub-contributions each shown to ladder up |
| **G2** | **calibrate — claim = evidence** | over-hedge into mush *and* over-claim / **fabrication** | per claim: the **evidence anchor** (real table/theorem/figure, or an explicit placeholder) + the **warrant** in the field's currency + the **scope qualifier + rebuttal**; every superlative / "significant" / "first" carries an inline warrant or is downgraded |
| **G3** | **position + reviewer-proof** | fake positioning ("unlike prior work"); boilerplate limitations; missing the fatal objection | the **nearest NAMED prior method + the specific gap** ("Unlike [X], which [Y], we [Z]") + the **sharpest hostile-reviewer objection** with an answer OR a scoped concession + the **novelty scope** ("to our knowledge, first to __ under __") |

## The CLAIM SPEC — fill this BEFORE drafting prose (and to audit any draft)

The spec is the paper's argument as a checkable artifact. Fill it; run the floor; then write. An
unfillable slot is a finding, not a formatting gap — say which gate it fails and treat the paper as
not-yet-ready there (never paper over it with fluent prose).

```markdown
# Claim spec: [paper working title]

## G1 — the one claim (絞る)
- Governing claim (ONE sentence, "This paper shows that ___"): [...]
- Instability + reader-cost (who in the community pays what if this stays unknown): [...]
- Contribution type (new problem / insight / method / data / empirical result — Black): [...]
- Sub-contributions (each MUST ladder up to the governing claim, else it is another paper): [...]

## G2 — claim = evidence (scope hedged, importance bold)
- Per claim → evidence anchor (real table/theorem/figure; if unverified: [VERIFY]/[VALUE — compute]): [...]
- Warrant (why that evidence licenses the claim, in THIS field's currency): [...]
- Scope qualifier + rebuttal ("holds in regime S … unless Y"): [...]
- Certainty audit (each superlative/booster/priority word carries its warrant inline, or downgrade): [...]

## G3 — positioned + reviewer-proofed
- Nearest prior work (NAMED) + the specific gap removed ("Unlike [X], which [Y], we [Z]"): [...]
- Sharpest hostile-reviewer objection + answer-with-evidence OR scoped concession: [...]
- Novelty scope ("to our knowledge, the first to __ under __"): [...]
```

Then: `scripts/claim-check.sh <spec.md>` (floor: presence + banned bare-positioning + placeholder
discipline; it cannot judge whether the anchor really licenses the claim — you do).

## The build procedure — logic, not chronology

Run in this order; each step routes to a reference. This is a decision procedure, not a template to
fill top-to-bottom in prose. **Fast path** — for a *targeted one-claim diagnostic* ("is this
overclaiming?", "reframe this one claim", "is this positioning real?"), skip the CLAIM SPEC and go
straight to the cited reference and answer; the full spec + floor are for drafting or auditing a WHOLE
argument, not a single-claim question.

1. **Reset the goal** (McEnerney). Not "explain what I did" → "change what this community believes."
   Name the reader community, its accepted belief, and its doubt. → `references/reconciliation.md` §5.
2. **Fill the CLAIM SPEC** (G1–G3 above). Write to discover the claim if you don't have it yet; the
   *moment* you have it, the spec governs. → `references/calibration.md` (claim + anchor + scope),
   `references/frameworks.md` (Toulmin, CoR, contribution type).
3. **Motivate** — build the instability + cost, cut the niche against named prior work
   (CARS Move 2). → `references/frameworks.md` (CARS, They Say/I Say), `references/reviewer-defense.md`.
4. **Calibrate every claim** — two-pass: state the strongest claim the grounds license *flatly*,
   then subtract ONLY scoped qualifiers; strip verb-softeners; ground or placeholder every number/
   citation. → `references/calibration.md`.
5. **Fit the genre** — instantiate the venue's conventions and reward function (contributions bullets,
   ablation-as-control, abstract genre, theorem exposition, 新規性・有用性・信頼性).
   → `references/genre-playbooks.md`, `references/frameworks.md` (abstract/title).
6. **Red-team** — generate the 3 sharpest objections the most hostile competent reviewer in THIS
   subfield raises; answer or concede each. → `references/reviewer-defense.md`. **Novelty-reframe**
   (when a reviewer says "not novel enough"): state which contribution TYPE you claim (problem /
   insight / method / data / result — novelty ≠ complexity). → `references/frameworks.md` §5.
7. **Zone-check** — narrative/value only on persuasion surfaces; record surfaces austere and
   complete; every persuasion move leaves the facts and the claim's reach unchanged. →
   `references/reconciliation.md` §1.
8. **Hand off** — organize the sections (`structuring-documents`), polish the wording
   (`linting-prose`), design the talk (`designing-presentations`). Those are NOT this skill.

## The reconciliations (Aufheben) — the moderators that dissolve the field's fights

The paper-writing canon is full of apparent contradictions; almost all dissolve into a few
**split-by** moderators. These are precedence-setting; each is argued in full (with its camps and
regime) in `references/reconciliation.md`. Apply the moderator, do not pick a side.

- **Story vs. facts** → split by **structure/content**: narrative governs *arrangement & selection*
  (foreground, order-of-reveal), never data values or the warrant. Test: *"if I deleted the framing,
  would any truth-value or uncertainty statement change?"* Yes → it's spin, cut it.
- **Bold vs. calibrated** → split **importance from certainty** (orthogonal axes): maximize
  *importance* (scope/stakes), calibrate *certainty* (confidence). Never buy boldness by inflating
  certainty; buy it by widening significance while stating confidence exactly. Hedge the **scope**,
  assert the **core**.
- **Convey vs. create value** → **source vs. selector**: your results are the source; the reader's
  problem is the selector of what to foreground. Value is always computed over the *actual*
  contribution, never invented.
- **Template vs. argument** → **container vs. content**: keep IMRaD's slots; let the *thesis* (not
  the timeline) fill them by logic. Every subsection must answer "which part of my argument does this
  serve?" or be cut to the supplement.
- **Answer-first vs. build-up** → split by **scale**: the generic conclusion-first default + its
  flips is `designing-presentations`; the paper delta is *which skim surfaces must be answer-first*
  (title, abstract, first paragraph, section openers, captions) and that scientific "suspense" is the
  **gap/challenge** (name the open problem), *never* withholding the take-home — the reader already has
  it from the abstract.
- **Universal template vs. field-dependence** → **schema vs. fill** (Toulmin's own resolution): the
  argument slots are universal; fill BACKING and QUALIFIER with the target venue's currency (proof /
  benchmark / replication) and calibrate to the **floor-reader**, not a generic notion of quality.
- **Plain vs. field-code** → **structure vs. lexicon**: structure/syntax always plain (that layer is
  `linting-prose`); vocabulary tuned to the actual venue reader — use the community's coin, cut
  ornamental fog.
- **Disclose vs. don't-arm-the-reviewer** → **triage by answerability**: the generic *pre-stated
  limitation builds ethos; contradiction-laundering surfaces anyway* principle is
  `designing-presentations`; the paper delta is triage against an **absent** reviewer — raise+answer
  what you can bound (inoculation), convert the unanswerable to a scoped limitation, never omit the one
  a reviewer will certainly raise. *Undisclosed-but-discoverable is the losing quadrant.*
- **Editor vs. reviewer register** → assertive about *significance* to the editor (cover letter,
  abstract framing); calibrated/modest about *claims* to the reviewer (body).

## Calibration inversion — why the prominence is where it is

Every source above corrected a *human novice's* failure. A capable model fails **differently**, and
the prominence follows the model's failure, not the human's (`references/sources.md` §inversion):

| | The sources' audience (human novice) | This skill's consumer (a frontier model) |
|---|---|---|
| dominant error | buries the contribution; can't find "so what"; hedges into mush OR overstates | **bidirectional & layer-split**: over-hedges *locally* (RLHF politeness → mush on real results) AND over-claims / **fabricates** *globally* (unearned "first"/"novel"/"significant"; invented cites/baselines/numbers; fake "unlike prior work"; template data-dump; both-sides refusal to commit) |
| which is worse | — | over-hedging is more **frequent**; overclaiming + **fabrication** is more **FATAL** — a reviewer kills a paper on ONE fabricated cite or ONE unsupported "first" |
| made first-class | the story arc, the funnel | the **anti-fabrication HARD gate** (LAW) + **two-pass per-layer calibration** (assert core / scope-hedge / kill unwarranted superlatives) + **commit to one claim** + **MUST-NOT-FIRE** on trivial asks |

Corrective is never a global "be more/less confident" — it is **per-layer** (assert at the claim
level; restrain-and-ground at the framing/evidence level). Full argument, and the reflexive grading of
this skill's own sources: `references/sources.md` §inversion (its SOLE home — this table is the only
copy carried here for prominence).

## MUST-NOT-FIRE — and the fire/no-fire set

Ceremony on a trivial writing ask is this skill failing its own bar. Full desk-check set:
`tests/triggers.md` — re-run after ANY description edit.

**FIRES:** 「この論文の主張、弱くない?」 · "help me write the intro / abstract / contributions" ·
"how do I position this against [prior work]" · "will this claim survive review / reviewer 2?" ·
"我々の貢献をどう主張する" · "is my abstract overclaiming?" · "write the related-work / limitations" ·
"draft the rebuttal to reviewer 2" · a messy "make my paper more convincing, reviewers keep saying
it's not novel enough."

**MUST NOT fire (with route):**

| Ask | Route |
|---|---|
| "reorganize / MECE / fix section order / de-duplicate this doc" | `structuring-documents` (organize info you've decided to include) |
| "polish the wording / this reads AI-ish / fix this sentence's over-claim" | `linting-prose` (rewrite-in-place; sentence-level calibration) |
| "make my conference *talk* / slides / pitch better" | `designing-presentations` (live room) |
| "synthesize these 40 papers into a survey / SoK" | `systematizing-knowledge` (others' corpus → position) |
| "help me come up with the research idea / is this thesis novel as a bet" | `forging-novel-theses` (generate the idea) |
| "compile the LaTeX / fix the bib" | `compiling-latex` |
| a one-line typo / grammar fix | just fix it — no ceremony |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `structuring-documents` | **PURPOSE** — *what to claim & how to defend it* (the epistemic/rhetorical layer: contribution, calibration, positioning, review-survival) → HERE; *how to organize the information you've decided to include* (MECE, single-source, backward-DAG, section order as IA) → there. **Shared-object seam** (state it, don't blur it): the paper's **governing claim IS its 目標規定文** (and, for a talk, its governing sentence — `designing-presentations`) — ONE sentence, decided by three different questions. HERE owns whether it is the RIGHT, calibrated, novel claim (epistemic content); `structuring-documents` owns that the doc asserts exactly that one thing and every fact homes to it (structure); `designing-presentations` owns it as a live-talk thesis. Co-fire in sequence: argue the claim HERE → organize the sections THERE. |
| `linting-prose` | **SCALE/LOCALITY** — claim calibration at the **argument/contribution** level (is the paper's thesis supported by the study; is the contribution overstated relative to what was shown) → HERE; calibration at the **sentence** (does this sentence over/under-claim; hedge-word choice; スリカエ; tool-first titles; stress/topic position; zombie nouns) → there. Co-fire: construct the calibrated claim HERE → word it THERE. |
| `designing-presentations` | **MEDIUM/AUDIENCE** — a **written** paper for an **absent, skeptical peer-review** readership + the permanent record → HERE; a **live spoken talk / slides** for a **present, modeled room** → there. The generic persuasion-ordering machinery (Minto pyramid, SCQA/BLUF, vertical-logic, governing-*sentence*, "so what?" test, objection-*inventory*) is **owned by designing-presentations** — reuse it by pointer; HERE adds only what the written/peer-reviewed/permanent medium demands (calibration-to-evidence, literature positioning, the fabrication ban, the zone-split, genre conventions, review-survival). Co-fire when you both write AND present the work. |
| `systematizing-knowledge` | **DIRECTION/CARDINALITY** — argue **your own** novel claim in **ONE** paper → HERE; synthesize **others'** many papers into a position (survey/SoK) → there. (SoK is also the *engine that built this skill*; and a paper's related-work may draw on an SoK as a sub-step.) |
| `forging-novel-theses` | **PURPOSE** — **generate & harden** the novel idea/bet (before it exists) → there; **write up & defend** finished research as a paper for review → HERE. Co-fire: forge the thesis THERE → argue it in the paper HERE. |
| `compiling-latex` / `writing-technical-japanese` | build/tooling (LaTeX) → `compiling-latex`. Japanese prose mechanics → `writing-technical-japanese`, which itself yields to `structuring-documents`/`linting-prose` when present. Neither owns the argument/claim — that is HERE. |

## Execution model — the claim is SOLO; red-team and fact-checking fan out

Operating guidance from a frontier model (Fable 5 / Opus, 2026-07) to whatever model runs this later:
a paper is **ONE argument for ONE claim** — deciding the claim, its calibration, and the reconciliation
that resolves the field's tensions is **one-context by construction**. A harness buys a *read-only
adversarial layer*, never the argument.

**Evidence archetype = CITATION-RELAY with a fabrication quarantine.** The evidence a claim rests on
is *observables* — the author's actual results and *real, retrievable* prior work. Agents CAN fetch and
verify those; agents CANNOT invent them. Every agent return keys on a **checkable locus** (the table/
theorem/figure, the real citation) — an agent's felt confidence is not a signal, and an
agent-supplied citation/number enters the paper only after primary verification or as a labelled
placeholder. **An agent that agrees the claim is great is not evidence; an agent that refutes it is.**

| Stage | Mode | Why |
|---|---|---|
| Reset goal · fill CLAIM SPEC · **the governing claim & its calibration** · the reconciliation moderators · commit to a position | **SOLO — never shard** | the argument must sit in one context; assembled from shards it is not an argument |
| **Reviewer red-team** (3–5 skeptics, one lens each: novelty/significance · soundness/evidence · related-work completeness · reproducibility · clarity) | **FAN-OUT, read-only** | independent hostile lenses catch what one context won't; **refutation-prompted** — name the LENS, never the expected finding |
| Citation / number / baseline / prior-work **verification** | **FAN-OUT, read-only** | fetch the real source; return locus or "[VERIFY]" — never a plausible-looking reference |
| Fixing the claim / conceding / the rebuttal | **SOLO** | findings braid; one author signs every concession and every claim |

Scale: a single claim → fully SOLO, run the red-team lenses yourself. A high-stakes submission /
resubmission → SOLO argument + fan-out red-team + fact-check. **No harness → same map, serial** (the
red-team lenses become separate focused passes). Worker-side: if THIS skill is spawned as a lens inside
another skill's fleet, it returns findings as data (five-slot: claim / gate G1-G3 / cited locus /
the calibrated fix / unchecked risk), read-only, no verdict a downstream reader cannot check.
*If a constraint here feels unnecessary, that feeling is the failure mode — follow the map.*

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/reconciliation.md` | the Aufhebung: every split-by moderator argued with its camps + regime + the runtime decision variable; the McEnerney value-reset (§5); the zone-split law (§1); the editor-vs-reviewer register split (§3) | any tension between two pieces of writing advice; deciding narrative vs. austerity; step 1 & 7 |
| `references/calibration.md` | the 主張の仕方 core: importance-vs-certainty, the two-pass calibration procedure, Hyland hedges/boosters, Latour modalities, Boutron spin taxonomy, MAGIC, effect-size/estimation, and the **anti-fabrication protocol** + placeholder tokens | writing or auditing any claim; the abstract/conclusion; whenever a number or citation is about to be written; step 2 & 4 |
| `references/frameworks.md` | the named toolkit — CARS, Toulmin, CoR (Topic-Question-Significance; claim/reasons/evidence/warrant/acknowledgment), OCAR/ABT/LD, C-C-C, Heilmeier; abstract genres (Nature "here we show", SPJ four-sentence, structured), title craft, contribution-bullet convention, editor-facing genres (cover letter, significance statement) | drafting/auditing the intro, abstract, title, or contributions; the cover letter; picking a structural frame; step 2,3,5 |
| `references/genre-playbooks.md` | field-dependent fill: empirical-science, CS/ML top-venue (contributions, ablation-as-control, reproducibility, Fig-1, review rubric, rebuttal), math-theory (Halmos motivation→statement→proof, notation, significance-legibility), Japanese review (新規性・有用性・信頼性, 事実と意見) | instantiating the target venue's conventions; step 5 |
| `references/reviewer-defense.md` | surviving the absent adversary: the reviewer red-team lens set, Bordage rejection taxonomy, review decision-axes, objection triage, limitations-as-ethos, the rebuttal genre; the worker-side lens contract | step 6; before submission/resubmission; writing a rebuttal; running the red-team fan-out |
| `references/sources.md` | the SOLE provenance ledger: every distilled source graded (author-confirmed / paraphrase / third-party / constructed / needs-verification), the calibration-inversion argument, the lineage, and the reflexive grading of this skill's own claims | grading any claim to a source; "is this attribution safe to state as the author's?"; reforge |
