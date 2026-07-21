# GK3-AD — differentiating a kernel or a mutating CuArray op

> Read when: a kernel or an in-place CuArray op sits on a training path (Flux/Lux/Zygote/Enzyme
> anywhere in the project) — before assuming Zygote "just handles it". Verified live 2026-07 on
> CUDA.jl 6.2.1 / Zygote 0.7.11 / ChainRulesCore 1.26.1 / Julia 1.12.6 (RTX 3060); every error
> string below is quoted from that run, not from memory.

## §1 Why Zygote cannot see a kernel — foreign-call class

`@cuda` launches a GPU kernel through a foreign call (same compiler class as `ccall`). Zygote's
IR tracer cannot descend into it — there is no adjoint to find because none is defined:

```
grep -rE 'rrule|@adjoint' ~/.julia/packages/CUDA/*/src ~/.julia/packages/GPUArrays/*/src
```
→ **ZERO hits** `[dated:2026-07]`. Not a missing edge case; the package has no opinion on
differentiability at all. A raw `@cuda` kernel wrapped in a function Zygote thinks it
understands produces no error — it silently returns a wrong gradient. Absence of an error is
not evidence of correctness here; only a gradient test (§8) is.

### Mutation — the failure escalates on GPU

Reverse-mode AD needs pre-mutation values; in-place writes destroy them, so both Array and
CuArray reject mutation in the tracer — the CuArray error is strictly worse:

- **Array**: `Zygote.gradient(x -> sum(x .= 2 .* x), rand(Float32, 8))` →
  `ERROR: Mutating arrays is not supported -- called copyto!(...)` — Zygote's own
  `@adjoint! setindex!/copyto!` → `_throw_mutation_error` (`Zygote/src/lib/array.jl:81-85`).
  Names the offending call.
- **CuArray — worse, verified live**:
  `Zygote.gradient(x -> sum(x .= 2 .* x), CUDA.rand(Float32, 8))` →
  `MethodError: objects of type IRTools.Inner.Undefined are not callable`. The broadcasted
  `.=` routes through `GPUArrays._copyto!` + the CUDABackend KernelAbstractions indirection;
  Zygote's tracer chokes on that indirection BEFORE reaching the friendly `copyto!` adjoint.
  **A confusing internal-crash message, not the documented mutation error** — if you see
  `IRTools.Inner.Undefined`, the root cause is GPU in-place mutation under Zygote, not an
  IRTools version mismatch.

### Scalar indexing — the misleading FIRST error

A naive host-loop scan over a CuArray hits `Scalar indexing is disallowed.` before either AD
error above fires. It is CUDA.jl's forward-pass `allowscalar(false)` guard, not an AD
limitation — but firing first makes it easy to mistake for "the AD problem". Fix the indexing
(vectorize or move to a kernel), then re-check for the real AD failure underneath;
`debugging.md` owns the general scalar-indexing triage.

## §2 The fix — ChainRulesCore.rrule, not Zygote.@adjoint

`Zygote.@adjoint` is **legacy**. The installed docs say so verbatim: *"Prefer to use
ChainRulesCore... can consider it as documenting a legacy feature."* `[dated:2026-07]`
Zygote's `ZygoteRuleConfig` picks up any `ChainRulesCore.rrule` automatically and pre-empts IR
tracing entirely — define the rrule and Zygote never attempts to descend into the kernel.

Supporting primitives, all in scope:

- **`ProjectTo` never copies device memory** — it captures only `axes` + `eltype`; calling the
  resulting projector on a cotangent is safe inside a GPU rrule, no silent CPU round-trip.
- **`@non_differentiable f(...)`** for shape/config helpers that must never enter the tape
  (index computation, size queries); **`ignore_derivatives() do ... end`** for an inline
  sub-expression that must run but must not be traced.
- The reverse pass is usually a **second, hand-written kernel** — nothing differentiates the
  forward kernel for you (example A below).

## §3 Complete verified example A — elementwise `a .* x.^2`

Exact gradient match, 0.0 error against the CPU/ForwardDiff oracle (§8). Keep verbatim —
this is the reference shape for any elementwise kernel + rrule pair.

