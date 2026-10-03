# The research/ML foundation layer — config, GPU, contracts, repro, tracking, notebooks, viz, perf

> Snapshot: verified against live PyPI/GitHub/official docs 2026-07-12 [dated:2026-07] (second
> harvest sweep). Dating is deliberately FILE-LEVEL — every section below is fast-moving; a
> per-heading tag would be noise (same convention as `selection.md`, unlike `environment.md`'s
> per-section tags). Every row rots; re-verify any row older than ~2 quarters before recommending
> (PG1). **Cut**: this file owns research/ML-workflow domains — experiment config (incl. hydra),
> GPU/CUDA env, tensor/dataframe contracts, experiment tracking, reproducibility, notebooks,
> scientific viz, profiling/acceleration/parallelism. Generic app/library domains (HTTP, web,
> CLI, testing, logging, dataframes-in-general, datetime, DB, async, retry, cloud SDKs) are
> `references/selection.md`'s sole home — do not duplicate those rows here.

## 1. Experiment config — the hydra verdict

**THE VERDICT**: config-as-code is the 2026 source of truth — a typed schema object (dataclass
or pydantic model) that your IDE and type-checker understand. YAML/CLI are override *surfaces*
onto that object, not the source of truth. Raw `DictConfig`-as-truth (plain Hydra, untyped) is
the legacy pattern; treat it as such.

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Config schema + CLI overrides, new single-entrypoint research script | dataclass/pydantic schema + tyro 1.0.15 | jsonargparse 4.49.0 | already inside Lightning (`LightningCLI` is built on jsonargparse), or need TOML/Jsonnet config-file plurality |
| Staying inside the Hydra ecosystem, want typed configs | hydra-zen 0.16.0 | hand-written Hydra Structured Configs (`@dataclass` + `ConfigStore`) | already Hydra-shaped codebase; hydra-zen generates the Structured Configs from your existing function/class signatures instead |
| Sweeps / multirun / hyperparameter search | Optuna directly / W&B Sweeps / Ray Tune, driving whatever typed config you already have | Hydra + its launcher/sweeper plugins | existing SLURM-shaped academic cluster already on Hydra's override grammar, willing to accept 2022-frozen plugins |

- tyro (v1.0.15, ~monthly cadence, reached a stable 1.0 line) explicitly declines to be a config
  framework — it only owns "typed object → CLI," decoupled from schema/composition by design.
- **Hydra status, stated honestly**: 3+ years of near-zero feature work (`v1.3.2`→2023-02,
  `v1.3.3`→2026-06, over 3 years later), then a 2026-06 **security-driven** revival by its sole
  active maintainer — not organic feature development. Baseline `DictConfig` mode is untyped;
  type safety (Structured Configs) is an opt-in second system layered on top, admitted by Hydra's
  own docs. **Every official launcher/sweeper plugin except `hydra-ray-launcher` is frozen at a
  2022-vintage release** — the multirun/sweep story is Hydra's real remaining moat, and it is a
  weakening one.

### Hydra `instantiate()` — the RCE-shaped footgun (HARD SECURITY RULE)

`hydra.utils.instantiate()` (and hydra-zen's `instantiate`, same primitive) executes **any
callable** named by a config's `_target_` field — not just registered classes. **FORBIDDEN**:
calling it on a config whose `_target_` values you did not author yourself — this includes
config/metadata embedded in downloaded model checkpoints. Real, CVE'd incidents: CVE-2025-23304
(NVIDIA NeMo), CVE-2026-22584 (Salesforce Uni2TS), all root-caused to untrusted `_target_` data
reaching `instantiate()`. Hydra 1.3.4 (2026-07-04) ships a mitigation, but it is a **blocklist**,
and Hydra's own tracking issue (#3258) says so explicitly: the blocklist "cannot be a complete
security boundary." An
allowlist override env var still exists to bypass it. Never treat the 1.3.4 patch as closing
this hole.

**Format discipline**: YAML remains the pragmatic 2026 default for research configs — not
because it's technically superior (TOML's explicit typing has no Norway-problem/numeric-coercion
surprises), but because the Hydra/OmegaConf/hydra-zen ecosystem and jsonargparse's default parser
are YAML-native, and YAML anchors match config-composition (base + override layers). Reach for
TOML instead for flat/small configs, or when already on pydantic-settings/dynaconf (both treat
TOML as first-class).

