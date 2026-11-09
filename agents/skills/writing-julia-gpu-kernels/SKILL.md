---
name: writing-julia-gpu-kernels
description: >-
  For Julia GPU paths, choose a suitable library primitive → cuTile.jl tile kernel → thread-level
  KernelAbstractions.jl or CUDA.jl kernel only when the work does not fit a tile, stating why.
  MANDATORY before @cuda, KernelAbstractions @kernel,
  or Julia device storage/decode/performance edits, and for GPU-first model/learner step performance
  (host round-trips, Array() pulls, GPU first). Use for GPU カーネル/最適化, occupancy,
  coalescing/shared memory/warps/atomics, InvalidIRError, profiling/roofline, tensor cores,
  reduced precision/低精度, FP8/6/4, MXFP/NVFP4, microscaling/マイクロスケーリング/ブロック浮動小数点,
  packed/パック済み storage, Microfloats/cuTile, GPU rrule, scan, or SSM/Mamba—only with a
  Julia/CUDA.jl/CuArray device path. Cuts:
  host Julia → writing-julia; terminology/surveys/shopping/PyTorch-JAX → plain or
  systematizing-knowledge; behavior change → follow repository instructions and the relevant owner. Cheap benchmark →
  GK2; costly bet → acting-on-hypotheses. English skill; answer in the user's language.
---

# Choose the execution model before writing a kernel

> Use a semantics-preserving library primitive first, a cuTile.jl tile kernel second, and a
> thread-level KernelAbstractions.jl/CUDA.jl kernel only for work that does not fit a tile; state why.
> Then bind the full path and work budget (GKB), map dependencies onto execution (GKD), reject
> unnecessary kernels (GK0), and meet device legality, measurement, oracle and precision gates (GK1–GK4).

This ordering is the default, not a claim that every operation has a library primitive or fits a tile.
cuTile.jl expresses block work as whole-tile operations; its compiler maps them onto threads and hardware.
Choose a thread-level kernel for genuinely irregular work such as scatter, hashing or scalar atomics only
when it does not fit the tile model, and name that reason. cuTile.jl's versioned conditions are below.

## cuTile.jl conditions (v1.0.0, commit c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe)

