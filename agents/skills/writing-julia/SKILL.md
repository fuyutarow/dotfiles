---
name: writing-julia
description: >-
  Write correct, performant Julia for research. Use whenever the user
  runs Julia, writes hot numeric code, or does numerical experiments, AD/gradients, optimization,
  symbolic algebra, differential equations, package architecture, TTFX, or .so/AOT. Trigger on
  scope/let/const, Val, column-major loops, immutable/mutable struct,
  type stability / 型安定, dynamic vs multiple dispatch, function barrier, DifferentiationInterface,
  ADTypes, ForwardDiff, Enzyme, Zygote, JET, DispatchDoctor, AllocCheck, Aqua, ExplicitImports,
  Chairmarks, StaticArrays, ComponentArrays, OhMyThreads, Optim/JuMP/Manopt,
  SymEngine/Symbolics/ModelingToolkit/SymPyPythonCall, DrWatson/Pluto/Documenter/Quarto,
  PackageCompiler, juliac --trim, @ccallable, include order, submodules vs subpackages,
  weakdeps, type piracy, public API. MANDATORY — read BEFORE writing ANY Julia code. §2.0 forbids
  FD derivative estimation, grid sampling, and lerp-as-evaluation. Use DI for AD; multiple dispatch
  is not banned — the bug is type-unstable hot paths.
---

# Model Julia — Coding Discipline & Setup

