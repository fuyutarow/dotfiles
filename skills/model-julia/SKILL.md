---
name: model-julia
description: Set up Julia and write correct, performant, modern Julia for theoretical research — one first choice per task, no ambiguous alternatives. Use whenever the user runs Julia or does numerical experiments, AD/gradients, optimization, polynomial/symbolic computation, or differential equations. Trigger on DifferentiationInterface, ADTypes, ForwardDiff, Enzyme, Zygote, Reactant, JET, DispatchDoctor, AllocCheck, Chairmarks, OhMyThreads, ComponentArrays, StaticArrays, HomotopyContinuation, SymEngine, Symbolics, ModelingToolkit, SymPyPythonCall, Manopt, Julia setup, TTFX / precompile latency, or large-package architecture (module/file organization, include order, submodules vs subpackages, package extensions / weakdeps, type piracy, public API). MANDATORY — read this skill BEFORE writing ANY Julia code. §2.0 forbids FD derivative estimation (use AD), grid sampling (use optimization), and lerp-as-evaluation. All differentiation goes through DifferentiationInterface (raw backend calls are the exception); Dual-propagation rules apply whenever AutoForwardDiff is in the path. Symbolic tooling is chosen by ROLE: SymEngine for lightweight algebra, Symbolics+ModelingToolkit as the spine of AI4S/SciML projects (codegen/PDE/DAE), SymPyPythonCall as a thin-boundary service for heavy CAS (integrate/trigsimp/factor/assumptions).
---

# Model Julia — Coding Discipline & Setup

> **Version**: v2606.5.0 (2026-06-06, Julia 1.12.6 baseline)
> **Scope**: Correct, performant, modern Julia for theoretical research — host-agnostic. This
> file holds the two precedence-setting sections inline (§1 Python→Julia pitfalls, §2.0
> numerical methodology); everything else lives in `references/` and is loaded on demand.
> **Out of scope**: live REPL iteration tooling (Revise, TestItems, JETLS, Cthulhu) —
> pointered from `references/setup.md` §8, not the focus here.
>
> **Changelog (recent)**:
> - v2606.5.0: **reorganized into progressive-disclosure layout.** SKILL.md trimmed to §1 + §2.0
>   + the reference index + the §9 checklist; performance/AD/toolchain/packages/setup split into
>   `references/`. Environment setup rewritten **host-agnostic** (juliaup + `--project=.`) —
>   the prior Claude-container apparatus (S3 tarball, Cloudflare egress diagnosis,
>   `/home/claude`, `present_files`, ephemeral depot caching) removed. No coding-discipline
>   content changed.
> - v2606.4.0: §3.5 TTFX layered countermeasure map; `juliac`/`JuliaC.jl` as the 1.12 AOT face.
> - v2606.3.x: AD layer restructured around DifferentiationInterface + ADTypes as the single
>   frontend; Chairmarks the default benchmarker; §4 package tables rewritten.
> - v2604.2.0: §2.0 numerical methodology discipline added (FD / grid / lerp forbidden by default).

