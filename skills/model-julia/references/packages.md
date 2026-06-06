# Recommended Packages by Research Domain (§4)

Select only what the task needs — don't install everything.

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

## Symbolic computation: the choice is fixed; no branching decision is required

1. **`SymEngine` — MUST be used as the default for algebraic symbolic manipulation**: `expand`,
   `subs`, `diff`, `coeff`, numerator/denominator extraction, symbolic linear algebra, and
   `lambdify`. C++ libsymengine wrapper distributed as a pre-built JLL; Julia-side precompile is
   seconds (**measured 2.79s on 2026-04-25**, vs Symbolics' 30s–2min). **MUST NOT use
   Symbolics.jl as a substitute.** The Julia package wraps only what SymEngine exposes through
   its C wrapper, so **do not assume full SymPy-equivalent support** for general equation
   `solve`, assumptions, `integrate`, or `dsolve` — those require path 2 below.
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

2. **`SymPyPythonCall` — ONLY when SymEngine lacks the feature.** Permitted exclusively for:
   hard `integrate`, `dsolve`, sympy `assumptions`, specific special functions. **MUST NOT
   replace SymEngine as a general CAS.**

3. **`Symbolics` + `ModelingToolkit` — FORBIDDEN unless the task's explicit requirement is SciML
   integration.** Permitted only for ModelingToolkit PDE/DAE modeling, `@register_symbolic`, GPU
   symbolic codegen, or neural-symbolic interop. Pays 30s–2min precompile. **MUST NOT use for
   plain symbolic algebra — that is SymEngine's job.**

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
