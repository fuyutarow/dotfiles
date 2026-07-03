# Performance / gas, vector macros, BCS, security

> PERF-*, MACRO-*, BCS-*, SEC-*. Parent: `../SKILL.md`. Container choice and `vector::remove`
> misuse are the two gas defects that only bite at scale — catch them in review, not in prod.

## 4.1 Container selection (PERF-FLOW) — the decision that sets gas cost

```text
Your use case?
├─ frequent key lookup / update / delete
│  ├─ < 100 elements → VecMap<K,V>   (simple, fast enough; O(n) but fine)
│  └─ ≥ 100 elements → Table<K,V>    (expected O(1); REQUIRED)
├─ order must be preserved
│  ├─ order + key access   → LinkedTable<K,V>
│  ├─ order + index access → TableVec<T> (≥1000) or vector<T> (<1000)
│  └─ order only           → vector<T>
├─ heterogeneous value types
│  ├─ values have `key` → ObjectBag
│  └─ plain values      → Bag
└─ values are objects (`key` ability)
   ├─ key access → ObjectTable<K,V>
   └─ + heterogeneous → ObjectBag
```

- **PERF-001 random access** [WARNING] — `< 100` → `VecMap` acceptable (O(n) but practical); `≥ 100` → `Table`/`ObjectTable` required (expected O(1)).
- **PERF-002 order preserved** [WARNING] — order + random access → `LinkedTable`; order + index → `TableVec` (≥1000) / `vector` (<1000); order only → `vector`.
- **PERF-003 index access** [WARNING] — `<1000` → `vector` (memory-efficient); `≥1000` → `TableVec` (dynamic-field sharding, unbounded); order-free + frequent delete → `swap_remove` (O(1)).

## 4.2 Complexity reference (INFO)

| Container | add | remove | lookup | traverse | size |
|---|---|---|---|---|---|
| `std::vector<T>` | push_back O(1)*, insert(i) O(n) | pop_back O(1), remove(i) O(n), swap_remove O(1) | index O(1), contains/index_of O(n) | O(n) | O(1) |
| `Table<K,V>` | O(1)** | O(1)** | O(1)** | **no API** | O(1) |
| `Bag` | O(1)** | O(1)** | contains O(1)** | **no API** | O(1) |
| `ObjectTable<K,V>` | O(1)** | O(1)** | O(1)** | **no API** | O(1) |
| `ObjectBag` | O(1)** | O(1)** | contains O(1)** | **no API** | O(1) |
| `LinkedTable<K,V>` | push_front/back O(1)** | pop/remove O(1)** | borrow/prev/next O(1)** | O(n) | O(1) |
| `TableVec<T>` | push_back O(1)** | pop_back O(1)**, swap_remove O(1) | borrow(i) O(1)** | O(n) | O(1) |
| `VecMap<K,V>` | O(n) | O(n) | get/contains O(n) | O(n) | O(1) |
| `VecSet<K>` | O(n) | O(n) | contains O(n) | O(n) | O(1) |

`*` amortized O(1) (O(n) on reallocation). `**` expected O(1) under healthy load factor. Gas
note: dynamic fields cost gas **on access**; actual cost also depends on bytes read/written —
O(1) on a large object is still expensive.

## 4.3 Anti-patterns (ERROR)

- **PERF-ANTI-001 VecMap/VecSet at scale** — every op is O(n); `contains/get/insert/remove` linear-scan each call. `≥ 100` elements → migrate to `Table`/`ObjectTable`.
- **PERF-ANTI-002 `vector::remove` overuse** — `remove(i)` is O(n) (shifts all elements after `i`) → O(n²) in a loop. Order-free → `swap_remove(i)` (O(1)); order-needed → filter into a new vector; frequent → logical-delete flag + batched physical delete.

## 4.4 Large-data best practices (INFO)

- **PERF-BEST-001 batching** — split large processing across txns (start_index + batch_size, ~100–1000 records/txn depending on gas limits); client loops over txns. Keep the "to-process" list in a `TableVec` beside the primary `Table`.
- **PERF-BEST-002 secondary indexes** — primary `ObjectTable<PrimaryKey, Entity>`; secondary `Table<SecondaryKey, TableVec<PrimaryKey>>`, synced on every add/delete. Trade-off: higher write cost for faster lookup (e.g. `nfts_by_owner`, `nfts_by_collection`).

