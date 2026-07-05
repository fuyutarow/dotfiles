---
name: writing-rust
description: >-
  Write correct, MODERN (2025/2026) Rust — crate SELECTION is the spine. Use whenever writing or
  reviewing Rust, editing Cargo.toml / dependencies, or choosing a crate. Cuts (resolve at match
  time): language-agnostic change/debug → implementing-and-debugging (co-fire FIRST on a
  feature/bugfix); behavior-preserving restructure → refactoring-code (governs; this supplies the
  clippy / cargo-check / tests oracle); Python tooling → running-python-tools (but PyO3 / maturin
  bindings FROM Rust stay HERE); prose/README → linting-prose; Julia/TS → writing-julia /
  writing-typescript. NOT for installing Rust-written CLI tools (ripgrep/eza) or concept
  explainers with no code. Trigger on: Rust, cargo, crate, Cargo.toml, どの crate, blazing fast / 高速化,
  依存選定, async / tokio, borrow checker / 所有権 / lifetime, clone / Arc<Mutex>, unsafe / SAFETY,
  anyhow / thiserror / eyre / miette, serde / rkyv, clap / argh / bpaf, rayon /
  dashmap, once_cell / lazy_static / OnceLock / LazyLock, bon / derive_more / strum / nutype,
  jiff / chrono / time, winnow / nom, reqwest / ureq / axum, tracing, edition 2024. MANDATORY — read BEFORE writing ANY Rust or adding ANY dependency. Crate facts
  ROT: verify against crates.io / lib.rs before recommending (RG4). Sync before async; ownership
  before clone; lightest crate before the famous one. Workflow-native: crate-landscape harvest +
  adversarial verification fan out; the selection decision stays SOLO. English skill; respond in
  the user's language (default Japanese).
paths: "**/*.rs"
---

# Writing Rust — modern crate selection & coding discipline

> **Version**: v2607.1.0 (2026-07-06) — crate landscape verified against crates.io / lib.rs
>   `[dated:2026-07]`. Forged from a 15-category adversarially-verified harvest (see
>   `tests/forge-verification-ledger.md`), NOT from the raw catalog it started as.
> **Scope**: correct, effective, current Rust for real projects — with crate selection as the
>   spine. `SKILL.md` holds the two precedence-setting sections inline (§1 modern default stack +
>   the deltas your training misses; §2 the four over-reaches read FIRST); everything else lives in
>   `references/` and loads on demand.
> **Out of scope**: teaching Rust syntax to someone who doesn't know it (the model does); a
>   general crate encyclopedia (`references/selection.md` is a lookup, not a starter kit); OS/
>   embedded-specific stacks beyond a pointer (embassy / heapless named, not expanded).
> **Build verify (atomic — all ship in one commit)**:
>   `for f in selection async errors ownership performance project; do test -f references/$f.md || echo MISSING $f; done; for t in trigger-set forge-verification-ledger; do test -f tests/$t.md || echo MISSING $t; done`
> **Staleness registry** — fast-moving facts carry an in-place `[dated:YYYY-MM]` tag (locality >
>   isolation: the fact IS the decision input where it sits). Before trusting one,
>   `grep -rn '\[dated:' agents/skills/writing-rust/` and re-verify anything older than ~2 quarters
>   against crates.io / lib.rs: the §1 supersession table · every version in `references/selection.md`
>   · edition-2024 baseline · the async-trait / AFIT boundary (async.md) · the allocator/hasher
>   defaults (performance.md). The mechanical floor is `forging-skills/scripts/skill-check.sh`
>   (shared; this skill ships no scripts/).

## THE LAW

> In Rust the ecosystem IS the language: most of a project's effectiveness is decided by
> **SELECTION**, before a line is written. A dependency, an `async` coloring, and an `unsafe`
> block are each a liability paid at every future build, read, and audit — **earn them, never
> default to them.** A `.clone()` or `Arc<Mutex<_>>` reached for to quiet the borrow checker is a
> modeling smell, not a fix. And crate facts **ROT** — a recommendation you have not checked
> against crates.io / lib.rs today is a guess, not knowledge. Precedence:
> **right crate before hand-roll · lightest fit before famous · sync before async · ownership
> before clone · verified before recommended.**

