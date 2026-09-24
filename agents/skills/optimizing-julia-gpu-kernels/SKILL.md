---
name: optimizing-julia-gpu-kernels
description: >-
  Optimizes CUDA.jl kernels and CuArray paths; GK0 rejects
  cuBLAS/cuFFT/cuDNN/broadcast/mapreduce work. MANDATORY before @cuda, KernelAbstractions @kernel,
  or Julia device storage/decode/performance edits. Use for GPU カーネル/最適化, occupancy,
  coalescing/shared memory/warps/atomics, InvalidIRError, profiling/roofline, tensor cores,
  reduced precision/低精度, FP8/6/4, MXFP/NVFP4, microscaling/マイクロスケーリング/ブロック浮動小数点,
  packed/パック済み storage, Microfloats/cuTile, GPU rrule, scan, or SSM/Mamba—only with a
  Julia/CUDA.jl/CuArray device path. Device LAW: isbits/type-stable, allocation-free, return
  nothing; speed claims need CUDA.@sync plus a CPU oracle; training kernels need an rrule. Cuts:
  host Julia → writing-julia; terminology/surveys/shopping/PyTorch-JAX → plain or
  systematizing-knowledge; behavior change → implementing-and-debugging first. Cheap benchmark →
  GK2; costly bet → acting-on-hypotheses. English skill; answer in the user's language.
---

# Optimizing Julia GPU kernels — CUDA.jl discipline

> **Version**: v2609.2.0 (2026-09-24) — GKB work budget precedes GK0; bottleneck claims need counts.
> **Scope**: CUDA.jl/KernelAbstractions kernels and CuArray/device paths; NVIDIA-first.
> **History and source grades**: `tests/forge-verification-ledger.md`.

```bash
for f in writing-kernels memory-and-warps host-performance reduced-precision-formats measuring debugging portable-kernels differentiating-kernels api-changes; do test -f "references/$f.md" || echo "MISSING references/$f.md"; done; test -f tests/trigger-set.md || echo "MISSING trigger-set"; test -f tests/forge-verification-ledger.md || echo "MISSING ledger"
```

Out of scope: driver installation, `nvidia-smi` plumbing, multi-GPU/distributed work, and CUDA C++.
AMDGPU implementation is deferred; the reduced-precision reference records only sourced target facts.

Before allocation, warmup, profiling, or a pilot, obtain P7 resource admission through
`agent-resource-run`. P7 owns capacity; this skill owns the admitted GPU work.

Fast-moving facts are tagged `[dated:YYYY-MM]`. Re-check a row after two quarters.
Re-check sooner when the target or toolchain differs.

## THE LAW

> Derive the work budget on paper first (GKB); code far from its bound is wrong, not slow.
> Reject unnecessary kernels through GK0. A justified kernel must be device-legal (GK1), measured
> synchronously (GK2), and checked against an oracle (GK3). Training paths also need an rrule
> (GK3-AD). Reduced precision needs a complete representation-to-execution contract (GK4).

