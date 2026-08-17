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

## 2.9.3 NN / GPU / TPU compilation — Lux + Reactant
When the task is neural-network training or array code that must hit GPU/TPU at JAX/PyTorch-class
speed, compile through `Reactant.jl`: it traces Julia code into MLIR, runs XLA optimizations, and
uses EnzymeMLIR for AD. Crucially, **the compiled function assumes the same control-flow pattern
as the traced example** — type instabilities and branches are fixed at trace time, not resolved
generally. Do not treat tracing as a cure for arbitrary dynamic dispatch or data-dependent
branching; if the control flow depends on runtime data, the traced path may be wrong for other
inputs. This is a different execution model from autodiff.md §2.7 (tracing, not
per-call dispatch) — reach for it only when XLA/TPU or large-scale NN throughput is the actual
requirement, not for a one-off gradient.

**`Lux.jl` is the default NN library for new work, and it does NOT require Reactant** `[dated:2026-08]`.
Verified in Lux v1.31.4's `Project.toml`: `Reactant`, `Enzyme` and `Zygote` are all `[weakdeps]`
wired through extensions (`ReactantExt` needs Reactant *and* Enzyme) — none is in `[deps]`. So
"install Lux" and "take on the XLA toolchain" are separate decisions, and the older framing of Lux
as Reactant's companion mis-routed every plain CPU NN job to Flux. Prefer Lux because parameters
and state live OUTSIDE the model (`model(x, ps, st)`, pure layers), which is also what makes a
parameter count or an operation-count audit tractable. `Flux.jl` is **not** deprecated
`[dated:2026-08]` — it ships near-weekly and grew its own Reactant/Enzyme compilation path in 2026
— but DiffEqFlux.jl (SciML) documents a `Flux.destructure` correctness bug that silently downgrades
`Float64` parameters to `Float32` and recommends Lux, with an opt-in `FromFluxAdaptor()` for
existing models. Keep Flux for existing Flux code; do not start there.

**AD inside a Lux model ranks DIFFERENTLY from AD over a plain function — this reversal is the
rule, not a nuance.** autodiff.md §2.7.3 governs ordinary host-side functions, where Enzyme beats
Zygote. Inside a Lux training loop without Reactant, Lux's own AD manual ranks Zygote ABOVE
standalone Enzyme, because standalone Enzyme may fail against Lux when Reactant is absent. Lux's
published order `[dated:2026-08]`, CPU: (1) Reactant+Enzyme, (2) Zygote — best without Reactant,
(3) Enzyme — only if the code mutates or Zygote fails, (4) ReverseDiff. Its tier table puts
Reactant+Enzyme, ChainRules, Enzyme, Zygote and ForwardDiff ALL at Tier I: there is no first/second
class among them, so do not argue for a backend by claiming a higher tier.

**Escalation rule, runtime-answerable.** Does this model need GPU/TPU throughput at
JAX/PyTorch-class speed, or does it mutate in a way Zygote cannot differentiate? Neither → plain
Zygote-backed Lux, no Reactant. Either → `Reactant` + `Enzyme`, and re-read the control-flow caveat
above before trusting a traced function. Mooncake is NOT a house option yet: Tier III in Lux's
table with GPU ❌ — and that row was last touched 2025-12, so re-verify it rather than cite it if
someone proposes Mooncake.

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
| Differentiate anything | `DifferentiationInterface` + `ADTypes` | raw ForwardDiff/Zygote calls |
| Fast reverse-mode AD | `AutoEnzyme()` | Zygote (slower; weak on mutation — autodiff.md §2.7.3) |
| NN / array code on GPU/TPU via XLA | `Reactant` + `Lux` | `Flux`+`CUDA.jl` for that NN job — NOT a general `CUDA.jl` replacement (Reactant is XLA tracing; direct GPU-array/kernel work still uses `CUDA.jl` / `Metal.jl` / `KernelAbstractions`) |
| Detect instability (CI) | `JET.@test_opt` | manual `@code_warntype` |
| Forbid instability (def site) | `DispatchDoctor.@stable` | hope |
| Guarantee zero alloc | `AllocCheck.@check_allocs` | eyeballing `@time` |
| Benchmark fast | `Chairmarks.@b` | `@btime` (only for BenchmarkGroup suites) |
| Small fixed vector/matrix | `StaticArrays.SVector` | `Vector`/`Matrix` |
| Structured optimizer param | `ComponentArrays` | flat vector + manual indexing |
| Immutable nested update | `Accessors.@set` | full struct copy |
| Data-parallel reduce | `OhMyThreads.tmapreduce` | `Threads.@threads` + locks |
