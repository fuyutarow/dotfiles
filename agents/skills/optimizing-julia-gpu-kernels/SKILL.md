---
name: optimizing-julia-gpu-kernels
description: >-
  Writes and optimizes CUDA.jl GPU kernels, including when NOT to write one: GK0 compares vendor
  cuBLAS/cuFFT/cuDNN, fused broadcast, and mapreduce first. MANDATORY before editing @cuda,
  KernelAbstractions @kernel, or hot CuArray code. Use for GPU カーネル/最適化, launch geometry,
  occupancy, coalescing, shared memory, bank conflicts, divergence/shuffle, atomics,
  InvalidIRError, scalar indexing, profiling, roofline, tensor cores, GPU rrule, differentiable
  scan, or SSM/Mamba. Device LAW: type instability is a compile error; use isbits args, no GC
  allocation, return nothing, and make no performance claim without CUDA.@sync measurement plus a
  CPU-reference oracle. Training kernels need an rrule. Cuts: host Julia architecture →
  writing-julia; CUDA C++ → plain answer; behavior edits → implementing-and-debugging first. Cheap
  benchmarks use GK2/domain executor; AOH only for costly downstream exposure. English skill;
  answer in the user's language.
---

# Optimizing Julia GPU kernels — CUDA.jl discipline

> **Version**: v2608.1.0 (2026-08-03 — pre-warmup CPU/RAM/VRAM admission and bounded streams;
> prior v2607.2.0 added CAPTURE-PINS-ADDRESSES from the firedancer
> fd_evaluate graph-cache postmortem, 検収4: a captured CUDA graph + scratch buffer was
> cached keyed on the primary input's identity alone, while capture had pinned the addresses
> of EVERY closed-over device array; a fresh per-cell state array reusing the cached graph
> silently replayed a PREVIOUS cell's data (5 of 6 cells locked to cell 1's weights). The
> passing smoke test did not catch it — a third-party audit diffing saved artifacts did.
> Added §1's CAPTURE-PINS-ADDRESSES law, debugging.md §11's state-separation + permanent
> consistency-assert acceptance pattern, and a pre-merge GPU-parity checklist line.
> **F3 waiver**: this reforge shipped editor-solo, no verification fleet — a 3-rule procedural
> addition on top of an already-forged skill, under the small-procedural-skill waiver in
> `forging-skills` references/verifying.md §7. Audit trail:
> `tests/forge-verification-ledger.md`'s "Reforge v2607.2.0" entry.)
> (prior: v2607.1.1, 2026-07-23 — +latency-bound regime patch from the firedancer
> throughput postmortem: the GK0 GEMM row's un-caveated `mul!` advice reintroduced a known
> per-call `CuRef(α,β)` alloc+H2D overhead (profile-verified 3× at batch 128), and the skill
> had ZERO coverage of CUDA Graph capture — the decisive tool for launch-overhead-bound
> pipelines. GK2's profile discipline caught the regression in-task, which is how both gaps
> were found; v2607.1.0, 2026-07-22, CUDA.jl v6.2.1 / KernelAbstractions 0.9.42 / Julia 1.12
> baseline `[dated:2026-07]`)
> **Scope**: writing, optimizing, differentiating, and verifying GPU kernels in Julia with
> CUDA.jl and KernelAbstractions — plus the host-side CuArray discipline that dominates real
> performance. Host-agnostic; NVIDIA-first (AMDGPU/Metal deliberately deferred — the KA layer
> is the portability story, `references/portable-kernels.md`).
> **Out of scope**: driver/toolkit installation and `nvidia-smi` PATH plumbing (environment
> work, not kernel craft); multi-GPU / distributed (deferred until real demand); CUDA C++
> with no Julia in play.
> **Resource seam**: before allocation, warmup, profile, or pilot, read sibling
> `orchestrating-agents/references/measurement-and-resources.md` P7 and obtain an admitted
> host-RAM/VRAM/process/walltime envelope through `agent-resource-run`. P7 owns capacity and
> GPU-first placement; this skill owns what runs efficiently after admission.
> **Provenance**: forged 2026-07-22 from a 10-surface fan-out harvest (102 rules surviving an
> operationality filter) + a source-diffed CUDA.jl v5.11.3→v6.2.1 API verification + an
> AD-interaction study, each verified against the installed source under
> `~/.julia/packages/{CUDA,CUDACore,CUDATools,KernelAbstractions}/`. Error strings quoted in
> references were read from GPUCompiler.jl/CUDACore source, not from memory.
> **Staleness registry**: fast-moving facts are tagged `[dated:YYYY-MM]` in place. Before
> trusting one, `grep -rn '\[dated:' agents/skills/optimizing-julia-gpu-kernels/` and
> re-verify anything older than ~2 quarters: CUDA.jl major version + the CUDACore/CUDATools
> split (here, api-changes.md) · KernelAbstractions 0.9.x pre-1.0 deprecations
> (portable-kernels.md) · Nsight file formats and metric names (measuring.md).

