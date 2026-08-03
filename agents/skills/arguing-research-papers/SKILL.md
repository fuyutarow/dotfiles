---
name: arguing-research-papers
description: >-
  Argues ONE FINISHED research CLAIM via CLAIM SPEC, or appraises ONE paper's argument, method, and
  validity. Use for CLAIM/ARGUMENT work on abstract, introduction/intro, Limitations, related work/
  related-work, rebuttal/review response, contribution/novelty, overclaim, reviewer 2, peer-review
  critique, 論文の主張, 貢献, 新規性, 査読, リバッタル. Claim-first: judge/calibrate HERE; then
  structuring-documents owns architecture and linting-prose owns wording. Typo/format-only with meaning
  fixed → direct/plain edit; corpus synthesis → systematizing-knowledge. Cuts: unfinished programme →
  supervising-research-programmes; fact extract → raising-resolution; premise exposure → surfacing-blind-spots;
  thesis genesis → forging-novel-theses; costly future test → acting-on-hypotheses; live talk →
  designing-presentations; topology → orchestrating-agents. Claim/calibration stay SOLO; red-team and
  fact-check may fan out. English skill; answer in the user's language.
---

# Arguing research papers — one claim, calibrated to evidence, hardened for review

> **Version**: v2608.0.1 (2026-08-02) — claim-qualified aliases and negative stage-1 cuts.
> Scope, lineage, history, and verification: `tests/forge-verification-ledger.md`; provenance: `references/sources.md`.

Build atomically. From this skill directory, the following must print nothing:

```bash
for f in frameworks reconciliation calibration genre-playbooks reviewer-defense sources; do
  test -f "references/$f.md" || echo "MISSING $f"
done
test -f scripts/claim-check.ts || echo "MISSING claim-check.ts"
for t in triggers forge-verification-ledger; do
  test -f "tests/$t.md" || echo "MISSING $t"
done
```

## Language & stable tokens

This skill is **English**. Respond in the user's language, with Japanese as the default.
The following tokens are stable identifiers:

| Group | Stable tokens |
|---|---|
| control | **LAW**, **gate (G1/G2/G3)**, **fire/no-fire**, **solo/fan-out** |
| claim | **CLAIM SPEC**, **governing claim**, **anchor**, **red-team** |
| calibration | **zone-split**, **persuasion surface**, **record surface**, **scope-hedge**, **importance-bold** |
| frameworks | **CARS**, **Toulmin**, **OCAR**, **ABT** |
| Japanese domain terms | **主張 / 絞る / 問い・主張・論証 / 事実と意見 / 新規性・有用性・信頼性** |

## THE LAW

> A research paper argues **ONE claim to a skeptical, absent expert community**.
> It must survive a hostile, skimming reviewer and the permanent record. It is not an activity report.
> Its currency is value to expert readers. Earn value through a real instability with a named reader-cost.
>
> The bar — a paper that passes carries all of:
> 1. **ONE governing claim**: “This paper shows that ___.” It survives *so what?* to a named reader-cost.
>    Multiple contributions ladder up to it; they never sit co-equal.
> 2. **Claim = evidence.** Anchor each claim to a real table, theorem, figure, or result.
>    Hedge scope to what the evidence licenses. Assert importance flatly. Never fabricate an anchor.
> 3. **Positioning.** Name the nearest prior method and its specific gap. Never write bare “unlike prior work.”
>    Pre-empt the sharpest hostile objection or state a scoped concession.
> 4. **Zone-split.** Narrative and value-framing stay on title, abstract, intro, and discussion surfaces.
>    Methods, results, and supplements may carry factual headers and evidence-chain signposts.
>    They never alter completeness, uncertainty, hypothesis timing, or claim reach.
>    This is austerity-of-persuasion, not austerity-of-navigation.
>
> A donor-domain success, analogy, or correspondence may explain why a target claim was investigated.
>
> It never warrants a **finished target claim**. That claim needs a target-side anchor and limitation.
> An untested mapping returns to `forging-novel-theses`. An expensive target test returns to
> `acting-on-hypotheses`.
>
> Above all: **NEVER invent a citation, baseline, dataset, or number to make the argument land.**
> Fabricated support is not weak writing; once shipped, it is misconduct.
> Ungrounded support becomes `[CITATION NEEDED]`, `[BASELINE — verify]`, or `[VALUE — compute]`.
> Never substitute a plausible-looking reference. This gate outranks every persuasion rule below.

