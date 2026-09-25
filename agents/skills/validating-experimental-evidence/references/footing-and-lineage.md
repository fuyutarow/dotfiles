# Footing and lineage — EV3/EV4 sole home

This reference owns whether a valid run may be compared, and what a historical
score can say about a current design. It does not choose a model or a portfolio.

## EV3: compare the same target quantity

Put every axis that can change the claim into a comparison table.

| Axis | Exact row content |
|---|---|
| Input | Dataset/stream contract ID and digest, split, encoding, preprocessing, generated length |
| Scoring | Metric, unit, scored-position set, last scored position, denominator, missingness |
| Learning | Online reveal order, offline/prequential protocol, update budget, trainability |
| Runtime | Loaded code digest, dependencies, device, precision, parallelism, resource limits |
| Randomness | Seed, sampling, repetitions, uncertainty summary |
| Baseline | Trivial predictor and applicable reference on the **same test stream** and scoring set |

If an axis differs, report both results with that difference. Do not subtract them
as a causal or regression delta until a matched rerun exists. An offline trained
model and a prequential learner have different estimands. So do a forward-only
kernel and a training step. A margin over a broken comparator cannot establish
capability when the candidate fails its own trivial baseline.

Before a run, check whether a threshold is reachable. Use the finite sample,
target distribution, scoring window, and known bounds. After a run,
an observed value outside a credible bound reopens EV0–EV2 before it becomes evidence.
Preserve the bound formula, inputs, and independent recomputation.

When a formal bound interprets a score, carry its exact statement, proof status,
and assumptions. Map its variables to the measured ones. A contradiction
reopens both the bound's applicability and the run's validity. Do not infer a leak
or refute a theorem from an unmatched quantity. `proving-theorems` owns a formal
proof and statement faithfulness; this skill checks only its use on this run.

## EV3: one intervention means one interpretable difference

| Changed variable | Coupled change | Outcome path | Fixed by | Control | Remaining limit |
|---|---|---|---|---|---|
| named intervention | every parameter or family-size change | mechanism that could affect result | exact setting or stratification | matched arm | unresolved confound |

Write the confound table before the intervention. If a top-K rule also grows the
candidate family, the observed difference cannot isolate top-K's effect. Record the
raw contrast and run a matched arm. A negative or mechanism-off arm is diagnostic.
Keep the intact system's row when the claim concerns that system.

An accounting identity that telescopes stage losses does not establish that the
stages are causally independent. Measure each stage on the same scored positions.
Change one mechanism at a time before assigning a repair to one loss term.

## EV4: historical capability is a typed comparator

For each alleged prior achievement, record both implementation IDs and the
benchmark contract. Check **both** artifacts against the domain's signed concept
contract. A current score can be numerically valid while its implementation
violates that concept. Record the replacement obligation and whether the old
mechanism can be translated.

| Prior row | Present row | Permitted label |
|---|---|---|
| Same effective benchmark contract; prior/current concept-eligible; current measured; replacement promised to preserve it | Matched score under current contract | Assess **REGRESSION** or recovery with the prewritten margin and uncertainty. |
| Benchmark contract differs | Any | `DIFFERENT_FOOTING`; rerun or state the condition difference. |
| Prior artifact violated the current concept, but its local mechanism could be expressed inside it | Any | `HISTORICAL_ORACLE` plus a **transfer candidate**. No claim that the current concept achieved the old score. |
| Current artifact violates the signed concept, even if its score is valid | Any | `CURRENT_REFERENCE_ONLY`; do not call it a current-concept achievement or recovery. |
| Prior concept status unknown | Any | `CONCEPT_UNKNOWN`; inspect the old implementation before “regression” or “novel”. |
| Current version never ran the benchmark | Missing | `COVERAGE_GAP`, not an observed regression. |
| Same metric but no declared replacement/carryover obligation | Matched current score | Numerical deficit or improvement; no temporal regression claim by default. |

This prevents two errors. A concept-ineligible leader is not a current-design
regression. A transferable old mechanism is not a newly discovered ability.
Its transferability remains a design hypothesis until a current-concept
implementation passes a matched run. Retain old rows and negative results; do not
overwrite their classification when a new interpretation arrives. Add a new evidence
finding linked to the previous one and state which premise changed.

The domain or programme owner decides which capabilities the new design is obliged
to preserve. This skill only checks whether that obligation and both measurement
receipts exist before allowing the word “regression”. `governing-research-documentation`
owns capability-inventory admission and expiry. It does not own this classification.
