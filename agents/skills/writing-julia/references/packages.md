# Recommended Packages by Research Domain (§4)

> **This is a lookup catalog, not a starter kit. Add a package at the point of first
> use, never preemptively.** A dependency you declared in `Project.toml` but never
> `using`/`import` in committed code is not free: it inflates the `Manifest`, the
> precompile/instantiate time, and TTFX — and the heavy ones drag in native-compile
> toolchains that dominate every `Pkg` operation. Observed cost: `Enzyme` pulls
> `Enzyme_jll` + LLVM IR compilation; `Manopt`+`Manifolds` pull ~100 transitive deps;
> `AllocCheck` pulls GPUCompiler+LLVM. A project doing AD at `d≤5` with `ForwardDiff`,
> and hand-rolled Riemannian steps, was carrying all of these **declared-but-unused** —
> every Manifest touch triggered a multi-minute LLVM recompile storm for code never called.
>
> **The rule:** when a task needs differentiation, add `DifferentiationInterface`+`ForwardDiff`
> — not the whole AD section. When you later profile ForwardDiff as the bottleneck at high
> input dim, *then* add `Enzyme`. Same for every section below. Treat each entry as
> "reach for this *when* the described need arises," not "install this because the domain
> matches." If you delete the last use of a package, remove it from `Project.toml` in the
> same commit (`Pkg.rm`). Aqua's stale-deps test + ExplicitImports surface drift, but the
> discipline is upstream: **add at point of use, prune at point of disuse.**

**Core (stdlib, no install needed):** `LinearAlgebra`, `Statistics`, `Random`, `SparseArrays`, `Printf`

**Probability (the first non-stdlib add — infrastructure tier, beside the core trio):** `Distributions`
— named distributions, `pdf`/`logpdf`, sampling, and fit-to-data. `Random` alone gives only basic RNG;
reach for `Distributions` the moment you do Monte Carlo, likelihood-based fitting, or supply an SDE
noise process (the `DifferentialEquations` entry below covers **SDEs**, which need one). Heavier
Bayesian PPL work (`Turing`, which re-exports `Distributions` and owns `MCMCChains`/`AdvancedHMC`/
`Bijectors` transitively) is a point-of-use add layered on top — not carried preemptively.

---

## AD frontend & backends (the modern spine — autodiff.md §2.7)
- `DifferentiationInterface` — the frontend. All differentiation goes through here.
- `ADTypes` — the `AutoX()` backend-selector types. A dependency of DI; import for the constructors.
- `ForwardDiff` — forward-mode via dual numbers, no compile overhead. **Default backend for ≤100
  inputs and Hessians.** Dual rules in autodiff.md §2.7.4.
- `Enzyme` — LLVM-IR reverse mode, very fast, supports mutation. Default reverse-mode when
  input_dim ≫ 100 and ForwardDiff is profiled as the bottleneck.
- `Zygote` — pure-Julia reverse mode; mature, slow on mutable/branchy code.
- (sparse) `SparseConnectivityTracer` + `SparseMatrixColorings` — pulled in by `AutoSparse`.

## Verification & measurement (performance.md §2.8 / §2.6)
- `JET` — static type-error / dispatch scanner; `@test_opt` in suites.
- `DispatchDoctor` — `@stable` to forbid instability at the definition site.
- `AllocCheck` — `@check_allocs` for compile-time zero-allocation guarantee.
- `Aqua` — **package-hygiene meta-tests** (`Aqua.test_all(MyPkg)` in `test/`): detects **type
  piracy**, method ambiguities, unbound type parameters, undefined/undocumented exports, stale
  deps, and `[compat]` gaps. The CI enforcement of the invariants the compiler does NOT check
  (architecture.md §10.6). Distinct from JET (type/bug analysis) and Runic (formatting); add it to
  every package you author.
- `ExplicitImports` — namespace-hygiene check: flags implicit `using`-brought names and
  unused/stale imports, pushing toward explicit `using A: f` (SciMLStyle). Complements Aqua.
