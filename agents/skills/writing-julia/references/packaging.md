# Julia Package Engineering — identity, dependency contract, and release

> **SOLE OWNER**: this file owns Julia package identity, repository/package naming, package
> profiles, `Project.toml` dependency roles, manifest policy, workspaces, package state, registry
> admission, and release. Code/module topology stays in `architecture.md`; environment execution
> and experiment provenance stay in `setup.md`; package selection stays in `packages.md`.

The package contract is not a directory suffix. It is the tuple
`(name, uuid, entry point, dependency contract, public API, version)`.

## PK0. Classify the deliverable before writing package metadata

Three decisions control the rest. Record all three in the package plan.

| Axis | Choice | Consequence |
|---|---|---|
| Consumer | reusable library | callers resolve a compatible dependency set |
| Consumer | application or research environment | the repository reproduces one resolved dependency set |
| Topology | one package | one `Project.toml` and one package entry point |
| Topology | workspace or monorepo | each package owns a `Project.toml`; the workspace coordinates development |
| Distribution | local/private URL | `[sources]` may locate unregistered dependencies while this environment is active |
| Distribution | registry | every dependency must be resolvable under that registry's policy |

Do not infer any row from the folder name. Inspect `Project.toml` and `src/`.

## PK1. Identity and naming — choose by locus

| Locus | Contract | Example |
|---|---|---|
| `Project.toml` `name` | valid Julia identifier; no `.jl` suffix | `name = "MyPackage"` |
| Package identity | `name` is human-facing; `uuid` is definitive | `uuid = "..."` |
| Top-level module | exactly the package name | `module MyPackage` |
| Entry point | `src/<name>.jl`, defining that module | `src/MyPackage.jl` |
| Loading | use the module/package name, never a file suffix | `import MyPackage` |
| Local package directory | suffix is not semantic; generated default is `<name>/` | `MyPackage/` |
| Remote repository | ecosystem convention is `<name>.jl`; General AutoMerge checks it | `MyPackage.jl` |
| Workspace/container directory | descriptive name; never use `.jl` to imply packagehood | `packages/` |

Julia can discover both `X/src/X.jl` and `X.jl/src/X.jl` in an implicit package directory.
That acceptance rule does not turn the local suffix into an invariant.

For a new General package, run RegistryCI's current name checks instead of memorizing thresholds.
Those checks include identifier shape, collision distance, and repository URL rules.

## PK2. Scaffold the contract, then customize

| Starting state | Scaffold action |
|---|---|
| New maintained package | use `PkgTemplates.jl` for repeatable tests, CI, docs, and license setup |
| Minimal or throwaway package | `Pkg.generate("MyPackage")` is the two-file floor |
| Existing package | reconcile its contract; do not scaffold over it |

PkgTemplates takes the bare package name. Its Git plugin adds `.jl` to the remote URL by default
and does not commit a manifest by default.

Pkg's minimum package tree is `Project.toml` plus `src/<name>.jl`.
For a package intended for collaboration or distribution, use this scaffold:

```text
MyPackage/
├── Project.toml
├── src/MyPackage.jl
├── test/runtests.jl
├── LICENSE
└── README.md
```

Add `ext/`, `docs/`, `benchmark/`, or `Artifacts.toml` only when their corresponding role exists.
Module/file splitting after package birth is governed by `architecture.md` §10.

## PK3. `Project.toml` is the consumer contract

| Entry | Put it here when | Deny |
|---|---|---|
| `name`, `uuid`, `version` | the project is a package | deriving identity from a directory or Git URL |
| `[deps]` | package code imports it at runtime | undeclared imports or speculative dependencies |
| `[weakdeps]` | functionality is optional for the caller | making every caller install a heavy optional integration |
| `[extensions]` | named `ext/` module loads after all trigger packages are loaded | ad-hoc runtime loading on supported Julia versions |
| `[compat]` | every direct dependency, weak dependency, and supported Julia line | a dependency declaration with no supported range |
| `[sources]` | active development needs a path, URL, revision, or monorepo `subdir` | treating it as registry-consumer metadata |
| `[workspace]` | test/docs/benchmark projects or several packages resolve together | copying their dependencies into the root package |
| `[apps]` | a package intentionally ships command entry points | a hand-made global launcher |

