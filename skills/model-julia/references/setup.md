# Environment, Running, Output & Idioms (§3, §5, §6, §7) — portable

Host-agnostic. Paths use a project-local environment (`--project=.`); adapt to your own
project/output layout. None of this assumes a specific host or container.

Contents:
- §3.1 Installing Julia
- §3.2 Project environment & packages
- §3.3 Reproducibility
- §3.5 TTFX (time to first execution) — the layered countermeasure map
- §3.6 Julia 1.12 runtime notes
- §5 Running Julia code
- §6 Quick reference: Julia idioms
- §7 Output files
- §8 Related: interactive local development

---

## 3.1 Installing Julia

Use **juliaup**, the official cross-platform version manager — it handles install, multiple
versions, and updates uniformly across macOS / Linux / Windows.

```bash
# macOS / Linux
curl -fsSL https://install.julialang.org | sh      # or: brew install juliaup   (macOS)
# Windows
#   winget install julia -s msstore

juliaup add 1.12.6      # pin a version intentionally; bump deliberately
juliaup default 1.12.6
julia --version
```

If juliaup is unavailable in the environment, download the official binary for your platform
from julialang.org and put `julia` on `PATH`. Pin the patch version so `Manifest.toml`
(reproducibility, §3.3) stays valid.

## 3.2 Project environment & packages

Always work in a dedicated project environment, never the global one. `--project=.` keeps deps
isolated and reproducible.

```bash
mkdir -p myproject && cd myproject
julia --project=. -e '
  import Pkg
  # AD frontend + a backend + verification tooling is the common base:
  Pkg.add(["DifferentiationInterface", "ADTypes", "ForwardDiff",
           "JET", "Chairmarks"])      # adjust per task — see packages.md
  Pkg.precompile()
'
```

Use `--project=@name` instead of `--project=.` for a shared named environment reused across
projects. Heavy packages (HomotopyContinuation, DifferentialEquations, Symbolics, Oscar,
Reactant) take 2–5 minutes (Reactant longer, due to XLA artifacts) on first install +
precompile. This is normal — do not assume the process has hung.

## 3.3 Reproducibility

`Project.toml` / `Manifest.toml` in the project dir capture the exact dep tree. Commit them.
Restore the identical environment anywhere with:

```bash
julia --project=. -e 'import Pkg; Pkg.instantiate(); Pkg.precompile()'
```

For an exact match, the Julia patch version, OS, glibc/libc, and CPU architecture should agree
between machines (`Manifest.toml` records the Julia version it was resolved under).

## 3.4 Experiment management — `DrWatson` (the layer above environment reproducibility)

Reproducibility has **two layers**; §3.3 is only the lower one. For research that runs many
parameterized experiments, **`DrWatson.jl` is the default** for the upper (experiment) layer — do
not hand-roll path strings, ad-hoc filenames, or "did I already run this?" logic.

```
Experiment layer  : DrWatson — savename / produce_or_load / tagsave / datadir   ← this section
Environment layer : Project.toml / Manifest.toml (§3.3)                          ← already covered
```

Core API (the parts that earn their keep):

```julia
using DrWatson
@quickactivate "MyProject"          # activate the project env from anywhere in the tree

params = Dict(:layer => 3, :lr => 1e-3, :act => "relu")
savename("model", params, "bson")   # "model_act=relu_layer=3_lr=0.001.bson" — deterministic, sorted

# Path resolution from the project ROOT regardless of cwd (never build paths by hand):
datadir("sims", savename(params, "jld2"));  srcdir();  scriptsdir();  plotsdir()

# Skip expensive recompute: load if a result for these params exists, else run f and save:
data, file = produce_or_load(params, datadir("sims")) do p
    run_expensive_simulation(p)     # only called on a cache miss
end

# Embed the git commit (+ dirty/patch state) INTO the saved data → trace any result to its code:
@tagsave(datadir("res", savename(params, "jld2")), Dict("result" => out))
```

Discipline:
- **`scripts/` runs experiments; `src/` holds reusable logic** (the experiment-level noun/verb
  split). Make `src/` a proper module/package and have scripts call it — this is where §10
  architecture and DrWatson meet: `src/` is your package, `scripts/` is the disposable driver.
- **`tagsave`/`@tagsave` is the experiment-layer analogue of committing the Manifest** — it records
  *which code* produced *which artifact*. Use it for any result you might cite later.
- **`dict_list(Dict(:lr => [1e-2, 1e-3], :seed => 1:5))`** expands a parameter sweep into Dicts.
  This is for legitimate **experimental design** (hyperparameters, physical regimes) — it is **NOT**
  a license for the FORBIDDEN "grid sampling instead of solving the optimization" of §2.0.2. Sweep
  experiments, not the math you should be optimizing or solving exactly.

## 3.5 TTFX (Time To First eXecution) — the layered countermeasure map

**TTFX** (historically "time to first plot") is the latency before the *first* real result —
the compile-then-run cost paid the first time a code path is hit. It was Julia's signature
weakness; the modern fix is a layered stack. On a **persistent host the depot already persists**,
so Layers 0–1 carry across sessions automatically — the cross-session caching that an ephemeral
filesystem needs is unnecessary here.

| Layer | Mechanism | Caches | When to apply |
|-------|-----------|--------|---------------|
| **0** | Julia ≥1.9 package images (`Pkg.precompile`, §3.3) | **native** code of deps, not just lowered IR | always — the floor everything builds on (free, automatic) |
| **1** | `PrecompileTools.@compile_workload` | native code of **your** hot path | a package you author + call repeatedly |
| **2** | custom sysimage (PackageCompiler) / `juliac` | a frozen image / AOT binary | persistent local dev or a deployment target |

