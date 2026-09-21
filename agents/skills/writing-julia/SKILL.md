---
name: writing-julia
description: >-
  Write strict modern Julia for research and packages. Use for Julia code/runs, experiments, AD,
  hot paths, package layout/naming, Pkg metadata, deps/compat/sources/workspaces, extensions,
  API/release, TTFX, or AOT. Trigger on Julia パッケージ, パッケージ化, 依存関係, 登録,
  type stability/型安定, DI, JET/Aqua, DrWatson, JSON/TOML, include order, submodules,
  export禁止, no exports, public API, 名前空間, and `.jl` suffix. ZERO-EXPORTS is mandatory:
  every authored module forbids `export`/`@reexport`; stable API uses `public`; package source
  forbids implicit imports. MANDATORY before Julia code or a recordable run. §2.0 forbids FD
  derivatives, grid optimization, and lerp-as-evaluation.
  Co-fire: feature/bugfix → implementing-and-debugging first. Refactor → refactoring-code governs.
  GPU device work → optimizing-julia-gpu-kernels after host type discipline. Formal proofs →
  proving-theorems. Python tooling → running-python-tools. Config authority →
  governing-configuration-systems. Descriptive, VCS-only, and legal asks stay out.
---

# Model Julia — Coding Discipline & Package Engineering

> **Version**: v2609.3.0 (2026-09-21) — ZERO-EXPORTS + explicit imports mandatory; delimiters ≠ output encoding (merges parallel v2609.1.0).
> **Scope**: modern Julia for research, from numerical method to a distributable package contract.
> **History and source grades**: `tests/forge-verification-ledger.md`.

```bash
for f in performance autodiff toolchain packages setup architecture packaging; do test -f "references/$f.md" || echo "MISSING references/$f.md"; done; test -f assets/no_exports.jl || echo "MISSING assets/no_exports.jl"; test -f tests/trigger-set.md || echo "MISSING tests/trigger-set.md"; test -f tests/forge-verification-ledger.md || echo "MISSING tests/forge-verification-ledger.md"
```

Fast-moving facts carry `[dated:YYYY-MM]` at their decision locus. Re-check stale tags against the
primary source before spending them. The ledger records prior versions and retired claims.

Before a recordable or parallel Julia run, read P7 in `orchestrating-agents`.
Run through `agent-resource-run`. P7 alone owns resource limits.

## THE LAW

> A fast implementation of the wrong method is still wrong, and an idiomatic-looking Julia file
> can still be a Python program in disguise. Precedence: **method before speed, types before
> tuning, package contract before repository decoration, architecture before growth. Namespace
> injection is forbidden: **zero exports, public-only API, explicit imports.** §2.0 and §1 outrank
> the references. JG6 fires at package birth; JG7 fires on every module/API/import change.

## The gates — JG0–JG7, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **JG0 method** (§2.0) | Deny FD/grid/lerp; flush long runs. | Exception comment. |
| **JG1 pitfalls** (§1) | Julia syntax, scope, broadcast, typed data. | §9 rows green. |
| **JG2 types** (`performance.md`) | Parametrize; isolate runtime types. | JET + hot checks. |
| **JG3 architecture** (`architecture.md`) | Role files, includes, namespaces, API. | Include order + scoped Aqua/ExplicitImports. |
| **JG4 environment** (`setup.md`) | Exact profiles instantiate; libraries resolve fresh. | `Pkg.status` or fresh `Pkg.test`. |
| **JG5 provenance** (`setup.md`) | A run may enter a result record. | ID → runner + inputs + commit. |
| **JG6 package** (`packaging.md`) | Identity, deps, workspace, registry, release. | PK0 + checklist + PK4/PK8 gate. |
| **JG7 namespace** (`architecture.md` §10.5) | No exports; public API and dependency use are explicit. | `no_exports.jl` + strict ExplicitImports. |

## Routing — sibling cuts (reciprocal; the sibling side landed 2026-07-04/05)

| Sibling | Cut |
|---|---|
| governing-configuration-systems | **DECISIVE:** Julia manifests/parsers → HERE. Config authority → there. |
| `wiring-repositories` | **BY ARTIFACT:** Julia package content → HERE. Repo layer set and polyglot roots → there. |
| `implementing-and-debugging` | **Co-fire:** its BUILD/DEBUG gate first; Julia correctness here. |
| `refactoring-code` | **Co-fire:** it governs behavior preservation; Julia transforms and oracles here. |
| `practicing-tiger-style` | **LANGUAGE:** Julia mechanism → HERE. Cross-language risk ledger → there. |
| `proving-theorems` | **PURPOSE:** formal theorem → there. Julia computation or experiment → HERE. |
| `optimizing-julia-gpu-kernels` | **DEVICE:** kernel/CuArray work → there. Host types/packages → HERE. |
| `running-python-tools` | **LANGUAGE:** Python CLI → there. Python called from Julia → HERE under JG6. |
| `writing-python` | **LANGUAGE:** Python source/project → there. PythonCall boundary → HERE. |
| `raising-resolution` | Inspect `versioninfo()`, `Pkg.status`, or `@which` before a Julia fact. |