- Launching requires importing CUDA.jl; it supplies `CuArray`, compiler artifacts and the stream
  ([execution.md:37–42](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/docs/src/man/execution.md#L37-L42)).
  CUDA.jl is absent from cuTile.jl's deps, weakdeps and extensions; do not attribute this to an extension
  ([Project.toml:11–33](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/Project.toml#L11-L33)).
- Launch arguments convert `CuArray{T,N}` to `ct.TileArray{T,N,I,Spec}`
  ([execution.md:104–119](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/docs/src/man/execution.md#L104-L119)).
- Baseline: Julia 1.11+, NVIDIA driver 580 (CUDA 13), compute capability 8.0+.
  Feature availability also depends on Tile IR bytecode version
  ([compatibility.md:1–46](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/docs/src/man/compatibility.md#L1-L46)).
- Numeric FP8/FP4 formats do not support general arithmetic, reductions or scans; convert to an
  arithmetic float for elementwise computation. `ct.muladd_scaled` requires Blackwell (sm_100+)
  ([element_types.md:25–35](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/docs/src/man/element_types.md#L25-L35),
  [compatibility.md:94–103](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/docs/src/man/compatibility.md#L94-L103)).
- Listed integer types are Int8/UInt8 through Int64/UInt64; docs provide no complete operation-by-type
  matrix ([element_types.md:5–8](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/docs/src/man/element_types.md#L5-L8)).
- Sparse view indexing supports rank 2+ arrays with one 1-D integer tile index; other indices are
  unit ranges or `:`. Scalar indices are not supported
  ([compatibility.md:64–69](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/docs/src/man/compatibility.md#L64-L69),
  [operations.jl:50–78](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/src/language/operations.jl#L50-L78)).
  v1.0.0 adds view-based atomic reductions and `ct.@atomic`
  ([release notes](https://github.com/JuliaGPU/cuTile.jl/releases/tag/v1.0.0)); do not generalize beyond
  the documented operations and architecture/version gates.
- Tile shapes are compile-time values; changed constants or converted argument types specialize a new
  kernel ([execution.md:125–176](https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe/docs/src/man/execution.md#L125-L176)).
- The inspected README/docs/release notes do not state an automatic-differentiation guarantee; this is
  an evidence limit, not a claim of non-support (capture urn:uuid:01a1bf08-e39f-74e6-97c5-9d030c426b63).

## THE LAW

> **Version**: v2610.2.0 (2026-10-02) — launch shape typed (Parallel/Serial), in-loop transfer budget 0, typed stage outcome; device ownership stays at writing-julia JG8 (§10.10).
> **Scope**: CUDA.jl/KernelAbstractions kernels and CuArray/device paths; NVIDIA-first.
> **History and source grades**: `tests/forge-verification-ledger.md`.

```bash
test -f references/execution-design.md || exit 1
for f in writing-kernels memory-and-warps host-performance reduced-precision-formats measuring debugging portable-kernels differentiating-kernels api-changes; do test -f "references/$f.md" || echo "MISSING references/$f.md"; done; test -f tests/trigger-set.md || echo "MISSING trigger-set"; test -f tests/forge-verification-ledger.md || echo "MISSING ledger"
```

Out of scope: driver installation, `nvidia-smi` plumbing, multi-GPU/distributed work, and CUDA C++.
AMDGPU implementation is deferred; the reduced-precision reference records only sourced target facts.

Before allocation, warmup, profiling, or a pilot, obtain P7 resource admission through
`agent-resource-run`. P7 owns capacity; this skill owns the admitted GPU work.
Inside a BIBIFI loop, use its short experiment cap for GPU tests and profiling as well as benchmarks.
A microticket may use a targeted oracle under its cap; it does not waive required GK3 acceptance tests.
Schedule any broader release tests with explicit coverage and a separate finite budget, not an unbounded suite.

Fast-moving facts are tagged `[dated:YYYY-MM]`. Re-check a row after two quarters.
Re-check sooner when the target or toolchain differs.

## THE LAW

> Define the path and work budget first (GKB), then map independent work and serial dependencies onto execution (GKD).
> Device residency (GKR) alone is not parallel execution. Account for every stage in the claimed train/infer path.
> Reject unnecessary kernels through GK0. A justified kernel must be device-legal (GK1), measured
> synchronously (GK2), and checked against an oracle (GK3). A path differentiated by AD also needs GK3-AD.
> Non-gradient learning still needs update-state equivalence; training alone does not require an rrule.
> Reduced precision needs a complete representation-to-execution contract (GK4).

## The gates — GKB, GK0–GK4, each with a checkable artifact

Before code: bind the path/budget, map dependencies and ownership, then choose the primitive (GKB/GKD/GK0).
For the first implementation slice: compile it (GK1), check its scoped oracle (GK3), then measure it (GK2).
Final acceptance needs the full claimed path's evidence, plus AD/precision gates only where applicable.
Do not require a compiled-kernel receipt before permitting its implementation.
An unknown stage blocks unsupported whole-path forecasts, not a separately justified local repair.

| Gate | Rule | Artifact |
|---|---|---|
| **GKB WORK BUDGET** (§0) | Bind the useful output, workload, ops/bytes and complete path before code or a target. Distinguish optimistic bounds from forecasts and acceptance. | WORK BUDGET plus a predeclared, justified performance criterion on the measured boundary |
| **GKD EXECUTION DESIGN** (`execution-design.md`) | Map work, serial span, independent axes, ownership, communication and launch boundaries before a kernel rewrite. | Per-stage execution map; serialized work is justified or marked a repair, not hidden behind CUDA syntax |
| **GKR DEVICE RESIDENCY** (§0b) | A model step with a GPU performance objective gets a STAGE MAP before code, even if written as host Julia. Profile its steady-state hot path for device execution and zero host↔device transfers. | `STAGE MAP`, device-output checks, and a trace showing zero HtoD/DtoH copies inside the boundary. |
| **GK0 SHOULD-THIS-KERNEL-EXIST** (§1) | Prefer a primitive preserving semantics and whole-path cost; justify custom mapping/fusion against that alternative. | Checked alternative and the measured or derived reason for departing from it |
| **GK1 DEVICE LEGALITY** (`writing-kernels.md`) | Use isbits arguments, no GC allocation, `return nothing`, specialized helpers, and no boxed captures. | Kernel compiles; `@device_code_warntype` is clean on hot paths. |
| **GK2 MEASUREMENT** (`measuring.md`) | After P7, separate warmup/profile/timing; synchronize inside the timer and bind workload, state reset and statistics. | Measurement receipt, complete stage accounting and actual profile; normalized metrics retain their scope |
| **GK3 CORRECTNESS ORACLE** (`debugging.md`) | Compare required outputs and mutable state across the claimed update sequence; check actual device dispatch and races. | Real GPU oracle/negative cases; SKIP is unverified, not pass; cached paths pass §11 |
| **GK3-AD DIFFERENTIABILITY** (`differentiating-kernels.md`) | Only when derivatives through this op are required: provide the AD route and gradient oracle. | `rrule`/Enzyme or supported composable AD path; non-AD state update uses GK3 instead |
| **GK4 PRECISION CONTRACT** (`reduced-precision-formats.md`) | Separate payload, scale/block, storage, policy, decode, target compute, accumulator, and outcomes. | Completed `PRECISION CONTRACT`; every claimed rung has its own oracle. |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `writing-julia` | DECISIVE: is a GPU-first step or device path being designed, edited, or measured? GPU path → HERE, even if host Julia currently implements it. Host-only types, packages, AD frontend, CPU work → there. Co-fire; JG0 remains active and JG2 precedes GK1. State/API device ownership → there (JG8, §10.10); launch `get_backend(x)` and GKR stay HERE. |
| Repository instructions and relevant domain owner | Handle behavior change or bugfix; this skill owns device legality and GPU evidence. |
| `refactoring-code` | Co-fire for behavior-preserving restructuring. It owns the oracle bracket; GK2/GK3 supply GPU checks. |
| `raising-resolution` | Inspect `CUDA.functional()`, `CUDA.versioninfo()`, `Pkg.status`, and a profile before a present-state claim. |
| `acting-on-hypotheses` | Cheap reversible benchmarks stay in GK2. Use AOH only when costly downstream exposure depends on one untested result. |
| `orchestrating-agents` | P7 selects and admits device resources. P7 placement alone does not trigger GKR; a model-step GPU performance objective does, even without an explicit residency declaration. |
| `validating-experimental-evidence` | EV2 owns update-order equivalence; EV3 owns throughput units and comparison footing. Consume those contracts before interpreting a faster kernel or batch. |
| `driving-bibifi-cycles` | Chooses the next bounded experiment and allocates useful work; HERE specifies GPU design, timing and oracle obligations for that slice. |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| CUDA **C++** kernel questions, no Julia in play | plain answer / web — this skill is CUDA.jl-specific |
| "nvidia-smi not found" / driver install / WSL GPU passthrough | environment plumbing — shell/dotfiles work, not kernel craft |
| PyTorch/JAX GPU performance | not Julia — plain answer |
| Julia CPU performance, no GPU in play | `writing-julia` alone |
| "which GPU should I buy" / hardware shopping | plain answer |
| Flux/Lux layer or optimizer choice with stock layers, with no GPU-step performance question | `writing-julia` (packages.md); a GPU-first step or device-path performance question fires GKB/GKR even without a custom kernel |
| reduced-precision terminology with no Julia/device decision | plain answer; no specialist procedure needed |
| literature survey of FP4/MX/adaptive formats | `systematizing-knowledge`, then distill only if a device rule is requested |

The full near-miss set is `tests/trigger-set.md` — desk-check it after any description edit.

---

## §0 GKB — the work budget (before GK0, before any target number)

Write this block before choosing primitives, setting a speed target, or dispatching a GPU ticket.

| Field | Content |
|---|---|
| Output unit | What one unit of useful work is: a token, a row, a cell. |
| Path / operating point | Inference, non-gradient update or AD training; shapes, dtype, state/reveal/update order and exact timed boundary. |
| Dependency factoring | For each output, list the inputs it actually depends on. Compute once per distinct dependency tuple, not once per conceptual unit. Record the distinct-tuple count. |
| Selection cardinality | If only K of C candidates feed an expensive stage, record C, K, and how many outputs that stage actually materializes and writes. Charge ops and bytes for the implemented count, not the intended mask. |
| Algorithm / span | Choose a justified work-efficient formulation; name serial dependencies and independent work through GKD. Minimum work alone does not imply minimum GPU latency. |
| Ops / unit | Integer or FLOP count per output unit for that algorithm. |
| Bytes / unit | Global-memory reads plus writes per output unit at the narrowest exact element type. |
| Device bound | max(ops ÷ applicable peak ops/s, bytes ÷ applicable bandwidth), with operation type, memory level and provenance. It omits dependency latency unless modeled separately. |
| Forecast / criterion | Account for all affected and unchanged stages, launches and unattributed intervals. Freeze the workload, estimator, tolerance and justified target before measurement. |

| If… | Then |
|---|---|
| A speed target is written without this block | Reject the target; derive the block first. |
| A target is only a multiple of the previous implementation or hardware peak | Keep it a goal until complete-path accounting and matched measurements justify feasibility. |
| Measured time misses its criterion or reveals an unexplained dominant stage | Diagnose that stage and bound applicability; do not widen a multiplier after seeing the result or freeze unrelated work. |
| A reference model is to be benchmarked | Match the EV3 work unit/protocol/timing boundary and derive its budget. Bounds alone do not establish measured throughput superiority. |
| A shared-library function enters the measured critical path | Document the counted work and state contract; bind its benchmark to the justified criterion instead of timing every function by default. |

Read `references/execution-design.md` before mapping a stage to kernels. Record serial span as well as total work.
A correct device-resident implementation can still leave most parallelism unused.

## §0b GKR — device residency for a whole step

This gate fires when a model step is expected to perform on GPU. The stage map creates the
residency contract; its absence cannot excuse the work. P7 admission alone does not fire GKR.
A step can be written entirely in host-looking Julia
with no `@cuda` in sight and still be required to run on the GPU. Start the timed inner-step
boundary after staging the batch. End it before logging, checkpointing, or output export.
Write the stage map before code. Do not hide a data-dependent stage outside that boundary.

| Field | Content |
|---|---|
| Stage | Every stage in the claimed path, including forward, selection/recruit, credit/update, reductions and export where included. Mark unmeasured stages rather than assigning zero cost. |
| Where | Record where each data-dependent stage executes and where its outputs reside. Every stage and output inside the declared hot path is device-resident. |
| Primitive / mapping | The vendor call, broadcast or kernel; GKD records independent lanes, serial axes, ownership and synchronization. |
| Launches | Launch count per step; batched primitives count once. |
| Transfers | HtoD/DtoH copies inside the declared, warmed hot-path boundary; the target is 0. Report legitimate ingress/export separately. |

| If… | Then |
|---|---|
| A GPU error (scalar indexing, non-isbits argument, missing method) appears | Fix the production hot path on the device: a broadcast, gather, batched primitive, or kernel. `Array(x)`, `collect(x)`, or a host copy to silence it is rejected there; the CPU oracle may still copy results for comparison. |
| The first implementation is a CPU reference | Keep it as the test oracle. Do not promote it as the production path under a device-resident contract. Build and verify an explicit device path; generic `AbstractArray` syntax alone proves nothing. |
| A hot stage loops over positions or instances in host Julia (`for t in 1:L`, `Dict` updates) | Batch or fuse that data-dependent axis on the device. A small fixed host loop that only launches device work must still meet the counted launch budget. |
| A stage decodes every candidate when the first ranked answer suffices | Walk the ranking to that answer. C-wide match/scoring is allowed when it establishes the ranking; count its C-cost in GKB. |
| Only K of C candidates may write, but C costly outputs are computed and masked afterward | If K is known before output construction, gather its IDs or cheap match results on device, then compute/write K outputs. If ranking needs C outputs, charge C and prove the bound; a final mask itself saves no work. |
| A trace shows zero copies but a stage or output inside the hot-path boundary remains on the host | GKR still fails. Verify device execution and output residency per stage; zero memcpy is necessary, not sufficient. |
| A step's measured time is dominated by host stages | Report the per-stage table (share of time, device or host) before any tuning; the host stages are the fix. |
| The device follows a budget value, or result rows carry no `device` | Not a GKR repair: writing-julia JG8 (§10.10) owns it. GKR then profiles the explicitly chosen device. |
| A launch has no declared `Parallel(ndrange)` / `Serial(work_bound)`, or a `Serial` launch sits in a per-round/per-pass loop with a constant or missing bound | Declare it; test the bound and a measured time against the throughput-floor budget (`execution-design.md` § Launch contract) |
| A blocking host read (flag/scalar) occurs inside the round/pass loop | Budget 0 unless declared; pipeline it one check late and count transfers in a test (`host-performance.md` §4.1) |
| A stage can be skipped (capacity, gate) | It returns a typed outcome (`ran` / `skipped_capacity` / `refused_gate`) that reaches the report row; never a zero count (`execution-design.md` § Launch contract) |
| A known violation "CPU-only" survives more than one revision | Withhold the affected GPU-performance claim and prioritize its repair. BIBIFI owns the next useful work selection. |

GKB's peak-based time is an optimistic lower bound, not a guaranteed attainable end-to-end runtime.
State which stages and costs it covers before comparing it with measured time or setting a release threshold.
Audit existing targets as well as proposed increases. An unsupported old number is not a validated fallback threshold.
Preserve a user-mandated target as a goal with feasibility open; mark internal unvalidated thresholds pending justification.
For batching or deferred credit, use evidence EV2's protocol test before claiming behavior-preserving acceleration.
For causal scans, state whether episodes have isolated tables or share sequential state; these are different algorithms.

## §1 GK0 — the deny-gate dispatch table (read FIRST)

Before any hand kernel, walk this table. Prefer a matching primitive when it preserves semantics,
work/memory complexity and the measured whole-path cost. A matching name alone does not justify a slow call chain.
If launches or intermediates dominate, compare one bounded batching/fusion alternative through GKD/GK2.

| Shape of the computation | Use — NOT a hand kernel |
|---|---|
| Dense matmul / GEMM | `A * B`, `mul!(C, A, B)` → cuBLAS; select supported tensor-core precision through the library path |
| Exact integer GEMM, Int8 × Int8 → Int32 `[dated:2026-09]` | `mul!` and a `gemmEx!('N','N')` on [rows, K] Int8 return `CUBLAS_STATUS_NOT_SUPPORTED`. Store A as [K, rows] and call `CUBLAS.gemmEx!('T', 'N', Int32(1), A, B, Int32(0), C)`; this reached the INT8 tensor-core path on sm_86 (CUDA.jl 6, cuBLAS 13.8). A generic fallback runs ~13× slower. |
| Repeated small GEMM `[dated:2026-07]` | Profile `mul!`'s per-call `CuRef(α,β)` upload; use persistent refs with the cuBLAS wrapper when it dominates |
| Linear solve / factorization (`\`, `qr`, `svd`, `eigen`, `lu`) | LinearAlgebra verbs on CuArray → cuSOLVER |
| FFT | `fft`/`ifft`/`plan_fft` (AbstractFFTs) → cuFFT |
| Sparse ops on `CuSparseMatrixCSC/CSR` | `*`, `mul!`, `\` → cuSPARSE |
| Convolution / pooling (NN) | load cuDNN (it is NOT in CUDA.jl's deps `[dated:2026-07]`); Flux/Lux dispatch to it |
| Reduction (sum/max/any/custom op) | `mapreduce`/`reduce`/`sum` on CuArray — already warp-optimized |
| Elementwise pipeline | one fused dot-broadcast `y .= f.(a) .+ g.(b)` — the broadcast compiler writes the kernel |
| Prefix scan / cumulative op | `accumulate`/`cumsum` on CuArray first; hand-write only if the op or fusion pattern is not expressible (the classic justified case: custom associative scan for SSM/recurrence — see differentiating-kernels.md) |

GK0 can pass for these shapes:

- fused operations that broadcast cannot express, such as a data-dependent scan.
- stencils with real shared-memory reuse.
- custom sampling or argmin-with-payload logic.
- many small calls whose counted launches explain the time (`measuring.md` §11).

**COMPLEXITY-PRESERVING**: a table row passes GK0 only if its formulation keeps the GKB
algorithm's ops and bytes. Reject a primitive or broadcast that raises them:

| Formulation | Verdict |
|---|---|
| Pairwise `[n, n, …]` mask plus `maximum(dims=…)` where an O(n) scan answers the question | Fails GK0. Use `accumulate` with a custom associative op, or a scan kernel. |
| Any intermediate larger than inputs plus outputs, materialized by a broadcast | Fails GK0 unless GKB counted its bytes and the bound still holds. |
| One call per conceptual unit when outputs depend on fewer distinct tuples | Fails GKB. Deduplicate by tuple, then gather. |
| Materialize C candidate outputs, then mask all but K before an expensive write | Fails GKB if that stage's C-cost exceeds the budget. Apply §0b's selected-ID gather before the costly stage. |
| Named broadcast temporaries in a hot path | Fails fusion (`host-performance.md` §2). Write one dotted statement or one kernel. |
| `Int` (Int64) intermediates for values that fit in 8 or 16 bits | Fails GKB bytes. Use the narrowest exact type. |

For the last case in the list above, try CUDA Graph capture before hand fusion `[dated:2026-07]`. One measured
precedent used 60 launches per call at a 30.9 µs mean. A graph removed launches without kernel
rewrites. Graphs require stable shapes and preallocated addresses.

**CAPTURE-PINS-ADDRESSES**: a captured graph binds every closed-over device address. Cache it on
the `objectid` fingerprint of every such array. A missed array can replay a previous call's data
without an error. On any fingerprint mismatch, rebuild scratch buffers and recapture. Never replay
the old graph against new addresses. The acceptance pattern is `references/debugging.md` §11.

Write the GK0 comment naming the rejected row, then proceed to GK1.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/execution-design.md` | GKD work/span, parallel axes, deterministic updates, stage cost coverage and fusion tradeoffs | Before kernel implementation or a speed target |
| `references/writing-kernels.md` | GK1 device legality — the 5 compile-error classes with literal error strings + fixes; launch configuration (occupancy API, 1-based index formula, bounds guard, `cld`, warp-multiple block sizes, grid-stride loops, `shmem=`) | writing or first-compiling ANY kernel |
| `references/memory-and-warps.md` | Coalescing, shared-memory/barrier scope, registers, shuffle and atomics | During GKD layout/ownership design, then targeted tuning |
| `references/host-performance.md` | CuArray fusion, views, transfers, allocation, streams, and wide-type precision (`Float32`, `BFloat16`, literals, indices) | any CuArray performance work, even with no hand kernel |
| `references/reduced-precision-formats.md` | GK4 `PRECISION CONTRACT`: FP8/6/4, MXFP/NVFP4, scale/block, packed storage, target support, decode/compute, accumulator, validation ladder | any sub-16-bit storage, microscaling, or narrow Tensor Core decision |
| `references/measuring.md` | GK2 — `CUDA.@sync` timing law, `CUDA.@profile`/`@bprofile` (ProfileResults are NamedTuples, not DataFrames `[dated:2026-07]`), nsys→ncu order, `.nsys-rep` not `.qdrep`, roofline verdict for memory-vs-compute-bound, `ncu --query-metrics` before hardcoding metric names, NVTX ranges | BEFORE optimizing anything; before ANY perf claim |
| `references/debugging.md` | GK3 — `InvalidIRError` decode order, `@device_code_*` by compilation stage, `compute-sanitizer` (cuda-memcheck is GONE `[dated:2026-07]`), scalar-indexing triage, `@inbounds` only after the oracle passes, `sync_threads` divergence races, the CPU-reference oracle pattern, `CUDA.functional()` gating, cached/graph-capture path acceptance — state-separation test + permanent consistency assert (§11) | a kernel miscompiles, crashes, or returns wrong numbers |
| `references/portable-kernels.md` | KernelAbstractions 0.9.42 — `@kernel`/`@index`/`@localmem`/`@uniform`/`@synchronize` verified API, the `@uniform`-after-`@synchronize` trap, `unsafe_indices` + unguarded index footgun, ndrange idiom, KA-vs-raw-CUDA decision rule, pre-1.0 deprecations (`cpu=`, `KA.GPU`, conditional `@synchronize`) `[dated:2026-07]` | portability (CPU oracle / AMD future) is in play, or KA syntax questions |
| `references/differentiating-kernels.md` | GK3-AD routes, mutating AD paths and gradient oracles | This operation must participate in differentiation; package presence alone is insufficient |
| `references/api-changes.md` | CUDA.jl v6 split, changed signatures, target flags, fast features, vendor naming, and the KernelIntrinsics negative `[dated:2026-07]` | version confusion, deprecation, or source/docs conflict |

## Acceptance

Apply the gate artifacts above to the whole claimed path. The references give the detailed
compiler, launch, timing, oracle and precision procedures; this skill does not duplicate their checklists.
