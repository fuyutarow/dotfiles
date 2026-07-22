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
  weakdeps, type piracy, public API. MANDATORY — read BEFORE writing ANY Julia code, and BEFORE RUNNING any experiment/benchmark whose numbers may be recorded (実験を回す, ベンチ実行, 事前登録の実験, GB実験 — JG5 fires on the RUN, not only the code). §2.0 forbids
  FD derivative estimation, grid sampling, and lerp-as-evaluation. Use DI for AD; multiple dispatch
  is not banned — the bug is type-unstable hot paths. Co-fires with ORDER: Julia feature/bugfix →
  implementing-and-debugging first (change-safety), this for idiom; Julia refactor →
  refactoring-code governs (two hats/oracle), this supplies JET/Aqua brackets + Julia-safe
  transforms. Lean/formal proofs → proving-theorems; Python tooling → running-python-tools
  (PythonCall/SymPyPythonCall from Julia stays here); GPU kernels / CuArray performance /
  CUDA.jl → optimizing-julia-gpu-kernels (host-side type & package discipline stays here).
---

# Model Julia — Coding Discipline & Setup

> **Version**: v2607.4.0 (2026-07-22) — JG5 EXPERIMENT PROVENANCE added from the firedancer postmortem: JG4 carried the DrWatson clause since v2607.3.0 yet 70 accreted scripts + lost provenance happened anyway — because the skill fired on WRITING code, not on RUNNING experiments, and the artifact was not mechanical. JG5 makes the run the trigger and the committed provenance the artifact.
> (prior: v2607.3.0 (2026-07-14, Julia 1.12.6 baseline `[dated:2026-07]`)
> **Scope**: Correct, performant, modern Julia for theoretical research — host-agnostic. This
> file holds the two precedence-setting sections inline (§1 Python→Julia pitfalls, §2.0
> numerical methodology); everything else lives in `references/` and is loaded on demand.
> **Out of scope**: live REPL iteration tooling (Revise, TestItems, JETLS, Cthulhu) —
> pointered from `references/setup.md` §8, not the focus here.
> **Staleness registry**: fast-moving facts are tagged `[dated:YYYY-MM]` in place (locality
> beats physical isolation — the fact IS the decision input where it sits). Before trusting one,
> `grep -rn '\[dated:' agents/skills/writing-julia/` and re-verify anything older than ~2 quarters:
> Julia version baseline (here) · `juliac --trim` experimental status (setup.md §3.5/§3.5.1/§3.6) ·
> JETLS-replaces-LanguageServer (setup.md §8) · no-native-traits / not-on-roadmap (architecture.md
> §10.2.1).
>
> **Changelog (recent)**:
> - v2607.3.1: **GPU sibling landed.** The "direct GPU-array entries (CUDA/Metal)" deferral
>   below is now CLOSED for CUDA: `optimizing-julia-gpu-kernels` owns device kernels, CuArray
>   performance, and kernel-under-AD (reciprocal routing row added). Metal remains deferred.
> - v2607.3.0: **package-catalog gap patch (audit-driven: Terra 5.6 + a 5-lens fleet).** Closed the
>   holes where the catalog omitted anchors its OWN philosophy demands (frontend-per-primitive;
>   "each shape has one answer"; the mandatory DrWatson lifecycle) — NOT starter-kit inflation.
>   packages.md gains: a **Numerical integration** block (`QuadGK` 1-D · `Integrals` frontend), a
>   **linear & nonlinear systems at scale** block (`LinearSolve` frontend · `Krylov` backend — not
>   IterativeSolvers, superseded · `NonlinearSolve` for N-D F(x)=0), `Distributions` as the first
>   non-stdlib probability add, and `JLD2` as the DrWatson result-serialization anchor. Bugs fixed:
>   §2.0.2's "each shape has one answer" table was missing the N-D nonlinear-system row
>   (`NonlinearSolve` added; §9 checklist synced); setup.md §3.4's DrWatson example mixed a stale
>   `.bson` savename with `.jld2` @tagsave (now `.jld2` throughout — DrWatson's BSON default is
>   retired); toolchain.md §2.9.5 wrongly framed `Reactant` as replacing hand-written `CUDA.jl`
>   (they are parallel choices — XLA tracing vs GPU arrays). Deliberately deferred (point-of-use /
>   narrower audience): Optimization.jl frontend promotion, direct GPU-array entries (CUDA/Metal).
> - v2607.2.0: **house-bar reforge (LAW + gates + routing).** External review accepted in part:
>   added THE LAW + named gates JG0–JG4 (JG3 promotes architecture.md §10 from
>   read-when-needed to a first-class gate — fires the moment a package outgrows one file);
>   added the Routing table (reciprocal cuts: implementing-and-debugging / refactoring-code
>   co-fire order, proving-theorems, running-python-tools) — the sibling side had these landed
>   since 2026-07-04/05, this side was missing (F2 asymmetry). Trigger set overhauled: fire set
>   gains the architecture asks (include order, circular deps, submodule-vs-subpackage,
>   weakdeps, piracy, public/export, ambiguity, invalidation), no-fire set rebuilt as true
>   near-misses. Dated-facts registry added (grep `[dated:`). `tests/forge-verification-ledger.md`
>   added (F3 was incomplete: trigger set only, no findings ledger).
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

## THE LAW

> A fast implementation of the wrong method is still wrong, and an idiomatic-looking Julia file
> can still be a Python program in disguise. Precedence: **method before speed, types before
> tuning, architecture before growth.** §2.0 (methodology) and §1 (pitfalls) are read FIRST and
> outrank everything in `references/`; and the moment a package outgrows one file, its structure
> passes the architecture gate (JG3) — not "when someone asks about architecture."

## The gates — JG0–JG4, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **JG0 methodology** (§2.0, deny-gate) | FD derivative estimation / grid sampling / lerp-as-evaluation **FORBIDDEN by default**; long-running scripts flush per step | an invoked exception carries a **one-line comment in the code** naming which permitted exception applies — no comment = violation |
| **JG1 pitfalls** (§1) | 1-indexing, `.*` vs `*`, no globals in hot loops, typed containers, `let`/`const` semantics | §9 Correctness checklist rows green |
| **JG2 type discipline** (performance.md §2.1) | concrete/parametric struct fields; function barrier for runtime-typed data; dispatch discipline SCOPED to hot paths — never "ban dispatch" | **JET** `report_package` clean (or reports justified); `@code_warntype`/DispatchDoctor on must-be-fast fns |
| **JG3 ARCHITECTURE** (architecture.md §10) ★ | **Fires the moment a package outgrows ONE file, adds a dep/extension, or defines public API** — do not wait to be asked: one top-level module; ALL `include`s in the boss file in dependency order (an `include` in a subfile is a defect); circular type deps → hoist to `interfaces.jl`; growth → **subpackage/interface package, not submodules**; optional/heavy deps → **`[weakdeps]` extensions, not Requires.jl**; API via `export`/`public`; **no type piracy, no non-const globals**; cross-hierarchy behavior → inferable Holy trait | **Aqua** `test_all` clean (piracy/ambiguities/stale deps); boss-file include order readable top-to-bottom; ExplicitImports clean |
| **JG4 reproducibility** (setup.md) | `--project=.` on every invocation; `Project.toml`+`Manifest.toml` committed; no declared-but-unused deps; experiment scripts follow the DrWatson lifecycle | `Pkg.status` matches `using`s; §9 Environment rows green |
| **JG5 EXPERIMENT PROVENANCE** (setup.md §3.4) ★ | Fires on RUNNING any experiment/benchmark whose numbers may enter a results record — not just on writing package code. A result-producing run MUST be reproducible from the repo: runner script lives in the repo (scratchpad-only runners are FORBIDDEN for recordable results), inputs/params declared, output written via DrWatson `@tagsave`/`savename` (git commit auto-recorded) or an equivalent registry binding experiment-ID → script+commit+params. Protocol constants (seeds, data slices, eval windows) come from ONE shared module, never copy-pasted per script | the run's output file contains the commit hash (tagsave `gitcommit` field) or the registry row exists; `grep` finds the runner under version control, not only in a scratchpad |

## Routing — sibling cuts (reciprocal; the sibling side landed 2026-07-04/05)

| Sibling | Cut |
|---|---|
| `implementing-and-debugging` | **Co-fire on any non-trivial Julia feature/bugfix, with ORDER**: that skill owns language-agnostic change-safety (intent reconstruction, edit-surface scoping, root-cause vs symptom, regression fear) — run its BUILD/DEBUG gate FIRST; this skill owns what correct Julia looks like inside that frame (JG0–JG4). Its reciprocal row: "language skills own correctness/perf idiom." |
| `refactoring-code` | **Co-fire on any behavior-preserving Julia restructuring, with ORDER**: its two-hats / oracle / deny-gate govern the change discipline; this skill supplies the Julia-specific oracle components (JET / Aqua / `report_package` as the green bracket) and the Julia-safe transforms (JG3: include-order moves, subpackage extraction, weakdeps migration). A Julia refactor that improves no named property is still 場当たり churn — its G3 applies unchanged. |
| `proving-theorems` | PURPOSE cut: formalizing/machine-checking a THEOREM (Lean, proof assistants) → there, even when the math started life as Julia numerics. Numerical computation/experiment in Julia → here. "Port this Julia result to a formal proof" → there, this stays for the Julia side only. |
| `optimizing-julia-gpu-kernels` | DECISIVE cut — **does the code run on (or manage) the device?** CUDA.jl / KernelAbstractions kernels, CuArray performance, launch config, GPU profiling, kernel-under-AD (rrule for a kernel) → there. Host-side type discipline, AD frontend choice, package architecture → HERE. Co-fire with ORDER on GPU-in-Julia work: JG2 type discipline is that skill's GK1 precondition — instability that is merely slow on CPU is a COMPILE ERROR inside a kernel. toolchain.md §2.9.5's Reactant-vs-CUDA.jl framing stays here; the moment a hand kernel or CuArray perf question appears → there. |
| `running-python-tools` | LANGUAGE cut: invoking a Python CLI/one-off → there. Calling Python FROM Julia (SymPyPythonCall, PythonCall/juliacall boundary) → HERE — that is a Julia dependency-architecture decision (JG3/packages.md), not Python tooling. |
| `writing-python` | LANGUAGE cut: authoring/reviewing Python that lives in a repo (a Python project beside the Julia one, pyproject.toml, Python library selection) → there; the PythonCall/juliacall boundary itself stays HERE. |
| `raising-resolution` | Silent sub-step (its owner-filter chain routes Julia work here): inspect the actual code/env (`versioninfo()`, `Pkg.status`, `@which`) before asserting a Julia fact. |

## MUST NOT FIRE

A question ABOUT the Julia ecosystem with no code to write (licensing, history, "what is JuliaHub")
— plain answer. Prose/docs ABOUT a Julia project (README, paper text → `linting-prose` /
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
# 1-D root → Roots.jl; N-D nonlinear system F(x)=0 → NonlinearSolve.jl (never Optim on ‖F‖²).
# Feasible set is a manifold → Manopt (packages.md). Closed form → use it.
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
- [ ] No grid sampling for continuous optima: `Optim`/`JuMP`/`Roots` (1-D) / `NonlinearSolve` (N-D systems F(x)=0) / closed form (§2.0.2)
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
