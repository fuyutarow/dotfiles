# Runtime upgrades — feature availability, compatibility, and measurement

**SOLE owner:** choosing a Julia runtime version and identifying upgrade-specific checks.
`architecture.md` owns the public-only API policy; `packaging.md` owns compat and manifest declarations.
`setup.md` owns installation, thread launch settings, and AOT recipes; `compilation.md` owns compiler flags.

## Select a version for the project

Inspect the project's Julia constraint, manifest policy, deployment target, and compiler-coupled tools first.
Check the official support/download pages for current stable and LTS channels; record the observation date.
A NEWS page or a development documentation URL is evidence of described changes, not proof of a stable release.
Keep an existing pinned runtime until the requested upgrade passes the relevant checks.

| Requirement | Decision |
|---|---|
| New project without a runtime constraint | Trial a currently supported stable patch against required packages and deployment targets. |
| Existing deployment needing a conservative release line | Evaluate the supported LTS against required language features and package/tool compatibility. |
| Authored package under this skill's public-only policy | Respect the Julia floor in `architecture.md`; an older LTS label does not override it. |
| Compiler-coupled tools such as JET or a trimming pipeline | Check functional compatibility for the exact version pair, not just successful installation. |
| Reproducible experiment or published binary | Record an exact runtime version and platform; a moving `release`/`lts` channel alone is insufficient. |

Do not change a global Juliaup default merely to run one project or upgrade test.
Use an explicit version selector or the repository's declared toolchain.
An upgrade must pass fresh-process import/tests and representative numerical checks.
For a library, test the advertised minimum and selected newer runtime; for a frozen application, preserve its prior lockfile.
Use isolated environments for new dependency resolution rather than silently replacing the reproducibility record.

## Changes that affect a decision

| Version / change | Required check or action | Invalid inference |
|---|---|---|
| 1.10: multithreaded GC marking and `--gcthreads` | Measure allocation/GC time or pauses if relevant; budget GC threads along with other pools. | Parallel GC eliminates pauses or guarantees a workload speedup. |
| 1.11: `Memory` and Array implementation changes | Retain the array abstraction the task needs; justify any low-level storage rewrite separately. | All arrays should be replaced with `Memory`. |
| 1.11: `public` | Follow `architecture.md` §10.5; verify on the supported minimum runtime. | Qualified access was impossible before 1.11, or the syntax is `Base.public :name`. |
| 1.11: `@main` opt-in | For a script/CLI, choose explicit opt-in to `Main.main(args)` and test the actual launch path. | Merely defining a function named `main` makes it execute automatically. |
| 1.12: constant/type redefinition under world age | Recreate affected values and redefine affected methods as needed; test in a fresh process before delivery. | Existing instances and old typed methods are automatically migrated to the new type. |
| 1.12: experimental trimming | Use `setup.md` §3.5.1 and test the concrete trimmed artifact on each supported runtime. | Any package is generically trimming-safe because it is type-stable or passed ordinary tests. |
| 1.12: BOLT build support | Treat it as a runtime-build experiment with workload/platform evidence. | It is a routine Julia launch flag or a universal 10–23% application speedup. |
| 1.13: Apple Silicon CPU counts and thread-pool defaults | Recheck worker, GC, precompile, and BLAS thread counts; keep explicit resource limits. | CPU-count detection establishes optimal P/E-core placement or pinning. |
| 1.13: changed string hashing and selected API behaviors | Check hash-dependent caches and affected API tests against the versioned NEWS. | Minor-version compatibility freezes all hash outputs and internal behavior. |
| 1.13: Windows bracketed paste | Check the REPL/terminal behavior when paste is the actual task. | A REPL improvement changes numerical execution semantics. |
| Juliaup GUI | Check the installed Juliaup distribution if a GUI is requested. | GUI availability is a Julia 1.13 language capability. |

For latency claims, use `compilation.md` to separate loading, first execution, and warmed execution.
Keep a version upgrade only on the evidence relevant to its stated purpose; “newer” is not a performance result.

## Evidence snapshot [dated:2026-09-23]

The captured official support table lists stable **1.13.0** and LTS **1.10.12**.
Refresh the channel check when selecting a runtime; these values are not evergreen defaults.
The captured JET README distinguishes installability from functional support and documents `JET_AVAILABLE`.
Its then-current v0.12 series targets Julia 1.12/1.13; confirm the actual installed pair before treating JET as a gate.

Source positions in soks:
- `urn:uuid:01a0cdef-e16f-75f7-8732-42a510dd980c`, `sok-julia_release_feature_boundaries.md`.
- `urn:uuid:01a0cdef-9a86-7127-994d-2d86e91b0a2d`, `sok-julia_numeric_literals_and_diagnostics.md` (JET compatibility).

Release facts are bounded primary-source observations; the upgrade checklist is skill-supplied.
No arbitrary-workload speed, linter completeness, or cross-version migration success is claimed.