> **Version**: v2607.1.1 (2026-07-03, Julia 1.12.6 baseline)
> **Scope**: Correct, performant, modern Julia for theoretical research — host-agnostic. This
> file holds the two precedence-setting sections inline (§1 Python→Julia pitfalls, §2.0
> numerical methodology); everything else lives in `references/` and is loaded on demand.
> **Out of scope**: live REPL iteration tooling (Revise, TestItems, JETLS, Cthulhu) —
> pointered from `references/setup.md` §8, not the focus here.
>
> **Changelog (recent)**:
> - v2607.1.1: **Effective Julia gap patch.** Added the missing guardrails surfaced by the
>   `let`/`const` + "Effective Julia" near-miss: `let` is a scope/fresh-binding tool (not normal
>   declaration syntax), `const` is global/const-field only; `Val` is a type-domain contract, not
>   a runtime speed spell; dense `Array` loops respect column-major memory order or use
>   `eachindex`; immutable `struct` remains the default, with `mutable struct` reserved for real
>   identity/state mutation. Trigger rows updated.
> - v2607.1.0: **type discipline reforged.** performance.md §2.1 rewritten as the type-stability
>   home: **multiple dispatch ≠ dynamic dispatch** (never "ban dispatch" — discipline is SCOPED to
>   hot loops / AD paths / compile boundaries); instability sources incl. **non-concrete struct
>   fields → parametrize** (`struct A{M<:AbstractMatrix}`); small `Union`s explicitly fine;
>   **§2.1.3 function barrier** (dynamic shell / type-stable core). setup.md **§3.5.1 shipping a
>   `.so` — two routes**: PackageCompiler `create_library` (STABLE — fat bundle, `init_julia`
>   contract, one Julia runtime per process) vs `juliac --trim` (EXPERIMENTAL — dispatch-free
>   `@ccallable` surface + type-stable deps); Layer-2 "not for research code" refined to "not for
>   whole research codebases — an extracted type-stable kernel is exactly what trim compiles".
>   Trigger keywords added (type stability/型安定, function barrier, PackageCompiler, juliac
>   --trim, @ccallable, .so). `tests/trigger-set.md` added (F3).
> - v2606.6.2: setup.md **§7 Output Files** corrected + expanded. `DelimitedFiles` clarified as an
>   *upgradeable* stdlib (bundled/pre-installed since 1.9, **NOT** being removed/unbundled —
>   JuliaLang/julia#50697) that a package must still declare in **`[deps]` + `[compat]`** (Aqua-
>   enforced); the real "dependency risk" is undeclared implicit `@stdlib` loading, fixed by
>   declaring — not by rewriting I/O. I/O tool now chosen by data shape (readdlm/writedlm = simple
>   numeric · CSV.jl+DataFrames = real tabular); hand-rolled `readlines`+`split`+`tryparse` flagged
>   an anti-pattern for real CSV (niche perf trick only).
> - v2606.6.1: packages.md **Data & visualization** gains the CairoMakie **CJK-font root fix** —
>   non-Latin (日本語/中文/한글) labels need a CJK-capable theme font (`set_theme!(fonts=…)` to a
>   Noto/HaranoAji/Hiragino OTF path) or Makie crashes on missing glyphs; shared `scripts/plots.jl`
>   preamble pattern; CairoMakie stays a script-only dep.
> - v2606.6.0: architecture.md **§10.2.1 Holy traits** added — when single inheritance can't
>   express cross-hierarchy / foreign-type behavior; zero-cost **only when the trait fn is
>   inferable**; hand-rolled THTT as default (SimpleTraits/Interfaces optional, no heavy trait
>   dep); trait fn obeys no-piracy. §10.6.1 gains the `@which`/`methods`/`@code_typed` "which
>   method ran / where from" dispatch-tracing workflow. Decision table + checklist updated.
> - v2606.5.0: **reorganized into progressive-disclosure layout.** SKILL.md trimmed to §1 + §2.0
>   + the reference index + the §9 checklist; performance/AD/toolchain/packages/setup split into
>   `references/`. Environment setup rewritten **host-agnostic** (juliaup + `--project=.`). No
>   coding-discipline content changed.
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
| `references/performance.md` | §2.1–§2.6 hot-path performance — **§2.1 type discipline: multiple vs dynamic dispatch, instability sources (non-concrete struct fields → parametrize), function barriers, `Val` guardrails**, globals/`const`/captured `let`, pre-alloc, broadcast, column-major loop order, `@inbounds`/`@simd`, benchmarking + §2.8 static verification (JET / DispatchDoctor / AllocCheck) | writing any repeated/hot-path computation, any struct definition, or before claiming code is correct |
| `references/autodiff.md` | §2.7 DifferentiationInterface frontend, `prepare_*`, backend selection, **§2.7.4 Dual-propagation rules** | any function that will be differentiated |
| `references/toolchain.md` | §2.9 modern toolchain map — StaticArrays, ComponentArrays, Lux+Reactant, OhMyThreads + selection table | choosing a data structure, GPU/NN, or parallelism tool |
| `references/packages.md` | §4 recommended packages by domain (AD, optimization, diffeq, algebra, **symbolic discipline**, manifolds, viz) | deciding which package to install for a task |
| `references/setup.md` | §3 install + project env + reproducibility + **§3.4 experiment-script lifecycle (DrWatson: an experiment is a *run* not a file; `src`/`scripts`/`_research`/distill 4-layer boundary; parameterize-don't-duplicate; distill-then-discard — prevents hundreds of accreted one-off scripts)** + TTFX + **§3.5.1 shipping a `.so` (PackageCompiler `create_library` vs `juliac --trim`)**, §5 running, §6 idioms, §7 output, §8 local-dev pointers + **§8.1 notebooks/literate docs (Pluto / Quarto / Documenter)** | setting up Julia, running code, managing reproducible experiments / avoiding experiment-script accretion, compiling a shared library / AOT binary, or choosing a notebook/report tool |
| `references/architecture.md` | §10 large-package architecture — one-module / role-split files / `include` order, circular-dep fix, **Holy traits for cross-hierarchy behavior (§10.2.1)**, subpackage & interface-package scale-out, package extensions (`[weakdeps]`), public API, anti-spaghetti invariants (no globals / no type piracy), **`@which`/`methods` dispatch tracing**, TTFX & invalidation hygiene | structuring a package beyond one file, organizing a large/growing codebase, or doing trait-based dispatch |

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

### 2.0.4 Long-running scripts: flush per-step progress, or you fly blind

Julia **block-buffers `stdout` when it is not a TTY** — redirected to a file, a pipe, a background
task, or a Monitor. Without an explicit `flush(stdout)` after each step, a script that runs for 20
minutes emits **nothing** until it exits: its whole runtime is unobservable, and you cannot tell
"still working" from "hung." Every loop / multi-step probe MUST flush a progress line per iteration.

```julia
# WRONG — buffered: 0 bytes visible for the entire run, then a dump at exit
for k in 1:K
    r = solve(k); @printf("K=%d Φ=%.6f\n", k, r.phi)        # sits in the buffer
end

# RIGHT — flush per step so background-task / Monitor reads show live progress
for k in 1:K
    r = solve(k); @printf("K=%d Φ=%.6f\n", k, r.phi); flush(stdout)
end
```

For real progress bars use `ProgressMeter.jl` (`@showprogress` / `next!(p)` flush internally). For a
restart heuristic, print **each restart's** result flushed, not just the final summary. And match
batch size to observability: a 40-solve sweep with no per-solve flush is a 20-minute blind spot —
prefer the smallest N that answers the question, emitted incrementally (this *is* the lightweight-probe
discipline; a buffered batch silently defeats it).

---

## 9. Checklist Before Submitting Julia Code

Correctness (§1):
- [ ] All indices start at 1; matrix multiply uses `*` (not `@`); element-wise ops use dot (`.+`, `.*`, `sin.()`)
- [ ] No untyped containers (`Float64[]` not `[]`); no globals captured in hot loops
- [ ] Functions return consistent types; `end` closes every block; `$` interpolation; `time_ns()`
- [ ] `let` creates a hard local scope / fresh binding; `const` is for globals or const fields in `mutable struct`, never a local variable declaration (setup.md §6 / performance.md §2.2)

Methodology (§2.0 — FORBIDDEN by default unless an exception is documented in code):
- [ ] No FD *derivative estimation*: gradients/derivatives of smooth objectives go through DI
      (`gradient(f, backend, x)`), never `(f(x+h)-f(x))/h`. (FD *discretizations* like PDE stencils are fine.) (§2.0.1)
- [ ] No grid sampling for continuous optima: `Optim`/`JuMP`/`Roots`/closed form (§2.0.2)
- [ ] No lerp as evaluation substitute; no grid+lerp combination (§2.0.3)
- [ ] Long-running / looping scripts `flush(stdout)` per step (or `ProgressMeter`); never a buffered batch that emits nothing until exit — background tasks and Monitor are blind otherwise (§2.0.4)

AD — `references/autodiff.md` (if any function will be differentiated):
- [ ] Differentiation goes through `DifferentiationInterface` with an `ADTypes` backend, not raw backend calls (§2.7.1)
- [ ] Repeated differentiation uses `prepare_*` once, reused in the loop (§2.7.2)
- [ ] Backend choice justified by input dimension and profile, not habit (§2.7.3)
- [ ] If `AutoForwardDiff` is in the path: all `zeros()` use `eltype(x)`, no `Float64()` casts, no `eigvals` in the AD path, branch selection done in Float64 first (§2.7.4)

Performance & verification — `references/performance.md` (for hot paths; reach for a tool only when its need is real — see packages.md §4 header):
- [ ] **Type discipline (§2.1)**: struct fields concrete or parametric (`struct A{M<:AbstractMatrix}`, never bare `data::AbstractMatrix` / untyped fields); runtime-typed data (config, I/O, `Any` columns) crosses a **function barrier** before the hot loop (§2.1.3); multiple dispatch used freely — only *runtime* dispatch inside hot loops / AD paths / `@ccallable` boundaries is the bug, never dispatch per se (§2.1.1)
- [ ] `Val` appears only when the value is already a compile-time/type-domain fact; never wrap runtime config/user input in `Val(x)` to "make it fast" (§2.1.4)
- [ ] First call is warmup; timing on the second (§2.6); `@btime`/`@b` with `$`-interpolated args
- [ ] Dense `Array` loops respect column-major memory order (`eachindex` or innermost first index); `@inbounds` follows an `axes`/`eachindex` proof, not hope (§2.5)
- [ ] Small fixed-size data uses `StaticArrays`; *if* params are already structured into many named blocks, `ComponentArrays` (toolchain.md §2.9.1 / §2.9.2)
- [ ] Default to immutable `struct`; use `mutable struct` only for identity/state mutation, with typed fields and `const` fields for invariants when useful (§2.1.2 / setup.md §6)
- [ ] **JET**: `report_package` clean (or reports justified); consider `@stable` on must-be-fast functions (§2.8)
- [ ] *If* an inner loop must be allocation-free and you've added AllocCheck for it: `@check_allocs` passes (§2.8) — don't carry AllocCheck without a guarded loop
- [ ] **Aqua** (if authoring a package): `Aqua.test_all` clean — no type piracy / ambiguities / stale deps / compat gaps (architecture.md §10.6.1)
- [ ] *If* the work is genuinely parallel: reductions use `OhMyThreads`, never `threadid()`-keyed buffers (toolchain.md §2.9.4) — serial code carries no threads dep

Environment — `references/setup.md`:
- [ ] If shipping a `.so`/AOT binary: route chosen per §3.5.1 — PackageCompiler `create_library` (stable, fat) vs `juliac --trim` (experimental; needs a dispatch-free `@ccallable` surface + type-stable deps) — never "Julia can't make a .so" and never trim-by-default
- [ ] `--project=.` (or a named env) on every `julia` invocation (§5)
- [ ] `Project.toml` / `Manifest.toml` committed for reproducibility (§3.3)
- [ ] **No declared-but-unused deps.** Every entry in `[deps]` is actually `using`/`import`ed in
      committed code; packages added at point of use, not preemptively from the packages.md catalog;
      a dep whose last use was deleted is `Pkg.rm`'d in the same commit. Heavy offenders to never carry
      speculatively: `Enzyme`/`AllocCheck` (LLVM+GPUCompiler), `Manopt`+`Manifolds` (~100 transitive),
      `Reactant`/`Lux` (XLA). Declared-but-unused deps inflate Manifest, instantiate, and TTFX, and make
      every `Pkg` op trigger native recompiles for code never called (packages.md §4 header).
- [ ] If symbolic computation is involved: the symbolic tool is chosen by ROLE, not preference (packages.md §4) — **SymEngine** for lightweight/throwaway algebra (no `simplify`/`integrate`); **Symbolics + ModelingToolkit** as the spine of an AI4S/SciML project (codegen, PDE/DAE, discovery — required there, not forbidden); **SymPyPythonCall** called as a service at a thin boundary for heavy CAS (`integrate`, `trigsimp`, `factor`, assumptions). Symbolic construction is localized in one module so the spine is never re-typed.

Package architecture — `references/architecture.md` (when the code outgrows one file / a large package):
- [ ] One top-level module; files split by role (types vs functions); **every `include` in the boss file in dependency order**, none in subfiles (§10.1)
- [ ] Circular type deps resolved by hoisting abstract types to `interfaces.jl` loaded first (§10.2)
- [ ] Cross-hierarchy / foreign-type behavior done via **Holy trait** with an **inferable** trait fn (not a forced supertype, not a trait dep); trait fn obeys no-piracy (§10.2.1)
- [ ] Growth handled by **subpackage / interface package**, not submodules; optional/heavy deps via **package extensions `[weakdeps]`**, not `Requires.jl` (§10.3–§10.4)
- [ ] Anti-spaghetti invariants hold: no non-const globals, **no type piracy**, small dispatched functions (§10.6); public API via `export`/`public` (§10.5)
