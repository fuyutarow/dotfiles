# The library-selection spine (PG1) — by job, by role, by current maintenance

> **This is a LOOKUP CATALOG, not a starter kit. Add a dependency at the point of first use, never
> preemptively.** A dependency you don't use is not free: it inflates the lock file, the audit
> surface, and every future Python-version bump. Heavy offenders never to carry speculatively: a
> full ORM for a handful of queries, `structlog` for a one-off script, an async stack for a sync
> tool, `msgspec` before you've profiled a bottleneck.
>
> Snapshot: verified against live PyPI / official docs 2026-07-12 [dated:2026-07]. Every row rots;
> re-verify any row older than ~2 quarters before recommending (PG1). The *argument* for the
> boundary-validation cut lives in `references/validation.md`; the checker verdict lives in
> `references/typing.md`; ruff config lives in `references/quality.md` — this file is the table.
>
> **Cut**: this file owns generic app/library domains. Research/ML-workflow domains —
> experiment config (incl. hydra), GPU/CUDA env, tensor/dataframe contracts, experiment
> tracking, reproducibility, notebooks, scientific viz, profiling/acceleration/parallelism —
> are `references/research.md`'s sole home; do not duplicate those rows here.

## HTTP → clients & one-shot requests

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Async-capable client (FastAPI/Starlette ecosystem) | `httpx` 0.28.1 | `niquests` 3.20.1 | want HTTP/2+3, WebSocket/SSE, active releases → niquests (co-default, not a footnote) |
| Server-side async (client+server WS in one dep) | `aiohttp` 3.14.1 | `httpx` + separate server | need both ends of a WS connection, or an async server without a full framework |
| Legacy/frozen | `requests` 2.34.2 | `niquests` (drop-in `import niquests as requests`) | any new code needing concurrency or HTTP/2+ |

- **`httpx` is stalled**: no release since 2024-12 (19 months as of 2026-07), still `4 - Beta` — state this caveat whenever recommending it; one 2026-03 report claims a thread-safety issue under load (UNVERIFIED, single secondary source, no primary link captured).
- **`requests` is not deprecated, it's frozen** — its own Contributor's Guide states perpetual feature freeze ("only the BDFL can add or approve new features... feature-complete"). Fine to keep in legacy code, wrong default for new.
- `niquests` adds HTTP/1.1+2+3, WS/SSE, DoH/QUIC/TLS, OCSP; its ~2-4x throughput claim over httpx/aiohttp is the vendor's own benchmark — state as OPINION, not independent fact.

## Web → framework choice

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| REST/JSON API | FastAPI 0.139.0 | Litestar 2.24.0 | serialization throughput dominates cost (msgspec-based) |
| Full-stack monolith (admin/ORM/CMS) | Django 6.0.7 (requires ≥3.12) | FastAPI + separate admin | need built-in admin UI, batteries-included ORM+migrations+auth |
| Minimal/legacy-simple | Flask 3.1.3 | FastAPI | no typed-validation/docs-generation need |

