---
name: model-julia
description: Set up Julia and write correct, performant, modern "model Julia" for theoretical research — one first choice per task, no ambiguous alternatives. Use whenever the user runs Julia or does numerical experiments, AD/gradients, optimization, polynomial/symbolic computation, or differential equations. Trigger on DifferentiationInterface.jl, ADTypes.jl, ForwardDiff.jl, Enzyme.jl, Zygote.jl, Reactant.jl, JET.jl, DispatchDoctor.jl, AllocCheck.jl, Chairmarks.jl, OhMyThreads.jl, ComponentArrays.jl, StaticArrays.jl, HomotopyContinuation.jl, SymEngine.jl, Manopt.jl, Julia setup, or TTFX / first-execution / precompile latency. MANDATORY — read this skill BEFORE writing ANY Julia code. §2.0 forbids FD (use AD), grid sampling (use optimization), lerp-as-evaluation. §2.7 mandates DifferentiationInterface as the AD frontend; raw backend calls are the exception. §2.7.4 Dual-propagation rules MUST be followed whenever AutoForwardDiff is in the path. §4 mandates SymEngine.jl for symbolic algebra; Symbolics.jl is FORBIDDEN unless SciML integration is explicit.
---

# Model Julia — Research Environment & Coding Discipline

> **Version**: v2606.4.0 (2026-06-06, Julia 1.12.6 baseline)
> **Runtime profile (READ FIRST — this skill has two layers)**:
> 1. **Julia coding discipline (§1, §2, §4, §6) — portable.** The methodology, AD frontend, performance, verification, and package choices apply on any host.
> 2. **Container operations (§3, §5, §7) — Claude/Anthropic-specific.** Paths (`/home/claude`, `/mnt/user-data/outputs`), `present_files`, the AmazonS3 tarball install, and the Cloudflare/egress notes assume the Claude container.
>
> If the runtime is **not** the Claude container (local shell, GitHub Actions, Codespaces, another assistant), ignore §3/§5/§7 and use the host's own install, run, and output conventions — but keep all of §1/§2/§4/§6 unchanged.
> **Scope**: Primary target is LLM execution in a Linux container (Ubuntu, ephemeral filesystem; Julia per-session via direct Amazon S3 tarball — §3). Read the entire skill before writing any code.
> **Out of scope**: Interactive local development (Revise.jl, TestItems.jl, JETLS, Cthulhu interactive descend). Handled by a separate skill — see §8.
> **Axis of change (v2604.2.0 → v2606.3.0, narrative)**: The AD layer is restructured around **DifferentiationInterface.jl + ADTypes.jl** as the single frontend (§2.7), demoting ForwardDiff/Enzyme/Zygote to interchangeable backends and folding the old §2.7 Dual rules into §2.7.4 as backend-specific hazards. A new **§2.9 Modern Toolchain Map** documents the tools first introduced there (StaticArrays, ComponentArrays, Reactant/Lux, OhMyThreads) plus a quick-selection table; AD/instability/benchmark tools are not re-explained there — they live in §2.7/§2.8/§2.6 and are indexed by the table. §2.6 makes Chairmarks the default benchmarker, BenchmarkTools the conditional exception. §4 package tables rewritten around the modern stack. The §2.0 methodology discipline (FD / grid / lerp forbidden) is unchanged — it remains the precedence-setting section. Also folds in `similar(A)` genericity (§2.3), `Runic` as the standard formatter (§4), and `startup.jl`+Revise for local work (§8). Community-trend items (Colab support, JuliaSyntax/JuliaLowering compiler internals) are deliberately excluded — they are ecosystem news, not coding directives.
> **Changelog (recent)**:
> - v2606.4.0: §3.5 rewritten as the **TTFX (Time To First eXecution) layered countermeasure map** — names the problem explicitly and orders the fix into 4 layers (Julia ≥1.9 package images → PrecompileTools → depot caching → sysimage/AOT), flagging depot caching (Layer 2) as the dominant lever in the ephemeral container. Prior content (the `@compile_workload` example, depot tar + match constraints, Symbolics-not-cached rule) preserved, repositioned by layer. Layer 3 + §3.6 updated after source survey: the 1.12 AOT face is **`juliac` / `JuliaC.jl`** (gcc-like driver wrapping `--trim`, companion to PackageCompiler), not bare `--trim` — still deployment-only, fails on dynamic dispatch. Claims verified against julialang.org 1.12 highlights and the PrecompileTools README.
> - v2606.3.1: editorial corrections (external review). HiGHS scope fixed to LP/MILP/convex QP, SDP/SOCP routed to conic solvers (§4). DI `prep` type/size-invariance and thread-safety constraints made explicit (§2.7.2). SymEngine claim narrowed to algebraic manipulation, not full SymPy solve/integrate/dsolve (§4). FD prohibition scoped to derivative *estimation*, not FD discretizations (§2.0.1). Reactant tracing constraint stated accurately (§2.9.3). Runtime profile (portable vs container) split out (above). Over-strong wording softened.
> - v2606.3.0: see Axis of change above.
> - v2604.2.0: §2.0 Numerical Methodology Discipline added (FD / grid / lerp forbidden by default).
> - v2604.1.3: §4 SymEngine empirically verified; `Basic` string-equality comparison forbidden.
> - v2604.1.0: §2.8 (JET/AllocCheck), §3.5 (PrecompileTools), §3.6 (Julia 1.12), §8 (handoff) added.

This skill bootstraps a complete Julia environment and provides coding rules partitioned by consequence:
- **§1–§2.0**: Correctness and methodology — violating these produces wrong results or the wrong method
- **§2.1–§2.6**: Hot-path performance — relevant for repeated computation
- **§2.7–§2.8**: AD frontend (DifferentiationInterface) and static verification — required for any differentiated or hot-path code
- **§2.9**: Modern toolchain map — which tool for which job in the 2024–2025 ecosystem
- **§3–§7**: Environment operations — specific to this execution context
- **§8–§9**: Out-of-scope handoff and final checklist

---

## 1. CRITICAL: Python → Julia Pitfall Cheatsheet

**Read this section first. Every item below is a real bug that LLMs produce.**

### 1.1 Syntax that will crash