## The gates — RG0–RG4, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **RG0 SELECT-BY-ROLE** (§1 + selection.md, deny-gate) | Choose each crate by the JOB and current maintenance, from `references/selection.md` — **never by fame or training-recency.** App binary → `anyhow`/`eyre`; library → `thiserror` (RG3). **Sync by default**; `tokio` only for real concurrent I/O (async.md). Lightest crate that fits (`argh`/`ureq`/`rusqlite` over `clap`/`reqwest`/`sqlx` when the job is small). | Every added dependency traces to a named job + a one-line "why not the lighter / std alternative"; selection.md is the lookup |
| **RG1 DEP-HYGIENE** (project.md) | `edition = "2024"`; **no declared-but-unused deps**; features trimmed (`default-features = false` where it buys something); workspace-inherited versions; supply chain checked | `cargo machete` (or `cargo +nightly udeps`) clean; `cargo deny check` / `cargo audit` clean; Cargo.toml `[features]` audited |
| **RG2 OWNERSHIP-NOT-ESCAPE-HATCH** (ownership.md, deny-gate) | Do **not** `.clone()` / `Arc<Mutex<_>>` / `unsafe` / `.unwrap()` to make the compiler stop complaining — restructure ownership (borrow, `Cow`, split borrows, index-don't-hold). Every `unsafe` carries a `// SAFETY:` line stating the upheld invariant | `clippy` clean under `undocumented_unsafe_blocks`; no hot-path `.clone()` without a one-line reason; `unsafe` blocks greppable-commented |
| **RG3 ERROR-MODEL** (errors.md) | Binary → `anyhow`/`eyre` + `.context()`; library → a typed `thiserror` enum. `?` not hand-rolled `match`. **No `unwrap`/`expect`/`panic!` on a fallible path in library non-test code** | lib crate: `clippy::unwrap_used` + `expect_used` clean; public error is an `enum`, not `Box<dyn Error>` by default |
| **RG4 VERIFY-BEFORE-RECOMMEND** (staleness, citation-relay) | A crate fact not checked against crates.io / lib.rs **today** is a guess: before adding or recommending, confirm the latest version + last-release recency; a crate with no release in ~18 months is a maintenance flag to state. Dated facts carry `[dated:YYYY-MM]` | `grep -rn '\[dated:'` re-verified per the header registry; each recommendation cites a checked version |

## Routing — sibling cuts (reciprocal)

| Sibling | Cut |
|---|---|
| `implementing-and-debugging` | **Co-fire on any non-trivial Rust feature/bugfix, with ORDER**: that skill owns language-agnostic change-safety (intent reconstruction, edit-surface scoping, **root-cause vs symptom** — a `.clone()`/`unwrap()` band-aid is the symptom-fix it forbids, RG2 is the Rust form, regression fear) — run its BUILD/DEBUG gate FIRST; this skill owns what correct Rust looks like inside that frame (RG0–RG4). |
| `refactoring-code` | **Co-fire on any behavior-preserving Rust restructuring, with ORDER**: its two-hats / oracle / deny-gate govern the change discipline; this skill supplies the Rust **oracle** (`cargo check` + `clippy` + `cargo nextest` green as the bracket) and the Rust-safe transforms (module/visibility moves, ownership refactors, `impl Trait` extraction). A Rust refactor that improves no named property is still 場当たり churn — its deny-gate applies unchanged. |
| `running-python-tools` | LANGUAGE cut: Python CLIs / uv / pip territory → there. Calling Python FROM Rust or exposing Rust TO Python (**PyO3 / maturin / the FFI boundary**) → HERE — that is a Rust dependency-architecture decision (RG0 / selection.md), not Python tooling. |
| `writing-julia` / `writing-typescript` | LANGUAGE cut: different language, disjoint — Julia numerics → writing-julia; `.ts/.tsx` idiom → writing-typescript; Rust → here. Same family shape (LAW + gates + selection spine). |
| `growing-oss-adoption` | PURPOSE cut: if the Rust crate is being published for ADOPTION (naming, positioning, README-as-landing-page, distribution, benchmarks-as-marketing) → that skill. The code and its crate selection → here. |
| `raising-resolution` | Silent sub-step (its owner-filter routes Rust work here): inspect the actual `Cargo.toml` / `cargo tree` / crates.io / `rustc --version` before asserting a crate or edition fact (this IS RG4). |

## MUST NOT FIRE

A question ABOUT the Rust ecosystem or language with no code to write (licensing, "what is
crates.io", Rust history, "is Rust faster than Go", a pure concept explainer like "what is a
lifetime") — plain answer. Installing or using a **Rust-written end-user
CLI tool** (ripgrep, eza, bat, fd, starship) — that is package management (Brewfile / cargo
install), **not writing Rust**. Prose/docs ABOUT a Rust project (README narrative, paper text) →
`linting-prose` / `structuring-documents`. Non-Rust code with no Rust in play (Go/C++/Python
numerics) → the owning language skill or a plain answer. The full near-miss set is
`tests/trigger-set.md` — desk-check it after any description edit.

---

This skill provides crate-selection and coding rules partitioned by consequence. **Read §1 and
§2 below first** — they set precedence: in Rust, the wrong selection is more expensive than the
wrong line. Then open the reference that matches the task.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/selection.md` | **THE SPINE** — per-job default crate + the switch condition, by category (error, async, serde, CLI/config, concurrency, builders/derive, data-representation, testing, HTTP/web, DB, observability, time/IDs, parsing, perf/alloc/hashing). A lookup catalog: **add a crate at point of first use, never preemptively** | choosing which crate to add for any task; auditing a `Cargo.toml`'s dependency choices |
| `references/async.md` | The async coloring cost — sync-by-default; `tokio` only for concurrent I/O; **native async-fn-in-traits (AFIT) vs `async-trait`** — what AFIT still can't do; `futures` vs `futures-lite`; cancellation (`CancellationToken`); `spawn_blocking`; common async footguns | any decision to introduce `async` / a runtime; a trait with an async method; "why is my async slow / stuck" |
| `references/errors.md` | RG3 home — the app-vs-library error split; `anyhow`/`eyre` context vs `thiserror` enums; `miette`/`snafu`/`error-stack` niches; `?` and `From`; no-`unwrap`-in-lib; error-enum design | writing any error type; designing a public API's fallibility; choosing an error crate |
| `references/ownership.md` | RG2 home — the borrow-checker-discipline: restructure ownership instead of `.clone()`/`Arc<Mutex>`/`unsafe`; references, `Cow`, split borrows, `Rc`/`Arc` when sharing is real, interior mutability, when `.clone()` IS correct; `unsafe` + `// SAFETY:` discipline | fighting the borrow checker; reaching for `.clone()`/`Arc<Mutex>`/`unsafe`; a lifetime error |
| `references/performance.md` | **Rust is NOT automatically fast** — the measured, layered ladder (grounded in *The Rust Performance Book*): build settings → don't-allocate/clone → data layout, buffered I/O, iterators → hashers/allocator/`rayon` → the advanced tier (SIMD/PGO/`unsafe`/`transmute`) gated behind profiling. The model's over-reach trap: reaching for `unsafe`/`get_unchecked` before measuring | asked to make code faster / 高速化 / "blazing fast"; a **measured**-slow hot path; choosing a hasher/allocator |
| `references/project.md` | RG1 home — edition 2024, dependency hygiene (unused-dep pruning, feature trimming, `cargo deny`/`audit`/`machete`), workspace + dependency inheritance, `[profile]` release tuning, MSRV, `xtask`, test/lint tooling (`cargo-nextest`, clippy lint config) | setting up / auditing a project or workspace; CI; `Cargo.toml` structure; lint & test configuration |

---

## 1. The modern default stack + the deltas your training misses

> **`[dated:2026-07]` — RG4 applies: re-verify against crates.io / lib.rs before trusting.**
> The full per-job matrix with versions is `references/selection.md`; this is the at-a-glance
> spine and the SOLE home of the supersession table below.

**The safe modern default for each universal job** (reach for the alternative only on the stated
condition — that condition is in selection.md):

| Job | 2026 default | Reach past it when |
|---|---|---|
| Errors — app binary | `anyhow` (or `eyre`/`color-eyre` for rich reports) | — |
| Errors — library | `thiserror` (typed enum) | — |
| Serialize / deserialize | `serde` + `serde_json` | zero-copy → `rkyv`; compact Rust↔Rust → `postcard`/`bitcode` (**not `bincode` — unmaintained**) |
| CLI args | `clap` (derive) | tiny tool / fast build / small binary → `argh` / `bpaf` / `lexopt` |
| Data-parallelism | `rayon` | — |
| Async runtime | `tokio` — **only if the job is concurrent I/O** | simple/one-shot → stay sync; tiny → `smol` |
| HTTP client | `reqwest` (async) | one sync call, no runtime → `ureq` |
| Web server | `axum` | — (actix-web is a live alternative, not the default) |
| Lazy static / global | **std `OnceLock` / `LazyLock`** | complex cases only → `once_cell` |
| Builder | `bon` | — (or plain `Default` + struct-update for simple cases) |
| Logging / tracing | `tracing` + `tracing-subscriber` | trivial CLI with no async → `log` + `env_logger` is enough |
| Date/time | `jiff` (modern option, pre-1.0) or `chrono` (still fine) — selection.md | existing chrono code → stay chrono |
| Hash map (non-DoS, fast) | `rustc-hash` (`FxHashMap`) / `foldhash` | untrusted input → keep the DoS-resistant std default |

**Supersessions — a former default has been replaced; using the old one now is a tell that
training data is stale** `[dated:2026-07]` (SOLE home; verified in the forge ledger):

| Former default | Now use | Since | Residual caveat (when the old thing is still needed) |
|---|---|---|---|
| `lazy_static` / `once_cell` for a global | std `OnceLock` (1.70, 2023-06) / `LazyLock` (1.80, 2024-07) | 1.80 | `once_cell` only for `get_or_try_init` (fallible init — still nightly in std) or `no_std` |
| `crossbeam::scope` for scoped threads | std `thread::scope` | 1.63 | `crossbeam` still for channels / deque / epoch GC |
| `async-trait` on every async trait | native `async fn` in traits (AFIT) | 1.75 | `async-trait` still for `dyn`-dispatch / object-safe async traits + explicit `Send` bounds → see async.md |
| `structopt` | `clap` v4 derive | clap 4 | none — structopt is retired, its author merged it into clap |
| `nom` for a new parser | `winnow` 1.0 (nom's maintainer's successor) | winnow 1.0, 2026-03 | `nom` fine for existing code; `pest` for grammar-file PEG; `chumsky` for great error messages |

*(Deliberately NOT in this table: `chrono` → `jiff`. Using chrono is NOT a stale-training tell —
chrono is maintained and fine in 2026; `jiff` is the modern, correctness-first **option** and still
pre-1.0. The date/time decision lives in selection.md.)*

*(This table is reconciled against the adversarial harvest before every freeze — do not edit a
row without re-checking crates.io; the ledger records the last verification.)*

**The "その手があったか" table — a grungy manual pattern you'd write by hand, and the crate that
erases it** `[dated:2026-07]`. This is the highest-value axis of the whole skill: a capable model
already knows `serde`/`tokio`, so naming them changes nothing — but it will *write the tedious
manual pattern* because its training does not connect the pain to the crate that deletes it. When
you catch yourself about to write the left column, reach for the right (SOLE home; detail in the
named reference):

| The tedious pattern you're about to write | Erased by | How |
|---|---|---|
| A `Config` struct (or many positional args) just to fake named arguments | **`bon`** | `#[builder]` on a struct *or a plain function* → named, compile-checked args; the struct becomes unnecessary (selection.md) |
| A newtype `UserId(u32)`, then hand-writing `Display`/`Add`/`From`/`Deref` | **`derive_more`** | one derive line generates the delegations you'd hand-roll |
| Hand-writing `FromStr`/`Display` match arms and an all-variants array for an enum | **`strum`** | derives enum↔string, `EnumIter`, variant metadata — the match-arm boilerplate disappears |
| Validating a `String` (email, non-empty, trimmed) at every call site | **`nutype`** | `validate`+`sanitize` baked into the type — an invalid value is *unconstructable*, guaranteed by the type system, not by remembering to check |
| Hand-maintaining a long expected value in `assert_eq!` | **`insta`** | snapshot on first run; `cargo insta accept` updates all expected values on a spec change |
| Repeating the same setup (db conn, fixtures) at the top of every test | **`rstest`** fixtures | name the fixture as a test *argument*; the macro runs it and injects the value |
| A runtime/test check for a compile-time invariant — a size/layout check (`assert_eq!(size_of::<H>(), 16)`) or "does `T` impl `Send`?" | std **`const { assert!(size_of::<H>() == 16) }`** for size/const; **`static_assertions`** only for *trait*-level asserts (`assert_impl_all!`, `assert_obj_safe!`) | the check runs at **compile time** — a violation fails the build, can't be skipped. Note std `const`-assert (1.57/inline `const{}` 1.79) now owns size/const; `static_assertions` is stale (2019) but the only one-liner for trait-level |
| Hand-transcribing an OpenAPI / JSON-Schema spec into Rust structs | **`typify`** / **`progenitor`** | generate the types (and a typed client) from the schema; they can't drift from it |
| Reading HTML/CSS/config assets at runtime with `fs::read` (crashes if missing on deploy) | **`rust-embed`** / std `include_str!` | bake the folder into the binary at compile time → one static file to deploy, no missing-asset crash |
| Manually stripping leading indentation from a multiline string literal | **`indoc`** | keep the source indentation; the macro removes the common leading whitespace at compile time |
| `std::time::Instant`/`SystemTime` in a wasm-targeting library (panics in the browser) | **`web-time`** | drop-in shim: native `std::time` off-wasm, `performance.now()` on wasm — no runtime panic |
| A plain-text error dump for a user-facing tool | **`miette`** | graphical diagnostics — source snippet, underlines, help text — instead of an opaque string |
| `Arc<Mutex<HashMap<_,_>>>` for a shared concurrent map | **`dashmap`** / **`scc`** | sharded/lock-free concurrent map — no global lock to contend on (ownership.md / selection.md) |
| `.to_string()` everywhere for short strings (IDs, statuses, enum names) | **`compact_str`** | small-string optimization: ≤24 bytes stay on the stack, serde-compatible drop-in for `String` |

## 2. The four over-reaches (READ FIRST — these are the default failures)

A capable model already knows `serde`/`tokio`/`clap`. Its failures in Rust are **over-reach** in
four predictable directions. Each is FORBIDDEN as the default; deviate only with a stated reason.

### 2.1 async-by-default — sync unless the job is concurrent I/O

Pulling `tokio` (or marking `fn`s `async`) into a program that is CPU-bound, one-shot, or a
simple CLI **colors the whole call graph** for no benefit: every caller becomes `async`, you need
a runtime, and blocking work now silently stalls the executor. Default to **sync**. Reach for a
runtime only when the job is *concurrent I/O* (many sockets/requests in flight). One HTTP call in
a CLI → `ureq` (sync), not `reqwest` + `#[tokio::main]`. Detail + the AFIT/`async-trait` boundary
→ `references/async.md`.

### 2.2 `.clone()` / `Arc<Mutex<_>>` / `unsafe` to quiet the borrow checker

When the borrow checker complains, the reflex `.clone()` (or wrapping everything in
`Arc<Mutex<_>>`, or dropping to `unsafe`) trades a **modeling problem for a runtime cost and a
hidden bug**. First restructure ownership: borrow instead of own, take `&str`/`&[T]` not
`String`/`Vec`, `Cow` for maybe-owned, split a struct so borrows don't overlap, index instead of
holding a reference across a mutation. `.clone()` is fine when the data is genuinely small/owned
or cloning is the honest cost — but it is a **decision, not a reflex**. Every `unsafe` needs a
`// SAFETY:` line. Detail → `references/ownership.md`. (Co-fires with `implementing-and-debugging`:
the band-aid-vs-root-cause rule is its territory; this is the Rust-specific form.)

### 2.3 the heavyweight crate when a light one — or std — fits

`clap` for a two-flag tool, `reqwest`+`tokio` for one sync GET, `serde`+`serde_json` to read one
env var, a date crate to format one timestamp: each drags a dependency tree, build time, and
binary size for a job std or a 10 kB crate does. **Lightest fit wins**: `argh`/`lexopt` for tiny
CLIs, `ureq` for a sync call, `std::env`/`OnceLock` for globals. The cost of a dependency is paid
at every `cargo build`, every audit, every MSRV bump — not just at call sites. selection.md marks
the light alternative for each job.

### 2.4 hand-rolling what a crate does correctly — and reinventing what std already gives

The inverse of 2.3, equally common: hand-writing an arg parser, a CSV splitter, a retry loop, a
date math routine, or a hash map wrapper that a battle-tested crate does correctly (edge cases,
Unicode, DST, overflow) — OR pulling a crate for three lines std already provides. The test is
**correctness surface**: if the job has non-obvious edge cases (parsing, time, encoding,
concurrency), reach for the crate; if it's a thin convenience over std, write the std. Don't
reinvent `serde`/`regex`/`clap`; don't add `itertools` to call one `.chunks()` std has.

---

## Checklist before submitting Rust

Selection & dependencies (RG0/RG1 — `references/selection.md`, `references/project.md`):
- [ ] Every dependency traces to a real job; the **lightest crate that fits** was chosen (not the famous one); no declared-but-unused deps (`cargo machete` clean)
- [ ] `edition = "2024"`; features trimmed (`default-features = false` where it pays); versions workspace-inherited in a workspace
- [ ] Supply chain checked (`cargo deny check` / `cargo audit`); no crate flagged stale (no release ~18mo) used without noting it
- [ ] No stale-training tell: std `OnceLock`/`LazyLock` (not `lazy_static`); `clap` v4 (not `structopt`); std `thread::scope` (not `crossbeam::scope`) — see §1 supersessions

Over-reaches (§2 — FORBIDDEN as default, deviation needs a stated reason):
- [ ] Not async-by-default: `tokio`/`async` present ⇒ the job is genuinely concurrent I/O (§2.1)
- [ ] No `.clone()`/`Arc<Mutex>`/`unsafe`/`.unwrap()` reached for to appease the borrow checker; ownership restructured first (§2.2 / ownership.md)
- [ ] No heavyweight crate where a light one or std fits (§2.3); no hand-roll of what a crate does correctly, no crate for what std already does (§2.4)

Correctness & idiom (RG2/RG3 — `references/ownership.md`, `references/errors.md`):
- [ ] Error model matches the crate kind: binary → `anyhow`/`eyre` + `.context()`; library → typed `thiserror` enum; **no `unwrap`/`expect`/`panic!` on fallible library paths** (`clippy::unwrap_used` clean)
- [ ] `?` propagation, not hand-rolled `match` on `Result`; `From`/`#[from]` conversions where they earn their keep
- [ ] Every `unsafe` block has a `// SAFETY:` comment; `clippy` clean (at least default; pedantic where the project sets it)

Verification (RG4):
- [ ] Any crate/version/edition fact asserted here was checked against crates.io / lib.rs today, not recalled from training; dated facts tagged `[dated:YYYY-MM]`