This skill provides coding rules partitioned by consequence. **Read §1 and §2.0 below first** —
they set precedence: a fast implementation of the wrong method is still wrong. Then open the
reference file that matches the task.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/performance.md` | §2.1–§2.6 hot-path performance (type stability, globals, pre-alloc, broadcast, `@inbounds`/`@simd`, benchmarking) + §2.8 static verification (JET / DispatchDoctor / AllocCheck) | writing any repeated/hot-path computation, or before claiming code is correct |
| `references/autodiff.md` | §2.7 DifferentiationInterface frontend, `prepare_*`, backend selection, **§2.7.4 Dual-propagation rules** | any function that will be differentiated |
| `references/toolchain.md` | §2.9 modern toolchain map — StaticArrays, ComponentArrays, Lux+Reactant, OhMyThreads + selection table | choosing a data structure, GPU/NN, or parallelism tool |
| `references/packages.md` | §4 recommended packages by domain (AD, optimization, diffeq, algebra, **symbolic discipline**, manifolds, viz) | deciding which package to install for a task |
| `references/setup.md` | §3 install + project env + reproducibility + TTFX, §5 running, §6 idioms, §7 output, §8 local-dev pointers | setting up Julia or running code |
| `references/architecture.md` | §10 large-package architecture — one-module / role-split files / `include` order, circular-dep fix, subpackage & interface-package scale-out, package extensions (`[weakdeps]`), public API, anti-spaghetti invariants (no globals / no type piracy), TTFX & invalidation hygiene | structuring a package beyond one file, or organizing a large/growing codebase |

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

# PITFALL: sort(collect(my_dict)) sorts the Pairs. Fine for a typed Dict
# (Dict{String,Int} → sorted by key), but it THROWS for non-comparable value
# types (Dict{String,Any}): Pair `isless` evaluates the values eagerly even
# though Dict keys are unique. To sort by key regardless of value type:
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

## 2.0 Numerical Methodology Discipline (READ FIRST — FD / grid / lerp are FORBIDDEN by default)

This is the precedence-setting section. §2.1–§2.9 (performance, AD, tooling — in `references/`)
cover *how* to write the chosen approach correctly; §2.0 governs *what* approach is allowed.

LLMs habitually fall into three numerical-method pitfalls. **All three are FORBIDDEN as the
primary approach.** Permitted exceptions are listed; if you must invoke one, write a one-line
comment in the code stating which exception applies. **Do not deviate silently.**

### 2.0.1 Finite-difference derivative *estimation* — FORBIDDEN. Use AD.

This forbids estimating the derivative/gradient/Jacobian/Hessian of a smooth numerical objective
by finite differencing. It does **not** forbid finite-difference *discretizations* where the
mathematical method itself is a finite-difference scheme — PDE stencils, method-of-lines spatial
derivatives, etc. are legitimate numerics, not derivative estimation.

```julia
# WRONG — estimating a derivative of a smooth objective by differencing
df_dx ≈ (f(x + 1e-5) - f(x - 1e-5)) / 2e-5     # central FD
df_dx ≈ (f(x + h) - f(x)) / h                   # forward FD

# RIGHT — use AD through DifferentiationInterface (references/autodiff.md §2.7)
using DifferentiationInterface
import ForwardDiff
backend = AutoForwardDiff()
df_dx = derivative(f, backend, x)               # scalar derivative
∇f    = gradient(f, backend, x)                # gradient
H     = hessian(f, backend, x)                 # Hessian
# For input_dim ≫ 100, switch backend to AutoEnzyme() — see references/autodiff.md §2.7.3
```

**Why**: FD derivative estimation trades truncation error against round-off, so it has an
irreducible precision floor *and* needs step-size tuning. The floor depends on the scheme —
forward difference bottoms out near √eps ≈ 1e-8 (measured 3e-9 for sin at x=1), central
difference does better at ~eps^(2/3) ≈ 1e-11 (measured 1e-11) — but both stay far above machine
precision, both need a tuned `h`, and high-order derivatives compound the error. AD has no
truncation error (measured exactly 0.0 on the same test), needs no step size, and composes for
higher derivatives.

**Permitted exceptions** (write the exception in a comment):
- Cross-checking an AD-computed gradient at one point during initial development (DI provides
  `DifferentiationInterfaceTest` for exactly this — prefer it over hand-rolled FD). Forbidden as
  the primary method.
- The function calls an opaque external solver with no AD support. Prefer wrapping the solver in
  a `ChainRulesCore.rrule` over reaching for FD.

### 2.0.2 Grid sampling — FORBIDDEN. Solve the optimization or compute directly.

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
# 1-D root → Roots.jl. Feasible set is a manifold → Manopt (packages.md). Closed form → use it.
```

**Why**: N^D scaling (curse of dimensionality), resolution-bounded, no convergence guarantee,
wastes compute on irrelevant regions.

**Permitted exceptions** (write the exception in a comment):
- Visualization (plotting f over a region — the grid IS the deliverable).
- Exhaustive enumeration of a genuinely *discrete* small set (e.g., ≤ 100 combinatorial cases).
- The problem is provably non-smooth / non-convex / NP and grid is the agreed approximation.
  Document the agreement.

### 2.0.3 Linear interpolation (lerp) as a substitute for evaluation — FORBIDDEN. Evaluate exactly.

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

**Why**: lerp injects an O(h²) error that becomes the *dominant* error in any downstream
analysis requiring smoothness, derivatives, or convergence rates. AD on a lerp'd function
produces a piecewise-constant "derivative" that is meaningless.

