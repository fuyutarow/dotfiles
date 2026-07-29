# AI4S appraisal — apply only the checks a scientific ML claim depends on

> **SOLE owner** of ML-based-science appraisal in this skill. The legacy filename is retained for
> cross-skill links; this is not a universal A–F gauntlet. It produces claim-level applicability
> and concern records for `synthesis.md`.

## 1. Applicability first

Use this reference when ML model performance is evidence for a scientific claim about a population,
distribution, process, or phenomenon.

Examples:

- predicting a scientific outcome to argue that it is predictable;
- using model features or errors to infer scientific structure;
- measuring a phenomenon with an ML model;
- comparing ML with established scientific/statistical practice.

Do not automatically apply the whole profile to:

- generic ML methods research whose claim is about an algorithm or benchmark;
- production predictive analytics with no scientific generalization;
- formal theory that does not rely on empirical ML performance;
- an evidence-map row that merely records that ML was used.

Some individual checks may still be useful. Record why each check is applicable.

## 2. Status vocabulary

Use one status per check:

```text
not-applicable | low-concern | some-concern | high-risk | not-reported
```

- `not-applicable` means the claim does not depend on that property.
- `not-reported` is missing information, not demonstrated failure.
- `high-risk` requires observed evidence of a defect; it does not overwrite `not-reported`.

The next action can be author contact, artifact inspection, sensitivity analysis, scope reduction,
or a “not decisive” judgment. When missing information is critical, retain `not-reported` for the
check and assign the claim-level use verdict `not-decisive`. Do not discard an entire paper because
one unrelated field is absent.

## 3. Core dependency map

For each scientific claim, record:

| Dependency | Questions |
|---|---|
| Scientific target | What population/distribution and scientific quantity does the claim concern? Why is ML performance informative about it? |
| Data provenance | Which data versions, sampling process, labels, grouping/dependence, and time order produced train/validation/test sets? |
| Evaluation design | What split unit, test set, metric, threshold, uncertainty, and repeated evaluation were used? |
| Comparator | Was the baseline suitable and tuned/evaluated with a comparable information and resource budget? |
| Reproducibility | Are code, data, configuration, preprocessing, and result-generation details available at stable versions? |
| Generalization | Does evidence cover the deployment/scientific distribution, subgroups, sites, times, and shifts named by the claim? |
| Claim calibration | Does the conclusion distinguish prediction, association, measurement, and causation? |

REFORMS offers 32 questions across eight modules for ML-based science. Select the relevant items and
record their loci. Its authors explicitly recommend relevance judgment rather than strict adherence
to every item.

## 4. Leakage and dependence

Apply leakage checks when a performance or downstream scientific claim depends on out-of-sample
validity. Inspect, as relevant:

- absence or misuse of a held-out evaluation set;
- preprocessing, imputation, normalization, feature selection, or representation learning using
  evaluation data;
- duplicates or near-duplicates across splits;
- subject, site, household, device, spatial, temporal, or other grouped dependence crossing splits;
- features that encode the label, outcome, or post-outcome information;
- test data drawn from a distribution different from the scientific target;
- repeated adaptive tuning on a public or internal test set.

The Kapoor–Narayanan leakage taxonomy is a useful prompt, not a substitute for reconstructing the
actual data flow. A paper may not report enough detail to clear a dependency. Mark `not-reported`
and restrict the conclusion; do not assert that leakage occurred without evidence.

## 5. Claim-triggered modules

Run only the modules whose trigger matches.

| Triggering claim | Required checks |
|---|---|
| “X beats Y” | same target/data/split/metric; competitive baseline; comparable tuning, information, and compute; uncertainty of the difference |
| Benchmark capability | benchmark release and model data chronology when relevant; contamination evidence; repeated public-test adaptation; ceiling effects; fresh or private evaluation |
| Component/ablation attribution | experimental design matches the estimand; co-varied factors and interactions; retuning policy; independent replications; uncertainty or equivalence analysis |
| Scaling law | parameter/token/compute definitions; training schedule; fit method and range; uncertainty; extrapolation; deployment objective |
| Emergent/discontinuous behavior | metric continuity/thresholding; test resolution and sample size; model/data spacing; alternative smooth representations; pre-specified breakpoint evidence |
| Efficiency | matched quality target; hardware/software and precision; training plus inference budget as relevant; latency/energy/cost uncertainty; Pareto comparison |
| Real-world or OOD performance | intended distribution; temporal/site/subgroup shift; calibration; prospective or external validation |
| Scientific measurement | construct validity of labels/model output; measurement error; downstream uncertainty propagation; comparison with non-ML measurement |

### Ablations and replications

Do not require one-factor-at-a-time experiments universally. Factorial and other controlled designs
can estimate interactions and may better match the causal question. Do not impose a universal seed
count or declare a null because a delta is smaller than raw seed spread. Require a justified design,
uncertainty, and enough independent information for the claimed resolution.

### Scaling and emergence

These are specialized branches, not checks every AI4S paper must pass. A disagreement between
scaling laws can arise from bookkeeping, fit range, objective, or genuine regime change. Test those
possibilities; do not decree “bookkeeping until proven otherwise.”

A discontinuous metric can create apparent emergence, but one paper does not establish that every
reported discontinuity is an artifact. Re-express under informative continuous metrics when
possible and preserve residual uncertainty.

## 6. Evidence-use verdict

After applicable checks, assign one use verdict to the **claim**, not the paper:

| Verdict | Meaning |
|---|---|
| `usable` | relevant dependencies are sufficiently clear for the bounded claim |
| `usable-with-limitations` | the claim contributes, but named concerns restrict weight or scope |
| `not-decisive` | missing/unclear/high-risk dependencies prevent this result from carrying the headline conclusion |
| `invalidated` | direct evidence shows the stated estimate or inference is invalid under its claimed interpretation |

An unsupported or invalidated positive claim does not establish its negation. “ML superiority is
unsupported” is not “classical parity is established.” A null/equivalence claim needs its own
estimand, margin, uncertainty, and evidence.

Use an appraisal record:

```text
claim_id | applicable checks + why | status per check | evidence locator |
author contact/artifact result | use verdict | consequence for scope | sensitivity action
```

## 7. Synthesis handoff

- Keep `not-reported` evidence in the corpus when eligible.
- Test conclusions with and without `not-decisive` or high-risk claims.
- Avoid pooling results whose data, metrics, targets, or budgets are not comparable.
- Carry applicable concern reasons into the synthesis claim’s assessment.
- State which scientific conclusions survive the sensitivity analysis.

## Sources

The dated REFORMS and leakage sources live in `sources.md`. Re-verify fast-moving benchmark and
tool claims before use.
