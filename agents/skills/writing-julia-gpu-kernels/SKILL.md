---
name: writing-julia-gpu-kernels
description: >-
  For Julia GPU paths, pick the highest stage that keeps semantics and the work budget — library
  primitive or fused broadcast → cuTile.jl tile kernel → KernelAbstractions.jl (portability) or
  CUDA.jl thread kernel (work no tile expresses) — stay inside that stage's compiler model and lower
  only the part that falls outside; a hand kernel carries an oracle, an rrule if differentiated,
  synchronized timing and a pinned version. MANDATORY before @cuda, cuTile/KernelAbstractions
  kernels, or Julia device storage/decode/performance edits, and for GPU-first model/learner step
  performance (host round-trips, Array() pulls). Use for GPU カーネル/最適化, occupancy,
  coalescing/shared memory/warps/atomics, InvalidIRError, Tile IR rejections, profiling/roofline,
  tensor cores, reduced precision/低精度, FP8/6/4, MXFP/NVFP4, packed storage, GPU rrule, scan,
  or SSM/Mamba—only with a Julia/CUDA.jl/CuArray device path. Cuts: host Julia → writing-julia;
  terminology/surveys/PyTorch-JAX → plain or systematizing-knowledge; behavior change → repository
  instructions and the relevant owner. Cheap benchmark → GK2; costly bet → acting-on-hypotheses.
  English skill; answer in the user's language.
---

# Choose the highest stage, then stay inside its compiler model

> 1. **Highest stage that keeps semantics and budget.** Library primitive or one fused broadcast →
>    cuTile.jl tile kernel (NVIDIA CC 8.0+, dense tile-shaped work) → KernelAbstractions.jl when
>    portability is required → CUDA.jl thread kernel for work no tile expresses (per-thread irregular
>    control, warp intrinsics, generation-specific features, CC < 8.0). Name the reason for each step down.
> 2. **Stay inside the chosen stage's compiler model.** When one part is rejected or inexpressible,
>    lower only that part; do not lower the whole path.
> 3. **A hand kernel carries its obligations:** an oracle against a reference (GK3), a backward rule
>    when differentiated (GK3-AD), synchronized measurement (GK2) and a pinned package version or commit.
>
> Then bind the path and budget (GKB), map dependencies onto execution (GKD), reject unnecessary
> kernels (GK0) and meet GK1–GK4 below.

## Negative space — what each stage rejects or punishes

| # | Do not | Instead | Home |
|---|---|---|---|
| 3 | Put loops, tuples, multi-output or non-inlinable helpers in a cuTile element function | Scalar, side-effect-free element functions; carry state across a counted `for` loop as one tile per value, never fully unrolled | cuTile.jl model |
| 3a | Widen a narrow integer tile with a literal (`t .+ 0x0100`) | The literal converts to the tile's type; `convert(Tile{UInt16}, t)` first | cuTile.jl model |
| 9 | Depend on an unreleased branch without a pinned commit | Pin the commit; record when a release can replace it | cuTile.jl model |
| 1 | Hand-write what a library call or fused broadcast already does | The GK0 row | GK0 |
| 2 | Write dense tile-shaped work thread by thread on CC 8.0+ | A cuTile.jl tile kernel | Principle 1 |
| 4 | Send a hand kernel through AD without a backward | rrule/Enzyme rule plus gradient oracle | GK3-AD |
| 5 | Kernelize without a reference result | Keep the array version as the oracle | GK3 |
| 6 | Kernelize before measuring, or time compilation with execution | Profile first; warm up, then synchronized timing | GKB, GK2 |
| 7 | Read or write CuArray elements one by one from the host | Device broadcast, gather or kernel | §0b |
| 8 | Write CUDA.jl-only code where portability is required | KernelAbstractions.jl | `portable-kernels.md` |

## cuTile.jl model (main commit c55543dc, 56 commits after v1.0.0; checked 2026-11-10)

Facts below cite [`B`] = `https://github.com/JuliaGPU/cuTile.jl/blob/c55543dca19a4bf5f715a9ea5aef7a3cb032c5fe`.
Re-check them when the commit changes.

- **Version `[dated:2026-11]`.** Registered v1.0.0 pins `CUDA_Compiler_jll = "0.5"` and
  `CompilerCaching = "0.3.1 - 0.4"`; main allows `"0.5, 0.6"` and `"0.5"`. Pairing main with CUDA.jl
  waits for a GPUCompiler release containing JuliaGPU/GPUCompiler.jl#922 (cuTile.jl PR #310).
