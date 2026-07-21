# Writing kernels — device legality and launch configuration (GK1)

> Read when: writing or first-compiling ANY `@cuda` kernel, or assembling its launch configuration (`threads=`/`blocks=`/`shmem=`).

Contents: §1 the 5 device-compiler error classes · §2 kernel I/O + control-flow bans · §3 Float32/Float64-only math intrinsics · §4 StaticArrays in kernels · §5 launch config idiom.

Not here: GK0 vendor-dispatch deny-gate (SKILL.md §1); coalescing/shared memory/register pressure/warp shuffles/atomics (`memory-and-warps.md`); Float32-literal precision (GK4, `host-performance.md`); `InvalidIRError` triage workflow, `compute-sanitizer` (`debugging.md`).

---

## §1 The 5 device-compiler error classes

CPU intuition "type instability makes it slow" becomes "it does not compile" here. Literal strings below so you grep, not guess. `[dated:2026-07]`, verified against GPUCompiler.jl `src/validation.jl` on the CUDA.jl v6.2.1 baseline.

**1. Missing `return nothing`** — a kernel must infer `Nothing` on every path; a trailing assignment's value is NOT `nothing`.
```julia
# WRONG
function k(a)
    a[threadIdx().x] = 2f0 * a[threadIdx().x]   # implicitly returns Float32
end
# RIGHT
function k(a)
    a[threadIdx().x] = 2f0 * a[threadIdx().x]
    return nothing
end
```
Error: `` KernelError: kernel returns a value of type `Float32` `` (the runtime message backtick-quotes the type name — include the backticks when grepping; verified live on v6.2.1). Hint text: "Make sure your kernel function ends in `return`, `return nothing` or `nothing`." Fix: add the explicit return.

**2. Type instability / unresolvable dispatch** — any call the compiler can't statically resolve is a hard COMPILE error, never a slow CPU-style fallback. Error: `InvalidIRError: compiling ... resulted in invalid LLVM IR` / `Reason: unsupported dynamic function invocation (call to X)`. Multi-`Reason:` stacks read BOTTOM-UP — the full reading discipline and worked example are debugging.md §1's home. Diagnose: `@device_code_warntype interactive=true @cuda kernel(args...)`.

Sub-case — an untyped inner helper fails to specialize; the error names the INNER call site:
```julia
# WRONG — does not specialize
function my_inner!(f, t); t .= f.(t); end
# RIGHT — forces specialization
function my_inner!(f::F, t::T) where {F,T}; t .= f.(t); end
```
Exact string this produces: `InvalidIRError: compiling MethodInstance for my_outer_kernel(::typeof(id), ::CuDeviceMatrix{Int64, 1}) resulted in invalid LLVM IR / Reason: unsupported dynamic function invocation (call to my_inner_kernel!(f, t) @ Main REPL[27]:1)`.

Negative result `[dated:2026-07]` — do NOT grep for `recursion is currently not supported`: GPUCompiler.jl `master` `src/validation.jl` (fetched 2026-07-22) has ZERO "recursion" hits; that string is a 2019-2020 CUDAnative.jl relic. Type-stable recursion compiles today — the real limit is per-thread call-stack overflow at runtime (`CUDA_ERROR_ILLEGAL_ADDRESS` at `synchronize()`). Unroll bounded recursion via `Val{N}`: `f(::Val{N}, x) where N = f(Val(N-1), g(x))`.

**3. Non-isbits argument** — every `@cuda` argument (and every field of a struct passed as one) must be `isbitstype`; a struct merely holding a `CuArray` field fails at launch unless Adapt-ed.
```julia
# WRONG
struct Interpolate{A}; xs::A; ys::A; end
(itp::Interpolate)(x) = @inbounds itp.ys[searchsortedfirst(itp.xs, x)]
Interpolate(CuArray(xs_cpu), CuArray(ys_cpu)).(pts)  # KernelError: passing non-bitstype argument
# RIGHT
import Adapt
Adapt.@adapt_structure Interpolate   # converts CuArray fields to CuDeviceArray on launch
```
Error: `KernelError: passing non-bitstype argument`, per-field breakdown from `explain_nonisbits`: `.<field> is of type <T> which is not isbits.` Pre-check: `isbitstype(typeof(x))`.

**4. GC allocation in kernel** — no GC on-device; no `Array/Vector(undef,...)`, `[1,2,3]` literals, `string(...)`, `push!`.
```julia
# WRONG (inside a kernel)
buf = Vector{Float32}(undef, n)   # -> InvalidIRError: call to jl_alloc_array_1d
# RIGHT
buf = @MVector zeros(Float32, 4)  # StaticArrays, stack-based, isbits (§4) — or preallocate outside
```
Error: `InvalidIRError ... Reason: unsupported call to the Julia runtime (call to jl_alloc_array_1d / jl_alloc_string / jl_alloc_genericmemory)`.