## The gates — GKB, GK0–GK4, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **GKB WORK BUDGET** (§0) | Before code, a target, or a dispatch: count ops and bytes per output unit for the lowest-complexity algorithm; derive the device bound. | A `WORK BUDGET` block in the source or ticket, plus a test asserting device time ≤ a stated multiple of the bound. |
| **GK0 SHOULD-THIS-KERNEL-EXIST** (§1) | Match the dispatch table before any `@cuda` or `@kernel`; a matching primitive stops the hand kernel. | One source comment names the checked and rejected alternative. |
| **GK1 DEVICE LEGALITY** (`writing-kernels.md`) | Use isbits arguments, no GC allocation, `return nothing`, specialized helpers, and no boxed captures. | Kernel compiles; `@device_code_warntype` is clean on hot paths. |
| **GK2 MEASUREMENT** (`measuring.md`) | After P7, warm once and time under `CUDA.@sync`; profiles decide the limiting regime. | Runner verdict plus profile and the metric used by the claim. |
| **GK3 CORRECTNESS ORACLE** (`debugging.md`) | Compare the whole GPU result to the same-algorithm reference; check shared-state races. | `Pkg.test()` comparison; sanitizer where needed; cached paths pass §11. |
| **GK3-AD DIFFERENTIABILITY** (`differentiating-kernels.md`) | A training-path kernel or mutating op needs an rrule/Enzyme route and gradient test. | `rrule` plus `test_rrule`, or the documented alternative. |
| **GK4 PRECISION CONTRACT** (`reduced-precision-formats.md`) | Separate payload, scale/block, storage, policy, decode, target compute, accumulator, and outcomes. | Completed `PRECISION CONTRACT`; every claimed rung has its own oracle. |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `writing-julia` | DECISIVE: does code run on or manage the device? Device storage, decode, kernels, profiling → HERE. Host types, packages, AD frontend, CPU → there. Co-fire in that order; JG0 methodology remains active and JG2 precedes GK1. |
| `implementing-and-debugging` | Co-fire first for behavior change or bugfix. It owns change safety; this skill owns device legality and GPU evidence. |
| `refactoring-code` | Co-fire for behavior-preserving restructuring. It owns the oracle bracket; GK2/GK3 supply GPU checks. |
| `raising-resolution` | Inspect `CUDA.functional()`, `CUDA.versioninfo()`, `Pkg.status`, and a profile before a present-state claim. |
| `acting-on-hypotheses` | Cheap reversible benchmarks stay in GK2. Use AOH only when costly downstream exposure depends on one untested result. |
| `prompting-llms` / `driving-*` | Not adjacent — no overlap; listed only because Workflow-native fan-out language sounds similar. Fleet mechanics live in the harness, not here. |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| CUDA **C++** kernel questions, no Julia in play | plain answer / web — this skill is CUDA.jl-specific |
| "nvidia-smi not found" / driver install / WSL GPU passthrough | environment plumbing — shell/dotfiles work, not kernel craft |
| PyTorch/JAX GPU performance | not Julia — plain answer |
| Julia CPU performance, no GPU in play | `writing-julia` alone |
| "which GPU should I buy" / hardware shopping | plain answer |
| Flux/Lux model architecture choice (layers, optimizer) with stock layers | `writing-julia` (packages.md) — this skill enters only when a CUSTOM kernel/op appears on the path |
| reduced-precision terminology with no Julia/device decision | plain answer; no specialist procedure needed |
| literature survey of FP4/MX/adaptive formats | `systematizing-knowledge`, then distill only if a device rule is requested |

The full near-miss set is `tests/trigger-set.md` — desk-check it after any description edit.

---

## §0 GKB — the work budget (before GK0, before any target number)

Write this block before choosing primitives, setting a speed target, or dispatching a GPU ticket.

| Field | Content |
|---|---|
| Output unit | What one unit of useful work is: a token, a row, a cell. |
| Dependency factoring | For each output, list the inputs it actually depends on. Compute once per distinct dependency tuple, not once per conceptual unit. Record the distinct-tuple count. |
| Algorithm | The lowest-complexity formulation, e.g. an O(n) causal scan with a last-occurrence table, not an O(n²) pairwise mask. |
| Ops / unit | Integer or FLOP count per output unit for that algorithm. |
| Bytes / unit | Global-memory reads plus writes per output unit at the narrowest exact element type. |
| Device bound | max(ops ÷ peak ops/s, bytes ÷ peak B/s), per unit and per batch. Peaks come from the device (`measuring.md` §8). |
| Gate | A test asserting measured device time per batch ≤ k × bound. State k; add launch cost as launches × measured µs per launch. |

| If… | Then |
|---|---|
| A speed target is written without this block | Reject the target; derive the block first. |
| A target is a multiple of the previous implementation | Replace it with a fraction of the bound. |
| Measured time is more than 10× the bound | The implementation is not accepted; find the stage furthest from its own bound before any other work. |
| A reference model is to be benchmarked | Derive its bound the same way first; measure only if the two bounds do not already answer the question. |
| A shared-library function is published on a device path | Its docstring states ops and bytes per unit, and its tests include the budget assertion. |

## §1 GK0 — the deny-gate dispatch table (read FIRST)

