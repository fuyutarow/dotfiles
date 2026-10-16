# Cargo project configuration

Apply from dotfiles with `mise run preset -- apply rust --to /path/to/repo`;
compare with `mise run preset -- diff cargo --to /path/to/repo`.
The destination must exist. Applying replaces the files listed in `preset.toml`.

`Cargo.toml` is a virtual workspace baseline. Add actual workspace members and
have member packages inherit its edition. Merge `member-lints.toml` into each
member's manifest; it is an opt-in fragment, not a standalone package.
Choose package names, versions, dependencies and MSRV for the project.
The empty baseline is configuration, not a buildable Rust application.

`rustfmt.toml` and `clippy.toml` intentionally contain only comments: the skill
prescribes rustfmt defaults and no custom Clippy options. Lint levels belong in
`Cargo.toml`. `mise.toml` covers one workspace with default features; declare a
verified runtime and review feature/target coverage before executing its tasks.
Its bodies follow the existing Rust mise template, with lint levels supplied by
the workspace manifest instead of the template's transitional warning flag.

## Inventory disposition

Locations below refer to the facts-presets inventory at base revision `6f21acb0`.
The skill retains explanations; reusable configuration lives here.

| Inventory row | Disposition |
|---|---|
| `project.md:11` edition/resolver | Moved to `Cargo.toml`; skill links there. |
| `project.md:24` MSRV | Stays: `1.NN` is a placeholder for the project's tested minimum, not a value to copy. |
| `project.md:36` dependency features | Stays: clap/config feature selections illustrate a dependency-specific rule, not universal dependencies. |
| `project.md:39` dependency inheritance | Stays: table names and the member opt-in explain sharing; no dependency or version is prescribed. |
| `project.md:92` workspace lints | Moved to `Cargo.toml`; skill links there. |
| `project.md:101` member lints | Moved to `member-lints.toml`; skill links there. |
| `project.md:137` xtask body (mise row) | Stays: a code-generation task is a project-specific runner example, not a task every Cargo project has. |
| `project.md:140` mold flags | Stays: optional linker selection requires the target and linker installation; unconditional copying would change platform requirements. |
| `project.md:147` profiles | Moved to `Cargo.toml`; skill links there. |
| `performance.md:26` profile values | Replaced with a link to `Cargo.toml`. |
| `performance.md:33` native CPU flags | Stays: hardware-specific optimization is conditional on known deployment CPUs. |
| `wiring-mise-tasks/templates/rust.mise.toml:1` (mise row) | Retained outside this change's write scope as an explicitly unfinished wiring template with runtime and scope choices, jj hooks, and helper contracts; `mise.toml` here supplies the Cargo configuration baseline. |

The fixture `../tests/fixtures/cargo/expected.json` records expected files and
policy values. Its test applies to an empty temporary directory outside the
workspace, compares exact source bytes and parsed policy, and checks drift and
repair. It does not compile an application or install a Rust toolchain.
