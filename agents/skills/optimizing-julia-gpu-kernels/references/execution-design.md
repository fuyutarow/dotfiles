# GKD — design parallel execution before writing kernels

Use the existing GKB work budget and GKR stage map; this is not another ticket or ledger.
First bind inference, non-gradient state update or AD training. Name exactly what the claimed path executes.
For an existing path, target one measured dominant stage. For a new path, build a bounded first witness before profiling it.
Use BIBIFI/P7 bounds; independent design work may proceed in parallel.

## Per-stage execution map

| Field | Decide before code |
|---|---|
| Dependency / work | Inputs, distinct dependency tuples, materialized outputs, ops and bytes; count selected and rejected candidates honestly |
| Serial span | What must wait for what? Separate true data/update dependence from an incidental host or single-thread loop |
| Independent axes | Batch, position, feature, candidate, segment or output; give their extents for the measured operating point |
| Mapping / layout | Work per lane/warp/block/grid; memory stride, active blocks, tail handling and expected parallel slack |
| Mutable ownership | One writer or declared reduction per destination; tie order, update visibility, overflow and reset behavior |
| Oracle relation | Exact identity, predeclared numerical tolerance or scoped stochastic criterion from the target contract; do not weaken it after a miss |
| Communication | Required block/grid boundaries, scratch, materialization and synchronization; never assume a grid-wide barrier inside an ordinary kernel |
| Cost / witness | Launch count, serial work, memory traffic, state retained, complete-path contribution and the first correctness/performance check |

A one-thread kernel is permitted for bounded serial bookkeeping, declared as `Serial(bound)` (§ Launch contract), not as an unexplained bulk-loop translation.
If independent work is large but exposed lanes are few, redesign mapping before register/occupancy micro-tuning.
If dependencies genuinely limit parallelism, retain that constraint and measure the resulting path honestly.
Do not demand full occupancy or claim all loops are parallelizable.

## Launch contract — parallel shape, transfer budget and stage outcome are declared types

Every launch site carries its shape as a value the test can read. No launch takes an implicit
`ndrange = 1` / one-thread default (`_one(backend)` helpers included).

| Declared shape | Declares | Test obligation |
|---|---|---|
| `Parallel(ndrange)` | The independent-axis extent of the operating point | Extent equals the GKD independent-axis count; tail handled |
| `Serial(work_bound_expr)` | Worst-case serial op count as a function of the budget quantities (cells, live names, coordinates, K_max, ...) | Bound evaluated at the budget's maximum, times the per-op cost, is ≤ the stage's time budget derived from the throughput floor; a measured time under `CUDA.@sync` is compared to the same budget |

| If the launch is… | Then |
|---|---|
| `Serial` outside any per-round / per-pass loop and bounded by a constant | Allowed; the bound expression still appears at the launch |
| `Serial` inside a per-round or per-pass loop | The bound MUST be a function of the budget quantities, not a constant; an over-budget bound is a repair, not a waiver |
| Undeclared (shape not typed) | Reject at review; a missing declaration is the defect, whatever it measures |
| `Serial` whose bound product exceeds the stage's time budget | Map the independent axes through GKD (frontier x names x coordinates are independent unless a dependence is named) |

Stage outcome: a stage that can be skipped returns an enum value, never a bare count.

| Outcome | Meaning | Reaches |
|---|---|---|
| `ran` | executed; its count is meaningful | report row, count column |
| `skipped_capacity` | a capacity constant or buffer bound was exceeded | report row, outcome column; the count column is `missing` |
| `refused_gate` | a precondition gate refused it | report row, outcome column; the count column is `missing` |

A skipped stage reported as a zero count fails review.
A test forces each non-`ran` outcome (exceed the capacity constant) and asserts the report row shows it.

## Choose transformations by dependence and total cost

| Pattern | Candidate transformation | Required check |
|---|---|---|
| Independent element/candidate work | Broadcast, map/reduce, batched primitive or a grid over independent axes | Coalescing, output ownership and tail behavior |
| Repeated scans for fixed-priority winners | One stable selection/top-k pass, then gather selected work | Later selections must not change remaining scores/eligibility; preserve deterministic tie order |
| Prefix dependence with an associative summary | Library scan or justified custom scan | Associativity under actual arithmetic/state; saturation or rounding can invalidate reassociation |
| Parallel forward with serialized learning | Redesign the update stage separately | Preserve update/reveal order and state trajectory; inference speed proves nothing about update throughput |
| Many cheap launches / intermediates | Batch, fuse or capture a stable graph | Added registers/scratch, synchronization legality, address lifetime and complete-path timing |
| Reused input with dependent shared-state updates | Hoist only invariant work; isolate reductions or epochs where legal | Do not parallelize across an update dependence merely because inputs have a batch axis |

Keep a simple same-semantics oracle. Before integration, compare required state and output, not accuracy alone.
Include adversarial ties, repeated updates, boundary/tail shapes, empty selections and saturation where relevant.
Use a deliberately wrong ordering/update case to show the oracle can detect the defect at issue.
Only exact identity supports bit reproducibility. Tolerance-based updates need repeated state checks at that tolerance.
Bind randomization and the stochastic acceptance criterion. A few agreeing seeds do not prove distributional equivalence.
GPU execution must be observed; a skipped GPU test does not certify the path.

## Complete the accounting before forecasting a gain

Retain every stage, including those unchanged by this patch and unattributed host intervals.
Print the dominant residual cost after each optimization; the next bottleneck is part of the next decision.
Use measured shares on a nonoverlapping timeline, or the critical path when stages overlap.
`T_new = T_unchanged + T_changed / s + T_added` is a forecast with assumptions, not a performance receipt.
Unknown stage cost stays unknown. Do not silently set a learner update or host interval to zero.
An unexplained interval need not block an independent mapped-stage repair; retain its cost in any conditional forecast.
Attribute that interval in a separate bounded slice when needed. Do not make every optimization wait for a complete audit.
Check the intended operating point and one justified contrasting shape; do not launch a size sweep by default.
Separate kernel, warm step and end-to-end gains; GK2 owns timing and EV3 owns comparison footing.

A device peak is an optimistic resource bound. Limited parallelism, latency or synchronization may dominate far below it.
A target multiplier is an acceptance policy requiring justification, not a theorem about attainable runtime.
Preserve externally required targets as goals; report missed frozen thresholds individually rather than rounding them into pass.
