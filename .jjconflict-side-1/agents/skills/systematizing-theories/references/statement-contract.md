# Statement contract — logical role and justification

This is the sole home for theory-statement semantics. It is not an executable storage schema.
Map these fields into existing project records; source evidence remains at its own canonical locus.

## Statement identity and content

| Field | Required content |
|---|---|
| `ID@REVISION` | Stable project identity plus immutable statement revision; titles/numbers are display aliases |
| `KIND` | Axiom, assumption, definition, lemma, proposition, theorem, corollary, conjecture, empirical claim or open obligation |
| `STATEMENT` | Exact proposition or definition; one claim per card |
| `SCOPE` | Objects, domains, quantifiers, time window, conditions, units and observable being claimed |
| `CONDITIONS` | Intrinsic conditions of the exact statement and its definition versions; not the union of derivation premises |
| `WARRANT_SUMMARY` | Derived summary citing live J IDs/standards, or the stipulated/assumed/empirical basis; never pool incomplete paths |
| `DEDUCTIONS` | Alternative deductive J records; each owns its conjunctive premise set, conclusion and proof locus |
| `EVIDENCE_LINKS` | Repeatable E records: finding/version, disposition, exact tested proposition, regime and immutable locus |
| `APPLICATIONS` | Repeatable A records: target/version, theorem version, bridge locus, premise/implementation statuses and scope |
| `STATE` | Active, challenged, refuted, superseded or retired; state reason and locus |
| `SUPERSEDES / ALIASES` | Old version and meaning-preserving display names; never redirect historical citations silently |

Use exact domains and quantifiers instead of “generally”, “all cases” or “is sufficient”.
For performance/statistical claims, name finite/asymptotic regime, expectation/high probability and the error term.
Separate representability, learnability, identifiability, computational cost and observed achievement.
A result about a final store does not entail a result about prior reads or cumulative online loss.

## What each role does

| Role | Interpretation / required limit |
|---|---|
| Axiom | Adopted foundation of the declared formal model; justify the choice separately from applicability to reality |
| Assumption | Explicit conditional premise; empirical adequacy may remain unknown |
| Definition | Introduced meaning with domain/well-definedness obligations; no truth certificate is created by naming it |
| Lemma | Intermediate proposition with a declared derivation; display proof maturity alongside the role |
| Proposition | Claim with a declared warrant; the label is not stronger or weaker evidence than “theorem” |
| Theorem | Main result at a stated proof standard; a historical theorem label with only a sketch must say so |
| Corollary | Consequence of named results plus any extra premises and its inference; an unexplained arrow is not enough |
| Conjecture | Unproved candidate statement with an explicit discriminator or proof obligation |
| Empirical claim | Finding-bound assertion for tested conditions; numerical support does not certify a universal theorem |
| Open obligation | Missing derivation, applicability check, consistency/well-definedness check or evidence link |

Do not relabel a proposed foundation as an observed fact to make a theory look complete.
A finding can motivate replacing an axiom or definition; the replacement creates a revised model.
It does not make the earlier stipulation retroactively false.

## Warrant is separate from experimental support

Record the actual basis using these tokens:

```text
STIPULATED | ASSUMED | CONJECTURAL | PROOF_SKETCH | INFORMAL_PROOF | EXTERNAL_PROOF | KERNEL_CHECKED
CLAIMED_PROOF | EMPIRICAL_EVIDENCE
```
If an author merely says “proved” and the proof was not inspected, retain `CLAIMED_PROOF` with its limit.
An empirical claim uses `EMPIRICAL_EVIDENCE` with its evidence-link IDs; it has no mathematical proof status.

Each deductive J record owns its proof standard, premises and exact warrant locator.
The summary lists surviving complete paths and their standards for the same exact conclusion.
It may display the strongest fully established path, but must cite that J ID and retain weaker alternatives.
Never combine several partial arguments into a stronger warrant without a new complete derivation.
Empirical support cannot keep a mathematical proof warrant alive after its last deductive path fails.

| Warrant | Required locator / limitation |
|---|---|
| Informal proof | Exact argument and review status; name remaining gaps; no kernel-certification claim |
| External proof | Exact source result and hypotheses; separate source truth from the bridge to this target |
| Kernel-checked | Frozen formal statement, proof receipt and faithfulness status from `proving-theorems` |
| Empirical support | Validated finding, tested statement revision, regime and result; leave untested quantifiers open |

A derived result cannot silently use a proof sketch as an established lemma.
It may be a valid conditional result under that lemma; retain the condition explicitly.
An unverified empirical premise need not downgrade a checked proof of `A implies P`.
It prevents using that implication to assert `P` in a target where `A` is unestablished.
If proof validity itself is challenged, send the exact statement/argument to the proof owner.

## Justification structure

Each deductive justification has `J-ID`, a versioned conclusion, its premise list and exact warrant locus.
These premise sets live on J records only; no union of alternative sets becomes a condition of the conclusion.
Keep the other relation types outside the deductive-alternative set:

- `DEFINES / USES_DEFINITION` — semantic dependence.
- `DERIVES` — logical implication with a named inference/proof.
- `EMPIRICALLY_SUPPORTS / COUNTEREVIDENCE` — observational bearing under a tested regime.
- `APPLIES_TO` — external result or conditional theorem mapped to a target.
- `IMPLEMENTS / TESTS` — code or experiment correspondence, not deductive proof.

Within one justification, all required premises must hold. Across justifications, support can be alternative.
For example, `J1: A and B -> P` and `J2: C -> P` are two ways to support P.
Do not flatten them into `A and B and C -> P`, or treat the removal of A as automatic refutation of P.
A cycle of unsupported claims has no foundation.
Use an explicit induction/fixed-point argument when appropriate.

Observational support, code conformance and applicability are separate link collections.
They update evidence/application status or scoped empirical claims; they cannot certify a universal theorem.
Each target application has its own A ID. Failing application A-X does not withdraw a valid application A-Y.

For a contraposition, write the complete original implication before negating it.
From `A and B and C -> P`, observing not-P challenges the conjunction.
It does not identify not-A unless B and C and the inference are established in this application.

## Imported theorem and applied prediction

Before an external theorem supports a target claim, fill the bridge:

| Source side | Target side |
|---|---|
| Exact statement, proof/source status, assumptions | Corresponding objects and verified/unknown assumptions |
| Distribution/independence or algebraic structure | Actual target dependence and operations |
| Quantifiers, bound direction, time or limit | Measured variable, scoring interval and finite regime |
| Exclusions | Any voting, negation, noise, mutation or privileged information introduced here |

Missing correspondence means applicability is unknown; it does not refute the source theorem.
A structurally similar graph or an agreement at one point does not supply the bridge.
A prediction records both the target statement revision and its extra measurement/implementation assumptions.

## Observed agreement and identification

For an equivalence, identifiability or safe-merge claim, distinguish the observed context set from the target universe.

| Basis | Permitted scope |
|---|---|
| No distinguishing context was observed | Agreement on the inspected contexts; unseen contexts remain open |
| Data are noiseless but incomplete | Truth of observed labels; not completeness of distinguishing contexts |
| A completeness/separating-set argument is established | Generalize only to the universe that argument covers |
| A merge rule preserves agreement on the sample | A consistent candidate quotient; do not call it the target's true equivalence without the bridge |

Attach the completeness/separation premise to the relevant J or A record; do not hide it in a theorem's name.
If the bridge is missing, record an open obligation or conjectural application.
Zero contradictions cannot by itself prove that a merge is correct outside the tested set.
