# API changes — CUDA.jl v6 ground truth

> Read when: version confusion, a deprecation warning fires, or docs/LLM output contradicts
> the installed API.

**Baseline**: CUDA.jl v6.2.1 / KernelAbstractions 0.9.42 `[dated:2026-07]`, source-diffed
against v5.11.3 (`git diff v5.11.3..v6.2.1`) + installed source under
`~/.julia/packages/{CUDA,CUDACore,CUDATools,KernelAbstractions}/`. Every signature and path
below was read from source, not recalled — if a fact here disagrees with a model's training
data or a stale blog post, THIS FILE WINS for the installed baseline; re-verify with
`Pkg.status(["CUDA","KernelAbstractions"])` if the project pins a different version.

## §1 The package split — user-transparent

CUDA.jl v6 is now a meta-package: `@reexport using CUDACore; @reexport using CUDATools` +
`using cuBLAS/cuSPARSE/cuSOLVER/cuFFT/cuRAND`.

- **CUDACore** = kernel programming: `@cuda`, `cufunction`, device intrinsics, `CuArray`,
  memory pool, `math_mode!`.
- **CUDATools** = diagnostics: `@profile`/`@bprofile` (CUPTI-backed), `@device_code_*`, NVML.
- Math libs became standalone packages (`cuBLAS.jl`, `cuSOLVER.jl`, …) — naming rule in §5.
- Rationale (JuliaGPU/CUDA.jl#2827): downstream backends (Reactant, cuTile.jl) want the
  kernel layer without pulling in the math libs. The v6.0.0 release notes state the intent
  plainly: "Breaking changes: Ideally none."

**Nothing in existing code needs to change**: `pkg> add CUDA` and `using CUDA` are UNCHANGED;
every kernel primitive is still a bare identifier from the `CUDA` namespace. The split is a
dependency-graph reorganization, not an API break.

**The one visible tell** — a compiled kernel object's REPL `show` now prints
`CUDACore.HostKernel(...)`, not `CUDA.HostKernel(...)`. If you see `CUDACore.HostKernel` in
output, that is expected v6 behavior, not a bug or a version mismatch — do not "fix" it.

Checkable: `julia -e 'using Pkg; Pkg.status("CUDA")'` — version `6.2.1` confirms this baseline
applies. Stronger check: `cat $(dirname $(Pkg.pathof(CUDA)))/../Project.toml` — its
`[sources]` section carries exactly 7 entries (CUDACore, CUDATools, cuBLAS, cuFFT, cuRAND,
cuSOLVER, cuSPARSE); `lib/cudnn` appears only under `[workspace] projects`, NOT `[sources]`
(consistent with §5: cuDNN is not a default dependency — it loads only when explicitly added).
Confirmed against the installed Project.toml `[dated:2026-07]`; a paraphrase/summary tool
queried on the same repo denied the split and was wrong. Prefer a direct file fetch over a
summarized answer when the fact is version-specific.

## §2 v5 → v6 breaking changes (kernel code)

| Area | v5.11.x | v6.2.1 | Status | Verify |
|---|---|---|---|---|
| `@cuda` target kwarg | `cap=v"9.0"` | `arch=sm"90"` / `sm"90a"` / `sm"100f"` (`@sm_str` / `SMVersion`) | `cap=` deprecated (depwarn), still works `[dated:2026-07]` | `grep -rn 'cap=v"' <src>` finds call sites to migrate; `julia -e 'using CUDA; sm"90"'` only resolves on v6 |
| `CUDA.reclaim` | `reclaim(sz::Int) -> bytes` | `reclaim(level::ReclaimLevel=RECLAIM_DROP) -> nothing`; ladder `RECLAIM_PURGE < SYNC < GC < DROP`; `retry_reclaim` helper | old signature **REMOVED** (PR #3118, v6.2.0) — not a soft deprecation | `applicable(CUDA.reclaim, 1024)` returns `false` on v6.2.1; correct call is `CUDA.reclaim(CUDA.RECLAIM_DROP)` |
| `device_reset!` | worked-ish (freed context state) | unconditional no-op + depwarn (PR #3178, v6.2.1) | functionally removed — do not rely on it to free memory or reset device state | compare `CUDA.pool_status()` before/after the call — no change; use `CUDA.reclaim(...)` instead |
| kernel-launch RNG | perturbed the host `Random.default_rng()` stream | task-local Xoshiro (`launch_rng()`), isolated from host RNG | behavior fix | seed the host RNG, launch a kernel using device RNG, then call host `rand()` — v6 output matches a run with no kernel launch in between; v5 did not |
| `@device_code_*`, `@profile` | lived in `CUDA.jl` | moved to `CUDATools`, forwarded — call sites unchanged | namespace-only, no code change needed | `methods(CUDA.var"@profile")` resolves into `CUDATools` |

`@cuStaticSharedMem`/`@cuDynamicSharedMem` were already deprecated pre-v6 in favor of
`CuStaticSharedArray`/`CuDynamicSharedArray` — that migration is unchanged by v6, not new here.

## §3 Verified v6.2.1 signatures (source paths — cite these, not memory)

| API | Signature | Source path | Status |
|---|---|---|---|
| `@cuda` | `@cuda [dynamic] [launch] [backend] [cooperative] [blocks=1] [threads=1] [clustersize=1] [shmem=0] [stream] [kernel] [name] [always_inline] [minthreads] [maxthreads] [blocks_per_sm] [maxregs] [fastmath] [arch] [ptx] f(args...)` — the legacy deprecated `cap=` kwarg (§2) is still ACCEPTED but deliberately omitted here | `CUDACore/src/compiler/execution.jl:65-71` | shape unchanged; `arch=`/`clustersize=`/`backend=`/`fastmath=` are v6 additions |
| `launch_configuration` | `launch_configuration(fun::CuFunction; shmem=0, max_threads=0) -> (blocks, threads)` | `lib/cudadrv/occupancy.jl:56-79` | UNCHANGED from v5 |
| shared memory | `CuStaticSharedArray(T, dims)`; `CuDynamicSharedArray(T, dims, offset=0)` | `device/intrinsics/shared_memory.jl` | unchanged — usage craft: `memory-and-warps.md` |
| `CuDistributedSharedArray` | `CuDistributedSharedArray(shared_array, blockidx)` | cluster shared-mem remap | **NEW** in v6 (§4.1) |
| block/warp sync | `sync_threads()`, `sync_threads_count/_and/_or`, `sync_warp(mask=FULL_MASK)`, `barrier_sync(id=0)` | — | unchanged — usage craft: `memory-and-warps.md` |
| cluster sync | `cluster_arrive()`/`cluster_arrive_relaxed()`, `cluster_wait()` | — | **NEW**, LLVM 17+, CC≥9.0; exported but undocumented in v6.2.1 docs — treat the signature as ground truth, not the missing prose |
| shuffle | `shfl_{up,down,xor}_sync(mask, val, delta, width=32)`, `shfl_sync(mask, val, lane, width=32)` | — | unchanged — usage craft: `memory-and-warps.md` |
| atomics | `@atomic a[I] = op(a[I], val)`; `atomic_add!` etc. | — | unchanged; **NEW** native LLVM f16 `atomicrmw fadd` (any address space) + BFloat16 add/sub (CC≥9.0, Julia≥1.11) — contention craft: `memory-and-warps.md` |
| `allowscalar` | `allowscalar(::Bool)` / do-block / `@allowscalar` | lives in GPUArraysCore | unchanged — discipline: `host-performance.md` |
| profiling | `CUDA.@profile [trace=false] [raw=false] [external=...]`; `CUDA.@bprofile [time=1.0]` | forwarded from `CUDATools` | both existed in v5 — usage: `measuring.md` |
| `CUDA.@sync` | `CUDA.@sync [blocking=false] ex` | — | unchanged — usage: `measuring.md` |
| `math_mode!` | `math_mode!(mode; precision=nothing)`, `MathMode ∈ {PEDANTIC_MATH, DEFAULT_MATH, FAST_MATH}` | `CUDACore/lib/cudadrv/state.jl` | unchanged |
| `SMVersion` / `@sm_str` | `SMVersion(major, minor, feature_set=:baseline)`; `sm"90"` baseline, `sm"90a"` arch-locked, `sm"100f"` family-portable | `CUDACore/src/compiler/sm.jl` | **NEW**, v6.2.0 |

## §4 New fast-kernel features in v6

1. **Thread block clusters** (Hopper+, CC≥9.0): `@cuda clustersize=(2,2,2)`; index/query with
   `clusterIdx()`, `clusterDim()`, `blockIdxInCluster()`, `gridClusterDim()`,
   `linearBlockIdxInCluster()`, `linearClusterSize()`; synchronize with
   `cluster_arrive()`/`cluster_arrive_relaxed()` + `cluster_wait()`; share data across the
   cluster via `CuDistributedSharedArray` — PR #3017, v6.0.0. Hardware-gated: guard any use
   behind an `SMVersion`/capability check, it silently doesn't apply below CC 9.0.
2. `arch=sm"90a"` / `sm"100f"` unlocks wgmma/tcgen05-class matrix instructions (§3). `sm"90a"`
   is arch-locked (compiles for one exact chip); `sm"100f"` is family-portable (compiles
   across a family) — pick family-portable unless you need the arch-locked instruction subset.
3. `dp4a(a, b, c)` — 4-way INT8 dot-product-accumulate (sm_61+), 4 overloads, new in v6
   `math.jl`. Reach for it in INT8-quantized inference kernels.
4. Directed-rounding intrinsics: `add_rn/rz/rm/rp`, `sub_*`, `mul_*`, `div_*`, `fma_*`
   (PR #2576) — for reproducible/IEEE-rounding-mode numerics, not a general speedup.
5. `@fastmath` on Float64 division now compiles to fast-reciprocal-multiply, ~30-40% faster
   (PR #3077) `[dated:2026-07]`. GK4 (`host-performance.md`) governs WHEN `@fastmath`/reduced
   precision is acceptable; this is only the existence/magnitude fact.
6. `muladd`/`fma` now correctly emit `llvm.fmuladd` — pre-v6 code was silently losing FMA
   fusion inside loops (PR #3078). No source change needed to benefit: recompiling against
   v6.2.1 alone restores the fusion.
7. Native Float16/BFloat16 atomics (CC≥9.0): `atomic_add!` etc. on f16/bf16 now lower to a
   hardware `atomicrmw fadd` instead of a CAS retry loop — contention discipline still applies,
   craft in `memory-and-warps.md`.
8. `reclaim(::ReclaimLevel)` ladder + `retry_reclaim` — full breaking-change detail in §2; do
   not call the removed `reclaim(sz::Int)` form.
9. `@cuda backend=` protocol — pluggable compilation backend (`kernel_convert`/
   `kernel_compile`), default `LLVMBackend`, transparent for ordinary kernels — PR #3121,
   v6.1.0, additive only.
10. KernelAbstractions unified-memory allocation (`unified=true` on `KA.allocate`/`zeros`/
    `ones`, 0.9.38+) — the v6-era feature-existence fact only; full KA API and pre-1.0
    deprecations live in `portable-kernels.md`.

## §5 Vendor-lib naming rule `[dated:2026-07]`

Write vendor-lib access using the **lowercase-prefixed** package/module name — `cuBLAS`,
`cuSOLVER`, `cuFFT`, `cuSPARSE`, `cuRAND` (and `cuDNN` once explicitly loaded — GK0 dispatch
table, SKILL.md §1, owns WHEN to reach for cuDNN). The old uppercase names
(`CUBLAS`/`CUSOLVER`/`CUFFT`/`CUSPARSE`/`CURAND`) still resolve — `src/CUDA.jl` carries
`Base.@deprecate_binding CUBLAS cuBLAS true` (+ equivalents) — but emit a deprecation warning
on every call.

```julia
# WRONG (still works but deprecated, warns on every call)
CUBLAS.cublasLoggerConfigure(1, 0, 1, C_NULL)

# RIGHT (current canonical name)
cuBLAS.cublasLoggerConfigure(1, 0, 1, C_NULL)
```

This is a naming convention only — GK0 (SKILL.md §1) governs whether to reach for a vendor lib
at all; this section governs only what to call it once you do.

## §6 NEGATIVES — do not cite

- **`KernelIntrinsics`** (the macro-free KernelAbstractions API, PR #635) is **NOT** in the
  KernelAbstractions 0.9.42 tag — merged to `main` only. A "0.9.40 release notes" attribution
  seen in some docs/LLM output is spurious for this baseline. Do not add `using
  KernelIntrinsics` or cite its API against v0.9.42.
- **`KernelCall`/`kernel_launch`/`rebind`** protocol shown in CUDA.jl's master-branch docs is
  **NOT** in the v6.2.1 tag — post-6.2.1, unreleased. Do not cite it against the v6.2.1
  baseline this file (and the installed environment) targets.
- cuBLAS/cuSPARSE library-*internals* changes (beyond the naming shim in §5) were not diffed —
  out of this file's kernel-writing scope; treat any library-internal claim not in §5 as
  unverified here.

Verify before citing either negative as "current": confirm the installed tag first —
`julia -e 'using Pkg; Pkg.status(["CUDA","KernelAbstractions"])'` — if it prints `6.2.1` /
`0.9.42`, both negatives above hold.
