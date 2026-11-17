# F/E evaluation plan (pre-registered 2026-11-18, before measuring this revision)
Held-out set: a copy of the coralbase published spec at 80edf0ad with 8 contradictions injected by a separate worker
(2 value, 2 status, 2 term/definition, 1 guarantee/predicate, 1 example-vs-contract), key hidden from the evaluator.
Recall pass: revised F+E finds >= 6 of 8 injected.
Precision pass: among all items the evaluator flags on that copy, false positives <= 1/3, classified as
defect / disclosed-unverified / false positive by a separate classifier.
The 8 reader-found items at e77c56c0 (K1-K5, PO1, PO3, PO6) were used to design this revision; recall on them is
reported but does not decide acceptance.
