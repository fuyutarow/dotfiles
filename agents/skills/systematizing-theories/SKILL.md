---
name: systematizing-theories
description: >-
  Builds and incrementally revises ONE theory: axioms, definitions, lemmas, propositions,
  theorems, corollaries, conjectures, dependencies and predictions. Use for 理論体系化/理論の体系化/増分更新,
  公理・補題・定理・系・命題, 概念の分割統廃合, or finding-driven theory updates.
  Owns THEORY MAP and THEORY CHANGESET. PURPOSE: corpus synthesis→systematizing-knowledge;
  proof certification→proving-theorems; measurement validity→validating-experimental-evidence;
  record authority/lifecycle→governing-research-documentation. Workflow-native:
  theory design and change acceptance stay SOLO; located inventory and independent challenges may fan out.
  English skill; respond in the user's language.
---

# Systematizing theories

> **Version**: v2609.1.1 (2026-09-27) — observed equivalence and revised predictions retain their scope.

```sh
for f in references/statement-contract.md references/incremental-updates.md \
  assets/THEORY-MAP.md assets/THEORY-CHANGESET.md \
  tests/triggers.md tests/decision-cases.md tests/worked-update.md \
  tests/postmortem-2026-09-27.md tests/postmortem-2026-09-27-dispatch-and-conformance.md \
  tests/forge-verification-ledger.md; do
test -f "$f" || exit 1
done
bun ../forging-skills/scripts/skill-check.ts .
```

## LAW — preserve what was claimed and what entitles it

> Give each statement an exact meaning, premises, scope, stable identity and located justification.
> A finding changes only the claims it actually bears on; trace the consequences before reusing them.
> A title, dependency arrow, successful experiment, or coherent story cannot supply a missing derivation.
> Separate a conditional result's validity from whether its premises hold in the current application.

Keep `THEORY MAP`, `THEORY CHANGESET`, `STATEMENT`, `JUSTIFICATION`, and `APPLICATION` as stable tokens.

## Function map — SOLE owner

| Input | Function | Owned result | Stop / handoff |
|---|---|---|---|
| Selected theoretical question + located statements/findings | reconstruct and connect | `THEORY MAP` with explicit gaps | A bounded theory version, not a claimed complete field survey |
| Current theory version + one bounded change input | reconcile implications | `THEORY CHANGESET` + updated map | Affected statements resolved or visibly open |
| Redundant, overloaded or inadequate concepts | split, merge, specialize or retire | Reviewed concept change in that same changeset | Updated uses and preserved old meanings |

Use the project's existing canonical theory/hypothesis records and stable IDs.
These are semantic views and changes, not a second evidence database or executable record schema.
`governing-research-documentation` owns durable admission, location and retention.
In a project without a record service, one admitted Markdown theory file may contain the map and change history.
Evidence and proofs remain at their original loci; the map refers to them.

## Entry and smallest useful pass

| Request state | First action |
|---|---|
| No theory map yet | Reconstruct one load-bearing chain from a definition/assumption to a claim and a testable consequence |
| A new finding arrived | Locate its exact target statement/version and consume its evidence disposition |
| A definition or assumption changed | Record the old/new meaning before inspecting dependent statements |
| Theory is scattered across many records | Inventory the declared scope and start with the critical chain; list unreviewed records explicitly |
| No selected theoretical question exists | Route framing to `supervising-research-programmes`; do not manufacture a unifying theory |

Do not postpone a bounded update until every historical theorem has been catalogued.
Do not call an inventory complete without a declared source set and reverse check for omitted statements.
A useful first result names one changed inference and the next unresolved obligation.

## Gates

| Gate | Required decision | Artifact / failure action |
|---|---|---|
| T1 BIND | Which theory version, question, source coverage and canonical locus? | Map header; unknown coverage remains partial |
| T2 TYPE | What exactly is each statement, and what warrants it? | Statement cards; ambiguous scope or proof maturity stays open |
| T3 CONNECT | Which complete premise sets justify each conclusion? | Versioned justification edges; an unexplained arrow is an obligation |
| T4 UPDATE | What does this finding or semantic change affect? | Changeset with old/new states, reverse dependencies and scoped dispositions |
| T5 CHALLENGE | Can a counterexample, missing premise or alternate proof change the update? | Boundary cases and alternative-support check; do not accept on diagram coherence |
| T6 RECONCILE | Do current statements, predictions and consumer views agree? | Read-back of current IDs/versions and explicit unresolved targets |

Read `references/statement-contract.md` before T2–T3 and
`references/incremental-updates.md` before T4–T6.
Use `assets/THEORY-MAP.md` and `assets/THEORY-CHANGESET.md` inside the existing record surface.

## Separate role, warrant and current use

| Question | Field / rule |
|---|---|
| Is this an axiom, lemma, theorem or corollary? | `KIND` records its logical role; the label alone grants no proof status |
| Is it stipulated, assumed, conjectural, sketched, informally proved, externally proved or kernel-checked? | `WARRANT_SUMMARY` cites the specific complete derivation paths; never pool partial proofs or promote observations |
| What empirical evidence bears on it? | `EVIDENCE_LINKS` keeps each finding, exact tested version and regime separately |
| Can it be used for this model/run/domain? | `APPLICATIONS` has one identified record per target/version, with its own premise and mapping status |
| Is this the current statement? | `STATE` and `SUPERSEDES` preserve active, challenged, refuted or historical versions |

