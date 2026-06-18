# AI4S admissibility gates A–F — the audit layer before any number enters the synthesis

> Scope: the ML-for-science audit that decides which empirical claims are **admissible** — gates
> A leakage, B benchmark contamination, C scaling-law bookkeeping, D ablation isolation, E
> emergence-as-artifact, F distribution-shift / compute-fairness / documentation-coverage — plus the
> **quarantine table** for what fails. This is an extraction-time FILTER that produces ledger-row
> tags and a quarantine artifact; it does NOT re-explain GRADE or the moderator search — it supplies
> the AI4S-specific *downgrade reasons* and *admissibility verdicts* those steps consume.

> **Cross-ref note.** Reconciliation, grading, boundary, and unification are consolidated into
> `synthesis.md` Parts A–E (relation map / moderator search → Part B; GRADE → Part C; flip condition
> → Part D; emergence/scaling unification → Part E). Pointers below name the *topic* and resolve to
> the relevant Part, so they survive any future reorganization.

## Admissibility before adjudication (precedence)

A number you cannot vouch for is **not "weak evidence"** — it is **corpus contamination** that
retroactively poisons every aggregate including it. So no empirical claim ("X predicts / outperforms
Y") enters the synthesis until it has cleared gates A–F. Cleared claims flow into the
confirm/extend/contradict/condition relation map (`synthesis.md` Part B) carrying their gate tags;
**failed claims go to the quarantine table** (below) tagged with the gate failed and the
field-narrative consequence — they are **never silently dropped into the relation map and never
silently dropped from the record**. The verdict is one of:

| Verdict | Meaning | Where it goes |
|---|---|---|
| **PASS** | gate checked and cleared | into the ledger / relation map, with the PASS tag |
| **PARTIAL** | gate checked, some sub-item UNCHECKED-but-rebuttable | into the ledger as a GRADE **downgrade reason** (`synthesis.md` Part C) |
| **FAIL / unrebutted UNCHECKED** | gate violated or un-clearable | **quarantine table** with consequence + flip condition |

UNCHECKED is treated as FAIL until rebutted — **absence of a red flag is not evidence of
cleanliness** (Kapoor & Narayanan, arXiv:2207.07048: *none* of their leakage errors were catchable
by reading the paper). Each gate emits a ledger-row tag, e.g. `A:PASS B:PARTIAL(contam-unchecked)
D:FAIL(confounded)`.

---

## GATE A — data leakage (canonical 8-leaf triage)

**Technique: 8-type leakage triage** (Kapoor & Narayanan, arXiv:2207.07048 — a 3-category, 8-leaf
taxonomy validated across 329 papers in 17 fields). The table below is the paper's actual taxonomy,
1:1: three top-level categories (L1–L3) with their leaves. **Walk all 8 leaves per performance
claim; tag each PASS / FAIL / UNCHECKED.**

| # | Canonical leaf | What to check | Verdict |
|---|---|---|---|
| **L1** | **Lack of clean train/test separation** (category) | — | — |
| L1.a | No test set | is the model evaluated on data it was trained on? | — |
| L1.b | Preprocessing on train **+** test | scaling / imputation / normalization fit on the full dataset before split | UNCHECKED — papers rarely state *when* scaling/imputation was fit |
| L1.c | Feature selection on train **+** test | feature pick / dimensionality reduction done on all data before split | — |
| L1.d | Duplicates across train/test | exact/near-duplicate rows split across train and test | — |
| **L2** | **Illegitimate / proxy features** | does a feature encode the label, its near-cause, or a post-outcome proxy? | — |
| **L3** | **Test set not from the distribution of scientific interest** (category) | — | — |
| L3.a | Temporal leakage | are training timestamps strictly before test? (train-on-the-future) | — |
| L3.b | Non-independence | same patient / site / subject / group spans the split | — |
| L3.c | Sampling bias | is the test set a biased subsample, so eval distribution ≠ the question asked? | — |

(Eight leaves: L1.a–L1.d, L2, L3.a–L3.c. The verdict cell on L1.b is a worked example of the
expected granularity — fill the rest per claim.)

**Principle — leakage-class clearance is mandatory, not assumed.** UNCHECKED = quarantine, never
"assume clean." None of these are catchable by reading the prose; only a structured **model
info sheet / REFORMS pass** (`ledger.md`, "Provenance instruments") surfaces them. Any FAIL, or any
unrebutted UNCHECKED on a load-bearing leaf (esp. L1.a/L1.b/L1.d), quarantines the claim.

**Standing example (full statement; referenced tersely elsewhere).** Civil-war prediction: *every*
paper claiming "complex ML > logistic regression" failed to reproduce under the leakage check, and
complex ML did not substantively beat decades-old LR (arXiv:2207.07048). The lesson: an SoK that
pooled those numbers would have manufactured a false consensus the field then cites. The quarantine
and anti-pattern rows below point back here rather than re-narrate it.

---

## GATE B — benchmark / leaderboard illusions & contamination

**Technique: benchmark contamination check.** Before trusting an eval number on a shared benchmark,
rule out test-item leakage into pretraining and adaptive overfitting:

| Probe | Signal of contamination / illusion |
|---|---|
| Training-cutoff vs benchmark-release date | benchmark predates the model's data cutoff → items may be in pretraining |
| n-gram / substring overlap (test items ↔ corpus) | high overlap → memorization, not capability |
| Canary strings | the benchmark's embedded canary appears in the model's output/corpus |
| Fresh held-out / re-collected variant | score collapses on a fresh variant → contamination or overfit |
| Repeated public test reuse | community **adaptive overfitting** to a static test set inflates SOTA |
| Benchmark saturation | scores near the ceiling → deltas are **meaningless** (ceiling effect) |

**Plus the baseline-fairness audit.** For every "method X beats baseline Y" edge, verify the
baseline was tuned with **comparable budget** (hyperparameter search, seeds, compute) to the
proposed method. An **under-tuned or stale baseline is the most common *manufactured* gap.** Record
the baseline's tuning provenance in the ledger; an untunable/undisclosed baseline → PARTIAL
(GRADE risk-of-bias downgrade) or FAIL.

---

## GATE C — scaling-law bookkeeping

**Principle — scaling-law disagreements are bookkeeping until proven otherwise.** Before treating
two laws as a substantive (physics) disagreement, restate both on a **common basis** and record the
fit method. The moderator-search USE of this (suspect fitting-regime before different physics) lives
with the moderator search (`synthesis.md` Part B); the worked Kaplan/Chinchilla reconciliation is in
`synthesis.md` Part E. Here it is the **bookkeeping normalization + fit-method caveats**.

**Technique: cross-normalization.** Restate every law on:

| Axis | Common basis to enforce |
|---|---|
| Parameters N | **TOTAL** parameters, not non-embedding |
| Compute C | FLOP, and note whether it is the **6ND** approximation or exact |
| Tokens D | reported on the same definition |
| Loss | the same loss definition (which split, which tokenizer) |
| Fitting **Approach** | 1 = minimum-over-training-curves · 2 = IsoFLOP parabola · 3 = parametric L(N,D) |

**The reconciliation (Pearce & Song, arXiv:2406.12907):** **most** of the gap between Kaplan
`N_opt ∝ C^0.73` (arXiv:2001.08361) and Chinchilla `N_opt ∝ C^0.50` (arXiv:2203.15556) is
**bookkeeping** — Kaplan **counting non-embedding parameters at small scale**; simulating Chinchilla
under those conditions reproduces Kaplan-like biased exponents, reaffirming Chinchilla. Note the
*residual*: Pearce & Song's second contribution is a separate axis (differences in the reported
loss-vs-compute relationship), so this is "most of the gap is param-convention + small-scale
fitting," **not** "entirely bookkeeping." Recommendation: future studies use **total params + total
compute**.

