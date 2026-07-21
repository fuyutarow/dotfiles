> Read when: a kernel compiles but crashes, hangs, or returns wrong numbers — this is GK3, the
> correctness-oracle gate from SKILL.md.

# GK3 — Debugging and proving CUDA.jl kernels correct

Scope: decoding compiler/runtime failures and building the correctness oracle every kernel
needs before a speed claim is legal (GK2 in `measuring.md` presumes this file already passed).
Compile-error CLASSES — what *triggers* `InvalidIRError`, non-isbits args, GC allocation,
missing `return nothing` — are owned by `references/writing-kernels.md`. This file covers only
how to READ a failure once you have one, and how to PROVE a passing kernel is right.

## §1 `InvalidIRError` — read the `Reason:` lines bottom-up

Multiple `Reason:` lines are a causal chain, not independent bugs. The LAST line is the root
cause; every line above it is a downstream symptom of that one bug. Fixing the first reason —
usually `unsupported dynamic function invocation (call to setindex!)` or `(call to
getproperty)` — edits array-indexing code that was never broken; the identical error reappears
because the real bug, further down, was untouched.

**Artifact**: `julia script.jl 2>&1 | grep 'Reason:' | tail -1`

```julia
# InvalidIRError: compiling kernel(...) resulted in invalid LLVM IR
# Reason: unsupported dynamic function invocation (call to setindex!)    <- symptom
# Reason: unsupported dynamic function invocation (call to getproperty)  <- symptom
# Reason: unsupported use of an undefined name (use of 'threadId')       <- THE bug

# WRONG: chase the first Reason and rewrite the indexing code
# RIGHT: fix the last Reason
function kernel(a)
    @inbounds a[threadIdx().x] = 0   # was: threadId()  (undefined name, not caught elsewhere)
    return
end
```

## §2 `KernelError: kernel returns a value of type Union{}` — descend with `@device_code_warntype`

A `Union{}` return carries no line number and no useful message alone — it means inference
proved some call unconditionally throws (a `MethodError` resolved at compile time, e.g. no
`CUDA.sin(::Int64)` method exists). Guessing across the kernel body wastes edits. Instead, run
introspection with Cthulhu loaded and descend to the call flagged `::Union{}`, immediately
followed by `$(Expr(:unreachable))` in the printed IR.

**Artifact**:
```julia
using Cthulhu
@device_code_warntype interactive=true @cuda kernel(CuArray([1]))
# descend until you see:
#   %17 = call CUDA.sin(::Int64)::Union{}
#   $(Expr(:unreachable))
# -> the call one line above :unreachable is the actual cause (here: an Int64 arg passed to a
#    device intrinsic that only has Float32/Float64 methods)
```
Non-interactively: grep the printed IR body for `Expr(:unreachable)` and read the call above it.

## §3 `@device_code_*` — pick the macro by compilation stage, never guess a name

All four wrap an existing `@cuda`-launching expression; none take a bare `code_llvm(f, types)`
call.

| Macro | Stage it shows |
|---|---|
| `@device_code_warntype` | Julia-inferred IR (the type-stability check used in §2) |
| `@device_code_llvm optimize=false` | pre-optimization LLVM IR |
| `@device_code_ptx` | PTX — **a literal alias of `@device_code_native`**, not a separate implementation `[dated:2026-07]` |
| `@device_code_sass` | SASS — needs a **live device** with compute capability > 3.7; no device, no output |

Inventing `CUDA.code_sass(kernel, types)` fails `UndefVarError` — no such call exists; and
`@device_code_ptx` vs `@device_code_native` is one function under two names, never a real diff.

```julia
@device_code_warntype @cuda kernel(args...)             # Julia IR
@device_code_llvm optimize=false @cuda kernel(args...)  # unoptimized LLVM IR
@device_code_ptx  @cuda kernel(args...)                 # PTX (== @device_code_native)
@device_code_sass @cuda kernel(args...)                 # SASS; needs cc > 3.7 hardware
```

## §4 `compute-sanitizer` — `cuda-memcheck` is GONE `[dated:2026-07]`

