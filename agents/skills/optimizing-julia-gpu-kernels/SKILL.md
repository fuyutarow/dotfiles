---
name: optimizing-julia-gpu-kernels
description: >-
  Designs and optimizes parallel CUDA.jl kernels and CuArray paths; prefers suitable library primitives.
  MANDATORY before @cuda, KernelAbstractions @kernel,
  or Julia device storage/decode/performance edits, and for GPU-first model/learner step performance
  (host round-trips, Array() pulls, GPU first). Use for GPU カーネル/最適化, occupancy,
  coalescing/shared memory/warps/atomics, InvalidIRError, profiling/roofline, tensor cores,
  reduced precision/低精度, FP8/6/4, MXFP/NVFP4, microscaling/マイクロスケーリング/ブロック浮動小数点,
  packed/パック済み storage, Microfloats/cuTile, GPU rrule, scan, or SSM/Mamba—only with a
  Julia/CUDA.jl/CuArray device path. Cuts:
  host Julia → writing-julia; terminology/surveys/shopping/PyTorch-JAX → plain or
  systematizing-knowledge; behavior change → implementing-and-debugging first. Cheap benchmark →
  GK2; costly bet → acting-on-hypotheses. English skill; answer in the user's language.
---

# Optimizing Julia GPU kernels — CUDA.jl discipline

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
| `implementing-and-debugging` | Co-fire first for behavior change or bugfix. It owns change safety; this skill owns device legality and GPU evidence. |
| `refactoring-code` | Co-fire for behavior-preserving restructuring. It owns the oracle bracket; GK2/GK3 supply GPU checks. |
| `raising-resolution` | Inspect `CUDA.functional()`, `CUDA.versioninfo()`, `Pkg.status`, and a profile before a present-state claim. |
| `acting-on-hypotheses` | Cheap reversible benchmarks stay in GK2. Use AOH only when costly downstream exposure depends on one untested result. |
| `orchestrating-agents` | P7 selects and admits device resources. P7 placement alone does not trigger GKR; a model-step GPU performance objective does, even without an explicit residency declaration. |
| `validating-experimental-evidence` | EV2 owns update-order equivalence; EV3 owns throughput units and comparison footing. Consume those contracts before interpreting a faster kernel or batch. |
| `driving-bibifi-cycles` | Chooses the next bounded experiment and allocates useful work; HERE specifies GPU design, timing and oracle obligations for that slice. |
| `prompting-llms` / `driving-*` | Not adjacent — no overlap; listed only because Fan-out fan-out language sounds similar. Fleet mechanics live in the harness, not here. |

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

## §2 The device-compiler contract (the 5 errors you will actually see)

The CPU intuition "type instability makes it slow" becomes "it does not compile" on the GPU.
The five classes, each with its literal error string, live in `references/writing-kernels.md`
— headline forms:

1. **Missing `return nothing`** → `KernelError: kernel returns a value of type Float32`.
2. **Type instability / unresolvable dispatch** → `InvalidIRError … unsupported dynamic
   function invocation`. Read multi-`Reason:` errors BOTTOM-UP — the last one is the cause,
   earlier ones are symptoms.
3. **Non-isbits argument** → `KernelError: passing non-bitstype argument` — a struct holding
   a CuArray needs `Adapt.@adapt_structure`.
4. **GC allocation in kernel** → `InvalidIRError … unsupported call to the Julia runtime`.
   Preallocate outside; use `SVector`/`MVector` only for small fixed scratch.
5. **Boxed capture** → a dynamic-invocation error may hide the non-`const` global.
   Use a `let`-bound capture or typed callable struct.

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

## §9 Checklist — run before claiming a kernel is done

- [ ] GKB binds the complete claimed path; the predeclared measured criterion passes or its miss is explicit.
- [ ] GKD maps independent work and serial span; unexplained one-thread bulk work remains a performance defect.
- [ ] GPU-performance step: `STAGE MAP` names the hot-path boundary. Each data stage and output inside it is
      device-resident. Its warmed trace has zero HtoD/DtoH copies inside that boundary (GKR).
- [ ] Every launch declares `Parallel(ndrange)` or `Serial(work_bound)`; in-loop `Serial` bounds and measured times pass the budget test.
- [ ] In-loop host transfers: declared count ≤ budget (default 0), flags read one check late; skipped stages report a typed outcome.
- [ ] A selected K-of-C stage materializes and writes K outputs, or its C-cost is charged and passes GKB.
- [ ] Every bottleneck claim names its counted quantity (`references/measuring.md` §11).
- [ ] GK0 comment names the checked and rejected vendor/broadcast alternative.
- [ ] Kernel ends in `return nothing`; arguments are isbits; no allocation occurs inside.
- [ ] Index formula is 1-based; bounds guard precedes access; block count uses `cld`.
- [ ] `CUDA.allowscalar(false)` is active; logs contain no scalar-indexing warnings.
- [ ] Device code has no bare Float64 literals; hot index arithmetic uses Int32.
- [ ] Reduced precision: `PRECISION CONTRACT` is complete. Storage, target, compute, and outcome
      claims each have their own oracle (`references/reduced-precision-formats.md`).
- [ ] The oracle covers required output/state, repeated updates, ties, resets and relevant tail batches.
- [ ] `compute-sanitizer` is clean if shared memory or atomics are used.
- [ ] Timing uses `CUDA.@sync` after warmup; every performance claim cites a profile.
- [ ] Derivative paths pass GK3-AD. Non-gradient learning passes its update-state oracle.
- [ ] `@inbounds` appears only after the oracle passes.
- [ ] Cached/graph-capture path: cache key fingerprints EVERY closed-over device array
      (CAPTURE-PINS-ADDRESSES, §1). The state-separation test and permanent in-body
      consistency assert both pass (`references/debugging.md` §11).
- [ ] A GPU-path change gets a real GPU parity run; CPU-only green does not clear it.
- [ ] Device-specific methods dispatch on `CUDA.AnyCuArray`, not `CuArray`; a `@view` or reshape of
      a `CuArray` otherwise falls to the CPU method. Tests cover a partial (tail) batch as well.
- [ ] Graph-captured path: `CUDA.@allocated(step(...)) == 0` is asserted before capture.
      One leftover allocation can record an unfreed alloc node and make launch fail.
      Check range slices, cuBLAS `CuRef` creation, and scalar reductions.
      Find the allocation by bisecting unbroken prefixes, not per-function calls.