**Boundary / fit-method caveats** (record, do not ignore):

- **Besiroglu et al., arXiv:2404.10102** — Chinchilla's Approach 3 reports *implausibly narrow* CIs
  (would need ~600k experiments vs likely <500 run) and is inconsistent with its own Approaches 1/2;
  always disclose fit method + uncertainty before trusting a coefficient.
- **Sardana et al., arXiv:2401.00448** — inference-aware accounting shifts compute-optimal toward
  smaller-and-longer than Chinchilla; and fitting only at *typical* token/param ratios
  **overestimates** token value at extreme ratios (validated to ~10,000 tokens/param across 47
  models). Bound any "Chinchilla-optimal" claim by the deployment regime.
- **Czech et al., arXiv:2603.22339 (2026)** — the IsoFLOP parabola (Approach 2) introduces
  **systematic bias even on noise-free data** (grid width, uncentered sampling, loss-surface
  asymmetry α≠β); Approach 3 via variable projection removes it. Treat Approach-2 compute-optimal
  points as biased unless this is addressed. (The 26xx arXiv prefix is correct — 2026 paper, not a
  transposition of 25xx.)

A scaling claim whose param convention or fit Approach is undisclosed → PARTIAL/FAIL: it cannot be
placed on the common basis, so it cannot be compared.

---

## GATE D — ablation isolation + variance

**Technique: ablation isolation + variance gate.** A "component X is essential" claim is admissible
only from a clean ablation with reported variance.