## The three gates — each demands a grep-able artifact in the CLAIM SPEC

This follows the house gate idiom. A gate passes only when its artifact exists in the filled CLAIM SPEC.
G1–G3 judge the argument. **G0 — materials audit** is their input precondition, not a fourth rhetoric gate.
G0 fixes what evidence exists before G1–G3 decide what it licenses. Its `In hand` line is floor-checked.
感触では通れない: no artifact means the gate is unpassed.

`scripts/claim-check.ts` is a structural floor, not a semantic judge.
It checks G0, governing claim, instability/cost, anchor, scope, positioning, and objection slots.
Those slots must be non-placeholder, except the G2 anchor may carry a sanctioned `[…]` deferral.
Contribution type, warrant, novelty scope, and evidential fit remain semantic judgments here.

| # | Gate | Inverts (the failure) | ARTIFACT (must exist, non-placeholder) |
|---|---|---|---|
| **G1** | **絞る — one claim** | coverage-seeking sprawl; a topic, not a problem; a flat list of co-equal "contributions" | the **governing-claim** line (ONE sentence) + the **instability + named reader-cost** + the contribution **type**; sub-contributions each shown to ladder up |
| **G2** | **calibrate — claim = evidence** | over-hedge into mush *and* over-claim / **fabrication** | per claim: the **evidence anchor** (real table/theorem/figure, or an explicit placeholder) + the **warrant** in the field's currency + the **scope qualifier + rebuttal**; every superlative / "significant" / "first" carries an inline warrant or is downgraded |
| **G3** | **position + reviewer-proof** | fake positioning ("unlike prior work"); boilerplate limitations; missing the fatal objection | the **nearest NAMED prior method + the specific gap** ("Unlike [X], which [Y], we [Z]") + the **sharpest hostile-reviewer objection** with an answer OR a scoped concession (a concession never covers a fatal-if-true — reviewer-defense.md §3) + the **novelty scope** ("to our knowledge, first to __ under __") |

## The CLAIM SPEC — fill this BEFORE drafting prose (and to audit any draft)

The spec makes the paper's argument checkable. Fill it, run the floor, then write.
An unfillable slot is a finding, not a formatting gap. Name its failed gate and mark the paper not ready there.
Never cover the gap with fluent prose.

An honest placeholder may correctly make the floor FAIL. Report that result.
Filling a slot from memory merely to turn the floor green is fabrication at the spec layer.
Keep every English slot label verbatim. Put each value on the same line as its label.

