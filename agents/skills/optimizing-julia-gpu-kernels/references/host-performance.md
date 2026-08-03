# Host-side CuArray discipline & GK4 precision

> Read when: ANY CuArray perf work — even with zero hand kernels (the common case) — or
> before a Float32/Float64 literal, atomic reduction, or tensor-core dtype choice anywhere
> in GPU code (GK4).

Most real-world GPU runtime is decided here, not inside a `@cuda` kernel. Owns CuArray host
discipline + GK4 precision (SKILL.md's fifth gate). Sibling homes: device legality →
writing-kernels.md; coalescing/shared-mem/warp/atomics-**contention** → memory-and-warps.md;
profiling + the full async-timing law → measuring.md (GK2).

## §1 Scalar indexing — `allowscalar(false)`, not the interactive auto-detection

CUDA.jl auto-detects an interactive session (REPL/Pluto/notebook) and only **warns once** on
scalar indexing there instead of erroring — a scalar loop keeps running, numerically correct,
100-1000x slower, and an LLM iterating in that session never sees a hard failure. Do not rely
on the auto-detection either way — call `CUDA.allowscalar(false)` explicitly at the top of
every script/module/test file; scope a genuine scalar-access need narrowly and never flip the
global switch back on:

```julia
for i in eachindex(y); y[i] = sin(y[i]); end   # WRONG: correct but 100-1000x slower

CUDA.allowscalar(false)                        # RIGHT: unconditional, at file top
y .= sin.(y)
CUDA.@allowscalar a[1] += 1   # one line only — never CUDA.allowscalar(true) globally
```

**Artifact**: `allowscalar(false)` at file top, zero hits for `allowscalar(true)`; scalar
indexing under `false` raises the literal error `scalar getindex is disallowed`.

## §2 Fused broadcast beats named temporaries

Broadcast fusion only collapses into ONE GPU kernel when the whole expression is a single
dotted statement. Intermediate named arrays break fusion into separate kernel launches plus a
separate pooled allocation per temporary — invisible in a correctness review since the
numeric result is identical: `tmp = a .+ b; y .= tmp .* c` (WRONG, 2 launches + 1 extra
allocation) vs `y .= (a .+ b) .* c` (RIGHT, 1 fused kernel, no temporary).

**Artifact**: `CUDA.@profile trace=true expr` — a fused line shows one device-side
`_Z16broadcast_kernel...` row; a broken-up version shows N kernel rows and N host-side
`cuMemAllocAsync` rows.

## §3 `@views` — a real win only when contiguous

`view(a, r)` is a safe zero-copy win **only for contiguous ranges** (`2:5`, `:`) — CUDA.jl
specializes those into a genuine `CuArray`. Non-contiguous slicing (strided ranges, boolean/
fancy indexing, `permutedims`) produces a generic `SubArray` that bypasses CuArray-specialized
dispatch and can silently fall back to scalar iteration for any op Adapt.jl doesn't cover —
code that looks identically "viewed" passes correctness tests while being catastrophically
slower only on the non-contiguous case.

**Artifact**: with `allowscalar(false)` set, the SAME downstream call raises
`scalar getindex is disallowed` on `view(a, 1:2:end)` but not on `view(a, 2:5)` — that split
confirms the divide.

## §4 Spotting transfers — `CUDA.@profile`, never code review

Adapt.jl-mediated implicit uploads/downloads (mixing a plain `Array` into a `CuArray`
expression) are invisible in source. Profile with `CUDA.@profile expr` (`trace=true` for a
chronological view) and look for `cuMemcpy*` rows in the "Host-side activity" table. A
per-iteration `Array(gpu_result)` or a stray CPU-resident argument silently reintroduces a
PCIe round trip (1-2 orders of magnitude below on-device HBM) on every call, with no line of
code to point at until you profile. Full profiling workflow → measuring.md.

## §5 Async timing law — one line, full law lives in measuring.md

GPU calls return to the CPU before the kernel finishes; plain `@elapsed`/wall-clock deltas
measure enqueue time, not execution time (`Base.@elapsed` undercounts a real `CUDA.@elapsed`
by ~6x on the docs' own example). Never make a speed claim without a sync barrier. GK2's
complete law — `CUDA.@sync`/`CUDA.@elapsed`, the `blocking=true` micro-benchmark flag,
`CUDA.@profile` interpretation — is measuring.md's home; read it before any timing code.

## §6 Memory pool — `pool_status`, never `reclaim()`

`CUDA.memory_status()` does not exist — calling it raises an `UndefVarError` (on Julia ≥1.11
the literal text backtick-quotes the name and appends the module scope:
`` UndefVarError: `memory_status` not defined in `CUDA` `` — match on the identifier, not the
whole line); an LLM "fixing" working code toward that name breaks it. The real call is
`CUDA.pool_status()` → `Effective GPU memory usage: 16.12% (2.537 GiB/15.744 GiB)`
(`available_memory()` WAS renamed to `CUDA.free_memory()` `[dated:2026-07]`). Do not
reflexively call `CUDA.reclaim()` before every large allocation — the pool already frees
cached blocks whenever an allocation needs it; routine `reclaim()` just forces the next
allocations to pay full driver `cudaMalloc` cost again. Legitimate uses are one-off (handing
the GPU to another process).

**Artifact**: grep for `CUDA.reclaim()` inside a loop or before routine allocations — absent.

## §7 Preallocate outside the loop

Allocate output/scratch buffers once (`similar(x)`) and write in place (`.=`, `mul!`,
`broadcast!`) instead of a fresh CuArray every iteration. GPU memory is small relative to
host RAM, so allocation churn triggers GC far more often on the GPU side — fine at small
sizes, degrades sharply at scale. To free a large buffer deterministically rather than wait
on GC, call `CUDA.unsafe_free!(buf)` (what `CuIterator` does internally):
`for i in 1:n; tmp = a .* b; y[i] = sum(tmp); end` (WRONG, allocates every iteration) vs
hoisting `tmp = similar(a)` before the loop and writing `tmp .= a .* b` inside it (RIGHT).

**Artifact**: `CUDA.@time loop_body()` shows nonzero, growing `% gc time` for the
allocate-every-iteration version, dropping to ~0% after hoisting the allocation out.

## §8 Pinned host memory for reused buffers

For transfer-heavy code you want to overlap across tasks, pin the reusable CPU-side buffer
once with `CUDA.pin(buf)` and reuse it — plain (pageable) `Array`s force every `copyto!` to be
internally staged through a pinned buffer, serializing with concurrent stream activity and
killing overlap. Pinning is a one-time, expensive op — never pin/unpin per iteration:
`buf = CUDA.pin(Array{Float32}(undef, n))` hoisted out of the loop, then `@async copyto!(buf, ...)`.

**Artifact**: `CUDA.pin(...)` call sites hoisted outside the loop/task body; verify overlap
via `CUDA.@profile trace=true` showing concurrent `cuMemcpyAsync` timestamps across tasks.

## §9 Task-per-stream — no manual `CuStream`

Each Julia `Task` (`@async`/`Threads.@spawn`) automatically gets its own CUDA stream — do not
hand-manage `CuStream` objects for concurrent kernel overlap. Structure independent GPU work
as separate `@async` tasks inside `@sync`, collecting into a `Vector{Any}` declared BEFORE the
`@sync` block (a bare `local` assigned only inside `@async` doesn't escape reliably):
`results = Vector{Any}(undef, 2); @sync begin; @async results[1] = ...; @async results[2] = ...; end`.
Call `synchronize()` before the block if the tasks consume GPU data produced earlier on the
default stream — cross-stream visibility is not automatic.

The number of tasks/streams is bounded by the admitted P7 envelope, including aggregate VRAM for
every simultaneously live buffer and host RAM for pinned staging buffers. Do not create a
task-per-cell or combine stream concurrency with agent-level GPU fanout. The resource runner gives
one job exclusive use of its selected GPU; overlap is internal to that one reservation.

## §10 Unified memory: default is device memory

Default to ordinary device memory (`CuArray(x)`) with `allowscalar(false)`. Reach for unified
memory (`cu(x; unified=true)`) only for CPU scalar access to GPU-resident data or to
oversubscribe device memory — it silently defeats the scalar-indexing safety net (`gpu[1]`
just works, no error) while paying a real paging cost per access. Don't reach for
`unified=true` as a generic "just make indexing work" fix.

**Artifact**: `gpu[1]` succeeds under `allowscalar(false)` on `CuVector{T,UnifiedMemory}` but
raises `scalar getindex is disallowed` on default `CuVector{T,DeviceMemory}` — grep
`unified=true` sites for a specific justification, not convenience.

## §11 `copyto!` vs `Array()`/`CuArray()` — preserve wrappers

Use `copyto!(dst, src)` into a preallocated buffer for repeated transfers; reserve
`Array(gpu)`/`CuArray(cpu)` for one-off allocate-and-copy — both always allocate a brand-new
destination. For wrapper types (`Diagonal`, `Transpose`, ...) that must keep their structure
on the GPU, use `adapt(CuArray, x)` or `cu(x)`, not the plain `CuArray(x)` constructor, which
materializes a dense array and loses the wrapper: `cu(Diagonal(rand(2,2)))` keeps
`Diagonal{Float32,CuArray{...}}`; `CuArray(Diagonal(rand(2,2)))` densifies it. `cu(x)` also
narrows float scalars to Float32 by design — use `adapt` directly if unwanted.

## §12 GK4 PRECISION — Float32 discipline (this gate's home)

### 12.1 Float32 by default, not Float64

Default every CuArray, kernel-local scalar, and literal to Float32. Consumer/GeForce GPUs
(most CUDA.jl dev/CI hardware) have a crippled FP64:FP32 throughput ratio (1:32 or 1:64 vs
1:2 on datacenter A100/H100). Measured on an RTX 3060: a muladd-heavy kernel ran **72x**
slower in Float64; a sqrt/exp/log-heavy kernel ran **22x** slower. Base Julia habits
(`zeros(N)`, unsuffixed literals) default to Float64 and silently inherit the penalty on GPU
code. Reach for Float64 only when precision demonstrably requires it, and benchmark first.

**Artifact**: `CUDA.versioninfo()` showing a GeForce/RTX name (not A100/H100/V100) means the
crippled ratio applies; time `CuArray{Float32}` vs `{Float64}` under `CUDA.@sync` — ratio
should be >>2x.

### 12.2 Literal suffix discipline — the top LLM bug in this territory

Never write a bare Float64 literal (`2.0`, `1.1`, `1/3`, `pi`) in an expression touching
Float32 GPU data — suffix as Float32 (`2.0f0`, `1.1f0`) or wrap in `Float32(...)`. Holds even
when the destination array is already Float32 — its eltype does NOT save you: the arithmetic
runs in double precision before truncating the store. Caveat: `2.0` (exact power-of-2) can
get silently folded back to f32 by LLVM, so the trap reproduces reliably only with
non-power-of-2 literals (`1.1`, `1/3` — rates, averages, physical constants) — a clean `2.0`
repro doesn't mean the whole class is safe.

```julia
y = x .* 2.0    # WRONG: eltype(y) == Float64 !! -- new array promoted
z .= x .* 1.1    # WRONG: z stays Float32, but the multiply itself runs as mul.rn.f64
y = x .* 2.0f0; z .= x .* 1.1f0   # RIGHT: f0 suffix keeps the ARITHMETIC, not just storage, f32
```

**Artifact**: `CUDA.code_ptx(io, kernel, argtypes; raw=true)`, grep for
`cvt.f64.f32`/`mul.rn.f64`/`add.rn.f64`/`cvt.rn.f32.f64` — any hit means a Float64 literal
leaked in. On source: `grep -nE '[^f0-9]([0-9]+\.[0-9]+)[^f0-9]' kernel_src.jl`. For
broadcasts: `eltype(x .* 2.0)` returning `Float64` on a `CuArray{Float32} x` is the smoking gun.

### 12.3 Int32 index literals in hot kernels

`blockIdx()`/`threadIdx()`/`blockDim()` already return Int32; a bare Int64 literal mixed into
index arithmetic promotes the whole expression to 64-bit, costing register pressure that
compounds across index-heavy kernels. Suffix `1i32` (`using CUDA: i32`) or `Int32(1)`:
`blockIdx().x - 1` (WRONG, promotes) vs `blockIdx().x - 1i32` (RIGHT). `[dated:2026-07]` —
CUDA.jl's own tutorial kernel shows 29 vs 28 registers for this exact change; exact counts
shift with toolchain version, the technique doesn't.

**Artifact**: `CUDA.registers(...)` before/after; or grep PTX/SASS for `cvt.s64.s32`.

### 12.4 `muladd`/`fma` — don't trust auto-contraction

`a*b + c` is NOT guaranteed to fuse into hardware FMA at the PTX level CUDA.jl/LLVM emits.
`muladd(a[i], b[i], c[i])` compiles to exactly one `fma.rn.f32`; naive `a[i]*b[i]+c[i]`
compiles to zero (separate multiply+add, extra rounding step) — use `muladd`/`fma` explicitly.
`[dated:2026-07]` — PTX-contraction behavior can shift with toolchain version.

**Artifact**: `grep -c 'fma.rn.f32'` on `CUDA.code_ptx` output — exactly 1 per
`muladd`/`fma` call site.

### 12.5 `rsqrt` + `fastmath=true` — not the bare `@fastmath` macro

Use `CUDA.rsqrt(x)` for an approximate reciprocal-sqrt, and the kernel-launch flag
`@cuda fastmath=true` for NVIDIA's approximate intrinsics broadly — NOT the bare `@fastmath`
macro. `@fastmath 1/sqrt(x)` silently lowers to the same approximate `rsqrt.approx` PTX
(CUDA.jl's own source comment: this idiom is "too aggressive wrt. fast-math behavior"), giving
reduced precision without ever passing `fastmath=true`. Conversely only a handful of ops
(`cos`/`sin`/`log`/`exp`/`div`/`inv`/...) have explicit `_fast` overrides — no `sqrt_fast`
exists, so bare `@fastmath sqrt(x)` gets NO approximation; don't assume `@fastmath` changes
every op inside it uniformly. `[dated:2026-07]` — the `_fast`-op set is an evolving list.

**Artifact**: `@device_code_ptx` under `fastmath=true`, grep for `approx`/`ftz` to confirm
which ops actually changed.

### 12.6 Tensor-core dtype choice & `math_mode!`/TensorFloat32

GK0 (SKILL.md §1) already routes GEMM to cuBLAS (`*`/`mul!`) — this is the dtype choice
INSIDE that dispatch. On tensor-core hardware (compute capability >= 7.0), switching matmul
operands to `CuArray{Float16}` routes through cuBLAS's `gemmEx` path automatically — measured
5.62x speedup for a 4096x4096 Float16 matmul vs Float32 on an RTX 3060. Watch dynamic range:
Float16 tops out at ~65504 with ~3 decimal digits; accumulate in Float32 if rounding error
compounds. `CUDA.math_mode!(CUDA.FAST_MATH; precision=:TensorFloat32)` `[dated:2026-07]` is
the alternative path — TF32 tensor-core matmul on Float32-typed inputs, no conversion needed.

**Artifact**: `CUDA.capability(device()) >= v"7.0"`; `@belapsed CUDA.@sync $A16*$B16` vs
`$A32*$B32` should show the Float16 path well under 1x.

### 12.7 Atomic float reduction — reproducibility (pointer)

Atomic-add float reductions are NOT bit-identical across runs; the full mechanism, CUDA.jl's
own `# introduces nondeterminism` precedent, and the `PEDANTIC_MATH` fallback live in
memory-and-warps.md §7 (one home). The GK4 angle here is only the decision: a numerical
correctness test that diffs GPU output bit-for-bit MUST either force
`CUDA.math_mode!(CUDA.PEDANTIC_MATH)` or compare with a tolerance — never assert exact
equality over an atomic reduction under the default math mode.

### 12.8 BFloat16 — native on Julia 1.11+ `[dated:2026-07]`

On Julia >= 1.11 with a current CUDA.jl, `Core.BFloat16` is a native Base primitive type, and
CUDA.jl already defines `atomic_add!`/`atomic_sub!` for `LLVMPtr{BFloat16,...}`. Check
`isdefined(Core, :BFloat16)` before reflexively adding the separate `BFloat16s.jl` package (a
DISTINCT `BFloat16s.BFloat16` type) — mixing both risks method ambiguity. On Julia <1.11, or
an arch whose backend can't lower bfloat codegen, CUDA.jl falls back to a slower
compare-and-swap path — check the version gate before assuming the fast path applies (codegen
landed incrementally: x86_64 via LLVM 16 in Julia 1.11, aarch64 needs Julia 1.13/LLVM 20).

### 12.9 WMMA — manual tensor-core kernels (pointer)

Below a cuBLAS matmul call, inside a custom fused kernel, `CUDA.WMMA` is the documented
high-level wrapper for tensor-core programming (`load_a`/`load_b`/`load_c`, `fill_c`, `mma`,
`store_d`) — don't hand-roll raw PTX `wmma` calls. `[dated:2026-07]` — now lives under the
CUDACore subpackage; the public `CUDA.WMMA` re-export is stable across that reorganization,
internal paths are not. Kernel-writing mechanics are writing-kernels.md's territory — this is
a pointer, not the full API. **Artifact**: `isdefined(CUDA, :WMMA) && :mma in names(CUDA.WMMA)`.