**5. Boxed capture** — a non-`const` global captured in a closure broadcast over a `CuArray` gets boxed (`Core.Box`); the error names NEITHER the global NOR the closure.
```julia
# WRONG — param is a non-const global -> boxed capture
param = 1.0
g(x) = f(param, x)
g.(cu_xs)  # InvalidIRError: unsupported dynamic function invocation (call to index)
# RIGHT — let-bound capture, or a callable struct with a concretely-typed field
const g = let p = param; x -> f(p, x); end
struct G{P} <: Function; p::P; end
(_g::G)(x) = f(_g.p, x)
```
Tell: identical error shape to class 2, but names neither `param` nor the closure.

---

## §2 Kernel I/O and control-flow bans

**`@cuprintf`-family is the only device I/O.** Only `@cuprintf`/`@cuprint`/`@cuprintln`/`@cushow`/`@cuassert`; interpolation limited to C-primitive scalars (Int16/32/64, UInt*, Float32/64, Char, Ptr). Interpolating a struct/array (or `string`/`print`/`@sprintf`) fails like any other heap allocation (class 4).
```julia
# WRONG
@cuprintln("x = $(some_struct)")
# RIGHT
@cuprintln("x.a = $(some_struct.a), x.b = $(some_struct.b)")
```
Docs verbatim: "`@cuprintln` ... does support string interpolation, but the types it can print are restricted to C primitives."

**No `try`/`catch` in device code.** No stack unwinding on CUDA. An unhandled device exception raises `KernelException` on the HOST only at the next blocking call (typically `synchronize()`), never at `@cuda` itself.
```julia
# WRONG — expecting synchronous error surfacing
@cuda k(a)          # does NOT throw here even if k(a) hits a BoundsError
# RIGHT
@cuda k(a)
synchronize()        # KernelException raised here, if anywhere
```
Docs verbatim: "CUDA does not support stack unwinding, which is why try-catch blocks aren't supported in device code." `-g2` julia flag → full device stacktrace; `-g0` → suppress; default `-g1` → short message. Skipping/delaying `synchronize()` silently runs atop a corrupted/aborted kernel.

---

## §3 Device math intrinsics — Float32/Float64 only

`CUDA.sin`/`CUDA.exp`/`CUDA.pow`/etc. are defined ONLY for `Float32`/`Float64`. Calling one on e.g. `Int64` is not an ordinary `MethodError` — inference concludes the call unconditionally throws, so the kernel's return type collapses to `Union{}` and the error names nothing about the offending call.
```julia
# WRONG
@cuda kernel(CuArray([1]))       # Int64 -> KernelError: kernel returns a value of type `Union{}`
# RIGHT
@cuda kernel(CuArray(Float32[1]))
```
Error: `` KernelError: kernel returns a value of type `Union{}` ``. Diagnose: `@device_code_warntype interactive=true @cuda kernel(a)`, descend with Cthulhu.jl to the `::Union{}` call. Fix: convert to Float32 (device-standard, GK4) or Float64 first.

## §4 StaticArrays inside kernels

`SVector`/`MVector`/`MArray` ARE legal — fixed-size, isbits, no GC — but `[dated:2026-07]` on Julia >= 1.10 a non-`@inbounds` construction/indexing can trigger hidden GC-frame codegen that fails IR validation with unfamiliar intrinsics, unrelated to StaticArrays or bounds. Always wrap StaticArrays construction/indexing in kernels with `@inbounds`.
```julia
# WRONG (Julia >= 1.10, no @inbounds) — compiled on 1.9.4, fails on 1.10.2
for o = 1:3; B[o] = A[o] * SVector{1,Float32}(1.0f0); end
# RIGHT
for o = 1:3; @inbounds B[o] = A[o] * SVector{1,Float32}(1.0f0); end
```
Error: `InvalidIRError: ... Reason: unsupported call to an unknown function (call to julia.new_gc_frame, julia.push_gc_frame, julia.get_gc_frame_slot, julia.pop_gc_frame)`. Confirmed fix: JuliaGPU/CUDA.jl#2313 (closed) — add `@inbounds`.

---

## §5 Launch configuration — the occupancy-derived idiom

**1. Derive off the compiled kernel — never hand-pick numbers.** Compile with `launch=false`, call `launch_configuration` on the compiled object's `.fun` — NOT the bare function.
```julia
# WRONG — guessed config; also WRONG target (bare function, not compiled kernel)
@cuda threads=1024 blocks=1 gpu_add!(y, x)
launch_configuration(gpu_add!)   # MethodError: no method matching launch_configuration(::typeof(f))
# RIGHT
kernel  = @cuda launch=false gpu_add!(y, x)
config  = launch_configuration(kernel.fun)
threads = min(length(y), config.threads)
blocks  = cld(length(y), threads)
kernel(y, x; threads, blocks)
```
A hardcoded count ignoring register/shmem pressure throws `CUDA_ERROR_LAUNCH_OUT_OF_RESOURCES` on some kernels and under-occupies SMs on a different GPU.