## 2. GPU/CUDA environment with uv

**Explicit-index + source-routing is load-bearing**, not optional style (from uv's own docs,
`docs.astral.sh/uv/guides/integration/pytorch/`):

```toml
[project]
requires-python = ">=3.13"
dependencies = ["torch>=2.3.1", "torchvision"]   # torch>=2.3.1: NumPy-2 compatible

[tool.uv.sources]
# CUDA exists on Linux AND Windows; only macOS is CPU-only — the marker must say so.
torch       = [{ index = "pytorch-cpu", marker = "sys_platform == 'darwin'" },
               { index = "pytorch-cu130", marker = "sys_platform == 'linux' or sys_platform == 'win32'" }]
torchvision = [{ index = "pytorch-cpu", marker = "sys_platform == 'darwin'" },
               { index = "pytorch-cu130", marker = "sys_platform == 'linux' or sys_platform == 'win32'" }]

[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true

[[tool.uv.index]]
name = "pytorch-cu130"
url = "https://download.pytorch.org/whl/cu130"
explicit = true
```

- `explicit = true` on `[[tool.uv.index]]` is load-bearing: without it, uv may pull *other*
  packages from the PyTorch index too.
- **Every torch-FAMILY package** — the ones whose wheels live on `download.pytorch.org`
  (torch, torchvision, torchaudio) — must be routed in `[tool.uv.sources]`; miss one and PyPI's
  CPU-only wheel silently overwrites the CUDA install (PyPI only ever serves CPU builds).
  Generic dependencies (lightning itself, numpy, …) stay on PyPI — do NOT route them to the
  torch index; they resolve their `torch` requirement through your routed source. macOS has no
  CUDA builds at all — the `sys_platform` marker split above is mandatory, and it must include
  `win32` on the CUDA side (Windows CUDA is fully supported).
- `--torch-backend=auto` (or `UV_TORCH_BACKEND=auto`) is a convenience for common cases, not a
  substitute for explicit indexes in a shared/reproducible `pyproject.toml` — it has a known
  compute-capability mis-detection issue (picks a CUDA build too new for an old GPU).
- Pin `torch>=2.3.1` whenever NumPy 2.x is in the tree — pre-2.3.1 crashes at import
  (`_ARRAY_API not found`); the incompatibility isn't expressed in package metadata, so uv's
  resolver will happily lock a broken combo without complaint.
- `jax[cuda12]` is the simple path (pulls CUDA plugin + runtime libs straight from PyPI, no
  custom index); `jax[cuda12-local]` links the system-installed toolkit instead.
- **Current**: torch 2.13.0 (2026-07-08); its release notes make CUDA 13.0 the default build
  target and drop 12.8/12.9 for the NEW wheels — but older cu-variant indexes (cu118/cu126/
  cu128) still exist and serve OLDER torch versions: pick the index matching your torch pin,
  don't assume the newest cu number. `3.13t` free-threaded wheels dropped (superseded by 3.14t,
  full wheels since 2.10).
- conda/pixi's remaining niche: a **non-Python native dependency pip cannot install** — a full
  CUDA Toolkit (nvcc, compilers) for building custom CUDA extensions. pixi is the modern,
  lockfile-first face of that niche. Otherwise pip/uv wheels are strictly the 2026 default —
  they bundle their own CUDA runtime, no separate Toolkit install needed.

| Framework | Default/when |
|---|---|
| torch | default for standard supervised training/inference; ecosystem depth (HF, Lightning, tooling) wins on iteration speed |
| JAX | when the work is functional-transform-heavy (custom `grad`/`vmap`/`pmap`/`shard_map`, novel optimizers, TPU-first) |
| Lightning Fabric | multi-GPU/precision/strategy plumbing without giving up loop control (unusual loss/eval logic) |
| Lightning Trainer | standard supervised pipelines where boilerplate reduction outweighs loop-control loss |
| Keras 3 | niche: explicit backend-portable model code (JAX/TF/torch/OpenVINO-inference) — not a default |

