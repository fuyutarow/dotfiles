---
name: running-python-tools
description: >-
  Run ALL Python-based tooling through uv — `uvx <tool>` for CLI tools (ruff, black, pytest,
  jupyter, http, yt-dlp, marker, …) and `uv run --with <pkg>` for scripts/snippets needing
  libraries (pypdf, pdfplumber, numpy, pandas, matplotlib, requests, …). Read this BEFORE running
  any Python command. Trigger whenever you would otherwise type `pip install`, `pip3`,
  `python3 -m pip`, `pipx`, `conda`, a bare `python3 script.py` that imports third-party packages,
  or invoke a Python tool by name. Replaces system/global pip installs with isolated, cached,
  reproducible uv runs — no environment pollution. Cut: maturin/PyO3 as a Rust binding-architecture
  decision → writing-rust; running the maturin command itself stays here.
---

# Python tooling via uv (uvx)

**Rule: never `pip install` into system/user Python, and never run `python3` relying on globally-installed third-party packages. Route every Python tool through `uv`.** (`uv` is already installed on this host; `uvx` = `uv tool run`.)

This is the Python analogue of the `bunx`-over-`npx` rule already used for JS.

## Decision table

| You want to… | Do this |
|---|---|
| Run a Python **CLI tool** | `uvx <tool> [args]` — e.g. `uvx ruff check .`, `uvx pytest -q` |
| Tool whose **command name ≠ package name** | `uvx --from <pkg> <command>` — e.g. `uvx --from httpie http GET …` |
| **Pin** a tool version | `uvx <tool>@<version>` — e.g. `uvx ruff@0.6.9` |
| Run a **script/snippet** that imports libraries | `uv run --with <pkg> [--with <pkg2>] python script.py` |
| **Inline** snippet | `uv run --with pypdf python - <<'PY' … PY` |
| Don't pick up a local `pyproject.toml` | add `--no-project` |
| Choose the interpreter | add `--python 3.12` |
| A tool you reuse constantly | `uv tool install <tool>` once (then it's on PATH) |

The user noted strict ephemerality is *not* required: `uvx` caches the tool's env after first download, so reuse is fast — this is not wasteful. The point is **isolation + reproducibility, not throwaway**.

## Recipes

```bash
# PDF text extraction (pypdf / pdfplumber — the anthropic pdf skill's libs)
uv run --with pypdf --no-project python - <<'PY'
from pypdf import PdfReader
r = PdfReader("doc.pdf"); print(r.pages[0].extract_text())
PY

# format / lint / test without installing anything globally
uvx ruff check .
uvx black .
uvx pytest -q

# numerical / data one-off
uv run --with numpy --with scipy --with pandas --no-project python script.py

# notebooks
uvx --from jupyterlab jupyter lab
```

## Forbidden → replacement

| Don't | Do |
|---|---|
| `pip install X` · `pip3 install X` | `uvx X`  (CLI)  or  `uv run --with X …`  (library) |
| `python3 -m pip install X` | same |
| `python3 script.py`  (needs third-party deps) | `uv run --with <deps> python script.py` |
| `pipx run X` · `pipx install X` | `uvx X` · `uv tool install X` |
| `conda install X` | `uv run --with X` / `uvx X` |

## Notes

- `uv run --with` layers an ephemeral env on the current project (or `--no-project` for a clean one) so the named packages are guaranteed present **without touching system Python**.
- When a dependency is **permanent to a project**, add it to that project's `pyproject.toml` and use plain `uv run`; use `--with` only for ad-hoc/one-off needs.
- Inside this host's repos that pin Python via uv, prefer `uv run` over `uvx` so the project's locked interpreter/deps apply; reach for `uvx` for project-independent tools.
- If `uv` is somehow missing, install it (`curl -LsSf https://astral.sh/uv/install.sh | sh`) rather than falling back to `pip`.