```julia
using CUDA, ChainRulesCore

function _scaled_square_kernel!(y, a, x)
    i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    if i <= length(y)
        @inbounds y[i] = a[i] * x[i]^2
    end
    return nothing
end

function scaled_square(a::CuArray{T}, x::CuArray{T}) where {T}
    y = similar(x)
    n = length(x)
    kernel = @cuda launch=false _scaled_square_kernel!(y, a, x)
    config = launch_configuration(kernel.fun)
    threads = min(n, config.threads); blocks = cld(n, threads)
    kernel(y, a, x; threads, blocks)
    return y
end

function _scaled_square_grad_kernel!(da, dx, dy, a, x)
    i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    if i <= length(dy)
        @inbounds begin
            xi = x[i]
            da[i] = dy[i] * xi^2
            dx[i] = dy[i] * 2 * a[i] * xi
        end
    end
    return nothing
end

function scaled_square_grad(dy::CuArray{T}, a::CuArray{T}, x::CuArray{T}) where {T}
    da = similar(a); dx = similar(x); n = length(x)
    kernel = @cuda launch=false _scaled_square_grad_kernel!(da, dx, dy, a, x)
    config = launch_configuration(kernel.fun)
    threads = min(n, config.threads); blocks = cld(n, threads)
    kernel(da, dx, dy, a, x; threads, blocks)
    return da, dx
end

function ChainRulesCore.rrule(::typeof(scaled_square), a::CuArray, x::CuArray)
    y = scaled_square(a, x)
    project_a, project_x = ProjectTo(a), ProjectTo(x)
    function scaled_square_pullback(ybar)
        dy = unthunk(ybar)
        da, dx = scaled_square_grad(dy, a, x)
        return (NoTangent(), project_a(da), project_x(dx))
    end
    return y, scaled_square_pullback
end
```
Drop-in for a Flux/Lux forward pass — the rrule resolves by ordinary dispatch on
`scaled_square(a, x)`, no layer-level wiring needed. This is what `SKILL.md`'s GK3-AD checklist
row means by "`ChainRulesCore.rrule` defined": forward kernel, separate reverse kernel, thin
rrule gluing them via `ProjectTo`.

## §4 Enzyme — a different rule system, narrower device coverage

Enzyme does not use ChainRulesCore; it dispatches on `EnzymeRules.augmented_primal` /
`EnzymeRules.reverse` — a hand-written rrule from §3 does not register with Enzyme and vice
versa. State, quoted from Enzyme's public FAQ (fetched 2026-07; note Enzyme.jl itself is NOT
installed in this environment — only the `EnzymeCore` interface package) `[dated:2026-07]`:

- **Device-side AD (differentiating INSIDE a kernel body) is supported. Host-side code that
  touches device memory is NOT.** FAQ verbatim: *"Differentiating host-side code when it
  accesses device memory (e.g. `sum(CuArray)`) is not yet supported."* Heterogeneous host+device
  AD needs a custom derivative rule (`@cuda` of a generated derivative kernel — available for
  KernelAbstractions kernels specifically).
- **Production precedent in this stack**: `NNlib/ext/NNlibEnzymeCoreCUDNNExt.jl` — Enzyme aborts
  on cuDNN's raw ccalls (`"unsupported tag gc-transition"`); the extension intercepts and hands
  the reverse pass to `cudnnActivationBackward` directly. Activation coverage confirmed;
  conv/batchnorm rules NOT found there (absence in one file ≠ confirmed absent — unverified,
  not "unsupported").
- `AutoEnzyme(; mode, function_annotation)` is real in ADTypes, **but** DifferentiationInterface's
  own GPU test suite exercises only `AutoSimpleFiniteDiff` on CuArray `[dated:2026-07]` — `DI +
  AutoEnzyme`/`AutoZygote` on GPU is your own integration work, not off-the-shelf.
- **Choice rule**: AD entirely inside one kernel body → Enzyme. A host-side function taking
  CuArray in, CuArray out (the common case) → hand-written `ChainRulesCore.rrule` (§2-3),
  Zygote-native, avoiding the host/device boundary Enzyme rejects.

## §5 SSM / scan verdict — where the free path ends

