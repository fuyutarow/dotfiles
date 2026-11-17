# F/E evaluation plan (pre-registered 2026-11-18, before measuring this revision)
Held-out set: a copy of the coralbase published spec at 80edf0ad with 8 contradictions injected by a separate worker
(2 value, 2 status, 2 term/definition, 1 guarantee/predicate, 1 example-vs-contract), key hidden from the evaluator.
Recall pass: revised F+E finds >= 6 of 8 injected.
Precision pass: among all items the evaluator flags on that copy, false positives <= 1/3, classified as
defect / disclosed-unverified / false positive by a separate classifier.
The 8 reader-found items at e77c56c0 (K1-K5, PO1, PO3, PO6) were used to design this revision; recall on them is
reported but does not decide acceptance.

## Addendum (registered 2026-11-18 after the first held-out run failed, before measuring the next revision)
First held-out run (099d53d6, revision 3e80caaf): 3 of 8 injected found; judged 14 of 232 scan rows. FAIL.
That copy is spent. The next revision is measured on a new copy of the coralbase spec at 186407ce with 8 new
contradictions in the same distribution, plus 3 extra contradictions that contain no starting term (guarantee,
refusal or who-can-read sentences) for the hand pass. Key hidden from evaluators.
Acceptance is unchanged: >= 6 of the 8, false positives <= 1/3. The 3 extra are reported separately
(target >= 2 of 3) and do not relax acceptance.
Judges: shards of at most 35 rows, in parallel, each within 600 s; a judge's record counts only if
fact-judgments.ts reports no unjudged row for its shard.
