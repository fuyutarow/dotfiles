# Quality gates — ruff, pytest, logging (PG4)

> SOLE home of PG4 — lint+format clean, tests are pytest, datetimes are aware, logging is
> disciplined. Library/tool SELECTION (which HTTP client, which web framework, structlog vs
> loguru) is `selection.md`'s job; this file owns how to configure ruff and how to use pytest
> and logging correctly once a pick is made. Type-checker verdict → `typing.md`. Boundary
> validation → `validation.md`.

## 1. ruff facts `[dated:2026-07]`

| Fact | Detail |
|---|---|
| Version | **0.15.21** (2026-07-09) — pin the exact version everywhere (see §3); don't float it. |
| Versioning | **NOT semver**: minor = breaking (a rule promoted to stable, a stable rule's or the formatter's behavior changed), patch = bug fixes + new *preview* rules. Read the changelog on every minor bump before upgrading in CI. |
| Formatter maturity | ">99.9% of lines formatted identically" to Black on large Black-formatted repos (Django, Zulip) — CONSENSUS-grade, production-safe. **Never claim byte-identical.** New formatter behavior ships behind `preview` first, then graduates per the versioning rule above. |
| Replaces | flake8 (+ plugins) · Black · isort · pydocstyle · pyupgrade · autoflake — official claim. |
| Does NOT replace | **pylint fully** — only 209/409 rules overlap (~51%), by ruff's own FAQ. **bandit fully** — `S` rules are a re-implemented subset; no official completeness claim exists. Say "covers a substantial, fast subset," never "replaces." |
| Plugins | "does not yet support third-party plugins" — all 900+ rules are built-in; you cannot extend it the way you could flake8. |
| Type checking | "a linter, not a type checker" (official FAQ) — pair with the dated checker verdict in `typing.md`. |

Pin the exact version (`ruff==0.15.21` in `pyproject.toml`'s dev group, `rev: v0.15.21` in
pre-commit) — a minor bump can silently change lint or format output out from under CI.

## 2. THE HOUSE STRICT CONFIG

Use the [canonical pyproject.toml](../../../../presets/uv/pyproject.toml) for the house Ruff settings. Keep the target Python floor aligned with the project metadata.

The `DTZ` gate is the *mechanical* enforcement; the argument for why naive datetimes rot lives
in `idioms.md`'s kill-list row — one pointer, don't restate it here.

Controversial groups — enable deliberately, not by copy-paste:

| Group | Why it's controversial | House call |
|---|---|---|
| `ANN` | noisy on partially-typed code | enable together WITH a real type checker (`typing.md`), never alone |
| `D` | noisy without a docstring convention already set | set `convention` first (see the preset), then enable |
| `PL` (esp. `PLR`) | `PLR` (too-many-args, magic-value-comparison) is the single most-disabled subgroup, community-wide | keep `PLC`/`PLE` on; tune or drop `PLR` per project |
| `S` | false positives on test code / known-safe patterns | IN the preset's house select (PG3/PG4 lean on S110/S301); scope via `per-file-ignores` on `tests/**`, never disable repo-wide |
| `C90` / `TD` / `FIX` | complexity threshold and TODO-tracking are genuine team preference | opt in only if the team wants it; `C90`/mccabe is off by default even here |

## 3. CI vs pre-commit — verify vs mutate, and the right order

CI **verifies, never mutates**:

```
ruff check .            # exit 1 on ANY violation — no --fix in CI
ruff format --check .   # exit 1 if formatting would change anything
```

Exit codes: `0` clean (or all-fixed, only with `--fix`) · `1` violations found / would reformat ·
`2` abnormal termination (config error, crash). `--exit-non-zero-on-fix` forces `1` even when
`--fix` auto-fixed everything — use it when a PR must still fail because its lint needed
auto-fixing, even though the fix succeeded.

pre-commit **mutates locally**, and hook order matters (official guidance: lint-fix runs before
format — a fix can reshape code that the formatter then normalizes; the reverse order can drift):