Use `Pkg.add`/`Pkg.rm` to maintain dependency entries. Do not hand-edit UUIDs.
Every direct `using` or `import` in committed package code must resolve through `[deps]` or the
declared extension environment. Remove a dependency in the same change that removes its last use.

`[sources]` is resolution context, not a portable release promise. It is consulted for the active
environment and for URL/path development flows. A registry consumer does not generally inherit a
dependency package's `[sources]`. Registry releases therefore require registry-resolvable deps.

Version-gate metadata against the package's declared Julia compatibility `[dated:2026-09]`:

| Mechanism | Minimum / status |
|---|---|
| ZERO-EXPORTS + `public` API | canonical `[compat] julia = "1.11"`; gate-enforced |
| `[weakdeps]` + `[extensions]` | Julia 1.9 |
| `[sources]` | Julia 1.11 |
| `[workspace]` | Julia 1.12 |
| `[apps]` / `Pkg.Apps` | experimental; re-check before production use |

### Dependency role lookup

| Need | Mechanism |
|---|---|
| Required at package load/runtime | `[deps]` + `[compat]` |
| Optional interoperability | `[weakdeps]` + `[extensions]` + `[compat]` |
| Test/docs/benchmark tooling | child `Project.toml` in a workspace |
| Local or unregistered development dependency | `[deps]` identity + `[sources]` locator |
| Immutable dataset or binary payload | `Artifacts.toml` |
| External binary distribution | a JLL package / BinaryBuilder path |

## PK4. Manifest policy follows the consumer

`Project.toml` declares acceptable inputs. `Manifest.toml` records one exact resolution.
They are not interchangeable.

| Profile | Root manifest policy | Required verification |
|---|---|---|
| Reusable library | optional development snapshot; never the compatibility contract | test at least one fresh resolution from `Project.toml` |
| Application/deployment | commit it | instantiate the exact environment in CI/deploy |
| Recordable research environment | commit it | bind results to commit + parameters under `setup.md` JG5 |
| Workspace/monorepo | Pkg writes one root manifest; commit it when the root profile needs an exact resolution | instantiate the workspace and test each member |

If a library commits a manifest for developer reproducibility, CI must also exercise a job that
does not mistake that pin for the supported dependency range. `[compat]`, not the manifest,
defines what downstream users may resolve.

Never edit a manifest manually. Let Pkg regenerate it. Use version-specific manifests only when
different supported Julia lines genuinely require different resolutions.

## PK5. Test, docs, and benchmark dependencies belong outside runtime deps

Choose test dependency layout from the minimum Julia version `[dated:2026-09]`:

| Minimum Julia | Test dependency layout |
|---|---|
| 1.12+ and joint resolution desired | `[workspace]` plus `test/Project.toml` |
| 1.11+ and isolated test resolution desired | `test/Project.toml` with `[sources]` path |
| older | version-appropriate `test/Project.toml` merge or `[extras]`/`[targets]` |

The modern joint-workspace form is:

```toml
[workspace]
projects = ["test", "docs", "benchmark"]
```

Each child owns its direct dependencies. It does not inherit the root package's `[deps]`.
Reference the parent package from the child explicitly:

```toml
[sources]
MyPackage = { path = ".." }
```

Use a legacy form only when the declared minimum Julia version requires it.
The strict namespace gate adds `Test`, `TOML`, and `ExplicitImports` to the test project.
Declare every extension trigger in the test project and load all triggers in the test session.
Then assert the extension behavior; use `Base.get_extension` when direct presence matters.

## PK6. A package installation is immutable and relocatable

| State or payload | Home |
|---|---|
| Immutable bundled/downloaded data | `Artifacts.toml` + artifact hash |
| Platform binary | JLL artifact |
| Disposable package-managed cache | `Scratch.jl` scratch space |
| User preference | `Preferences.jl` / active project preference |
| Important user-generated data | a caller-supplied path outside the package tree |

