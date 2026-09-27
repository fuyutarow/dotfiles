# Incremental updates — one finding, one bounded changeset

This reference owns semantic update and dependency-impact decisions.
It consumes proof/evidence verdicts and existing record history; it does not implement storage or admission gates.

## Intake before changing the theory

Read the canonical current map and the exact version the finding tested.
Freeze the input locator and current theory revision for the update.

| Input condition | Action |
|---|---|
| Raw or invalid/unknown empirical measurement | Send to `validating-experimental-evidence`; record a pending input, without theory support/refutation |
| Scoped valid finding | Link the tested proposition and regime; inspect which declared prediction was met or missed |
| Proof result | Use the proof owner's exact statement, warrant and faithfulness scope |
| Definition/assumption change | Preserve old meaning; name the proposed new model and why the change matters |
| Finding tests an older theory version | Attach there first; check transfer explicitly before changing the current version |
| Duplicate input already processed | Return the existing changeset ID or a justified correction; do not count it twice |

A passed information-flow test cannot by itself certify a theory or prove that its inductive bias was learned.
Record a supplied bias as an assumption if the available data cannot challenge it.

## Process the change

1. Classify the input using the table below. Name the exact node and justification affected.
2. Propose the minimal change in statement, warrant, evidence or applicability; preserve the old revision.
3. Traverse reverse dependencies from changed nodes/justifications, including definitions and prediction mappings.
4. Inspect each affected justification in dependency order. Check alternatives before removing a conclusion's support.
5. Give every affected current consumer a disposition: retained with reason, narrowed, challenged, replaced or unresolved.
6. Reconcile linked predictions and theory summaries, then record read-back of the updated current view.

| What the finding establishes | Allowed theory update |
|---|---|
| Scoped agreement with a prediction | Add empirical support in that regime; retain proof maturity and untested scope |
| Valid counterexample satisfies all theorem premises | Challenge the exact universal claim/proof; inspect derivation and return to the proof owner |
| A premise fails in the experiment | Limit/withdraw the affected APPLICATION ID; preserve valid conditional theorems and other target applications |
| Implementation differs on a condition material to the tested prediction | Preserve implementation failure and its disposition; that run does not settle the intended theory |
| Apparent implementation excuse has no frozen-spec witness | Keep the negative result and unresolved diagnosis; do not rescue the theory by assertion |
| A source theorem's applicability bridge fails | Withdraw the target application; keep the source theorem with its original scope |
| One deductive justification is invalidated | Reassess its dependents; retain other complete valid deductive paths. An empirical link cannot substitute for proof |
| A derivation is repaired or claim narrowed | Create a new statement/justification revision; link the old counterexample to its original target |
| A failed prediction is replaced by a weaker or differently scored one after seeing the result | Preserve the original failed criterion; version and label the revision post-hoc, with its own tested quantity and evidence |
| No relevant statement or consequence changes | Record no semantic change with reason; no invented theorem or follow-up run |

“Challenged” or “unsupported” is not “false”. An empirical fit is not a proof.
When the last deductive path fails without a valid counterexample, set `STATE: challenged`.
Set `WARRANT_SUMMARY` to no live proof path, retain historical J records, and name the open proof obligation.
“Unsupported” describes that reason; it is not an additional STATE value.
Qualitative agreement with a revised story cannot turn a missed frozen criterion into a successful confirmation.
If only a condition was violated, do not retract all conditional descendants as false.
If an independent justification survives, state which path still supports the unchanged claim.
A semantic change may require broad review; an evidence annotation alone need not rebuild the whole theory.

## Definition and concept revisions

| Operation | Changeset obligations |
|---|---|
| Rename without meaning change | Retain stable identity; add an alias and repair display references |
| Change definition | New revision with old/new domains and meanings; review all current semantic dependents |
| Split an overloaded concept | New IDs and old-use mapping; classify unmapped uses as open, not silently dropped |
| Merge supposedly equivalent concepts | Record the scoped equivalence argument and replacement mapping; preserve distinct histories |
| Retire an unused concept | Enumerate live dependents and their replacements/open states before retiring it |

Do not silently reinterpret a historical finding under a later definition.
A change in a primitive object, reset rule, information set or metric is a semantic change even if the name is unchanged.
Keep old citations pinned to their original versions; mark deliberate continued old-model use explicitly.

## Reconcile the whole affected surface

A changeset is not complete just because the main paragraph was edited.
Read back changed cards, links, dependent corollaries and predictions.
Check any current summary that claims those results.
Use existing canonical update/correction mechanisms; never create a parallel record service.

| Remaining issue | Honest completion state |
|---|---|
| Affected proof or applicability remains open | Complete the bounded update with an explicit obligation; do not claim the theory is settled |
| Historical coverage is incomplete | Mark the affected closure limited to the inspected inventory; list the unseen source set |
| A consumer/view cannot be updated | Mark that consumer stale and withhold a fully reconciled-current-view claim |
| Another writer changed the theory during the update | Re-read the new revision and reconcile; do not overwrite its changes |

End with: what changed, what still follows, what no longer follows, and the next open obligation.
These are findings about the theory. BIBIFI work selection belongs to `driving-bibifi-cycles`.
Programme adoption and allocation stay with their existing owners.
For a changed premise or prediction, hand its exact old/new version and affected uses to that work-selection owner.
Identify inspected live consumers and unknown coverage; that owner reassesses queued and running tickets immediately.
Theory changesets do not themselves cancel jobs, authorize experiments or wait for every worker to acknowledge.

A coverage limit of `none` requires an enumerated source/dependency universe and a recorded reverse-reference check.
Otherwise state the inspected boundary and incomplete/unknown coverage, even if every visible card was updated.
