# OPENINGS SHEET — <corpus or theme name>

SOURCE POSITION: soks/sok-<theme>/sok.md @ v1.0 (2026-08-05)
COVERAGE: inherited verbatim from the source position; not widened by this sheet
AUTHORITY: NONE
CYCLE: 2026-08-05 -> 2026-10-05
RETIREMENT THRESHOLD: uptake rate <= 0.10 for two consecutive cycles retires this layer for this corpus
BURIED: this sheet consolidates <sources A, B, C> such that readers will cite it instead of them;
  it deliberately keeps open the conflicts named in OPN-002 and OPN-004

> One sentence plus a `RETIRED-BY` observation is a complete row. Unpolished and question-shaped rows
> are admissible; a row held back until it looks presentable is the failure this form prevents.

---

### OPN-001 · GAP

ANCHOR: sok.md §2.2 item 3 / ledger.md ANN-003
REASON: INSUFFICIENT
BODY: No admitted source states an asymptotic complexity theorem for DiskANN/Vamana; the position
records only empirical latency at one scale.
RETIRED-BY: read pp. 7-end of the DiskANN paper and record whether a complexity theorem exists.
  PASS = a theorem is quoted with its statement number, and the ledger row is handed to
  systematizing-knowledge as evidence. FAIL = the pages contain none, and the absence becomes a
  bounded, cited claim instead of an unverified one.
TO: whoever holds the ANN theme's next reading slot
EXPIRES: 2026-09-15

---

### OPN-002 · CONTRADICTION

ANCHOR: sok.md §0.2 (author's own idealized-construction caveat) / ledger.md ANN-001, ANN-002
REASON: INCONSISTENT
BODY: The logarithmic search bound is proven under exact Delaunay/MRNG construction while every
shipped implementation uses an approximate edge-selection heuristic; the sources disagree about
whether the bound survives, and the position records this as unresolved.
RETIRED-BY: construct one instance where the approximate heuristic provably violates the monotonic
search property, or exhibit a proof that it cannot. PASS (either direction) = the discrepancy becomes
a decided row. FAIL = neither is producible within the slot, and the row is reopened with a narrower
instance class.
TO: the theme editor
EXPIRES: 2026-10-01

---

### OPN-003 · TASK

ANCHOR: sok.md §2.2 item 4
REASON: INSUFFICIENT
BODY: The position reports each method's own numbers and no cross-method comparison at matched
conditions; a scoreable comparison can be specified without asking the position's author anything.
REFEREE: input=the frozen fixture at fixtures/ann-1m.npz and the query set at fixtures/ann-q10k.npz |
  interface=a callable returning the k nearest indices per query, plus wall-clock and peak RSS |
  sequestered=held-out query slice fixtures/ann-qheld.npz, scored for recall@10 by scripts/score.ts |
  threshold=recall@10 >= 0.95 at or below the baseline's wall-clock, fixed 2026-08-05 before any attempt
RETIRED-BY: run the referee over at least two of the position's ten methods. PASS = both clear the
threshold, and the comparison is handed to systematizing-knowledge as evidence. FAIL = at least one
does not, and the failure is recorded with its numbers.
TO: any section holding an ANN-adjacent slot
EXPIRES: 2026-10-05

---

### OPN-004 · NON-ADJACENCY

ANCHOR: sok-近似最近傍探索 sok.md §0.1 / sok-疎な条件付き計算と動的ルーティング sok.md §0
MECHANISM: the first names "recall guarantee under a data-independent partition"; the second names
"bounded influence under a task-aligned route" — both constrain how far a query may be misrouted, and
neither cites the other nor any common source.
BODY: These two bodies constrain the same quantity and have never been put together in this corpus.
RETIRED-BY: check whether either literature already contains a source citing the other's mechanism by
name. PASS = a bridging source exists, the non-adjacency is false, and the row closes. FAIL = none
exists, and the row is handed to forging-novel-theses as a donor-side observation — not as a relation.
TO: the corpus editor
EXPIRES: 2026-09-30

---

## Disposal list

Candidates that did not become rows, so the burial is visible:

| Candidate | Disposal | Where it went |
|---|---|---|
| "IVF/IVFADC primary source unreachable behind a paywall" | world-condition | systematizing-knowledge living-update procedure — nobody here can act on it |
| "the field should agree on a benchmark" | UNTESTABLE-AS-STATED | dropped; no performer, no outcome |

## Retirement ledger

| ID | Terminal class | Date | Evidence or reason |
|---|---|---|---|
| OPN-000 | RETIRED-BY-EVIDENCE | 2026-08-04 | example row; observation made, pre-declared outcome occurred |

UPTAKE: 1 retired-by-evidence / 1 closed this cycle (window 2026-06-05 -> 2026-08-05)