- `Chairmarks` — fast repeated benchmarking (`@b`); `BenchmarkTools` only for `BenchmarkGroup`.
- `Runic` — code formatter. Zero-configuration by design (formatting is fixed, not tunable),
  which is exactly why it is the SciML-standard formatter — uniformity across a codebase over
  per-author preference. Run it on any package you produce rather than hand-aligning code.

## Data structures & parallelism (toolchain.md §2.9)
- `StaticArrays` — small fixed-size `SVector`/`SMatrix` (state vectors, rotations).
- `ComponentArrays` — named-yet-flat optimizer parameters.
- `Accessors` — immutable nested update (`@set`).
- `OhMyThreads` — safe data-parallel `tmapreduce`/`@tasks`.

## Optimization
- `JuMP` + `HiGHS` — modeling for LP, MILP, and convex QP. HiGHS does **not** solve SOCP or SDP,
  nor mixed-integer QP.
- For conic problems through JuMP: SOCP/SDP → `Clarabel` (default open-source choice), `SCS`,
  `COSMO`, or `Hypatia`; `Mosek` if a commercial license is acceptable. A restricted-master SDP
  must use one of these, not HiGHS.
- `Optim` — gradient-based and derivative-free; pass `autodiff = :forward`.

## Numerical integration (quadrature) — the frontend pattern, same shape as DI for AD
- `QuadGK` — 1-D adaptive Gauss–Kronrod; the "evaluate the integral **exactly**" tool for a smooth
  1-D integrand (the integration analogue of §2.0's no-grid / no-lerp rule — reach for real
  quadrature, not a Riemann sum). Near-universal, near-zero compile cost.
- `Integrals` — the SciML **unified frontend** (structurally like `DifferentiationInterface` for
  AD): dispatches to QuadGK / HCubature / Cubature / Monte-Carlo by problem shape, and is
  AD-composable (differentiate through the integral). Use it for multi-dimensional or
  differentiate-through cases; `HCubature` is a backend it routes to, not a separate catalog add.