A proved implication can remain proved when its premise fails in an experiment.
Its application to that experiment must then be withdrawn or limited.
An axiom adopted in a formal model is not an empirically established law of the target system.
A definition is a stipulation; its adequacy for a phenomenon is a separate claim.

## Construct a theory without inventing entailment

1. Fix primitive objects, notation, domains, time order and measured quantities.
2. Separate definitions, adopted assumptions, source results, internal derivations and empirical claims.
3. Write each load-bearing proposition with quantifiers, all premises and its conclusion.
4. For each claimed derivation, name the inference or proof locus and the exact premise versions.
5. Record a missing step as an open obligation; do not hide it in a diagram or call it a corollary.
6. Derive a scoped prediction only after stating the mapping from theory variables to observations.
7. Keep competing accounts and the unexplained residual visible; elegance is not evidence of completeness.

A dependency graph may have several parents and alternative derivations; do not force a tree.
Premises within one justification are conjunctive. Separate justifications are alternatives.
Only complete deductive paths support a mathematical proof warrant; empirical/test links cannot replace them.
Track definition-use, deductive, empirical and implementation links distinctly.
A cycle cannot justify itself; a legitimate recursive construction needs its own well-founded/fixed-point argument.

## Concept changes

| Operation | Require before changing current use |
|---|---|
| Split | The distinction and classification rule; map old uses to new concepts or an explicit unresolved remainder |
| Merge | An equivalence argument in the declared scope; preserve original IDs/aliases and historical versions |
| Generalize / specialize | State the changed domain, quantifier or premise; recheck each affected inference |
| Retire | Show replacement or unresolved disposition for every live consumer; keep the historical claim and failures |

Similar names, equal scores, or one shared implementation do not establish equivalence.
A merge justified only on observed contexts remains provisional outside those contexts.
A finite ablation cannot establish universal minimality. Record its tested family and leave the stronger claim open.
Concept operations that only move prose belong to `structuring-documents`.

## Execution model

The modal update is SOLO: one theory owner interprets the finding and accepts the changeset.
Read-only inventory and independent counterexamples may fan out under `orchestrating-agents`.
Workers return statement IDs, exact loci and challenges; they do not certify truth by agreement.
No harness → same map, serial. Certification comes from the appropriate proof/evidence owner.

## Deny-list

- Promote a sketch or measured trend to a proof, or a supplied assumption to a learned law.
- Infer one failed premise from a contradicted conjunction without ruling out the other premises.
- Replace an old definition silently while leaving its theorem citations on the same version.
- Delete all descendants when one justification fails without checking alternative support.
- Treat final-state equality as equality of historical predictions or accumulated loss.
- Treat an implementation mismatch as proof that the theory is true or false.
- Add a theorem/axiom after seeing a result merely to protect the old story; mark a revised model and new obligations.
- Report theory adoption, experiment admission or programme allocation from this map alone.

## Routing — typed cuts

| Sibling | Decisive question / handoff |
|---|---|
| `systematizing-knowledge` | What does a source corpus establish? → there. How are our theory's statements related and revised? → here |
| `proving-theorems` | Faithfulness or proof certification of a statement? → there. Maintain its role/dependencies/application in a theory? → here |
| `validating-experimental-evidence` | Is this measurement valid and comparable? → there first. What theory changes follow from that disposition? → here |
| `governing-research-documentation` | Where may a canonical theory and history live, and how are views retained? → there. Their mathematical/scientific content → here |
| `forging-novel-theses` / `forming-hypotheses-from-anomalies` | Generate candidate explanations? → those owners. Integrate a selected candidate as explicitly unproved theory content → here |
| `structuring-documents` | Meaning settled, only rearranging one document? → there. Concept/entailment changes → here |
| `planning-experiment-iterations` | Choose and bound the next experiment? → there, with exact prediction IDs and open obligations from this map |
| `directing-research-sections` / `supervising-research-programmes` | Admit work, commit learning or allocate programme resources? → there; this skill has no such authority |
| `arguing-research-papers` | Make the finished result's publication argument? → there, consuming this scoped theory version |

## References and assets

| File | Covers | Read when |
|---|---|---|
| `references/statement-contract.md` | Roles, warrants, assumptions and versioned justifications | Classifying or connecting statements |
| `references/incremental-updates.md` | Finding intake, affected closure and reconciliation | Updating any theory version |
| `assets/THEORY-MAP.md` | Minimal canonical map fields | Starting or repairing a map |
| `assets/THEORY-CHANGESET.md` | Bounded update and consumer read-back | Processing a change |
| `tests/worked-update.md` | Constructed finding-to-theory update with alternative support | Learning or checking the workflow |
| `tests/triggers.md` | Fire/no-fire and sibling boundaries | Changing scope or description |
| `tests/decision-cases.md` | Adversarial semantic cases | Verifying changes |
| `tests/postmortem-2026-09-27.md` | Fourth packet's bounded audit and repair map | Inspecting provenance |
| `tests/postmortem-2026-09-27-dispatch-and-conformance.md` | Fifth packet: observation scope, conformance and changed work | Inspecting the follow-up audit |
| `tests/forge-verification-ledger.md` | Source grades, existence decision and verification | Reforging |
