# Calibration — matching a claim's strength to its evidence (主張の仕方の核), and the fabrication gate

> **Scope**: the SOLE home of *how strong to make a claim* and *how never to fabricate its support*.
> This is the paper-specific delta over `linting-prose`'s sentence-level A-calibration: that skill
> asks "does this sentence over/under-claim as worded"; THIS file asks "is the paper's claim supported
> by the study, at exactly the strength the evidence licenses, with every support real". The
> importance-vs-certainty split that grounds all of this is argued in `reconciliation.md` §2 — read it
> first; this file operationalizes it. Provenance: `sources.md`.

## §1 — The two-pass calibration procedure (run on every claim)

The consumer's two opposite failures — *over-hedging* (RLHF mush: "may potentially suggest that X
could, under some conditions, be associated with Y") and *over-claiming* ("novel", "first to",
"significantly outperforms" with no test) — are both killed by the same two-pass move:

1. **Pass 1 — assert.** State the **strongest claim the grounds actually license**, as a flat
   declarative. No verb-softeners. If the data show a 3× error reduction across six conditions, write
   "population-level calibration removes the variation, at 3× lower error across all six conditions" —
   not "may help reduce error in some settings".
2. **Pass 2 — subtract scope, not confidence.** Remove ONLY the specific reach the evidence cannot
   cover, expressed as a **Toulmin qualifier** (population / regime / effect-size bound) + **rebuttal**
   ("… unless Y"). **One scoped qualifier beats three vague hedges.**

Result form: **"In regime S, X (flatly) — unless Y."** The scope is precise; the core is unhedged.

**Deletions the procedure forces** (the over-hedge half): "it is worth noting", "to some extent",
"one possible interpretation", bare "may potentially", "further research is needed" as a hedge (it is
fine as a *specific* open question). A generic verb-softener carries no propositional content and only
performs caution — cut it (Becker: distinguish the epistemically-required hedge from the
status-signaling hedge). Keep the hedge that narrows a claim to what evidence supports; cut the hedge
that only sounds careful.

**Warrant-or-downgrade** (the over-claim half): every superlative or strong verb must carry its
warrant *inline*, or be downgraded to what the evidence licenses:
- "first" / "novel" → **scope and search it**: "to our knowledge, the first to do Z under condition W"
  (a bounded, searched novelty claim survives one counter-citation; an unbounded "first to" dies to it).
- "significantly" → in empirical/biomedical work requires a **named statistical test** actually run;
  in ML idiom "significantly outperforms" asserts a *large, consistent margin* backed by **across-seed
  variance / CIs** (§5), not a p-value — but never let it imply a test that was not run (§6).
- "outperforms" / "state-of-the-art" → requires the **specific baselines and margins**, with variance.
- "robustly" / "generalizes" → requires **multiple datasets/domains**, not one benchmark.

**Separate observation, inference, and speculation into differently-hedged sentences.** The measured
result (event) is asserted; the mechanism you infer from it is hedged to the inference; the
implication you speculate is marked as speculation. The model's failure is applying one uniform
register to all three. Map to 事実と意見 (`genre-playbooks.md`, Japanese): the *fact* sentence gets no
judgment-marker; the *opinion/inference* sentence is marked as such ("we interpret this as …",
"〜と考えられる") — and never the reverse (a 意見 written as a 事実 is the スリカエ a reviewer catches).

## §2 — Hyland's stance model: pick the RIGHT hedge/booster

