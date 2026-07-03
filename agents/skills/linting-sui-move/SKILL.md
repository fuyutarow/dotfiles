---
name: linting-sui-move
description: Lint/review Sui Move 2024 code against a house style guide the compiler cannot fully enforce — Move 2024 compile-forced rules (public struct, let mut, module;, default aliases), naming (EPascalCase error consts + #[error], snake_case fns, no get_), method syntax (self receiver), match exhaustiveness (no _ wildcard), container selection gas-cliffs (VecMap<100 else Table; no vector::remove in loops), vector macros (map!/filter!/fold!), BCS peel-order discipline, and mutable-reference security. Use when writing or reviewing .move files, a Sui Move package, Move.toml, or a Sui smart contract. Machine floor is `sui move build`; this skill owns the WARNING/INFO tier the compiler won't catch. Not for Aptos Move (framework differs) or non-Move code. English skill; respond in the user's language (default Japanese).
---

# Linting Sui Move — house style for Move 2024

> **Version**: v2607.1.0 (2026-07-04) — forged from the in-house *Sui Move Linter スタイルガイド v3.0*.
> **Scope**: Sui Move **2024 edition** style/quality/gas/security review. Host-agnostic; the
> concrete toolchain floor is `sui move`.
> **Out of scope**: Aptos Move (different framework/stdlib), non-Move code, general
> bug-hunting (→ `/code-review`), prose (→ `linting-prose`).

## THE LAW

> Move 2024 trades backward-compat for explicitness, so its **ERROR tier is compile-forced —
> the compiler is the floor, not this skill.** This skill's value is the tier the compiler will
> NOT flag: method-syntax ergonomics, naming/ability discipline, the container-selection gas
> cliffs that only bite at scale, vector-macro idiom, BCS peel-order correctness, and
> mutable-reference security. Every rule ships a **`❌ → ✅` pair and a rule ID**; a review that
> names no rule ID and cites no line is not a review — it is an opinion.

## Severity — fix order

| Tier | Meaning | Action |
|---|---|---|
| **ERROR** | compile-forced, or a security / gas-cliff defect | MUST fix (many are `sui move build` failures) |
| **WARNING** | idiom / maintainability / readability | SHOULD fix |
| **INFO** | optimization / micro-gas | consider |

## Machine floor — run this FIRST, don't hand-check what the compiler checks

```bash
sui move build            # ERROR-tier (M2024-*, ENUM-002 exhaustiveness) are compile errors here
sui move build --lint     # Sui's built-in Move linter — a subset of these style lints
sui move test             # #[test] / #[expected_failure] — verify behavior, not just shape
```

The compiler owns the ERROR-tier syntax rules; **do not re-derive them by eye when a build
would say so.** This skill's semantic layer — method syntax, naming beyond compile, container
choice, macros, BCS order, security surface — is exactly what a green build still misses.

## The always-fire core (present in nearly every .move file)

**Move 2024 compile set** — full detail in [references/language-spec.md](references/language-spec.md):

| ID | Rule | ❌ → ✅ |
|---|---|---|
| M2024-001 | struct visibility explicit | `struct Counter has key` → `public struct Counter has key` |
| M2024-002 | `mut` on reassigned locals | `let value = x;` → `let mut value = x;` |
| M2024-003 | semicolon module form | `module app::m { .. }` → `module app::m;` |
| M2024-004 | no reserved words as idents | `let enum = 5;` → `let enum_type = 5;` |
| M2024-005 | no redundant default aliases | `use sui::object::{Self, ID, UID};` → use `UID`/`object::new()` directly |

**Naming** (ERROR) — full detail in language-spec.md:

- NAME-001 package = PascalCase · NAME-003 consts = `UPPER_SNAKE_CASE` · NAME-004 fns = `snake_case`
- NAME-002 error consts = `EPascalCase`, `#[error]` for custom messages, **declaration order == error code → never delete an existing error (breaks downstream codes); `#[deprecated]` instead**
- NAME-005 no `get_` prefix on getters: `get_balance` → `balance`
- NAME-006 constructors: `new()` / `create_and_share()` / `create_for_user()`

**Type & structure** — full detail in [references/types-and-structure.md](references/types-and-structure.md):

- **MS-001 method syntax**: a fn whose first arg is `&T`/`&mut T` of *its own* struct MUST name it `self` and be called `obj.f()`. Exclude `&TxContext`/`&Clock`/`&Coin` and constructors.
- **ENUM-002 exhaustive match**: cover all variants; **avoid `_` wildcard** (it hides regressions when a variant is added).
- **STRUCT-003 ability order**: canonical `key, copy, drop, store` (`has key, drop, store`, not `has store, key, drop`).
- ENUM-003 variants PascalCase · 3.2 prefer `public(package)` over deprecated `friend`.

**Gas cliffs** (ERROR) — full detail in [references/performance-and-bcs.md](references/performance-and-bcs.md):

- **PERF-ANTI-001**: `VecMap`/`VecSet` are O(n) on every op → **≥100 elements MUST move to `Table`/`ObjectTable`**.
- **PERF-ANTI-002**: `vector::remove(i)` is O(n) (O(n²) in a loop) → `swap_remove` (O(1), order-free) or filter-into-new.

**Security** (ERROR) — full detail in [references/performance-and-bcs.md](references/performance-and-bcs.md#security):

- **SEC-001**: never `public fun borrow_mut(&mut self): &mut T` — expose a *controlled* `update(&mut self, value)`; gate raw mut behind `public(package)`.
- **SEC-002**: delete or downgrade unused `public` functions — every one widens the attack surface.

## Reference index — open the one the review needs

| File | Covers | Open when |
|---|---|---|
| [references/language-spec.md](references/language-spec.md) | M2024-001..005, Move.toml, NAME-001..006, ATTR-001..002 | any file; naming/Move.toml/error-const review |
| [references/types-and-structure.md](references/types-and-structure.md) | MS-001..003 (+ stdlib method table), ENUM-001..004, STRUCT-001..003, public(package) | method-syntax, enums/match, file layout, ability order |
| [references/performance-and-bcs.md](references/performance-and-bcs.md) | container-selection flowchart + complexity table, PERF-001..003 / PERF-ANTI / PERF-BEST, vector macros MACRO-001..003, BCS-001..006, SEC-001..002 | data-structure choice, gas, `sui::bcs` parsing, public-API security |

## Gotchas

- **The stdlib is method-syntax-complete**: `v.length()`, `opt.is_some()`, `c.value()` — prefer it over `vector::length(&v)`. But `bcs::to_bytes(&data)`, `transfer::public_transfer(..)`, and constructors stay `module::function` form (MS-003).
- **BCS peel order == write order** (BCS-002): `peel_*()` in a different order than the struct's field declaration silently reads garbage or aborts. Put a `version: u8` first field for forward compat (BCS-005).
- **`fold!` in one pass** (MACRO-003): fold a tuple accumulator `(sum, count, max)` rather than three separate traversals.
- **"expected O(1)" is load-factor-dependent**, not worst-case — but Sui dynamic-field collisions are rare, so treat `Table` ops as O(1) for design (references/performance-and-bcs.md has the full complexity table).

## Fire / no-fire

FIRES: writing or reviewing a `.move` file · a Sui Move package or `Move.toml` · "this Move code / smart contract をレビュー" · questions about method syntax / container choice / BCS peel / error-const numbering / abilities in **Sui** Move.

MUST NOT fire: **Aptos** Move (different framework, stdlib, and object model — say so and stop) · non-Move code · a general bug review with no Move-style angle (→ `/code-review`) · prose/docs (→ `linting-prose`) · pure `sui` CLI/deploy ops with no source under review.
