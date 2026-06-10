# §10 Large-Package Architecture — file/module organization at scale

How to structure a **large** Julia package so it stays fast (TTFX, dispatch) and does not turn
into spaghetti. This is the community/SciML consensus, not personal taste. Sources: Julia manual
*Modules* & *Style Guide*, SciMLStyle, Pkg.jl *Creating Packages*, PrecompileTools.jl.

---

## §10.0 Mental model: `include` is a textual splice — safety comes from types, not files

`include("f.jl")` **pastes the file's text** into the current module. Files are **not** namespaces;
everything `include`d lands in **one** module's namespace. This looks primitive next to Rust's
`mod`/`crate` walls, but it is **deliberate, not weak**: a single namespace is what lets methods
of the same generic function — defined in different files — **compose into one multiple-dispatch
table**. Per-file walls would break that composition.

Spaghetti is prevented by **four invariants**, not by file boundaries (§10.6):
1. **Types + dispatch** organize behavior (the "noun/verb" split, §10.1).
2. **Functions are the real scopes** — locals never leak across files.
3. **No loose globals** — only `const` (UPPER_CASE).
4. **No type piracy** — own the function OR the type.

If you write Julia expecting *files* to isolate you (Python/Rust habit), you WILL collide names
and get hurt. Isolate with the four invariants instead. **Do not reflexively reach for submodules
to recover file-level walls** — that fights the language (§10.3).

## §10.1 One top-level module; split files by ROLE; all `include`s in the boss file

- **One top-level `module` per package.** Submodules are an **anti-pattern** unless you have a
  genuine, unavoidable name collision (§10.3). "Many submodules" is a signal the code should be
  **several packages**, not nested modules.
- **Split files by role — nouns then verbs:**
  - `types.jl` / `interfaces.jl` — abstract types, structs. **No logic.**
  - `*.jl` method/function files — behavior over those types.
- **Subfiles contain NO `module` and NO `include`.** They are raw code spliced into the parent.
- **Every `include` lives in the boss file (`MyPkg.jl`), in dependency order:** abstract
  interfaces → concrete types → functions. A subfile that `include`s another causes
  **double-definition** when both are pulled in. One place, one order.

```julia
module MyPkg
using LinearAlgebra: norm          # explicit imports (SciMLStyle), not bare `using`

include("interfaces.jl")           # 1. abstract types — the shared vocabulary
include("types.jl")                # 2. concrete structs
include("solvers.jl")              # 3. behavior (may freely use the types above)
include("plots.jl")

export Solver, solve               # public API (§10.5)
end
```

## §10.2 Circular type dependency → hoist abstract types to an interface file loaded first

`include` is linear, so "A needs B's type and B needs A's type" cannot be solved by reordering.
Fix it the way the community does: **declare the shared abstract types first**, in a file loaded
before both, and have each concrete file dispatch on the abstract supertype.

```julia
# interfaces.jl — loaded FIRST; names only, no bodies
abstract type AbstractPlayer end
abstract type AbstractEnemy  end
# player.jl and enemy.jl now each see both abstract names → no cycle
```

This is the single-namespace analogue of forward declarations: an abstract layer is the
"common language" that removes the cycle without module walls.

## §10.3 Scale-out ladder: file → **subpackage / interface package**, NOT submodule

The defining lesson of LARGE Julia packages: **when one module gets too big, split into PACKAGES,
not submodules.**

> SciMLStyle: *"When in doubt, a submodule should become a subpackage or separate package."*

| Growth stage | Right tool | Why |
|---|---|---|
| File too long | another `include`d file (§10.1) | free; no namespace cost |
| Component is independently testable / reusable | **separate package** (or registered subpackage in a monorepo) | real isolation + own tests/docs/CI |
| Need a name wall (true collision only) | submodule `module … end` + `using .Sub` | last resort; costs dispatch composition |

- **Interface packages are the backbone of large ecosystems.** Factor the shared abstract API into
  a lightweight package that everything depends on — the pattern behind `SciMLBase`,
  `ArrayInterface`, `ChainRulesCore`, `RecipesBase`. Core + plugins all depend on the interface
  package, so they compose **without** a monolith and **without** depending on each other.
- **Monorepo with registered subpackages is fine and preferred over Requires.jl.** `ArrayInterface`
  removed all `Requires.jl` usage (compile-time cost) in favor of subpackages registered in the
  General registry.

## §10.4 Optional / heavy dependencies → package extensions (`[weakdeps]`), NOT `Requires.jl`

Julia ≥1.9. If functionality is needed only by *some* users (a plotting recipe, a GPU backend, a
SymPy bridge), **do not make it a hard dep** — every user would pay its load time. Use a **package
extension**: conditional code that loads automatically only when the user has loaded *both* your
package and the trigger package.

