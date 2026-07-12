---
name: writing-python
description: >-
  Write MODERN (2026) Python — uv owns env/deps, ruff owns lint+format, typed surfaces,
  pydantic v2 at boundaries; SELECTION is the spine incl. research/ML (hydra→typed config,
  wandb, jaxtyping, marimo). Use when writing/reviewing Python, setting up a project/env
  (pyproject.toml), or choosing a library — Python 環境構築 / ライブラリ選定 / 実験管理 /
  依存関係 / 型ヒント / 仮想環境. Trigger on: pip install, venv, poetry, conda,
  requirements.txt, uv, ruff, pydantic, mypy/pyright/ty, pytest, FastAPI, httpx, polars,
  hydra. Cuts: run a tool NOW / one-off uvx・uv run → running-python-tools (code LIVING in
  a repo → HERE); feature/bugfix → implementing-and-debugging (co-fire FIRST); restructure →
  refactoring-code (governs; this supplies the oracle); PyO3/maturin FROM Rust →
  writing-rust; prose → linting-prose. MANDATORY — read BEFORE writing ANY Python or adding
  ANY dependency. Facts ROT — verify live (PG1). Workflow-native: harvest/verification fan
  out; SELECTION stays SOLO. English skill; respond in the user's language (default
  Japanese).
paths: "**/*.py"
---

# Writing Python — modern environment, selection & coding discipline

