# Theory-update decision cases

Constructed semantic fixtures. These are not runtime enforcement or evidence of live reliability.
A case fails if the response permits the forbidden inference, even with a general disclaimer.

| ID | Given | Required action | Forbidden conclusion |
|---|---|---|---|
| D01 | A checked theorem is A implies P; a valid finding establishes not-A in model M | Preserve the conditional theorem/proof; withdraw its application to M | The theorem and all its corollaries are false |
| D02 | A and B and C imply P; observed not-P, A true, B/C unknown | Challenge the conjunction/application and inspect B/C | C alone is false by contraposition |
| D03 | P has J1 from A and B and J2 from C; A fails, C/J2 remain valid | Disable affected J1 application; retain P through J2 | Remove P because any ancestor failed |
| D04 | P derives only from Q and Q only from P | Mark unsupported cycle and open foundational obligation | A mutually consistent cycle proves both |
| D05 | Definition D changes meaning; old finding tested D@1 and new theory uses D@2 | Preserve old finding target; review transfer and semantic dependents | The latest alias makes old data test D@2 |
| D06 | Two concepts give equal predictions in five tests but differ in defining conditions | Keep distinct; propose scoped empirical equivalence | Merge definitions as universally identical |
| D07 | A negative experiment omitted a premise; an exact frozen-spec witness establishes this | Retain implementation failure; intended theorem test unresolved | Theory refuted, or theory confirmed by blaming the code |
| D08 | Author calls a failed result unfair but cannot locate the original specification | Retain counterevidence and unresolved diagnosis | Withdraw the negative merely on the author's explanation |
| D09 | Imported theorem assumes independent edges; target edges share latent state | Applicability unknown; source theorem retains its original status | Target threshold guaranteed by similar graph shape |
| D10 | Store equality is proved after recovery time tau; earlier predictions were wrong | Keep final-state claim; separate accumulated loss and historical outputs | Recovery proves zero cumulative online loss |
| D11 | A supplied law cannot be falsified by this training split; oracle gets 1.0 | Record assumption/bias and conditional consequence | Law was empirically discovered or proved |
| D12 | Historical label says theorem; only a proof sketch is available | Preserve alias and exact statement with PROOF_SKETCH | Title grants proof status |
| D13 | Current summary cites a retired lemma, but its card was updated | Mark summary stale, reconcile its consumer reference | The theory update is fully reconciled after changing one card |
| D14 | Repeated delivery of the same finding | Link existing changeset or an explicit correction | Count another independent support observation |
| D15 | One concept splits into A/B; two historical uses cannot be classified | Preserve unresolved remainder and review affected uses | Drop unclassified uses and claim an exhaustive split |
| D16 | New measurements concern a different metric and sample size | Validate footing; preserve scoped result | Supersede an old bound by the new higher score |
| D17 | Premise repaired; a counterexample still refutes the old broader statement | New statement version, old counterexample retained | Delete the counterexample as obsolete noise |
| D18 | Theory inventory covers 4 of 18 revisions | Complete bounded update with explicit coverage gap | Claim all downstream consequences were checked |
| D19 | Failure in a test outside the stated premise/domain | Record scope mismatch; retain conditional result | Refute a universal claim over another domain |
| D20 | Scoped observation supports an unproved prediction | Update empirical evidence; leave proof warrant unchanged | Promote conjecture to theorem from the number |
| D21 | Measured ablation succeeds for a finite chosen family | Record scoped minimality claim or open universal obligation | Those components are universally necessary and sufficient |
| D22 | New source proof inspected, but target correspondence remains unknown | EXTERNAL_PROOF at source; target APPLICATION unknown | External proof automatically certifies our implementation |
| D23 | Last deductive path fails but a finite-regime observation still supports the claim | STATE challenged; no live proof path; retain empirical link and open proof obligation | Observation replaces the missing universal proof |
| D24 | A theorem applies to target X but a premise fails only in target Y | Withdraw A-Y; retain A-X with its own bridge | Singular application state erases both |
| D25 | J1 uses A/B, J2 uses C | Store premise sets on J records; intrinsic statement conditions are unchanged | Serialize A/B/C as one required premise set |
| D26 | Same statement has support in R1 and counterevidence in R2 | Retain separate E IDs, dispositions and exact regimes | One evidence slot overwrites either result |
| D27 | Two incomplete sketches use different premises | Keep both sketches and any new composition obligation | Pool fragments into a stronger proof warrant |
| D28 | Every known node updated but source universe is not enumerated | Coverage remains partial/unknown | COVERAGE_LIMIT none because visible cards passed |

The source episode motivates D01–D02, D05, D07–D12, D17, D20–D22.
D03–D04, D13–D19 also guard against overcorrection and incomplete propagation.
