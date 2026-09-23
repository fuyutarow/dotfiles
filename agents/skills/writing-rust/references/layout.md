# Cargo project construction and verification scope (RG5)

SOLE owner of Cargo package/workspace layout decisions and their verification scope.
Read for creation or structural changes; a focused code fix does not owe a new layout document.
Use one compact table in the response or an existing project note; do not create paperwork by default.

## 1. Establish the object being built

Record the product, Cargo root manifest(s), package/target boundary and reason for each new package.
Inspect existing manifests and contributor commands before changing a repository.
Separate building a framework itself from building an application that uses it.
For Sui, the Rust platform repository and an on-chain Move package need different toolchains and manifests.

| Need | Choose | Check |
|---|---|---|
| One application or library | One package; `cargo new` or `cargo init` for an existing directory | Generated manifest and `src/main.rs` or `src/lib.rs` |
| Organize code within one compilation/API boundary | Modules; move definitions into module files | Module visibility and existing tests; no new package merely for a folder |
| Library plus CLI, or several executable entry points | One package can hold a library and multiple binary targets | Target list and the actual reusable API |
| Several related packages, with a primary public library or CLI at root | Root `[package]` plus `[workspace]` | Root package and member identities |
| Several packages all placed in their own directories | Virtual `[workspace]` root | No root `[package]`; explicit resolver from project.md |
| Examples/vendor subsystem requiring its own dependency or toolchain policy | Consider a separate workspace with a stated reason | Both root manifests and separate check commands |

Do not copy the size or directory names of Sui, Bevy or another large repository into a small project.
One package with `src/lib.rs` and `src/main.rs` contains two crates/targets; it does not need two packages.
Name the API, dependency, compilation or release boundary that a split creates.
`crates/` is a convention; direct sibling packages and functional subtrees are also valid.
Cross-language manifest placement belongs to `wiring-repositories`.

## 2. Construct membership and dependency edges separately

In the Rust Book's workspace example, `cargo new` beneath the workspace adds the new package to `members`.
Inspect that edit; existing packages may instead need an explicit member entry or glob.
Membership does not create a dependency: add a path dependency in each package that consumes the other.
Resolve `path` relative to the consuming package's manifest, not the workspace root.
Shared dependency versions and per-member opt-in belong to project.md.

After changing manifests, inspect:

```sh
cargo metadata --format-version 1 --no-deps --manifest-path <root>/Cargo.toml
```

Compare `workspace_members`, `workspace_default_members`, manifest paths and targets with the intended layout.
`--no-deps` inventories declarations; it does not prove the resolved dependency graph or feature combinations.
Preserve the repository's lock/offline policy and run the scoped build checks below.

## 3. Place targets and development assets by their consumer

| Artifact | Placement / decision | Acceptance |
|---|---|---|
| Library / primary binary / additional binaries | Cargo defaults `src/lib.rs`, `src/main.rs`, `src/bin/`; explicit manifest paths when needed | `cargo metadata` target kind and source path match |
| Unit tests | Usually a `#[cfg(test)]` module beside implementation | Relevant test target exercises private behavior |
| Integration tests | Package `tests/`, or an explicit `[[test]]` target | Public API or binary behavior; test helpers are not accidental targets |
| Examples and benchmarks | Package targets for shared context; separate packages/workspaces for distinct dependency contexts | State which root and feature set build them |
| Build-time generation / native integration | Package `build.rs`; outputs under `OUT_DIR` | Build from clean source; no writes into checked-in source during the build |
| Tracked generated source | Explicit regeneration/check task | Compare regenerated output in CI; do not regenerate tracked source from `build.rs` |
| Repository automation | Keep the established runner; Rust `xtask` may implement a task | `wiring-mise-tasks` owns the house verb graph |

Do not infer test coverage from a directory named `tests` or `examples`.
A virtual root, a package target and a separate test workspace are different execution scopes.

## 4. Verify the intended scope

Record `manifest/root | packages | targets | features | test mode | command` for nontrivial workspaces.
For a single package, one sentence and its check/test commands suffice.
Run from the intended root when local Cargo config matters; `--manifest-path` does not change config discovery cwd.

| Intended scope | Command shape / obligation |
|---|---|
| One package | `cargo check -p <name>` and the relevant `cargo test -p <name>` |
| Every member of one workspace | Explicit `--workspace`; use exclusions only when other named checks cover them |
| Root/default selection only | Plain Cargo commands are valid; report their selected scope, not “whole repository” |
| Alternate targets or features | Test supported combinations; `--all-targets` and `--all-features` are different dimensions |
| Separate workspace or simulator | Invoke its own manifest/runner; root `--workspace` does not include it |
| Library using nextest | Preserve a separate doctest command; runner details belong to project.md |
| Publishable package | `cargo package --list` to inspect the shipping file set; follow the existing release checks |

Do not replace a feature matrix with `--all-features` without checking that the combined set is supported.
Pass this scope to `wiring-mise-tasks`; task names and aggregates remain that skill's responsibility.

## 5. Evidence and limits `[dated:2026-09-23]`

Primary contracts (paraphrased):
[new](https://doc.rust-lang.org/cargo/commands/cargo-new.html),
[init](https://doc.rust-lang.org/cargo/commands/cargo-init.html),
[modules](https://doc.rust-lang.org/book/ch07-05-separating-modules-into-different-files.html),
[workspace construction](https://doc.rust-lang.org/book/ch14-03-cargo-workspaces.html),
[workspaces](https://doc.rust-lang.org/cargo/reference/workspaces.html),
[metadata](https://doc.rust-lang.org/cargo/commands/cargo-metadata.html),
[configuration](https://doc.rust-lang.org/cargo/reference/config.html),
[targets](https://doc.rust-lang.org/cargo/reference/cargo-targets.html),
[features](https://doc.rust-lang.org/cargo/reference/features.html),
[build scripts](https://doc.rust-lang.org/cargo/reference/build-scripts.html),
[tracked generation](https://doc.rust-lang.org/cargo/reference/build-script-examples.html#code-generation),
[package contents](https://doc.rust-lang.org/cargo/reference/publishing.html).

Counterexamples to a universal repository tree:
[Sui root](https://github.com/MystenLabs/sui/blob/48e16eee16620a26213323b05b5f506ed582322b/Cargo.toml),
[Sui's Move workspace](https://github.com/MystenLabs/sui/blob/48e16eee16620a26213323b05b5f506ed582322b/external-crates/move/Cargo.toml),
[Axum examples workspace](https://github.com/tokio-rs/axum/blob/c44f6650aa38d4c154e3cdb7347205e03813f4d5/examples/Cargo.toml),
[Clap root package/workspace](https://github.com/clap-rs/clap/blob/8ab46fe22b4aa5c3bd09cc0e6c3fe9a75fc178a8/Cargo.toml).
The 14-project survey establishes available patterns, not their prevalence or performance superiority.
The verification ledger records synthesis lineage and review status.