| Check | Admissible | Inadmissible |
|---|---|---|
| Isolation | **OFAT** (one factor at a time) | **confounded** — any co-varied hyperparameter ("we also retuned LR") **voids the causal attribution** |
| Replication | **≥3 seeds** or reported variance + CIs | single-seed point estimate |
| Effect vs noise | delta **> seed-to-seed spread** | delta **≤** spread → the "finding" is **NULL** |
| Re-tuning disclosure | states whether the ablated config was re-tuned | silent → **crippled-by-default-hyperparameters** confound |

A confounded ablation attributes the effect to the wrong cause; a sub-noise delta is not a finding.
Either → FAIL (do not grade as established). Feeds the GRADE imprecision/risk-of-bias downgrades in
`synthesis.md` Part C.

---

## GATE E — emergence de-mirage

**Technique: emergence de-mirage protocol** (Schaeffer, Miranda & Koyejo, arXiv:2304.15004). Any
sharp scale-discontinuity ("ability emerges at N") is **guilty until a continuous metric acquits
it**:

1. **Replot under a linear/continuous metric** — token edit distance, log-prob, Brier — instead of
   exact-match / thresholded accuracy.
2. **Resolution / statistics check** — confirm the test set is large enough to resolve small-scale
   behavior (too few items manufactures apparent cliffs); consistent with Schaeffer's
   *"better-statistics"* finding, though not a separately enumerated Schaeffer test.
3. **Verdict:** if the discontinuity **smooths out** → record as a **metric artifact** and downgrade
   the "sharp emergence" claim; if it **survives both** → admissible as a *candidate phase change*,
   with the metric explicitly stated.

The unification verdict (emergence == thresholded *view* of smooth scaling) is in `synthesis.md`
Part E; here it is only the **admissibility re-test**. An emergence claim from a discontinuous metric
with no continuous re-test → FAIL.

---

## GATE F — distribution-shift / compute-fairness / documentation-coverage

Three distinct admissibility levers under one gate; each emits its own tag.

**1. Distribution shift.** Record the **eval distribution vs the intended deployment / scientific
distribution**; grade **in-distribution and OOD separately**. An in-distribution score sold as
real-world performance is indirect evidence (GRADE indirectness downgrade), not a deployment claim.

**2. Compute-fairness.** Any "more efficient / better" claim requires an **equal-FLOP or equal-cost**
comparison **with the budget stated**. An efficiency claim at **unequal compute is quarantined** —
the "win" may be entirely the extra budget.

**3. Documentation-coverage** (distinct lever, not a footnote). Per artifact, record whether a
**model card** (Mitchell et al., arXiv:1810.03993 — intended use, eval conditions, disaggregated
subgroup performance) and a **dataset datasheet** (Gebru et al., arXiv:1803.09010 — motivation,
composition, collection, recommended uses) cover the fields the claim depends on. **Missing coverage
downgrades certainty and becomes an open question** (`writing.md`), *not* an assumption of benignity.
Datasheets also cross-check leakage gate A (L1.d duplicates, L3.b non-independence, L3.c
distribution-of-interest).

---

## The quarantine table (first-class artifact)

**Technique: quarantine table + GRADE handoff.** Maintain the quarantine table as a deliverable
section, not a scratch list. For an AI4S SoK this record is often the **single highest-value
section** — it tells the field which beliefs its own corpus does not support.

| Excluded-but-popular claim | Gate failed (A–F) | Consequence for the field's narrative |
|---|---|---|
| "complex ML > LR for civil-war prediction" | A (leakage; see Gate A standing example) | the headline "ML beats classical stats here" is **unsupported**; LR parity stands |
| "ability E emerges sharply at scale N" | E (discontinuous metric) | "sharp/unpredictable emergence" is a **measurement artifact**; capability scales smoothly |
| "method M is 2× more efficient than baseline" | F (unequal FLOP) | the efficiency claim is **un-evidenced** at the stated budget |
| "in-distribution score = real-world performance" | F (distribution shift) | a deployment claim from an ID-only eval; admissible only as indirect evidence |
| "datasheet/model-card fields absent" | F (documentation coverage) | coverage gap → certainty downgrade + an open question, not benignity |
| "Kaplan and Chinchilla are different laws" | C (param convention) | mostly a **bookkeeping** artifact (total vs non-embedding params); see Gate C |

Surviving (PASS/PARTIAL) claims carry a GRADE whose **downgrade reasons explicitly cite the partial
gate failure**, e.g. `GRADE: Low — start Low (observational), leakage leaf L1.b UNCHECKED
(A:PARTIAL)`. Hand the verdict to `synthesis.md` Part C (GRADE) and to `synthesis.md` Part D /
`writing.md` (the flip condition that would *de-quarantine* an item — see below).

---