Use the [canonical hook configuration](../../../../presets/uv/.pre-commit-config.yaml); lint fixes precede formatting.

pre-commit vs prek:

| | pre-commit 4.6 | prek |
|---|---|---|
| Runtime | Python; bootstraps a venv per hook | single Rust binary; no Python bootstrap to run *prek itself* (still shells to uv for Python-hook envs) |
| Config | `.pre-commit-config.yaml` | reads the SAME yaml — drop-in; optional `prek.toml` |
| 2026-07 status | incumbent, safest default | uv-native rewrite; adopt when hook cold-start speed matters in an already-uv-first repo |

Default stays pre-commit. prek is the modern-track option for uv-first repos, not a mandated
switch — version/adoption detail → `environment.md`.

## 4. pytest discipline

- Plain `assert` in functions + fixtures (`conftest.py`) over `unittest.TestCase` subclassing —
  fixtures compose (layer, override, scope to session/module/function); `setUp`/`tearDown` don't.
- `@pytest.mark.parametrize` over copy-pasted near-duplicate test functions — one test body, many
  cases, one place to fix when the assertion changes.
- Exception paths test via `with pytest.raises(SpecificError, match=r"..."):` — the canonical
  negative-test idiom; parametrize it to enumerate invalid-input→expected-exception cases in one
  body, and reach for `hypothesis` when the invalid-input space outgrows enumeration. A test
  suite with no `pytest.raises` is asserting the happy path only.
- `unittest` is legacy for **new** tests — keep it only for suites already written in it; don't
  author new tests in it, and don't migrate a working legacy suite just to be modern.

Canon plugins — one line each, and when to reach for it:

| Plugin | Adds | Use when |
|---|---|---|
| `pytest-cov` | coverage reporting | you want a coverage number or gate — default-on |
| `pytest-xdist` | parallel runs (`-n N`) | the suite is slow enough to bottleneck the edit loop **and** P7 admitted the explicit worker/RAM envelope; never `-n auto` in agent/CI runs |
| `hypothesis` | property-based testing | the input space is bigger than enumerable example cases |
| `syrupy` | zero-dep snapshot testing | comparing large/structured output (serialized objects, rendered text) |
| `pytest-asyncio` **or** anyio's pytest plugin | async test support | asyncio-only codebase → `pytest-asyncio`; asyncio+Trio, or already on anyio → its plugin. Neither deprecates the other — pick ONE per codebase, don't run both. |

## 5. Logging discipline

- `logger = logging.getLogger(__name__)` per module — never a bare call on the root logger
  sprinkled through code.
- Configure handlers/formatters **once**, at the entrypoint (`main()`, an app factory) — never
  inside library code that runs on import.
- **Libraries**: stdlib `logging` only. Never import `structlog`/`loguru` inside a library — the
  application, not the library, owns the logging backend. (Which library apps should pick —
  `structlog` vs `loguru` vs stdlib — is `selection.md`'s verdict, not repeated here.)
- **Apps/services**: prefer the picked structured logger (`structlog`) for its `contextvars`-based
  context propagation, which stays correct across `async`/`await` boundaries; plain stdlib
  `logging` alone is fine below a structured-output need.
- Lazy `%s` args in log calls — `logger.info("user=%s", user_id)`, NOT an f-string — so the string
  is built only if the log level is enabled; `G`-rules (`flake8-logging-format`) enforce this.
  f-strings are still correct **everywhere else** in the codebase; a blanket "always f-string"
  rule is itself a bug when applied to log calls.
- `logger.exception(...)` inside an `except` block, not `logger.error(str(e))` — it preserves the
  traceback. `TRY400` is the enforcement.
- `print()` is CLI-user-facing output only — the thing a human reads as the program's product.
  It is never a substitute for operational logging; `T20` bans it elsewhere (see the
  commented-optional row in §2). The print-debugging anti-pattern itself is argued in
  `idioms.md`'s kill list — one pointer, not restated here.