`cuda-memcheck` is removed from current (12.x) CUDA toolkits; `apt install cuda-memcheck`
fails. Do not assume `compute-sanitizer` is on `PATH` either — resolve it via `CUDA_SDK_jll`.
Pick the sub-tool for the bug class: the default `memcheck` tool does **not** detect races —
running only the default against a shared-memory race prints a false-clean `ERROR SUMMARY: 0
errors`.

| `--tool=` | Catches |
|---|---|
| `memcheck` (default) | out-of-bounds / misaligned device memory access |
| `racecheck` | shared-memory races (pairs with §7's `sync_threads` rule) |
| `synccheck` | barrier / divergence hazards |
| `initcheck` | uninitialized device reads |

**Artifact**:
```julia
using CUDA_SDK_jll
compute_sanitizer = joinpath(CUDA_SDK_jll.artifact_dir, "cuda/compute-sanitizer/compute-sanitizer")
options = ["--launch-timeout=0", "--target-processes=all", "--report-api-errors=no", "--tool=racecheck"]
run(`$compute_sanitizer $options $(Base.julia_cmd())`)
```
Required whenever a kernel uses shared memory or atomics — this is GK3's `compute-sanitizer`
artifact in SKILL.md's gate table and §9 checklist.

## §5 Scalar-indexing triage — never "fix" with a global `allowscalar(true)`

(The file-top `allowscalar(false)` discipline itself is host-performance.md §1's home — this
section owns only the triage: why silence proves nothing, and the state machine behind it.)

"No `ScalarIndexingError` appeared" is not proof a code path avoids scalar indexing. The guard
is a 4-state machine (`ScalarAllowed|ScalarWarn|ScalarWarned|ScalarDisallowed`): outside the
literal REPL frontend task — Jupyter/Pluto, `julia -i script.jl`, a spawned `Task`, a
Distributed worker — the default is `ScalarWarn`, degrading to `ScalarWarned`: warn once per
task, then **silent forever** after. A per-element loop in a notebook can run ~1000x slower
with zero further diagnostic output past the first cell.

```julia
# WRONG (in a notebook): trust silence after the first warning
y = CuArray(rand(1000))
for i in 1:1000
    y[i] += 1   # warns ONCE, then silently proceeds (ScalarWarned) forever after
end

# WRONG: "fix" by disabling the guard globally — masks every future regression too
CUDA.allowscalar(true)   # triggers: "It's not recommended to use allowscalar([true])..."

# RIGHT: force ScalarDisallowed regardless of task/interactivity context
CUDA.allowscalar(false)

# RIGHT: scope only the one operation that truly needs scalar access
info = CUDA.@allowscalar d_info[]
```
**Artifact**: grep for a bare global `allowscalar(true)` and replace with scoped
`CUDA.@allowscalar <expr>`.

## §6 `@inbounds` only AFTER the oracle passes — `Pkg.test()` is the sanctioned runner

Add `@inbounds` to kernel indexing only once §8's oracle is green, never before. Keep
verifying through `Pkg.test()`, not an ad hoc `julia script.jl` run: `Pkg.test()` defaults to
`--check-bounds=yes`, which re-enables bounds checking **even over `@inbounds`-annotated
code**, while a plain production run genuinely skips it. An off-by-one `Pkg.test()` would
catch instead corrupts device memory silently in production.

```julia
function kernel(y, x)
    i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    @inbounds y[i] += x[i]   # add ONLY after the CPU-reference oracle (§8) is green
    return
end
```
**Artifact**: `Pkg.test()` (or `julia --check-bounds=yes -e '...'`) — both re-enable checks
over `@inbounds` device code; a bare `julia driver.jl` smoke run does not.

## §7 `sync_threads()` must be reached unconditionally — races otherwise

Every thread in the block must reach `sync_threads()`; never place it after a data-dependent
early `return` or inside a per-thread-varying `if`. Guard the memory operation, not the
barrier. CUDA.jl does **not** detect a missing or misplaced barrier by default — verify with
`compute-sanitizer --tool racecheck` (§4), never by eyeballing output: a race can look correct
on the current GPU/driver/block-size combo (warp-synchronous luck) and corrupt output only on
different hardware or a future CUDA version.

```julia
# WRONG: early return before a barrier other threads still reach -> hang
function kernel(a, n)
    i = threadIdx().x
    i > n && return
    # write shared memory ...
    sync_threads()   # threads that returned early never call this
    # read shared memory ...
end

# RIGHT: every thread reaches the barrier; guard the memory op instead
function kernel(a, n)
    i = threadIdx().x
    if i <= n
        # write shared memory ...
    end
    sync_threads()
    if i <= n
        # read shared memory ...
    end
end

# CUDA.jl's own canonical pattern: write -> sync_threads() -> read
function reverse_kernel(a::CuDeviceArray{T}) where T
    i = threadIdx().x
    b = CuStaticSharedArray(T, 2)
    b[2-i+1] = a[i]
    sync_threads()      # required: without this the read below races the write above
    a[i] = b[i]
    return
end
```
Shared-memory tuning (bank conflicts, padding, register pressure) is `memory-and-warps.md`'s
territory — this section owns only the barrier-reachability/race-correctness rule.

## §8 The CPU-reference oracle — compare the WHOLE array, never spot-check

Build the oracle as a same-algorithm CPU reference compared element-by-element against the
entire array copied back with `Array(...)` — never a hand-picked few elements peeked via
`CUDA.@allowscalar`. `Array(...)` also implicitly synchronizes the kernel launch, so the
comparison can't race a still-in-flight kernel. A spot-check of 2-3 entries misses a bug
confined to a tail thread-block, an edge index, or one specific `blockDim`/`gridDim`
combination; `all(Array(y_d) .== expected)` catches it because it checks every element.

```julia
cpu_reference(x) = x .+ 1   # same algorithm, plain Julia, no GPU calls
y_d = CuArray(x)
@cuda threads=length(y_d) kernel!(y_d)
using Test
@test all(Array(y_d) .== cpu_reference(x))   # whole-array, host-side, synchronizing compare
```
This test must run inside `Pkg.test()` (§6) — SKILL.md's GK3 artifact is exactly "the
comparison test exists and runs in `Pkg.test()`".

## §9 `CUDA.functional()` — gate GPU code; `using CUDA` always loads

`using CUDA` succeeding is not evidence a GPU is available — the package always loads
regardless of driver/hardware presence. Gate any GPU-dependent path behind `CUDA.functional()`
checked **inside `__init__()`**, never at module top level: `const gpu_ok = CUDA.functional()`
at top level breaks precompilation on a CPU-only CI runner, or freezes a stale `true`/`false`
into the precompiled image. CUDA.jl's docs: "avoid any calls to the GPU stack from global
scope, since the package might not be functional."

```julia
module MyPkg
using CUDA
function __init__()
    CUDA.functional(true)   # verbose: prints WHY init failed, if it did
end
end
```

## §10 KernelAbstractions kernels — the `CPU()` backend IS the oracle

For a kernel written with `@kernel`, launch the **same** kernel function on the `CPU()`
backend instead of hand-writing a second plain-Julia reference. `CPU()` is a real, distinct
backend (`struct CPU <: Backend`, KernelAbstractions' host-threaded execution path — verified
against the installed 0.9.42 source `[dated:2026-07]`), not a bespoke for-loop — it exercises
actual kernel semantics instead of a second algorithm implementation that can silently drift
from the GPU version: a bug fixed in the GPU kernel but forgotten in a hand-written CPU twin
passes forever, since the two agree with each other, not with shared ground truth.

```julia
using KernelAbstractions

@kernel function my_kernel!(y, x)
    i = @index(Global)
    @inbounds y[i] = x[i] + 1
end

# oracle: run the SAME kernel on CPU()
x_cpu = rand(Float32, 64)
y_cpu = similar(x_cpu)
my_kernel!(CPU(), 64)(y_cpu, x_cpu; ndrange=length(x_cpu))
synchronize(CPU())

# vs the GPU backend
using CUDA
x_gpu = CuArray(x_cpu)
y_gpu = similar(x_gpu)
backend = get_backend(x_gpu)
my_kernel!(backend, 64)(y_gpu, x_gpu; ndrange=length(x_gpu))
synchronize(backend)

using Test
@test all(y_cpu .== Array(y_gpu))
```
KA syntax (`@index`, `@localmem`, `@uniform`, launch config, `unsafe_indices`) is
`portable-kernels.md`'s territory — this section owns only the oracle-choice rule.
