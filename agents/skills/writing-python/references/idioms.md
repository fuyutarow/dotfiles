# Idioms — the ranked LLM-failure kill list

> SKILL.md §1(b) carries the one-line legacy→modern table (the summary seam); THIS file argues
> each row — WRONG → RIGHT → why → enforcement; sync deliberately, do not diff for byte-identity.
> Ranked by frequency × damage, harvest/llm-failures order (high→low), verified live [dated:2026-07].
> Grade tags (`[CONSENSUS]`/`[OPINION]`) mark non-FACT rows — never launder those upward.
## 1. `pip install` + `requirements.txt` reflex
```bash
# WRONG
pip install httpx; echo "httpx==0.28.1" >> requirements.txt
# RIGHT
uv add httpx        # writes pyproject.toml + uv.lock
```
Why: no lockfile, no reproducibility — `uv.lock` is the source of truth. Enforcement: PG0 gate,
grep `pip install|requirements\.txt` in new/owned diffs.
## 2. `python -m venv` + activate dance
```bash
# WRONG
python -m venv .venv && source .venv/bin/activate   # or Scripts\activate on Windows
# RIGHT
uv run pytest        # creates/syncs the venv transparently, every invocation
```
Why: a multi-step OS-specific ritual replaced by one command. Enforcement: PG0 gate, grep
`venv/bin/activate|Scripts\\activate` in scripts/docs.
## 3. `setup.py`/`setup.cfg` for new projects
```python
# WRONG (setup.py)
from setuptools import setup
setup(name="pkg", version="0.1", packages=["pkg"])
# RIGHT (pyproject.toml): [project] table — name = "pkg", version = "0.1"
```
Why: PEP 621 `[project]` is canonical metadata; `setup.py` is imperative-build legacy only.
Enforcement: PG0 gate — `uv init` scaffolds pyproject only; grep `setup(` in a new package's diff.
## 4. `os.path` string-joining instead of `pathlib` (and implicit text encoding)
```python
# WRONG
os.path.exists(os.path.join(d, "sub", "file.txt")); open(path).read()
# RIGHT
(Path(d) / "sub" / "file.txt").exists()
Path(path).read_text(encoding="utf-8")
```
Why: composable, typed, no manual separator handling; never rely on the platform-default encoding for text I/O. Enforcement: ruff `PTH118` (`os.path.join` specifically) plus the wider `PTH1xx` family (~15 rules, mostly autofixable); grep `open\(|read_text\(|write_text\(` with no `encoding=`.
## 5. Bare `except:` / `except Exception: pass`
```python
# WRONG
try: risky()
except: pass
# RIGHT
try: risky()
except SpecificError as exc:
    logging.exception("risky failed"); raise DomainError("risky failed") from exc
```
Why: swallows real bugs/security issues silently — highest-damage item here; when re-raising, preserve the cause with `raise ... from exc` and log once at the handling boundary, not at every layer. `[CONSENSUS]` on frequency, rule existence is FACT. Enforcement: ruff `E722`, `S110`/`BLE001`, `SIM105` (`contextlib.suppress`), `TRY400` (`.exception`).
## 6. `typing.List`/`Dict`/`Optional`/`Union` instead of builtins + `|`
```python
# WRONG
from typing import List, Optional
def f(x: Optional[List[int]]) -> None: ...
# RIGHT
def f(x: list[int] | None) -> None: ...
```
Why: Python 3.9 is EOL — no supported interpreter needs the old syntax. Enforcement: ruff
`UP006`/`UP035` (PEP 585), `UP007` (PEP 604) — autofix.
## 7. Naive `datetime.now()` / `datetime.utcnow()`
```python
# WRONG
ts = datetime.utcnow()          # naive despite the name
# RIGHT
ts = datetime.now(UTC)
```
Why: naive datetimes are silently local-time; `utcnow()` is deprecated since 3.12. Enforcement: ruff `DTZ005` (this exact `datetime.now()`-without-tzinfo shape) plus the wider `DTZ` family; PG4 gate.
## 8. `%`-formatting/`.format()` instead of f-strings — EXCEPT logging
```python
# WRONG
logger.info("x=%s" % x)         # eager formatting even if x is never logged
# RIGHT
f"{name} is {age}"              # general string building
logger.info("x=%s", x)          # lazy args INSIDE logging calls — not an f-string
```
Why: f-strings for building; lazy `%s` defers formatting until a handler needs it. **A blanket f-string ban in logging is itself a bug, not this rule** — `[CONSENSUS]`. Enforcement: ruff `UP031` (printf-string-formatting) / `UP032` (f-string conversion) cover general use; logging `G`-rules flag eager f-strings in log calls.
## 9. Mutable default arguments
```python
# WRONG
def f(x=[]): x.append(1); return x
# RIGHT
def f(x: list[int] | None = None):
    x = x if x is not None else []
# same trap in a dataclass: tags: list[str] = field(default_factory=list)
```
Why: the default is evaluated once at def-time, mutated across every call — CPython semantics, not opinion; the dataclass fix is the identical idea via `default_factory`. Enforcement: ruff `B006` (mutable-argument-default; flake8-bugbear).
## 10. `json.loads()` into untyped `dict`s threaded across the codebase
```python
# WRONG
data = json.loads(resp.text); process(data["user"]["id"])   # re-guessed at every call site
# RIGHT
class User(BaseModel):
    id: int
user = User.model_validate_json(resp.text)
```
Why: validate once at the boundary into a model; internals get typed access, not dict-key
guessing. `[CONSENSUS]` on architecture, FACT per pydantic docs. Stdlib `json` is not legacy
below ~1MB/one-off parsing — the ban is untyped *threading*, not the parser (picks →
`references/selection.md`). Enforcement: PG3 gate, grep `json.loads(` feeding >1 function with
no model between.
## 11. `print()` debugging left in operational code
```python
# WRONG
print(f"processing {item}")     # inside a library/service function
# RIGHT
logging.getLogger(__name__).debug("processing %s", item)
```
Why: `print()` can't be leveled/filtered/routed; stays legitimate for CLI user-facing output. `[CONSENSUS]`. Enforcement: ruff `T201` (part of the commented-optional `T20` group); per-file-ignores for CLI entrypoints.
## 12. `unittest.TestCase` boilerplate instead of pytest
```python
# WRONG
class TestFoo(unittest.TestCase):
    def test_x(self): self.assertEqual(f(1), 2)
# RIGHT
def test_x():
    assert f(1) == 2
```
Why: plain `assert` + fixtures compose; class hierarchy buys nothing. `[CONSENSUS]` — additive,
not a rewrite mandate for existing legacy suites. Enforcement: PG4 gate, pytest is house runner.
## 13. `requests`-by-reflex, incl. blocking inside `async def`
```python
# WRONG
async def fetch(url): return requests.get(url)          # blocks the event loop
# RIGHT
async def fetch(url):
    async with httpx.AsyncClient() as c: return await c.get(url)
```
Why: `requests` is sync-only, frozen by its own maintainers; blocking inside `async def` stalls
the loop. `[CONSENSUS]` on the default; ASYNC rules are FACT. Enforcement: ruff
`ASYNC100`/`ASYNC101`/`ASYNC102`; selection.md httpx row owns the sync-code default.
## 14. `time.sleep()` hand-rolled retry loops
```python
# WRONG
for i in range(3):
    try: return call()
    except Exception: time.sleep(2**i)
# RIGHT
@retry(stop=stop_after_attempt(3), wait=wait_exponential())
def call(): ...
```
Why: hand-rolled loops get backoff/jitter/final-exception handling wrong. `[CONSENSUS]`.
Enforcement: grep `time\.sleep\(` inside a `try`/`except`-shaped loop.
## 15. `__init__.py` cargo cult
```python
# WRONG: empty __init__.py dropped into every directory "so imports work"
# RIGHT: omit it; add one only for explicit re-exports / __all__ / package-init code
```
Why: PEP 420 namespace packages import fine without it — "fails without it" is a myth;
legitimate uses (exports, `__all__`, init code) still call for one. Enforcement: no mechanical
rule — review judgment.
## 16. Shebang / encoding-comment cargo cult
```python
# WRONG
#!/usr/bin/env python
# -*- coding: utf-8 -*-
# RIGHT
#!/usr/bin/env python3          # or a pyproject.toml console_scripts entry point, no shebang
```
Why: UTF-8 is the Py3 default source encoding (PEP 3120) — the coding comment is dead weight; a
bare `python` shebang is deprecated advice (PEP 394). Enforcement: no ruff rule — grep
`-\*- coding` for cleanup; prefer entry points for installed CLIs.
## 17. Global state / module-level singleton getters
```python
# WRONG
_client = None
def get_client():
    global _client
    if _client is None: _client = HttpClient()
    return _client
# RIGHT: pass the client explicitly, or a module-level constant built once at import —
# never a global-mutating getter.
```
Why: hidden shared state defeats testing/DI, hides init-order bugs. `[CONSENSUS]`/`[OPINION]` —
no single canonical PEP. Enforcement: no mechanical rule — grep `global ` inside a getter.
## 18. Class-based ceremony / premature OOP
```python
# WRONG
class Greeter:
    def greet(self, name): return f"hi {name}"
# RIGHT
def greet(name: str) -> str: return f"hi {name}"
```
Why: a class with no instance state buys nothing; functions + a typed data object are default.
`[OPINION]` grounded in consensus ("flat is better than nested"), not an official rule.
Enforcement: none mechanical — reach for a class only when state+behavior are genuinely coupled.

