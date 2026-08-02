# Synthesis — select the operator, test comparability, and adjudicate without invention

> **SOLE owner** of synthesis-operator selection, comparability, appraisal-to-conclusion logic,
> discrepancy adjudication, confidence language, and claims of theoretical relationship.
> Taxonomy construction is an optional branch in `taxonomy.md`; ML-based-science appraisal is in
> `ai4s-gates.md`.

## 1. Select the operator from the question and evidence

Record the choice in the K1 review plan.

| Question/evidence shape | Primary operator | Do not substitute |
|---|---|---|
| Comparable quantitative estimands | meta-analysis or structured quantitative synthesis | paper counts or a pooled effect across different estimands |
| Quantitative results with incompatible measures | structured tabulation, grouped summaries, or an applicable non-meta method | cross-metric I² or an opaque quality-weighted average |
| Concepts, definitions, design patterns | configurative/thematic synthesis; taxonomy only if classification serves the decision | effect grading or forced numeric aggregation |
| Complex causal explanation | realist or other theory-driven synthesis | “mixed literature” plus an invented moderator |
| Formal/theoretical results | assumptions–statement–domain–prediction comparison | GRADE labels or paper-level quality scores |
| Security attacks/defenses | threat-model and capability comparison; reproduction and boundary analysis | majority vote, since one valid counterexample can defeat a universal claim |
| Venue SoK / critical review | evaluate and contextualize existing work around the contribution type | a mandatory taxonomy or five-section template |

A review can combine operators, but each conclusion must say which evidence subset and operator
produced it. Never let a quantitative subgroup silently license a qualitative field-wide claim.

## 2. Appraise at the claim level with a fitting method

Ask what would make this kind of claim wrong:

| Claim type | Appraisal dimensions |
|---|---|
| Intervention/effect | design-specific risk of bias, estimand alignment, imprecision, inconsistency, indirectness, reporting/publication bias |
| Observational association | selection, confounding, measurement, model specification, missingness, precision, transportability |
| Prediction/ML performance | split/dependence, leakage, target distribution, comparator/tuning fairness, metric alignment, uncertainty, external validation |
| Qualitative interpretation | relevance, sampling, analytic transparency, reflexivity, coherence, adequacy of supporting data, transfer context |
| Theory/proof | assumptions, definition alignment, proof correctness/status, domain, approximation error, discriminating predictions |
| Security claim | threat model, attacker capabilities, target/version, reproducibility, exploit preconditions, outcome criterion |
| Definition/taxonomy | purpose, internal consistency, decision rules, boundary cases, classifiability, usefulness |

Use a recognized field tool when one fits. Name the tool, version, unit of assessment, and any
adaptation. An adaptation is not the official method.

### GRADE applicability

Use GRADE only for a defined body of evidence about an outcome/estimand to which GRADE guidance
applies. Do not call a local CS/ML scoring rubric “GRADE,” do not start ablations or scaling sweeps
at “High” by analogy to randomized trials, and do not invent upgrade factors.

For other evidence, use the claim ledger’s plain statuses and explain the basis:

```text
supported | supported-with-limitations | uncertain | not-comparable | unsupported
```

Those are communication states, not a validated universal scale.

## 3. Quantitative synthesis

### Comparability gate

Before pooling, align:

- estimand and causal contrast;
- population, setting, time, and analysis set;
- intervention/exposure and comparator;
- outcome construct, measurement instrument, direction, and follow-up;
- effect measure and its scale;
- study design and dependence;
- uncertainty information.

Convertible measures may be transformed with a justified formula. Merely sharing the label
“accuracy,” “F1,” or “loss” does not make results comparable when datasets, classes, thresholds, or
budgets differ.

### If effects are commensurable

Choose the statistical model from the estimand and data-generating assumptions, not by habit.
Report individual estimates, uncertainty, model, heterogeneity, sensitivity analyses, and the
effect of dependent or high-risk studies. Obtain statistical expertise when model choice,
dependence, missing variance, or small-study corrections are consequential.

Heterogeneity is not automatically a moderator signal. It can reflect sampling error, bias,
measurement, multiplicity, or actual effect variation. Explore it with pre-specified,
theory-backed analyses where possible. Subgroup analyses and meta-regression are observational;
post-hoc patterns remain hypothesis-generating.

### If effects are not commensurable

State why pooling is invalid. Group by a decision-relevant characteristic, display estimates and
uncertainty where available, and keep unmatched outcomes separate.

SWiM is a reporting guideline for particular syntheses of quantitative intervention effects
without meta-analysis; it is not a generic recipe for every narrative review.

### Vote counting

Ban tallies based on statistical significance or subjective “positive/negative” rules. If only
effect direction is available, a pre-specified direction-of-effect synthesis with a sign/binomial
test and uncertainty can be a limited fallback under applicable guidance. It discards magnitude
and study size, so report those limitations and show any available estimates.

