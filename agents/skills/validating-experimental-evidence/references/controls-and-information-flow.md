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

The exact invariant is conditional on the registered protocol. A protocol that permits
other examples' labels before a given prediction must name that reveal order explicitly.
If the invariant has no clear state/API boundary, ask `designing-type-contracts`
to place it. The target code owner
implements the test and fixes a violation.

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
