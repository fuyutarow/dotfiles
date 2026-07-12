# Typing discipline & the checker verdict (PG2)

> SOLE home of the type-checker **verdict** (dated, re-verify before citing if the run is
> >2 quarters stale) and typing **syntax discipline**. Dependency picks for other domains live
> in `selection.md`; the runtime validation model (pydantic v2, the v1→v2 kill table, when
> TypedDict is a legitimate boundary substitute) is `validation.md`'s arguing home — this file
> only draws the STATIC vs RUNTIME line and points there. PG2's artifact is a checker run, not
> a claim: "typed" without a clean run is unverified.

## 1. Checker landscape — conformance table

> Snapshot: official python/typing conformance suite (139 tests), run 2026-03-11, commit
> `62491d5` [dated:2026-03, cited 2026-07]. Later upticks (ty reportedly ~100 passing on a
> since-grown suite, pyrefly reportedly >90%) surface only in secondary blog aggregation, not
> the primary dashboard (404'd on direct fetch) — **UNVERIFIED, do not cite as current**.

| Checker | Conformance | Pass | FP | FN | Status |
|---|---|---|---|---|---|
| pyright | **97.8%** | 136/139 | 15 | 4 | stable, editor-standard (1.1.411, 2026-06) |
| pyrefly | 87.8% | 122/139 | 52 | 21 | stable v1.0 (2026-05-12), Instagram-scale prod |
| mypy | 58.3% | 81/139 | 231 | 76 | stable, plugin-anchored incumbent (2.2.0, 2026-07) |
| ty | 53.2% | 74/139 | 159 | **211** | **BETA** 0.0.x (0.0.58, 2026-07) — see caveat below |

### VERDICT [dated:2026-07]

- **Default: pyright strict** (or **basedpyright** — same conformance line, pure-PyPI
  dev-dependency, no Node/npm friction, and it reimplements Pylance-only editor features
  open-source for non-VSCode editors). Highest verified conformance by a wide margin; strict
  mode is battle-tested, not beta.
- **Defensible alternative: pyrefly** — stable v1, real hyperscale production (Instagram
  ~20M LOC pre-1.0), monthly cadence, reads existing mypy/pyright config to ease migration.
  Choose it when optimizing for single fast Rust binary + long-term velocity over today's
  ~10-point conformance gap versus pyright — a genuine team call, not a fallback.
- **mypy**: keep ONLY when CI is already built around it AND a hard plugin dependency anchors
  it — django-stubs, SQLAlchemy plugin, or the **pydantic mypy plugin** (still actively
  maintained; adds `init_typed`/`init_forbid_extra`/frozen-model enforcement/typed
  `model_construct` that bare mypy field synthesis does not give you). Otherwise its
  conformance and speed disadvantage are hard to justify for a new strict-2026 project.
- **ty**: run ALONGSIDE, never INSTEAD OF, pyright/pyrefly/mypy. Explicitly beta (0.0.x
  versioning, PyPI classifier "4 - Beta," Astral's own docs promise no version-to-version
  stability). Its 53.2% is dominated by **211 false negatives — unimplemented checks that
  silently pass**, not wrong verdicts. **The single most important caveat: a green ty run
  means "not checked," not "clean"** — it is indistinguishable from a clean pyright run in CI
  output but is not evidence of type-safety.
- Re-evaluate the default when ty crosses ~90% conformance AND leaves 0.0.x versioning — track
  via `github.com/astral-sh/ty` releases and the typing conformance dashboard directly, never
  via blog buzz.

## 2. Strict rollout

- `[tool.pyright]` in pyproject.toml (or `pyrightconfig.json`): `typeCheckingMode = "strict"`.
- Expect a **~10x jump** in reported errors going standard→strict on an existing codebase —
  the #1 "flip strict mode, diff explodes" trap.
- Correct move: path-scoped incremental rollout, e.g. `"strict": ["src/new/**"]` — never flip
  a whole repo at once.
- mypy strict-flag equivalent, if pinned to mypy: `--warn-unused-configs
  --disallow-any-generics --disallow-subclassing-any --disallow-untyped-calls
  --disallow-untyped-defs --disallow-incomplete-defs --check-untyped-defs
  --disallow-untyped-decorators --no-implicit-optional --warn-redundant-casts
  --warn-unused-ignores --warn-return-any --no-implicit-reexport --strict-equality`.

## 3. Syntax discipline

- PEP 585 (generic builtins, 3.9+) and PEP 604 (`X | Y` unions, 3.10+) are **mandatory** on
  every supported interpreter: `list[int]` / `dict[str, int]` over `typing.List`/`Dict`;
  `int | None` over `Optional[int]` — ruff `UP006`/`UP007` autofix both.
- **Abstract containers annotate via `collections.abc`**, not concrete builtins and not
  `typing.*` aliases: parameters take `Iterable[X]` / `Mapping[K, V]` / `Sequence[X]` /
  `Callable[..., R]` from `collections.abc` (accept the widest thing you actually need);
  returns are usually concrete (`list[X]`, `dict[K, V]`).
  - Type parameters erase at runtime (`list[str]()` is a plain list — zero enforcement): a
    recurring gotcha where code expects runtime enforcement from generics and gets none.
    Validation still needs pydantic/explicit checks at the boundary (`validation.md`).
  - On ≤3.9 without `from __future__ import annotations`, bare `|` unions fail at runtime
    outside annotation contexts — gate by the project's target-Python floor.
- PEP 695 (`class C[T]`, `type X = ...`) on **≥3.12 only**:
  ```python
  class ClassA[T: str]:
      def method1(self) -> T: ...
  type ListOrSet[T] = list[T] | set[T]
  ```
  Eliminates manual `TypeVar`/`Generic` and infers variance automatically. Do NOT enable
  ruff's PEP-695 autofix on a codebase with a ≤3.11 floor — it silently breaks the older
  interpreters; verify the floor first.
- Implicit `Optional` is **banned**: `def f(x: int = None)` must be `x: int | None = None`
  explicitly. `--no-implicit-optional` (mypy, default since ≥0.990) and pyright strict both
  reject the bare form.

## 4. Structural typing: Protocol vs ABC

| | Protocol (PEP 544) | ABC |
|---|---|---|
| Subtyping | structural — right shape satisfies it, no inheritance | nominal — explicit inheritance required |
| Use for | third-party/uncontrolled classes, interface-only contracts, minimal coupling | a hierarchy you own, shared default-method behavior, unconditional runtime guarantees |
| `isinstance()` | only with `@runtime_checkable`, and even then checks attribute/method **presence**, not signatures | works unconditionally |

Don't reach for `Protocol` + `@runtime_checkable` expecting signature checking at runtime — it
isn't there; it only confirms the names exist.

## 5. TypedDict vs pydantic BaseModel — the static/runtime line (pointer)

TypedDict is **static-type-checking-only: zero runtime validation or coercion**. It's a typing
convenience for shapes you already trust internally (state threaded between your own
functions) — never a substitute for boundary validation. WHAT validates a real boundary
(pydantic v2 model shape, when TypedDict is a legitimate internal choice, the v1→v2 kill
table) is `validation.md`'s arguing home; this file only draws the static-vs-runtime line
above — do not duplicate the boundary decision table here.

## 6. `dataclass(slots=True)` gotchas (3.10+)

- Generates `__slots__` by returning a **new class object**, not the original — breaks
  identity checks and any decorator that cached by class object across the decoration.
- `TypeError` if `__slots__` is already hand-defined, or if a base's `__init_subclass__` takes
  args combined with `slots=True` (cpython gh-91126) — workaround: a no-arg/defaulted
  `__init_subclass__`.
- Since 3.11: a field already in a base class's slots is **not** re-added to a subclass's
  generated slots — don't introspect `__slots__` for field names, use `dataclasses.fields()`.
- `weakref_slot=True` (3.11+) requires `slots=True` too, or it errors.
- Don't retrofit `slots=True` onto an existing inheritance hierarchy blindly — adding a field
  to a slotted base without bumping subclasses can silently duplicate slots.

## 7. `Any` policy

| Legitimate | Banned |
|---|---|
| genuinely dynamic/untyped third-party code, no stubs available | default fallback for "too much effort to type" |
| a narrow, explicitly-commented escape hatch (`# type: ignore[no-any-return]  # untyped C extension`) | a parameter that should be a `Protocol`/`TypeVar` |
| generic containers before a pydantic/TypedDict boundary normalizes them | a return type where callers need the real shape |

Enforcement: `--disallow-any-generics` (mypy) and strict pyright's ~30 extra rules exist
specifically to squeeze out lazy `Any` — treat a bare `Any` outside the legitimate column as a
PG2 finding, not a style nit.

**Escape hatches name their diagnostic.** Every `# type: ignore` carries the specific code
(`# type: ignore[arg-type]`, never bare) plus a one-line justification; every `cast()` gets the
same one-line why. A bare ignore/cast is a PG2 finding — it silences future, unrelated errors
on that line and hides the original reason from the next reader. (`warn_unused_ignores` /
pyright's `reportUnnecessaryTypeIgnoreComment` then keep the hatches from outliving their
cause.)

## 8. Python 3.14 deferred annotations (PEP 649/749)

Forward references no longer need string-quoting. But code that reads `__annotations__`
directly — rather than through `typing.get_type_hints()` / `annotationlib.get_annotations()`
— may now see unevaluated/deferred forms. Real trap for hand-rolled introspection or
serialization code assuming eager evaluation: always resolve through the API, never read raw
`__annotations__`.