Do not replace an invalid tally with undocumented “quality weighting.” If weights are used, their
statistical or decision-theoretic meaning must be explicit.

## 4. Configurative and conceptual synthesis

Use configurative synthesis when the aim is to build or refine concepts rather than estimate a
common effect:

1. preserve each source’s definitions and unit of analysis;
2. code concepts and relationships with source locators;
3. compare convergent, complementary, and competing interpretations;
4. record negative cases and boundary examples;
5. build a synthesis concept only after stating how it transforms the source concepts.

A theme is not stronger because many papers use similar words. Repetition can come from shared
lineage or citation cascades. Trace conceptual independence and counterexamples.

### Transfer-source boundary

When the deliverable is a target-agnostic `DONOR SET`, this section may compare source-side roles,
relations, preconditions, consequences, and failures to state a bounded common relational schema.
It must not map a source role to a target role, assert target support, derive a target prediction, or
state a thesis. Those operations have a selected target frame and belong to
`forging-novel-theses`; see `transfer-sources.md`. A common source-side schema is not evidence that
it survives a target context.

Load `taxonomy.md` only when a classification scheme itself answers the review question.

## 5. Explanatory synthesis

For mechanism questions, distinguish:

- **context**: conditions under which an outcome is produced;
- **mechanism hypothesis**: the process proposed to generate it;
- **outcome**: the observed consequence;
- **evidence role**: supports, refines, or challenges the programme theory.

Mechanisms are hypotheses until the evidence licenses a causal explanation. Do not add a mechanism
slot to a descriptive claim merely to make it look deep. Realist and related syntheses can use
iterative search; follow their own conduct/reporting standards and record theory changes.

## 6. Discrepancy adjudication

Only compare claims that overlap on proposition and scope. Work through this order:

| Check | Question | Possible result |
|---|---|---|
| Construct/estimand | Are the claims about the same thing? | `not-comparable` |
| Measurement | Do instruments, thresholds, labels, or metrics operationalize it differently? | explained measurement difference or unresolved |
| Design/data | Do populations, splits, samples, time, or interventions differ? | scope qualification |
| Uncertainty/dependence | Can sampling variation or shared data explain the pattern? | inconclusive; sensitivity analysis needed |
| Bias/reporting | Is one estimate less credible for this claim? | support shifts, with the reason named |
| Effect modification | Is a moderator theory-backed and testable? | conditional claim, exploratory or confirmatory status explicit |
| Residual conflict | After the above, does disagreement remain? | `unresolved` plus evidence needed |

Use a discrepancy record:

```text
cluster | aligned proposition/estimand? | material differences | uncertainty/dependence |
appraisal differences | candidate explanations + status | evidence that would discriminate |
verdict
```

Candidate explanations must be labeled `pre-specified`, `source-proposed`, or `post-hoc`.
“The first moderator that makes both claims true” is not a valid rule.

`unresolved` is an acceptable synthesis result. State the decision consequence and evidence needed;
do not manufacture a regime where the conclusion reverses. In the claim ledger, record the
assessment status as `uncertain` and preserve `unresolved` in the discrepancy verdict or basis;
`unresolved` is not a second assessment-status enum.

## 7. Formal and theoretical relationships

Match the test to the relationship claimed:

| Relationship claim | Minimum demonstration |
|---|---|
| Same definition | matching definiens, primitives, conditions, and domain; coextension alone is insufficient |
| Extensionally equivalent in-domain | explicit term mapping and identical extension in the stated domain |
| Isomorphism | explicit invertible mapping that preserves the claimed structure |
| Reduction/special case | assumptions or limit under which one result follows from the other |
| Approximation | domain and bounded/characterized approximation error |
| Empirical equivalence | same observable predictions over a stated tested regime |
| Shared mechanism | common causal/process account plus discriminating predictions against alternatives |

Invertibility is required for an isomorphism claim, not for every useful unification. An invertible
reparameterization alone also does not prove that two scientific phenomena are identical.

When equivalence fails, preserve the theories separately and state where their predictions differ.

## 8. Counterevidence and sensitivity

Attack each load-bearing synthesis claim:

- identify the strongest included challenge;
- search for a counterexample within the `coverage contract` using alternate vocabulary;
- rerun the conclusion without dependent, high-risk, inaccessible, or outlier evidence;
- test reasonable coding, inclusion, transformation, and model choices;
- distinguish a robust conclusion from one that changes under one defensible choice.

Record what changed. “No counterevidence found” is bounded by the search in
`framing-and-corpus.md`, not proof that none exists.

## 9. Output of synthesis

For each synthesis claim, produce:

```text
claim | scope | source-claim ids | operator | appraisal method |
assessment status + basis | discrepancies | sensitivity | limitations
```

That row is the handoff to `delivery.md`. The claim ledger remains the inference-chain source of
truth; prose is one rendering of it.