**Permitted exceptions** (write the exception in a comment):
- Visualization at sub-pixel scales (the lerp IS the rendering).
- Deliberate piecewise-linear models where linearity is part of the formulation (FEM with P1
  elements, control schedules with linear ramps).

### Combined pattern: grid + lerp = doubly wrong

The most common LLM failure mode combines §2.0.2 and §2.0.3: "evaluate `f` on a 100-point grid,
then `lerp` to 10000 query points." Both forbidden. Either compute analytically/AD, or use a
proper interpolant with documented error bounds — never the grid+lerp combination.

---

## 9. Checklist Before Submitting Julia Code

Correctness (§1):
- [ ] All indices start at 1; matrix multiply uses `*` (not `@`); element-wise ops use dot (`.+`, `.*`, `sin.()`)
- [ ] No untyped containers (`Float64[]` not `[]`); no globals captured in hot loops
- [ ] Functions return consistent types; `end` closes every block; `$` interpolation; `time_ns()`

Methodology (§2.0 — FORBIDDEN by default unless an exception is documented in code):
- [ ] No FD *derivative estimation*: gradients/derivatives of smooth objectives go through DI
      (`gradient(f, backend, x)`), never `(f(x+h)-f(x))/h`. (FD *discretizations* like PDE stencils are fine.) (§2.0.1)
- [ ] No grid sampling for continuous optima: `Optim`/`JuMP`/`Roots`/closed form (§2.0.2)
- [ ] No lerp as evaluation substitute; no grid+lerp combination (§2.0.3)

AD — `references/autodiff.md` (if any function will be differentiated):
- [ ] Differentiation goes through `DifferentiationInterface` with an `ADTypes` backend, not raw backend calls (§2.7.1)
- [ ] Repeated differentiation uses `prepare_*` once, reused in the loop (§2.7.2)
- [ ] Backend choice justified by input dimension and profile, not habit (§2.7.3)
- [ ] If `AutoForwardDiff` is in the path: all `zeros()` use `eltype(x)`, no `Float64()` casts, no `eigvals` in the AD path, branch selection done in Float64 first (§2.7.4)

Performance & verification — `references/performance.md` (for hot paths):
- [ ] First call is warmup; timing on the second (§2.6); `@btime`/`@b` with `$`-interpolated args
- [ ] Small fixed-size data uses `StaticArrays`; structured params use `ComponentArrays` (toolchain.md §2.9.1 / §2.9.2)
- [ ] **JET**: `report_package` clean (or reports justified); consider `@stable` on must-be-fast functions (§2.8)
- [ ] **AllocCheck**: `@check_allocs` passes on inner loops (§2.8)
- [ ] Parallel reductions use `OhMyThreads`, never `threadid()`-keyed buffers (toolchain.md §2.9.4)

Environment — `references/setup.md`:
- [ ] `--project=.` (or a named env) on every `julia` invocation (§5)
- [ ] `Project.toml` / `Manifest.toml` committed for reproducibility (§3.3)
- [ ] If symbolic computation is involved: the symbolic tool is chosen by ROLE, not preference (packages.md §4) — **SymEngine** for lightweight/throwaway algebra (no `simplify`/`integrate`); **Symbolics + ModelingToolkit** as the spine of an AI4S/SciML project (codegen, PDE/DAE, discovery — required there, not forbidden); **SymPyPythonCall** called as a service at a thin boundary for heavy CAS (`integrate`, `trigsimp`, `factor`, assumptions). Symbolic construction is localized in one module so the spine is never re-typed.

Package architecture — `references/architecture.md` (when the code outgrows one file / a large package):
- [ ] One top-level module; files split by role (types vs functions); **every `include` in the boss file in dependency order**, none in subfiles (§10.1)
- [ ] Circular type deps resolved by hoisting abstract types to `interfaces.jl` loaded first (§10.2)
- [ ] Growth handled by **subpackage / interface package**, not submodules; optional/heavy deps via **package extensions `[weakdeps]`**, not `Requires.jl` (§10.3–§10.4)
- [ ] Anti-spaghetti invariants hold: no non-const globals, **no type piracy**, small dispatched functions (§10.6); public API via `export`/`public` (§10.5)