| Python | Julia | Notes |
|---|---|---|
| `A @ B` | `A * B` | Matrix multiply. `@` is macro prefix in Julia |
| `A[0]` | `A[1]` | **1-indexed everywhere** |
| `A[0, 0]` | `A[1, 1]` | Same for matrices |
| `A[-1]` | `A[end]` | Last element |
| `A[1:3]` | `A[1:3]` | Same syntax BUT Julia includes both ends (closed interval) |
| `def f(x):` | `function f(x) ... end` | Blocks close with `end`, not indentation |
| `for i in range(n):` | `for i in 1:n ... end` | `end` required; `1:n` not `0:n-1` |
| `if x: ... elif: ... else:` | `if x ... elseif ... else ... end` | `elseif` not `elif` |
| `f"x={x}"` | `"x=$x"` or `"x=$(expr)"` | String interpolation uses `$` |
| `x // y` | `div(x, y)` or `x ÷ y` | `//` creates Rational in Julia |
| `import time; time.time_ns()` | `time_ns()` | Top-level function, no module prefix |
| `None` | `nothing` | |
| `True / False` | `true / false` | Lowercase |
| `len(x)` | `length(x)` | |
| `x.append(v)` | `push!(x, v)` | Mutating functions end with `!` |
| `{}` (dict) | `Dict()` | |
| `lambda x: x+1` | `x -> x+1` | |
| `print(x)` | `println(x)` | `print` doesn't add newline |
| `not / and / or` | `! / && / \|\|` | |
| `x ** 2` | `x ^ 2` | |
| `isinstance(x, T)` | `isa(x, T)` or `x isa T` | |

### 1.2 Semantics that silently produce wrong results

```julia
# WRONG: Python/NumPy-style assumption that `*` is element-wise
result = A * B   # This is matmul, not element-wise!
# RIGHT:
result = A .* B  # Element-wise multiply (dot-broadcast)

# WRONG: sort a Dict by keys (isless undefined for heterogeneous values)
sort(collect(my_dict))
# RIGHT:
for k in sort(collect(keys(my_dict)))
    v = my_dict[k]
end

# WRONG: Global variable in hot loop (type instability → 100x slower)
threshold = 0.5
function slow_count(arr)
    c = 0
    for x in arr
        if x > threshold  # captures global → type-unstable
            c += 1
        end
    end
    c
end
# RIGHT: Pass as argument
function fast_count(arr, threshold)
    c = 0
    for x in arr
        if x > threshold
            c += 1
        end
    end
    c
end

# WRONG: Untyped container accumulation
results = []          # Vector{Any} → slow
push!(results, 1.0)
# RIGHT:
results = Float64[]   # Vector{Float64} → fast
push!(results, 1.0)
```

---

## 2. Methodology and Performance Discipline

§2.0 sets the **methodology** (what numerical approach is allowed). §2.1–§2.9 cover **performance, AD, verification, and tooling** (how to write the chosen approach correctly). §2.0 takes precedence: a fast implementation of the wrong method is still wrong.

### 2.0 Numerical Methodology Discipline (READ FIRST — FD / grid / lerp are FORBIDDEN by default)

LLMs habitually fall into three numerical-method pitfalls. **All three are FORBIDDEN as the primary approach.** Permitted exceptions are listed; if you must invoke one, write a one-line comment in the code stating which exception applies. **Do not deviate silently.**

#### 2.0.1 Finite-difference derivative *estimation* — FORBIDDEN. Use AD.

This forbids estimating the derivative/gradient/Jacobian/Hessian of a smooth numerical objective by finite differencing. It does **not** forbid finite-difference *discretizations* where the mathematical method itself is a finite-difference scheme — PDE stencils, method-of-lines spatial derivatives, etc. are legitimate numerics, not derivative estimation.

```julia
# WRONG — estimating a derivative of a smooth objective by differencing
df_dx ≈ (f(x + 1e-5) - f(x - 1e-5)) / 2e-5     # central FD
df_dx ≈ (f(x + h) - f(x)) / h                   # forward FD

# RIGHT — use AD through DifferentiationInterface (§2.7)
using DifferentiationInterface
import ForwardDiff
backend = AutoForwardDiff()
df_dx = derivative(f, backend, x)               # scalar derivative
∇f    = gradient(f, backend, x)                # gradient
H     = hessian(f, backend, x)                 # Hessian
# For input_dim ≫ 100, switch backend to AutoEnzyme() — see §2.7
```

**Why**: FD derivative estimation has a precision floor at ~√(eps) ≈ 1e-8, forces step-size tuning, kills high-order derivatives (errors compound), and silently corrupts optimizer convergence. AD has machine precision, no tuning, and composes for higher derivatives.

**Permitted exceptions** (write the exception in a comment):
- Cross-checking an AD-computed gradient at one point during initial development (DI provides `DifferentiationInterfaceTest` for exactly this — prefer it over hand-rolled FD). Forbidden as the primary method.
- The function calls an opaque external solver with no AD support. Prefer wrapping the solver in a `ChainRulesCore.rrule` over reaching for FD.

#### 2.0.2 Grid sampling — FORBIDDEN. Solve the optimization or compute directly.

```julia
# WRONG — sweeping a continuous parameter to find an optimum
best = Inf
for x in range(a, b, length=N), y in range(c, d, length=M)
    v = f(x, y)
    v < best && (best = v; argmin = (x, y))
end

# RIGHT — solve the optimization. Pick by problem shape (each shape has one answer):
using Optim
result = Optim.optimize(v -> f(v[1], v[2]), [x0, y0], LBFGS();
                       autodiff = :forward)  # AD per §2.0.1
# Unconstrained smooth → Optim (above). Constrained/structured → JuMP.
# 1-D root → Roots.jl. Feasible set is a manifold → Manopt (§4). Closed form → use it.
```

**Why**: N^D scaling (curse of dimensionality), resolution-bounded, no convergence guarantee, wastes compute on irrelevant regions. Consistent with the OMT discipline "grid/column generation forbidden".

**Permitted exceptions** (write the exception in a comment):
- Visualization (plotting f over a region — the grid IS the deliverable).
- Exhaustive enumeration of a genuinely *discrete* small set (e.g., ≤ 100 combinatorial cases).
- The problem is provably non-smooth / non-convex / NP and grid is the agreed approximation. Document the agreement.

#### 2.0.3 Linear interpolation (lerp) as a substitute for evaluation — FORBIDDEN. Evaluate exactly.

```julia
# WRONG — tabulate on coarse grid, lerp to query points
xs = range(a, b, length=100)
ys = [f(x) for x in xs]
function f_lerp(query)
    i = searchsortedfirst(xs, query)
    t = (query - xs[i-1]) / (xs[i] - xs[i-1])
    return (1-t)*ys[i-1] + t*ys[i]   # O(h^2) error injected silently
end

# RIGHT — evaluate exactly at the query point
val = f(query)
# If f is genuinely expensive, use a proper interpolant WITH ERROR BOUNDS:
using Interpolations  # or ApproxFun.jl for Chebyshev
itp = cubic_spline_interpolation(xs, ys)  # O(h^4), bounds analyzable
```

**Why**: lerp injects an O(h²) error that becomes the *dominant* error in any downstream analysis requiring smoothness, derivatives, or convergence rates. AD on a lerp'd function produces a piecewise-constant "derivative" that is meaningless.

