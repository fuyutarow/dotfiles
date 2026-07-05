# Project setup, dependency hygiene & tooling (RG1)

> SOLE home of RG1 (dependency hygiene) plus the modern project scaffold: edition, workspace,
> lints, supply chain, build profiles, tooling. Crate/tool versions → `references/selection.md`.
> The governing rule: **a dependency is a liability paid at every build, audit, and MSRV bump** —
> so keep the set minimal, the features trimmed, and the hygiene machine-checked, not eyeballed.

## Edition 2024 — the baseline for new work `[dated:2026-07]`

`edition = "2024"` (stable in **Rust 1.85.0, 2025-02-20**) is the default for new crates. Adopting
it also opts into the **MSRV-aware resolver v3** (`resolver = "3"`, implied by the edition), which
prefers dependency versions compatible with your `rust-version`. Notable edition-2024 behavior a
model must account for:

- `unsafe_op_in_unsafe_fn` is warn-by-default — an `unsafe fn` body must wrap its unsafe ops in
  explicit `unsafe { }`. (SOLE home of the edition-2024 unsafe rules; the `// SAFETY:`-comment
  discipline itself is ownership.md's.)
- `unsafe extern "C"` blocks and some attributes (`unsafe(no_mangle)`, `unsafe(link_section)`) now
  take an `unsafe(...)` marker.
- Tighter RPIT lifetime capture, `gen`/`async` reserved, `Box<dyn Future>` temporary-scope changes.
  When migrating, run `cargo fix --edition` and read its report — don't hand-migrate blind.

Set `rust-version = "1.NN"` (your real MSRV) so resolver v3 and `cargo` can honor it; a leaf app
that always runs on the latest stable can omit it.

## Dependency hygiene (RG1) — the machine-checked floor

- **No declared-but-unused deps.** `cargo machete` flags them (fast, heuristic). Treat hits as
  *candidates*, not deletions — verify each: a dep used only via a macro, a `cfg`-gated path, a
  build script, a feature, or a re-export is a false positive. `cargo +nightly udeps` is more
  precise (compiles, needs nightly). Delete the last use of a dep and remove it in the *same commit*.
- **Trim features.** Many crates pull heavy transitive trees through default features. Set
  `default-features = false` and enable only what you use (`features = ["derive"]` for clap,
  `features = ["toml"]` for config, etc.) — this is where most "why is my build 400 crates" comes from.
- **Inherit versions in a workspace.** Declare each dependency once in the root
  `[workspace.dependencies]` (since Rust 1.64) and reference it per-member with `dep.workspace =
  true`. One version, one update point — no per-member drift.

## Lints — in `Cargo.toml`, not `RUSTFLAGS` `[dated:2026-07]`

Since **Rust 1.74** lints are configured in a `[lints]` / `[workspace.lints]` table, **not** via
`RUSTFLAGS="-D warnings"` or `#![deny(...)]` inner attributes (which don't compose across a workspace):

```toml
# root Cargo.toml
[workspace.lints.clippy]
all = { level = "deny", priority = -1 }   # priority -1 so specific lines can override the group
unwrap_used = "warn"                        # RG3: forbid unwrap on fallible library paths
expect_used = "warn"
# cherry-pick a few pedantic lints you actually want — do NOT blanket-enable pedantic/nursery
```

```toml
# each member Cargo.toml
[lints]
workspace = true
```

Strategy: **`clippy::all` denied + a handful of cherry-picked `pedantic` lints**. Do **not**
workspace-wide `clippy::pedantic`/`clippy::nursery` — they're noisy and churn across toolchains.
For a **library**, add `unwrap_used`/`expect_used` (RG3 — no panicking on fallible paths). The
`priority = -1` on the group is required so a specific `#[allow]`/override wins over the group.

## Supply chain — `cargo deny` as the CI gate

- **`cargo deny check`** is the primary gate: advisories (RUSTSEC) **+ licenses + banned crates +
  duplicate versions + source allow-lists** in one `deny.toml`. Since `cargo-deny` 0.18 it **denies
  all advisories by default** and removed the old per-type keys (`vulnerability =`, `unsound =`) —
  an old `deny.toml` will error; migrate it. MSRV 1.85.
- **`cargo audit`** is a lighter, advisory-only scan (`cargo audit fix` can bump); it's
  reduced-maintenance but still ships. Prefer `cargo deny` for a real gate.
- **Neither is safe to run on an untrusted repo** — both execute crate build/proc-macro code during
  resolution.

## Testing & build tooling → crate table in `references/selection.md`

- **`cargo nextest run`** — fast parallel runner, better output. **It cannot run doctests** — CI must
  also run `cargo test --doc` (a silent coverage gap otherwise).
- **`clippy` + `cargo fmt`** in CI (fmt is not negotiable — zero-config uniformity).
- **Large workspaces (~20+ crates)**: `cargo hakari` builds a `workspace-hack` crate that unifies
  feature selection so members share compiled deps (big build-time win). Let `hakari generate` + a
  CI `--check` own the hack crate; never hand-edit it. Skip it under ~20 crates.
- **Repo dev tasks** ("build the release, run the migration, regen the fixtures"): the Rust-native
  pattern is **`xtask`** (a `cargo xtask <task>` binary in the workspace — no extra toolchain).
  `just` / `cargo-make` / `mise` are fine alternatives when the team already uses one; pick the
  project's existing runner rather than adding a second.
- **Faster linker for dev iteration** (build speed, NOT runtime speed): the default GNU `ld` dominates
  incremental link time once LTO is on. Switch to `lld` or **`mold`** (10×+ link speedup) via
  `.cargo/config.toml` `[target.*] rustflags = ["-C", "link-arg=-fuse-ld=mold"]`. This speeds the
  edit→build→measure loop; it does not change the shipped binary's speed (that is
  `references/performance.md`).

## `[profile.release]` — build tuning

```toml
[profile.release]
lto = "thin"          # "thin" = most of the win, fast; lto = true (fat) for max, slower build
codegen-units = 1     # slower compile, faster/smaller binary — for shipped release artifacts
strip = true          # strip symbols (since Rust 1.59) — smaller binary
# panic = "abort"     # ONLY if you own the whole binary and never rely on unwinding/catch_unwind

[profile.profiling]   # a release build that keeps debuginfo, for samply/flamegraph
inherits = "release"
debug = "line-tables-only"
```

- `lto`/`codegen-units = 1` trade build time for runtime — worth it for shipped artifacts, skip for
  dev. `panic = "abort"` shrinks the binary and drops unwind tables but **breaks `catch_unwind`** and
  any dependency relying on unwinding — only when you own the whole binary. Profile the *profiling*
  profile (debuginfo), never the debug build (`references/performance.md`).
