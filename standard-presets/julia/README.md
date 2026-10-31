# Julia package configuration skeleton

Apply from dotfiles with `mise run preset -- apply julia --to <repo>`.
Compare with `mise run preset -- diff julia --to <repo>`.

This is a configuration skeleton, not a generated Julia package. Before running
Julia tasks, obtain a real package identity with `Pkg.generate`, reconcile the
parent and test project names/UUIDs, and provide the source and tests. The UUID
placeholder is deliberate; it must never be used as a package identity.

The default joint workspace includes the existing test project. Add docs and
benchmark projects only when needed, then use the expanded workspace declaration
shown in `Project.toml`. The workspace sets the Julia compatibility floor to 1.12;
reusable libraries choose the lowest line actually tested, and application or
research environments match their pinned runtime. A library supporting 1.11 must
use isolated tests instead of this workspace layout.

`mise-tasks.toml` is copied unchanged from
`agents/skills/wiring-mise-tasks/templates/julia.mise.toml` and installed as
`mise.toml`. It is a task fragment: select and pin the tools it invokes in
`[tools]`, provision Runic in the selected Julia environment, and provide the
`fmt-staged`, `mise-contract`, and jj helper commands before invoking their tasks.
Notebook repositories use the separate notebook recipe in that skill.
The original template remains until the preset-mise ticket replaces it with a
reference; this copy is intentional during the migration.

Runic has no formatter settings file. Its format and check commands live in the
mise tasks; no JuliaFormatter configuration is introduced.
