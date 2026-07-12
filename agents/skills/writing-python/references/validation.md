# Boundary validation — the pydantic v2 cut (PG3)

> SOLE home of PG3 — the boundary-validation *argument*. SKILL.md §PG3 states the gate and its
> grep artifact; this file argues *why* and carries the full v1→v2 table. Library/version picks
> for other data-shape jobs live in `references/selection.md` — this file owns the CUT itself.

## The decisive cut: trust boundary vs domain layer

| | External / untrusted data | Internal / trusted domain |
|---|---|---|
| Source | API/form body, env var, config file, CLI arg, LLM/tool-call output, webhook | already validated once, read from your own DB, passed between your own functions |
| Needs | coercion, rich errors, JSON Schema/OpenAPI, strict/lax control | just a typed container — re-validating it on every call is pure overhead |
| Default | **pydantic v2** `BaseModel` (or `TypeAdapter` for a bare type) | `dataclass(slots=True)` — or `attrs` if you need validators/converters |

**CONSENSUS** (official + independent, [dated:2026-07]): attrs' own docs draw the canonical line —
*"Pydantic is a data validation library designed for parsing untrusted external data. attrs builds
well-behaved classes for your domain layer."* Independent 2026 synthesis converges on the same cut
("choose based on whether you're at a trust boundary … or building internal structures"). Treat
this as settled, not a matter of taste: **validate at the boundary EXACTLY ONCE; everything past it
stays plain.** Re-validating trusted internals with another `BaseModel` on every call is the
opposite mistake from skipping validation — both cost you, in different directions.

## Decision table (by job)

| Job | Default | Why | Escape hatch |
|---|---|---|---|
| API request/response bodies | **pydantic v2** `BaseModel` | untrusted external data; coercion + rich errors + JSON Schema/OpenAPI | msgspec if profiled hot path, no OpenAPI need |
| Env vars / app config | **pydantic-settings** `BaseSettings` | purpose-built; env vars win over `.env`; nested via `env_nested_delimiter="__"` | bare `os.environ` + dataclass for a trivial single-file script |
| Bare type (list/TypedDict/primitive), no model class | **`TypeAdapter`** | reuses pydantic-core without a `BaseModel` wrapper | — |
| LLM/tool-call or structured output | **pydantic v2** `model_validate_json` / `TypeAdapter` | still a trust boundary — strict/lax control matters most here | msgspec if raw decode speed dominates and the shape is fixed |
| Internal domain / value objects, post-boundary | **`dataclass(slots=True)`** | zero deps, stdlib since 3.10, real memory/speed win, "just a container" | `attrs` if you need validators/converters/rich `__eq__` beyond dataclasses |
| Internal objects needing validators/converters | **`attrs`** (+ `cattrs` for (de)structuring) | validators/converters/equality without JSON-Schema machinery | — |
| Hot serialization loop, profiled, known schema | **`msgspec`** | 6x–85x observed speedups over pydantic depending on op (msgspec's own benchmarks — vendor-measured, say so); validates during decode in one pass | pydantic if you also need OpenAPI/rich validators — don't pay the latency tax for convenience you don't use |

Litestar's own request/response layer is msgspec-based internally — on Litestar the fast path is
already there; pick/version detail lives in `selection.md`, not repeated here.

## pydantic v2 usage floor

```python
from pydantic import BaseModel, ConfigDict, field_validator, TypeAdapter

class User(BaseModel):
    model_config = ConfigDict(strict=False)   # class attr, not `class Config:`

    @field_validator("name")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("name must not be blank")
        return v

# module scope — build once, reuse; schema-building has real overhead per official docs
_users_adapter = TypeAdapter(list[User])
```

- `model_config = ConfigDict(...)` is a class **attribute**, not an inner `class Config:`.
- `@field_validator` (+ `@classmethod`) / `@model_validator` replace `@validator`.
- Default is **lax mode**: coerces (`'123'` → `123`, ISO date strings → `date`). **Strict mode**
  rejects mismatches instead — set per-call (`TypeAdapter(...).validate_python(x, strict=True)`),
  per-field (`Field(strict=True)` / `StrictInt`), or per-model (`ConfigDict(strict=True)`).
- **Gotcha**: strict mode still accepts date/datetime **strings specifically from JSON input**
  (JSON has no native date type) — `strict=True` does not close that hole. Don't assume it does.
- Build a `TypeAdapter` **once at module scope**, not per call — rebuilding pays schema-build cost
  every time.
- Current: pydantic **2.13.4** (2026-05-06) [dated:2026-07]; a 2.14.0a1 prerelease exists. v3 is
  scoped SMALL per the project's own planning (pydantic/pydantic#10033 + version-policy docs:
  remove the v1 compat shims / `pydantic.v1`, fold pydantic-core in as an internal submodule) —
  NOT a v1→v2-scale rewrite. There is no reason to wait for v3; treat v2 as the multi-year
  default. [dated:2026-07]

## THE v1→v2 kill table

v1 idioms still **run** under v2 (deprecation-shimmed, not removed) — code silently "works" while
rotting on `PydanticDeprecatedSince20` warnings. That's why the artifact for PG3 is a **grep**, not
the test suite: tests pass on shimmed v1 code too.

| v1 (wrong in v2 code) | v2 (correct) |
|---|---|
| `@validator('field')` | `@field_validator('field')` (+ `@classmethod`, new signature; `@model_validator` for whole-model) |
| `.dict()` | `.model_dump()` |
| `.json()` | `.model_dump_json()` |
| `class Config:` inner class | `model_config = ConfigDict(...)` class attribute |
| `.parse_obj(data)` | `.model_validate(data)` |
| `.parse_raw(data)` | `.model_validate_json(data)` |
| `parse_obj_as(Type, data)` | `TypeAdapter(Type).validate_python(data)` |
| `.construct()` | `.model_construct()` |
| `.copy()` | `.model_copy()` |
| `__fields__` | `model_fields` |
| `.update_forward_refs()` | `.model_rebuild()` |
| `Config.orm_mode = True` / `.from_orm()` | `ConfigDict(from_attributes=True)` + `.model_validate(obj)` |
| `Config.allow_population_by_field_name` | `populate_by_name` |
| `Config.anystr_lower` / `anystr_strip_whitespace` | `str_to_lower` / `str_strip_whitespace` |
| `@validate_arguments` | `@validate_call` |

**Enforcement (the PG3 artifact)**: any file importing `pydantic` must grep clean —

```
grep -RnE '@validator\(|\.dict\(\)|class Config:' <files importing pydantic>
```

A hit is a v1 idiom that still executes but is already rotting. Fix it at the point you touch the
file; don't wait for a removal release to force the migration.

## When NOT pydantic (honest rows)

- **Trusted internal hot paths**: data already validated once at the boundary — re-validating it
  again on every internal call via another `BaseModel` is waste, not safety.
- **`TypedDict`**: static type-checking only, **zero runtime validation**. Fine for internal,
  already-trusted shapes threaded through typed code — never a substitute for a boundary model,
  even though it "type-checks" the same way `BaseModel` does. If external data ever reaches a
  `TypedDict` un-validated, that's a PG3 violation wearing a type hint.
- **`msgspec.Struct`**: reach for it when you've profiled a hot serialization loop and the schema
  is fixed and known — not as a default replacement for pydantic at ordinary boundaries.