**Permitted exceptions** (write the exception in a comment):
- Visualization at sub-pixel scales (the lerp IS the rendering).
- Deliberate piecewise-linear models where linearity is part of the formulation (FEM with P1 elements, control schedules with linear ramps).

#### Combined pattern: grid + lerp = doubly wrong

The most common LLM failure mode combines §2.0.2 and §2.0.3: "evaluate `f` on a 100-point grid, then `lerp` to 10000 query points." Both forbidden. Either compute analytically/AD, or use a proper interpolant with documented error bounds — never the grid+lerp combination.

---

### 2.1 Type Stability

*Sections 2.1–2.6 cover hot-path performance. Julia's speed comes from type specialization; these rules matter most for functions called repeatedly or on large data. A one-off computation can ignore pre-allocation; a tight numeric loop cannot. For mechanical verification of the rules in this subsection, see §2.8 (JET / DispatchDoctor).*

Every function must return a consistent type for given argument types.

```julia
# BAD: returns Int or Float64 depending on the value of x
function bad(x)
    x > 0 ? x : 0.0
end

# GOOD: consistent return type
function good(x)
    x > 0 ? x : zero(x)
end
```

Detect instability three ways, escalating in power:
- `@code_warntype f(args...)` — quick, shows `Any`/`Union` in red, but only the outermost frame.
- `JET.@test_opt f(args...)` — descends the whole call tree; use in test suites (§2.8).
- `Cthulhu.@descend f(args...)` — interactive, follows inference into callees (local only — §8).

### 2.2 No Globals in Hot Paths

Never reference module-level mutable variables from inner loops. Pass everything as function arguments. If a global is truly needed, annotate with `const`:

```julia
const SIGMA = 10.0   # const → type-stable
const RHO = 28.0
const BETA = 8.0 / 3.0
```

### 2.3 Pre-allocate Outputs

```julia
# BAD: allocates new array every call
function bad_compute(A, B)
    return A * B   # allocates result
end

# GOOD: mutating version for repeated calls
function good_compute!(C, A, B)
    mul!(C, A, B)  # writes into pre-allocated C
end
```

For the specific case of small fixed-size vectors/matrices (e.g. v ∈ ℂ^d with d ≤ ~12), do not pre-allocate at all — use `StaticArrays` (§2.9.1), which stack-allocates and eliminates the bookkeeping entirely.

When you do allocate a working array inside a generic function, build it with `similar(A)` / `zero(A)`, never `Array{Float64}(undef, size(A))`. `similar` inherits the input's element type *and* its array type, so the same code stays correct when `A` is a `CuArray` (stays on GPU), an `SArray`, or a `Dual`-element array under AD. Hard-coding `Array{Float64}` silently forces a CPU `Float64` allocation and breaks all three. This is the SciML genericity rule: write to the input's type, not to a concrete one.

### 2.4 Use Broadcasting (dot syntax)

```julia
# BAD: manual loop for element-wise ops (unless you need index logic)
for i in 1:length(v)
    w[i] = sin(v[i])
end

# GOOD: broadcast, fused (no intermediate arrays)
w .= sin.(v)

# Fuse a whole expression with @.:
y = @. sin(v) + cos(v) * 2   # one pass, zero intermediates
```

### 2.5 Use @inbounds and @simd for tight numeric loops

`@inbounds` disables bounds checking — only use when you have verified that all indices are in range. `@simd` requires loop iterations to be independent.

```julia
function dot_product(a, b)
    s = 0.0
    @inbounds @simd for i in eachindex(a)
        s += a[i] * b[i]
    end
    s
end
```

### 2.6 Benchmarking

Always warm up before timing — never trust the first call (it includes compilation).

**Default: `Chairmarks.@b`.** Comparable precision to BenchmarkTools in ordinary use, can run far faster, and has a `setup → body` form that keeps allocation out of the measurement.

```julia
using Chairmarks
@b f($args...)        # minimum time; $ interpolates so globals aren't measured
@be f($args...)       # full statistics when you need the distribution
@b rand(1000) sum     # 2-arg form: setup → body, `_` is the piped input
```

**Use `BenchmarkTools.@btime` only when** the task explicitly needs a `BenchmarkGroup` (a structured suite of named benchmarks) or its tuning/parameters machinery — typically a CI performance-regression suite, not interactive work.

```julia
using BenchmarkTools
@btime f($args...)    # only inside a BenchmarkGroup suite, per the condition above
```

Whichever runs: warm up, interpolate args with `$`, never time a bare global.

### 2.7 Automatic Differentiation — DifferentiationInterface is the frontend (CRITICAL)

**The default way to differentiate is through `DifferentiationInterface.jl` (DI), selecting a backend via an `ADTypes.jl` object.** Do not scatter raw `ForwardDiff.gradient` / `Zygote.gradient` / `Enzyme.autodiff` calls through research code. DI gives one call site, swappable backends, and a `prepare_*` mechanism that amortizes one-time work across repeated differentiation — which is exactly the situation in many optimizer inner loops and pricing oracles.

#### 2.7.1 The single pattern

```julia
using DifferentiationInterface
import ForwardDiff, Enzyme, Zygote   # only the backends you actually use

f(x) = sum(abs2, x)
x = [1.0, 2.0]

# Backend is a value you pass in — swap by changing one argument:
value_and_gradient(f, AutoForwardDiff(), x)   # (5.0, [2.0, 4.0])
value_and_gradient(f, AutoEnzyme(),      x)   # same, LLVM-level reverse mode
value_and_gradient(f, AutoZygote(),      x)   # same, source-to-source reverse

# Operators: derivative, gradient, jacobian, hessian, pushforward (JVP),
#            pullback (VJP), hvp (Hessian-vector product),
#            and the value_and_* and *! (in-place) variants.
```

#### 2.7.2 Preparation — mandatory for repeated differentiation

When the same function is differentiated many times (gradient descent, column generation, pricing oracle, MCMC), **prepare once, reuse**. This is one of the largest DI performance levers; skipping it can cost an order of magnitude.

```julia
backend = AutoForwardDiff()
prep = prepare_gradient(f, backend, zero(x))   # one-time: config, tapes, coloring
# ... inside the hot loop:
for k in 1:iters
    g = gradient(f, prep, backend, xₖ)         # reuses prep — no re-setup
    # ...
end
```

**Reuse is conditional — two constraints the API enforces:**
1. A `prep` is valid only while the function, backend, and the input's **type and size** are unchanged. Change any of these (e.g. switch `Float64` → a `Dual`, or resize the input) and the `prep` is invalid — re-prepare. Under the default `strict=Val(true)`, DI type-checks prep-vs-execution; size-checking is left to you.
2. A `prep` is **not thread-safe**. It is mutated by every operator call (even the non-`!` ones). For concurrent differentiation — including inside `OhMyThreads` reductions (§2.9.4) — prepare **one separate `prep` per task/worker**. Sharing one `prep` across threads is a data race.

