# Performance — Rust is NOT automatically fast

> **Writing something in Rust does not make it "blazing fast."** Rust gives you the *tools* for
> speed (zero-cost abstractions, no GC, low-level control) and guarantees the language/runtime
> won't get in your way — but a naive Rust program can be slower than Go or even Python. Speed is a
> **deliberate, measured, layered** activity. The canonical playbook is **The Rust Performance Book**
> (Nicholas Nethercote, `nnethercote.github.io/perf-book`) — cite it, and re-check any specific claim
> there (RG4). This file is the operational ladder; `references/ownership.md` owns clone-avoidance,
> `references/project.md` owns the `[profile]`/build settings, `references/selection.md` the crate
> versions.

## Two laws before any technique

1. **Measure first — "推測するな、計測せよ."** Do not optimize by guessing. Performance lives in ~1%
   of the code; find that 1% with a profiler (below) before touching anything. An unmeasured
   "faster" rewrite is a guess (this is RG4 applied to perf) — and often a *slower* one.
2. **Climb the ladder from cheapest+safest to advanced+risky.** The top rungs (build settings,
   not-allocating) are free and safe and yield the most; the bottom rungs (`unsafe`, SIMD,
   `transmute`) are dangerous and yield little on most code. **The model's failure mode here is
   OVER-REACH** — reaching for `get_unchecked`/`transmute`/`MaybeUninit` before profiling. Don't.

## The ladder

### Rung 1 — free, no code change (do these first)

- **`[profile.release]` build settings** — `lto`, `codegen-units = 1`, `strip`, optional `panic =
  "abort"`. One-time Cargo.toml edit, can be a large win. **Owned by `references/project.md`** — set
  it there. And always benchmark the *release* build; a debug build is 10–100× slower and tells you
  nothing.
- **Swap the global allocator** — `mimalloc` (small-alloc-heavy) or `tikv-jemallocator` (long-running
  services, fragmentation) via one `#[global_allocator]` static (below). Measurable win on
  allocation-heavy multithreaded workloads, zero code change. *After profiling.*
- **`-C target-cpu=native`** — lets LLVM use your CPU's newest SIMD (AVX2/AVX-512/NEON) for
  auto-vectorization, no code change. **Caveat**: the binary won't run on older CPUs — only for
  builds you deploy to known hardware. Set via `RUSTFLAGS` or `.cargo/config.toml`.

### Rung 2 — algorithmic & structural (biggest yield, no `unsafe`)

- **Don't allocate; don't clone.** The single biggest lever. Take `&str`/`&[T]` not `String`/`Vec`;
  reuse a buffer (`Vec::with_capacity` once, `.clear()` + refill in the loop); avoid intermediate
  `.collect()` — iterator chains fuse into one pass. Every reflex `.clone()`/`.to_owned()` removed is
  free speed. **Owned by `references/ownership.md`** — this dominates most "make it faster" work.
- **Right data structure & algorithm.** An O(n) linear scan you kept as a `Vec` when it should be a
  `HashMap` beats any micro-tuning as the loser. But a `Vec<(K,V)>` scanned linearly *beats* a
  `HashMap` for a handful of entries (cache-friendly). Insertion order → `indexmap`.
- **Iterators over manual indexing (and over `unsafe`).** `.iter()/.map()/.filter()/.sum()/.windows()`
  let LLVM prove indices are in range and **elide bounds checks** — typically as fast as or faster
  than `for i in 0..n { a[i] }`, with no `unsafe`. Reach for `get_unchecked` only when profiling
  proves the check is the bottleneck *and* an iterator can't express the loop (Rung 4).
- **Buffered I/O — `BufWriter`/`BufReader`.** Writing/reading a `File` or stdout **unbuffered** issues
  one syscall per call — pathologically slow. Wrapping in `BufWriter`/`BufReader` (amortize into
  memory, flush in bulk) is often a **10–100× win** on I/O-heavy code, zero risk. Chronically
  under-applied — check every raw `File`/`stdout` write.
- **Data layout for cache.** The CPU's slowest operation is reaching RAM; keep hot data in cache. A
  `Vec` (contiguous) beats a pointer-chasing `LinkedList`/tree for iteration. Order struct fields
  large-to-small to cut padding (`{ a: u8, b: u64, c: u8 }` is 24 bytes; reordered, 16) — a smaller
  struct means more per cache line. `#[repr(C)]`/`#[repr(packed)]` only with a real ABI/layout reason.
- **Zero-copy parsing.** Deserialize into borrowed types (`&str`/`&[u8]`, `#[serde(borrow)]`) instead
  of allocating a `String` per field; `bytes`/`bytemuck`/`rkyv` for byte-level zero-copy
  (`references/selection.md`). Don't build a `String` you immediately parse and drop.
