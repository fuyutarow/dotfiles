# Ownership discipline — restructure, don't escape-hatch (RG2)

> SOLE home of RG2. The borrow checker is a design oracle, not an obstacle. When it complains, the
> reflex `.clone()` / `Arc<Mutex<_>>` / `unsafe` / `.unwrap()` trades a *modeling* problem for a
> runtime cost, a lock, UB risk, or a hidden panic. **Restructure ownership first.** This file is
> the toolkit for doing that, plus the rules for the cases where an escape hatch is genuinely
> correct. Co-fires with `implementing-and-debugging`: the band-aid-vs-root-cause rule is its
> territory; this is the Rust-specific form.

## The deny-gate

Before you write `.clone()`, `Arc<Mutex<_>>`, `unsafe`, or `.unwrap()`/`.expect()` **to make a
compiler error go away**, stop. Name which of the two it is:

- **An honest cost** — the data really is owned/shared/fallible, and the construct models that.
  Fine. Write it, and if it's non-obvious, one comment saying why.
- **An escape hatch** — you reached for it because the borrow checker complained and this was the
  fastest way to silence it. **Forbidden as a first move.** Apply a restructuring below.

The tell: you can't say in one sentence *why the data must be owned/shared/fallible here*. If the
answer is "because otherwise it doesn't compile," that's the escape hatch.

## Restructuring toolkit — reach for these before cloning

| Symptom | Restructure |
|---|---|
| A function takes `String` / `Vec<T>` / `PathBuf` and callers `.clone()` to pass | Take a **borrow**: `&str` / `&[T]` / `&Path`. A function that only reads should never own its input. This deletes most reflex clones at a stroke |
| Returns maybe-borrowed-maybe-owned data; you clone "to be safe" | **`Cow<'_, str>`** (or `Cow<[T]>`): borrow in the common case, own only when you must mutate/extend |
| "cannot borrow `x` as mutable because it's also borrowed as immutable" over two *fields* | **Split the borrow**: destructure the struct (`let Foo { a, b } = &mut foo;`), or `split_at_mut`, or hold the two fields in separate variables. The borrow checker tracks fields, not just the whole struct |
| Holding a reference into a collection across a mutation of it | **Index, don't hold**: keep a `usize` index (or a key) instead of a `&`, and re-index after the mutation. Or collect the needed data out first |
| "cannot move out of borrowed content" while updating in place | **`std::mem::take` / `mem::replace` / `mem::swap`**: swap the owned value out, transform it, put it back — no clone |
| Look-up-then-insert forces two borrows of a map | The **`entry` API**: `map.entry(k).or_insert_with(..)` — one borrow, no double lookup, no clone of the key beyond what entry needs |
| A borrow "lasts too long" and blocks a later mutation | **Scope it**: put the borrowing expression in a `{ }` block, or just let NLL end it — often reordering two lines fixes it. Bind the result you need (`let n = v.len();`) so the borrow ends before the mutation |
| You need to hand data to another function and keep using it | Ask if the callee needs to **own** it. If it only reads → borrow. If ownership genuinely transfers → move, and restructure *your* code to not need it after |

**When `.clone()` IS the right answer** (a decision, not a reflex): the value is `Copy`-cheap or
tiny (a small enum, a short `SmolStr`); you're crossing a thread/task boundary and the data must
live independently; `Arc::clone` to share ownership of genuinely shared immutable data (that's a
refcount bump, not a deep copy — write `Arc::clone(&x)`, not `x.clone()`, to say so); a one-time
clone at a system boundary where the alternative is lifetime spaghetti for no runtime win. The
bar is: you can state the reason in one line.

## Sharing: `Rc`/`Arc` and interior mutability — when it's real, and when it's a smell

Reaching for `Rc<RefCell<T>>` or `Arc<Mutex<T>>` is *sometimes exactly right* (a genuinely shared,
mutable graph; shared state across tasks) and *often* a sign you're modeling a tree as a graph.
Order of preference:

1. **Single owner + borrows** — the default. Most data has one owner and is passed by reference.
2. **Shared immutable** → `Arc<T>` (multi-thread) / `Rc<T>` (single-thread). No lock needed; readers
   share. For a rarely-updated global read from many threads, `arc-swap` beats `RwLock` (selection.md).
3. **Shared mutable, single-thread** → `Rc<RefCell<T>>` — but `RefCell` moves borrow-checking to
   *runtime*: a double mutable borrow panics. Keep the borrows short and local.
4. **Shared mutable, multi-thread** → `Arc<Mutex<T>>` / `Arc<RwLock<T>>` — **std `sync` first**;
   `parking_lot` only when you need one of its *features* (no-poison, guard mapping, timeouts),
   never "because faster" (selection.md). For a concurrent *map*, don't wrap a `HashMap` — use
   `scc` (or `RwLock<HashMap>` at low contention; `dashmap` only knowing its
   hold-a-`Ref`-across-ops deadlock footgun — selection.md). For counters, prefer `Atomic*` over
   a `Mutex<u64>`.

If you find `Arc<Mutex<_>>` spreading across the whole program, that's the async-plus-shared-state
smell: consider message passing (a channel — `flume`/`tokio::sync::mpsc`, selection.md) so one task
owns the state and others send it messages, instead of every task locking it.

## `unsafe` — minimize the surface, document every block

- **Prefer a safe crate over hand-rolled `unsafe`.** Byte reinterpretation → `bytemuck`/`zerocopy`
  (selection.md), not a hand `transmute`. Uninitialized buffers → almost always `Vec::with_capacity`
  + `extend`, or the `bytes` crate — not raw pointers.
- **Every `unsafe` block carries a `// SAFETY:` comment** stating the invariant it upholds and why
  it holds here. This is greppable and clippy-enforceable (`clippy::undocumented_unsafe_blocks`).
  An `unsafe` block with no SAFETY line is an RG2 violation.
- **Edition 2024 tightens the `unsafe` surface** — the edition rules are OWNED by
  `references/project.md` (read them there). The one practical consequence for this file: inside an
  `unsafe fn`, still wrap each unsafe op in its own explicit `unsafe { }` block with its `// SAFETY:` line.
- **Keep the unsafe surface small**: wrap it in a safe abstraction whose public API upholds the
  invariant, so callers never touch `unsafe`. Isolation makes it auditable.

### `MaybeUninit` — a real but *rare* tool

`std::mem::uninitialized()` is deprecated and instant-UB; never use it. Its replacement is
`MaybeUninit<T>`, but a model should **almost never reach for it**. "Allocate a big buffer without
paying for initialization" is nearly always better served by `Vec::with_capacity(n)` + `push`/
`extend` (no reallocation, no uninit), `vec![0u8; n]` (the zeroing is cheap and often optimized),
or the `bytes` crate. `MaybeUninit` is justified only in genuinely measured hot paths writing
through FFI or building a `[T; N]` element-by-element — and then behind a safe wrapper with a
SAFETY proof. If you're about to write `MaybeUninit` in ordinary application code, it's premature:
use `with_capacity`.

## The `unwrap`/`expect` rule (RG3 boundary)

`.unwrap()`/`.expect()` on a fallible path is an escape hatch too — it converts an error you should
handle into a panic. In **library** code on a fallible path: forbidden (`clippy::unwrap_used`).
In a **binary**, prefer `?` up to `main() -> anyhow::Result<()>`; reserve `.expect("reason")` for
a genuine invariant that a failure means a bug (with a message stating the invariant), and never
bare `.unwrap()`. Full error model → `references/errors.md`.