- `cumsum` on CuArray is **already** a real, work-efficient parallel-scan kernel
  (`CUDACore/src/accumulate.jl`, cites Blelloch 1990) **and already differentiable** — ChainRules
  ships an rrule for it (backward = `cumsum` of the reversed cotangent), dispatching on
  `AbstractArray` so it is free on CuArray. Verified live:
  `gradient(z -> sum(cumsum(z; dims=2)), CuArray)` works.
- **The gap, verified live**: `Zygote.gradient(z -> sum(accumulate(+, z; dims=2)), CUDA.rand(Float32,4,5))`
  → `"accumulate(op, x; dims) is not currently supported by ChainRules, sorry"`. The generic
  `accumulate` rrule only covers `dims === nothing` or a vector with `dims == 1`. **Batched N-D
  + a `dims` kwarg is exactly the Mamba/selective-scan shape — no free differentiable path. This
  THROW is the mechanical trigger that justifies a hand-written kernel, not a performance
  vibe.** `+`-shaped op → reach for `cumsum` and stop; fall through to a hand kernel only when
  `accumulate` throws this exact error on your shape.
- `CUDA.jl#1482` (custom struct-op scan → LLVM `ConstantExpr TypeError`) closed/fixed April
  2022; category-risk real, specific repro not re-tested on 6.2.1 — §9 UNVERIFIED.
- No existing Julia package ships a differentiable Mamba/selective-scan (`StateSpaceModels.jl`
  is Kalman, unrelated). `KernelForge.jl` (2026, on `KernelIntrinsics.jl`) claims a portable
  scan/mapreduce at CUB-level perf but makes no AD claim and is not installed — §9 UNVERIFIED.

## §6 Complete verified example B — diagonal-SSM recurrence

`h_t = a .* h_{t-1} + x_t`, parallel over (feature `f`, batch `b`), sequential over time `t` —
the shape `accumulate` cannot cover (§5). Gradient matches an independent ForwardDiff-on-CPU
oracle to ~1e-6 (§8). Keep verbatim, including the caveats after the code.

```julia
# h_t = a .* h_{t-1} + x_t,  parallel over (feature f, batch b), sequential over time t
function _ssm_forward_kernel!(h, a, x, Tlen, F, B)
    f = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    b = blockIdx().y
    if f <= F && b <= B
        @inbounds begin
            hprev = zero(eltype(h)); af = a[f]
            for t in 1:Tlen
                hprev = af * hprev + x[f, t, b]
                h[f, t, b] = hprev
            end
        end
    end
    return nothing
end
function ssm_forward(a::CuVector{T}, x::CuArray{T,3}) where {T}
    F, Tlen, B = size(x); h = similar(x)
    threads = min(F, 256); blocks = (cld(F, threads), B)
    @cuda threads=threads blocks=blocks _ssm_forward_kernel!(h, a, x, Tlen, F, B)
    return h
end

# adjoint recurrence runs BACKWARD in time: dh_t = dy_t + a*dh_{t+1}; dx_t = dh_t; da = Σ_t dh_t*h_{t-1}
function _ssm_backward_kernel!(dx, da_partial, a, h, x, dy, Tlen, F, B)
    f = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    b = blockIdx().y
    if f <= F && b <= B
        @inbounds begin
            af = a[f]; dhnext = zero(eltype(dx)); dacc = zero(eltype(dx))
            for t in Tlen:-1:1
                dh = dy[f, t, b] + af * dhnext
                hprev = t == 1 ? zero(eltype(h)) : h[f, t-1, b]
                dacc += dh * hprev
                dx[f, t, b] = dh
                dhnext = dh
            end
            da_partial[f, b] = dacc
        end
    end
    return nothing
end
function ssm_backward(dy::CuArray{T,3}, a::CuVector{T}, h::CuArray{T,3}, x::CuArray{T,3}) where {T}
    F, Tlen, B = size(x); dx = similar(x); da_partial = CUDA.zeros(T, F, B)
    threads = min(F, 256); blocks = (cld(F, threads), B)
    @cuda threads=threads blocks=blocks _ssm_backward_kernel!(dx, da_partial, a, h, x, dy, Tlen, F, B)
    return vec(sum(da_partial; dims=2)), dx   # batch-reduce via ALREADY-differentiable sum
end
function ChainRulesCore.rrule(::typeof(ssm_forward), a::CuVector, x::CuArray{<:Any,3})
    h = ssm_forward(a, x)
    project_a, project_x = ProjectTo(a), ProjectTo(x)
    function ssm_forward_pullback(hbar)
        da, dx = ssm_backward(unthunk(hbar), a, h, x)
        return (NoTangent(), project_a(da), project_x(dx))
    end
    return h, ssm_forward_pullback
end
```
**Caveats (do not drop when reusing this)**: embarrassingly parallel over `(F, B)` only — real
speedup needs `F*B` to saturate the GPU; NOT the log-depth Blelloch scan `cumsum` uses, this is
O(T) sequential per (f,b) lane; production Mamba chunks time instead (SSD/Mamba-2); saves the
WHOLE forward `h` with no checkpointing — production kernels trade memory for that.