- **Launch.** Importing CUDA.jl is required; it supplies `CuArray`, compiler artifacts and the stream
  (B/docs/src/man/execution.md#L37-L42). CUDA.jl is absent from deps, weakdeps and extensions
  (B/Project.toml#L11-L33). `CuArray{T,N}` converts to a mutable `ct.TileArray`
  (B/docs/src/man/execution.md#L104-L119); no read-only array, `Const` wrapper or read-only view was found.
- **Requirements.** Julia 1.11+, driver 580 (CUDA 13), CC 8.0+; features also depend on the Tile IR
  bytecode version (B/docs/src/man/compatibility.md#L1-L46).
- **Element functions.** A scalar function broadcast or mapped over a tile runs once for the whole
  tile; per-element branches compute both arms, so arms must be side-effect free
  (B/docs/src/man/julia_differences.md#L19-L21). Functions with source are force-inlined
  (B/src/compiler/interpreter.jl#L270-L285); a call left without a Tile IR intrinsic fails with
  `Unsupported function call during Tile IR compilation: … has no Tile IR equivalent`
  (B/src/compiler/codegen/expressions.jl#L189-L203).
- **Types.** A value without a Tile IR type fails with `Unsupported Julia type for Tile IR`
  (B/test/codegen/operations.jl#L1363-L1367). The docs recommend no form for tile tuples carried
  through loops, multi-output element functions, `@generated`/`ntuple` helpers or dynamic tuple
  indexing; treat them as unverified. Measured precedent `[dated:2026-11]` (RTX 3060 sm_86, main
  c55543dc, tile 128): fully unrolled limb arithmetic compiled in 1–8 s for small cases, but a 16-step
  2-limb division ran past 600 s and a 16-table kernel past 25 min; the same division as a counted
  `for i in Int32(1):Int32(8N)` loop carrying one tile per limb compiled in 3–7 s and matched a host
  oracle. Bitwise `.~` on an integer tile is rejected (`not_int … has no Tile IR equivalent`); use
  `xor.(u, typemax(T))`.
- **Integers and scalars.** Listed integers are Int8/UInt8–Int64/UInt64 with no operation-by-type
  matrix (B/docs/src/man/element_types.md#L5-L8). A broadcast scalar converts to the first
  same-category tile element type, so a literal never widens a narrow tile
  (B/src/language/broadcast.jl#L69-L71); widen with `convert(Tile{T}, t)` first. FP8/FP4 have no
  general arithmetic; `ct.muladd_scaled` needs sm_100+ (B/docs/src/man/element_types.md#L25-L35).
- **Indexing and boundaries.** Partial-tile loads fill by `padding_mode` (default Undetermined),
  stores drop out-of-bounds elements, and a tile wholly outside is undefined
  (B/src/language/operations.jl#L635-L646, #L944-L951). Scalar load `arr[i]` exists (#L769-L777);
  scalar store is unconfirmed. `ct.arange` defaults to `Int32` (#L1141-L1153). Gather/scatter views
  take rank 2+ with one 1-D integer tile index; scalar indices are rejected (#L43-L62). v1.0.0 adds
  view-based atomics and `ct.@atomic`, so scatter or a documented atomic reduction alone is not a
  reason to drop to threads.
- **Specialization and AD.** Tile shapes are compile-time values; new constants or argument types
  compile a new kernel (B/docs/src/man/execution.md#L125-L176). No automatic-differentiation
  guarantee was found (urn:uuid:01a1bf08-e39f-74e6-97c5-9d030c426b63); pair a backward rule (GK3-AD).

## Scope

> **Version**: v2611.1.0 (2026-11-10) — principles and negative space first; cuTile.jl model at main
> c55543dc. Earlier history: v2610.2.0 launch shape typed, in-loop transfer budget 0, typed stage outcome.
> **Scope**: cuTile.jl, KernelAbstractions.jl and CUDA.jl kernels and CuArray device paths; NVIDIA-first.

```bash
test -f references/execution-design.md || exit 1
for f in writing-kernels memory-and-warps host-performance reduced-precision-formats measuring debugging portable-kernels differentiating-kernels api-changes; do test -f "references/$f.md" || echo "MISSING references/$f.md"; done
```

Out of scope: driver installation, `nvidia-smi` plumbing, multi-GPU/distributed work, and CUDA C++.
AMDGPU implementation is deferred; the reduced-precision reference records only sourced target facts.

Before allocation, warmup, profiling, or a pilot, obtain P7 resource admission through
`agent-resource-run`. P7 owns capacity; this skill owns the admitted GPU work.
Inside a BIBIFI loop, use its short experiment cap for GPU tests and profiling as well as benchmarks.
A microticket may use a targeted oracle under its cap; it does not waive required GK3 acceptance tests.
Schedule any broader release tests with explicit coverage and a separate finite budget, not an unbounded suite.
Fast-moving facts are tagged `[dated:YYYY-MM]`; re-check a row after two quarters or on a toolchain change.

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
| **GK1 DEVICE LEGALITY** (`writing-kernels.md`; cuTile.jl model above) | Use isbits arguments, no GC allocation, `return nothing`, specialized helpers, and no boxed captures; for cuTile.jl, element functions and values that lower to Tile IR. | Kernel compiles; `@device_code_warntype` is clean on hot paths; a cuTile.jl kernel compiles without a Tile IR rejection. |
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
