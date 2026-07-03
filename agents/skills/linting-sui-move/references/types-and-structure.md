# Method syntax, enums/match, file structure

> MS-*, ENUM-*, STRUCT-*, public(package). Parent: `../SKILL.md`.

## 2.1 Method syntax (WARNING) — the flagship Move 2024 ergonomic

- **MS-001 principle** — a fn whose first arg is `&T`/`&mut T` **of its own struct** MUST name it
  `self` and be called `obj.f()`.
  - `✅` receiver: `self: &Counter`, `self: &mut Account`.
  - `❌` NOT a receiver (keep `module::fn` form): `ctx: &TxContext`, `coin: &mut Coin<SUI>`, `clock: &Clock`.
  - Checkpoints: (1) first arg `&YourStruct`/`&mut YourStruct` → `self` required; (2) first arg external type → no `self`; (3) constructor (`new`) → no `self`.
  ```move
  public fun balance(self: &Account): u64 { self.balance_value }
  let bal = account.balance();   // ✅ reads cleanly
  ```
- **MS-002 stdlib is method-syntax-complete** — prefer the receiver form:

  | | old → method |
  |---|---|
  | Vector | `vector::length(&v)` → `v.length()` · `vector::push_back(&mut v, x)` → `v.push_back(x)` · `vector::pop_back(&mut v)` → `v.pop_back()` |
  | Option | `option::is_some(&o)` → `o.is_some()` · `option::borrow(&o)` → `o.borrow()` |
  | String | `string::length(&s)` → `s.length()` · `string::is_empty(&s)` → `s.is_empty()` |
  | Coin | `coin::value(&c)` → `c.value()` · `coin::split(&mut c, n)` → `c.split(n)` |
  | Object | `object::id(&o)` → `o.id()` · `object::id_address(&o)` → `o.id_address()` |

- **MS-003 exceptions (keep `module::function`)** — static/constructor/factory (`Counter::new(0, ctx)`); type-inference-hard (`bcs::to_bytes(&data)`); deliberate module-boundary clarity (`transfer::public_transfer(obj, addr)`).

## 2.2 Enums & pattern matching

- **ENUM-001 variant forms** [ERROR] — unit `Pending`; tuple `Processing(u64)`; named `Completed { amount: u64, timestamp: u64 }`.
- **ENUM-002 exhaustive match** [ERROR] — cover **all** variants; **avoid `_` wildcard** (it silently swallows newly-added variants → regressions).
  ```move
  match status {                                 // ✅ exhaustive
      OrderStatus::Pending => handle_pending(),
      OrderStatus::Processing(amount) => handle_processing(amount),
      OrderStatus::Completed { amount, timestamp } => handle_completed(amount, timestamp),
  }
  // ❌ `_ => ..` hides missing handling when a variant is added
  ```
- **ENUM-003 variant names = PascalCase** [ERROR] — `❌ pending, PROCESSING` → `✅ Pending, Processing`.
- **ENUM-004 versioning** [WARNING] — adding a variant to an existing enum is breaking. Define `OrderStatusV2`, provide a migration fn, keep V1.

## 3.1 File structure (WARNING)

- **STRUCT-001 section comments** — order: `=== Imports ===` → `Constants` → `Errors` → `Structs` → `Events` → `Public Functions` → `Package Functions` → `Private Functions` → `Test Functions`.
- **STRUCT-002 visibility order** — entry → public → `public(package)` → private → test.
- **STRUCT-003 ability order** — canonical `key, copy, drop, store`. `❌ has store, key, drop` → `✅ has key, drop, store`.

## 3.2 public(package) over friend (INFO)

`friend` is deprecated. `❌ friend module; public(friend) fun f()` → `✅ public(package) fun f()`.
