# Taxonomy and comparison matrices — an optional configurative branch

> **SOLE owner** of taxonomy construction and comparison-matrix semantics. Load only when
> classification answers the review question or is the intended SoK contribution. A viewpoint,
> belief-challenge, effect review, or mechanism synthesis does not owe the reader a taxonomy.

## 1. Applicability gate

Use a taxonomy when all are true:

1. there is a defined class of objects to classify;
2. users have a decision the classification improves;
3. dimensions can be assigned from observable evidence;
4. the scheme reveals structure that prose or a simple table would hide.

Do not use a taxonomy merely because the corpus is large. If the real need is to compare estimates,
assumptions, or mechanisms, use the corresponding synthesis table instead.

Write:

```text
purpose | intended users | object class | decision enabled | why taxonomy beats alternatives
```

## 2. Choose and report a development method

Nickerson, Varshney, and Muntermann provide an iterative method for taxonomy development in
information systems. Use it when its object/dimension model fits:

1. define a meta-characteristic derived from purpose and users;
2. set objective and subjective ending conditions;
3. choose a conceptual-to-empirical or empirical-to-conceptual iteration;
4. derive dimensions and characteristics;
5. examine objects and revise the taxonomy;
6. evaluate the ending conditions;
7. iterate until the declared conditions hold.

Report which steps and ending conditions were used. Any extra entropy cutoff, fixed number of axes,
small hold-out count, or other house heuristic must be labeled as an adaptation, not attributed to
Nickerson.

Other domains may have a more appropriate classification or ontology method. Prefer that method
when it better matches the objects and users.

## 3. Dimension contract

Each dimension needs:

```text
name | purpose | definition | values + decision rules | evidence field used to assign |
multi-label or exclusive | missing/not-applicable handling | source/provenance
```

Evaluate:

- **relevance:** the dimension changes the user’s interpretation or decision;
- **assignability:** two careful readers can apply its rule from the available evidence;
- **coverage:** boundary and unusual objects have an explicit treatment;
- **non-redundancy:** it does work not already done by another dimension;
- **explanatory value:** when explanation is claimed, values predict or illuminate something;
- **extendibility:** new objects can be classified without arbitrary reconstruction.

Do not delete a rare dimension solely for low frequency. A rare safety property or attack class can
be the most decision-relevant feature in the corpus.

## 4. Hierarchical, faceted, and relational forms

| Form | Use when | Warning |
|---|---|---|
| Hierarchy | objects have a defensible IS-A structure with meaningful inheritance | duplicate placement may reveal that the split is not hierarchical |
| Faceted taxonomy | objects combine independent characteristics | values within a facet need explicit assignment rules; facets need not be mutually exclusive with one another |
| Ontology/graph | relationships themselves carry meaning beyond classification | do not flatten typed relationships into decorative columns |
| Comparison matrix | the decision is approach-versus-property or result-versus-condition | columns must have shared semantics and sourceable cells |

MECE is not universally appropriate. A single-label classification may require mutually exclusive
and collectively exhaustive values; a multi-label codebook or ontology may deliberately overlap.
Declare which contract applies.

## 5. Comparison matrix

Design columns from the review question, not from every extractable field:

```text
| Object | Source | Scope | <decision-relevant dimensions> | <outcomes/claims> | Limitations |
```

Rules:

- define each categorical symbol and its decision rule;
- show quantitative values and uncertainty where available instead of replacing them with checks;
- link every non-trivial cell to a source claim or locator;
- distinguish `not reported`, `not applicable`, `not evaluated`, and negative evidence;
- keep conclusions out of cells whose sources only describe features;
- sort/group rows to expose a decision-relevant pattern, and state the grouping rule.

An “ours” row receives the same evidence and appraisal treatment as every other row.

## 6. Validation

Use evidence appropriate to the intended use:

- classify external or newly found objects that were not used to construct the scheme;
- ask domain users to apply the decision rules and record disagreements;
- test boundary cases and multi-label pressure;
- compare the taxonomy against a simpler alternative;
- state which distinctions it cannot express.

There is no universal valid hold-out size. Choose a sample and evaluation that can expose the
scheme’s plausible failures, then report the limitation.

## 7. Empty cells are candidates, not research gaps

An unoccupied combination can mean:

- the combination is impossible or incoherent;
- it is possible but not decision-relevant;
- terminology/search missed relevant work;
- evidence exists outside the corpus boundary;
- it is feasible but has no located in-scope evidence.

Before calling it a gap, check feasibility, retrieval coverage, and adjacent terminology. A
feasible combination with no located in-scope evidence may establish a bounded evidence or coverage
gap. Decision relevance, stakeholder value, and tractability determine whether that gap deserves
priority; emptiness alone does not. An empty Cartesian product is not evidence of importance.

## 8. Handoff

Store taxonomy cell assignments as evidence records or source claims, then let `synthesis.md`
interpret their patterns. `delivery.md` decides whether the taxonomy, matrix, or neither deserves a
prominent visual role.

Primary method sources and the boundary between IEEE S&P’s taxonomy contribution and its other SoK
contribution types live in `sources.md`.
