# Footing and lineage — EV3/EV4 sole home

This reference owns whether a valid run may be compared, and what a historical
score can say about a current design. It does not choose a model or a portfolio.

## Separate validity, achieved quality and recorded status

| Observation | Honest judgment | Prohibited shortcut |
|---|---|---|
| Correctly bound, valid experiment scores zero | Valid negative/failed target result; preserve raw score and timing | Invalidate or hide it because the model performed badly |
| Required update, output or scored work was skipped | Timing describes the executed path; claimed training/task workload is not established | Promote no-op speed as successful training throughput |
| Faster batch violates the required update protocol | Version changed protocol or repair it; equivalence claim fails | Treat equal first-item accuracy as preservation of learning |
| Row is accepted into a leaderboard | Publication succeeded; EV0–EV4 still decide scientific scope | Assume published means valid or goal achieved |
| Process completed but required row fields are missing | Execution occurred; materialization/acceptance failed | Count a published result or repeatedly rerun expensive computation without diagnosing ingestion |
| Tests pass but a hard concept requirement is unmapped | Scoped tested properties pass; overall conformance remains unverified | Infer whole-concept compliance from a pass count or shared type name |

Give each claim its own disposition: measured runtime, prediction quality, preserved protocol and accepted publication.
If quality fails but timing is sound, retain timing as the cost of that failed configuration.
It cannot establish useful throughput at a quality target it misses; this does not erase the negative observation.
Reuse intact execution output for ingestion repair when the authoritative system supports it and binding remains valid.
Do not retrofit a changed criterion, fabricate metadata or bypass an acceptance gate to recover a row.

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

For throughput, join the numerator's semantic unit and denominator's timed boundary explicitly.
Distinguish frozen-model inference, predict-score-update work, warm device time, and end-to-end cold wall time.
Internal positions/s is not input tokens/s without a workload-specific conversion and matching counted work.
Shared device model alone does not match workload size, state updates, precision, batching or output semantics.
Unmatched historical numbers may motivate investigation; do not derive a speedup factor or release threshold from them.
An aspirational target stays labeled unvalidated until its workload, bound and acceptance rationale are fixed.
Rejecting a new target does not validate the old one. Check both sources and retain their actual authority/status.

Before a run, check whether a threshold is reachable. Use the finite sample,
target distribution, scoring window, and known bounds. After a run,
an observed value outside a credible bound reopens EV0–EV2 before it becomes evidence.
Preserve the bound formula, inputs, and independent recomputation.

When a formal bound interprets a score, carry its exact statement, proof status,
and assumptions. Map its variables to the measured ones. A contradiction
reopens both the bound's applicability and the run's validity. Do not infer a leak
or refute a theorem from an unmatched quantity. `proving-theorems` owns a formal
proof and statement faithfulness; this skill checks only its use on this run.

## EV3: match equivalence evidence to the claimed behavior

| Claim | Required comparison |
|---|---|
| Same aggregate metric only | Compare the metric under matched footing; label the claim metric equality |
| Same predictions or bit identity | Compare the per-item outputs at all positions required by the declared contract |
| Adapter/chunk/state-machine equivalence | Also compare required state transitions across chunk, reset, warmup, and update boundaries |

Equal scored counts and correct counts can hide different wrong answers; they do not establish path equivalence.
An unscored mismatch may still affect later state. Prove irrelevance or keep that semantic obligation open.
Representation changes must preserve semantic units: record symbols, bytes, events, and scored denominators separately.
Equal numeric chunk lengths or `n` do not establish equal workloads across encodings.

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

When a negative result is called an implementation mistake, compare the intended and executed intervention.
Cite the frozen selector/algorithm and a witness of the mismatch before invalidating that test.
If the implementation followed the plan, the negative remains evidence about that tested design.
A revised selector is a new hypothesis/configuration, even if it seems more reasonable after seeing the score.
Preserve the old result and limitation; “not a fair test” cannot erase it or indefinitely rescue the hypothesis.

Before a null ablation excludes a mechanism, verify that the exercised task and operator can express its effect.
If both arms use fixed votes that never consume the changed workspace, the null tests that fixture only.
A later operator-rich contrast is a new scoped test; do not flip a global verdict while erasing the earlier binding.

Distinguish an observed construction, an information bound and a learned implementation.
A hand-supplied grammar scoring 1.0 is a witness under that grammar, not proof a learner can acquire it.
Failure of whole-command lookup cannot bound all token-compositional designs.
State the allowed model class and supplied knowledge before calling an oracle score a ceiling or impossibility result.

## EV4: historical capability is a typed comparator

Before claiming novelty, absence, or lost capability, join the relevant historical records.
Keys: implementation/revision, contract, metric, scored length, information access, and evidence status.
Use the canonical run/finding records behind the leaderboard; a top-ranked or unlabelled row is not a search result.
Record missing identities and retrieval coverage. “Not found in this scope” does not mean “never achieved”.
Reuse the domain's existing capability view; do not create a second authoritative inventory here.

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

## Correct a disposition through its consumers

The evidence owner records the semantic correction; the target's existing mechanisms store and propagate it.

| Step | Required observation |
|---|---|
| Scope the defect | Enumerate affected runs by loaded code/path/config/data binding; keep unrelated runs separate. Uncertain membership stays under review |
| Link the correction | Preserve raw output and original findings; append the target-supported retraction, supersession, or quarantine with its reason and replacement locus |
| Reconcile dependents | Identify findings, promotions, leaderboard groups, and capability claims that consumed those runs; update or mark stale through their owners |
| Read back | Query the affected views and verify invalidated rows are excluded or visibly qualified in current comparisons; retain them in history |
| Handle unavailable propagation | Name the affected view and missing target operation; withhold a “cleaned” or current-achievement claim until verified |

Group rankings by the declared comparison contract before choosing a winner.
Do not mix oracle, trivial baseline, and learner roles or differing scored lengths into an unqualified ranking.
A statement in chat that a score is invalid does not update its canonical evidence status.
This procedure neither authorizes record deletion nor imposes a new skill-local schema or database.