## THE LAW

> The fastest kernel is the one you never write: vendor dispatch, broadcast fusion, and
> `mapreduce` on CuArray are tuned beyond what a hand kernel will reach (GK0). When a kernel
> IS justified, the device compiler is stricter than the CPU — type instability is a compile
> error, not a slowdown (GK1); the memory hierarchy dominates the arithmetic (coalesce before
> you tune); and no speed claim exists without a synchronized measurement (GK2) over a
> correctness oracle (GK3). A kernel that trains a model must also be differentiable — a
> hand kernel SILENTLY breaks Zygote unless it carries an rrule (GK3-AD).

## The gates — GK0–GK4, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **GK0 SHOULD-THIS-KERNEL-EXIST** (deny-gate, §1) | Before ANY `@cuda`/`@kernel`: check the dispatch table (§1). GEMM/factorization/FFT/sparse/conv/reduction/elementwise → vendor lib or broadcast/`mapreduce`, NEVER hand-written | a **one-line comment above the kernel** naming the checked-and-rejected alternative (`# no vendor primitive: associative scan over custom op`) — no comment = violation |
| **GK1 DEVICE LEGALITY** (writing-kernels.md) | isbits args (Adapt for structs), no GC allocation, `return nothing`, forced specialization of inner helpers, no boxed captures | kernel compiles; on failure read `InvalidIRError` **bottom-up** (last `Reason:` first); `@device_code_warntype interactive=true` clean on must-be-fast kernels |
| **GK2 MEASUREMENT** (measuring.md) | After P7 admission, no perf claim without `CUDA.@sync`-wrapped timing after one warm-up run; memory-bound vs compute-bound decided by profile, never eyeballed | P7 runner verdict plus `CUDA.@profile` / `CUDA.@bprofile` output; for kernel-level tuning an `ncu` roofline or achieved-bandwidth number |
| **GK3 CORRECTNESS ORACLE** (debugging.md) | Every kernel has a same-algorithm CPU reference compared over the WHOLE `Array(gpu)` result; races checked when threads share memory | the comparison test exists and runs in `Pkg.test()`; `compute-sanitizer` run when shared memory/atomics are involved; KA kernels use the `CPU()` backend as oracle; a cached/graph-capture path additionally passes debugging.md §11's state-separation test + carries a permanent in-body consistency assert |
| **GK3-AD DIFFERENTIABILITY** (differentiating-kernels.md) | A kernel (or mutating CuArray op) on a training path needs an explicit `rrule` (or Enzyme route) + a gradient test — Zygote will NOT differentiate through it | `ChainRulesCore.rrule` defined; `test_rrule` (or FD check vs CPU) green |
| **GK4 PRECISION** (host-performance.md §12) | Float32 default on GPU; no bare Float64 literal (`2.0`, `1/3`, `pi`) touching Float32 data; Int32 index literals in hot kernels | `grep -nE '[^f0-9]([0-9]+\.[0-9]+)[^f0-9]' kernel_src.jl` finds no unsuffixed literal in device code; promotions absent from `@device_code_warntype` |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `writing-julia` | DECISIVE cut — **does the code run on (or manage) the device?** Device kernels, CuArray semantics, launch config, GPU profiling → HERE. Host-side type stability, package architecture, AD frontend choice, CPU perf → there. **Co-fire with ORDER on any GPU-in-Julia task**: its JG2 (type discipline) is this skill's precondition — instability that is merely slow on CPU is a COMPILE ERROR in a kernel (GK1). Its §2.0 methodology gate (no FD derivatives, no grid sampling) applies unchanged to GPU numerics. |
| `implementing-and-debugging` | Co-fire with ORDER, same as writing-julia's row: change-safety (intent reconstruction, edit-surface scoping, root-cause vs symptom) governs any non-trivial kernel feature/bugfix FIRST; this skill owns what a correct fast kernel looks like inside that frame. |
| `refactoring-code` | Co-fire on behavior-preserving kernel restructuring: its two-hats/oracle discipline governs; this skill supplies the GPU oracle components (GK3 CPU-reference test + `CUDA.@sync` benchmark as the green bracket). |
| `raising-resolution` | Silent sub-step: inspect before asserting — `CUDA.functional()`, `CUDA.versioninfo()`, `Pkg.status`, an actual profile. Never claim "memory-bound" or "the kernel is the bottleneck" from reading source alone (GK2 is this discipline made mandatory). |
| `acting-on-hypotheses` | PURPOSE + HARD-GATE cut: benchmark “will a custom kernel beat cuBLAS HERE?” through this skill's GK2/domain executor when it is cheap and reversible. Use AOH only when expensive/irreversible downstream work rides on the result; GK2 remains its measurement harness. |
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

