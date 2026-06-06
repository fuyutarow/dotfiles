# Hot-Path Performance & Static Verification (§2.1–§2.6, §2.8)

Julia's speed comes from type specialization; these rules matter most for functions
called repeatedly or on large data. A one-off computation can ignore pre-allocation;
a tight numeric loop cannot.

Contents:
- §2.1 Type stability
- §2.2 No globals in hot paths
- §2.3 Pre-allocate outputs
- §2.4 Broadcasting (dot syntax)
- §2.5 `@inbounds` / `@simd`
- §2.6 Benchmarking
- §2.8 Static verification (JET / DispatchDoctor / AllocCheck)

---

## 2.1 Type Stability

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
- `Cthulhu.@descend f(args...)` — interactive, follows inference into callees (local dev — see setup.md).

## 2.2 No Globals in Hot Paths

Never reference module-level mutable variables from inner loops. Pass everything as
function arguments. If a global is truly needed, annotate with `const`:

```julia
const SIGMA = 10.0   # const → type-stable
const RHO = 28.0
const BETA = 8.0 / 3.0
```

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

## 2.5 Use @inbounds and @simd for tight numeric loops

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
