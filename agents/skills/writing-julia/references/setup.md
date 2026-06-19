# Environment, Running, Output & Idioms (§3, §5, §6, §7) — portable

Host-agnostic. Paths use a project-local environment (`--project=.`); adapt to your own
project/output layout. None of this assumes a specific host.

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

# ONE driver sweeps MANY runs (never one script per parameter); then collect all runs into one table:
for p in dict_list(Dict(:lr => [1e-2, 1e-3], :seed => 1:5))
    produce_or_load(p, datadir("sims")) do q; run_expensive_simulation(q); end
end
df = collect_results!(datadir("sims"))   # every saved run → one DataFrame for comparison/plots
```

Discipline — the experiment-script **lifecycle** (this is what prevents the #1 research-repo rot:
hundreds of accreted one-off scripts, an ever-growing "canonical" index, results un-retrievable):

- **An experiment is a *run* (parameterized, recorded) — NOT a file.** Never write one script per
  parameter/seed/cell and commit it. Collapse near-duplicates (`foo_d3p5.jl`,`foo_d3p6.jl`,… or
  `foo`,`foo2`,`foo_v3`) into ONE driver parameterized by `dict_list`/`@dict`/`ENV`, then sweep.
  Numbered/suffixed variants are duplication fossils — merge on sight.
- **Four-layer boundary** (DrWatson × RSE canon):
  - `src/` — reusable functions/types, **produces no output**. Promotion rule: *the moment a logic
    is needed by a 2nd script, lift it to `src/` and make both scripts thin callers* (DRY / single
    authoritative representation). `src/` is a proper module/package.
  - `scripts/` — **thin canonical drivers**: declare *which `src` fn × which config → which artifact*.
    Logic does NOT live here. (Earlier guidance "scripts is the disposable driver" was wrong —
    scripts/ is canonical; the disposable layer is `_research/`.)
  - `_research/` — one-off exploration / WIP / alpha. **gitignore it** like `data/` (Wilson 2017
    §3c: don't version what is auto-regenerable). This is the disposable layer, not VC-first-class.
  - `test/` + `docs/` — the **distillation sink** for stable results.
- **Distill, then discard.** When a result stabilizes → (a) a `src/` function, (b) a regression
  `test`, (c) a `docs/` derivation; **then delete the exploration script.** The authoritative record
  is the `@tagsave`d data (git-commit embedded) + the distilled src/test/docs — *not the script body*.
  A "canonical scripts" index that only grows is the failure mode; distillation=deletion is the
  lifecycle's terminal step.
- **`produce_or_load` / `collect_results!` are the default driver form** (not optional): idempotent
  re-runs remove the "keep the script around to re-run it" pressure; one
  `collect_results!(datadir(...))` replaces a pile of `bench_*`/`compare_*` scripts.
- **`@tagsave`** records *which code produced which artifact* — the experiment-layer analogue of
  committing the Manifest. Use it for any result you might cite later.
- **`dict_list`** is for **experimental design** (hyperparameters, physical regimes, seeds) — it is
  **NOT** a license for the FORBIDDEN "grid sampling instead of solving the optimization" of §2.0.2.
  Sweep experiments, not the math you should be optimizing or solving exactly.

RSE grounding (this lifecycle is the literature consensus, not a style preference): DRY / single
authoritative representation — Wilson 2014, *Best Practices for Scientific Computing*
(10.1371/journal.pbio.1001745); `results/` are disposable / version only hand-made artifacts —
Wilson 2017, *Good Enough Practices* (10.1371/journal.pcbi.1005510); track the provenance of every
result (mechanized by `@tagsave`) — Sandve 2013, *Ten Simple Rules for Reproducible Computational
Research* (10.1371/journal.pcbi.1003285); reusable logic in a package, analysis only calls it —
Marwick 2018, *research compendium* (10.1080/00031305.2017.1375986); DrWatson — Datseris 2020, JOSS
(10.21105/joss.02673).

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

## 8.1 Notebooks, literate reports & documentation — one first choice each

Three distinct jobs. These are where the DrWatson `notebooks/` / `papers/` / `docs/` folders
(§3.4) get filled, and they are how a research project keeps **"which formula / which
generalization is the current theory"** from going missing: the artifacts are Git-tracked text, so
the evolution of the theory reads as a history rather than a pile of overwritten files.

| Job | First choice | Avoid / legacy |
|---|---|---|
| Interactive / exploratory research notebook | **`Pluto.jl`** (`.jl`) | Jupyter `.ipynb` for anything version-controlled |
| Literate publication report (HTML/PDF) | **`Quarto`** | `Weave.jl` (older, less maintained) |
| Package API documentation site | **`Documenter.jl`** | hand-written HTML |

- **`Pluto.jl` is the first choice for research notebooks.** Files are plain-text `.jl`
  (Git-diffable line by line); the notebook is **reactive** — changing a cell re-runs its
  dependents, so there is **no hidden out-of-order execution state** (the classic Jupyter
  reproducibility trap); and the environment (`Project.toml` + `Manifest.toml`) is **embedded in
  the file**, so it reproduces its exact deps. Honest caveat: a Pluto `.jl` is a valid script but
  carries Pluto cell markers + the embedded Manifest — diffable and reproducible, **not** a "clean"
  hand-written script.
- **Avoid `.ipynb` under version control.** It is JSON with execution outputs baked in: diffs are
  unreadable, merge conflicts corrupt the file, and saved cells hide stale execution order. Use it
  only when an external deliverable (shared Jupyter/Colab) forces it.
- **`Quarto`** for the "one step before the paper" literate report: `.qmd` → high-quality HTML/PDF
  with LaTeX math beside live results. The modern successor to `Weave.jl`.
- **`Documenter.jl`** builds the documentation site from docstrings; pair it with the `docs/`
  folder DrWatson scaffolds.

The practical answer to *"which formula is current?"*: current logic lives in `src/` (architecture.md
§10), its **evolution** lives as Git-tracked Pluto/Quarto notebooks in `notebooks/`, and every
saved result is bound to its code version via DrWatson `@tagsave` (§3.4). No artifact is orphaned
from the theory state that produced it.