Never reach for Lightning solely for `torch.compile`/AMP/DDP — vanilla torch exposes those
natively now; Lightning's value is the `Trainer` abstraction, not compile/parallelism access.

## 3. Tensor & dataframe contracts

**Converged default** for shape/dtype safety on hot tensor code:

```python
from beartype import beartype as typechecker
from jaxtyping import jaxtyped, Float

@jaxtyped(typechecker=typechecker)
def f(x: Float[Tensor, "b c"]) -> Float[Tensor, "b c"]:
    return x
```

`@jaxtyped(typechecker=...)` over the older stacked-decorator style. jaxtyping has zero hard
array-lib dependency and supports JAX/PyTorch/NumPy/MLX/TensorFlow despite the name. Pick
beartype over typeguard: typeguard has a documented version trap (pin `2.*` — versions 3/4 have
known jaxtyping issues); no equivalent warning exists for beartype. Hand-rolled shape asserts
(`assert x.shape == (...)`) are the legacy anti-pattern — no static-checker fallback, no
composability, easy to let drift. `einops` is the boring, uncontested default for
rearrange/reduce/repeat over raw `.reshape`/`.permute`; `einx` (ICLR-2026-Oral-validated) is a
legitimate escape valve when you hit einops's expressiveness ceiling, not yet a default — its own
release history shows ~21 months of dormancy before this year's burst. **PEP 646 static shape
checking is premature**: jaxtyping's own maintainer explicitly declined to adopt it ("beyond the
scope of what static type checking is currently capable of"); the runtime jaxtyping+beartype pair
is doing all the real work.

**Dataframe contracts are an honest three-way split — do not fake one winner:**

| Job | Pick | Why | Honest caveat |
|---|---|---|---|
| Polars-only, cross-frame referential integrity | **dataframely** (QuantCo, v2.x) | only one of the three with collection-level/cross-dataframe primary-key checks | youngest (~15mo), fastest-moving (multiple releases/week recently) |
| Polars + already-pydantic shop, familiar model syntax | **patito** | pydantic-model ergonomics on Polars | alive but low-velocity (multi-month gaps between 0.8.x patches), still pre-1.0 |
| Multi-backend (pandas+polars+pyspark+ibis) or statistical/hypothesis-style checks | **pandera** | 0.32+ ships a Narwhals-powered lazy backend unifying polars/ibis/pyspark-SQL | still 0.32.x — pre-1.0 after ~8 years; real-world maturity ≠ semver stability signal |

`array-api-compat` is legitimate for backend-agnostic **library** code (NumPy/CuPy/PyTorch/Dask/
JAX). Relying on scikit-learn/SciPy enforcing the Array API standard by default is premature —
both treat it as experimental/opt-in as of their current releases.

## 4. Reproducibility chain — a chain, not a single call

1. `rng = np.random.default_rng(seed)` passed explicitly through the call graph. Global
   `np.random.seed()` / bare `np.random.*` is the anti-pattern — breaks under fork/joblib workers
   (child processes inherit/duplicate global state). NumPy's own docs say "recommend
   transitioning," **not deprecated** — don't overstate.
2. `torch.manual_seed(seed)` + `torch.use_deterministic_algorithms(True)` (raises `RuntimeError`
   for ops with no deterministic implementation, rather than silently returning nondeterministic
   results) + `CUBLAS_WORKSPACE_CONFIG=:4096:8` **set at process launch** (read at CUDA context
   init — an in-script `os.environ[...] =` after CUDA has initialized does nothing).
3. `DataLoader(generator=torch.Generator().manual_seed(seed), worker_init_fn=...)` where
   `worker_init_fn` re-seeds numpy/`random` from `torch.initial_seed()` — PyTorch's own docs
   warn that without this, "seeds for other libraries may be duplicated upon initializing
   workers," the classic identical-augmentation-across-workers bug.
4. Close with PyTorch's own disclaimer: bit-exact reproducibility is **not** guaranteed across
   PyTorch releases, individual commits, platforms, or CPU-vs-GPU execution — document the
   discipline above, don't over-promise what the framework itself disclaims. Determinism mode is
   also slower — gate it behind an explicit flag, not always-on.