Four interactional resources project certainty and voice; calibrate each to the target discipline's
*measured* norm (sample recent papers in your exact venue — hedge/booster frequency differs sharply
across fields; importing another field's habit signals outsider status):

| Resource | Examples | Use |
|---|---|---|
| **Hedges** | may, might, suggest, appear, likely, approximately | withhold full commitment — for the inferential leap and measurement imprecision |
| **Boosters** | clearly, demonstrate, in fact, obviously, establish | close down alternatives — legitimate ONLY on an immediately-defensible or community-shared claim |
| **Attitude markers** | surprisingly, importantly, unexpectedly, anomalously | signal *value/instability* (this is the field-code, `reconciliation.md` §5) — place where value should be visible |
| **Self-mention** | we, our, I | authorial presence — active "we measured" (not "measurements were performed") in the argument zones; agentless passive is fine in Methods (§record-zone) |

Pick the hedge by its *job* (Hyland's typology): measurement imprecision → an **accuracy hedge**
("approximately", "generally"); protecting against being wrong on an inference → a **reliability /
writer-oriented hedge** ("it would appear", "we interpret"); disarming a skeptical reviewer → a
**reader-oriented concession** ("we believe", "admittedly"). A hedge chosen for the wrong job reads as
either evasive or naive.

## §3 — Latour's modalities: engineering a claim for hostile uptake

**Operational rule** (the claim-maturity regime, `reconciliation.md` §2): **strip modalities off your
settled BUILDING BLOCKS** — cite established prior work bare, build on it, let it be black-boxed — but
**retain modality on the contested FRONTIER claim you are actually defending**. Settled → strip; live
→ hedge. And **pre-empt the negative modality a reviewer will add**: name the condition C under which
your result is weakest *before* the reviewer does, and bound it.

Why it works (Latour): a statement's status as *fact* or *artefact* is decided by downstream uptake,
which adds or strips **modalities** — positive ones lead a claim *away* from its conditions of
production and harden it, negative ones lead it *back* and dissolve it. Stripping modalities off a
result your evidence does not yet license *is precisely how spin is fabricated* — §4 names the symptom,
Latour names the move.

## §4 — The spin taxonomy (Boutron): a pre-submission self-scan

"Spin" = reporting/interpretation strategies that emphasize benefit beyond what the results support.
Scan your own **title, abstract-conclusion, and Results text** for each device *before a reviewer or
meta-analyst does*:
- focusing the conclusion on a **significant secondary** outcome when the **primary** was non-significant;
- claiming **equivalence / non-inferiority** from a non-significant *superiority* test;
- emphasizing **effect size** while burying the non-significant test;
- **framing** (title / abstract conclusion) that overstates benefit;
- (ML analogue) reporting the **one benchmark you won**, single-run, and writing "state-of-the-art".

The abstract's claim strength must **equal** — not exceed and not undersell — the Results section:
state the strongest claim the evidence licenses, and no stronger. **Boldness is free only up to the
exact line the paper defends.** A declarative-result title ("X Improves Y") is legitimate only when
the result is single, strong, and the whole point across the claimed scope; otherwise use a
mechanism/scope title ("A [method] for [problem] under [condition]").

## §5 — Making a quantitative claim as strong AND defensible as possible

Calibration is a *floor* (don't overclaim); MAGIC (Abelson) is the *ceiling* — a rubric for how
**persuasive** a statistical claim is, orthogonal to whether it is merely significant. Audit every
quantitative claim on:

- **M**agnitude — how big is the effect (not just p<.05)? Lead with the estimate.
- **A**rticulation — how precisely and with what qualifications is it stated?
- **G**enerality — across which populations / conditions does it hold?
- **I**nterestingness — does it change what informed readers believe? (ties to importance, §2)
- **C**redibility — is the method believable enough to sustain the claim?

Reporting discipline (the "New Statistics" / ASA-2016 line): **state effect sizes WITH uncertainty
intervals** (confidence/credible intervals, or across-seed variance in ML), not a binary
significant/non-significant; **never conclude "no effect" from a non-significant test** (absence of
evidence ≠ evidence of absence); do not treat p<0.05 as a bright line or as proof. Where a venue still
demands p-values, report them but **lead with the estimate and interval**. A single-number leaderboard
claim with no variance is the ML instance of the same error.

**Confirmatory vs. exploratory — label it.** Every analysis is one or the other; describing an
exploratory (post-hoc) finding in confirmatory (a-priori) language IS HARKing (Kerr). If the analysis
had many researcher degrees of freedom (defensible model/subgroup choices), a single reported p-value
is not evidence — pre-register or report the multiplicity (Gelman's garden of forking paths). This is
the concrete partition rule behind "avoid spin".

**A figure is a visual claim (Tufte).** It must not encode a larger effect than the data support — no
truncated/expanded y-axes that magnify a difference, no area/volume encoding for a linear quantity, no
dual axes that manufacture correlation. The visual magnitude of change should equal the numeric one
(lie factor ≈ 1). Honest numbers in a misleading figure are spin a reviewer increasingly flags.

## §6 — The anti-fabrication protocol (the HARD gate — outranks every persuasion rule)

The single most catastrophic, model-specific failure: completing the *rhetorical shape* of a
well-supported paragraph by emitting a support that does not exist. A citation-shaped token is the
highest-probability completion after "unlike prior work"; a p-value is a high-probability completion
in a results paragraph. Shipped, this is not weak writing — **it is research misconduct**.

**The rule:** NEVER emit a citation, author-year, dataset name, baseline, method name, comparison
number, p-value, confidence interval, or "significant" claim that is **not grounded to a real,
retrievable source** the author supplied or a tool verified. When a support is not yet grounded,
insert an explicit **placeholder** — never a plausible-looking reference:

| Missing | Placeholder |
|---|---|
| a citation | `[CITATION NEEDED — <what it must establish>]` |
| a baseline / competitor number | `[BASELINE — verify <method> on <dataset>]` |
| a number / metric you did not compute | `[VALUE — compute]` |
| a statistical claim with no test run | `[STAT — run <test>, then state]` |

**Tells of fabrication to self-audit for** (the give-away is *plausibility without retrievability*):
syntactically perfect cites with invented author/year; real-sounding but nonexistent dataset/method
names; suspiciously round or suspiciously precise numbers that fill an argumentative hole *exactly*;
"prior work achieves 82.3%" with no source. A placeholder is honest and fixable; a fabricated support
poisons trust irreversibly and, once one is found, a reviewer re-reads the whole paper hunting for the
gap between every claim and its evidence.

**Existence is necessary, not sufficient — the citation-QUALITY check (distinct from the fabrication
gate above).** A real, retrievable source can still be MIS-used, and that is a separate failure the
existence gate does not catch. Once a citation is confirmed to exist, verify three more things before
it counts as support:
- **Support** — the cited work actually establishes THIS point (not a tangential result, not a
  misremembered finding). A real paper cited for a claim it does not make is a mis-citation the
  reviewer who knows that work will catch — as damaging as an invented one.
- **Currency** — it is not retracted / withdrawn / superseded, and not so dated the field has moved
  past it (a 2015 "SOTA" baseline in a 2026 paper is a weakness, not support).
- **Load-bearing strength** — the source can carry the weight you put on it (a workshop abstract, a
  blog post, or an un-reviewed preprint cannot anchor a central claim a reviewer will contest).

Existence answers "is this real?"; these answer "does this real thing support what I use it for?" The
fan-out fact-check lens returns BOTH — the locus AND a support/currency/strength assessment keyed to
that locus — never just "it exists."

Under a harness, **citation/number verification fans out read-only** — an agent fetches the primary
source and returns the *locus* or "[VERIFY]", and an agent's felt confidence is never the signal
(`SKILL.md` execution model; the CITATION-RELAY archetype).

## §7 — The certainty deny-list (the floor scan)

`scripts/claim-check.sh` scans the VALUE of each filled slot (not the template labels) and reports:
- **unwarranted superlatives (WARN)**: `state-of-the-art`, `novel`, `significantly`, `outperforms`,
  `robustly`, `paradigm`, `paves the way`, `broad implications` — each *usually*, not always, wrong;
  the floor flags, you attach the inline warrant or downgrade (§1);
- **over-hedge mush (WARN)**: `may potentially`, `it is worth noting`, `to some extent`, `further
  research is needed`;
- **bare positioning**: a **FAIL** when it occupies the G3 *Nearest prior work* slot with no named
  method; a **WARN** when `unlike prior work` / `existing methods …` appears elsewhere in the spec;
- **fabrication-risk (WARN)**: a citation-shaped token or a bare number in the anchor slot with no
  `[VERIFY]` / `[VALUE` / `[CITATION` / `[BASELINE` placeholder or locus — the floor cannot confirm a
  source exists, so it flags the *pattern* and you verify (§6).

**Seam note** — these deletions/downgrades operate on the **claim as recorded in the spec** (choosing
its *strength* and evidence-fit); the final-prose wording pass (hedge-word choice, sentence rhythm) is
`linting-prose`. Green floor = the *listed patterns* are absent; it never proves a claim is calibrated.
That judgment is this file, applied by you.