The `prep` object is backend-specific: for ForwardDiff it preallocates dual buffers, for Zygote/Enzyme it stores the reverse-pass configuration, for sparse backends it stores the coloring. The call site does not change when you swap backends — only the prepared object does.

#### 2.7.3 Backend selection

Choose by problem shape, then justify by profiling — never by habit.

| Situation | Backend | Why |
|---|---|---|
| ≤ ~100 inputs; any Hessian | `AutoForwardDiff()` | Forward mode is O(input_dim)·cost(f); cheap for small input, and forward-over-forward gives clean Hessians. **Default.** |
| Scalar output, input_dim ≫ 100 | `AutoEnzyme(mode=Enzyme.Reverse)` | LLVM-IR reverse mode, very fast, supports mutation. Profile ForwardDiff first; switch only when AD is shown to be the bottleneck. |
| Pure-Julia reverse, mutation-light | `AutoZygote()` | Mature source-to-source; slow on mutable code and discrete branches. |
| Hessian-vector products, large input | second-order DI (`AutoForwardDiff` over `AutoEnzyme`) | forward-over-reverse; DI composes these via `SecondOrder(outer, inner)`. |
| Sparse Jacobian/Hessian | any backend + `AutoSparse(backend)` | DI handles sparsity detection (`SparseConnectivityTracer`) and coloring (`SparseMatrixColorings`) for you. |
| NN training / GPU / TPU, need XLA | `Reactant` path (§2.9.3) | compiles to MLIR/XLA; different tradeoffs, see §2.9.3. |

Caveat carried from experience: routing Enzyme through DI does not yet expose its full activity/multi-argument machinery. If `AutoEnzyme()` via DI fails or is slow, drop to Enzyme's native API for that one call and note it in a comment — this is the sanctioned exception to "DI everywhere".

#### 2.7.4 AutoForwardDiff hazard: Dual propagation rules (STILL CRITICAL)

DI abstracts *which* backend runs, not *what the backend does*. Whenever `AutoForwardDiff()` (or any forward-mode backend) is in the path, ForwardDiff still propagates `Dual` numbers through your function. A function that hard-codes `Float64` will still break — DI does not save you. These rules are mandatory for any function that may be differentiated by a forward-mode backend:

**Rule 1 — Never hard-code `Float64` in allocations.**
```julia
# WRONG: kills Dual propagation
s = zeros(n)            # Vector{Float64} — Dual can't enter
val = 0.0               # Float64 literal

# RIGHT: infer the element type from the input
s = zeros(eltype(x), n)
val = zero(eltype(x))
# Mixed inputs: promote first
ET = promote_type(eltype(α), eltype(ψ)); s = zeros(ET, n)
```

**Rule 2 — Never cast a Dual to `Float64`.**
```julia
# WRONG: strips derivative information
result = Float64.(inner(x))
# RIGHT: let the type propagate
result = inner(x)
```

**Rule 3 — `eigvals`/`eigvecs` are NOT Dual-safe; `inv`/`tr`/`det` ARE.**
```julia
# WRONG: crashes on a Dual matrix
minimum(eigvals(Hermitian(M)))
# RIGHT: express through inv/tr/det
Φ = tr(W * inv(M))
# For an SPD check, evaluate the eigen-test in Float64 OUTSIDE the AD path:
is_spd = minimum(eigvals(Hermitian(Float64.(M)))) > 0
```

**Rule 4 — Inner functions must be fully type-generic** (same `eltype(x)` discipline all the way down).

**Rule 5 — Separate the AD path from non-AD operations.** Discrete branch selection (`argmax`, phase-branch choice via `eigvals`) is computed in `Float64` *before* the Dual path; the AD-safe cost is then evaluated with the branch held fixed.
```julia
function cost_with_branch(x, G, W, ps, T, d)
    # Phase 1 — non-AD branch selection (Float64)
    α_float = Float64.(softmax(x[1:d-1]))
    ψ_star  = select_phase_branch(α_float, G)   # uses eigvals etc.
    # Phase 2 — AD-safe cost (Dual propagates; ψ_star is fixed Float64)
    α = softmax(x[1:d-1])
    s = s_of(α, ψ_star, T, d)
    q = dot(ps, α)
    tr(W * inv(sum(w * (s/√q) * (s/√q)' for w in weights)))
end
```