Vendor primitives avoid the most expensive unnecessary kernel work. cuBLAS GEMM is tuned per
architecture. `mapreduce` on CuArray is already shuffle-optimized. Before any `@cuda`, walk this
table. If a row matches, use it and stop.

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
| `references/writing-kernels.md` | GK1 device legality — the 5 compile-error classes with literal error strings + fixes; launch configuration (occupancy API, 1-based index formula, bounds guard, `cld`, warp-multiple block sizes, grid-stride loops, `shmem=`) | writing or first-compiling ANY kernel |
| `references/memory-and-warps.md` | the optimization ladder — coalescing under Julia's COLUMN-MAJOR layout (threadIdx().x → FIRST dimension; C tutorials transposed), shared memory + `sync_threads` discipline, bank-conflict padding, register pressure (Int32 indices, `maxregs`), warp shuffle reductions, atomics contention + nondeterminism, divergence | a kernel compiles + oracle passes, and now must get FAST |
| `references/host-performance.md` | CuArray fusion, views, transfers, allocation, streams, and wide-type precision (`Float32`, `BFloat16`, literals, indices) | any CuArray performance work, even with no hand kernel |
| `references/reduced-precision-formats.md` | GK4 `PRECISION CONTRACT`: FP8/6/4, MXFP/NVFP4, scale/block, packed storage, target support, decode/compute, accumulator, validation ladder | any sub-16-bit storage, microscaling, or narrow Tensor Core decision |
| `references/measuring.md` | GK2 — `CUDA.@sync` timing law, `CUDA.@profile`/`@bprofile` (ProfileResults are NamedTuples, not DataFrames `[dated:2026-07]`), nsys→ncu order, `.nsys-rep` not `.qdrep`, roofline verdict for memory-vs-compute-bound, `ncu --query-metrics` before hardcoding metric names, NVTX ranges | BEFORE optimizing anything; before ANY perf claim |
| `references/debugging.md` | GK3 — `InvalidIRError` decode order, `@device_code_*` by compilation stage, `compute-sanitizer` (cuda-memcheck is GONE `[dated:2026-07]`), scalar-indexing triage, `@inbounds` only after the oracle passes, `sync_threads` divergence races, the CPU-reference oracle pattern, `CUDA.functional()` gating, cached/graph-capture path acceptance — state-separation test + permanent consistency assert (§11) | a kernel miscompiles, crashes, or returns wrong numbers |
| `references/portable-kernels.md` | KernelAbstractions 0.9.42 — `@kernel`/`@index`/`@localmem`/`@uniform`/`@synchronize` verified API, the `@uniform`-after-`@synchronize` trap, `unsafe_indices` + unguarded index footgun, ndrange idiom, KA-vs-raw-CUDA decision rule, pre-1.0 deprecations (`cpu=`, `KA.GPU`, conditional `@synchronize`) `[dated:2026-07]` | portability (CPU oracle / AMD future) is in play, or KA syntax questions |
| `references/differentiating-kernels.md` | GK3-AD — why Zygote breaks on kernels/mutation, `ChainRulesCore.rrule` for a kernel-backed op (complete example), Enzyme device-side AD state, differentiable scan / SSM route, `test_rrule` + FD-vs-CPU gradient checks | the kernel sits on a training path (Flux/Lux/Zygote/Enzyme anywhere in the project) |
| `references/api-changes.md` | CUDA.jl v6 split, changed signatures, target flags, fast features, vendor naming, and the KernelIntrinsics negative `[dated:2026-07]` | version confusion, deprecation, or source/docs conflict |

## §9 Checklist — run before claiming a kernel is done

- [ ] GKB `WORK BUDGET` block exists; the budget test (device time ≤ k × bound) passes.
- [ ] Every bottleneck claim names its counted quantity (`references/measuring.md` §11).
- [ ] GK0 comment names the checked and rejected vendor/broadcast alternative.
- [ ] Kernel ends in `return nothing`; arguments are isbits; no allocation occurs inside.
- [ ] Index formula is 1-based; bounds guard precedes access; block count uses `cld`.
- [ ] `CUDA.allowscalar(false)` is active; logs contain no scalar-indexing warnings.
- [ ] Device code has no bare Float64 literals; hot index arithmetic uses Int32.
- [ ] Reduced precision: `PRECISION CONTRACT` is complete; storage, target, compute, and outcome
      claims each have their own oracle (`references/reduced-precision-formats.md`).
- [ ] CPU-reference test compares the whole `Array(result)` and runs in `Pkg.test()`.
- [ ] `compute-sanitizer` is clean if shared memory or atomics are used.
- [ ] Timing uses `CUDA.@sync` after warmup; every performance claim cites a profile.
- [ ] Training paths define an `rrule` and pass a gradient test (GK3-AD).
- [ ] `@inbounds` appears only after the oracle passes.
- [ ] Cached/graph-capture path: cache key fingerprints EVERY closed-over device array
      (CAPTURE-PINS-ADDRESSES, §1) — a state-separation test AND a permanent in-body
      consistency assert both pass (`references/debugging.md` §11).
- [ ] A GPU-path change gets a real GPU parity run; CPU-only green does not clear it.
- [ ] Device-specific methods dispatch on `CUDA.AnyCuArray`, not `CuArray`; a `@view` or reshape of
      a `CuArray` otherwise falls to the CPU method. Tests cover a partial (tail) batch as well.
- [ ] Graph-captured path: `CUDA.@allocated(step(...)) == 0` is asserted before capture. One
      leftover allocation (a range slice `a[i:i]` instead of `@view`, a cuBLAS wrapper's per-call
      `CuRef`, a reduction to a scalar) records an unfreed alloc node, and launch then fails
      depending on pool state. Find it by bisecting unbroken prefixes, not per-function calls.