The full near-miss set is `tests/trigger-set.md` — desk-check it after any description edit.

---

## §1 GK0 — the deny-gate dispatch table (read FIRST)

Hand-writing a kernel that a vendor library already implements is the single most expensive
mistake in this territory — cuBLAS GEMM is tuned per-architecture beyond what a tiling
tutorial kernel reaches, and `mapreduce` on CuArray is already shuffle-optimized. **Before
any `@cuda`, walk this table; if a row matches, use the row and stop.**

| Shape of the computation | Use — NOT a hand kernel |
|---|---|
| Dense matmul / GEMM (any precision incl. Float16) | `A * B`, `mul!(C, A, B)` → cuBLAS; tensor cores via `CUDA.math_mode!(CUDA.FAST_MATH; precision=:TensorFloat32)` `[dated:2026-07]`. **Hot-loop caveat `[dated:2026-07]`**: CUDA.jl's `mul!` allocates + uploads `CuRef(α,β)` on EVERY call — in a small-GEMM hot loop this dominates (profile: 2 allocs+H2D per GEMM; fixing it gave 3× at batch 128). Keep persistent `CuRef`s and call the cuBLAS `gemm!` wrapper with them |
| Linear solve / factorization (`\`, `qr`, `svd`, `eigen`, `lu`) | LinearAlgebra verbs on CuArray → cuSOLVER |
| FFT | `fft`/`ifft`/`plan_fft` (AbstractFFTs) → cuFFT |
| Sparse ops on `CuSparseMatrixCSC/CSR` | `*`, `mul!`, `\` → cuSPARSE |
| Convolution / pooling (NN) | load cuDNN (it is NOT in CUDA.jl's deps `[dated:2026-07]`); Flux/Lux dispatch to it |
| Reduction (sum/max/any/custom op) | `mapreduce`/`reduce`/`sum` on CuArray — already warp-optimized |
| Elementwise pipeline | one fused dot-broadcast `y .= f.(a) .+ g.(b)` — the broadcast compiler writes the kernel |
| Prefix scan / cumulative op | `accumulate`/`cumsum` on CuArray first; hand-write only if the op or fusion pattern is not expressible (the classic justified case: custom associative scan for SSM/recurrence — see differentiating-kernels.md) |

What legitimately passes GK0: fused multi-op kernels the broadcast compiler cannot express
(e.g. a scan with a data-dependent operator), stencil patterns with shared-memory reuse,
custom sampling/argmin-with-payload logic, and anything the profiler proves is
launch-overhead-bound from many small vendor calls that one fused kernel replaces.
**Launch-overhead-bound PIPELINES first try CUDA Graph capture, not hand fusion**
`[dated:2026-07]`: dozens of small kernels per step (profile signature: `cuLaunchKernelEx`
count × ~5–30 µs ≈ the whole step) collapse into one graph replay with zero kernel rewrites
— measured motive: an eval path at 60 launches/call, 30.9 µs mean, while the training path
with graph capture ran the same shapes far cheaper. Graphs require stable shapes/addresses
(preallocated buffers — which GK2's pool discipline already forces).

**CAPTURE-PINS-ADDRESSES** (law-level): a captured graph binds to the device *addresses*
closed over at capture time — ALL of them, not only the primary input array. If you cache a
captured graph plus its scratch buffers, key the cache on the identity fingerprint
(`objectid`) of EVERY closed-over device array, never on the primary input's identity alone:
one swapped-in array the cache key ignores (e.g. a fresh per-call state buffer) makes the
graph replay a PREVIOUS call's data — silently, no error, **same output for different
inputs**. On any fingerprint mismatch, regenerate the scratch buffers AND recapture; never
replay an old graph against new addresses. Acceptance-test pattern for this bug class:
`references/debugging.md` §11.

Write the
GK0 comment naming which row you checked and why it fails, then proceed to GK1.

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
4. **GC allocation in kernel** → `InvalidIRError … unsupported call to the Julia runtime
   (jl_alloc_array_1d …)` — preallocate outside, or `SVector`/`MVector` for small fixed-size
   scratch.
5. **Boxed capture** (non-`const` global in a closure) → dynamic-invocation error that names
   NEITHER the global nor the closure — fix with a `let`-bound capture or a typed callable
   struct.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/writing-kernels.md` | GK1 device legality — the 5 compile-error classes with literal error strings + fixes; launch configuration (occupancy API, 1-based index formula, bounds guard, `cld`, warp-multiple block sizes, grid-stride loops, `shmem=`) | writing or first-compiling ANY kernel |
| `references/memory-and-warps.md` | the optimization ladder — coalescing under Julia's COLUMN-MAJOR layout (threadIdx().x → FIRST dimension; C tutorials transposed), shared memory + `sync_threads` discipline, bank-conflict padding, register pressure (Int32 indices, `maxregs`), warp shuffle reductions, atomics contention + nondeterminism, divergence | a kernel compiles + oracle passes, and now must get FAST |
| `references/host-performance.md` | CuArray host discipline that dominates real perf — `allowscalar(false)`, fusion vs temporaries, contiguous `@views`, transfer spotting, preallocation, pinned memory, task-stream concurrency, `pool_status` (NOT `memory_status`), GK4 precision (Float32 literals `2.0f0`, `i32` indices, `muladd`, math_mode, BFloat16 `[dated:2026-07]`) | ANY CuArray perf work — even with zero hand kernels (the common case) |
| `references/measuring.md` | GK2 — `CUDA.@sync` timing law, `CUDA.@profile`/`@bprofile` (ProfileResults are NamedTuples, not DataFrames `[dated:2026-07]`), nsys→ncu order, `.nsys-rep` not `.qdrep`, roofline verdict for memory-vs-compute-bound, `ncu --query-metrics` before hardcoding metric names, NVTX ranges | BEFORE optimizing anything; before ANY perf claim |
| `references/debugging.md` | GK3 — `InvalidIRError` decode order, `@device_code_*` by compilation stage, `compute-sanitizer` (cuda-memcheck is GONE `[dated:2026-07]`), scalar-indexing triage, `@inbounds` only after the oracle passes, `sync_threads` divergence races, the CPU-reference oracle pattern, `CUDA.functional()` gating, cached/graph-capture path acceptance — state-separation test + permanent consistency assert (§11) | a kernel miscompiles, crashes, or returns wrong numbers |
| `references/portable-kernels.md` | KernelAbstractions 0.9.42 — `@kernel`/`@index`/`@localmem`/`@uniform`/`@synchronize` verified API, the `@uniform`-after-`@synchronize` trap, `unsafe_indices` + unguarded index footgun, ndrange idiom, KA-vs-raw-CUDA decision rule, pre-1.0 deprecations (`cpu=`, `KA.GPU`, conditional `@synchronize`) `[dated:2026-07]` | portability (CPU oracle / AMD future) is in play, or KA syntax questions |
| `references/differentiating-kernels.md` | GK3-AD — why Zygote breaks on kernels/mutation, `ChainRulesCore.rrule` for a kernel-backed op (complete example), Enzyme device-side AD state, differentiable scan / SSM route, `test_rrule` + FD-vs-CPU gradient checks | the kernel sits on a training path (Flux/Lux/Zygote/Enzyme anywhere in the project) |
| `references/api-changes.md` | CUDA.jl v6 ground truth — the CUDACore/CUDATools split (user-transparent), v5→v6 breaking table (`cap=`→`arch=sm"90"`, `reclaim(::ReclaimLevel)`, `device_reset!` no-op), verified v6.2.1 signatures with source paths, new fast-kernel features (clusters, `sm_str`, `dp4a`, FMA fusion fix, f16 atomics), vendor-lib lowercase naming (`cuBLAS` not `CUBLAS`), the KernelIntrinsics NEGATIVE (not shipped — sole home of that account) `[dated:2026-07]` | version confusion, a deprecation warning, or docs/LLM output contradicting the installed API |

## §9 Checklist — run before claiming a kernel is done

- [ ] GK0 comment above the kernel names the checked-and-rejected vendor/broadcast alternative
- [ ] Kernel ends in `return nothing`; args isbits (or Adapt-ed); no allocation inside
- [ ] Index formula 1-based; bounds guard before first access; block count via `cld`
- [ ] `CUDA.allowscalar(false)` in scripts/tests; no scalar-indexing warnings in logs
- [ ] No bare Float64 literals in device code (GK4 grep); Int32 index literals in hot loops
- [ ] CPU-reference oracle test compares the WHOLE `Array(result)` and runs in `Pkg.test()`
- [ ] `compute-sanitizer` clean if shared memory or atomics are used
- [ ] Timing wrapped in `CUDA.@sync`, after a warm-up run; profile cited for any perf claim
- [ ] On a training path: `rrule` defined + gradient test green (GK3-AD)
- [ ] `@inbounds` added only AFTER the oracle passed
- [ ] Cached/graph-capture path: cache key fingerprints EVERY closed-over device array
      (CAPTURE-PINS-ADDRESSES, §1) — a state-separation test AND a permanent in-body
      consistency assert both pass (`references/debugging.md` §11)
- [ ] Any change touching a GPU path merges only after an actual GPU parity run — CPU-only
      green does not clear this box (a signature-only bug can pass CPU tests and only break
      on real hardware)
