# Environment, Running, Output & Idioms (§3, §5, §6, §7) — portable

Host-agnostic. Paths use a project-local environment (`--project=.`); adapt to your own
project/output layout. None of this assumes a specific host.

Contents:
- §3.1 Installing Julia
- §3.2 Project environment & packages
- §3.3 Reproducibility
- §3.4 Experiment management — DrWatson
- §3.5 TTFX (time to first execution) — the layered countermeasure map
- §3.5.1 Shipping a `.so` — PackageCompiler `create_library` vs `juliac --trim`
- §3.6 Julia 1.12 runtime notes
- §5 Running Julia code
- §6 Quick reference: Julia idioms
- §7 Output files
- §8 Related: interactive local development
- §8.1 Notebooks, literate reports & documentation

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
savename("model", params, "jld2")   # "model_act=relu_layer=3_lr=0.001.jld2" — deterministic, sorted

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
  ~1 MB). A *companion* to PackageCompiler, not a replacement. **Not for whole research
  codebases** (trimming requires every reachable call statically resolvable, which exploratory
  code routinely violates) — but an extracted type-stable kernel is exactly what it CAN compile;
  route per §3.5.1.

### 3.5.1 Shipping a `.so` / shared library — two routes

"Can Julia produce a shared library?" — **yes, stably, and it has for years.** Only the *small
trimmed* variant is unstable. Never answer "Julia can't make a .so", and never default to trim.
(Facts verified against PackageCompiler docs / julia release branches `[dated:2026-07]` — the
trim status row below is the fastest-moving fact in this skill; re-verify per the staleness
registry, SKILL.md header.)

| | Route A — PackageCompiler `create_library` | Route B — `juliac --trim` |
|---|---|---|
| Status | production route; docs carry no "experimental" label | **experimental** in BOTH 1.12 and 1.13 (the `julia` binary rejects `--trim` without `--experimental`; JuliaC forwards the flag when needed) |
| Artifact | full bundle: your lib + `libjulia` + stdlibs + `artifacts/` — order 100 MB+ | small executables/libraries (trimmed "hello" ~1 MB) |
| Hard requirement | `@ccallable` C-ABI entry functions; PackageCompiler's app-relocatability rules apply | ALL code reachable from the `entrypoint` statically resolvable — one leftover dynamic dispatch = compile-time **"Verifier error: unresolved call / invoke / ccallable"** (safe mode) |
| Use when | server-side / internal deploy / embedding into a Python wheel — size irrelevant; usable TODAY | size-constrained / edge deploy, and ONLY when kernel + deps are type-stable end-to-end |

**Route A contract**: entry points are `Base.@ccallable` functions with C-ABI types; the bundle
emits `include/julia_init.h` + `lib/` (+ `share/julia`); the caller **must** call
`init_julia(argc, argv)` before any entry point (thread count etc. pass as CLI-style args) and
should call `shutdown_julia(retcode)` at exit. Plan **one Julia runtime per process**:
`jl_init` may only be called once per process lifetime (embedding manual), so never design two
Julia-built libraries into one host process — and two libraries cannot even share a `dest_dir`
(each owns `share/julia`).

**Route B discipline**: the `@ccallable` surface uses concrete C-ABI types (`Ptr{Float64}`,
`Csize_t`, …) and must be dispatch-free; every reachable path obeys type stability
(performance.md §2.1). Note the barrier inversion: a function barrier (§2.1.3) does NOT help
*inside* a trimmed artifact — the barrier's dynamic call is precisely an unresolved site. Put
the dynamic shell in the HOST language (Python/C caller) and compile only the static kernel.
Deps must be type-stable by construction: runtime-typed packages (TOML, CSV, DataFrames)
conflict with trim; type-stable alternatives (TypedTables, StructArrays) work
("This Month in Julia World" newsletter, julialang.org/blog/2026/02/this-month-in-julia-world).

## 3.6 Julia 1.12 runtime notes

