# Recipes — per-language verb bodies, provenance, and rulings

> **Snapshot**: 2026-07-17 (tool versions of record: mise 2026.7.5 · bun 1.3.14 · biome 2.5.3).
> **Scope**: WHAT command each verb runs per language, WHY (provenance per cell), and the house
> RULINGS where the owner skill and the corpus disagree. The verb contract, grammar, and gate are
> owned by `SKILL.md` — never re-argued here. Tool CHOICE per language is owned by the
> `writing-<lang>` skills and `compiling-latex` — cells cite them; a cell is never a licence to
> skip the owner when the language question itself is in play.
> Fast-moving tool facts live ONLY in this dated file — a tool version or flag in SKILL.md is a bug.

## §0 Provenance grades (per cell, assigned at harvest 2026-07-17)

| Grade | Meaning |
|---|---|
| **skill-endorsed** | the owner `writing-<lang>` skill states the command/flag |
| **corpus-observed** | converged practice in ≥2 of the 5 house repos (beateater · correo · qoed · xoria · dotfiles) |
| **probe-verified** | flag semantics confirmed live via `--help` at snapshot date |
| **synthesized** | no precedent existed; constructed from probes — lowest grade, re-verify on first real use |
| **ruling** | house decision where sources conflict — engineered, not measured |

## §1 Julia

| Verb | Body | Grade |
|---|---|---|
| setup | `julia --project=. -e 'import Pkg; Pkg.instantiate(); Pkg.precompile()'` | skill-endorsed (writing-julia references/setup.md verbatim) |
| fmt | `julia --project=. -m Runic --inplace .` | corpus-observed ×3 (tool = skill-endorsed, exact CLI corpus-only) |
| fmt:check | `julia --project=. -m Runic --check .` | corpus-observed ×3 |
| lint | see RULING below | — |
| test | `julia --project=. -e 'using Pkg; Pkg.test()'` | corpus-observed (beateater); see RULING |
| up | `julia --project=. -e 'using Pkg; Pkg.update()'` | corpus-observed ×2 (beateater copied qoed verbatim; skill silent) |

**RULING — lint has two declared tiers.** writing-julia's JG2/JG3 demand Aqua `test_all` +
ExplicitImports + JET as three distinct artifacts; qoed implements all three (`lint:aqua` /
`lint:imports` / `lint:jet`). beateater/xoria instead alias `lint` → `fmt:check` and say so in the
task description (「JET/Aqua等の追加は依存最小方針により見送り」). Both are legal states:
**starter** (fmt:check reuse, deferral WRITTEN in the description) for pre-package exploratory
repos; **full** (the three dedicated tasks) once `src/` is a real package. A silent starter — no
written deferral — is drift, not a tier.

**RULING — test's token must resolve even when the suite is blocked.** Three observed shapes:
plain `Pkg.test()` (beateater, the default); direct smoke script (xoria's
`julia --project=poc poc/test/smoke.jl`, legal for poc-shaped repos); blocked-with-pointer (qoed:
body prints the focused `test:*` menu and `exit 2`). The qoed shape is the sanctioned way to
retire an expensive suite: the TOKEN stays resolvable, the body becomes a signpost. Deleting the
task instead is a contract violation the gate will catch.

## §2 Rust

| Verb | Body | Grade |
|---|---|---|
| setup | *(deliberately none — waive it)* | corpus-observed (correo header: cargo/rustup は mise 管理外) |
| fmt | `cargo fmt --all` | skill-endorsed ("fmt is not negotiable") + corpus |
| fmt:check | `cargo fmt --all -- --check` | skill-endorsed + corpus |
| lint | `cargo clippy --all-targets --all-features -- -D warnings` | corpus-observed (correo); see RULING |
| test | `cargo test` | corpus-observed (correo); see RULING |
| up | `command -v cargo-upgrade \|\| cargo install cargo-edit; cargo upgrade --incompatible allow; cargo update` | corpus-observed (correo; skill silent — cargo standard `update` moves only Cargo.lock, cargo-edit moves the Cargo.toml requirements) |

**RULING — clippy denial location.** writing-rust prefers `[workspace.lints.clippy]` in
Cargo.toml (CLI/env denial "doesn't compose across a workspace"). The task keeps `-D warnings`
until the repo adopts the table; on adoption, drop the flag from the task in the same edit —
carrying both is redundancy, not safety.

**RULING — test runner.** Corpus default is plain `cargo test` (runs doctests itself). Upgrading
to `cargo nextest run` REQUIRES the companion `cargo test --doc` in the same task — nextest skips
doctests, a silent coverage gap (writing-rust, verbatim warning).

**RULING — mise vs xtask.** writing-rust's project reference names `xtask` "the Rust-native
pattern" for repo dev tasks, with mise as one alternative. House repos standardize on mise — the
muscle-memory contract is cross-language and xtask cannot serve non-Rust cells. An xtask binary
remains legitimate INSIDE a task body (`run = "cargo xtask codegen"`) for Rust-heavy automation;
the contract verbs still resolve via mise. Reciprocal note landed in writing-rust (same commit).