**Layer 0 — package images (automatic, the floor).** Since Julia 1.9, `Pkg.precompile()` writes
*native* code into package images, not just lowered IR. This is why the precompile step in §3.2
is a TTFX lever, not merely a dependency-resolution step. Nothing to do beyond running it; on a
persistent host the result is reused across sessions.

**Layer 1 — `PrecompileTools.jl` (package-author side).** Lets a package run a representative
workload **at precompile time**, so the relevant native code lands in the package image. Apply
when you author a package whose hot path is called across many `julia -e` invocations.

```julia
using PrecompileTools, DifferentiationInterface
import ForwardDiff

@setup_workload begin
    x_small = randn(8)
    backend = AutoForwardDiff()
    @compile_workload begin
        my_cost(x_small)
        prep = prepare_gradient(my_cost, backend, x_small)
        gradient(my_cost, prep, backend, x_small)   # warm the DI+backend path
    end
end
```

When it **doesn't** help: a single long computation in one process — JIT cost is amortized anyway.

**Layer 2 — custom sysimage / AOT binary.** Two distinct tools for a *persistent* host or a
deployment target:
- **PackageCompiler** builds a full (untrimmed) sysimage that freezes everything for sub-second
  startup — the mechanism the VS Code Julia extension auto-generates from `JuliaSysimage.toml`
  (§8). The right tool for local interactive dev when startup latency dominates your loop.
- **`juliac` / `JuliaC.jl`** (Julia ≥1.12, §3.6) is the modern gcc-like driver that wraps the
  experimental `--trim` AOT path to emit small executables/libraries (a trimmed "hello" is
  ~1 MB). A *companion* to PackageCompiler, not a replacement. **Not for research code**:
  trimming requires no dynamic dispatch reachable from entry points, which research code
  routinely violates. Binary deployment only.

## 3.6 Julia 1.12 runtime notes

- **Threading default changed**: `julia` (no `-t`) starts with 1 worker + 1 interactive thread
  (`-t1,1`). **Use `-t auto` for compute-bound work**, or `-tN,1` explicitly. **Do not key
  buffers on `threadid()`** — the interactive/worker split makes this unsafe (use OhMyThreads,
  toolchain.md §2.9.4).
- **Parallel precompilation is the default**: large dep trees compile in parallel.
- **`@atomic` supports reference assignment**: `@atomic x.field = value` works for atomic struct fields.
- **`OncePerProcess{T}`**: "compute once per process" cache primitive; pairs with `@compile_workload`.
- **`juliac` / `JuliaC.jl` + `--trim` (experimental)**: 1.12's gcc-like AOT driver wrapping the
  `--trim` dead-code-elimination path; emits trimmed executables/libraries/sysimages (companion
  to PackageCompiler). For binary deployment only — **not for research code** (see §3.5 Layer 2).

## 5. Running Julia Code

Always use the project environment:

```bash
julia --project=. -e '
  # code here
'
```

For longer scripts, write to a `.jl` file:

```bash
julia --project=. script.jl
```

For parallel computation (compute-bound → populate the worker pool; do NOT key buffers on
`threadid()` — toolchain.md §2.9.4 / §3.6):

```bash
julia -t auto --project=. script.jl
julia -tN,1  --project=. script.jl   # explicit worker count
```

## 6. Quick Reference: Julia Idioms

```julia
# Comprehension
[x^2 for x in 1:10 if isodd(x)]

# Enumerate (i is 1-based) / zip / destructuring
for (i, v) in enumerate(collection); end
for (a, b) in zip(xs, ys); end
a, b, c = (1, 2, 3)

# Multiple dispatch (the core paradigm)
f(x::Int)           = "integer"
f(x::Float64)       = "float"
f(x::AbstractArray) = "array of $(eltype(x))"

# Annotate as generally as possible (SciML style):
splicer(arr::AbstractArray, step::Integer) = arr[begin:step:end]   # not Array{Int}, Int

# Struct (immutable by default) / mutable struct
struct Point; x::Float64; y::Float64; end
mutable struct State; position::Float64; velocity::Float64; end

# Do-block (anonymous function as first arg) / pipe
map(collection) do x; x^2 + 1; end
[1,2,3] |> sum |> sqrt
```

## 7. Output Files

Write results with standard IO into your project/output directory:

```julia
using DelimitedFiles
writedlm("results.csv", data, ',')
```

(If the runtime has its own output/sharing convention — a designated outputs directory, an
artifact upload step — follow that host's convention for the final deliverable.)

## 8. Related: Interactive Local Development

This skill targets **correct, performant batch/script code**. Live REPL iteration is a related
but separate workflow; the tools below shine when a JIT-warm REPL is preserved across edits.

- **Revise.jl + `startup.jl`** — auto-reload edited modules without restarting Julia. Put it in
  `~/.julia/config/startup.jl` so every session loads it automatically:
  ```julia
  # ~/.julia/config/startup.jl
  try
      using Revise
  catch e
      @warn "Revise init failed" exception=e
  end
  ```
  With 1.12 + Revise 3.13+, struct/const redefinition works. Max value when the JIT-warm REPL is
  preserved across edits — irrelevant to one-shot `julia -e` processes (nothing to keep warm).
- **TestItems.jl / ReTestItems.jl** — modern test discovery integrated with the VS Code Julia
  extension (`@testitem` blocks).
- **JETLS** — new compiler-powered language server (needs 1.12+); will replace LanguageServer.jl
  as the VS Code default; real-time type-error diagnostics while editing.
- **Cthulhu.jl** — interactive descend into inferred IR; use when `@code_warntype` is too
  shallow (performance.md §2.1).
- **Debugger.jl / Infiltrator.jl** — interactive REPL debugging.