**Caching**: `joblib.Memory` is the 2026 default for numpy/array-shaped scientific caching
(numpy-array-aware, actively maintained, scikit-learn ecosystem's own answer). `diskcache` is a
caution flag — no release in ~3 years; still fine for a general-purpose disk-backed dict of
non-array objects, just say so rather than silently recommending it.

**SERIALIZATION HARD RULE**: never unpickle across a trust boundary — pickle executes code by
design (official Python docs: "never unpickle data received from an untrusted or unauthenticated
source"). Model/tensor weights → `safetensors` (Trail-of-Bits-audited 2023, no critical RCE flaw
found; Hugging Face's own default in `transformers`' `save_pretrained()` — load via the
`safetensors` library API). Arrays/tabular data →
`.npz`/parquet (no code-execution surface). Reserve `pickle` for fully first-party,
never-shared, same-trust-boundary objects only — even then, safetensors costs nothing extra and
should be preferred by default.

## 5. Experiment tracking

| Tool | 2026 status | Verdict |
|---|---|---|
| **wandb** | 0.28.0, monthly-ish releases, still 0.x versioning (naming quirk, not a maintenance signal) | 2026 default for individual/academic researchers — free academic Pro tier is generous; **verify current terms at time of use**, don't hardcode the numbers as eternal |
| **mlflow** | 3.14.0, very active, 3.x restructured around GenAI/agent tracing | default when self-hosting matters (air-gapped, no external account); its agent-tracing features are now ahead of wandb for LLM-pipeline tracing specifically |
| **tensorboard** | 2.21.0, slow ~1 release/6–11mo | free local viewer only, never sole tracker — no run comparison across machines, no artifact/model registry |
| **Neptune** | **being shut down** — OpenAI announced acquisition 2025-12-03; external/standalone service EOL target 2026-03 | legacy-avoid, hard — this is an active wind-down, not FUD; older tutorials still recommend it uncritically |
| **Aim** | no stable release in >14 months, commit activity thin | caution flag — was a credible self-hosted wandb alternative, now effectively stalled |

**Data versioning**: DVC (3.67.1) survived an ownership change (acquired by lakeFS, Nov 2025)
with release/commit cadence unbroken through 2026-07 — correct default for file/dataset-level
versioning alongside git. Row-level/structured-data versioning is a different tool class
(lakeFS proper, or a table format) — don't conflate the two.

## 6. Notebooks & publishing

- **marimo** (0.23.x, ~weekly releases) is a **defensible, not yet universal**, default for new
  solo/small-team exploratory work: reactive execution, pure-`.py` storage (git-diffable), no
  hidden state. **CoreWeave-owned since Oct 2025** — a public non-EOL commitment ("will remain
  freely available and permissively-licensed"), but a corporate dependency nonetheless. Not yet a
  wholesale Jupyter replacement: Python-only (no R/Julia kernel story), thinner extension
  ecosystem than a decade of `ipywidgets`, JupyterHub-scale deployment bolted on rather than
  native.
- **Jupyter + jupytext** (`.py:percent` pairing) is still the correct 2026 answer for
  git-reviewability when you must stay on `.ipynb` — non-Python kernels, JupyterHub-scale
  institutional deployment, or a repo with a heavy existing `.ipynb`/nbconvert estate. Bare
  `.ipynb` with **no** jupytext pairing is the deny — unreviewable diffs.
- **papermill** is alive (continuous 2026 commit activity), still the standard for parameterized
  batch/CI-triggered notebook execution — sparse-looking release cadence does not mean dead.
- **quarto** is the 2026 publishing default (papers, books, reproducible reports) from any of the
  above sources. **TRAP**: the `quarto-cli` **PyPI** wrapper lags the real CLI by several minor
  versions — never `pip install quarto-cli` and trust its version; install the native binary or
  via Homebrew instead.

## 7. Visualization

| Domain | 2026 default | Runner-up + when | Honest caveat |
|---|---|---|---|
| Publication figures | matplotlib (3.11) | plotnine when the team is ggplot2-native | still the base layer everything else (seaborn, plotnine, pandas `.plot`) renders through |
| Quick EDA | seaborn | plotly Express when you want one-line interactivity later | **released package frozen at 0.13.2 since 2024-01** — repo commits are active daily, the release valve is stuck; say both, don't call it either "actively maintained" or "legacy-avoid" unqualified |
| Interactive dashboards | plotly/Dash | HoloViz (hvplot+Panel+Datashader) when data is genuinely large/streaming | plotly chokes on genuinely big point clouds where Datashader doesn't |
| Grammar-of-graphics | altair (Vega-Altair; pip name still `altair`) | — | now compiles against Vega-Lite 6, not 5 — the spec itself jumped majors |

**CJK/Japanese matplotlib fonts**: `japanize-matplotlib` is **dead** — last release 2020,
depends on `distutils` (removed in 3.12), hard-errors on Python 3.12+ with no upstream fix
coming. The successor is **matplotlib-fontja** (`import matplotlib_fontja` after
`matplotlib.pyplot`) — encode this explicitly; search engines still surface the dead package as
the top answer.

## 8. Performance & parallelism

**Profiler ladder** (not pick-one): `cProfile` (which function, free, always available) →
`py-spy` (production sampling; has a ~2-year dead gap in its history before reviving — pin the
version, single-maintainer bus factor) or `scalene` (CPU+GPU+memory, line-level, 2026 default for
"one profiler that covers all three") → `line_profiler` (which line, once you already know which
function is hot). `memray` is the memory deep-dive default — **Linux/macOS only**, no Windows
build; use `tracemalloc`/scalene there instead.

**Benchmarks**: `pytest-benchmark` for CI regression gates (pytest-native fixtures); `pyperf` for
publication-grade standalone numbers (what CPython core devs use); `richbench` is **dead** —
~4 years no release, don't build a paper's benchmark section on it.

**Acceleration ladder**: vectorize FIRST (most "numba vs cython" questions are really "did you
vectorize yet") → `numba` (still pre-1.0 — 0.66.x after 13+ years, a real API/internal-churn
signal, not FUD; budget 2–4 months of lag before it supports a brand-new Python minor — never
schedule a Python upgrade and a numba dependency in the same sprint) → Cython 3.x (when numba's
restricted-subset-of-Python model breaks on arbitrary objects/classes/complex control flow) →
PyO3/maturin (row only here — full architecture lives in the `writing-rust` skill) → `nanobind`
(pick this instead of PyO3/maturin specifically when wrapping C++, not Rust). Mojo is premature
for typical research Python — still beta, GPU-kernel/systems-programming positioned, not a
numba/Cython replacement yet.

**Parallelism**: `concurrent.futures` baseline (`ThreadPoolExecutor`/`ProcessPoolExecutor`) →
`joblib` (sklearn-world default, `Parallel`/`delayed` — don't reach past this for an
embarrassingly-parallel sklearn fit) → `dask` (scale existing pandas/NumPy past single-machine
memory with minimal rewrite) vs `ray` (actors/distributed training-serving, stateful workloads —
using ray to parallelize a plain groupby is over-engineering; using dask for distributed
actor-based RL is under-fit). For every recordable/orchestrated run, sibling
`orchestrating-agents` P7 precedes pool creation: pass the admitted integer as `max_workers=N` or
`n_jobs=N`, keep BLAS/OpenMP threads inside the same CPU budget, and run through
`agent-resource-run`. Never rely on executor defaults, `n_jobs=-1`, or a library's auto/all-core
mode; process copies of large arrays belong in the analytic host-RAM bound before the pilot.

**Verified 3.14 change**: on Unix platforms other than macOS, `multiprocessing`'s default start
method is now **`forkserver`** — not `spawn`, and not the old `fork` default. Code relying on
fork's copy-on-write of large in-memory objects (common in research data-loading code) now needs
an explicit `get_context('fork')` or silently pays a re-import/re-pickle cost. macOS and Windows
are unaffected (already spawn-by-default). Free-threading status (Phase II, opt-in `3.14t`, not
the default build) is owned by `references/selection.md` — one pointer, not restated here.

---

**Never cite the following as fact** (unverified in harvest): safetensors joining the PyTorch
Foundation; exact marimo star counts as a durable metric; wandb pricing numbers as durable —
always say "verify current terms at time of use" instead of hardcoding them.
