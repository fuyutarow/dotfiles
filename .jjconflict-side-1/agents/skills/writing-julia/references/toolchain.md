# Modern Toolchain Map (which tool for which job, 2024–2025) — §2.9

The AD, instability-detection, and benchmarking choices have their own files (autodiff.md §2.7,
performance.md §2.8/§2.6) and are indexed in the §2.9.5 table — not repeated here. This file
documents the modern tools **first introduced here**: small-array, structured-parameter, GPU/NN,
and parallelism choices.

---

## 2.9.1 Small fixed-size arrays — StaticArrays
For vectors/matrices whose size is known and small (≤ ~12), `SVector`/`SMatrix` carry size in
the type, stack-allocate, and unroll linear algebra. This is the right type for a state vector
v ∈ ℂ^d or a 3×3 rotation — not `Vector`/`Matrix`.
```julia
using StaticArrays
v = SVector{4, ComplexF64}(1, 0, 0, 0)   # stack-allocated, zero heap
M = @SMatrix [1.0 0.0; 0.0 1.0]
# Composes with AutoForwardDiff: gradient(g, AutoForwardDiff(), v) stays allocation-free.
```
Caveat: very large `SArray`s explode compile time — the size-in-type advantage inverts past
~100 elements. Use `MArray` for mutable small arrays, plain `Array` for large ones.

## 2.9.2 Structured parameters — ComponentArrays
A `ComponentVector` behaves as a flat numeric vector (so ODE solvers, `Optim`, and DI accept it)
while still allowing named access. This is how you give an optimizer a single `x` that
internally has structure.
```julia
using ComponentArrays
p = ComponentVector(θ = [1.0, 2.0], bias = 0.5)
p.θ          # named view
p[1:2]       # also indexes flat
gradient(loss, AutoForwardDiff(), p)   # returns a ComponentVector — structure preserved

# Immutable nested update — use Accessors.@set (returns a new object, original untouched):
using Accessors
p2 = @set p.bias = 0.9          # p unchanged; p2 has bias 0.9
p3 = @set p.θ[1] = 5.0          # also reaches into nested fields
```

## 2.9.3 NN / compiled array execution

Read `nn-stack.md`: it solely owns model, primitive, AD, device, and eager/XLA selection together.

## 2.9.4 Parallelism — OhMyThreads
For data-parallel maps/reductions on one machine, `OhMyThreads.tmapreduce` / `@tasks` is the safe
modern replacement for hand-written `Threads.@threads` + manual accumulation. **Do not key
buffers on `threadid()`** (unsafe under Julia 1.12's interactive/worker split — see setup.md);
OhMyThreads handles chunking and reduction correctly.
Its task count is not a second budget: for any recordable/orchestrated run, first admit the
aggregate CPU/RAM envelope under sibling `orchestrating-agents` P7, then keep all tasks inside
the runner's affinity and declared process/RSS ceilings. Never combine an auto-sized Julia pool
with agent-level parallelism.
```julia
using OhMyThreads
total = tmapreduce(+, 1:N) do i
    expensive(i)
end
```
For clusters use `Distributed`/`MPI.jl`; for GPU kernels `KernelAbstractions.jl`.

## 2.9.5 Quick selection table

| Job | Modern tool (use this) | Replaces / older |
|---|---|---|
| Differentiate an ordinary host function | `autodiff.md` §2.7 | DI frontend, preparation, and measured backend selection |
| NN model, direct NN primitive, or XLA array execution | `nn-stack.md` | Classify the computation before choosing packages |
| Detect instability (CI) | `JET.@test_opt` | manual `@code_warntype` |
| Forbid instability (def site) | `DispatchDoctor.@stable` | hope |
| Guarantee zero alloc | `AllocCheck.@check_allocs` | eyeballing `@time` |
| Benchmark fast | `Chairmarks.@b` | `@btime` (only for BenchmarkGroup suites) |
| Small fixed vector/matrix | `StaticArrays.SVector` | `Vector`/`Matrix` |
| Structured optimizer param | `ComponentArrays` | flat vector + manual indexing |
| Immutable nested update | `Accessors.@set` | full struct copy |
| Data-parallel reduce | `OhMyThreads.tmapreduce` | `Threads.@threads` + locks |
