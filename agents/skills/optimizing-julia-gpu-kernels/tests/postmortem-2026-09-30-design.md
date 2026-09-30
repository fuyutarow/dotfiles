# Kernel craft and cross-skill retrospective

Source attachment faf0a658-a16c-45ff-b54b-b6c7f134d95a,1370lines,
SHA256eefde6db2d3dce77fd4c2831055916264e2f59d494b99c295a53fd6da5643ed7.
Baseline6774b7b. These are outward reports, not all source code or raw profiler traces.
Do not attribute every elapsed delay to kernel design: the episode also contains permissions/integration waits.

| Locus | Reported observation | Distilled failure / retained good practice |
|---|---|---|
| 202–227 |42launches/tick; one-thread recruit73percent of device time; parallel forward improves inference | Device placement did not provide a parallel algorithm; oracle and real inference gains remain positive evidence |
| 249–260 | Stable top-k equivalence tested;11ms of18ms host interval unexplained;20k train target | Tie/order reasoning is useful; unknown intervals cannot be assumed removed by batching |
| 642–657 | Training5808positions/s misses20k; other one-thread stages42percent+36percent; one omitted from forecast | Incomplete path accounting allowed a forward-focused gain to stand in for a training plan |
| 805–825 | Normalized train rate uses forward-only work | Proxy scope must be explicit; it cannot establish complete training compute utilization |
| 1049–1052,1125–1131 | Bandwidth/launch calibrations differ; maximum from30samples adopted under competing activity | Preserve sample/statistic/clock/workload binding; no single unqualified calibration constant |
| 1240–1247 | Six requested runs were actually rejected for VRAM | Start confirmation remains a control-plane obligation, not a kernel-performance result |
| 1251–1265 | Parallelization/fusion improves training;27→15launches;1481oracle tests; two per-kernel limits missed | Retain the improvement and exact scope, preserve the small threshold misses, profile the new dominant stage |

## Structural defects and one-home decisions

| Old contract | Correction / owner |
|---|---|
| GKB counts work, GKR checks residency, GK1 compiles; no required parallel mapping | GKD in GPU skill, using the existing stage map: work/span, lanes, ownership, synchronization and serial-stage disposition |
| Arbitrary peak multiplier used as acceptance | GPU skill separates optimistic bound, complete-path forecast and frozen measured criterion |
| Every training kernel requires rrule | Actual derivative paths require GK3-AD; non-gradient update paths require state equivalence |
| Timing prose requires inner sync but example places timer inside outer sync | GPU measuring reference fixes the example and sampling/state contract |
| Roofline side and time-share treated as sufficient cause; best sample prescribed | GPU measurement requires applicable counters/timeline and predeclared statistics; unattributed cost remains open |
| Normalized efficiency discussed as model speed | EV3 owns operation/precision/workload/quality/operating-point comparability; GPU skill supplies raw timing/counters |
| Host Julia implementation can appear to settle a GPU path | writing-julia routes actual GPU execution design here; BIBIFI consumes complete train/infer accounting |

No new skill or runtime scheduler is introduced. Primitive catalogs, device legality, parallel
design, measurement and evidence interpretation have separate homes inside/among their existing owners.
Changes to launch/resource enforcement or Firedancer implementation are outside this revision.

## Primary-source checks (2026-09-30)

- CUDA.jl [Introduction](https://cuda.juliagpu.org/stable/tutorials/introduction/), custom-kernel and benchmarking sections: a sequential device loop can be slow; synchronization must be within the timed operation. Full page inspected.
- CUDA.jl [Performance Tips](https://cuda.juliagpu.org/stable/tutorials/performance/), general tips: whole-application profiling precedes targeted kernel tuning; transfers, launch count and host submission matter. Full page inspected.
- NVIDIA [Nsight Compute Profiling Guide](https://docs.nvidia.com/nsight-compute/ProfilingGuide/), workload durations/clock-control primary excerpts: replay, clocks, cache state and serialization affect durations. Direct fetch failed; only indexed primary excerpts were inspected.
- NVIDIA [Writing SIMT Kernels](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/writing-cuda-kernels.html), coalesced global-memory access primary excerpt:32lanes reading adjacent4-byte words uses four32-byte transactions. Indexed primary excerpt inspected.

The GKD card, measured acceptance discipline and sibling partition are skill-supplied operating rules.
No source is claimed to prove these instructions improve an agent's real R&D throughput.

Local corpus checked read-only at e945694bf47f43149a6b3888ae51b9f1fdafc08e:
MFR position urn:uuid:01a0f04c-b1e5-73ac-aa93-7fc180609c14, ledger MFR-001/002/Y001;
DTM position urn:uuid:01a0f074-9a10-70ed-98f7-cf43ff4fc996, ledger DTM-013/014/015/Y004/Y005.
PaLM and Pope captures were read for their bounded definitions. Both positions remain draft with declared coverage limits.
The rules preserve useful-versus-issued work and operating-point distinctions; they do not turn these metrics into task-quality rankings.

## Frozen verification scope

Semantic cases are in `design-cases.md`. Fresh OLD/NEW reviewers receive the same isolated proposed
integer-learning optimization and timing/profile artifacts without the expected decisions.
They must inspect files and write a bounded next design/check and claim disposition. No GPU launch is authorized.
Root checks stage accounting, update semantics, actual AD applicability, timer placement and normalized-metric scope.
Static/file-backed reviews are not a compiled CUDA test, live benchmark or measured speedup.