## MUST NOT FIRE

A package-authoring or distribution decision fires even before code exists. Descriptive ecosystem
questions stay plain when they change no artifact. Examples are history, hosting facts, and legal
license interpretation. Prose/docs ABOUT a Julia project (README, paper text → `linting-prose` /
`structuring-documents`). Formal proofs (→ `proving-theorems`). Python/R/C++ numerics with no Julia
in play (Python tooling → `running-python-tools`). The full near-miss set is
`tests/trigger-set.md` — desk-check it after any description edit.

---

This skill provides coding rules partitioned by consequence. **Read §1 and §2.0 below first** —
they set precedence: a fast implementation of the wrong method is still wrong. Then open the
reference file that matches the task.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/performance.md` | types, hot paths, memory, benchmarks, checks | numeric or struct code |
| `references/autodiff.md` | DI frontend, preparation, backend choice, dual propagation | differentiated functions |
| `references/toolchain.md` | data structures, NN/accelerator stack, parallelism | structure or compute-tool choice |
| `references/packages.md` | research package choices; persistence vs interchange | dependency selection |
| `references/packaging.md` | identity, deps, manifests, workspaces, state, release | package lifecycle |
| `references/setup.md` | install, execution, exact envs, experiments, TTFX/AOT, output, REPL | runs and deployment |
| `references/architecture.md` | topology, ZERO-EXPORTS, explicit imports, traits, API, hygiene | implementation structure |

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
| `f'"key": {value}'` | `""""key":$value"""` | For controlled text containing `"`, triple quotes avoid source escapes |
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

### String construction — delimiters are syntax; encoding is a boundary

For human-readable, controlled text, choose the delimiter before inserting escapes:

```julia
label = """run "$name" scored $(round(score; digits = 4))"""
```

`"""..."""` still interpolates `$name` and `$(expr)`, while allowing ordinary `"` in the
source. `raw"..."` is for literal backslashes or dollar signs and deliberately disables
interpolation, so it is not the answer here.

Do **not** turn an external format into a template and pre-escape each value. Interpolation calls
`string`; it does not JSON-escape `name`, quote a shell argument, or bind SQL. For JSON,
construct typed data and serialize it at the boundary:

```julia
using JSON

payload = JSON.json((; name, score = round(score; digits = 4)))
```

Likewise use the target's parameter/builder API for SQL, shell commands, HTML, and URLs. Values
stay raw until that API encodes or binds them exactly once.

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

This section sets precedence. §2.0 governs *what* approach is allowed.
The references govern *how* to implement that choice.

LLMs habitually fall into three numerical-method pitfalls. All three are denied as the primary
approach. A permitted exception requires a one-line code comment naming the exception.

### 2.0.1 Finite-difference derivative *estimation* — FORBIDDEN. Use AD.

This forbids finite-difference estimates of derivatives for smooth numerical objectives.
It does not forbid finite-difference discretizations. PDE stencils and method-of-lines spatial
derivatives are numerical methods, not derivative estimation.

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

**Why**: FD balances truncation against round-off and requires a tuned step size.
Forward difference bottoms out near √eps; central difference near eps^(2/3).
Both remain above machine precision, and higher derivatives compound error.
AD has no truncation error, needs no step size, and composes for higher derivatives.

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
# 1-D root → Roots.jl; N-D nonlinear system F(x)=0 → NonlinearSolve.jl (never Optim on ‖F‖²).
# Feasible set is a manifold → Manopt (packages.md). Closed form → use it.
```

**Why**: grid cost scales as N^D, resolution bounds the answer, and convergence is not guaranteed.

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

**Why**: lerp injects O(h²) error. It can dominate work needing smoothness or convergence rates.
AD through lerp produces a piecewise-constant derivative.

**Permitted exceptions** (write the exception in a comment):
- Visualization at sub-pixel scales (the lerp IS the rendering).
- Deliberate piecewise-linear models where linearity is part of the formulation (FEM with P1
  elements, control schedules with linear ramps).

### Combined pattern: grid + lerp = doubly wrong

The common combined failure tabulates `f` on a coarse grid, then lerps many query points.
Both steps are denied. Compute directly or use an interpolant with documented error bounds.

### 2.0.4 Long-running scripts: flush per-step progress, or you fly blind

Julia block-buffers `stdout` when it is not a TTY. A pipe, file, background task, or Monitor can
therefore show nothing until exit. Every long loop or multi-step probe must flush each iteration.

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

Use `ProgressMeter.jl` for real progress bars. Print and flush each restart, not only the summary.
Match batch size to observability. Prefer the smallest increment that answers the question.

---

## 9. Checklist Before Submitting Julia Code

Correctness (§1):
- [ ] All indices start at 1; matrix multiply uses `*` (not `@`); element-wise ops use dot (`.+`, `.*`, `sin.()`)
- [ ] No untyped containers (`Float64[]` not `[]`); no globals captured in hot loops
- [ ] Functions return consistent types; `end` closes every block; `$` interpolation; `time_ns()`
- [ ] Controlled text chooses `"""..."""` before source-level `\"`; JSON uses `JSON.json` on data, never a hand-escaped interpolation template
- [ ] `let` creates a fresh hard-local binding.
- [ ] `const` is for globals or const fields, never a local declaration (§2.2).

