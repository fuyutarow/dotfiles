# §10 Large-Package Architecture — file/module organization at scale

How to structure a **large research Julia package** so it stays fast and understandable.
This is the house/SciML architecture profile, not a Pkg validity rule. Julia permits other module
topologies. Package identity and distribution are owned by `packaging.md`.

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

Files do not isolate names. Use the four invariants for ordinary role files.
Use a submodule only when a real internal namespace shares the parent package lifecycle (§10.3).

## §10.1 One top-level module; split files by ROLE; all `include`s in the boss file

- **One public top-level module matching the package name.** Submodules are valid namespace
  boundaries; §10.3 decides when a boundary instead deserves its own package.
- **Split files by role — nouns then verbs:**
  - `types.jl` / `interfaces.jl` — abstract types, structs. **No logic.**
  - `*.jl` method/function files — behavior over those types.
- **House default:** ordinary role files contain no `module` and no `include`.
- **Keep ordinary `include`s in the boss file (`MyPkg.jl`), in dependency order:** abstract
  interfaces → concrete types → functions. A submodule may own its own files, but the boss file
  must not include those files again.

```julia
module MyPkg
using LinearAlgebra: norm          # explicit imports (SciMLStyle), not bare `using`

include("interfaces.jl")           # 1. abstract types — the shared vocabulary
include("types.jl")                # 2. concrete structs
include("solvers.jl")              # 3. behavior (may freely use the types above)
include("plots.jl")

public Solver, solve               # public API; ZERO EXPORTS (§10.5)
end
```

### §10.1.1 Naming and formatting are separate decisions

For new authored code, use BlueStyle's naming preference. Keep Runic as the formatter
(`packages.md`); it does not rename identifiers. Review names separately from `runic --check`.

| Locus | Name to write | Check |
|---|---|---|
| New function | lowercase `snake_case`; prefer one or two clear words, e.g. `count_zeros` | inspect the authored names |
| New variable | lowercase `snake_case`, except conventional math symbols | inspect the authored names |
| Function that mutates an argument | the same name with `!`, e.g. `sort_values!` | confirm the mutation contract |
| New type or module | `UpperCamelCase`, e.g. `MyPackage` | compare with the declared type/module |
| New constant | `UPPER_SNAKE_CASE`, e.g. `DEFAULT_LIMIT` | inspect the binding |
| Internal role file | lowercase `snake_case.jl`, e.g. `solver_utils.jl` | compare each `include` path |
| Package entry point or test runner | keep `src/MyPackage.jl` and `test/runtests.jl` | match PK1 and Pkg's test entry point |

The variable and role-file rules are house conventions, not claims from BlueStyle. Preserve established
external API names and Base methods when extending them; renaming an existing public name needs
an API migration under `packaging.md` §PK7. BlueStyle's export advice does not override §10.5.

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

## §10.3 Scale-out ladder: file, submodule, or package

Choose by ownership and lifecycle, not by file size alone. SciMLStyle prefers a subpackage when a
component is independently useful; Julia itself supports submodules as namespace boundaries.

| Growth stage | Right tool | Why |
|---|---|---|
| File too long | another `include`d file (§10.1) | free; no namespace cost |
| Internal component shares version, deps, and release | submodule `module … end` + relative imports | real namespace without a new package contract |
| Component needs independent reuse, compat, tests, or release | **separate package** or monorepo subpackage | own identity and dependency contract |

- **Interface packages are the backbone of large ecosystems.** Factor the shared abstract API into
  a lightweight package that everything depends on — the pattern behind `SciMLBase`,
  `ArrayInterface`, `ChainRulesCore`, `RecipesBase`. Core + plugins all depend on the interface
  package, so they compose **without** a monolith and **without** depending on each other.
- Monorepo package identity, `[sources]`, workspaces, and registration are owned by `packaging.md`.

## §10.4 Optional / heavy dependencies → package extensions

The dependency declaration and version gates are owned by `packaging.md` §PK3.
Here the architecture rule is narrow: optional integration code lives in its named `ext/` module,
not in the core source tree. Use native package extensions. `Requires.jl` is forbidden.

## §10.5 Namespace contract — ZERO EXPORTS, explicit public API

### THE LAW — namespace injection is forbidden

Every authored module has zero author-declared exports. `export` and `@reexport` are forbidden in
top-level packages, submodules, and extensions. Julia's automatic module-self binding is the only
`Base.isexported` result the gate excludes. Stable API is marked only with `public`; internal
bindings use neither keyword. `Reexport.jl` is forbidden. Callers use qualified access or an
explicit named import.

Keep each module's `public` declarations in one block in that module's boss file. Included role
files define behavior but do not scatter API declarations. The executable API manifest below
fails when a declaration is missing, undefined, or added without review.

This is a house rule stricter than Julia's language requirement. It sacrifices unqualified REPL
ergonomics so adding a package cannot inject or collide with caller bindings.

| Intent | Authoring form | Caller form |
|---|---|---|
| Stable API | `public solve` | `Pkg.solve()` or `import Pkg: solve` |
| Internal implementation | no `public`; never `export` | not a supported dependency surface |
| Qualified dependency use | `import Dep`; call `Dep.f()` | no implicit binding |
| Selected dependency name | `using Dep: T` | explicit binding, no method extension |
| Extend an external generic | `import Dep: f`; define `f(::OwnType)` | explicit extension |