## Linear & nonlinear systems at scale — name the frontend, not a menu of backends
- `LinearSolve` — the SciML **unified `Ax=b` frontend**: auto-selects a dense factorization vs an
  iterative method by matrix type / size / sparsity, with preconditioner support. Reach for it once
  a system outgrows a dense `\` — `SparseArrays` in Core already implies you will.
- `Krylov` — the preferred modern iterative/Krylov **backend** (CG, GMRES, MINRES, LSQR…; CPU+GPU)
  that LinearSolve routes to. Prefer over `IterativeSolvers` (superseded). Name it directly only to
  pin a specific method; otherwise go through `LinearSolve`.
- `NonlinearSolve` — the SciML frontend for **multivariate** root-finding / nonlinear systems
  F(x)=0 and steady states (Newton, Newton–Krylov, trust-region; consumes `ADTypes`/DI for the
  Jacobian). The N-D sibling of `Roots.jl` (1-D). SKILL.md §2.0.2's "each shape has one answer"
  routes here for N-D systems — never fake it with `Optim.optimize(‖F‖²)` (numerically inferior).

## Differential equations (heavy)
- `DifferentialEquations` — full ODE/SDE/DDE/DAE suite (100+ solvers).
- `OrdinaryDiffEq` — ODE-only subset, lighter deps.
- `SciMLSensitivity` — adjoint/forward sensitivity; takes an `ADTypes` backend.

## NN (toolchain.md §2.9.3) — Lux is the default; Reactant is a separate, heavy, opt-in XLA layer
- `Lux` — **default NN library for new work** `[dated:2026-08]`. Explicit parameters and state
  (`model(x, ps, st)`), Zygote-backed out of the box. Installing it does NOT pull XLA: `Reactant`,
  `Enzyme` and `Zygote` are `[weakdeps]` in Lux v1.31.4, never `[deps]`.
- `Flux` — actively maintained `[dated:2026-08]`, not deprecated. Keep for existing Flux code only;
  DiffEqFlux.jl documents a `Flux.destructure` bug (silent `Float64`→`Float32`) and prefers Lux.
- `Reactant` — heavy. Install only when toolchain.md §2.9.3's escalation rule fires (GPU/TPU
  throughput, or mutation Zygote cannot handle): Julia → MLIR → XLA compilation; EnzymeMLIR AD.

## Algebra, number theory, finite fields — use exact names
- `Nemo` (Flint/Arb exact arithmetic), `AbstractAlgebra` (pure-Julia generic algebra),
  `GaloisFields` (GF(p^k); exact name `"GaloisFields"`), `Hecke` (alg. number theory, heavy),
  `Oscar` (unified CAS, very heavy 5–10 min).

## Polynomial systems & Gröbner bases
- `HomotopyContinuation` (numeric polynomial systems; exact spelling; heavy), `Groebner`
  (exact name `"Groebner"`), `MultivariatePolynomials` (shared interface).

## Cryptography
`Primes`, `SHA`, `Nettle`.

## Symbolic computation: pick by ROLE, not by preference

These three packages are **not substitutes competing for one slot** — they are **three different
categories** of tool, and a real project commonly uses more than one. SymEngine and SymPy are
sister projects (SymEngine is a fast C++ CAS started by SymPy developers and usable as SymPy's
compute backend), so expressions cross between them cheaply; Symbolics is a **different kind of
tool entirely** — a symbolic-numeric *compiler*, not a CAS. Concretely:
**SymPy and Symbolics are mutually non-supersetting** — SymPy has stronger algebra (`integrate`,
`trigsimp`, assumptions) that Symbolics lacks; Symbolics has native codegen / solver / AD
integration that SymPy cannot do. So "use only one" is a category error. Choose by the role the
symbolic layer plays:

| Role in the project | Use | Why |
|---|---|---|
| **Lightweight algebra** — a script snippet *or* the main CAS of a non-SciML project (`expand`, `diff`, `subs`, `coeff`, `lambdify`) | **`SymEngine`** | Precompile **2.79s** (measured 2026-04-25). Fast startup wins when you just need a derivative or a substitution. |
| **Spine of an AI4S / SciML project** (modeling, PDE/DAE, equation discovery, codegen, GPU) | **`Symbolics` + `ModelingToolkit`** | The whole AI4S stack is built on it. Native, NOT deprecated (v7.x, actively developed 2026). |
| **Heavy CAS operations** SymEngine/Symbolics can't do (`integrate`, `dsolve`, `trigsimp`/`radsimp`, `factor`, assumptions, special functions) | **`SymPyPythonCall`**, called **as a service at a thin boundary** | The most complete general CAS practically callable from Julia (strong `simplify`/`integrate`). Never the spine — borrow the operation, don't rebuild on it. |

**Decision rule** — answer one question first: *is this an AI4S / SciML project (you will generate
fast Julia/C code, build an `ODESystem`/PDE, run `structural_simplify`, register symbolic
functions into the AD/solver graph, or discover equations)?*
- **No** → `SymEngine` is the default spine; escalate the occasional hard operation to
  `SymPyPythonCall` at a boundary. **MUST NOT** reach for Symbolics for plain algebra — it pays
  30s–2min precompile for nothing.
- **Yes** → `Symbolics` + `ModelingToolkit` **IS** the spine (this is the explicit "SciML
  integration" case — Symbolics is required, not forbidden). Use its native `simplify`; call
  `SymPyPythonCall` only for the strong-algebra gaps. Keep `SymEngine` for throwaway side
  calculations if startup latency matters.

**Avoiding rework ("二度手間")**: the spine is the only thing expensive to swap, and only if you
thread its concrete type (`Basic` / `Num`) everywhere. **Localize symbolic construction in one
module** that emits `lambdify`/`build_function`-ed plain Julia functions at its boundary; then
SymPy is a *callee*, not a substrate, and the spine never has to be re-typed. Because SymEngine
and SymPy are sister projects, moving an expression between them is a string/parse round-trip at
that boundary, not a hand rewrite.

**Hot symbolic-regression search loops** are the exception inside an AI4S project: use
`SymbolicRegression.jl` / `DynamicExpressions.jl` own expression type in the inner loop (Symbolics
in the search loop is orders of magnitude too slow); convert to `Symbolics` only at the end via
`node_to_symbolic`.

---

### Per-tool handling

1. **`SymEngine` — the lightweight default for algebraic manipulation**: `expand`,
   `subs`, `diff`, `coeff`, numerator/denominator extraction, symbolic linear algebra, and
   `lambdify`. C++ libsymengine wrapper distributed as a pre-built JLL; Julia-side precompile is
   seconds (**measured 2.79s on 2026-04-25**). The Julia package wraps only what SymEngine
   exposes through its C wrapper, so it has **no general `simplify`** — of the simplification
   family only `expand`/`cse` are wrapped — and **no `solve`/`integrate`/`dsolve`/`trigsimp`/
   assumptions**. Those require path 3 (SymPyPythonCall), or path 2's native `simplify` inside a
   SciML project. Do not assume SymPy-equivalent support.
   ```julia
   using SymEngine
   @vars x y
   diff(x^2 + 2x*y, x)              # 2*x + 2*y  (SymEngine normal form)
   subs(x^2 + y, x => 2, y => 3)    # 7  (= 2^2 + 3)
   f = lambdify(x^2 + y, [x, y])    # callable; f(1.0, 2.0) → 3.0
   ```
   **Required handling of the `Basic` type** (SymEngine's C++ reference, NOT a Julia `Number`):
   - **MUST** lambdify before mixing `Basic` with numeric or AD code: `diff` symbolically →
     `lambdify` → apply DI's `gradient(..., AutoForwardDiff(), ...)` to the resulting Julia
     function. The autodiff.md §2.7.4 forward-mode rules apply to the lambdified function.
     ```julia
     @vars x y
     expr = x^2 + 2*x*y + y^2
     h = lambdify(expr, [x, y])
     using DifferentiationInterface; import ForwardDiff
     gradient(v -> h(v[1], v[2]), AutoForwardDiff(), [1.0, 2.0])   # [6.0, 6.0]
     ```
     (Type-system note: passing `Basic` directly into a forward-mode backend fails with
     `MethodError` — `Basic` is not `<: Number`. The pipeline is the construction, not a hidden
     hazard.)
   - **MUST** convert `Basic` to a number via `Float64(N(expr))` when extracting a value.
   - **MUST NOT** compare `Basic` by string equality — SymEngine returns its internal normal
     form (`expand((x+y)^3)` → `3*x*y^2 + 3*x^2*y + x^3 + y^3`, not textbook order). **Verify
     symbolic equality by numeric substitution** at a few points with a tolerance.

2. **`Symbolics` + `ModelingToolkit` — the SPINE of any AI4S / SciML project.** This is the
   "explicit SciML integration" case where Symbolics is **required, not forbidden**. It is a
   symbolic-numeric *compiler*, not a CAS: `build_function` emits fast Julia/C/Stan/MATLAB code,
   plus `structural_simplify`, sparse-Jacobian generation, GPU symbolic codegen, `@register_symbolic`,
   and direct ODE/PDE-solver + AD integration — none of which SymPy or SymEngine can do.
   Actively developed (v7.x, 2026); **NOT deprecated.** Has a native (rule-based) `simplify`.
   Pays 30s–2min precompile — amortized once per project, acceptable for a research codebase.
   **MUST NOT** reach for it for plain throwaway algebra in a non-SciML script — that is
   SymEngine's job (path 1). The hot symbolic-regression search loop is the exception: stay in
   `SymbolicRegression.jl`/`DynamicExpressions.jl` and convert via `node_to_symbolic` only at the
   end.

3. **`SymPyPythonCall` — the heavy CAS, called as a SERVICE at a thin boundary; never the spine.**
   Use for what neither SymEngine nor Symbolics does well: `integrate`, `dsolve`, `trigsimp`/
   `radsimp`, `factor`, sympy `assumptions`, specific special functions. SymPy and Symbolics are
   **mutually non-supersetting** — SymPy is the stronger algebraic simplifier, Symbolics the
   stronger code generator — so this is a *complement*, not a replacement. **MUST NOT** make it
   the spine or thread its types through the project; borrow the operation and return to the
   spine. Because SymEngine and SymPy are sister projects, the SymEngine↔SymPy hand-off is a
   string/parse round-trip, not a rewrite.

## Geometry & manifold optimization
- `Manopt` — optimization *on* manifolds (Stiefel, Grassmann, SPD, sphere/ℂP^{d-1}, fixed-rank).
  This is one of Julia's major advantages over Python in constrained numerical optimization — the
  MATLAB/Python ports are strict subsets. Reach for it whenever the feasible set is a manifold
  rather than a box/polytope (e.g. a pricing oracle on ℂP^{d-1}); it composes with DI backends
  for the Riemannian gradient.
- `Manifolds` — the manifold definitions and differential-geometry computations (SO(n), SE(n),
  SPD) that `Manopt` optimizes over.

## Data — persistence, interchange, visualization

`DataFrames`, `CSV`; `CairoMakie` (publication plots, heavy deps).

**Persistence and interchange are DIFFERENT axes — do not answer one with the other's ladder.**
Persistence is "I read this back myself later": Julia types round-trip, and you escalate by *who
reads it back*. Interchange is "another process wrote this, or must read this": no Julia type
survives the wire, so you name the target type at the boundary or you get `Any`. A `.json` sidecar
for a result struct is a lossy JLD2; a `.jld2` handed to a web client is unreadable.

### Persistence — the result comes back to Julia

- **Result persistence → `JLD2`** — the Julia-native `.jld2` save/load format DrWatson's
  `@tagsave` / `wsave` / `produce_or_load` write **by default** (setup.md §3.4). Reach for it
  whenever an experiment must checkpoint or persist a result struct/array — this is the
  serialization anchor the DrWatson lifecycle (JG4) already depends on. Escalate only by
  persistence boundary: `HDF5` when a non-Julia tool must read the arrays, `Arrow` for columnar
  tables shared with Python/R. (DrWatson's older `.bson` default is retired — use `.jld2`.)

### Interchange — a document crosses a process or language boundary

- **JSON → `JSON` (JSON.jl v1). Not `JSON3`.** `[dated:2026-08]` JSON3.jl carries a deprecation
  banner in its own README ("This package has been deprecated. Please migrate to JSON.jl v1") and
  is frozen at 1.14.3. JSON.jl was rewritten on `StructUtils.jl` for v1.0.0 (2025-10-03) and ships
  1.7.x (2026-08). **This row exists because the default answer is inverted**: JSON3 was genuinely
  the modern choice for years, so habit — and any model memory predating late 2025 — still names
  it. Recommending JSON3 for new code is now recommending a deprecated package.
- **The one surviving JSON3 use — struct generation.** Generating Julia struct definitions from
  sample JSON (`JSON3.@generatetypes` / `JSON3.writetypes`) has no v1 equivalent, and the
  migration guide explicitly says to keep JSON3 *for that purpose only*. Use it to EMIT a
  definition you then commit; do not carry JSON3 as a runtime dep to get it.
- **Parse to a TYPE at the boundary: `JSON.parse(s, T)`, not `JSON.parse(s)`.** Untyped
  `JSON.parse` returns `JSON.Object{String,Any}` / `Vector{Any}`, so every value read out of it is
  `Any` — exactly the runtime-typed data performance.md §2.1.3 requires a function barrier for.
  Naming `T` makes the parse itself that barrier, and nothing `Any`-typed reaches the hot path.
  The field macros come from `StructUtils` (a real dep to declare, per this file's header):
  ```julia
  using JSON, StructUtils
  @defaults struct RunCfg
      n::Int
      dt::Float64 = 1e-3        # tolerated missing key, still concrete
  end
  cfg = JSON.parse(read(path, String), RunCfg)   # cfg.dt::Float64 at the boundary
  # straight from a file: JSON.parsefile(path, RunCfg) — same rule, T still named
  ```
- **Do not pre-select JSON3 "for speed."** `[dated:2026-08]` The circulating datum is ONE
  unresolved 2026-05 Discourse report (20k files, ~5s vs ~50s on struct materialization) whose own
  minimal reproduction showed 2.604ms vs 3.499ms (≈1.3×), and which the maintainer answered by
  asking for an issue with data. No diagnosed cause, no fix, no reproduction — it is not evidence.
  If throughput decides the choice, measure it on your data (§2.6). A deprecated dependency is not
  bought with a rumor.
- **Adjacent formats, bounded.** Config → **stdlib `TOML`** (nothing to install; a *package* still
  declares it in `[deps]` + `[compat]` like any stdlib — setup.md §7). YAML → `YAML.jl`.
  `Serde` only when ONE strategy API must span JSON+TOML+XML+YAML+CSV+MsgPack+BSON — it is a
  multi-format choice, never the answer to "which JSON package". `JSONTables` only when the JSON
  *is* a table and the destination is a `DataFrame`.

**v1 migration traps** — each of these renames or fails without a deprecation path:

| Trap | What actually happens |
|---|---|
| `allownan` defaults to **`false`** now (parse and write) | `JSON.json(x)` **throws** where pre-1.0 JSON.jl and `JSON3.write` wrote `NaN`/`±Inf`. One diverged run kills the writer at the end of a long job. Pass `allownan=true` deliberately, or map to `nothing`/`missing` with `omit_null=true`. |
| numbers parse to `Int64`/`BigInt`/`Float64`/**`BigFloat`** (was Int64/Float64 only) | a field you assumed was `Float64` can arrive `BigFloat` and poison inference downstream — another reason to name `T` |
| default dict is `JSON.Object{String,Any}` | drop-in `AbstractDict` with dot-access that **preserves JSON key order**; pass `dicttype=Dict{String,Any}` for objects with hundreds of keys or to restore pre-1.0 behavior |
| `JSON.lazy` is **truly** lazy | `obj.a.b.c` stays a `LazyValue`; `[]` materializes. JSON3 materialized on access, so ported code silently threads a `LazyValue` into numeric paths (§2.1 instability with a new face). |
| `StructTypes.*` → `StructUtils` | no `StructType` declaration needed at all; `defaults`→`@defaults`, `names`→`@tags` field tags, `subtypes`→`JSON.@choosetype` (its `x` is a `LazyValue` — compare via `x.key[]`) |
| `JSON3.write`→`JSON.json`, `JSON3.read`→`JSON.parse`/`JSON.lazy` | also `allow_inf`→`allownan`, `JSON3.pretty(JSON3.write(x))`→`JSON.json(x; pretty=true)`. Grep the old names; nothing warns you. |

Migration guide (re-verify on reforge): https://juliaio.github.io/JSON.jl/stable/migrate/

### Visualization

- **CJK / non-Latin labels → set a CJK-capable theme font, or CairoMakie crashes.** Makie's
  default font (DejaVu / TeX Gyre) has no CJK glyphs, so any 日本語 / 中文 / 한글 in a title or
  label throws during text layout (or renders as tofu boxes). Root-fix with a theme — do **not**
  band-aid by stripping the text to ASCII every time:
  ```julia
  # resolve a CJK-capable OTF by path (Noto Sans CJK JP / HaranoAjiGothic / Hiragino), then:
  set_theme!(fonts = (; regular = font, bold = bold, italic = font, bold_italic = bold))
  ```
  Prefer a *path* to an installed OTF/TTF (most portable; name-resolution via Fontconfig is
  flaky on macOS). Source-Han-based CJK fonts (Noto, HaranoAji) carry full **Latin** too, so one
  font covers both scripts; they have **no italic face** → map `italic→regular`. Put the resolver
  + `set_theme!` in a shared `scripts/plots.jl` preamble `include`d right after `using CairoMakie`
  so every figure inherits it. Keep `CairoMakie` a **script/output dep**, never a `src/` package
  dep — it drags the whole viz stack into every `using YourPkg` and inflates TTFX (see the
  no-unused-deps rule, this file's header).