- **Small collections on the stack** — `compact_str`/`smallvec`(pin 1.x)/`arrayvec`/`tinyvec` avoid
  heap allocs for usually-small data. Only after profiling shows allocation pressure; keep the inline
  size small. Note `compact_str` clone is O(n) (below / `selection.md`).

### Rung 3 — measured micro-levers

**Hashers — the DoS-vs-speed decision (by key TRUST, not raw speed):**

| Keys are… | Use | Why |
|---|---|---|
| **Untrusted** (network/user input keys the map) | **leave std `HashMap`** (SipHash-1-3) | HashDoS resistance; `foldhash`/`FxHash`/`ahash` have only WEAK resistance |
| **Trusted & internal**, hashing is a profiled hot spot | `foldhash` (hashbrown's own default) | fast, drop-in `RandomState` |
| **Integer / small trusted keys** | `rustc-hash` (`FxHashMap`) | fastest for ints; seedless |
| **Already-unique integer keys** (IDs) | a **No-op / identity `Hasher`** | the key IS the hash — skip hashing entirely (advanced; Rung 4) |

`rustc-hash` 2.0 changed its algorithm (same name, different bytes — pin 1.x if you persist hashes).

**Parallelism** — `rayon` (`.iter()`→`.par_iter()`) for CPU-bound data parallelism. **Never an async
runtime for CPU work** (async is for concurrent I/O — `references/async.md`); reductions go through
rayon's `.reduce()`/`.sum()`, never a shared `Arc<Mutex<_>>` accumulator (that serializes it).

### Rung 4 — advanced, correctness-risk, MEASURE-GATED (the model's over-reach trap)

**Almost no code needs these. Each is a dependency/footgun/`unsafe` justified only by a profile that
proved THIS specific spot dominates.** They are the 1% of the 1%. Listed so you recognize them, not
so you apply them by default:

- **`unsafe { get_unchecked(i) }`** — skip a bounds check. Only after profiling proves the check
  costs and no iterator expresses the loop; needs a `// SAFETY:` proof (`ownership.md`).
- **`transmute` / byte reinterpretation** — never raw `std::mem::transmute`; use `bytemuck`/`zerocopy`
  (safe, layout-checked — `selection.md`). Project Safe Transmute is still nightly.
- **`MaybeUninit` / skip zero-init** — `Vec::with_capacity` + `spare_capacity_mut`, or `bytes`, cover
  almost every case; raw `MaybeUninit`/`set_len` only in a measured memset bottleneck (`ownership.md`).
- **SIMD** — usually the compiler auto-vectorizes (help it: simple loops, `target-cpu=native`).
  Explicit `std::simd` is nightly; portable-simd crates exist but are niche.
- **PGO (profile-guided optimization)** — build an instrumented binary, run it on *representative*
  workload, rebuild with the profile. ~10–30% with zero code change on the right workload; a
  build-pipeline investment, not a code edit.
- **Monomorphization bloat control** — a generic fn duplicated per type can overflow the instruction
  cache. Extract the type-independent body into a non-generic inner fn so only a thin shell is
  monomorphized (a perf-book technique). Only when profiling shows I-cache pressure / binary bloat.
- **Const generics / `const` eval** — push a runtime value into a `const N: usize` type param so
  branches fold away at compile time; build tables with `const` eval / `OnceLock` so init cost is
  zero (`selection.md` compile-time section).
- **Lock-free atomics with relaxed `Ordering`, `thread_local!`, huge pages** — real levers for
  contended multithreaded hot paths, but easy to get subtly wrong; reach for them only with a
  concurrency profile and a correctness argument.
- **`std::hint::black_box`** — in benchmarks, to stop the optimizer deleting the work you're timing.

## Profiling & benchmarking — the tools

- **CPU profile**: `samply record ./target/release/bin` (cross-platform, Firefox-profiler UI) or
  `cargo flamegraph`; `perf` on Linux, Instruments on macOS. Profile a **release** build with
  debuginfo (the `[profile.profiling]` in `references/project.md`), never debug.
- **Microbenchmark**: `criterion` (`harness = false`) — statistical, the ecosystem default (moved to
  the `criterion-rs` org, 0.8; *not* stuck at bheisler 0.5.1). `divan` is a nicer API but **dormant**.
  Use `black_box` around inputs/outputs. The built-in `#[bench]` is still nightly-only.
- **Allocations**: `dhat` (as a dep) or `valgrind --tool=dhat`. **Compile speed** is a different axis
  — a faster linker (`lld`/`mold`) speeds *iteration*, not the binary (`references/project.md`).
- **Always** warm up, run release, compare to a baseline. A "faster" change you didn't measure is a guess.