---

## Research-code addenda

Continues items 1–18's rank-and-argue shape; research/ML rows from the h2 second-sweep harvest + editor-adjudicated post-spec deltas, 2026-07-12.
## 19. `pytz` / manual UTC offsets instead of `zoneinfo`
```python
# WRONG
ts = datetime.now(pytz.utc); jst = datetime.now() + timedelta(hours=9)
# RIGHT
from zoneinfo import ZoneInfo
ts = datetime.now(ZoneInfo("UTC"))
```
Why: zoneinfo (stdlib 3.9+) replaces pytz's non-standard API and DST-unsafe manual offsets; Windows/minimal images need the `tzdata` package for the IANA db. Enforcement: item 7's `DTZ` family covers naive datetimes; no dedicated ruff rule bans `pytz` — grep `import pytz`.
## 20. Global `np.random.seed()` / bare `np.random.rand()`
```python
# WRONG
np.random.seed(42); x = np.random.rand(100)
# RIGHT
rng = np.random.default_rng(42); x = rng.random(100)
```
Why: global seeding mutates hidden module state that breaks under multiprocessing/joblib workers and makes multi-experiment scripts order-dependent; NumPy's own docs "recommend transitioning" — not deprecated, CONSENSUS default for new code (`references/research.md` §4 owns the full reproducibility chain). Enforcement: grep `np\.random\.seed\(|np\.random\.rand\(` outside test fixtures.
## 21. Unpickling a downloaded checkpoint (`torch.load` on a `.pt`/`.pkl`)
```python
# WRONG
weights = torch.load("downloaded_model.pt")
# RIGHT
from safetensors.torch import load_file
weights = load_file("downloaded_model.safetensors")
```
Why: pickle deserialization is RCE by design, not a bug — never unpickle a downloaded/shared checkpoint; safetensors is the audited HF-default replacement (`references/research.md` §4 is the full arguing home, kept summary-thin here). Enforcement: grep `torch\.load\(|pickle\.load\(` on any network- or third-party-sourced path.
## 22. Bare `requests.get()`/`httpx.get()` — no timeout, no client lifecycle
```python
# WRONG
def fetch(url): return httpx.get(url)
# RIGHT
def fetch(client: httpx.Client, url: str):
    return client.get(url, timeout=10.0)
```
Why: a bare call with no `timeout=` can hang indefinitely, and a fresh client per call skips connection pooling; inject a `Client`/`AsyncClient` with an explicit timeout, closed via `with`/DI. Enforcement: grep `httpx\.get\(|requests\.get\(` with no `timeout=`; ruff `B008` flags a client built as a function-default value.
## 23. `import japanize_matplotlib`
```python
# WRONG
import japanize_matplotlib
# RIGHT
import matplotlib.pyplot as plt
import matplotlib_fontja
```
Why: japanize-matplotlib's last release was 2020-10-21 (distutils dependency, hard-errors on Python 3.12+) yet still surfaces as the top search result; matplotlib_fontja is the actively maintained successor (bundles IPAex Gothic, Python 3.7-3.13). Enforcement: grep `import japanize_matplotlib` in new/owned diffs.

---

## Nuances that survive — NOT blanket bans

| Nuance | What's actually fine | Home |
|---|---|---|
| Lazy `%s` in logging | a blanket f-string ban in logging is itself a bug | item 8 |
| argparse's zero-dep niche | single-file tools / no-dep environments — legitimate | `references/selection.md` CLI row |
| stdlib `json` | fine below ~1MB/one-off parsing; the ban is untyped threading | item 10 |
| `__init__.py` | legitimate for explicit re-exports / `__all__` / package-init code | item 15 |
| shebang | `env python3` explicit, or an entry point — cargo cult only | item 16 |
| premature-OOP row | OPINION grounded in consensus, not a PEP/official rule | item 18 |

## Why models default stale

One line, because it changes review posture: a model regresses to its corpus's *modal
historical pattern* (recency skew + code-smell inheritance), not the best-practice ceiling —
so treat every row above as EXPECTED in generated code, not exceptional. The mechanical
first move is SKILL.md §1's ruff-first rule (project-pinned `uv run ruff check --fix && uv run
ruff format`) — one pointer, not restated here.
