# Automatic Differentiation — DifferentiationInterface is the frontend (§2.7)

**The default way to differentiate is through `DifferentiationInterface.jl` (DI), selecting a
backend via an `ADTypes.jl` object.** Do not scatter raw `ForwardDiff.gradient` /
`Zygote.gradient` / `Enzyme.autodiff` calls through research code. DI gives one call site,
swappable backends, and a `prepare_*` mechanism that amortizes one-time work across repeated
differentiation — which is exactly the situation in many optimizer inner loops and pricing oracles.

Contents:
- §2.7.1 The single pattern
- §2.7.2 Preparation (mandatory for repeated differentiation)
- §2.7.3 Backend selection
- §2.7.4 AutoForwardDiff hazard: Dual propagation rules (STILL CRITICAL)

---

## 2.7.1 The single pattern

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

## 2.7.2 Preparation — mandatory for repeated differentiation

When the same function is differentiated many times (gradient descent, column generation,
pricing oracle, MCMC), **prepare once, reuse**. This is one of the largest DI performance
levers; skipping it can cost an order of magnitude.

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
1. A `prep` is valid only while the function, backend, and the input's **type and size** are
   unchanged. Change any of these (e.g. switch `Float64` → a `Dual`, or resize the input) and
   the `prep` is invalid — re-prepare. Under the default `strict=Val(true)`, DI type-checks
   prep-vs-execution; size-checking is left to you.
2. A `prep` is **not thread-safe**. It is mutated by every operator call (even the non-`!`
   ones). For concurrent differentiation — including inside `OhMyThreads` reductions
   (toolchain.md §2.9.4) — prepare **one separate `prep` per task/worker**. Sharing one `prep`
   across threads is a data race.

The `prep` object is backend-specific: for ForwardDiff it preallocates dual buffers, for
Zygote/Enzyme it stores the reverse-pass configuration, for sparse backends it stores the
coloring. The call site does not change when you swap backends — only the prepared object does.

## 2.7.3 Backend selection

Choose by problem shape, then justify by profiling — never by habit.

| Situation | Backend | Why |
|---|---|---|
| ≤ ~100 inputs; any Hessian | `AutoForwardDiff()` | Forward mode is O(input_dim)·cost(f); cheap for small input, and forward-over-forward gives clean Hessians. **Default.** |
| Scalar output, input_dim ≫ 100 | `AutoEnzyme(mode=Enzyme.Reverse)` | LLVM-IR reverse mode, very fast, supports mutation. Profile ForwardDiff first; switch only when AD is shown to be the bottleneck. |
| Pure-Julia reverse, mutation-light | `AutoZygote()` | Mature source-to-source; slow on mutable code and discrete branches. |
| Hessian-vector products, large input | second-order DI (`AutoForwardDiff` over `AutoEnzyme`) | forward-over-reverse; DI composes these via `SecondOrder(outer, inner)`. |
| Sparse Jacobian/Hessian | any backend + `AutoSparse(backend)` | DI handles sparsity detection (`SparseConnectivityTracer`) and coloring (`SparseMatrixColorings`) for you. |
| NN training / GPU / TPU, need XLA | `Reactant` path (toolchain.md §2.9.3) | compiles to MLIR/XLA; different tradeoffs. |

Caveat carried from experience: routing Enzyme through DI does not yet expose its full
activity/multi-argument machinery. If `AutoEnzyme()` via DI fails or is slow, drop to Enzyme's
native API for that one call and note it in a comment — this is the sanctioned exception to
"DI everywhere".

## 2.7.4 AutoForwardDiff hazard: Dual propagation rules (STILL CRITICAL)

DI abstracts *which* backend runs, not *what the backend does*. Whenever `AutoForwardDiff()`
(or any forward-mode backend) is in the path, ForwardDiff still propagates `Dual` numbers
through your function. A function that hard-codes `Float64` will still break — DI does not save
you. These rules are mandatory for any function that may be differentiated by a forward-mode
backend:

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
*Why it crashes*: `eigvals` dispatches to LAPACK, which only accepts BLAS floats, so a
`Dual`-element matrix hits a `MethodError` (verified on ForwardDiff + Julia 1.12.6). `inv`/`tr`/
`det` are pure-Julia generic and propagate `Dual` fine (verified). This is forward-mode
specific — reverse-mode backends (Zygote/Enzyme via ChainRules) do carry eigen adjoints; if you
genuinely need ∂eigval, differentiate that part with a reverse-mode backend instead of rewriting.

**Rule 4 — Inner functions must be fully type-generic** (same `eltype(x)` discipline all the way down).

**Rule 5 — Separate the AD path from non-AD operations.** Discrete branch selection (`argmax`,
phase-branch choice via `eigvals`) is computed in `Float64` *before* the Dual path; the AD-safe
cost is then evaluated with the branch held fixed.
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

**Rule 6 — Avoid nested same-tag ForwardDiff.** For a cross-derivative ∂²f/∂ψ∂α, use a joint
Hessian and slice the cross-block rather than nesting gradient-in-jacobian:
```julia
z = vcat(ψ, α)
H = hessian(z -> f(z[1:nψ], z[nψ+1:end]), AutoForwardDiff(), z)
A = H[1:nψ, nψ+1:end]   # ∂²f/∂ψ∂α
```
(DI's `SecondOrder` backend is the cleaner route when you control both layers.)

These six rules are the forward-mode physics. Reverse-mode backends (`AutoEnzyme`, `AutoZygote`)
have different hazards — chiefly mutation support and world-age — documented at their own repos;
reach for them only after §2.7.3 says so.