`import Pkg` introduces the module binding alone. Bare `using Pkg` also imports its exported names.
Only a module with no exported members avoids that injection under `using`.
Julia has no true private module binding: qualified access and explicit import remain technically possible.
The contract is support and SemVer, not access control. `baremodule` does not solve this problem.
The declaration syntax is `public solve`, not `Base.public :solve`.
Qualified access also existed before Julia 1.11; `public` added API marking, not permission to call a binding.

Authored packages declare the canonical `[compat] julia = "1.11"`. Do not use a Compat fallback.
The executable gate checks that exact floor; a verifiable public-only API is part of the contract.

Package source under `src/` and `ext/` must not rely on bare `using Dep`. All dependency access is
qualified or explicitly named. Every imported or qualified dependency binding must be public and
accessed through its owning module.

### §10.5.1 Executable ZERO-EXPORTS gate

ExplicitImports does not ban a package's own exports. Copy `assets/no_exports.jl` to
`test/no_exports.jl`. Define its three constants and load every extension trigger before including
it from `test/runtests.jl`. Declare `Test`, `TOML`, and `ExplicitImports` in the test project:

```julia
import MyPackage

const ZERO_EXPORTS_PACKAGE = MyPackage
const ZERO_EXPORTS_PUBLIC_APIS = IdDict{Module, Set{Symbol}}(
    MyPackage => Set{Symbol}((:solve, :Solver)),
    MyPackage.InternalSubmodule => Set{Symbol}(),
)
const ZERO_EXPORTS_EXTENSIONS = (:MyPackagePlotsExt,)

include("no_exports.jl")
```

The asset parses every `src/**/*.jl` and `ext/**/*.jl` file. It rejects `export`, `@reexport`, and
bare `using`, plus Reexport.jl in dependency sections. Runtime reflection catches generated
exports and recursively inspects owned modules. The extension-name tuple must exactly match
`Project.toml`'s `[extensions]`, and every extension must load. Every discovered authored module's
exact `public` set is locked; absent map entries mean an empty public set.

Every ExplicitImports check runs without ignores or unanalyzable-module escape. Only the
implicit-import check permits Base/Core as the language baseline. Ownership and public-access
checks pass `skip=()`. The package is removed from the implicit check's default skip set, so
submodule imports are checked.

The static and runtime checks are deliberately redundant. Reflection catches generated member
exports. Julia's automatic self binding is indistinguishable from a generated export of the same
module name. Dynamic visibility mutation is forbidden by policy. Removing an existing export
remains breaking even when the binding stays `public`; `using Pkg; name` stops resolving.
Version it under `packaging.md` §PK7.

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
substitutes tooling for compiler guarantees. Five non-overlapping layers belong in CI:

| Layer | Tool | Enforces |
|---|---|---|
| **Package hygiene** | **`Aqua.test_all(MyPkg)`** | piracy, ambiguities, type params, stale deps, compat gaps |
| **Namespace injection** | `test_no_exports` (§10.5.1) | any export in root, child, or extension modules |
| **Import hygiene** | ExplicitImports checks (§10.5.1) | no implicit/private/non-owner/stale access |
| **Type/bug analysis** | Choose the JET entrypoint in performance.md §2.8 | Error analysis and optimization analysis have separate assertions and coverage limits. |
| **Formatting** | `Runic` | fixed style, zero-config (packages.md) |

`Aqua` enforces §10.6 package hygiene; add it to every authored package. It does not replace the
ZERO-EXPORTS test. ExplicitImports governs dependency consumption, not the package's export list.
`DispatchDoctor.@stable` and `AllocCheck.@check_allocs` cover hot-path contracts.

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

## §10.8 Package scaffold and tests

Package identity, repository naming, `PkgTemplates`, manifest policy, test workspaces,
registration, and release are owned by `packaging.md`. This section adds only code-level test
isolation to the architecture rules above.

- **Tests isolated per item:** `@safetestset` (or TestItems `@testitem`, setup.md §8) so no
  variable leaks between test scripts; group by category; use a `GROUP` env var to shard CI.

## §10.9 Quick decision table

| Situation | Do |
|---|---|
| File too long | split into another `include`d role-file; `include` only in the boss file |
| A needs B's type and vice-versa | hoist shared abstract types to `interfaces.jl`, load first |
| Behavior cuts ACROSS the hierarchy / classify types you don't own | **Holy trait** (THTT, §10.2.1) — keep the trait fn inferable; don't add a trait dep |
| Verify a type satisfies an interface contract | `Interfaces.jl` in `test/` (§10.2.1 / §10.6.1) |
| "Which method actually ran / where from?" | `@which` · `methods` · `@code_typed` (§10.6.1) |
| Component needs independent version/compat/reuse | make it a separate or monorepo subpackage |
| Shared abstract API across packages | extract an **interface package** (SciMLBase-style) |
| Optional / heavy dependency | native extension; never Requires.jl |
| Need an internal namespace with the same lifecycle | submodule with relative imports |
| Want stable API | `public`; require Julia 1.11+ |
| Tempted to `export` / `@reexport` | stop; the ZERO-EXPORTS gate forbids namespace injection |
| Slow first call in a big package | `@compile_workload` + fix invalidations (§10.7) |
| Tempted to use a non-const global | put it in a function arg or a `const` container |
| Tempted to extend others' funcs on others' types | **stop — type piracy**; own one side |