> **Version**: v2607.1.0 (2026-07-12) — spine (uv/ruff/pydantic) verified live against
>   PyPI/official docs `[dated:2026-07]`.
> **Scope**: environment/packaging discipline + library selection + typing/validation/quality
>   gates for Python that **lives in a repo** (project, module, kept script); host-agnostic.
> **Out of scope**: invoking a Python-based CLI tool ad hoc (`uvx`, one-off `uv run`) →
>   `running-python-tools`; teaching Python syntax to someone who doesn't know it; a deep
>   per-library API reference (`references/selection.md` is a lookup, not a tutorial).
> **Build verify** (atomic — all ship in one commit):
>   `for f in environment selection typing validation quality idioms research; do test -f references/$f.md || echo MISSING $f; done; for t in trigger-set forge-verification-ledger; do test -f tests/$t.md || echo MISSING $t; done`
> **Staleness registry** — `grep -rn '\[dated:' agents/skills/writing-python/` and re-verify
>   anything older than ~2 quarters: the spine versions (uv/ruff/pydantic, §1 below) · the
>   type-checker verdict (`typing.md` — ty's beta status, pyrefly, pyright) · the httpx
>   release-stall caveat · the loguru maintenance-stall caveat · `whenever`'s beta status ·
>   the free-threading phase (`selection.md`) · poetry/pipenv/conda status
>   (`environment.md` — Migration table) · the pandas/pyarrow relationship · the research layer
>   (`research.md`): hydra maintenance/instantiate-blocklist state, Neptune shutdown / Aim
>   stall, marimo-under-CoreWeave, the seaborn release-freeze, the torch CUDA-backend list,
>   the 3.14 forkserver default. Mechanical floor =
>   `forging-skills/scripts/skill-check.sh` (shared; this skill ships no `scripts/`).

## THE LAW

> In modern Python the toolchain is the language: environments and dependencies flow
> through uv against pyproject.toml + uv.lock, lint and format through ruff, every public
> surface is typed, and external data crosses a validating model exactly once at the
> boundary. Most of a project's effectiveness is decided by SELECTION — interpreter
> version, stack, every dependency — before a line is written. And library facts ROT: a
> recommendation not checked against live PyPI/docs today is a guess, not knowledge.
> Precedence: **uv before any other env tool · modern default before famous legacy ·
> stdlib before a dep that merely duplicates it · typed before dynamic · aware before
> naive · validated boundary before trusted dict · verified before recommended.**

## The gates — PG0–PG4, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **PG0 ENVIRONMENT** (deny-gate, fires on ENTRY) ★ | Every env/dependency action is a **uv subcommand** against `pyproject.toml` + `uv.lock`. FORBIDDEN in new/owned work: `pip install` (and `uv pip install` inside a uv-managed project — silent-removal trap), `python -m venv` + activate rituals, poetry/pipenv/conda for NEW projects' Python-dependency management (conda/pixi's native-toolchain niche — CUDA toolkit, MPI, GDAL-class binaries — is `research.md` §2's declared exception), hand-authored `requirements.txt` as a source of truth (uv-export artifact only), `setup.py` for pure-Python builds, bare `python3`/system interpreter (system interpreters are routinely EOL — a 2026 Mac still ships 3.9.6, dead since 2025-10). | `pyproject.toml` (PEP 621) + committed `uv.lock`; every env command in the transcript is a `uv` subcommand. |
| **PG1 SELECTION** | Every NEW dependency passes the selection consult (`references/selection.md`) AND a live PyPI/docs check — facts ROT. Lightest fit wins; stdlib when it genuinely suffices; famous ≠ current (`requests` is feature-frozen by its own maintainers). | One-line rationale per added dep, naming its selection-table row or the live check performed. |
| **PG2 TYPES** | Public surfaces carry modern hints (`X \| None`, `list[int]`, PEP 695 on ≥3.12); a type checker is configured and clean per the DATED verdict in `references/typing.md`; "typed" without a checker run is a claim, not a fact. | Checker run output, or the scoped strict-rollout plan (`typeCheckingMode: strict` on a named path glob). |
| **PG3 BOUNDARY** | External data (API/config/file/CLI/LLM output) is validated into a pydantic v2 model (or the declared lighter tool per `references/validation.md`) EXACTLY ONCE at the boundary; internals are `dataclass(slots=True)`/plain typed objects; no raw-dict threading; no pydantic v1 idioms. | The model at the seam + grep-clean: no `@validator(` / `.dict()` / `class Config:` in any file importing pydantic. |
| **PG4 QUALITY** | `ruff check` (house strict `select`, `references/quality.md`) + `ruff format --check` clean; tests are pytest (new suites — an existing `unittest`/Django suite keeps its local style); datetimes are aware (`DTZ`); operational output goes through `logging`, `print` is CLI-user-facing only. | Clean `ruff`/`pytest` run output. |

### ★ PG0 fires on ENTRY — an env command is never "just this once"

The **first** Python-touching action in a session runs through PG0 — there is no "quick pip
install, I'll fix it later." The #1 trap, verbatim: **`uv pip install X` inside a
uv-managed project does not touch `pyproject.toml`**, so the next `uv sync` / `uv run`
performs its default **exact** sync against `uv.lock` and **silently removes X** — the
package "worked" for one session and then vanished with no error. The correct verb for
"this belongs to my project" is **`uv add`**, never `uv pip install`. Treat any bare `pip`
invocation, any manual `venv`/activate step, and any hand-edited `requirements.txt` as a
PG0 violation the moment they appear in a transcript touching an owned project — not a
style nit to clean up afterward.

## Routing — sibling cuts (reciprocal)

| Sibling | Cut |
|---|---|
| `running-python-tools` | PURPOSE cut (canonical phrasing OWNED HERE, mirrored there): "Writing/reviewing Python that will **LIVE in a repo** (project, module, kept script) → HERE. Invoking a Python-based tool or one-off snippet **NOW** (`uvx ruff`, `uv run --with pypdf`, `yt-dlp`, `jupyter`) → `running-python-tools`." PEP 723 single-file scripts: **authoring** the script → here; **invoking** it → there. Seam note: the two descriptions agree in substance — do not diff for byte-identity. |
| `implementing-and-debugging` | Co-fire with ORDER on any non-trivial Python feature/bugfix — its change-safety gates run FIRST; this skill owns what correct Python looks like inside that frame (PG0–PG4). |
| `refactoring-code` | Co-fire on behavior-preserving restructure — it governs (two hats / oracle); this supplies the Python oracle (ruff + type checker + pytest green bracket) and Python-safe transforms. |
| `writing-rust` | PyO3/maturin/FFI **as a Rust architecture decision** → there; the Python-side packaging/typing of the same project → here; running `maturin` itself → `running-python-tools`. |
| `writing-julia` | `PythonCall`/`SymPyPythonCall` called FROM Julia → there (a Julia dependency-architecture decision), even though the payload is Python. |
| `linting-prose` / `structuring-documents` | README/docs prose ABOUT a Python project → there. |
| `raising-resolution` | Silent sub-step: inspect the actual environment (`uv --version`, `uv python list`, the real `pyproject.toml`) before asserting an environment fact — never recall one from training. |

## MUST NOT FIRE

Ecosystem questions with no code to write ("what is the GIL", licensing, Python history) —
plain answer, no gate applies. "Run/download/convert X with tool Y" where Python is only
the tool's implementation language (`yt-dlp`, a one-off `uvx`/`uv run --with` snippet) →
`running-python-tools`. Rust/Julia FFI **design** decisions (PyO3 boundary shape,
`PythonCall` architecture) → their owning skill, not here. Prose about a Python project
(README, paper text) → `linting-prose`. The full near-miss set is `tests/trigger-set.md` —
desk-check it after any description edit.

---

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/environment.md` | PG0 home — uv project lifecycle, pyproject.toml anatomy, Python-version policy, build/publish, PEP 723 scripts, the poetry/pipenv/conda/pyenv migration table, uv sharp edges | setting up / auditing a project's env, deps, or lockfile; migrating off pip/poetry/conda |
| `references/selection.md` | **THE SPINE** — per-domain default library + the switch condition (HTTP, web, CLI, testing, logging, dataframes, serialization, datetime, DB, async, free-threading, config, retry, cloud SDKs) | choosing which library to add for any task (PG1); auditing a dependency list |
| `references/typing.md` | PG2 home — the DATED type-checker verdict (pyright/pyrefly/mypy/ty), strict-rollout strategy, PEP 585/604/695 syntax, Protocol vs ABC, TypedDict vs BaseModel, `dataclass(slots=True)` gotchas | choosing/configuring a type checker; typing a public surface; a strict-mode error flood |
| `references/validation.md` | PG3 home — the boundary-validation cut, the decision table (API/env/LLM-output/internal), pydantic v2 usage floor, the v1→v2 kill table + grep gate | validating external data; auditing pydantic v1 idioms; deciding pydantic vs dataclass vs attrs vs msgspec |
| `references/quality.md` | PG4 home — ruff facts + the house strict config, CI vs pre-commit wiring, pytest discipline, logging discipline | configuring/auditing ruff or pytest; setting up CI lint/format checks; a logging design question |
| `references/idioms.md` | The full argued LLM-failure kill list (18 anti-patterns + research addenda, WRONG→RIGHT→why→enforcement) — the detailed version of §1(b) below | reviewing Python for stale idioms; explaining WHY a pattern is wrong, not just that it is |
| `references/research.md` | The RESEARCH/ML layer — experiment config (the hydra verdict + the `instantiate()` security rule), uv+CUDA/torch indexes, jaxtyping/beartype + dataframe contracts, the reproducibility chain, experiment tracking (wandb/mlflow; Neptune/Aim status), notebooks (marimo/jupytext), scientific viz, profiling/acceleration/parallelism ladders | any experiment/ML/scientific-code decision: config, GPU env, tensor validation, tracking, seeding, notebooks, figures, profiling |

---

## §1 The modern default stack — supersession table

`[dated:2026-07]` — re-verify per the staleness registry above before trusting a row.

**a) Domain → 2026 default** (summary seam — detail and runner-ups live in `selection.md`,
research/ML rows in `research.md`; sync deliberately, do not diff for byte-identity):

| Domain | 2026 default | Reach past it when |
|---|---|---|
| Env + deps + Python versions | uv | — |
| Lint + format | ruff | — |
| Types | pyright strict (or basedpyright) | see `typing.md` for the dated verdict + the ty caveat |
| Boundary validation | pydantic v2 (+ pydantic-settings for config) | — |
| Internal data | `dataclass(slots=True)` | validators/converters wanted → attrs (`validation.md`) |
| Tests | pytest | — |
| HTTP | httpx | release-stall caveat — see `selection.md` |
| CLI | typer | complex typed params (unions/literals/pydantic) → cyclopts |
| Dataframes | polars (new code) | interactive/Jupyter + ecosystem glue → pandas |
| Logging | structlog (apps) / stdlib `logging` (libraries) | — |
| Datetime | stdlib `datetime` + `zoneinfo`, ALWAYS aware | — (`whenever` is a pre-1.0 beta upgrade to watch, not yet default) |
| Serialization | stdlib `json` (below ~1MB / one-offs) | size/schema pressure → `msgspec`/`orjson` |
| Async | stdlib `asyncio` + `TaskGroup` (3.11+) | cancel scopes / structured concurrency → `anyio`/`trio` (async only when concurrency is real — boring sync is simpler) |
| Retry | tenacity | — |
| Experiment config | typed config-as-code (dataclass/pydantic schema + tyro CLI) | staying in a hydra ecosystem → hydra-zen; NEVER `instantiate()` untrusted `_target_` — `research.md` §1 |
| Experiment tracking | wandb (academic) / mlflow (self-hosted) | Neptune is shutting down, Aim stalled — `research.md` §5 |
| Tensor shape checks | jaxtyping + beartype (`@jaxtyped`) | dataframe contracts: three-way split — `research.md` §3 |
| Model weights | safetensors — never pickle across a trust boundary | arrays/tabular → npz/parquet (`research.md` §4) |
| Notebooks | marimo (new solo/small-team) | non-Python kernels / JupyterHub / `.ipynb` estates → jupyter + jupytext pairing |
| Publication figures | matplotlib | ggplot2-native team → plotnine; dashboards → plotly/Dash (`research.md` §7) |
| Profiling | the ladder: cProfile → py-spy/scalene → line_profiler | memory → memray (Linux/macOS only) — `research.md` §8 |

**b) Legacy → modern kill table** (top LLM anti-patterns; full argued version is
`references/idioms.md` — that file argues each row, this is the summary seam, sync
deliberately, do not diff for byte-identity):

| Legacy pattern | Modern replacement | Enforcement |
|---|---|---|
| `pip install` / hand-authored `requirements.txt` | `uv add` + committed `uv.lock` | PG0 |
| `python -m venv` + activate ritual | `uv run` (auto-creates/syncs the venv) | PG0 |
| `setup.py`/`setup.cfg` for a pure-Python build | `pyproject.toml [project]` (PEP 621) | PG0 |
| `os.path` string-joining | `pathlib.Path` | `PTH1xx` |
| `typing.List`/`Optional[X]`/`Union[X,Y]` | `list[int]` / `X \| None` | `UP006`/`UP007` |
| `%`-formatting / `.format()` | f-strings (except lazy `%s` args **inside logging calls**) | — |
| naive `datetime.now()` / `datetime.utcnow()` | `datetime.now(UTC)` | `DTZ` |
| bare `except:` / `except Exception: pass` | narrow catch, or `contextlib.suppress(...)` + `logging.exception` | `E722`/`BLE001`/`S110`/`SIM105`/`TRY400` |
| mutable default args (`def f(x=[])`) | default `None`, materialize inside the body | — |
| `unittest.TestCase` boilerplate | plain pytest functions + fixtures | — |
| `json.loads()` into untyped dicts threaded around | pydantic model, once at the boundary | PG3 |
| `requests` reflex (incl. blocking inside `async def`) | httpx | `ASYNC1xx` |
| `time.sleep()` hand-rolled retry loop | `tenacity.@retry` | — |
| `__init__.py` cargo-cult in every directory | only for exports/init code (PEP 420 namespace packages work without it) | — |
| `# -*- coding: utf-8 -*-` / bare `python` shebang | delete the coding comment; `#!/usr/bin/env python3` or an entry point | — |
| `print()` debugging left in library/app code | `logging.getLogger(__name__)` | `T20` (opt-in group — see `quality.md` §2) |
| module-global / `global`-mutating singleton getters | explicit dependency passing | — |
| stateless class ceremony (no real state) | functions + a typed data object | OPINION-grounded-in-consensus |
| `pytz` / hand-rolled UTC offsets | `zoneinfo.ZoneInfo` (+ `tzdata` dep where needed) | — |
| global `np.random.seed()` / bare `np.random.*` | `rng = np.random.default_rng(seed)` passed explicitly | `NPY002` |
| pickle/`torch.load` across a trust boundary | safetensors / npz / parquet | `S301` |
| `httpx.get()`/`requests.get()` with no timeout or client lifecycle | injected `httpx.Client(timeout=…)`, closed properly | — |
| `import japanize_matplotlib` (dead, breaks on 3.12+) | `matplotlib-fontja` | — |

The highest-leverage single action: **`uv run ruff check --fix && uv run ruff format`**
(project-pinned ruff; `uvx ruff …` only OUTSIDE a project — uvx runs the latest ruff, which
drifts against a repo's pinned rules) auto-kills several rows above — run it before claiming
ANY row in this table is satisfied.

## §2 Environment discipline (inline core)

The uv command decision table (argued in full in `references/environment.md`):

| Command | Use for |
|---|---|
| `uv init` / `--lib` / `--package` / `--script` | new project (app default) / packaged library (src-layout + `py.typed`) / installable package / PEP 723 single-file script |
| `uv add <pkg>` [`--dev`/`--group <name>`] · `uv remove <pkg>` | add/remove a dependency — writes `pyproject.toml` + `uv.lock`, syncs the env |
| `uv sync` [`--locked` in CI] | install from `uv.lock` into `.venv` — **exact by default** (prunes anything out-of-band) |
| `uv lock` [`--upgrade[-package]`] | resolve/refresh `uv.lock` — the ONLY thing that moves version pins forward |
| `uv run <cmd>` | the default entrypoint — auto-creates/syncs the venv, then runs |
| `uv python pin` (writes `.python-version`) | pin the project's interpreter |
| `uv build` / `uv publish` | build sdist+wheel / upload — pointer only, detail in `environment.md` |

New-project floor: `requires-python = ">=3.12"` default, `">=3.13"` preferred on
greenfield; **never** the bare system `python3`. `uv.lock` is committed; it never
self-upgrades (only `uv lock --upgrade` moves it). A kept single-file script carries a PEP
723 header (`# /// script … ///`), run via `uv run script.py`. Everything argued in full →
`references/environment.md`.

## Execution model

Evidence type: **CITATION-RELAY** — landscape/version facts are
fetchable observables; a worker relays `{claim, source URL, date, verbatim line}`, and a
relayed verdict without its observable is quarantined, not trusted. Fan-out candidates:
selection-landscape harvest, per-claim refutation, live version checks. Stays SOLO: the
SELECTION decision, gate adjudication, anything that edits the project. No harness → same
map, run as serial passes instead of parallel fan-out. Lineage: durable operating guidance
from a frontier model (Fable 5, 2026-07) — *if a constraint here feels unnecessary, that
feeling is the failure mode — follow the map*.

## Checklist before submitting Python

Environment & selection (PG0/PG1 — `references/environment.md`, `references/selection.md`):
- [ ] Every env/dependency action was a `uv` subcommand — no `pip install`, no `uv pip install` inside a managed project, no manual venv-activate
- [ ] `pyproject.toml` (PEP 621) + committed `uv.lock` exist; no hand-authored `requirements.txt` as source of truth
- [ ] `requires-python` floor is `>=3.12` (or `>=3.13` greenfield); never a bare system `python3`
- [ ] Every new dependency traces to a `selection.md` row or a live PyPI/docs check performed today
- [ ] No poetry/pipenv/conda/pyenv reached for on a NEW project without a stated reason

Types (PG2 — `references/typing.md`):
- [ ] Public surfaces use `X | None` / `list[int]` (`UP006`/`UP007`), not `typing.List`/`Optional`
- [ ] A type checker is configured and its DATED verdict from `typing.md` is followed (pyright strict by default)
- [ ] A green `ty` run (if used) is treated as "not checked," never as "clean," per its false-negative caveat
- [ ] `Protocol` vs `ABC` chosen deliberately, not by habit

Boundary validation (PG3 — `references/validation.md`):
- [ ] Every external input (API/config/file/CLI/LLM output) crosses a validating model exactly once at the boundary — pydantic v2 by default, or the declared lighter tool per `validation.md`'s decision table
- [ ] Internals are `dataclass(slots=True)` or plain typed objects — no raw-dict threading past the boundary
- [ ] Files importing pydantic grep clean for `@validator(` / `.dict()` / `class Config:` (v1 idioms)
- [ ] `TypedDict` used only for internal trusted shapes, never as a boundary substitute

Quality (PG4 — `references/quality.md`):
- [ ] `ruff check` (house strict select) and `ruff format --check` both clean
- [ ] Tests are pytest functions with fixtures, not `unittest.TestCase` (new tests)
- [ ] Every `datetime` crossing a boundary is timezone-aware (`DTZ` clean) — no naive `datetime.now()`/`utcnow()`
- [ ] `print()` appears only for direct CLI user output; everything else logs via `logging.getLogger(__name__)`
- [ ] No bare `except:`/`except Exception: pass` — narrow catch or `contextlib.suppress` + `logging.exception`

Research code (if applicable — `references/research.md`):
- [ ] Config schema is a typed object (dataclass/pydantic); no `hydra.utils.instantiate()` on `_target_` values you didn't author
- [ ] Randomness flows through an explicit `np.random.default_rng(seed)` (`NPY002`); torch runs seed + determinism flags + `CUBLAS_WORKSPACE_CONFIG` when reproducibility is claimed
- [ ] Checkpoints/weights are safetensors; nothing unpickled across a trust boundary (`S301`)
- [ ] torch/CUDA deps are routed via explicit `[[tool.uv.index]]` + `[tool.uv.sources]` — never a bare `pip install torch`

Final gate:
- [ ] `uv run ruff check --fix && uv run ruff format` (project-pinned; `uvx` form only outside a project) was run before submitting
