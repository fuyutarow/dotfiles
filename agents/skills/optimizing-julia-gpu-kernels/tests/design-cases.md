# GPU design and measurement regressions

These are semantic cases, not hardware measurements. Hide the decision columns in forward trials.

| Case | Required decision | Failure |
|---|---|---|
| Zero copies, one thread scans thousands of independent candidates | GKD maps independent axes and exposes serialized work before tuning | Declare GPU-first performance complete from residency |
| One thread updates a tiny inherently serial counter | Retain if bounded and measured; expose the cost honestly | Blanket ban on all single-thread kernels |
| Static top-k replaces repeated selection; selecting a winner changes remaining scores | Preserve sequential dependence or derive another exact algorithm | Assert initial top-k is equivalent without the invariance premise |
| Static ranking with a total tie order and selections that do not change other scores | Compare stable top-k with full state/output oracle and ties | Reject all useful parallel selection or drop tie semantics |
| Proposed parallel reduction uses saturating integer addition | Check actual associativity/order before reassociation | Treat integer arithmetic as automatically associative |
| Inference is2ms; update10ms; host interval8ms; forward proposed10x faster | Forecast18.2ms conditionally, not2ms or4x whole-step gain | Drop unchanged or unknown costs |
| Local integer update is called training but has no derivative consumer | State-transition oracle, no mandatory rrule | Add a fictitious differentiability requirement |
| Custom op is on a real loss derivative path | Supported AD route plus gradient oracle | Use non-gradient exception to skip derivatives |
| `CUDA.@sync @time op()` | Move completion wait inside timer: `@time CUDA.@sync op()` | Outer synchronization presented as sufficient for the inner timer |
| Repeated timings advance learning state and prune work | Controlled state per sample or explicit matched advancing workload | Compare early full work to later nearly empty updates |
| GPU tests skip because CUDA is unavailable | GPU claim unverified; retain CPU results separately | Report pass-count as GPU coverage |
| Measured kernel60.3µs, frozen limit60µs, overall speed target passes | Kernel criterion missed; separate overall result and declared uncertainty | Round the miss into pass or widen limit after measurement |
| Arithmetic intensity is below ridge, achieved bandwidth also low | Inspect latency, exposed parallelism and actual counters | Declare actual memory saturation from the roofline's slope alone |
| Forward-only work normalized by train wall time | Label the proxy and excluded work | Call it full-training MFU or compare model speed from it |
| INT32 normalized ratio exceeds FP32 model ratio | At most separately scoped efficiency comparison | Conclude faster or better learner from incomparable numerators/peaks |
| GPU batch/length differs between two published points | Report operating points and absolute time/quality | Infer universal superiority or saturation from the points |
| Full warp reads aligned contiguous4-byte words | Expect four32-byte sectors for that access; use the named counter scope | Apply universal sectors/request≈1 rule |
| A library chain preserves arithmetic but launch overhead dominates | Compare one bounded batching/fusion option with semantics and state oracle | Name-based ban on all custom fusion or automatic fusion without measurement |
| One stage has known independent work and cost; a different host interval remains unexplained | Permit scoped mapped-stage implementation/oracle while retaining that unknown cost; investigate independently | Require all costs attributed or a compiled receipt before writing the first slice |
| No implementation exists yet | Define path/work/ownership, build one bounded oracle-checkable slice, then profile | Demand a measured hotspot or compiler receipt before first code |