Methodology (§2.0 — FORBIDDEN by default unless an exception is documented in code):
- [ ] No FD *derivative estimation*: gradients/derivatives of smooth objectives go through DI
      (`gradient(f, backend, x)`), never `(f(x+h)-f(x))/h`. (FD *discretizations* like PDE stencils are fine.) (§2.0.1)
- [ ] Continuous optima use a solver or closed form, not a grid (§2.0.2).
- [ ] No lerp as evaluation substitute; no grid+lerp combination (§2.0.3)
- [ ] Long loops flush each step or use `ProgressMeter` (§2.0.4).

AD — `references/autodiff.md` (if any function will be differentiated):
- [ ] Differentiation goes through `DifferentiationInterface` with an `ADTypes` backend, not raw backend calls (§2.7.1)
- [ ] Repeated differentiation uses `prepare_*` once, reused in the loop (§2.7.2)
- [ ] Backend choice justified by input dimension and profile, not habit (§2.7.3)
- [ ] ForwardDiff paths propagate `eltype(x)` and avoid `Float64` casts (§2.7.4).

Performance & verification — `references/performance.md`:
- [ ] Struct fields are concrete or parametric; runtime-typed data crosses a function barrier (§2.1).
- [ ] Multiple dispatch is free to use; runtime dispatch is removed only from hot/static paths.
- [ ] `Val` carries an existing compile-time fact, never runtime config (§2.1.4).
- [ ] First call is warmup; timing on the second (§2.6); `@btime`/`@b` with `$`-interpolated args
- [ ] Dense loops use column-major order; `@inbounds` follows an index proof (§2.5).
- [ ] Small fixed data uses StaticArrays; named parameter blocks may use ComponentArrays.
- [ ] Immutable structs are default; mutation requires identity/state semantics (§2.1.2).
- [ ] **JET**: `report_package` clean (or reports justified); consider `@stable` on must-be-fast functions (§2.8)
- [ ] Allocation-free kernels pass `@check_allocs`; otherwise omit AllocCheck.
- [ ] Authored packages pass scoped Aqua and ExplicitImports checks (§10.6.1).
- [ ] Parallel reductions use OhMyThreads, never `threadid()` buffers (§2.9.4).
- [ ] Recordable or parallel runs have a P7 envelope and `agent-resource-run` verdict.

Environment — `references/setup.md`:
- [ ] A `.so`/AOT build follows setup.md §3.5.1; never trim by default.
- [ ] `--project=.` (or a named env) on every `julia` invocation (§5)
- [ ] Exact environments use the manifest policy selected by JG6 (§3.3).
- [ ] Recordable runs satisfy JG5 and the P7 resource gate.

Package contract — `references/packaging.md`:
- [ ] PK0 names consumer, topology, and distribution target.
- [ ] Package name, UUID, module, and `src/<name>.jl` agree.
- [ ] Runtime, optional, development, and payload dependencies use distinct mechanisms.
- [ ] `[compat]`, workspace, and manifest policy match the selected profile.
- [ ] Package state is external, relocatable, and never written into the installed tree.
- [ ] Fresh install/import/test passes; registry checks run only for the chosen registry.

Namespace contract — `references/architecture.md` §10.5:
- [ ] No root, child, or extension module exports or reexports any binding.
- [ ] `Reexport.jl` is not a dependency.
- [ ] `Requires.jl` is not a dependency.
- [ ] Stable API uses `public`; `[compat] julia = "1.11"` exactly.
- [ ] The copied `assets/no_exports.jl` gate passes for source, runtime state, API set, and extensions.
- [ ] Every §10.5.1 ExplicitImports check passes under the strict keyword settings.
- [ ] Existing exports are removed as a breaking release, never kept as a transition shim.

Package architecture — `references/architecture.md`:
- [ ] One public top-level module; ordinary role-file includes are ordered in the boss file (§10.1).
- [ ] Circular type deps resolved by hoisting abstract types to `interfaces.jl` loaded first (§10.2)
- [ ] Cross-hierarchy behavior uses an inferable Holy trait without piracy (§10.2.1).
- [ ] Namespace-only boundaries use submodules; independently reusable/versioned parts use packages (§10.3).
- [ ] Optional integration code lives in its named `ext/` module (§10.4).
- [ ] No non-const globals or piracy; public API uses `public` only (§10.5–§10.6).
