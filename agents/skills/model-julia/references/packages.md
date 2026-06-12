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

## Differential equations (heavy)
- `DifferentialEquations` — full ODE/SDE/DDE/DAE suite (100+ solvers).
- `OrdinaryDiffEq` — ODE-only subset, lighter deps.
- `SciMLSensitivity` — adjoint/forward sensitivity; takes an `ADTypes` backend.

## NN / GPU / TPU (toolchain.md §2.9.3, heavy — install only when XLA/TPU or large NN throughput is the requirement)
- `Reactant` — Julia → MLIR → XLA compilation; EnzymeMLIR AD.
- `Lux` — explicit-parameter NN library pairing with Reactant (`Flux` for non-Reactant work).

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

## Data & visualization
`DataFrames`, `CSV`; `CairoMakie` (publication plots, heavy deps).