## §3 Python (uv-managed project)

| Verb | Body | Grade |
|---|---|---|
| setup | `uv sync` (CI: `uv sync --locked`) | skill-endorsed (writing-python §uv table) + probe-verified |
| fmt | `uv run ruff format` | skill-endorsed (the "highest-leverage single action" line) |
| fmt:check | `uv run ruff format --check` | skill-endorsed + probe-verified (`--check` = report-only exit 1) |
| lint | `uv run ruff check` | skill-endorsed ("no --fix in CI") |
| test | `uv run pytest` | skill-endorsed (PG4) + corpus (beateater oracle:test shape) |
| up | `uv lock --upgrade && uv sync` | skill-endorsed ("only `uv lock --upgrade` moves it") + probe-verified; two-step is inherent — lock moves pins, sync materializes |

Boundary condition (qoed precedent): a NON-uv-managed `scripts/` dir in a Julia-primary repo may
run bare `ruff` installed via brew — writing-python's `uv run` prefix rule is scoped to genuinely
uv-managed projects (no pyproject.toml/uv.lock → nothing to pin against). Declare which side the
repo is on in the task description.

## §4 TypeScript / JS (bun-managed)

| Verb | Body | Grade |
|---|---|---|
| setup | `bun install --frozen-lockfile` | corpus-observed (qoed) + probe-verified |
| fmt | `bunx biome format --write .` | corpus-observed (qoed shape) |
| fmt:check | `bunx biome format .` | probe-verified (no `--write` = report-only, dotfiles shape) |
| lint | `bunx biome lint .` | corpus-observed (qoed lint:json) |
| test | `bun test` | corpus-observed (dotfiles test:hooks) + probe-verified |
| up | `bun update` | **synthesized** — zero corpus precedent; probe: respects package.json semver ranges, rewrites bun.lock; `--latest` jumps ranges; `bun outdated` is the read-only companion. Re-grade on first real use |

**RULING — fmt/lint separation.** `biome check` (formatter+linter+import-sort in one) is
deliberately NOT the house shape — fmt and lint stay separate tasks, same split as ruff and rumdl
(qoed lint:json description states this). **RULING — config home.** Committed `biome.json` is the
preferred home (qoed); CLI-flag pinning (`--indent-style=space --indent-width=2`, dotfiles) is the
fallback for config-averse repos. One repo picks ONE — both at once guarantees drift.

## §4b Markdown — the cross-cutting cell (every repo)

| Verb | Body | Grade |
|---|---|---|
| fmt:md | `rumdl fmt` (config = `.rumdl.toml`) | corpus-observed ×4 (beateater · qoed · xoria · dotfiles — the one cell every repo shares) |
| lint:md | `rumdl check` | corpus-observed ×4; structural-defects-only configs keep the gate green at adoption |

No owner skill exists for Markdown tooling — the corpus convergence IS the authority here;
`.rumdl.toml` scoping (exclude machine-owned/sealed docs) is per-repo judgment.

## §5 TeX — defer to `compiling-latex`

TeX leaf tasks are owned wholesale by `compiling-latex` (its `assets/mise-latex.toml` template:
`latex:setup` / `latex:fmt` / `latex:fmt:check` / `latex:lint` / `latex` / `latex:check` /
`latex:clean` / `latex:distclean`). Repo-level wiring of `latex:check` into `check` follows
SKILL.md's TeX line — leaf graph theirs, repo verb ours.

## §6 Polyglot composition (qoed exemplar)

1. `fmt` and `lint` are depends-only aggregates; their language bodies live in `<verb>:<lang>`
   subtasks. `setup`/`test`/`up` may carry the PRIMARY language's body directly (qoed's own
   `setup` does: depends on `setup:tools` AND instantiates Julia) — secondary ecosystems get
   `<verb>:<lang>` siblings rather than one task mutating three lockfiles blind.
2. Gate-adoption rule: SKILL.md grammar rule 3. The polyglot-specific fact: qoed's `check`
   aggregates 34 tasks and its blocked `test` is NOT among them — the aggregate substitutes the
   focused `test:bounds`/`test:provenance`.
3. Cross-cutting hygiene gates keep single clean names (`banned`, `records`, `claims`, `taxonomy`)
   — reserved namespace, per the grammar (SKILL.md).

## §7 Known corpus deviations left standing (2026-07-17)

Recorded so an audit doesn't re-discover them as news; fixing them is repo work, not skill work:

- dotfiles: HARD misses `fmt:check`/`test`/`check`; 5 hyphen-separator names (`link-dots`,
  `check-tools`, `cc:install-mcp`, `lint:skills-index`, `wsl:fix-gitexe`). Oldest mise.toml in the
  house — predates the grammar.
- xoria: missing `up`/`u` — the 2026-07-17 incident (`m up` → no task found) that forged this skill.
- correo: no aliases beyond `f`; no `setup` (waivable by design).
- qoed: aliases `l`/`t`/`c` missing; harness/ Rust crate has no clippy/test task (gap vs both
  writing-rust RG2/RG3 and correo's quartet).