```markdown
# CLAIM SPEC: [paper working title]

## G0 — materials audit (fill FIRST; a missing item becomes a placeholder below, never a confident assertion)
- In hand: results/figures/theorems (by locus) · nearest prior (retrievable, read) · target venue + reward: [...]
- Missing → mark `[VERIFY]`/`[CITATION NEEDED]` here and do NOT assert it downstream as if held: [...]

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

Then run:

```bash
bun scripts/claim-check.ts <spec.md>
```

The floor checks presence, banned bare positioning, and placeholder discipline.
It cannot judge whether an anchor licenses the claim; the argument owner does that.

## The build procedure — logic, not chronology

Run in the order below. Each step routes to one reference.
This is a decision procedure, not a prose template.

**Fast path.** A targeted one-claim diagnostic may skip the CLAIM SPEC.
Examples are “is this overclaiming?” and “is this positioning real?”
Answer through the cited reference without producing manuscript text.

The boundary is diagnostic versus production, not whole versus part.
Any manuscript text activates G0 and the CLAIM SPEC. This includes one abstract or one contribution bullet.
Piecewise requests re-enter the full path at their first production step.

0. **G0 — materials audit.** Distinguish held evidence from summaries and user reports.
   List readable results, nearest prior work, and target venue.
   `In hand` means the artifact itself is readable in this session.
   A user statement such as “Table 2 shows 12%” becomes `[VERIFY — user-reported]` until inspected.
   Every missing item becomes an explicit placeholder. Never build a confident assertion on a paraphrase.
   The diagnostic fast path is exempt; manuscript production is not. See `references/calibration.md` §6.

1. **Reset the goal.** Replace “explain what I did” with “change what this community believes.”
   Name the reader community, accepted belief, and doubt. See `references/reconciliation.md` §5.

2. **Fill the CLAIM SPEC.** Draft to discover the claim if necessary.
   Once a claim exists, the spec governs. Calibration lives in `references/calibration.md`.
   Toulmin, CoR, and contribution type live in `references/frameworks.md`.

3. **Motivate.** State the instability and reader-cost. Cut the niche against named prior work.
   Use CARS Move 2 in `references/frameworks.md` and the checks in `references/reviewer-defense.md`.

4. **Calibrate every claim.** First state the strongest claim the grounds license.
   Then add only scoped qualifiers. Remove verb-softeners. Ground or placeholder every number and citation.
   See `references/calibration.md`.

5. **Fit the genre.** Instantiate the venue's conventions and reward function.
   This covers contribution bullets, ablation-as-control, abstract forms, and theorem exposition.
   See `references/genre-playbooks.md` and `references/frameworks.md`.

6. **Red-team.** Generate the three sharpest objections from competent hostile reviewers in this subfield.
   Answer or concede each through `references/reviewer-defense.md`.
   For “not novel enough,” name the claimed contribution type. Novelty is not complexity.
   See `references/frameworks.md` §5.

7. **Zone-check.** Keep narrative and value on persuasion surfaces.
   Keep record surfaces complete and austere. Framing must not alter facts or claim reach.
   See `references/reconciliation.md` §1.

8. **Hand off in claim-first order.** First sign the argument here.
   Then use `structuring-documents` for section architecture and `linting-prose` for wording.
   Use `designing-presentations` only for a live talk.

## The reconciliations (Aufheben) — the moderators that dissolve the field's fights

The paper-writing canon is full of apparent contradictions; almost all dissolve into a few
**split-by** moderators. These are precedence-setting; each is argued in full (with its camps and
regime) in `references/reconciliation.md`. Apply the moderator, do not pick a side.

- **Story vs. facts** uses a **structure/content** split.
  Narrative governs foregrounding and reveal order, never data values or warrants.
  Delete the framing mentally. If truth or uncertainty changes, it is spin; cut it.
- **Bold vs. calibrated** separates importance from certainty.
  Maximize importance while calibrating certainty. Never buy boldness by inflating confidence.
  Hedge the scope and assert the core.
- **Convey vs. create value** → **source vs. selector**: your results are the source; the reader's
  problem is the selector of what to foreground. Value is always computed over the *actual*
  contribution, never invented.
- **Template vs. argument** → **container vs. content**: keep IMRaD's slots; let the *thesis* (not
  the timeline) fill them by logic. Every subsection must answer "which part of my argument does this
  serve?" or be cut to the supplement.
- **Answer-first vs. build-up** splits by scale.
  Generic conclusion-first ordering belongs to `designing-presentations`.
  A paper makes title, abstract, first paragraph, section openers, and captions answer-first.
  Scientific suspense is the named gap, never a withheld take-home.
- **Universal template vs. field-dependence** separates schema from fill.
  Toulmin's slots are stable. Fill backing and qualifier with proof, benchmark, or replication evidence.
  Calibrate to the target venue's floor-reader.
- **Plain vs. field-code** separates structure from lexicon.
  Keep syntax plain through `linting-prose`. Use the target community's vocabulary without ornamental fog.
- **Disclose vs. don't-arm-the-reviewer** uses answerability triage.
  Raise and answer bounded objections. Convert survivable unanswerable issues into scoped limitations.
  Never omit an objection a reviewer will certainly raise.
  A real or undeterminable fatal-if-true is a submission block, never a limitation.
  See `references/reviewer-defense.md` §3.
- **Editor vs. reviewer register** separates significance from claim certainty.
  Be assertive about significance in editor-facing genres. Calibrate claims in the body.

## Calibration inversion — why the prominence is where it is

The sources corrected human novice failures. A capable model fails differently.
Prominence therefore follows the model failure described in `references/sources.md` §inversion.

| | The sources' audience (human novice) | This skill's consumer (a frontier model) |
|---|---|---|
| dominant error | buries the contribution; can't find "so what"; hedges into mush OR overstates | **bidirectional & layer-split**: over-hedges *locally* (RLHF politeness → mush on real results) AND over-claims / **fabricates** *globally* (unearned "first"/"novel"/"significant"; invented cites/baselines/numbers; fake "unlike prior work"; template data-dump; both-sides refusal to commit) |
| which is worse | — | over-hedging is more **frequent**; overclaiming + **fabrication** is more **FATAL** — a reviewer kills a paper on ONE fabricated cite or ONE unsupported "first" |
| made first-class | the story arc, the funnel | the **anti-fabrication HARD gate** (LAW) + **two-pass per-layer calibration** (assert core / scope-hedge / kill unwarranted superlatives) + **commit to one claim** + **MUST-NOT-FIRE** on trivial asks |

Never prescribe a global “be more or less confident.” Correct per layer.
Assert the licensed claim; restrain and ground its framing and evidence.
The sole full argument and source grading live in `references/sources.md` §inversion.

## MUST-NOT-FIRE — and the fire/no-fire set

Ceremony on a trivial writing ask is this skill failing its own bar. Full desk-check set:
`tests/triggers.md` — re-run after ANY description edit.

**FIRES:** one finished claim's argument or critical appraisal.
Literal genre aliases and realistic prompts live in `tests/triggers.md`.
The stage-1 rule is claim-first: argument here, architecture next, sentence polish last.

**MUST NOT fire (with route):**

| Ask | Route |
|---|---|
| "reorganize / MECE / fix section order / de-duplicate this doc" | `structuring-documents` (organize info you've decided to include) |
| "polish the wording / this reads AI-ish / fix this sentence's over-claim" | `linting-prose` (rewrite-in-place; sentence-level calibration) |
| "make my conference *talk* / slides / pitch better" | `designing-presentations` (live room) |
| "synthesize these 40 papers into a survey / SoK" | `systematizing-knowledge` (others' corpus → position) |
| "extract/check one reported fact from this paper" | `raising-resolution` (bounded factual observation) |
| "give me a neutral summary of this one paper" | direct answer using `raising-resolution`'s citation gate silently |
| "surface hidden premises only; do not assess whether they hold" | `surfacing-blind-spots` (premise exposure, not reviewer judgment) |
| "help me come up with thesis candidates for this selected problem" | `forging-novel-theses` (generate candidates only) |
| "the completed result forces us to reopen the problem or research direction" | `supervising-research-programmes` (decide whether and where the programme reopens) |
| "precommit a test/commit/kill table for this expensive/irreversible selected thesis" | `acting-on-hypotheses` |
| "run this deterministic 30-second reversible check" | domain/plain executor; return `EXECUTOR RESULT` to `directing-research-sections` |
| "decide author/reviewer/verifier roles and acceptance timing" | `orchestrating-agents` |
| "govern admission, authority, review, retirement, or deletion across research documents" | `governing-research-documentation` |
| "compile the LaTeX / fix the bib" | `compiling-latex` |
| a one-line typo / grammar fix | just fix it — no ceremony |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `structuring-documents` | **PURPOSE.** Claim correctness, calibration, novelty, and defense → HERE. MECE, fact homes, and section order → there. Shared sentence: HERE signs its meaning; that skill makes the document assert it once. Order: argue HERE, then organize THERE. |
| `linting-prose` | **SCALE/LOCALITY.** Argument-level claim=evidence and contribution scope → HERE. Sentence-level hedges, wording, stress, and topic position → there. Order: calibrate HERE, then word THERE. |
| `designing-presentations` | **MEDIUM/AUDIENCE.** Written paper for absent peer review and the permanent record → HERE. Live talk for a present room → there. Generic persuasion ordering belongs there; paper-specific calibration, positioning, fabrication ban, zone-split, genre, and review survival stay HERE. |
| `raising-resolution` | **OUTPUT/PURPOSE** — verify or extract one bounded factual claim from one paper → there; judge whether the paper's argument, method, or evidence warrants its claim → reviewer red-team HERE. A neutral one-paper summary is a direct answer with its citation gate silent. |
| `surfacing-blind-spots` | **PURPOSE** — expose implicit premises or human tacit constraints without deciding whether they hold → there; assess a premise/warrant against evidence and state the calibrated objection → HERE. If both are requested: expose there, then red-team here. |
| `systematizing-knowledge` | **FUNCTION/CARDINALITY** — critically appraise ONE paper's argument/method/validity → HERE; synthesize MANY sources into a field position → there. (SoK is also the *engine that built this skill*; a paper's related-work may draw on an SoK as a sub-step.) |
| `supervising-research-programmes` | **PHASE/PURPOSE** — research-problem/programme decisions and a deliberate global reopen before a finished claim → there; argue admitted finished evidence as one manuscript claim → HERE. HARKing is not repaired by silently reopening history: label postdiction there, then calibrate the written claim HERE. |
| `directing-research-sections` | **STATE/PURPOSE** — one granted live section's candidate admission, local run, and executor-result join → there; argue its admitted finished evidence as one manuscript claim → HERE. |
| `forging-novel-theses` | **PURPOSE/MATURITY** — generate `Status: CANDIDATE` thesis packets or source→target mapping / `MAPPING-BREAK` for a selected frame → there; write and defend finished **target-side** evidence as a paper → HERE. A reviewer novelty objection begins HERE; only an explicit `supervising-research-programmes` reopen returns to candidate generation. |
| `acting-on-hypotheses` | **PHASE + HARD GATE** — test/commit/kill one expensive/irreversible selected forward tree → there; run a cheap deterministic reversible probe through the domain/plain executor; argue completed evidence → HERE. |
| `orchestrating-agents` | **PURPOSE** — claim and argument meaning → HERE; author/reviewer/verifier topology, evidence visibility, veto timing, and acceptance → there. Co-fire only after the claim contract is fixed. |
| `governing-research-documentation` | **CARDINALITY + LIFECYCLE** — one finished manuscript claim and its reviewer-proof argument → HERE; admission, authority, evidence lineage, review, retirement, and deletion across the research-document portfolio → there. |
| `compiling-latex` / `writing-technical-japanese` | build/tooling (LaTeX) → `compiling-latex`. Japanese prose mechanics → `writing-technical-japanese`, which itself yields to `structuring-documents`/`linting-prose` when present. Neither owns the argument/claim — that is HERE. |

## Execution model — the claim is SOLO; red-team and fact-checking fan out

This execution model is durable across model versions.
A paper is **ONE argument for ONE claim**. Claim, calibration, and reconciliation stay in one context.
A harness adds a read-only adversarial layer; it never authors the argument.

**Evidence archetype = CITATION-RELAY with a fabrication quarantine.**
Claims rest on observable results and real, retrievable prior work.
Agents may fetch and verify those sources; they may not invent them.
Every return carries a checkable table, theorem, figure, or citation locus.
Agent confidence is not evidence. Verify an agent-supplied citation or number before use.
Otherwise keep it as a labelled placeholder. Agreement is not evidence; a refutation is useful evidence.

| Stage | Mode | Why |
|---|---|---|
| **G0 materials audit** · reset goal · fill CLAIM SPEC · **the governing claim & its calibration** · the reconciliation moderators · commit to a position | **SOLO — never shard** | the argument must sit in one context; assembled from shards it is not an argument. Calibration still **consumes** the fan-out red-team + fact-check below (domain evidence feeds IN); only the final synthesis & signature are SOLO |
| **Reviewer red-team** (3–5 skeptics, one lens each: novelty/significance · soundness/evidence · related-work completeness · reproducibility · clarity) | **FAN-OUT, read-only** | independent hostile lenses catch what one context won't; **refutation-prompted** — name the LENS, never the expected finding |
| Citation / number / baseline / prior-work **verification** | **FAN-OUT, read-only** | fetch the real source; return the locus **plus a support / currency / load-bearing-strength assessment** (calibration.md §6), or "[VERIFY]" — never a plausible-looking reference, never bare "it exists" |
| Fixing the claim / conceding / the rebuttal | **SOLO** | findings braid; one author signs every concession and every claim |

For a single claim, stay SOLO and run red-team lenses serially.
For a high-stakes submission, keep the argument SOLO and fan out red-team and fact checks.
Without a harness, preserve the same map as separate focused passes.

When spawned as another fleet's lens, return five read-only fields:
claim; gate G0–G3; cited locus; calibrated fix; unchecked risk.
Do not return a verdict the downstream reader cannot verify.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/reconciliation.md` | the Aufhebung: every split-by moderator argued with its camps + regime + the runtime decision variable; the McEnerney value-reset (§5); the zone-split law (§1); the editor-vs-reviewer register split (§3) | any tension between two pieces of writing advice; deciding narrative vs. austerity; step 1 & 7 |
| `references/calibration.md` | the 主張の仕方 core: importance-vs-certainty, the two-pass calibration procedure, Hyland hedges/boosters, Latour modalities, Boutron spin taxonomy, MAGIC, effect-size/estimation, the **anti-fabrication protocol** + placeholder tokens, and the citation-QUALITY check (support/currency/strength) | writing or auditing any claim; the abstract/conclusion; whenever a number or citation is about to be written; step 2 & 4 |
| `references/frameworks.md` | CARS, Toulmin, CoR, OCAR/ABT/LD, C-C-C, Heilmeier; abstract/title forms; contribution and editor-facing genres; resource-paper claim slots | drafting the intro, abstract, title, contributions, or cover letter; steps 2, 3, 5 |
| `references/genre-playbooks.md` | field-dependent fill: empirical-science, CS/ML top-venue (contributions, ablation-as-control, reproducibility, Fig-1, review rubric, rebuttal), math-theory (Halmos motivation→statement→proof, notation, significance-legibility), Japanese review (新規性・有用性・信頼性, 事実と意見) | instantiating the target venue's conventions; step 5 |
| `references/reviewer-defense.md` | surviving the absent adversary: the reviewer red-team lens set, Bordage rejection taxonomy, review decision-axes, objection triage, limitations-as-ethos, the rebuttal genre; the worker-side lens contract | step 6; before submission/resubmission; writing a rebuttal; running the red-team fan-out |
| `references/sources.md` | the SOLE provenance ledger: every distilled source graded (author-confirmed / paraphrase / third-party / constructed / needs-verification), the calibration-inversion argument, the lineage, and the reflexive grading of this skill's own claims | grading any claim to a source; "is this attribution safe to state as the author's?"; reforge |
