# Framing and corpus — choose the review mode and license the coverage claim

> **SOLE owner** of review-design selection, the `coverage contract`, protocol depth, search,
> screening, record/report/study linkage, amendments, and stop-search rules. Result-to-claim
> modeling begins in `evidence-ledger.md`; synthesis begins in `synthesis.md`.

## 1. Start from the decision, not the label

Write one sentence before searching:

> `<audience>` must decide `<decision>`; this synthesis will inform that decision by establishing
> `<knowledge state>` within `<scope>`.

Record the following choices in one `review plan`. `Review mode` is shorthand for that design,
not a set of mutually exclusive labels.

| Choice | Record | Does not establish |
|---|---|---|
| Knowledge purpose | What the question must establish: effects, concepts, breadth, explanation, or critical reassessment | A search procedure |
| Corpus and coverage | Supplied, bounded, systematic, or iterative coverage under §2 | A venue contribution |
| Conduct | The applicable method below, with protocol depth under §3 | Reporting compliance |
| Synthesis and appraisal | Operator and claim-specific appraisal from `synthesis.md` | Support beyond the included evidence |
| Contribution requirement | Applicable venue criterion or `not applicable`; contribution test in `delivery.md` | A conduct method |
| Reporting requirement | Applicable guideline/extension or `not applicable`; output shape in `delivery.md` | Conduct quality or scientific validity |

Choose conduct from the question and evidence:

| Conduct | Use when | Coverage licensed |
|---|---|---|
| **Systematic review / SLR** | a focused question requires reproducible, bias-minimizing identification and appraisal | the pre-specified eligible evidence sought by the protocol |
| **Scoping review or systematic map** | the aim is to characterize breadth, concepts, methods, populations, or evidence distribution; name the field-specific method | the mapped search space; not an effectiveness verdict by default |
| **Realist / explanatory synthesis** | the question is what works, how, why, for whom, and under what circumstances | a transparent, theory-driven and often iterative evidence set |
| **Critical / conceptual review** | the question requires evaluating, contextualizing, or configuring existing concepts and claims | the search strategy actually used; do not imply exhaustive coverage |

For a supplied corpus, choose suitable synthesis and appraisal without adding unrequested retrieval.
For rapid or bounded work, record which conduct steps were abbreviated and constrain the coverage claim.
Scoping reviews and systematic maps require their own method choices; do not silently equate them.

A venue SoK can use systematic, scoping, or critical methods. Record its contribution requirement separately.
`Meta-analysis` is an operator; `taxonomy` is a possible output. Neither is a universal review requirement.
`delivery.md` owns the contribution test and output shape; `sources.md` owns dated source applicability.

## 2. The coverage contract

Put one of these declarations in the review plan and repeat it in the deliverable:

| Corpus origin | Required declaration |
|---|---|
| User-supplied | “This synthesis covers the N supplied items; no literature-completeness claim is made.” |
| Bounded search | “We searched `<sources>` using `<queries>` on `<dates>` under `<limits>`; findings are bounded by those choices.” |
| Systematic search | “We sought all eligible evidence defined by protocol `<id/version>` through `<last-search date>` and report deviations.” |
| Theory-driven iterative search | “Retrieval iterated to test/refine `<programme theory>`; selection was relevance- and rigor-driven, not exhaustive.” |

Never upgrade a closed or bounded corpus to “the field agrees.” A transparent limitation is not a
failed review; an unlicensed coverage claim is.

## 3. Question and protocol depth

Select a framing device only if it matches the question:

- PICO/PECO for intervention or exposure effects.
- PCC for scoping questions about population, concept, and context.
- SPIDER or another field method for qualitative evidence when appropriate.
- A plain concept/relationship table for theory, systems, or security questions.

Do not force PICO onto a conceptual or formal corpus.

### Minimum review plan — every mode

Record:

1. decision sentence and audience;
2. review question and boundaries;
3. corpus origin and `coverage contract`;
4. conduct method and any bounded or rapid adaptations;
5. eligible evidence types;
6. intended synthesis operator and appraisal approach;
7. output form, applicable contribution/reporting requirements, and any decision deadline.

### Protocol additions — systematic conduct

Pre-specify:

- information sources and complete per-source search strategies;
- dates, languages, publication-status policy, and update cut-off;
- inclusion/exclusion criteria and the unit to which each applies;
- deduplication and report-to-study linking;
- screening, extraction, and critical-appraisal roles;
- outcomes/constructs, effect measures, and synthesis plan;
- handling of missing information, multiple reports, dependence, and amendments.

PRISMA and its extensions are reporting guidance, not a substitute for this conduct design. Use the
version/extension appropriate to the review, and report compliance only when applicable.
For a venue submission, also check its method requirements. Publication intent alone does not select systematic conduct.
For iterative conduct, use the method's planning rules and §7 amendments; do not claim retrospective choices were pre-specified.