Never write generated state into the installed package directory. Do not depend on that directory
remaining writable or stable. Prefer artifacts/JLLs over install-time `deps/build.jl` work.

## PK7. Public API and version are one contract

API exposure is owned by `architecture.md` §10.5. `export` and `@reexport` are forbidden.
Stable bindings use `public` only. Changing a documented public promise drives the version bump.

| Change | Julia package version action |
|---|---|
| Compatible bug fix at `1.x` | patch |
| Backward-compatible public capability at `1.x` | minor |
| Breaking public behavior at `1.x` | major |
| Compatible change at `0.y`, `y > 0` | patch |
| Breaking public behavior at `0.y`, `y > 0` | minor |
| Change at `0.0.x` | treat the exact Pkg compatibility range deliberately |
| Remove an existing export at `1.x` | major, even when the binding remains `public` |
| Remove an existing export at `0.y`, `y > 0` | minor |

Architecture of the public surface stays in `architecture.md` §10.5.

## PK8. Release and registry gates

Before any package release:

- install from a fresh environment using the candidate URL/revision;
- load the package by name and run `Pkg.test()`;
- run Aqua, ExplicitImports, and JET as scoped in `architecture.md` §10.6.1;
- pass the recursive ZERO-EXPORTS test for root, child, and extension modules;
- confirm the version matches the public API change under PK7.

For a General registry release:

- run the current RegistryCI name and admission checks;
- satisfy its bounded `[compat]` policy for Julia and ordinary direct deps;
- provide the required top-level OSI-approved license and repository URL;
- provide release notes for a breaking AutoMerge submission;
- register with Registrator; use TagBot when repository release automation is configured.

General's AutoMerge rules are an admission fast path, not universal Julia semantics.
Private registries use their own admission and release policy.

## PK9. Application packaging is a separate branch

Pkg apps use `@main` plus an `[apps]` table and are installed with `Pkg.Apps`.
This surface remains experimental `[dated:2026-09]`; re-check before choosing it for production.
Shipping a sysimage, executable, or shared library is owned by `setup.md` §3.5.

## Package review checklist

- [ ] PK0 profile and distribution target are named.
- [ ] `name`, `uuid`, module, and `src/<name>.jl` agree.
- [ ] Every dependency has an explicit role.
- [ ] Duplicate declarations exist only for documented version-gated compatibility.
- [ ] `[compat]` covers Julia and all declared dependency roles.
- [ ] `[compat] julia = "1.11"` exactly; no Compat fallback weakens `public` semantics.
- [ ] Manifest handling matches the consumer profile.
- [ ] Test/docs/benchmark deps do not inflate runtime `[deps]`.
- [ ] Package code writes no state into its installed tree.
- [ ] Root, child, and extension modules export nothing; stable API is `public` only.
- [ ] `Reexport.jl` is absent from every dependency role.
- [ ] `Requires.jl` is absent; optional integration uses native extensions.
- [ ] Every strict ExplicitImports check passes with only Base/Core as implicit baseline.
- [ ] Fresh install, import, tests, and package-hygiene checks pass.
- [ ] Registry-specific checks run only when that registry is the distribution target.

## Primary sources — re-check on packaging reforge

- Pkg, *Creating Packages*: https://pkgdocs.julialang.org/dev/creating-packages/
- Pkg, *Project.toml and Manifest.toml*: https://pkgdocs.julialang.org/dev/toml-files/
- Julia manual, *Code Loading*: https://docs.julialang.org/en/v1/manual/code-loading/
- PkgTemplates, *User Guide*: https://juliaci.github.io/PkgTemplates.jl/stable/user/
- RegistryCI, *Automatic merging guidelines*:
  https://juliaregistries.github.io/RegistryCI.jl/stable/guidelines/
- Pkg, *Apps* `[dated:2026-09]`: https://pkgdocs.julialang.org/dev/apps/
