# Hot-Path Performance & Static Verification (§2.1–§2.6, §2.8)

Julia's speed comes from type specialization; these rules matter most for functions
called repeatedly or on large data. A one-off computation can ignore pre-allocation;
a tight numeric loop cannot.

Contents:
- §2.1 Type stability (multiple vs dynamic dispatch · instability sources · function barrier · `Val`)
- §2.2 No globals in hot paths (`const` globals, `let` for captured fresh bindings)
- §2.3 Pre-allocate outputs
- §2.4 Broadcasting (dot syntax)
- §2.5 Memory-order loops · `@inbounds` / `@simd`
- §2.6 Benchmarking
- §2.8 Static verification (JET / DispatchDoctor / AllocCheck)

---

## 2.1 Type Stability — the load-bearing discipline

**Type stability** = the return type (and every local's type) is predictable from the argument
TYPES alone, never from their values. It is the single property Julia's speed rests on:
inferable types → dispatch resolved at compile time → devirtualized, inlined, SIMD-able native
code. When inference loses a concrete type, values get boxed and every subsequent call becomes a
runtime method lookup on the boxed value — the 10–100× slowdowns, the GC pressure, and (at a
compile boundary) `juliac --trim` verifier errors (setup.md §3.5.1) all trace back to this one
property.

### 2.1.1 Multiple dispatch ≠ dynamic dispatch — never "ban dispatch"

The two are routinely conflated, and the conflation produces a wrong coding rule ("avoid
dispatch"). Keep them apart:

| | What it is | Cost | Verdict |
|---|---|---|---|
| **Multiple dispatch** | method selection on the types of ALL arguments (abstract or concrete) — the paradigm | **zero** when the call-site arg types are inferable: resolved statically at compile time | use freely; it is why Julia composes |
| **Dynamic dispatch** | *runtime* method lookup, emitted only where inference lost the concrete type | real: lookup + boxing on every affected call | eliminate from hot paths; localize elsewhere (§2.1.3) |

`f(x::AbstractArray)` called with a `Vector{Float64}` the compiler can see is **static** — full
speed. The bug is never "used multiple dispatch"; it is "let the concrete type become unknowable
mid-hot-path". The inverse rule ("no dynamic dispatch anywhere") is equally wrong: top-level
script code, config parsing, and once-per-run setup dispatch dynamically at zero relevant cost.
The discipline is SCOPED to three places: **hot loops, AD paths, and compile/`@ccallable`
boundaries** (setup.md §3.5.1 — only the last is where trim makes it a hard error).

### 2.1.2 The instability sources — each with its fix

**(a) Value-dependent return type** — return `zero(x)`, not a literal of another type:

```julia
# BAD: returns Int or Float64 depending on the VALUE of x
bad(x)  = x > 0 ? x : 0.0
# GOOD: consistent type for given argument types
good(x) = x > 0 ? x : zero(x)
```

**(b) Non-concrete struct fields** — after untyped containers, the most common LLM-authored
instability. An abstract or missing field annotation makes every access *of that field* return
an unknown type, and the instability spreads into each function that touches it. Unlike
§2.1.1's scoping, this rule is UNCONDITIONAL: a struct definition doesn't know its future call
sites, and the parametric form costs nothing — so parametrize even "cold" structs:

```julia
# BAD: every field access is type-unstable
struct Model
    data::AbstractMatrix    # abstract annotation
    coeffs::Vector          # missing eltype ⇒ Vector{T} where T
    tol                     # no annotation ⇒ Any
end

# GOOD: parametrize — concrete per instance, still fully generic
struct Model{M<:AbstractMatrix,T<:Real}
    data::M
    coeffs::Vector{T}
    tol::T
end
```

Same rule for containers: `Vector{Real}` is a container of boxes (abstract eltype); a generic
container is `Vector{T}` with `T` concrete per instance, built via `similar`/`zero(A)` (§2.3).

**Struct mutability rule.** Default to immutable `struct` with typed/parametric fields. Reach for
`mutable struct` only when object identity or long-lived state mutation is part of the model
(solver state, cache, handle, actor, UI state). If only one or two invariants must not change
inside an otherwise mutable object, mark those fields `const` (Julia 1.8+) instead of making the
whole object immutable by contortion. Do not make a `mutable struct` merely because a variable
bound to the object will be reassigned; rebinding the name is not mutating the object.

**(c) Untyped containers & non-const globals** — SKILL.md §1.2 and §2.2; same mechanism, `Any`
enters the loop.

**(d) NOT a source — small unions.** `Union{Int,Nothing}` (e.g. a `findfirst` result) is
handled by union-splitting (a cheap, well-predicted branch; applies up to ~4 targets); don't
contort code to avoid `nothing`. Only wide/`Any` unions are instability.

### 2.1.3 Function barrier — localize unavoidable dynamism, don't forbid it

When types genuinely exist only at runtime (file contents, config, heterogeneous columns), the
idiom is the **function barrier**: do the dynamic work in an outer shell, then call an inner
kernel — that call is ONE dynamic dispatch, and from the kernel's signature down everything is
concrete and static again:

```julia
# outer shell — dynamic, cold: types known only at runtime
function run(cfg_path)
    cfg  = parse_config(cfg_path)     # Dict{String,Any} — fine here
    data = load_matrix(cfg)           # concrete type opaque to inference
    return kernel(data, cfg["iters"]) # ← the barrier: dispatch resolves at runtime HERE,
end                                   #    once per call — never per iteration

# inner kernel — from here down, T is concrete: static dispatch throughout
function kernel(A::AbstractMatrix{T}, iters) where {T}
    acc = zero(T)
    for _ in 1:iters
        acc += step(A, acc)
    end
    return acc
end
```

Architecture-level form of the same rule: **dynamic shell outside (I/O, config, parsing),
type-stable compute core inside.** This layering is also what makes the kernel extractable as a
shared library later — but note the barrier itself is then *replaced* by the C boundary, never
compiled inside the artifact (setup.md §3.5.1).

### 2.1.4 `Val` is a type-domain contract, not a speed spell

Use `Val` only when the value is already a compile-time / type-domain fact (a literal at the call
site, a type parameter, a generated small static dimension, a trait tag). It is not a way to turn
runtime config, parsed symbols, or user input into fast code. Wrapping a runtime value in
`Val(mode)` usually just moves the instability into the type domain and can explode method
specializations.

```julia
# BAD: runtime Symbol from config/user input; Val does not make it statically known
function energy(mode::Symbol, x)
    return energy(Val(mode), x)
end
energy(::Val{:kinetic}, x) = 0.5 * x^2
energy(::Val{:potential}, x) = 9.8 * x

# GOOD: keep runtime choice in the cold shell, then barrier into a concrete function
kinetic(x) = 0.5 * x^2
potential(x) = 9.8 * x

function run_energy(mode::Symbol, x)
    f = mode === :kinetic ? kinetic : potential   # cold config decision
    return kernel_energy(f, x)                    # one barrier call
end

kernel_energy(f::F, x) where {F} = f(x)
```

Good `Val` use looks like `ntuple(f, Val(N)) where {N}` or dispatch on a trait value that came
from a type (`addability(::Type{T})`, architecture.md §10.2.1). If the value came from TOML/JSON,
CLI args, a DataFrame column, or a random branch, keep it outside the hot loop or use an explicit
function barrier.

### 2.1.5 Detection

Escalating in power:
- `@code_warntype f(args...)` — quick, shows `Any`/`Union` in red, but only the outermost frame.
- `JET.@report_opt f(args...)` / `@test_opt` — descends the whole call tree and flags every
  "runtime dispatch" site; use in test suites (§2.8).
- `Cthulhu.@descend f(args...)` — interactive, follows inference into callees (local dev — see setup.md).

## 2.2 No Globals in Hot Paths

Never reference module-level mutable variables from inner loops. Pass everything as
function arguments. If a global is truly needed, annotate with `const`:

```julia
const SIGMA = 10.0   # const → type-stable
const RHO = 28.0
const BETA = 8.0 / 3.0
```

`const` is for globals and for `const` fields inside `mutable struct`; it is not a local variable
declaration. Inside functions, assign locals normally (`x = ...`) or write `local x` only when
you intentionally shadow an outer local.

`let` is also not ordinary declaration syntax. It creates a hard local scope and fresh bindings.
Use it at top level to turn a procedural scratch block into local code, or in closures when a hot
captured value must stop being boxed:

```julia
function scale_by(r::T) where {T}
    return let r = r
        x -> x * r
    end
end
```

In ordinary performance-sensitive code, prefer a named function with explicit arguments over a
capturing closure. If you do keep the closure and it is hot, verify with `@code_warntype` / JET.

## 2.3 Pre-allocate Outputs

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

For the specific case of small fixed-size vectors/matrices (e.g. v ∈ ℂ^d with d ≤ ~12),
do not pre-allocate at all — use `StaticArrays` (toolchain.md §2.9.1), which stack-allocates
and eliminates the bookkeeping entirely.

When you do allocate a working array inside a generic function, build it with `similar(A)` /
`zero(A)`, never `Array{Float64}(undef, size(A))`. `similar` inherits the input's element type
*and* its array type, so the same code stays correct when `A` is a `CuArray` (stays on GPU),
an `SArray`, or a `Dual`-element array under AD. Hard-coding `Array{Float64}` silently forces a
CPU `Float64` allocation and breaks all three. This is the SciML genericity rule: write to the
input's type, not to a concrete one.

## 2.4 Use Broadcasting (dot syntax)

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

## 2.5 Use memory-order loops, @inbounds, and @simd for tight numeric loops

Julia dense `Array`s are column-major. For explicit nested loops over `A[i, j]`, the first index
varies fastest, so put `i` in the innermost loop:

```julia
# BAD for dense Array: jumps by columns in memory
for i in axes(A, 1), j in axes(A, 2)
    A[i, j] = i + j
end

# GOOD: contiguous access for Array
for j in axes(A, 2), i in axes(A, 1)
    A[i, j] = i + j
end
```

When element order does not matter, prefer `eachindex(A)`; it follows the array's efficient
indexing style and avoids hard-coding `1:length(A)`.

`@inbounds` disables bounds checking — only use when you have verified that all indices are
in range. `@simd` requires loop iterations to be independent.

```julia
function dot_product(a, b)
    s = 0.0
    @inbounds @simd for i in eachindex(a)
        s += a[i] * b[i]
    end
    s
end
```

## 2.6 Benchmarking

Always warm up before timing — never trust the first call (it includes compilation).

**Default: `Chairmarks.@b`.** Comparable precision to BenchmarkTools in ordinary use, can run
far faster, and has a `setup → body` form that keeps allocation out of the measurement.

```julia
using Chairmarks
@b f($args...)        # minimum time; $ interpolates so globals aren't measured
@be f($args...)       # full statistics when you need the distribution
@b rand(1000) sum     # 2-arg form: setup → body, `_` is the piped input
```

**Use `BenchmarkTools.@btime` only when** the task explicitly needs a `BenchmarkGroup`
(a structured suite of named benchmarks) or its tuning/parameters machinery — typically a CI
performance-regression suite, not interactive work.

```julia
using BenchmarkTools
@btime f($args...)    # only inside a BenchmarkGroup suite, per the condition above
```

Whichever runs: warm up, interpolate args with `$`, never time a bare global.

## 2.8 Static Verification (use before claiming code is correct)

Type stability and allocation discipline are **mechanically verifiable**. Don't rely on
inspection — run the checkers.

### JET.jl — static type-error and dispatch detection
```julia
using JET
@report_call f(x_typical)   # MethodError paths for a single call
@report_opt  f(x_typical)   # optimization-level: catches dynamic dispatch / Any
report_package(MyModule)    # whole-package scan
# In a test suite, assert it:
@test_opt f(x_typical)      # fails the test on any inferred instability
@test_call f(x_typical)
```
**Workflow**: after `Pkg.precompile()`, run `report_package` once. Treat new JET reports as
test failures, not warnings.

### DispatchDoctor.jl — turn instability into an error at the definition site
```julia
using DispatchDoctor
@stable function hot(x::AbstractVector)
    # if this body is type-unstable, calling it throws — caught immediately in CI
    return x[1] + x[2]
end
# @stable can wrap a whole module: @stable default_mode="error" module M ... end
```
Use `@stable` on the functions that *must* stay fast; it is the proactive complement to JET's
after-the-fact scan.

### AllocCheck.jl — zero-allocation guarantee on hot kernels
```julia
using AllocCheck
@check_allocs function hot_kernel!(out, in)
    @inbounds for i in eachindex(out)
        out[i] = sin(in[i]) + 0.5
    end
end
# Errors at compile time if the function can hit the GC heap.
```
Apply to inner loops you've already pre-allocated (§2.3): Monte Carlo / SDE steps, per-iteration
optimizer callbacks, JuMP custom-operator kernels. Not for setup code that legitimately allocates.

### Quick verification recipe
```bash
julia --project=. -e '
  using JET, AllocCheck, MyModule
  display(report_package(MyModule))
  @check_allocs MyModule.hot_kernel!(out, in)
'
```
These catch in seconds what `@code_warntype` inspection would miss in hours.
