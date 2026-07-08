# Reviewer defense — surviving the absent, hostile, skimming adversary

> **Scope**: the SOLE home of *review-survival* — the reader this paper is actually written for is not
> cooperative and present (that reader is `designing-presentations`' room); it is **absent, skeptical,
> time-pressured, reading non-linearly, and looking for a reason to say no**, and it decides your fate
> without you in the room. This file owns the red-team, objection triage, limitations-as-ethos, the
> rebuttal stance, the rejection-taxonomy checklists, and the worker-side lens contract. Provenance:
> `sources.md`. The objection-triage *principle* is argued in `reconciliation.md` §3; here is the
> procedure.

## §1 — Write for the reader who is trying to reject you

Inter-reviewer agreement is low; you cannot write for "the reviewer" as an average. Write for the
**single most hostile competent reviewer** in your subfield — if the paper survives them, it survives
the pool. Consequences that override the cooperative-reader defaults:
- The contribution must be findable in a **rapid non-linear skim**: title → abstract → Fig 1 →
  contributions bullets → results table. If a skimming skeptic cannot locate the claim there, the paper
  is rejected before the body is read (answer-first at every skim surface, `reconciliation.md` §3).
- The reviewer scores on **separate axes** and rejection travels through any one of them — defending the
  axis you can check locally (soundness) while ignoring the axis that actually decides (significance/
  novelty) is the model's failure. Score your own draft on each axis first (§6).
- A single **unsupported superlative or fabricated support** invites the reviewer to produce one
  counter-example and reject on credibility — the fatal half of the calibration inversion
  (`calibration.md` §6). One placeholder is safe; one fabrication is fatal.

## §2 — The reviewer red-team (the adversarial fan-out)

Before submission, generate the **3–5 sharpest objections** the most hostile competent reviewer would
raise, and for each either **address it in-text with evidence** or **concede it as an honest, scoped
limitation**. Never ship a Limitations section of only generic caveats.

Run it as **diverse lenses — one per agent, refutation-prompted** (name the LENS, never the expected
finding; a prompt that lists the finding gets it back — confirmation at machine speed). The lens set,
matched to the review axes:

| Lens | Attacks (the objection it hunts) |
|---|---|
| **novelty / significance** | is the gap real and consequential, or manufactured ("no one combined A and B")? is the contribution just complexity mistaken for novelty? does a named prior work already do this? |
| **soundness / evidence** | does each claim's anchor actually license it? confounds, unfair baselines, single-run numbers, leakage, ablations that changed compute, "significant" with no test |
| **related-work completeness** | the nearest competitor unaddressed or **mischaracterized**; a likely-reviewer's paper uncited; a claim of "first" one citation falsifies |
| **reproducibility** | can the result be rebuilt from what's disclosed? missing hyperparameters/seeds/compute/code |
| **clarity / contribution-legibility** | can a skimmer find the one claim? does Fig 1 carry the idea? are captions assertions? |

The novelty lens **diagnoses**; the **reframe** when a reviewer says "not novel enough" is `frameworks.md`
§5 (Michael Black): state which contribution TYPE you claim (problem / insight / method / data / result),
and frame simplicity as a feature ("surprisingly, X suffices") — reviewers conflate novelty with
complexity, so name the yardstick they should apply.

**Trust boundary** (`SKILL.md` execution model, CITATION-RELAY archetype): each lens returns findings
as **data keyed to a checkable locus** — the specific claim + where it fails + the fix — never a verdict
or a felt confidence. An agent that says "looks convincing" is not a signal; an agent that refutes a
claim is. Fixing/conceding is **SOLO** — one author signs every concession so the paper's position stays
consistent. **No harness → the lenses become separate focused self-review passes**, same set.

The red-team's found objections feed §3 (triage) and the Limitations section (§4); the sharpest one is
the G3 artifact in the CLAIM SPEC.

## §3 — Objection triage (disclose vs. don't-arm-the-reviewer)

For every objection the red-team surfaces, **triage by answerability** and route it:

1. **Enumerate** every doubt from the red-team (the confound, the missing control, the unfair
   comparison, the generalization gap, "why hasn't this been done", cost/scale, edge case).
2. **Classify** each:
   - **Answerable / boundable** → **raise it and answer it in the main line** (inoculation: naming a
     weakness you can bound reads as rigor and pre-empts the review). Reframe as a *scope condition with
     a stated bias direction*, not a confession.
   - **Unanswerable-but-survivable** → state as an explicit **scoped limitation** ("we do not claim …;
     future work"), not a full engagement you will lose.
   - **Fatal-if-true** → either **resolve it with evidence** (run the experiment, add the proof) or, if
     you cannot, do **not** raise it unprompted — but know it is the paper's real weakness. Pre-emption
     is a scalpel, not a confession.
   - **Certain-to-be-raised regardless** → you **must** address it; omitting the objection a reviewer
     will certainly raise is the losing move.
3. **Route** surviving-but-narrow objections to a **backup / appendix** (the exhaustive defense for
   "reviewer 2" lives in the supplement; the main text keeps the clean single story for the editor and
   skimmer — main-text-vs-appendix split, `reconciliation.md` §3).

**The losing quadrant is undisclosed-but-discoverable.** Concede the survivable specifically; defend the
load-bearing; never hedge diffusely across every claim (uniform hedging reads as no result). Plant the
naysayer *attributed to a real holder* in strong form, then answer (Graff-Birkenstein) — a strawman you
knock down fools no one and a dismissive counter-claim against work that may be your reviewer's is
self-defeating (steelman before you strike).

## §4 — Limitations as ethos (not boilerplate, not confession)

The generic principle — *a pre-stated limitation builds ethos; one extracted under questioning is a
wound; contradiction-laundering (burying a known limitation) surfaces anyway* — is owned by
`designing-presentations` (its non-negotiables); reuse it, don't re-derive it. The **paper delta**: the
model's failure is a generic *written* Limitations section ("small sample, future work could extend to
other domains") that a domain reviewer reads as *not understanding the method*. The corrective is a
section that names the **specific failure mode the reviewer would probe** — the confound, the regime
where the assumption breaks, the generalization boundary — each stated with its **bias direction** and,
where possible, bounded. This is 事実と意見 applied to your own weaknesses: state the *fact* of the
limitation plainly; mark the *judgment* about its severity as your opinion.

## §5 — The rebuttal / response-to-reviewers (the general stance)

Venue-specific mechanics (window, char caps, no de-anonymizing) are in `genre-playbooks.md` §1. The
durable stance:
- **Separate misunderstanding from disagreement.** A reviewer's *misunderstanding* → fix the text and
  say where (their misreading is often a clarity bug you own). A reviewer's *disagreement* → rebut with
  **new evidence** (a table, an experiment, a proof), not rhetoric or effusive thanks.
- **Lead with the concrete.** Open each reviewer's response with their core concern, then the new
  result that addresses it; concede real limitations and state the fix. Sycophancy ("we thank the
  reviewer for the insightful comment") and arguing-without-evidence are the model's rebuttal failures.
- **Prioritize the borderline / negative reviewer** — that is where a decision actually moves.

## §6 — Pre-submission checklists (self-score before you submit)

Run these as red-team checklists — verify the manuscript **pre-empts each item** before a reviewer or
meta-analyst does:
- **Review decision-axes** (score your own draft, find the weakest): Originality/Novelty ·
  Significance/Impact · Technical Quality/Soundness · Clarity/Presentation · Reproducibility ·
  Ethics/Limitations. Acceptance requires clearing **significance AND soundness**; each axis is a
  separate rejection path.
- **Bordage's empirical rejection top-10** (`genre-playbooks.md` §2) — inappropriate/incomplete
  statistics · over-interpretation · suboptimal instrumentation · sample too small/biased · hard to
  follow · insufficient problem statement · inaccurate/inconsistent data · outdated literature review ·
  insufficient data presented · defective tables/figures.
- **新規性・有用性・信頼性** (`genre-playbooks.md` §4) — the three-gate Japanese cross-check; a weak
  paper must be told *which* gate it fails.
- **The spin self-scan** (`calibration.md` §4) — title/abstract-conclusion/results, each spin device.
- **The fabrication self-audit** (`calibration.md` §6) — every citation/number/baseline grounded or
  placeheld.

## §7 — Worker-side contract (when this skill is a lens in another fleet)

If a larger workflow (e.g. an SoK write stage, a paper-review workflow) spawns THIS skill as a
read-only lens, it obeys the worker duty: **read-only, findings returned as data, no verdict theater.**
Each finding fills five slots so a downstream reader can act without re-deriving:

```
{ "claim": "<the paper claim under audit>",
  "gate":  "G1 | G2 | G3",
  "locus": "<the table/theorem/figure/citation the finding keys on — or [VERIFY]>",
  "fix":   "<the calibrated rewrite or the scoped concession>",
  "unchecked_risk": "<what this lens did NOT check>" }
```

No `PASS`/`GREEN` without a same-line clause naming what was checked and what remains. The orchestrator
argues; this lens only fetches evidence and refutes — consensus among lenses is one observation, not N
(diversify the lens, not the count).