```toml
# Project.toml
[weakdeps]
Plots = "91a5bcdd-..."

[extensions]
MyPkgPlotsExt = "Plots"            # ext/MyPkgPlotsExt.jl is loaded when Plots is present
```

- Extension code goes in `ext/MyPkgPlotsExt.jl`. It is **precompiled** like normal code (unlike
  `Requires.jl`, which `eval`s at runtime, kills precompilation, and bloats invalidations).
- Declarative — all in `Project.toml`/`Manifest.toml`, version-bounded via `[compat]`.
- SciML rule: **subpackaging and extensions are preferred over `Requires.jl`** purely for compile
  time. Reach for `Requires.jl` only to back-support Julia <1.9.

## §10.5 Public API surface — `export`, `public`, `@reexport`

- `export name` — adds `name` to the caller's namespace on `using MyPkg`, AND marks it public.
- `public name` (Julia ≥1.11) — marks `name` as public API **without** dumping it into the
  caller's namespace. Use for API you want documented/stable but accessed as `MyPkg.name`.
- `@reexport using .Interface` (Reexport.jl) — re-surface an interface/sub package's API through
  the umbrella package so users get one import.
- **Document interfaces, not fields/methods one by one** (SciMLStyle). Provide a "90% use case"
  tutorial separate from advanced docs.

## §10.6 Anti-spaghetti invariants (enforce these, not file walls)

- **No non-const globals.** Module-level mutable state is the classic single-namespace bug. Only
  `const UPPER_CASE`. Need mutability → put it in a `const` mutable container, or pass state
  through function arguments. All real work lives **inside functions** → function-local scope is
  the true isolation boundary.
- **No type piracy.** *Do not add methods to a function you don't own on types you don't own.*
  Either the function or (at least one) argument type must be yours. This rule is **exactly what
  makes a single shared namespace safe** — it guarantees your `include`s can never silently
  redefine someone else's behavior. (See performance.md / JET for detection.)
- **Annotate as generally as correct** — `AbstractArray`, not `Array{Int}` (idiom in setup.md §6).
- **Small, single-purpose functions.** Dispatch + short functions replace file-walls as the unit
  of organization; the compiler inlines aggressively, so granularity is free at runtime.
- **Keep it type-stable at scale** — wrap must-be-fast APIs with DispatchDoctor `@stable`; run JET
  `report_package` on the whole package (performance.md §2.8). Instability compounds in big trees.

## §10.7 TTFX & invalidation hygiene at scale

Cross-ref setup.md §3.5 (the layered TTFX map). For a **large** package specifically:
- Ship a `PrecompileTools.@compile_workload` covering the representative hot path so users inherit
  native code from the package image (setup.md §3.5 Layer 1).
- **Fix invalidations rather than masking them.** Diagnose with
  `SnoopCompileCore.@snoop_invalidations`; prefer fixing the offending type-unstable / pirated
  method over reflexive `@recompile_invalidations`. Invalidations in a foundational package cascade
  through every downstream dependent — this is why interface packages (§10.3) must be especially
  clean.
- Every hard dep you add is paid by every user at load time — this is the load-time argument for
  §10.3 (split) and §10.4 (extensions).

## §10.8 Scaffolding & tests

- **Scaffold with `PkgTemplates.jl`** — generates `Project.toml`, `src/MyPkg.jl`, `test/`, CI,
  docs, license in the standard layout. Don't hand-roll the skeleton.
- **Tests isolated per item:** `@safetestset` (or TestItems `@testitem`, setup.md §8) so no
  variable leaks between test scripts; group by category; use a `GROUP` env var to shard CI.
- Version-bound **all** deps in `[compat]`; lower bound = last tested version; CompatHelper +
  downstream tests guard the public API.

## §10.9 Quick decision table

| Situation | Do |
|---|---|
| File too long | split into another `include`d role-file; `include` only in the boss file |
| A needs B's type and vice-versa | hoist shared abstract types to `interfaces.jl`, load first |
| Component independently testable/reusable | make it a **separate/sub package**, not a submodule |
| Shared abstract API across packages | extract an **interface package** (SciMLBase-style) |
| Optional / heavy dependency | **package extension** via `[weakdeps]` (not `Requires.jl`) |
| Need a true name wall | submodule — **last resort only** (costs dispatch composition) |
| Want stable API without namespace dump | `public` (≥1.11); else `export` |
| Slow first call in a big package | `@compile_workload` + fix invalidations (§10.7) |
| Tempted to use a non-const global | put it in a function arg or a `const` container |
| Tempted to extend others' funcs on others' types | **stop — type piracy**; own one side |
