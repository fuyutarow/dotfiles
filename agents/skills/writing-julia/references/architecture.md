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

## §10.2.1 Behavior cuts ACROSS the type hierarchy → Holy trait, not a forced supertype

Julia has **single inheritance**: a type has exactly one abstract supertype chain. So an
**orthogonal** capability — one that classifies types the hierarchy doesn't ("is this iterable /
sized / GPU-resident / addable?"), or that must classify types you **don't own** — cannot be
expressed by adding a supertype. The idiomatic fix is the **Holy trait** (Tim Holy Trait Trick,
THTT): encode the capability as a *value* returned by a small function, then dispatch on that
value. This is still the standard pattern `[dated:2026-07]` — Julia has **no native traits** and
Julia 2.0 / a built-in trait system is **not on the roadmap** (core devs judge multiple-inheritance
traits × multiple dispatch to risk an ambiguity explosion). Load-bearing for a design → re-verify
via the staleness registry (SKILL.md header).

```julia
# the trait: a tiny closed value hierarchy (the "noun")
abstract type Addability end
struct IsAddable  <: Addability end
struct NotAddable <: Addability end

# classify types — defined AFTER the types exist, for types in ANY package
addability(::Type) = NotAddable()          # safe default
addability(::Type{<:Number}) = IsAddable()

# dispatch through the trait (the "verb"): entry point peels the trait, then re-dispatches
combine(x::T, y::T) where {T} = combine(addability(T), x, y)
combine(::IsAddable,  x, y) = x + y
combine(::NotAddable, x, y) = error("$(typeof(x)) is not addable")
```

- **Zero-cost — but only when the trait function is inferable.** It compiles out **iff**
  `addability(T)` is constant-foldable: dispatch on `::Type{T}` and keep it pure. If the trait is
  chosen from a **runtime value** (not the static type) it becomes a real **dynamic dispatch** with
  cost — do not claim "zero-cost" unconditionally. Verify with `@code_typed` that the trait branch
  resolved (it should not appear in the typed IR).
- **The trait function obeys the no-piracy rule too (§10.6).** Adding `addability(::Type{TheirT})`
  where both `addability` *and* `TheirT` are foreign is type piracy. Own the trait function (define
  it in your package) OR own the type.
- **Default to hand-rolled THTT — no dependency.** It's ~5 lines and used throughout `Base`
  (`IteratorSize`, `IndexStyle`, `IteratorEltype`). Reach for a package only for ergonomics:
  - **`SimpleTraits.jl`** — thin `@traitfn` sugar over THTT, actively maintained. Caveat: **one
    trait per method** (can't dispatch on several traits at once) and occasional harmless
    overwrite warnings. Use only if the boilerplate genuinely hurts.
  - **`Interfaces.jl`** — *test-time* verification that a type satisfies an interface contract
    (the trait analogue of Aqua; belongs in `test/`, §10.6.1). Different layer from dispatch.
  - **Avoid** adding `BinaryTraits` / `WhereTraits` / `DuckDispatch` as deps: their coexistence
    signals there is **no canonical trait library** — a heavy dep here is a liability, not a win.

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
  Package-level shape — dynamic shell outside, type-stable core inside, joined by function
  barriers — is owned by performance.md §2.1.3; its `.so`-extraction consequence by setup.md §3.5.1.

### §10.6.1 Convert these invariants into CI checks — the compiler won't

Julia enforces almost none of §10.6 structurally (type piracy *compiles*; globals *compile*; the
orphan rule that Rust enforces at compile time is, in Julia, a guideline). The discipline is real
but **opt-in**, so re-impose it as automated checks in `test/` — this is how the ecosystem
substitutes tooling for compiler guarantees. Three non-overlapping layers, all belong in CI:

| Layer | Tool | Enforces |
|---|---|---|
| **Package hygiene** | **`Aqua.test_all(MyPkg)`** | **type piracy**, method ambiguities, unbound type params, undefined/undocumented exports, stale deps, `[compat]` gaps |
| **Namespace hygiene** | `ExplicitImports.jl` | implicit/unused `using` imports → explicit `using A: f` |
| **Type/bug analysis** | `JET.report_package` / `@test_opt` | type instability, nonexistent methods, error paths (performance.md §2.8) |
| **Formatting** | `Runic` | fixed style, zero-config (packages.md) |

`Aqua` is the direct enforcement of the §10.6 anti-piracy / dependency invariants — **add it to
every package you author.** It is a *test suite*, not a formatter: it fails CI when discretion has
been abused. `DispatchDoctor.@stable` (def-site) + `AllocCheck.@check_allocs` (hot kernels) round
out the proactive side.

**Interactively answering "which method actually ran / where did it come from?"** — the cost of the
single shared namespace is that a call like `f(x, y)` may resolve to a method from any loaded
package. Three REPL macros trace it (use these, not guesswork):
`@which f(x, y)` → the exact method + defining module/file:line; `methods(f)` → the full dispatch
table for `f`; `@code_typed f(x, y)` → confirms the chosen method *and* that traits/branches folded
away (§10.2.1). For invalidation/precompile-level provenance, `@snoop_invalidations` (§10.7).

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
| Behavior cuts ACROSS the hierarchy / classify types you don't own | **Holy trait** (THTT, §10.2.1) — keep the trait fn inferable; don't add a trait dep |
| Verify a type satisfies an interface contract | `Interfaces.jl` in `test/` (§10.2.1 / §10.6.1) |
| "Which method actually ran / where from?" | `@which` · `methods` · `@code_typed` (§10.6.1) |
| Component independently testable/reusable | make it a **separate/sub package**, not a submodule |
| Shared abstract API across packages | extract an **interface package** (SciMLBase-style) |
| Optional / heavy dependency | **package extension** via `[weakdeps]` (not `Requires.jl`) |
| Need a true name wall | submodule — **last resort only** (costs dispatch composition) |
| Want stable API without namespace dump | `public` (≥1.11); else `export` |
| Slow first call in a big package | `@compile_workload` + fix invalidations (§10.7) |
| Tempted to use a non-const global | put it in a function arg or a `const` container |
| Tempted to extend others' funcs on others' types | **stop — type piracy**; own one side |
