# Controls and information flow — EV2 sole home

This reference owns prediction-time information availability, negative controls,
and outlier quarantine. It does not infer a leak merely from a large score.

## Freeze what may be known at prediction time

Before an online/prequential run, state the order of `PREDICT`, `SCORE`, `REVEAL`,
and `UPDATE` for one item. State it again for the entire batch. List features, past
labels, and unlabelled future features are available to the model at each event.
The target must preserve that order for a length-one item or vectorized batch.

For test-then-train, fix initial state, features, earlier labels, and RNG.
Then construct this metamorphic test:

1. Run predictions and save every pre-reveal output.
2. Change the current item's label and every later unrevealed label. For vectorized
   batches, perturb labels of other items that have not yet passed their reveal event.
3. Re-run. Predictions before each changed label's reveal must be identical.
4. Verify the model *can* change after the intended reveal/update, so a constant
   predictor cannot pass the test vacuously.

Inventory unrevealed-target copies and encodings at the executing input boundary, not only the variable named `y`.
The fixed features above mean permitted features, not a copied current answer hidden inside `x`, a key or a cache.
Test each forbidden path while preserving allowed inputs; changing `y` alone can leave a copied answer untouched.
A low shuffled-label score can therefore coexist with leakage on the original task.
Value equality or correlation alone is not proof of leakage: the declared task may legitimately permit copying.
Judge access against prediction-time information permissions and perturb the actual prohibited consumer path.

The exact invariant is conditional on the registered protocol. A protocol that permits
other examples' labels before a given prediction must name that reveal order explicitly.
If the invariant has no clear state/API boundary, ask `designing-type-contracts`
to place it. The target code owner
implements the test and fixes a violation.

## Batching must preserve the declared update protocol

No-future-label leakage and equivalence to sequential learning are separate checks.
With shared state, predicting an entire batch before updating can omit earlier labels that sequential learning used.
That may be a valid delayed-update protocol, but it is not automatically the same prequential experiment.

| Intended change | Evidence required before claiming equivalence |
|---|---|
| Batch independent episodes | Show their state isolation/reset contract and preserve each episode's event order |
| Batch a shared-state stream | Compare every required prediction and state transition, including later items in each batch |
| Delay credit or label updates | Prove the change preserves the declared protocol, or version it as a new learning protocol |
| Only first episode or B=1 agrees | Retain that narrow check; it cannot certify later batch items or cross-batch state |

Use a tiny witness where an early revealed label changes a later prediction on the same key.
Test different batch partitions, a short final batch and reset boundaries under the same stream/order.
If the new protocol is intentional, retain both bindings and reassess accuracy/throughput under EV3.
Do not call a protocol change a pure speedup because an earlier workload retained its aggregate accuracy.

## Verify the intervention before interpreting the control

Trace each material control from authored settings through generated arguments/environment to the executing consumer.
Record the intended setting, observed effective setting, and realized transformation at that boundary.
A flag, distinct job ID, stored params, or dry-run proves neither that labels changed nor that the consumer used them.

| Control observation | Disposition / next check |
|---|---|
| Permutation requested | Retain the realized target ordering or reproducible mapping and input/output identities; verify required invariants and actual changes on a nondegenerate fixture |
| Main/control predictions or scores are identical | Inspect transformed inputs and consumer behavior; equal outputs alone prove neither a dead control nor a valid null |
| Intended and effective control differ, or transformation is absent | Reject this control as evidence; qualify dependent claims and repair the target path |
| No consumer-side evidence exists | Keep control validity UNKNOWN; a configuration record cannot substitute for the observation |
| A validity gate does not fire | Conclude only that its tested violation was not detected; do not infer that a proposed law is true |

Use a known nondegenerate fixture to verify a repaired control-injection path at its actual consumer.
Launcher execution and record read-back checks live in `registered-benchmarks.md` under EV0/EV1.
Configuration authority/translation belongs to `governing-configuration-systems`.
The target code owner implements that contract.

Before making a probe mandatory across modes, test each materially different protocol boundary.
Use a tiny valid case and a forbidden-dependency witness. Preserve required training prefixes, reset and reveal order.
A truncated prefix that cannot reach prediction tests adapter readiness, not leakage.
A shared probe implementation may be reused when those boundaries are shown equivalent.
Record tested calls/positions and untested paths. Finite detector success does not certify all information flow.

## Negative control and outlier triage

| Observation | Required next action | Prohibited conclusion |
|---|---|---|
| Score exceeds a credible data/occupancy bound or a strong reference | Check the bound's assumptions and actual benchmark contract. Quarantine the score; run information-flow and target-appropriate null controls. | “Breakthrough” or “leak confirmed” from the score alone. |
| Labels or targets may enter the same residual/state before prediction | Run the pre-reveal perturbation above; inspect the exact write/read order and all key/value paths. | “No leak” because the egress merely excludes a LABEL-reading key. |
| Label permutation is an appropriate null | Freeze a permutation that preserves the split, groups, timing, and class balance required by the estimand. Prewrite the null expectation from that protocol, then rerun the full pipeline. | A universal majority-rate threshold or one shuffled run as proof of no leak. |
| A validated null control remains unexpectedly high | Set `EV2=FAIL`: the claimed measurement protocol leaked target information or its metric is invalid. Localize the path separately. | Naming the exact leak path before it is traced. |
| A null control remains high but its exchangeability or expected floor is not checked | Set `EV2=UNKNOWN`; validate the null before a leak verdict. | Calling the original score valid or claiming a confirmed mechanism. |
| Perturbation fails | `EV2=FAIL`; repair information flow, then rerun the original and its controls under a new code digest. | Reinterpreting the old run as repaired evidence. |

Permutation destroys a chosen feature–label relation only under its stated exchangeability
assumptions. It is a detector, not a universal leakage proof. The stronger prequential
test checks a specific forbidden dependency. Both need raw output and a reproducible
target locus; an agent's “passed” summary is not the receipt.

Primary-source scope: scikit-learn describes leakage as using information unavailable
at prediction time. Its permutation-test documentation
uses permuted targets as a null for feature/target independence. River's progressive
validation example predicts before updating on the revealed label. These sources
support the check shapes. The exact perturbation and status policy are skill-supplied.
Source URLs and dates are in the ledger.
