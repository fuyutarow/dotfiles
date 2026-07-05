# Async discipline — a coloring cost, earned not defaulted

> Owns the async *argument*. The runtime and async-crate versions live in `references/selection.md`;
> this file argues *whether and how* to go async. The governing fact: **`async` is a function color
> that infects every caller** — once one function is `async`, its callers must be `async` (or block
> on a runtime), you need a runtime to run any of it, and blocking work now silently stalls the
> executor. That cost is worth paying for *concurrent I/O*, and rarely otherwise.

## Sync by default — reach for a runtime only for concurrent I/O

Ask what the program actually does:

| The work is… | Do NOT | DO |
|---|---|---|
| **One-shot I/O** (one HTTP GET, read a file, one query) | pull `tokio` + mark everything `async` | stay sync — `ureq` for HTTP, `std::fs`, a blocking DB call (selection.md) |
| **CPU-bound** (parsing, hashing, compute) | put it in `async fn`s | threads / `rayon`; async gives *nothing* to CPU work and blocks the executor |
| **Concurrent I/O** (many sockets/requests/timers in flight at once) | — | *this* is what async is for — `tokio`, `reqwest`, `axum` (selection.md) |
| **A CLI or one-shot tool** | `#[tokio::main]` reflexively | sync `main`; add a runtime only if it genuinely fans out concurrent I/O |

The tell that async was cargo-culted: a `#[tokio::main]` whose body `.await`s exactly one thing in
sequence. That program is sync wearing an async costume — it pays the runtime + coloring cost for
no concurrency. (This is over-reach §2.1 in SKILL.md.)

## Never block the executor

An async runtime multiplexes many tasks onto few OS threads. A blocking call in an `async fn`
parks the whole worker thread — other tasks stall. Inside async code:

- **No `std::thread::sleep`** → `tokio::time::sleep(..).await`.
- **No `std::fs` / blocking `std::net`** on the hot path → `tokio::fs`, `tokio::net` (or accept it's
  rare and wrap in `spawn_blocking`).
- **A synchronous/CPU-heavy or blocking-C call** → `tokio::task::spawn_blocking(|| …).await` (moves
  it to a blocking-thread pool), or hand CPU work to `rayon` and `.await` a oneshot channel.
- **Don't hold a `std::sync::Mutex` guard across `.await`** — the guard is `!Send`, so the future
  becomes `!Send` (won't `spawn` on a multithread runtime), and even single-threaded it invites
  deadlock. Either drop the guard *before* the `.await`, or use `tokio::sync::Mutex` (whose guard is
  await-safe) — and only when the lock genuinely must span the await.

## async fn in traits (AFIT) vs `async-trait` — the current boundary

Native `async fn` in traits is stable `[dated:2026-07]` (since 1.75). It is the default for most
traits and needs no crate. But it does **not** cover every case; know the three gaps:

1. **`dyn` dispatch.** A trait with a native `async fn` is not automatically `dyn`-compatible — you
   can't (directly) make a `Box<dyn MyTrait>` of it. If you need a trait object of an async trait,
   the `async-trait` crate (which boxes the returned future) is still the pragmatic answer.
2. **`Send` bounds on the returned future.** Native AFIT gives you no way to say "the future this
   returns is `Send`" in the trait definition — so a public trait meant for a multithreaded runtime
   (tokio) can produce futures that won't `spawn`. Fix with the **`trait-variant`** crate
   (`#[trait_variant::make(Send)]`) to generate a `Send`-bounded variant, or (as it stabilizes)
   return-type notation. Names/versions → selection.md.
3. **Naming the future type** (e.g. to store it) — native AFIT hides it; use RPITIT / `impl Trait`
   patterns or `async-trait` when you must name or bound it.

Decision: **internal or single-implementor async trait → native AFIT** (no crate). **Public async
trait needing `dyn` or guaranteed-`Send` futures → `async-trait` (for `dyn`) or `trait-variant`
(for the `Send` variant).** Reaching for `async-trait` on *every* async trait out of habit is the
stale-training tell — it boxes a future you often don't need boxed.

## Cancellation is `drop`, and `select!` can lose work

In Rust, **dropping a future cancels it** — it simply stops being polled, mid-`.await`. That makes
cancellation cheap but introduces **cancellation-safety**: a future dropped between two awaits may
leave state half-done. `tokio::select!` drops the losers of each race — if a losing branch had
consumed data (e.g. read from a socket), that data can be lost. Only `.await` cancellation-safe
operations in a `select!` loop (the tokio docs mark which are), or restructure so the partial work
is recoverable. For cooperative shutdown of many tasks, use `tokio_util::sync::CancellationToken`
(selection.md) rather than ad-hoc flags.

## `futures` combinators

`join!`/`try_join!` (run futures concurrently, await all), `select!` (race), and the `StreamExt`/
`TryStreamExt` adapters live in the `futures` crate (or `tokio`'s own `join!`/`select!`). Use them
instead of hand-spawning + channel plumbing for simple concurrency. `futures-lite` is the lighter
subset when you don't want the full `futures` build cost (selection.md). Prefer structured
concurrency (`JoinSet`, scoped tasks) over fire-and-forget `tokio::spawn` you never join.