## 4.5 Vector macros (Move 2024)

Prefer macros over hand loops for traverse/transform/aggregate — clearer intent, strict type
checks, no off-by-one bugs.

- **Must-know (≈90% of cases)**: `map!`/`map_ref!` (transform), `filter!` (select), `fold!` (aggregate), `do!`/`do_mut!` (side effects).
- **Situational**: `any!`/`all!` (predicate, early-return), `find_index!` (first match), `zip_do!`/`zip_map!` (pair two vectors).
- **Advanced**: `tabulate!`, `partition!`, `take_while!`/`skip_while!`, `insertion_sort_by!` (≤30), `merge_sort_by!` (>30).
- **MACRO-001** [WARNING] — prefer macros over loops for traverse/transform/aggregate.
- **MACRO-002 `map!` vs `map_ref!`** [WARNING] — `map!(v, f)` consumes `v` (move semantics, need ownership); `map_ref!(v, f)` keeps `v` (reference is enough).
- **MACRO-003 one-pass `fold!`** [INFO] — fold a tuple accumulator instead of multiple traversals:
  ```move
  let (sum, count, max) = v.fold!((0, 0, 0), |(s, c, m), x| (s + x, c + 1, if (x > m) x else m));
  ```

## 4.6 BCS (Binary Canonical Serialization)

- **BCS-001 characteristics** [INFO] — deterministic (same data → same bytes), compact (ULEB128 var-length), type-safe (full Move-type integration), verification-friendly (plays well with crypto hashes/signatures).
- **BCS-002 parse pattern** [WARNING] — `bcs::new(bytes)` → `peel_*()` → `into_remainder_bytes()`.
  **Read order MUST equal write order** — a wrong order reads garbage; a size mismatch aborts.
  ```move
  use sui::bcs::{Self, BCS};
  fun deserialize(bytes: vector<u8>): (u8, u64, address) {
      let mut prepared: BCS = bcs::new(bytes);
      let action_type = prepared.peel_u8();
      let amount = prepared.peel_u64();
      let user = prepared.peel_address();
      (action_type, amount, user)
  }
  ```
- **BCS-003 peel functions** [ERROR] — primitives: `peel_bool`/`peel_u8` (1B), `peel_u16` (2B, LE), `peel_u32` (4B), `peel_u64` (8B), `peel_u128` (16B), `peel_u256`/`peel_address` (32B). Vectors: `peel_vec_length`, `peel_vec_u8`, `peel_vec_bool`, `peel_vec_address`.
- **BCS-004 error handling** [ERROR] — validate length before peel (`if (bytes.length() < 8) return option::none()`); match peel order to struct field declaration order exactly.
- **BCS-005 versioning** [WARNING] — put `version: u8` as the **first** field; branch on it; use `Option<T>` for backward-compatible additions.
- **BCS-006 gas** [INFO] — minimize serialized size: pick the smallest int (`u8`<`u16`<`u32`<`u64`), use `Option` (absent = 1 byte `0x00`), exploit ULEB vector length (≤127 → 1 byte).

## Part V — Security (ERROR) {#security}

- **SEC-001 restrict mutable-reference exposure** — public `&mut` lets external code break invariants.
  - `❌ public fun borrow_mut(&mut self): &mut T` (arbitrary external mutation)
  - `✅ public fun update(&mut self, value: T)` (controlled) · `✅ public(package) fun borrow_mut_internal(&mut self): &mut T` (package-only)
- **SEC-002 delete unused public functions** — every unused `public` fn widens the attack surface; delete it or downgrade to `fun`.

## Review checklist (rule IDs)

`M2024-001..005` · `NAME-001..006` · `MS-001..003` · `ENUM-001..004` · `ATTR-001..002` ·
`STRUCT-001..003` · `PERF-FLOW` · `PERF-001..003` · `PERF-ANTI-001..002` · `PERF-BEST-001..002` ·
`MACRO-001..003` · `BCS-001..006` · `SEC-001..002`. Cite the ID + the line when you flag.