## 4. Preserve corpus identity before extraction

Search and screening records must distinguish records, reports, and underlying studies/artifacts:

```text
search record -> report/publication -> study or artifact
```

- A **record** is a database hit or registry entry.
- A **report** is a paper, preprint, abstract, repository, or other account.
- A **study/artifact** is the underlying experiment, dataset, system, proof, or attack; it may have
  several reports.

Generate search-flow counts from record/report/study screening data, never from claim rows. Link
multiple reports of one study before counting independence. `evidence-ledger.md` owns the
result/source-claim/synthesis-claim model and its provenance rules.

Suggested corpus fields:

```text
record_id, source_database, query_id, retrieved_at, report_id, study_id,
dedup_status, screen_stage, decision, reason, reviewer, adjudication
```

## 5. Retrieval

Use complementary discovery routes appropriate to the field:

- bibliographic databases and domain indexes;
- backward and forward citation chaining;
- author, venue, benchmark, dataset, standard, and registry searches;
- prior reviews as maps to primary evidence, not as replacements for it;
- mechanism and construct synonyms from adjacent fields.

Log the exact query, source, date, result count, and any query translation. Check retractions,
corrections, and version relationships for load-bearing sources.

Known-item recovery is a diagnostic: a query missing known relevant items is defective. Recovering
them does not prove complete recall. Semantic search over an already-downloaded corpus improves
organization, not external recall.

### Target-agnostic transfer-source search

When the decision is to seek an external relation seed, phrase the search question without proposed
source-to-target correspondences. Search relation, mechanism, precondition, observable consequence,
and failure-boundary synonyms across adjacent fields; surface labels may retrieve candidates but do
not select them. The target-independent coverage contract and stop condition are owned by
`transfer-sources.md`; target mapping, prediction, and thesis generation are out of scope here.

### Counterevidence and novelty attacks

For every headline conclusion, attack the strongest counterexample within the `coverage contract`.
For a closed supplied corpus, inspect the strongest included challenge and record external search as
out of scope unless the user authorizes it. If the synthesis supports a literature-level novelty
claim, the coverage contract must include an external search for the proposed mechanism and
observable under synonyms, older terminology, and adjacent disciplines. Record hits and no-hit
queries; do not report “no prior work” from the project’s own vocabulary alone.

## 6. Screening and extraction reliability

Apply roles in proportion to the coverage claim:

- **Publication-grade systematic work:** follow the applicable field standard. For intervention
  reviews, independently duplicate full-text eligibility, critical outcome extraction, and
  consequential risk-of-bias judgments. Elsewhere, treat duplicate critical stages as a
  conservative house choice unless the field requires them; adjudicate disagreements.
- **Rapid review:** state which steps were single-reviewed or abbreviated and what bias that can
  introduce.
- **Closed corpus or exploratory synthesis:** one editor may screen, but must not claim independent
  reliability or systematic completeness.

Do not replace duplicate work with an invented percentage recheck or universal kappa threshold.
Agreement statistics can describe a process; they do not validate ambiguous criteria by themselves.

Record exclusion reasons at the stage where the decision becomes defensible. Keep studies with
missing outcomes or unclear reporting visible when they remain eligible; unusable data and
ineligibility are different states.

## 7. Amendments

Exploration can legitimately change a review. Make the change auditable:

```text
amendment_id | date | protocol field | before | after | evidence prompting change |
prospective or retrospective | likely effect on conclusions
```

Never silently rewrite inclusion criteria around a favored result. If a change was data-driven,
label the affected analysis exploratory and run a sensitivity analysis when feasible.

## 8. Stop searching by mode

- **Systematic review:** execute the pre-specified search through its update cut-off; document
  resource limits and supplementary searches. Do not stop because the current narrative feels stable.
- **Rapid/bounded review:** stop at the declared time/source boundary and carry the limitation into
  the conclusion.
- **Scoping/map:** stop when the protocol’s search and charting plan is complete, not when every
  possible concept has appeared.
- **Realist/qualitative iterative synthesis:** use the method’s stated saturation or theoretical
  sufficiency criterion, record the last iterations, and avoid generalizing that rule to other modes.
- **Living review:** define update triggers and rerun only the affected retrieval, evidence, and
  claim links while preserving stable identifiers.

## 9. Corpus limitations

Before synthesis, state the likely direction of each material limitation:

- source/database and language coverage;
- publication, citation, and availability bias;
- screening and extraction process;
- date cut-off and version drift;
- missing reports or inaccessible results;
- dependence through shared datasets, authors, checkpoints, or benchmarks.

Do not invent a flip condition. State what is unassessed, why it matters, and what evidence would
change the coverage claim.

## Sources

Method claims and dated links live in `sources.md`. In particular, consult its PRISMA, Cochrane
search/selection, RAMESES, and venue-SoK rows before making a publication-grade recommendation.
