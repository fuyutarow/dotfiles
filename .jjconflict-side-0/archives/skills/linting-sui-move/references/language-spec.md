# Language spec, Move.toml, naming, attributes

> M2024-* (compile-forced), Move.toml, NAME-*, ATTR-*. Parent: `../SKILL.md`.

## Part I — Move 2024 required (ERROR, compile-forced)

Move 2024 sacrifices backward compat for type-safety and explicitness; these are enforced at
**compile time** — `sui move build` fails without them.

- **M2024-001 struct visibility explicit** — `❌ struct Counter has key { .. }` → `✅ public struct Counter has key { .. }`. Auto-fixable. Makes cross-module access control explicit.
- **M2024-002 `mut` on reassigned locals** — `❌ let value = x; value = value + 1;` → `✅ let mut value = x; value = value + 1;`. Auto-fixable. Mutability visible at a glance.
- **M2024-003 semicolon module form** — `❌ module counter_app::counter { .. }` → `✅ module counter_app::counter;` (body follows). Separates declaration from body.
- **M2024-004 no reserved words as identifiers** — `enum`, `match` are reserved. `❌ let enum = 5; let match = true;` → `✅ let enum_type = 5; let match_result = true;`.
- **M2024-005 no redundant default aliases** [WARNING] — Move 2024 auto-provides aliases; explicit imports warn.
  - Available without `use`: types `UID`, `ID`, `TxContext`; modules `sui::object`, `sui::transfer`, `sui::tx_context`.
  - `❌ use sui::object::{Self, ID, UID};` / `❌ use sui::transfer;` → `✅` use `UID`, `TxContext`, `object::new()` directly; import only what is NOT default (`Coin<SUI>`, `event`, `clock::Clock`).

## 1.2 Move.toml (ERROR)

```toml
[package]
name = "CounterApp"        # PascalCase required (NAME-001)
version = "0.0.1"
edition = "2024"           # required for enum/match

[addresses]
counter_app = "0x0"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/mainnet" }
```

## 1.3 Naming (ERROR)

- **NAME-001 package = PascalCase** — `❌ name = "counter_app"` → `✅ name = "CounterApp"`.
- **NAME-002 error consts** — `E`-prefixed PascalCase; `#[error]` for custom messages.
  - `❌ const ERROR_INVALID: u64 = 0;` (prefix) · `❌ const EInvalidInput: vector<u8> = b"..";` (missing `#[error]`)
  - `✅ const EInvalidInput: u64 = 0;` (u64 code) · `✅ #[error] const EInvalidInput: vector<u8> = b"..";` (custom message)
  - **Best practice — the error-code contract**: declaration order == error code, so **keep declaration order**, **never delete an existing error** (it renumbers everything after it), mark unused ones `#[deprecated]`, and group with category comments.
- **NAME-003 consts = UPPER_SNAKE_CASE** — `❌ const maxValue` → `✅ const MAX_VALUE`.
- **NAME-004 fns = snake_case** — `❌ public fun CreateCounter()` → `✅ public fun create_counter()`.
- **NAME-005 no `get_` prefix** — `❌ get_balance(self: &Account): u64` → `✅ balance(self: &Account): u64`.
- **NAME-006 constructor patterns** — `new()` (returns object only) · `create_and_share()` (create + share) · `create_for_user()` (create + transfer).

## 2.3 Attributes (ATTR)

- **ATTR-001 test attributes** [ERROR/WARNING] — `#[test]` on test fns, `#[test_only]` on test helpers, `#[expected_failure(abort_code = EInvalidInput)]` on failure tests.
- **ATTR-002 `#[error]` auto-numbering** [WARNING] — `✅ #[error] const EInvalidInput: vector<u8> = b"..";` (auto); `❌ #[error(code = 1)] ..` (manual code not needed).
