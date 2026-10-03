# Environment & packaging (PG0) — the uv-era argument

> SOLE home of PG0: the uv project lifecycle, pyproject.toml anatomy, Python version policy,
> build/publish, single-file scripts, and the legacy-tool migration table. SKILL.md §PG0/§2
> carry the one-line deny-gate + the summary supersession table; this file argues each in full —
> with ONE declared exception: the `uv add` vs `uv pip install` silent-removal trap is argued in
> full at SKILL.md §PG0★ (it is the gate's own ★ elaboration); this file keeps only reminders.
> Library/framework SELECTION → `selection.md`; ruff/pytest/logging → `quality.md`.

## uv facts — pin, don't assume `[dated:2026-07]`

- Current stable: **uv 0.11.28** (2026-07-07); prior 0.11.27 (07-06), 0.11.26 (06-30) — patch
  releases land days (sometimes a day) apart. Do not hardcode this number as gospel in a project's CI: run
  `uv --version` / check `github.com/astral-sh/uv/releases` at write time. (One dotfiles host
  checked 2026-07-12 was already running 0.11.24, four patches behind — treat any installed uv
  as possibly stale, never as current-by-assumption.)
- uv is **pre-1.0** with an **inverted, custom versioning scheme**: minor bumps = breaking
  changes, patch bumps = features/fixes — the opposite of semver. `uv.lock`'s schema is treated
  as public API and only changes on minor releases.
  - **CI**: pin an exact patch (`uv==0.11.28`), never a floating range; read the changelog
    before a deliberate minor bump — "it's just a minor version" instincts from other tools are
    wrong here.
  - **Guard it in the project itself**:
    ```toml
    [tool.uv]
    required-version = ">=0.11.28"
    ```
    uv refuses to run against the project if the invoking binary doesn't satisfy this — catches
    a stale global install before it silently mis-resolves.

## Project lifecycle — the uv verb table `[dated:2026-07]`

| Command | Effect | Note |
|---|---|---|
| `uv init` | app layout by default: pyproject.toml (no `[build-system]`), `main.py`, `.python-version` | `--lib` → src-layout + `py.typed`; `--package` → installable app (src layout, build-system, entry points); `--bare` → pyproject.toml only; `--script` → PEP 723 file instead of a project |
| `uv add <pkg>` | installs, writes `project.dependencies` (or a group/extra), updates `uv.lock`, syncs `.venv` | `--dev` / `--group <name>` / `--optional <extra>` route it |
| `uv remove <pkg>` | inverse: strips the entry + any `[tool.uv.sources]` row, re-locks | — |
| `uv sync` | installs from `uv.lock` into `.venv`, **EXACT by default — prunes anything not in the lockfile** | THE silent-removal trap (full statement: SKILL.md §PG0★) — never `pip install` / `uv pip install` into a synced env and expect it to survive the next sync |
| `uv sync --frozen` | trust the lockfile, skip the freshness check | fast path, local dev |
| `uv sync --locked` | error out if the lockfile is stale vs pyproject.toml | **the CI verb** |
| `uv lock` / `uv lock --upgrade[-package]` | resolve deps → write/update `uv.lock` | uv **never** auto-upgrades on new releases; only this (or a fresh `uv add`) moves a pin forward |
| `uv run` | auto-creates/updates `.venv`, auto-syncs from `uv.lock` (regenerating the lock if pyproject.toml changed), then runs | `--no-sync` skips the freshness check |

`uv.lock` is universal/cross-platform — it resolves every supported Python-version × platform
marker combination, not just the local machine. TOML, technically readable, but uv-proprietary:
commit it for reproducibility, never hand-edit it, don't expect pip/poetry to read it.
**Library nuance**: committing the lockfile still helps dev reproducibility, but for a PUBLISHED
library the lock alone can mask broken `[project]` metadata — CI must ALSO exercise the declared
ranges (a lowest-bounds resolve and a latest resolve), not just the locked snapshot.

## pyproject.toml anatomy `[dated:2026-07]`

- **`[project]`** (PEP 621): name/version/dependencies/requires-python/scripts — the canonical
  metadata table; the spec now lives on the PyPA specs page, not the PEP text itself.
- **`[dependency-groups]`** (PEP 735): dev-only tooling groups (lint/test/docs), nestable via
  `{include-group = "name"}`. **`dev` is special** — `[tool.uv] default-groups` defaults to
  `["dev"]` (or `"all"`), so `uv run`/`uv sync` include it automatically; `--no-default-groups`
  opts out. Legacy bridge: a project still carrying `[tool.uv.dev-dependencies]` keeps writing
  there under `uv add --dev` (not force-migrated).
- **The publish/no-publish cut**: `[project.optional-dependencies]` ships in published metadata
  as installable extras (`pandas[plot]`) — for consumers. `[dependency-groups]` never publishes
  to PyPI — for contributors. Dev tooling belongs in a dependency-group, not an optional-extra.
- **`[tool.uv.sources]`**: non-PyPI dependency sources (git, path, workspace member). Run
  `uv build --no-sources` before publishing — it catches a source-dependent build that would
  break for a consumer on stock pip.
- **Workspaces**: root `[tool.uv.workspace] members = [glob, ...]` (+ `exclude`); one root + N
  member packages, any app or lib. **Single shared `uv.lock`** across the whole tree. Cross-
  member deps via `[tool.uv.sources] member = { workspace = true }` (auto-editable). Good fit:
  a monorepo of related packages sharing deps. Bad fit: members needing genuinely conflicting
  deps or fully separate venvs — use path deps instead.

## Python versions — never bare system python3 `[dated:2026-07]`

- **Floor policy — split by what you ship**. An APP / service / research code you deploy
  yourself: `">=3.13"` is the default (a branch fully in bugfix), `">=3.14"` fine for controlled
  deploys; `">=3.12"` the conservative floor. A PUBLIC LIBRARY: floor deliberately LOWER —
  `">=3.11"` or `">=3.12"` — because consumers and binary wheels lag; a library flooring on the
  newest Python halves its audience for no gain. Either way: 3.10 is months from EOL (2026-10);
  3.9 is already dead (EOL 2025-10-31). Free-threading (3.14t) floor policy → `selection.md`.
- `.python-version` = the default-version request for a directory tree — uv walks up parents,
  stopping at a project boundary. Write it with `uv python pin` (project-local) or
  `uv python pin --global` (user-level). `requires-python` in pyproject.toml is the resolver's
  compatibility *floor*, not the pin — the first compatible interpreter wins unless
  `.python-version`/`--python` overrides it.
- `uv python install` downloads managed CPython/PyPy builds — no system package manager, no
  compiler needed. Confirmed installable at this writing: 3.14.6, 3.15.0b3 (prerelease), and
  `+freethreaded` variants of both. Discovery order: managed installs → PATH → auto-download if
  nothing compatible is found (`--no-python-downloads` to disable).
- **NEVER target bare `python3` / the system interpreter.** Concrete, live failure mode: a Mac's
  `/usr/bin/python3` can be an already-EOL branch (3.9.6, dead since 2025-10-31) sitting on PATH
  ahead of anything uv manages. The first Python-touching action in a session runs through
  `uv run` / `uv python pin`, never a bare interpreter call.

## Build & publish `[dated:2026-07]`

- `uv init --package`/`--lib` defaults to the **`uv_build`** backend — **pure-Python only, no
  C-extension support.** A project that will ever need a compiled extension must declare
  `hatchling` / `maturin` / `scikit-build-core` up front via `uv init --build-backend <name>`;
  discovering the limitation *after* adding a C-extension dependency means re-scaffolding the
  build-system table. Pin it bounded: `requires = ["uv_build>=0.11.28,<0.12"]` — `uv_build`
  inherits uv's break-on-minor versioning policy.
- `uv build` (backend-agnostic — works with any PEP 517 backend declared in `[build-system]`)
  → `dist/`. `uv build --no-sources` pre-publish, see the pyproject anatomy note above.
- `uv publish` supports token / username+password / **PyPI Trusted Publishing (OIDC, no stored
  credentials)** from CI — prefer OIDC for any CI publish path.
- **Supply-chain floor**: `explicit = true` on every custom `[[tool.uv.index]]` (blocks
  cross-index leakage / dependency-confusion on package names that exist in both places); the
  lockfile's hashes are the integrity anchor — a claim of "latest on PyPI" is not; yanked
  releases resolve only when explicitly pinned, don't panic-unpin around one.
- **src-layout is the house default** for packaged code. The official Python Packaging Guide is
  explicitly neutral on src vs flat layout — this is a stated OPINION: src-layout forces
  install-before-run, which prevents accidentally importing stale/uninstalled code, and it's
  what `uv init --package` already emits. Flat layout stays fine for a single-file tool or a
  trivial internal script.

## Single-file scripts (PEP 723) `[dated:2026-07]`

```python
# /// script
# dependencies = [
#   "httpx",
#   "rich",
# ]
# requires-python = ">=3.12"
# ///
```

`uv run script.py` reads this block and builds an ephemeral env from just those deps —
**inside a project directory it still ignores the enclosing project's own dependencies by
design** (no `--no-project` needed; isolation, not a bug). `uv init --script foo.py` scaffolds
the block; `uv add --script foo.py <pkg>` edits it in place; `uv lock --script` pins it for
reproducibility. Authoring one of these that will be *kept* in a repo is this skill's territory;
*invoking* one ad hoc is `running-python-tools`'s.

## Migration table — status-honest, not "legacy = dead" `[dated:2026-07]`

| From | Verdict | To |
|---|---|---|
| pip install / requirements.txt | superseded as primary source of truth; **residual role**: `uv export -o requirements.txt` as a build ARTIFACT for Docker layer-caching / Lambda / legacy deploy tooling only — never hand-authored as the source of truth | pyproject.toml + uv.lock |
| poetry (2.x) | **PEP-621-compliant since 2.0** — `[project]` is now the respected metadata table; migrating an existing, working poetry project is a preference/speed call, not a standards-compliance one. Has not shipped PEP 751 (pylock.toml) support | new projects still default to uv |
| pipenv | actively maintained (PyPA), latest 2026.6.2 — do not call it dead; lost mindshare to uv, maintained-but-niche for new work | uv |
| conda | legitimate remaining niche: jointly resolving non-Python binaries + CUDA/cuDNN in one solver pass (conda-forge ships the full CUDA stack) | pixi — the modern, Rust-based face of the same niche: own lockfile, faster resolution, imports `environment.yml` |
| pyenv | superseded for the common case — uv downloads prebuilt binaries in seconds vs pyenv's from-source compile (3-5 min, frequent libssl/libffi build failures) | `uv python install` |
| tox | **not legacy** — still the right call for a *static* multi-Python/multi-dependency-version test matrix (INI, concise); `tox-uv` swaps the pip/virtualenv internals for uv | keep for the matrix case |
| nox | **not legacy** — reach for it over tox when matrix logic needs to be conditional/dynamic (a Python config file, not INI); ships a built-in uv backend | for the simple "run pytest across N Python versions" case, a plain `uv run --python X` loop covers it without either |
| pylock.toml (PEP 751) | **interchange/export format only** — `uv export --format pylock.toml` talks to non-uv tooling (pip, PDM) | `uv.lock` stays the working, primary lockfile for a uv-managed project — do not migrate off it |

## Gotchas `[dated:2026-07]`

- **`uv add` vs `uv pip install` — the #1 LLM/agent foot-gun.** Full statement + enforcement
  lives in SKILL.md §PG0★; one-line reminder here: `uv pip install` never touches
  pyproject.toml, so the next exact `uv sync` silently removes what it installed.
- **TLS verifier changed in v0.11** — switched to `rustls-platform-verifier` (delegates to
  system cert stores); `--native-tls` was renamed `--system-certs` (old flag still works,
  deprecated). Matters for corporate-MITM / self-signed cert chains that behaved differently on
  older uv.
- **`uv tool install` vs `uvx`** — persistent isolated PATH install vs ephemeral cached run.
  That decision table is `running-python-tools`'s territory, not this file's — one pointer,
  do not restate it.
- **`[tool.uv] required-version`** — see the facts header above; the mechanism that turns "which
  uv is this even" into a hard error instead of a silent mis-resolve.
- **Bootstrap**: uv itself often arrives out-of-band (standalone installer / a manual brew
  install nobody recorded) — on a fresh machine, verify `uv --version` exists and how it is
  provisioned before assuming it; flag a provisioning gap to the machine's owner rather than
  silently editing their package manifest as a side effect of unrelated Python work.