- **Threading default changed**: `julia` (no `-t`) starts with 1 worker + 1 interactive thread
  (`-t1,1`). For agent/CI/recordable work, take explicit `N` from the admitted P7 envelope;
  `agent-resource-run` exports `JULIA_NUM_THREADS=N` and CPU affinity. **Never use `-t auto` in
  those runs.** For an unrecorded local interactive run only, use an explicit `-tN`. **Do not key
  buffers on `threadid()`** — the interactive/worker split makes this unsafe (use OhMyThreads,
  toolchain.md §2.9.4).
- **Parallel precompilation is the default**: large dep trees compile in parallel.
- **`@atomic` supports reference assignment**: `@atomic x.field = value` works for atomic struct fields.
- **`OncePerProcess{T}`**: "compute once per process" cache primitive; pairs with `@compile_workload`.
- **`juliac` / `JuliaC.jl` + `--trim` (experimental)**: 1.12's gcc-like AOT driver wrapping the
  `--trim` dead-code-elimination path; emits trimmed executables/libraries/sysimages (companion
  to PackageCompiler). For binary deployment of type-stable kernels only — route per §3.5.1.

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

For parallel computation, create and admit the P7 envelope first. The runner supplies `N` and
affinity; do not add an independent auto-sized pool. Do NOT key buffers on `threadid()`
(toolchain.md §2.9.4 / §3.6):

```bash
agent-resource-run --manifest /absolute/path/job.resource.json -- \
  julia --project=. script.jl
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

# Scope: normal locals need no keyword; let creates a fresh hard-local binding.
# const is for globals or const fields in mutable structs, not local variables.
const MAX_ITERS = 100
let x = 5
    println(x)
end

# Struct: immutable by default; mutable only for identity/state mutation.
struct Point; x::Float64; y::Float64; end
mutable struct State; position::Float64; velocity::Float64; end

# Do-block (anonymous function as first arg) / pipe
map(collection) do x; x^2 + 1; end
[1,2,3] |> sum |> sqrt
```

## 7. Output Files

Write results into your project/output directory. **Pick the tool by data shape — don't hand-roll a
parser:**

- **Simple numeric matrix / homogeneous array** → `DelimitedFiles` (`writedlm` / `readdlm`). The
  zero-extra-dependency choice; fast + low compile-latency on small homogeneous data.
- **Real tabular data** (headers, quoting, embedded delimiters/newlines, `missing`, mixed/typed
  columns, large or multithreaded reads) → `CSV.jl` + `DataFrames.jl` / `Tables.jl` (packages.md §4).
- **Hand-rolled `readlines` + `split` + `tryparse` is an ANTI-PATTERN for real CSV** — it silently
  mishandles quoting/escaping/`missing`/mixed types. Justified only as a niche perf trick for a
  *guaranteed-trivial, fixed* format (lazy/partial reads, minimal allocation), never as the default.
  If you don't want a dependency, `readdlm` already IS the no-extra-dep answer — reach for it, not a
  bespoke parser.

```julia
using DelimitedFiles          # ← must be in [deps] + [compat]; see note
writedlm("results.csv", data, ',')
```

**`DelimitedFiles` is an *upgradeable* stdlib** (since Julia 1.9), and this changes how you depend on
it. It is bundled/pre-installed — so `using DelimitedFiles` works in the *default* env via `@stdlib`
— and there is **no plan to remove or unbundle it** (the roadmap makes *more* stdlibs upgradeable,
not fewer; JuliaLang/julia#50697). BUT because it ships as a versioned *package* (not baked into the
sysimage), any package that `using`s it **must declare it in `[deps]` + `[compat]`** like a normal
dependency: omitting `[deps]` breaks loading, omitting `[compat]` fails registration /
`Aqua.test_deps_compat` and forgoes upgrade protection. This is just the §3.2 / §9 rule ("every
`using` is in `[deps]`, added at point of use") applied to stdlibs — leaning on implicit `@stdlib`
loading in a script works today but is the fragile pattern. So the fix for "DelimitedFiles is a
dependency risk" is **declare it**, not rewrite I/O by hand.

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
- **JETLS** — new compiler-powered language server (needs 1.12+); slated to replace
  LanguageServer.jl as the VS Code default `[dated:2026-07]` (re-check before recommending as
  default); real-time type-error diagnostics while editing.
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