## §7 Decision gate — hand-write an AD path only when ALL hold

1. **No composable primitive covers it.** `+`/cumsum-shaped → `cumsum`, stop here. Other
   associative op, batched N-D, `dims` kwarg present → `accumulate` THROWS the exact string in
   §5 (mechanical trigger, not a vibe — no throw, no need for this section).
2. **The AD cost is real and asymmetric.** A backward kernel costs at least as much engineering
   as the forward kernel, and a WRONG rrule does not error — loss still goes down, the bug ships
   as a subtly-worse model discovered weeks later. Budget for this before starting.
3. **Commit to the gradient check (§8) in the SAME change.** Cannot state in one sentence why
   `cumsum`/`accumulate`/`mapreduce`/broadcast fusion doesn't cover your op → you have not
   earned the hand kernel — back to `SKILL.md` §1 GK0.

## §8 Gradient testing — do not trust "loss goes down"

- **Independent-AD-oracle recipe (strongest; used to verify both examples above)**:
  differentiate the pure-Julia CPU reference with an INDEPENDENT AD backend — ForwardDiff,
  immune to the mutation limits in §1 — and compare against the GPU-kernel path differentiated
  by Zygote (via your rrule). Both exact-to-roundoff, no FD step-size tuning. Caught 0.0 error
  on example A, ~1e-6 on example B (Float32 summation-order rounding, expected). (Zygote's own
  docs recommend another AD backend as the workaround for its mutation limits — ForwardDiff is
  that recommendation; using it as the gradient-test oracle is this skill's discipline.)
- **Finite differences (FD) — fallback only, mind Float32**: a Float64-tuned FD step (`1e-5`) is
  nonsensical against Float32 data (`eps(Float32) ≈ 1.2e-7`). If you must FD-check, compute the
  reference gradient in Float64 ON THE CPU, compare the GPU Float32 rrule at `rtol ~
  1e-3..1e-2`, not tighter.
- `ChainRulesTestUtils.test_rrule([config,] f, args...; kwargs...)` is the library-standard
  entry point — signature confirmed from official docs; **UNVERIFIED: exact `rtol`/`atol`
  defaults** (not installed here) — set tolerance explicitly rather than trust the default.
- **Test more than one size AND a non-trivial batch dimension.** Single-block vs multi-block
  paths differ inside `accumulate.jl` (`:165-195`) — one small-size test can pass while a larger
  shape takes a different, buggy path. `B == 1` hides batch-reduction bugs (the
  `sum(da_partial; dims=2)` step in example B) — always include `B > 1`.

## §9 UNVERIFIED — do not state these as fact

1. `CUDA.jl#1482` (struct-op scan → LLVM `ConstantExpr TypeError`) — closed/fixed April 2022,
   NOT re-tested on 6.2.1. Category-risk real; current trigger unconfirmed.
2. `KernelForge.jl`/`KernelIntrinsics.jl` (2026) — abstract-level portable CUB-level
   scan/mapreduce claim; no AD claim; not installed, not run.
3. `ChainRulesTestUtils.test_rrule` default `rtol`/`atol` — not installed here; set tolerances
   explicitly instead of relying on the default.
4. `DifferentiationInterface` + `AutoEnzyme`/`AutoZygote` on CuArray — DI's own CI exercises
   only `AutoSimpleFiniteDiff` on GPU; treat any other backend through DI on GPU as unverified.
5. NNlib `EnzymeRules` coverage beyond cuDNN activation — "not found in one extension file" ≠
   "confirmed absent"; don't assert conv/batchnorm Enzyme support is missing without checking
   current NNlib source.
