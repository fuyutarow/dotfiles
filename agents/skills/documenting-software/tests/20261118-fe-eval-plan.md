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

## Addendum 2 (registered 2026-11-18 after the second held-out run failed, before measuring the next revision)
Second held-out run (revision f436a436, coralbase 186407ce copy): set A 5 of 8 (hand pass 4, E 1, scan judges 0);
set B 2 of 3. FAIL. 6,791 scan locations; 6 of 7 judges judged nothing.
Third run: a new copy with 12 set-A contradictions (3 value, 3 status, 3 term/definition, 2 guarantee/predicate,
1 example-vs-contract), 3 set-B (no starting term), injected by a separate worker; key hidden from evaluators.
Acceptance: set A >= 9 of 12, and false positives <= 1/3 of all flagged items as classified by a separate
classifier. Set B reported separately (target >= 2 of 3); it does not relax acceptance.
Before sharding, the coordinator records the statement count, the location count per shard and the first shard's
locations judged per minute; the shard bound is set from that measurement.
E precision on the second run's 14 non-injected E items is classified and reported before the third run.

## Addendum 3 (registered 2026-11-18 after the third held-out run failed, before measuring the next revision)
Third held-out run (revision f48e32e9, coralbase 186407ce copy): set A 8 of 12, set B 2 of 3. FAIL by one.
924 scan locations in 7 shards of at most 150; all 7 judges validated; first shard about 75 locations per minute.
The next revision combines: table-cell subjects and count-vs-enumeration rows in the F scan, check T (terms,
navigation labels, titles, headings, and the repository's own conventions), and the topic checklist.
Fourth run, measured once: a new copy of the coralbase spec, including the repository convention files that the
spec's readers rely on, with 16 set-A contradictions injected by a separate worker (value 2, status 2,
term/definition 2, guarantee/predicate 2, example-vs-contract 1, count-vs-enumeration 1, label-vs-content 2,
convention-vs-spec 2, one word with two senses 1, fixed count inside a definition 1) and 3 set-B; key hidden.
Acceptance: set A >= 12 of 16, and false positives <= 1/3 of all flagged items as classified by a separate
classifier. Set B reported separately (target >= 2 of 3); it does not relax acceptance.
Topic checklist, measured separately on at least 2 public OSS platform doc sets not used to write it:
(a) of the gaps it flags, >= 70% judged needed by an independent reader; (b) of the gaps an independent reader
lists without seeing it, >= 70% covered by it. Both are required.

## Addendum 4 (registered 2026-11-18 before measuring the fourth run)
Before the fourth run, F judging was narrowed (same subject, scope and time; summaries that only omit detail
are not mismatches; sense differences go to T) after 7 of 14 non-injected F flags on the third copy were
false positives. The narrowed rules are first re-applied to the spent third copy as development: the 7 false
positives should disappear while the 6 defects and the injected hits remain; this is reported, not acceptance.
The fourth copy also gets set C: 2 enforcement sentences whose component, actor or bypass is removed. Set C is
reported separately (target >= 1 of 2) and does not change set A's acceptance (>= 12 of 16).
Reports count confirmed and borderline classifications separately.
Figure-led page tests and the reference/ledger distinction are not injected into the fourth copy: they are
judged by readers and by the topic checklist, which are measured separately.