**2. 1-based index — never transliterate CUDA C.** `threadIdx()`/`blockIdx()`/`blockDim()`/`gridDim()` are all 1-based.
```julia
# WRONG — 0-based C formula
i = blockIdx().x * blockDim().x + threadIdx().x
# RIGHT
i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
```
Failure: the first `blockDim().x` elements are never touched; the last block reads past the end — silent corruption under `@inbounds`, or an illegal-memory-access error at the next sync. Grep for the bug signature: `blockIdx\(\)\.x \* blockDim\(\)\.x \+ threadIdx\(\)\.x` (missing `- 1`).

**3. Bounds guard — placement, and the elision caveat.** Guard immediately after the index, BEFORE any access — required whenever `cld(N, threads)` over-provisions (i.e. always, unless N divides threads exactly).
```julia
# WRONG — no guard
function kernel!(A)
    i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    @inbounds A[i] = i
    return
end
# RIGHT
function kernel!(A)
    i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    i > length(A) && return
    @inbounds A[i] = i
    return
end
```
Without the guard, over-provisioned threads write out-of-bounds — a nondeterministic crash or silent corruption surfacing asynchronously at a later, unrelated launch/`synchronize()`. To confirm the guard is missing: drop `@inbounds` and run once — a device `BoundsError` is the tell.

> **[api_warning] Bounds-check elision confirmed for the block-scoped form only.** `if i <= length(A) ... A[i] ... end` immediately dominating an access is confirmed (JuliaGPU/CUDA.jl#2621, merged) to let the compiler elide the redundant automatic bounds check. Whether the early-return form `i > length(A) && return` gets IDENTICAL elision is UNCONFIRMED — do not assert the two compile equivalently. Verify with `CUDA.code_llvm(kernel_fn, argtypes)` on both forms before claiming equivalence in a must-be-fast kernel.

**4. Block count — `cld(N, threads)`, never `÷`/`ceil`.**
```julia
blocks = N ÷ threads          # WRONG — truncates, drops the final partial block, NO error
blocks = ceil(N / threads)    # WRONG — Float64 round-trip, easy to forget Int(...)
blocks = cld(N, threads)      # RIGHT
```
Grep `N ÷ threads|div\(N,\s*threads\)|ceil\(.*\/.*threads\)` at any `blocks=` computation — any match instead of `cld` is the smell.

**5. Manual sizes: warp multiples, and query the real ceiling.** If not delegating to `launch_configuration` (item 1), pick a multiple of 32 (warp size) — never arbitrary.
```julia
@cuda threads=100 blocks=cld(N, 100) kernel!(A)   # WRONG — last warp 87.5% idle
@cuda threads=256 blocks=cld(N, 256) kernel!(A)   # RIGHT
```
Register-pressure detail (`maxregs`, Int32 indices) is `memory-and-warps.md` territory; this is only the block-size-vs-warp-size shape. Never assume 1024 threads/block always works — query the kernel-specific ceiling:
```julia
kernel = @cuda launch=false my_kernel!(args...)
cap = CUDA.maxthreads(kernel)   # kernel-specific cap, may be < 1024
threads = min(cap, 256)
```
Launching above `CUDA.maxthreads(kernel)` throws `CUDA_ERROR_LAUNCH_OUT_OF_RESOURCES` deterministically; `launch_configuration` (item 1) already respects this — only matters when you must hardcode.

**6. Grid-stride loop — the decision rule.** Use `for i = index:stride:N` ONLY when the grid is occupancy-derived and NOT sized to exactly cover N (`blocks*threads` may be < N). If sized exactly via `cld(N, threads)` (item 4), a single guarded access (item 3) suffices — no loop.
```julia
function kernel!(A, N)
    index  = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    stride = gridDim().x * blockDim().x
    for i = index:stride:N
        @inbounds A[i] += 1
    end
    return
end
kernel = @cuda launch=false kernel!(A, N)
config = launch_configuration(kernel.fun)
kernel(A, N; threads=config.threads, blocks=config.blocks)
```
Pairing an occupancy-derived grid with a one-shot (non-looping) body silently processes only the first `blocks*threads` elements — no error, just quietly wrong for large N. Check: `count(Array(A) .== expected) == N`.

**7. `shmem=` must match `CuDynamicSharedArray`.** A kernel using `CuDynamicSharedArray(T, dims)` needs a matching `shmem=` (bytes) on the `@cuda` call — the call itself does not reserve it.
```julia
@cuda threads=n reverse_kernel(a)                                  # WRONG — shmem= missing, defaults to 0
@cuda threads=n shmem=sizeof(eltype(a)) * n reverse_kernel(a)       # RIGHT
# inside reverse_kernel: b = CuDynamicSharedArray(eltype(a), n)
```
Omitting `shmem=` aliases unreserved memory — nondeterministic garbage or an intermittent illegal-memory-access, not a clean error. Grep for `CuDynamicSharedArray` and confirm the `@cuda` call site carries `shmem=` >= `sizeof(T) * length`.