## REFORMS as the extraction schema (brief — see `ledger.md`)

Use the **REFORMS 32-item / 8-section checklist** (Kapoor, Cantrell, Peng et al., arXiv:2308.07832)
as the **per-paper extraction columns** — the full schema lives in `ledger.md`, "Provenance
instruments"; do not duplicate it here. The gate-specific point only: **REFORMS items = extraction
columns, and any unreported item = `???` in the context vector, which caps GRADE.** The per-claim
leakage clearance record (the Kapoor & Narayanan model info sheet, arXiv:2207.07048) likewise lives
in the ledger.

> Verify all anchor arXiv IDs through the arxiv MCP before citing; do not cite from memory. Verified
> IDs for this file: **2207.07048** (leakage taxonomy), **2308.07832** (REFORMS), **2001.08361**
> (Kaplan), **2203.15556** (Chinchilla), **2406.12907** (Pearce & Song reconciliation), **2404.10102**
> (Besiroglu replication), **2304.15004** (Schaeffer emergence), **1810.03993** (model cards),
> **1803.09010** (datasheets), **2401.00448** (inference-aware scaling), **2603.22339** (IsoFLOP
> bias — 2026, the 26xx prefix is intentional).

---

## Anti-patterns (AI4S-scoped) — name it, then fix it

| Anti-pattern | Fix |
|---|---|
| **Laundering leaked numbers into "consensus"** — aggregating performance without a leakage-class clearance (the civil-war case, Gate A standing example) | Run gate A 8-leaf triage + REFORMS model info sheet; quarantine UNCHECKED with the gate + consequence |
| **Leaderboard copy-paste** — same-named-benchmark accuracy treated as comparable across mismatched splits/preprocessing/compute | Normalize to a **stated common basis** before comparing; no cross-paper number without it |
| **Benchmark contamination ignored** — trusting eval numbers from models whose pretraining may contain test items | Run gate B (date-cutoff, n-gram overlap, canaries, fresh held-out); flag saturation as ceiling effect |
| **Kaplan-vs-Chinchilla treated as live physics** — reporting C^0.73 vs C^0.50 as competing laws of nature | Reconcile **bookkeeping first** (total vs non-embedding params, fit Approach; see Gate C) |
| **Confounded ablation read as causal** — attributing an effect when several things changed | Require **OFAT**; any co-varied hyperparameter voids attribution; disclose re-tuning |
| **Single-seed / no-error-bar as fact** — a delta within seed noise presented as a finding | Require ≥3 seeds or variance + CIs; treat sub-noise deltas as **NULL** |
| **Emergence accepted from a discontinuous metric** — calling a metric artifact a phase change | Replot under a continuous/linear metric (Schaeffer 2304.15004); if it evaporates, downgrade |
| **"More efficient" without compute-fairness** — efficiency/Pareto compared at unequal FLOP/cost | Require **equal-FLOP / equal-cost** with budget stated; quarantine unequal-budget claims |
| **Eval-vs-deployment shift unstated** — an in-distribution score sold as real-world | Record eval vs deployment distribution; grade ID and OOD separately |
| **Missing model card / datasheet treated as benign** — undocumented artifact assumed clean | Record coverage gap → certainty downgrade + open question (`writing.md`); never assume benignity |
| **"未検証" as terminal** — a gate failure left at "not tested" | Convert to a **flip condition**: "holds UNLESS \<condition\> → \<consequence\>" (`synthesis.md` Part D) |
| **Opaque corpus / no meta-method** — selection + taxonomy unreported, SoK unrefereeable | Report PRISMA 2020 flow + Nickerson 2013 taxonomy method (`workflow.md`); the SoK must pass its own bar |

---

## Cross-references

| Need | Go to |
|---|---|
| Extraction fields, context vector, model-info-sheet record, REFORMS schema | `ledger.md` ("Provenance instruments") |
| The confirm/extend/contradict/condition relation map + moderator search | `synthesis.md` Part B |
| The GRADE downgrade these gates trigger | `synthesis.md` Part C |
| The flip condition that de-quarantines an "unverified" item | `synthesis.md` Part D / `writing.md` (open questions) |
| Moderator-search & unification USE of the scaling / emergence cases | `synthesis.md` Part B (moderator) / Part E (worked Kaplan-Chinchilla & emergence cases) |
| Corpus eligibility phase (where gates run during screening) | `workflow.md` |

The **gating** is an extraction-time filter producing ledger-row tags (not its own prose chapter):
it decides *which claims are admissible* into the relation map and *why* a surviving claim is
downgraded. Its **quarantine table, however, IS a first-class deliverable section** of the final
document. Run the gates on **any ML-for-science corpus, before any empirical number enters the
synthesis.**
