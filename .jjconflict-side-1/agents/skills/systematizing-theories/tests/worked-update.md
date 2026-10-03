# Worked update — preserve a conditional theorem and alternative support

This is a constructed fixture, not a scientific result or an actual kernel receipt.
All IDs below refer to the same imaginary project's existing canonical theory record.
No parallel database is created.

## Base map: theory@7

| ID@revision | Kind / exact statement | Warrant | Application / support |
|---|---|---|---|
| D-scope@1 | Definition: M is the declared target regime | STIPULATED | Used by every target-specific claim |
| T-main@1 | Theorem: for any M, A(M) and B(M) imply P(M) | KERNEL_CHECKED in the supplied fixture; exact statement fixed | Conditional result; not an assertion that A or B holds |
| T-alt@1 | Theorem: for any M, C(M) implies P(M) | KERNEL_CHECKED in the supplied fixture | Independent conditional result |
| A-run@1 | Empirical claim: A(M0) holds | Scoped evidence from finding F-old | Used in application J-run |
| B-run@1 | Empirical claim: B(M0) holds | Scoped evidence F-b | Current |
| C-run@1 | Empirical claim: C(M0) holds | Independent scoped evidence F-c | Current |
| P-run@1 | Proposition: P(M0) | J-run OR J-alt below | Current target claim |
| Q-run@1 | Corollary: Q(M0) | J-q from P-run@1 plus fixed T-q@1 | Current |

Justifications:

- J-run: T-main@1 AND A-run@1 AND B-run@1 → P-run@1.
- J-alt: T-alt@1 AND C-run@1 → P-run@1.
- J-q: P-run@1 AND T-q@1 → Q-run@1; T-q's exact implication is a fixed supplied fixture premise.

## Input F-new

The evidence owner corrects F-old: A(M0) was measured incorrectly; valid corrected evidence establishes not-A(M0).
The correction is scoped to M0. F-b and F-c, T-main, T-alt and T-q are unaffected in the supplied fixture.

## Changeset C-8

THEORY_BASE: theory@7
INPUT: F-new, validated correction of F-old
TESTED_VERSION: A-run@1 under D-scope@1
OPERATION: challenge application

| Direct change | Before | After | Reason |
|---|---|---|---|
| A-run@1 | Supported empirical claim | Historical/refuted in M0; corrected A-run@2 records not-A(M0) | F-new is contrary evidence in the same scope |
| J-run | Usable application of T-main@1 | Application withdrawn for M0 | Required A(M0) fails |

| Affected node | Alternative checked | Disposition |
|---|---|---|
| T-main@1 | Not needed | Conditional theorem and proof unchanged; no counterexample satisfies its antecedent |
| P-run@1 | J-alt remains valid via C-run@1 | Retained through J-alt; current view removes J-run as active support |
| Q-run@1 | J-q still has P-run@1 | Retained, with P's revised support basis |
| Experiment predicting A(M0) | No alternative | Prediction failed in M0; old preregistration preserved |
| Summary citing both support paths | J-alt only | Update summary; read back its statement IDs and current scope |

THEORY_RESULT: theory@8
STILL_FOLLOWS: P(M0) through J-alt, and Q(M0) through J-q.
NO_LONGER_FOLLOWS: P(M0) through the failed A/B application J-run.
OPEN_OBLIGATION: None within the supplied fixture; broader regimes remain outside this correction.

## Second input: definition D-scope@2

The project broadens M to include a new temporal regime. It gives no transfer proof for T-main or T-alt.
Create D-scope@2 and a new theory revision. Keep old theorem statements and evidence pinned to D-scope@1.
Mark proposed applications in D-scope@2 unknown; create transfer obligations for those actual consumers.
Do not relabel the old checked statements as proofs about D-scope@2, or erase their old validity.

## Recovery equality example

An external result guarantees that a repaired store at time tau equals a clean recomputation at tau.
The theory also predicts zero cumulative error before and after tau.
The second claim does not follow from the first: historical outputs are a different quantity.
Keep the store result under its premises; mark the cumulative-error derivation missing and seek a separate bound.
A finding with earlier wrong outputs bears on that cumulative claim, not automatically on store equality.