- FastAPI wins on ecosystem depth and community size (CONSENSUS; Litestar ~12% of FastAPI's GitHub stars per one 2026 source — UNVERIFIED exact ratio, single blog claim).
- Litestar's msgspec-based serialization is "10-20x faster than pydantic v2" per Litestar's OWN docs (vendor claim) — but "Litestar wins synthetic charts; FastAPI wins almost every real production decision" per a 2026 comparison piece: the perf gap rarely surfaces in I/O-bound user-facing latency.
- Common 2026 hybrid: Django for admin/CMS + a separate FastAPI service for perf-sensitive/ML-serving endpoints.
- Litestar 3.0 is in active development (63% complete per a GitHub milestone tracker, 2026-04-17) — ship date UNVERIFIED, do not cite one.

## CLI → argument parsing

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Most new CLIs | typer 0.26.8 | cyclopts 4.21.0 | complex typed params (Union/Literal/pydantic-model/dataclass) that typer's click-layered model handles awkwardly |
| Raw layer, max flexibility/plugin ecosystem | click 8.4.2 | typer (built on click) | don't want typer's abstraction on top |
| Zero-dep, no packaging allowed | stdlib `argparse` | typer/click | the moment flag/help complexity grows |

- typer is built ON TOP of click (decorator-based, type-hint-driven); cyclopts implements its OWN parser, not click-layered — "Cyclopts is what you thought Typer was" is cyclopts' own positioning (OPINION, interested party).
- `argparse`'s zero-dep niche is LEGITIMATE, not legacy: stdlib docs call it "the default recommended standard library module for implementing basic command line applications."

## Testing → runner + canon plugins

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Runner | pytest 9.1.1 | `unittest` (legacy) | stdlib-only constraint, or legacy-suite consistency |
| Coverage / parallel / property / snapshot | pytest-cov, pytest-xdist, hypothesis, syrupy | — | canon plugin set — add each at point of use |
| Async tests | pytest-asyncio 1.4.0 | anyio's own pytest plugin | codebase already targets asyncio+Trio, or uses anyio as its concurrency layer |

- Neither async plugin deprecates the other: pytest-asyncio is asyncio-only, narrower, more widely adopted; anyio is a broader concurrency framework with testing as one feature.
- pytest-xdist's last release is ~1yr old — read as stable/low-churn (mature, narrow-scope plugin), not abandoned.

## Logging → structured vs stdlib

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Apps/services (structured) | structlog 26.1.0 | loguru 0.7.3 | quick setup on a small script/project |
| **Libraries** | stdlib `logging` ONLY | — | never structlog/loguru inside a library — the one point every source agrees on |
| Below structured-output need | stdlib `logging` alone | structlog | config boilerplate or async context propagation becomes painful |

- structlog: `contextvars`-based context propagation correct across asyncio boundaries; `bind()` enforces structured discipline at scale.
- **loguru stall**: 0.7.3, no release in ~19 months as of 2026-07 — same staleness signature as httpx. Flag as UNVERIFIED whether still actively maintained; don't assert "actively maintained" unconditionally.

## Terminal → rich / textual

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Formatting/printing (tables, progress, tracebacks) | rich 15.0.0 | — | uncontested — anything beyond stdlib `print` |
| Full TUI framework | textual 8.2.8 | — | built on rich's renderables, same Textualize org |

Both released within 1-3 months of 2026-07 — healthy maintenance-cadence signal; no legacy alternative surfaced.

## Dataframes → new pipelines vs interactive glue

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| New ETL/analytics pipeline | polars 1.42.1 | pandas 3.0.3 | interactive/Jupyter exploration, or gluing to a pandas-only ecosystem boundary |
| Library accepting ANY frame | narwhals 2.23.0 | — | zero-dep compat layer (pandas/polars/pyarrow/duckdb/…) — not an app framework |
| SQL over frames/files | duckdb 1.5.4 | — | task is "SQL over files/frames," not "vectorized frame API" |

- "polars-by-default for new code" is CONSENSUS from multiple 2026 practitioner sources, **not an official Polars/pandas project decree** — say so.
- pandas 3.0: Copy-on-Write is now DEFAULT; pyarrow-backed strings used BY DEFAULT when pyarrow is installed but **NOT a hard dependency** — the hard-dependency plan (PDEP-10) was explicitly deferred past 3.0 into PDEP-14. Do not repeat the common blog error "pandas 3.0 requires pyarrow."
- H2O.ai groupby benchmark (polars 0.45s vs pandas 12.5s @ 10M rows) is third-party, reported not reproduced here.

## Numerical

numpy 2.x is settled: pin `numpy>=2.1`; the 1.x→2.x migration is effectively complete across pandas/scipy/scikit-learn/matplotlib; no remaining reason to pin numpy 1.x in new code [dated:2026-07].

## Serialization → codec choice

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Small payload / one-off (below ~1MB) | stdlib `json` | — | NOT legacy — a threshold, not a maturity judgment |
| Schema-known, decode into a type | msgspec 0.21.1 | orjson 3.11.9 | pure dict-in/dict-out speed, or float-heavy JSON (msgspec's float parser ~15% slower) |
| Fast dict-based encode/decode, no schema | orjson 3.11.9 | msgspec | need validation-during-decode against a known schema |

- Natural pairing: pydantic at the boundary OR msgspec — don't double-parse the same payload through both.
- Both "far exceed" stdlib json at scale (CONSENSUS benchmark direction); stdlib remains the CORRECT choice below the threshold, not a legacy one.

## Datetime → the aware-datetime discipline

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Baseline (always-aware) | stdlib `datetime` + `zoneinfo` | — | universal default — never naive |
| Opt into type-level naive/aware safety | whenever 0.10.2 | stdlib alone | want compiler-enforced aware/naive distinction, accept pre-1.0 risk |
| Ergonomics layer (datetime subclass) | pendulum 3.2.0 | arrow 1.4.0 | want drop-in subclass ergonomics over type-level safety |

- **whenever is Beta, pre-1.0** — maintainer states holding off on 1.0 "so we can get the API just right for the long term." Legitimate, best-designed option; do NOT claim it is "the 2026 stable default."
- **pendulum is NOT dead** — actively maintained (3.2.0, 2026-01) — this corrects a stale "pendulum is abandoned" claim.
- The deny is naive datetimes, not any specific library; ruff's DTZ rules mechanically enforce the aware discipline (quality.md).

## Database → ORM, drivers, migrations

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| ORM/typed style | SQLAlchemy 2.0.51 (`Mapped[]`/`mapped_column`) | sqlmodel 0.0.39 | FastAPI-CRUD niche wanting one model for ORM+pydantic |
| Postgres-only max async | asyncpg 0.31.0 | psycopg3 3.3.4 | want sync+async flexibility or a multi-dialect driver |
| Migrations | alembic 1.18.5 | — | standard pairing with SQLAlchemy 2.x |
| SQL-first, skip the ORM | aiosql | SQLAlchemy | want `.sql` files loaded as callable methods, <1000 lines of glue |

- SQLAlchemy 2.1 is still Beta (2.1.0b3, 2026-06) — target 2.0-style now (typed `Mapped[]`, no legacy `Query`-only style), don't wait for 2.1.
- **sqlmodel's beta + single-maintainer status is a real risk factor** for anything beyond FastAPI-adjacent CRUD — honest caveat, not FUD.

## Async → concurrency model

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Straightforward concurrent fan-out, stdlib-only (3.11+) | asyncio + `TaskGroup` | anyio 4.14.1 | need real cancel-scope control/timeouts, or backend-agnostic library code |
| Structured concurrency is the app's PRIMARY design constraint | trio 0.33.0 | anyio | just need a library dependency, not the whole app's design |

- **Async only when the concurrency is real** — boring sync code with a sync client is simpler,
  easier to test, and less failure-prone; async-first as a style default is itself an
  anti-pattern (sync-before-async, cross-vendor-converged).
- `asyncio.TaskGroup` (3.11) still can't cancel or enumerate its own child tasks — a real, documented gap per anyio's own "why AnyIO" page.
- trio: `4 - Beta` classifier, but its own PyPI description calls it "mature and well-tested... widely used in production" — report both rather than picking one.
- stdlib keeps absorbing trio/anyio-pioneered patterns (`TaskGroup`, `asyncio.timeout()`) — the gap narrows over time.

## Free-threading — reality check [dated:2026-07]

- PEP 703 (GIL-optional) is Accepted/Final; PEP 779 phases: **Phase I** = experimental (3.13, opt-in `--disable-gil`); **Phase II** = officially supported, landed in **3.14** (no longer experimental); **Phase III** (GIL off BY DEFAULT) is an explicitly separate, not-yet-made decision — 2028-2030 horizon, not a 2026 call.
- **#1 gotcha**: any C extension that hasn't explicitly opted in SILENTLY RE-ENABLES the GIL at import time. NumPy/SciPy support the free-threaded build; a long tail of C-extension packages don't yet.
- Guidance: TEST against free-threaded 3.14t now; do NOT deploy it as your 2026 production default.
- Operational checks: `sys._is_gil_enabled()` at runtime; `sysconfig.get_config_var("Py_GIL_DISABLED")`
  for the build; `PYTHON_GIL=0` / `-X gil=0` to force; an unsupported C extension re-enables the
  GIL at import WITH a warning — watch for it in logs.
- Deeper parallelism guidance (concurrent.futures/joblib/dask/ray ladder, and the 3.14 Unix
  default-start-method change to forkserver) lives in `references/research.md` §8 — pointer
  only, do not restate. Obtaining/pinning a `+freethreaded` interpreter (`uv python install` /
  `uv python pin`) → `environment.md`, Python-versions section.

## Config/env → settings loading

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| App config (more than a couple values) | pydantic-settings 2.14.2 | bare python-dotenv 1.2.2 | trivial script that doesn't otherwise use pydantic |

pydantic-settings internally depends on python-dotenv for `.env` parsing — a VALIDATED SUPERSET, not a replacement; env vars always win over `.env` values. Boundary-validation usage floor lives in `references/validation.md`.

## Retry / resilience

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Complex/heterogeneous policies, mixed sync/async | tenacity 9.1.4 | stamina 26.1.0 | pure-async codebase wanting opinionated defaults + built-in observability hooks |

stamina is an opinionated wrapper OVER tenacity (retry-on-specific-exceptions + exponential backoff+jitter by default, Prometheus/structlog/stdlib-logging instrumentation) — not a strict replacement; neither is legacy.

## Cloud SDKs

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| AWS, sync | boto3 | — | base SDK |
| AWS, high-level resource ergonomics, async | aioboto3 | aiobotocore | want lower-level client-call async coverage with less abstraction overhead |
| GCP | service-by-service (Firestore `AsyncClient`, GCS async writers) | gcloud-aio (third-party) | no clean modern/legacy split exists here — don't invent one |

- aioboto3/aiobotocore trail the latest botocore release (must patch/pin against a specific upstream botocore version) — a genuine, still-open dependency-lag problem, not resolved by any official async AWS SDK as of 2026-07.
- GCP has NO crisp old-vs-new split, unlike AWS — report as fragmented/service-by-service, do not manufacture one.

## Version snapshot table

| Package | Version | Released |
|---|---|---|
| uv | 0.11.28 | 2026-07-07 |
| ruff | 0.15.21 | 2026-07-09 |
| pydantic | 2.13.4 | 2026-05-06 |
| pydantic-settings | 2.14.2 | 2026-06-19 |
| httpx | 0.28.1 | 2024-12-06 (stalled) |
| niquests | 3.20.1 | 2026-07-09 |
| aiohttp | 3.14.1 | 2026-06-07 |
| requests | 2.34.2 | 2026-05-14 |
| FastAPI | 0.139.0 | 2026-07-01 |
| Litestar | 2.24.0 | 2026-06-11 |
| Django | 6.0.7 | 2026-07-07 |
| Flask | 3.1.3 | 2026-02-19 |
| typer | 0.26.8 | 2026-06-26 |
| click | 8.4.2 | 2026-06-24 |
| cyclopts | 4.21.0 | 2026-07-09 |
| pytest | 9.1.1 | 2026-06-19 |
| pytest-cov | 7.1.0 | 2026-03-21 |
| pytest-xdist | 3.8.0 | 2025-07-01 |
| pytest-asyncio | 1.4.0 | 2026-05-26 |
| anyio | 4.14.1 | 2026-06-24 |
| hypothesis | 6.156.6 | 2026-07-10 |
| syrupy | 5.5.3 | 2026-07-11 |
| structlog | 26.1.0 | 2026-06-06 |
| loguru | 0.7.3 | 2024-12-06 (stalled) |
| rich | 15.0.0 | 2026-04-12 |
| textual | 8.2.8 | 2026-06-30 |
| numpy | 2.5.1 | 2026-07-04 |
| pandas | 3.0.3 | 2026-05-11 |
| polars | 1.42.1 | 2026-06-30 |
| narwhals | 2.23.0 | 2026-07-01 |
| duckdb (py) | 1.5.4 | 2026-06-17 |
| orjson | 3.11.9 | 2026-05-06 |
| msgspec | 0.21.1 | 2026-04-12 |
| whenever | 0.10.2 (Beta) | 2026-07-06 |
| pendulum | 3.2.0 | 2026-01-30 |
| arrow | 1.4.0 | 2025-10-18 |
| SQLAlchemy | 2.0.51 (2.1 Beta) | 2026-06-15 |
| sqlmodel | 0.0.39 (Beta) | 2026-06-25 |
| alembic | 1.18.5 | 2026-06-25 |
| asyncpg | 0.31.0 | 2025-11-24 |
| psycopg | 3.3.4 | 2026-05-01 |
| trio | 0.33.0 (Beta) | 2026-02-14 |
| python-dotenv | 1.2.2 | 2026-03-01 |
| tenacity | 9.1.4 | 2026-02-07 |
| stamina | 26.1.0 | 2026-04-13 |
| attrs | 26.1.0 | 2026-03-19 |
| cattrs | 26.1.0 | 2026-02-18 |

Python core: 3.14 released 2025-10-07; 3.15 final scheduled 2026-10-01 (prerelease as of this snapshot). Supported line: 3.10 (security-only, EOL 2026-10) through 3.14 (bugfix); 3.13/3.14 are the correct new-project targets in 2026.