**Rule 6 — Avoid nested same-tag ForwardDiff.** For a cross-derivative ∂²f/∂ψ∂α, use a joint Hessian and slice the cross-block rather than nesting gradient-in-jacobian:
```julia
z = vcat(ψ, α)
H = hessian(z -> f(z[1:nψ], z[nψ+1:end]), AutoForwardDiff(), z)
A = H[1:nψ, nψ+1:end]   # ∂²f/∂ψ∂α
```
(DI's `SecondOrder` backend is the cleaner route when you control both layers.)

These six rules are the forward-mode physics. Reverse-mode backends (`AutoEnzyme`, `AutoZygote`) have different hazards — chiefly mutation support and world-age — documented at their own repos; reach for them only after §2.7.3 says so.

### 2.8 Static Verification (use before claiming code is correct)

Type stability and allocation discipline are **mechanically verifiable**. Don't rely on inspection — run the checkers.

#### JET.jl — static type-error and dispatch detection
```julia
using JET
@report_call f(x_typical)   # MethodError paths for a single call
@report_opt  f(x_typical)   # optimization-level: catches dynamic dispatch / Any
report_package(MyModule)    # whole-package scan
# In a test suite, assert it:
@test_opt f(x_typical)      # fails the test on any inferred instability
@test_call f(x_typical)
```
**Workflow**: after `Pkg.precompile()`, run `report_package` once. Treat new JET reports as test failures, not warnings.

#### DispatchDoctor.jl — turn instability into an error at the definition site
```julia
using DispatchDoctor
@stable function hot(x::AbstractVector)
    # if this body is type-unstable, calling it throws — caught immediately in CI
    return x[1] + x[2]
end
# @stable can wrap a whole module: @stable default_mode="error" module M ... end
```
Use `@stable` on the functions that *must* stay fast; it is the proactive complement to JET's after-the-fact scan.

#### AllocCheck.jl — zero-allocation guarantee on hot kernels
```julia
using AllocCheck
@check_allocs function hot_kernel!(out, in)
    @inbounds for i in eachindex(out)
        out[i] = sin(in[i]) + 0.5
    end
end
# Errors at compile time if the function can hit the GC heap.
```
Apply to inner loops you've already pre-allocated (§2.3): Monte Carlo / SDE steps, per-iteration optimizer callbacks, JuMP custom-operator kernels. Not for setup code that legitimately allocates.

#### Quick verification recipe
```bash
julia --project=/home/claude/julia-env -e '
  using JET, AllocCheck, MyModule
  display(report_package(MyModule))
  @check_allocs MyModule.hot_kernel!(out, in)
'
```
These catch in seconds what `@code_warntype` inspection would miss in hours.

### 2.9 Modern Toolchain Map (which tool for which job, 2024–2025)

The AD, instability-detection, and benchmarking choices already have their own sections (§2.7, §2.8, §2.6) and are indexed in the §2.9.5 table — not repeated here. This section documents the modern tools that are **first introduced here**: small-array, structured-parameter, GPU/NN, and parallelism choices.

#### 2.9.1 Small fixed-size arrays — StaticArrays
For vectors/matrices whose size is known and small (≤ ~12), `SVector`/`SMatrix` carry size in the type, stack-allocate, and unroll linear algebra. This is the right type for a state vector v ∈ ℂ^d or a 3×3 rotation — not `Vector`/`Matrix`.
```julia
using StaticArrays
v = SVector{4, ComplexF64}(1, 0, 0, 0)   # stack-allocated, zero heap
M = @SMatrix [1.0 0.0; 0.0 1.0]
# Composes with AutoForwardDiff: gradient(g, AutoForwardDiff(), v) stays allocation-free.
```
Caveat: very large `SArray`s explode compile time — the size-in-type advantage inverts past ~100 elements. Use `MArray` for mutable small arrays, plain `Array` for large ones.

#### 2.9.2 Structured parameters — ComponentArrays
A `ComponentVector` behaves as a flat numeric vector (so ODE solvers, `Optim`, and DI accept it) while still allowing named access. This is how you give an optimizer a single `x` that internally has structure.
```julia
using ComponentArrays
p = ComponentVector(θ = [1.0, 2.0], bias = 0.5)
p.θ          # named view
p[1:2]       # also indexes flat
gradient(loss, AutoForwardDiff(), p)   # returns a ComponentVector — structure preserved

# Immutable nested update — use Accessors.@set (returns a new object, original untouched):
using Accessors
p2 = @set p.bias = 0.9          # p unchanged; p2 has bias 0.9
p3 = @set p.θ[1] = 5.0          # also reaches into nested fields
```

#### 2.9.3 NN / GPU / TPU compilation — Lux + Reactant
When the task is neural-network training or array code that must hit GPU/TPU at JAX/PyTorch-class speed, compile through `Reactant.jl`: it traces Julia code into MLIR, runs XLA optimizations, and uses EnzymeMLIR for AD. Crucially, **the compiled function assumes the same control-flow pattern as the traced example** — type instabilities and branches are fixed at trace time, not resolved generally. Do not treat tracing as a cure for arbitrary dynamic dispatch or data-dependent branching; if the control flow depends on runtime data, the traced path may be wrong for other inputs. `Lux.jl` is the explicit-parameter NN library that pairs with it (`Flux.jl` remains valid for non-Reactant work). This is a different execution model from §2.7 (tracing, not per-call dispatch) — reach for it only when XLA/TPU or large-scale NN throughput is the actual requirement, not for a one-off gradient.

#### 2.9.4 Parallelism — OhMyThreads
For data-parallel maps/reductions on one machine, `OhMyThreads.tmapreduce` / `@tasks` is the safe modern replacement for hand-written `Threads.@threads` + manual accumulation. **Do not key buffers on `threadid()`** (unsafe under Julia 1.12's interactive/worker split — §3.6); OhMyThreads handles chunking and reduction correctly.
```julia
using OhMyThreads
total = tmapreduce(+, 1:N) do i
    expensive(i)
end
```
For clusters use `Distributed`/`MPI.jl`; for GPU kernels `KernelAbstractions.jl`.

#### 2.9.5 Quick selection table

| Job | Modern tool (use this) | Replaces / older |
|---|---|---|
| Differentiate anything | `DifferentiationInterface` + `ADTypes` | raw ForwardDiff/Zygote calls |
| Fast reverse-mode AD | `AutoEnzyme()` | Zygote (when mutation/speed matters) |
| GPU/TPU + NN | `Reactant` + `Lux` | hand-written CUDA.jl |
| Detect instability (CI) | `JET.@test_opt` | manual `@code_warntype` |
| Forbid instability (def site) | `DispatchDoctor.@stable` | hope |
| Guarantee zero alloc | `AllocCheck.@check_allocs` | eyeballing `@time` |
| Benchmark fast | `Chairmarks.@b` | `@btime` (only for BenchmarkGroup suites) |
| Small fixed vector/matrix | `StaticArrays.SVector` | `Vector`/`Matrix` |
| Structured optimizer param | `ComponentArrays` | flat vector + manual indexing |
| Immutable nested update | `Accessors.@set` | full struct copy |
| Data-parallel reduce | `OhMyThreads.tmapreduce` | `Threads.@threads` + locks |

---

## 3. Environment Setup (ALWAYS RUN FIRST)

This container resets between sessions; install Julia from scratch each time. **Primary path: direct tarball from AmazonS3** — not Cloudflare-fronted distribution endpoints.

### 3.1 Primary path: direct tarball (AmazonS3, ~290MB, 20–60s)

```bash
JULIA_VER="1.12.6"           # pinned stable; bump intentionally
JULIA_MM="${JULIA_VER%.*}"

mkdir -p /home/claude/julia-install && cd /home/claude/julia-install
curl -sS -o julia.tar.gz \
  "https://julialang-s3.julialang.org/bin/linux/x64/${JULIA_MM}/julia-${JULIA_VER}-linux-x86_64.tar.gz"
tar xzf julia.tar.gz
mv "julia-${JULIA_VER}" /home/claude/julia
export PATH="/home/claude/julia/bin:$PATH"
julia --version
```

The endpoint is a direct Amazon S3 endpoint (`server: AmazonS3`), not Cloudflare-fronted. It works even when this container's egress IP is rejected by Cloudflare bot-reputation rules. Cloudflare-fronted endpoints (`install.julialang.org`, much of `*.cloudflare.com`, `api.github.com`) may 503/403 from this container — that is an Anthropic-egress / Cloudflare interaction, NOT a JuliaLang outage. Diagnose accordingly.

### 3.2 Reachability check pitfall (CRITICAL — read before any 503 diagnosis)

This container's egress proxy returns **503 for HEAD and Range requests** while plain GET to the same URL succeeds. Do **NOT** check reachability with:

```bash
curl -I "$URL"                       # 503 false negative
curl -sSI "$URL"                     # 503 false negative (same)
curl -H "Range: bytes=0-0" "$URL"    # 503 false negative
```

Use a real GET, not HEAD/Range. Note that for a large binary URL (the ~290MB tarball) a GET downloads the whole file — it is **not** a lightweight probe. So **don't run a separate reachability check at all**: just attempt the actual download and read its exit/status. If you do need a cheap probe, point the GET at a known-small URL on the same host, not the tarball.

```bash
# Combined: the download IS the reachability test. Check the status it returns.
curl -sS -f -o julia.tar.gz "$URL" && echo "OK" || echo "download failed — see §3.2"
```

This false-negative trap caused a ~30 minute misdiagnosis on 2026-04-25 (entire JuliaLang CDN incorrectly declared down based on `curl -I` 503 responses, when `curl -sS GET` returned 200 with the full tarball). **Always confirm with a real GET before concluding any host is unreachable from this container.**

### 3.3 Project setup and packages

```bash
export PATH="/home/claude/julia/bin:$PATH"
mkdir -p /home/claude/julia-env

julia --project=/home/claude/julia-env -e '
  import Pkg
  # AD frontend + a backend + verification tooling is the common base:
  Pkg.add(["DifferentiationInterface", "ADTypes", "ForwardDiff",
           "JET", "Chairmarks"])      # adjust per task
  Pkg.precompile()
'
```

Large packages (HomotopyContinuation, DifferentialEquations, Symbolics, Oscar, Reactant) take 2–5 minutes (Reactant can be longer due to XLA artifacts) on first install + precompile. This is normal — do not assume the process has hung.

`Pkg.add` hits `pkg.julialang.org` which is Cloudflare-fronted but uses GET internally, so it tends to work where `curl -I pkg.julialang.org` fails. If it does fail, the symptom is the same egress / Cloudflare reputation issue; fall back to `Pkg.develop(url=...)` against a GitHub repo.

### 3.4 Reproducibility

`Project.toml` / `Manifest.toml` in `/home/claude/julia-env/` capture the exact dep tree. Copy them to `/mnt/user-data/outputs/` to restore next session via:

```bash
julia --project=/home/claude/julia-env -e 'import Pkg; Pkg.instantiate(); Pkg.precompile()'
```

### 3.5 TTFX (Time To First eXecution) — the layered countermeasure map

**TTFX** (Time To First eXecution, historically "time to first plot") is the latency before the *first* real result — the compile-then-run cost paid the first time a code path is hit. It was Julia's signature weakness; the modern fix is a **four-layer stack**, and which layer is the dominant lever depends on the host. **In this ephemeral container, Layer 2 (depot caching) is the dominant lever** — Layers 0–1 are recomputed from scratch every session unless Layer 2 carries them across.

| Layer | Mechanism | Caches | Where it pays off | Cost to apply |
|-------|-----------|--------|-------------------|---------------|
| **0** | Julia ≥1.9 package images (`Pkg.precompile`, §3.4) | **native** code of deps, not just lowered IR | always — the floor everything builds on | free, automatic |
| **1** | `PrecompileTools.@compile_workload` | native code of **your** hot path | a package you author + call repeatedly | one block, package-author side |
| **2** | **depot caching across sessions** | Layers 0–1 output, persisted | **this container** (ephemeral FS) | tar + Drive round-trip |
| **3** | custom sysimage (PackageCompiler) | a frozen image with everything baked | persistent local dev (§8) | minutes to build; **not** in an ephemeral FS |

**Layer 0 — package images (automatic, the floor).** Since Julia 1.9 (§3.6), `Pkg.precompile()` writes *native* code into package images, not just lowered IR. This is why the precompile step in §3.4 is a TTFX lever, not merely a dependency-resolution step. Nothing to do beyond running it.

**Layer 1 — `PrecompileTools.jl` (package-author side).** Lets a package run a representative workload **at precompile time**, so the relevant native code lands in the package image. Apply when you author a package whose hot path is called across many `julia -e` invocations in a session.

```julia
using PrecompileTools, DifferentiationInterface
import ForwardDiff

@setup_workload begin
    x_small = randn(8)
    backend = AutoForwardDiff()
    @compile_workload begin
        my_cost(x_small)
        prep = prepare_gradient(my_cost, backend, x_small)
        gradient(my_cost, prep, backend, x_small)   # warm the DI+backend path
    end
end
```

When it **doesn't** help: a single long computation in one process — JIT cost is amortized anyway.

**Layer 2 — depot caching across sessions (THE container lever).** Because the filesystem is ephemeral, Layers 0–1 are thrown away every session, so TTFX resets to cold each time. Persist the compiled depot: tar `~/.julia/compiled/v1.12/` and `~/.julia/packages/` after a successful first session, store on Google Drive, restore at the start of subsequent sessions. This is **mandatory for heavy packages** (Oscar, HomotopyContinuation, DifferentialEquations, Reactant, and Symbolics+ModelingToolkit *only* when SciML integration is the explicit requirement) whose *precompile* latency is multi-minute, and worthwhile for any nontrivial dep set. Constraints: Julia patch version, OS, glibc, and CPU architecture must all match — the container provides this consistency. **Symbolics.jl is FORBIDDEN by §4 for plain symbolic algebra**; if the task is symbolic-algebra-only, switch to SymEngine (seconds, no caching needed), don't cache Symbolics.

**Layer 3 — custom sysimage / AOT binary (not for this container).** Two distinct tools, both for a *persistent* host or a deployment target, never for an ephemeral FS where the build cost can't amortize — Layer 2 is the cheaper equivalent here:
- **PackageCompiler** builds a full (untrimmed) sysimage that freezes everything for sub-second startup — the mechanism the VS Code Julia extension auto-generates from `JuliaSysimage.toml` (§8). Still the right tool for local interactive dev.
- **`juliac` / `JuliaC.jl`** (Julia ≥1.12, §3.6) is the modern gcc-like driver that wraps the experimental `--trim` AOT path to emit small executables/libraries (a trimmed "hello" is ~1 MB). It is a *companion* to PackageCompiler, not a replacement. **Still not for research code**: trimming requires no dynamic dispatch reachable from entry points, which research code routinely violates.

### 3.6 Julia 1.12 runtime notes

- **Threading default changed**: `julia` (no `-t`) starts with 1 worker + 1 interactive thread (`-t1,1`). **Use `-t auto` for compute-bound work**, or `-tN,1` explicitly. **Do not key buffers on `threadid()`** — the interactive/worker split makes this unsafe (use OhMyThreads, §2.9.4).
- **Parallel precompilation is the default**: large dep trees compile in parallel.
- **`@atomic` supports reference assignment**: `@atomic x.field = value` works for atomic struct fields.
- **`OncePerProcess{T}`**: "compute once per process" cache primitive; pairs with `@compile_workload`.
- **`juliac` / `JuliaC.jl` + `--trim` (experimental)**: 1.12's gcc-like AOT driver wrapping the `--trim` dead-code-elimination path; emits trimmed executables/libraries/sysimages (companion to PackageCompiler). For binary deployment only — **not for research code**: `--trim` errors on any dynamic dispatch reachable from the entry point. See §3.5 Layer 3.

### 3.7 Fallback: juliaup

Only when multiple Julia versions are needed in the same session. The juliaup installer (`https://install.julialang.org`) is Cloudflare-fronted and frequently 503s from this container; the direct tarball above is the answer. **Skip juliaup unless explicitly required.**

---

## 4. Recommended Packages by Research Domain

Select only what the task needs — don't install everything.

**Core (stdlib, no install needed):** `LinearAlgebra`, `Statistics`, `Random`, `SparseArrays`, `Printf`

**AD frontend & backends** (this is the modern spine — §2.7):
- `DifferentiationInterface` — the frontend. All differentiation goes through here.
- `ADTypes` — the `AutoX()` backend-selector types. A dependency of DI; import for the constructors.
- `ForwardDiff` — forward-mode via dual numbers, no compile overhead. **Default backend for ≤100 inputs and Hessians.** Dual rules in §2.7.4.
- `Enzyme` — LLVM-IR reverse mode, very fast, supports mutation. Default reverse-mode when input_dim ≫ 100 and ForwardDiff is profiled as the bottleneck.
- `Zygote` — pure-Julia reverse mode; mature, slow on mutable/branchy code.
- (sparse) `SparseConnectivityTracer` + `SparseMatrixColorings` — pulled in by `AutoSparse`.

**Verification & measurement** (§2.8 / §2.6):
- `JET` — static type-error / dispatch scanner; `@test_opt` in suites.
- `DispatchDoctor` — `@stable` to forbid instability at the definition site.
- `AllocCheck` — `@check_allocs` for compile-time zero-allocation guarantee.
- `Chairmarks` — fast repeated benchmarking (`@b`); `BenchmarkTools` only for `BenchmarkGroup`.
- `Runic` — code formatter. Zero-configuration by design (formatting is fixed, not tunable), which is exactly why it is the SciML-standard formatter — uniformity across a codebase over per-author preference. Run it on any package you produce rather than hand-aligning code.

**Data structures & parallelism** (§2.9):
- `StaticArrays` — small fixed-size `SVector`/`SMatrix` (state vectors, rotations).
- `ComponentArrays` — named-yet-flat optimizer parameters.
- `Accessors` — immutable nested update (`@set`).
- `OhMyThreads` — safe data-parallel `tmapreduce`/`@tasks`.

**Optimization:**
- `JuMP` + `HiGHS` — modeling for LP, MILP, and convex QP. HiGHS does **not** solve SOCP or SDP, nor mixed-integer QP.
- For conic problems through JuMP: SOCP/SDP → `Clarabel` (default open-source choice), `SCS`, `COSMO`, or `Hypatia`; `Mosek` if a commercial license is acceptable. Fuyu's restricted-master SDP must use one of these, not HiGHS.
- `Optim` — gradient-based and derivative-free; pass `autodiff = :forward`.

**Differential equations** (heavy):
- `DifferentialEquations` — full ODE/SDE/DDE/DAE suite (100+ solvers).
- `OrdinaryDiffEq` — ODE-only subset, lighter deps.
- `SciMLSensitivity` — adjoint/forward sensitivity; takes an `ADTypes` backend.

**NN / GPU / TPU** (§2.9.3, heavy — install only when XLA/TPU or large NN throughput is the requirement):
- `Reactant` — Julia → MLIR → XLA compilation; EnzymeMLIR AD.
- `Lux` — explicit-parameter NN library pairing with Reactant (`Flux` for non-Reactant work).

**Algebra, number theory, finite fields** — use exact names:
- `Nemo` (Flint/Arb exact arithmetic), `AbstractAlgebra` (pure-Julia generic algebra), `GaloisFields` (GF(p^k); exact name `"GaloisFields"`), `Hecke` (alg. number theory, heavy), `Oscar` (unified CAS, very heavy 5–10 min).

**Polynomial systems & Gröbner bases:**
- `HomotopyContinuation` (numeric polynomial systems; exact spelling; heavy), `Groebner` (exact name `"Groebner"`), `MultivariatePolynomials` (shared interface).

**Cryptography:** `Primes`, `SHA`, `Nettle`.

**Symbolic computation: the choice is fixed; no branching decision is required.**

1. **`SymEngine` — MUST be used as the default for algebraic symbolic manipulation**: `expand`, `subs`, `diff`, `coeff`, numerator/denominator extraction, symbolic linear algebra, and `lambdify`. C++ libsymengine wrapper distributed as a pre-built JLL; Julia-side precompile is seconds (**measured 2.79s on 2026-04-25**, vs Symbolics' 30s–2min). **MUST NOT use Symbolics.jl as a substitute.** The Julia package wraps only what SymEngine exposes through its C wrapper, so **do not assume full SymPy-equivalent support** for general equation `solve`, assumptions, `integrate`, or `dsolve` — those require path 2 below.
   ```julia
   using SymEngine
   @vars x y
   diff(x^2 + 2x*y, x)              # 2*x + 2*y  (SymEngine normal form)
   subs(x^2 + y, x => 2, y => 3)    # 7  (= 2^2 + 3)
   f = lambdify(x^2 + y, [x, y])    # callable; f(1.0, 2.0) → 3.0
   ```
   **Required handling of the `Basic` type** (SymEngine's C++ reference, NOT a Julia `Number`):
   - **MUST** lambdify before mixing `Basic` with numeric or AD code: `diff` symbolically → `lambdify` → apply DI's `gradient(..., AutoForwardDiff(), ...)` to the resulting Julia function. The §2.7.4 forward-mode rules apply to the lambdified function.
     ```julia
     @vars x y
     expr = x^2 + 2*x*y + y^2
     h = lambdify(expr, [x, y])
     using DifferentiationInterface; import ForwardDiff
     gradient(v -> h(v[1], v[2]), AutoForwardDiff(), [1.0, 2.0])   # [6.0, 6.0]
     ```
     (Type-system note: passing `Basic` directly into a forward-mode backend fails with `MethodError` — `Basic` is not `<: Number`. The pipeline is the construction, not a hidden hazard.)
   - **MUST** convert `Basic` to a number via `Float64(N(expr))` when extracting a value.
   - **MUST NOT** compare `Basic` by string equality — SymEngine returns its internal normal form (`expand((x+y)^3)` → `3*x*y^2 + 3*x^2*y + x^3 + y^3`, not textbook order). **Verify symbolic equality by numeric substitution** at a few points with a tolerance.

2. **`SymPyPythonCall` — ONLY when SymEngine lacks the feature.** Permitted exclusively for: hard `integrate`, `dsolve`, sympy `assumptions`, specific special functions. **MUST NOT replace SymEngine as a general CAS.**

3. **`Symbolics` + `ModelingToolkit` — FORBIDDEN unless the task's explicit requirement is SciML integration.** Permitted only for ModelingToolkit PDE/DAE modeling, `@register_symbolic`, GPU symbolic codegen, or neural-symbolic interop. Pays 30s–2min precompile. **MUST NOT use for plain symbolic algebra — that is SymEngine's job.**

**Geometry & manifold optimization:**
- `Manopt` — optimization *on* manifolds (Stiefel, Grassmann, SPD, sphere/ℂP^{d-1}, fixed-rank). This is one of Julia's major advantages over Python in constrained numerical optimization — the MATLAB/Python ports are strict subsets. Reach for it whenever the feasible set is a manifold rather than a box/polytope (e.g. a pricing oracle on ℂP^{d-1}); it composes with DI backends for the Riemannian gradient.
- `Manifolds` — the manifold definitions and differential-geometry computations (SO(n), SE(n), SPD) that `Manopt` optimizes over.

**Data & visualization:** `DataFrames`, `CSV`; `CairoMakie` (publication plots, heavy deps).

---

## 5. Running Julia Code

Always set PATH and use the project environment:

```bash
export PATH="/home/claude/julia/bin:$PATH"
julia --project=/home/claude/julia-env -e '
  # code here
'
```

For longer scripts, write to a `.jl` file:

```bash
export PATH="/home/claude/julia/bin:$PATH"
julia --project=/home/claude/julia-env /home/claude/script.jl
```

For parallel computation (compute-bound → populate the worker pool; do NOT key buffers on `threadid()` — §2.9.4 / §3.6):

```bash
julia -t auto --project=/home/claude/julia-env /home/claude/script.jl
julia -tN,1  --project=/home/claude/julia-env /home/claude/script.jl   # explicit worker count
```

---

## 6. Quick Reference: Julia Idioms

```julia
# Comprehension
[x^2 for x in 1:10 if isodd(x)]

# Enumerate (i is 1-based) / zip / destructuring
for (i, v) in enumerate(collection); end
for (a, b) in zip(xs, ys); end
a, b, c = (1, 2, 3)

# Multiple dispatch (the core paradigm)
f(x::Int)           = "integer"
f(x::Float64)       = "float"
f(x::AbstractArray) = "array of $(eltype(x))"

# Annotate as generally as possible (SciML style):
splicer(arr::AbstractArray, step::Integer) = arr[begin:step:end]   # not Array{Int}, Int

# Struct (immutable by default) / mutable struct
struct Point; x::Float64; y::Float64; end
mutable struct State; position::Float64; velocity::Float64; end

# Do-block (anonymous function as first arg) / pipe
map(collection) do x; x^2 + 1; end
[1,2,3] |> sum |> sqrt
```

---

## 7. Output Files

1. Write output to `/home/claude/` first
2. Copy final deliverables to `/mnt/user-data/outputs/`
3. Use `present_files` to share with the user

```julia
using DelimitedFiles
writedlm("/home/claude/results.csv", data, ',')
```

---

## 8. Out of Scope: Local Interactive Development

This skill targets **container-side ephemeral execution**. Anything requiring a persistent REPL is handled by a separate skill (planned: `julia-local-dev`). Do not use these in the container unless the user explicitly asks for a one-off demo:

- **Revise.jl + `startup.jl`** — auto-reload edited modules without restarting Julia. In *local* development, put it in `~/.julia/config/startup.jl` so every session loads it automatically:
  ```julia
  # ~/.julia/config/startup.jl  — LOCAL ONLY, not in this container
  try
      using Revise
  catch e
      @warn "Revise init failed" exception=e
  end
  ```
  With 1.12 + Revise 3.13+, struct/const redefinition works. Max value when the JIT-warm REPL is preserved across edits. **Not used in this container** — each `julia -e` is a fresh process, so there is nothing to keep warm and no `startup.jl` to honor.
- **TestItems.jl / ReTestItems.jl** — modern test discovery integrated with the VS Code Julia extension (`@testitem` blocks).
- **JETLS** — new compiler-powered language server (needs 1.12+); will replace LanguageServer.jl as the VS Code default; real-time type-error diagnostics while editing.
- **Cthulhu.jl** — interactive descend into inferred IR; use when `@code_warntype` is too shallow (§2.1).
- **Debugger.jl / Infiltrator.jl** — interactive REPL debugging.

If the user asks about these in the container context, **redirect to local development**. The container's strengths are reproducibility and cleanroom verification, not iterative coding.

---

## 9. Checklist Before Submitting Julia Code

Correctness:
- [ ] All indices start at 1; matrix multiply uses `*` (not `@`); element-wise ops use dot (`.+`, `.*`, `sin.()`)
- [ ] No untyped containers (`Float64[]` not `[]`); no globals captured in hot loops
- [ ] Functions return consistent types; `end` closes every block; `$` interpolation; `time_ns()`

Methodology (§2.0 — FORBIDDEN by default unless an exception is documented in code):
- [ ] No FD *derivative estimation*: gradients/derivatives of smooth objectives go through DI (`gradient(f, backend, x)`), never `(f(x+h)-f(x))/h`. (FD *discretizations* like PDE stencils are fine.) (§2.0.1)
- [ ] No grid sampling for continuous optima: `Optim`/`JuMP`/`Roots`/closed form (§2.0.2)
- [ ] No lerp as evaluation substitute; no grid+lerp combination (§2.0.3)

AD (if any function will be differentiated):
- [ ] Differentiation goes through `DifferentiationInterface` with an `ADTypes` backend, not raw backend calls (§2.7.1)
- [ ] Repeated differentiation uses `prepare_*` once, reused in the loop (§2.7.2)
- [ ] Backend choice justified by input dimension and profile, not habit (§2.7.3)
- [ ] If `AutoForwardDiff` is in the path: all `zeros()` use `eltype(x)`, no `Float64()` casts, no `eigvals` in the AD path, branch selection done in Float64 first (§2.7.4)

Performance & verification (for hot paths):
- [ ] First call is warmup; timing on the second (§2.6); `@btime`/`@b` with `$`-interpolated args
- [ ] Small fixed-size data uses `StaticArrays`; structured params use `ComponentArrays` (§2.9.1 / §2.9.2)
- [ ] **JET**: `report_package` clean (or reports justified); consider `@stable` on must-be-fast functions (§2.8)
- [ ] **AllocCheck**: `@check_allocs` passes on inner loops (§2.8)
- [ ] Parallel reductions use `OhMyThreads`, never `threadid()`-keyed buffers (§2.9.4)

Environment:
- [ ] `PATH` includes `/home/claude/julia/bin` (§3.1)
- [ ] `--project=/home/claude/julia-env` on every `julia` invocation (§5)
- [ ] `Project.toml` / `Manifest.toml` copied to outputs for reproducibility (§3.4)
- [ ] If symbolic computation is involved: SymEngine.jl is used; Symbolics.jl is NOT, unless the task explicitly requires SciML integration (§4)
