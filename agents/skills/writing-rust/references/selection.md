# The crate-selection spine (RG0) — by job, by role, by current maintenance

> **This is a LOOKUP CATALOG, not a starter kit. Add a crate at the point of first use, never
> preemptively.** A dependency you don't use is not free: it inflates the dependency tree, build
> time, binary size, audit surface, and every future MSRV bump. Heavy offenders never to carry
> speculatively: an async runtime (`tokio`) pulled in for a sync tool; `reqwest`+TLS for one GET;
> a whole ORM (`diesel`/`sea-orm`) for a few queries; `serde`+`serde_json` for one env var.
>
> **Every version here is `[dated:2026-07]` and verified against crates.io/lib.rs at forge time
> (RG4).** Before you rely on one, re-check the latest version and last-release date — a crate with
> no release in ~18 months is a maintenance flag to state. The *argument* for each pick (why app vs
> lib, why sync vs async, why not clone) lives in the topic references — this file is the table and
> points there. The headline std-supersession deltas live in `SKILL.md §1` (SOLE home).

## Error handling → argument in `references/errors.md`

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Library public error type | `thiserror` 2.0 (**not v1**) | `snafu` 0.9 | large surface, each site adds different context (snafu context selectors) |
| App/binary top-level error | `anyhow` 1.0 | `eyre` 0.6 + `color-eyre` 0.6 | want customizable/colored reports, spantraces |
| CLI/compiler source-span diagnostics | `miette` 7.x | `color-eyre` | not pointing into source text |
| Typed multi-layer context graph | `error-stack` 0.8 | `anyhow`/`eyre` | you actually need typed `Report<C>` frames; else it's overkill |

- **`thiserror = "2"`** (2.0, 2024-11) is current; `thiserror = "1"` is the stale-training tell.
- `core::error::Error` is in `core` (Rust 1.81) → impl `Error` in `no_std`; the `core-error` shim is dead.
- Dead, do not use: `failure` (archived), `error-chain` (deprecated), `err-derive`, `quick-error`. `fehler`/`#[throws]` is an experiment — avoid.

## Async & concurrency runtime → argument in `references/async.md`

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Async runtime (networked service) | `tokio` 1.x | `smol` 2.x | tiny footprint & not on the hyper/axum/tonic/sqlx stack |
| `async fn` in trait (static dispatch) | **native AFIT** (Rust ≥1.75) | `async-trait` 0.1 | need `dyn Trait`, or MSRV < 1.75 |
| Async trait whose futures must be `Send` | `trait-variant` 0.1 | `async-trait` | also need `dyn` → `dynosaur`/`async-trait` |
| `Box<dyn AsyncTrait>` (trait object) | `dynosaur` 0.3 or `async-trait` | — | prefer `dynosaur` for new code |
| Cancellation / graceful shutdown (tokio) | `tokio-util` `CancellationToken` 0.7 | `watch`/`broadcast` channel | need state broadcast |
| Future/stream combinators | `futures` 0.3 | `futures-lite` 2.x | smol ecosystem / lighter build |

- **`async-std` is DISCONTINUED** (RUSTSEC-2025-0052); `surf`/`tide` are dead with no successor. Never reach for them.
- Native AFIT + RPITIT (Rust 1.75) killed the "must use `async-trait`" rule for static dispatch.

## Serialization → structural discipline below; formats here

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| (De)serialize framework | `serde` 1.0 | — | — (`facet` is experimental reflection; watch it) |
| JSON | `serde_json` 1.0 | `sonic-rs` / `simd-json` | **profiling proves** JSON is the bottleneck |
| Compact binary, Rust↔Rust | `postcard` 1.x | `bitcode` 0.6 | smallest output → bitcode |
| Zero-copy mmap/IPC | `rkyv` 0.8 | `serde`+`postcard` | need a portable/cross-lang format |
| MessagePack / CBOR | `rmp-serde` 1.x / `ciborium` 0.2 (or `minicbor`) | — | never `serde_cbor` |
| Protobuf wire format | `prost` 0.14 (+`tonic` 0.14 for gRPC) | `capnp` | Cap'n Proto zero-copy |

- **`bincode` is UNMAINTAINED** (RUSTSEC-2025-0141); `bincode 3.0.0` is a deliberate *non-compiling tombstone* so `cargo add bincode` fails. Last usable is `=2.0.1` (pin it) — but prefer `postcard`/`bitcode`/`rkyv` for new code. `serde_cbor` is unmaintained → `ciborium`/`minicbor`.
- `rkyv` 0.8 changed the wire format vs 0.7 (0.7 data unreadable by 0.8); don't mix.

## CLI args & config → the light-vs-heavy call

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| User-facing CLI (subcommands, help, completions) | `clap` 4 `features=["derive"]` | `bpaf`/`argh`/`lexopt` | binary size / compile time / dep count is a hard constraint |
| Lightweight CLI | `bpaf` 0.9 | `argh` 0.1 / `lexopt` 0.3 | smallest → argh; zero-dep → lexopt |
| Trivial (1–2 positionals) | `std::env::args` | `lexopt` | the moment flags/help appear |
| Layered config (defaults<file<env<flags) | `config` 0.15 (`default-features=false, features=["toml"]`) | `figment` 0.10 | want profiles / error provenance / Rocket → figment |
| Load `.env` (dev only) | `dotenvy` 0.15 | `std::env` | production → real env vars, never a `.env` file |

- **`structopt` is frozen** → `clap` 4 derive (remember `features=["derive"]`). **`dotenv` is unmaintained** (RUSTSEC-2021-0141) → `dotenvy`. `gumdrop` unmaintained.
- `clap` 4.6 bumped MSRV to Rust 1.85; it renamed `App`→`Command` and removed runtime-YAML arg defs.

## Concurrency & sync (std has absorbed a lot) → `references/async.md`, `performance.md`

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| CPU-bound data parallelism | `rayon` 1.x | `std::thread::scope` | never spin up async for CPU work |
| Mutex / RwLock | **std `sync`** | `parking_lot` 0.12 | you need a `parking_lot` *feature* (no-poison, guard mapping, timeout, fairness, upgradable, deadlock detect) — **not** for speed |
| Scoped threads | **std `thread::scope`** (1.63) | `rayon::scope` | want work-stealing |
| MPSC channel | **std `mpsc`** (rewritten 1.67) | `crossbeam-channel` / `flume` / tokio `mpsc` | need MPMC/select → crossbeam; sync+async bridge → flume |
| Concurrent hash map | `scc::HashMap` | `RwLock<HashMap>` / `dashmap` | low contention → RwLock; wholesale swap → `arc-swap` |
| Read-mostly shared state | `arc-swap` 1.x | `RwLock<Arc<T>>` | need write coordination |
| Lazy global / singleton | **std `LazyLock`/`OnceLock`** | `once_cell` | `no_std` / fallible init / MSRV < 1.80 |

- The big delta: **std `LazyLock` (1.80) / `OnceLock` (1.70)** killed the `once_cell`/`lazy_static` reflex; std `Mutex` is futex-based since 1.62 (so `parking_lot` is a *feature* choice, not a speed one). See `SKILL.md §1`.
- `dashmap` still ships a by-design deadlock footgun (holding a `Ref` across another map op) as of 6.x — prefer `scc` or `RwLock<HashMap>` unless you know the hazard.

## Builders, derive, newtypes, enums → the "その手があったか" plays (SKILL.md §1)

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Struct builder (mixed required/optional) | `bon` 3.x | `typed-builder` / `derive_builder` | leaner generics-only → typed-builder; runtime-validated `build()->Result` → derive_builder |
| **Builder on a function/method** | `bon` 3.x | *(none — bon is the only one)* | — |
| Newtype delegations (Display/From/Add/Deref), no validation | `derive_more` 2.x | hand impls | need a construction invariant → `nutype` |
| Validated newtype (parse-don't-validate) | `nutype` 0.7 (pin — 0.8 is beta) | hand-rolled private-field module | — |
| enum↔string / iteration / metadata | `strum` (+`strum_macros`) 0.28 | hand `FromStr`/`Display` | pure JSON (de)serialize → `serde` derive |
| enum/struct `Default` | **std `#[derive(Default)]` + `#[default]`** (1.62) | manual impl | default variant carries fields |

- `derive_more` 2.x is a breaking overhaul: **all derives are off by default** (`features=[…]`), `#[display("…")]` syntax, `Deref` targets the inner field, MSRV 1.81 — 0.99-era code won't compile.
- `derivative` is unmaintained (2021) → std `#[default]` + `derive_more`. Don't put `nutype` on an invariant-free newtype (that's `derive_more`'s job); don't build a `bon` builder for a 2-field internal struct (`#[derive(Default)]` + struct-update).

## Data representation (strings, small collections, bytes) → `references/performance.md`

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Mutable small string (SSO) | `compact_str` 0.9 | `smol_str` / `ecow` | **profile first**; clone-heavy → smol_str/ecow (compact_str clone is **O(n)**, not a refcount) |
| Immutable interned string, O(1) clone | `smol_str` 0.3 | `ecow::EcoString` | need in-place mutation → ecow |
| Cheap-clone AND mutable (COW) | `ecow` 0.3 | `hipstr` | need borrowed slices / byte COW → hipstr |
| Borrowed-or-owned | std `Cow<'_, str>` | `Box<str>` | almost always owned → `String`/`Box<str>` |
| Fixed-capacity stack vector | `arrayvec` 0.7 | `tinyvec::ArrayVec` (needs `T: Default`) | want zero `unsafe` → tinyvec |
| Usually-small vec, may spill | `smallvec` **1.x** (pin `^1`) | `tinyvec::TinyVec` | want zero `unsafe` → tinyvec |
| Insertion-ordered map/set | `indexmap` 2.x | `BTreeMap` / `HashMap` | sorted → BTreeMap; unordered → HashMap |
| Iterator adapters beyond std | `itertools` 0.15 | std iter/slice | skip for `zip`(2), `is_sorted`, `chunk_by`-on-slices (std has them) |
| Refcounted zero-copy byte buffer | `bytes` 1.x | `Vec<u8>`/`Box<[u8]>` | no sharing/slicing → plain `Vec` |

- `smartstring` is dormant → `compact_str`. **Never `smallvec = "2"`** (perpetual alpha) — pin `1.x`. `indexmap` 2.0 deprecated bare `.remove()`; pick `.swap_remove()` (O(1), reorders) vs `.shift_remove()` (order-preserving, O(n)).

## Bytes, zero-copy, FFI → `references/ownership.md` (unsafe/SAFETY)

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Cast owned aligned POD ↔ `&[u8]` | `bytemuck` 1.x | `zerocopy` 0.8 | parsing external/unaligned bytes, bit-validity, endian fields, DSTs → zerocopy |
| Shared/splittable byte buffer | `bytes` 1.x | `Vec<u8>`/`&[u8]` | no cheap refcount clone/split needed |
| Memory-map a file | `memmap2` 0.9 | `std::fs::read` | small file / no random access; **never `memmap`(v1) or `mapr`** (both RUSTSEC) |
| C++ interop | `cxx` 1.0 (Rust 1.85+) | `bindgen`/`cbindgen` (pure C) | pure C → bindgen; huge legacy C++ → autocxx |
| Fixed-size int ↔ bytes w/ endianness | **std `u32::from_le_bytes` etc.** (1.32) | `byteorder` 1.5 | reading off a `Read`/`Write` stream or runtime-chosen endianness |

- **Project Safe Transmute is still nightly in 2026** — you can't drop `bytemuck`/`zerocopy` on stable. `zerocopy` 0.8 renamed the derives: `AsBytes`→`IntoBytes`, plus separate `Immutable`+`KnownLayout`. `abi_stable` is stale → `stabby` for a stable Rust↔Rust plugin ABI.

## Testing, property, snapshot, bench → runner/coverage in `references/project.md`

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Test runner | `cargo-nextest` | `cargo test` | **doctests** (nextest can't — full CI rule in `project.md`) |
| Fixtures / parameterized | `rstest` 0.26 | plain `#[test]` | single trivial test |
| Snapshot / golden | `insta` 1.x | `expect-test` | inline-only expectations → expect-test |
| Property-based | `proptest` 1.x | `quickcheck` | simple type-directed `Arbitrary` → quickcheck |
| Structured fuzz input | `arbitrary` 1.x (+`cargo-fuzz`) | — | byte-oriented parser only |
| Mocking | `mockall` 0.15 (traits) | `faux` (structs) | prefer a real fake/`impl` when cheap |
| Microbenchmarks | `criterion` 0.8 (`harness=false`) | `divan` | — (**divan is dormant**; criterion revived under `criterion-rs`) |
| CLI integration tests | `assert_cmd` + `assert_fs` + `predicates` | `Command` + tempdir | trivial one-shot |

- **`criterion` is NOT stuck at 0.5.1/bheisler** — it moved to the `criterion-rs` org (0.8, MSRV 1.88); the criterion-vs-divan momentum **inverted** (divan's last commit was 2025-04). The libtest `#[bench]` is still nightly-only → `criterion`/`divan`.

## HTTP, web, network clients → `references/async.md` (sync-vs-async)

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| HTTP client in an async service | `reqwest` 0.13 | `ureq` | no async runtime / a CLI → `ureq` |
| Sync/one-shot HTTP (CLI, build script) | `ureq` 3.x | `reqwest`+tokio | already on tokio / need HTTP-2, streaming, concurrency |
| Low-level HTTP / reverse proxy | `hyper` 1.x + `hyper-util` 0.1 | `axum`/`reqwest` | normal service → drop back to axum/reqwest |
| Web service (REST/JSON) | `axum` 0.8 | `actix-web` 4.x | throughput-critical 5% / most battle-tested → actix-web |
| HTTP middleware | `tower-http` 0.7 + `tower` 0.5 | framework-native | not on a tower stack |
| TLS backend | `rustls` 0.23 | `native-tls` | need OS trust store / corporate MITM proxy → native-tls |
| OpenAPI-first typed API | `utoipa` + `axum` | `poem-openapi` 5.x / `salvo` | batteries-included → salvo |

- **`reqwest` is at 0.13**; its default TLS is now `rustls` (not native-tls/OpenSSL) since 0.13.0 — silently changes trust store + linking. **`axum` 0.8** changed path syntax `/:id`→`/{id}` and requires `Sync` handlers. `hyper` 1.x removed the high-level `Client`/`Server` → `hyper-util`. Don't reach for `warp`/`rocket`/`tide` for new services.

## Databases & pools → the sync-vs-async and raw-vs-ORM call

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Async SQL, compile-time-checked | `sqlx` 0.9 | `diesel-async` / `sea-orm` | many entities/relations → ORM |
| Pool for `sqlx` | **`sqlx::Pool` (built in)** | — | **never** add an external pool to sqlx |
| Pool for a raw async driver / diesel-async | `deadpool` 0.13 | `bb8` 0.9 | want bb8 lifecycle callbacks; **never `r2d2`** (sync) |
| Embedded SQLite | `rusqlite` 0.40 | `sqlx-sqlite` | want the same async API → sqlx |
| Sync SQL/ORM | `diesel` 2.x / `rusqlite` / `postgres` | `sqlx`+tokio | only if the app is already async |

- **`sqlx` ≤0.8.0 is VULNERABLE** (RUSTSEC-2024-0363, protocol injection) — pin ≥0.8.1, prefer 0.9. `sqlx` moved home to `github.com/transact-rs/sqlx`. `sqlx` 0.9 TLS: default features enable **no** TLS — opt into `tls-rustls` (→ `tls-rustls-ring`). SeaORM 2.0 is still an RC; stable 1.1 pins `sqlx ^0.8`. Don't wrap a `Connection` in `Arc<Mutex<>>` — use the pool (it's `Clone`).

## Observability, logging, tracing

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| App/binary logging | `tracing` 0.1 + `tracing-subscriber` 0.3 | `log` 0.4 + `env_logger` 0.11 | tiny sync CLI, no spans → log+env_logger |
| Instrumenting a **library** (facade only) | `log` 0.4 (`kv` feature) | `tracing` | library is async / needs span context → tracing |
| File output + rotation | `tracing-appender` 0.2 | `flexi_logger` | not on tracing |
| App metrics | `metrics` + `metrics-exporter-prometheus` | `opentelemetry` | already on OTel |
| Distributed tracing (export spans) | `opentelemetry` 0.32 + `-otlp` + `tracing-opentelemetry` 0.33 | — | never `opentelemetry-jaeger` (deprecated) → OTLP |

- `tracing` is **still 0.1.x** in 2026 — pin `tracing = "0.1"`, `tracing-subscriber = "0.3"`. **`tracing-opentelemetry` is offset one minor ahead** (0.33 pairs with opentelemetry 0.32 — matching numbers fails to compile). A leaf library should emit through the **facade** (`log`/`tracing`), never install a subscriber. `slog` is legacy → tracing.

## Time, IDs, common utilities

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Timezone/DST datetime (new code) | `jiff` 0.2 (still pre-1.0) | `chrono` 0.4 | need `Copy` datetimes / chrono interop / no pre-1.0 policy |
| Datetime in existing chrono code | `chrono` 0.4 | `jiff` | a new module doing zone/DST arithmetic |
| Minimal offset-only / embedded | `time` 0.3 | `jiff` | need IANA named zones / DST |
| Random unique ID | `uuid` 1.x (`v4`) | — | — |
| Sortable / time-ordered ID | `uuid` 1.x (`v7`) | `ulid` | need ULID's 26-char base32 form / interop |
| Compile-once regex / global | **std `LazyLock` + `regex` 1.x** | `once_cell` | MSRV < 1.80 / fallible init |
| RNG | `rand` 0.9 (`rng()`/`.random()`) | `rand` 0.10 | greenfield edition-2024, MSRV ≥ 1.85 → 0.10 |
| URL | `url` 2.x | — | — |

- **`chrono` is fine** in 2026 (0.4.45, maintained, RUSTSEC-2020-0159 long resolved) — "chrono is abandoned/unsafe" is stale; `jiff` is the modern *option*, not a mandate (it's pre-1.0). **`rand` had two breaking waves** (0.9 in 2025-01, 0.10 in 2026-02): `thread_rng()`/`.gen()` are gone → `rng()`/`.random()`. UUIDv7 (RFC 9562) removes most reasons to reach for `ulid`. Never `Regex::new` inside a function/loop — `static LazyLock<Regex>`.

## Parsing & lexing

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Parse a **known** config format | `serde` + `serde_json`/`toml` 1.x | — | non-standard DSL → a parser; preserve comments → `toml_edit` |
| Parser combinators (new project) | `winnow` 1.0 | `nom` 8 | extending a nom codebase |
| Language/DSL with error recovery | `chumsky` 0.13 (+`ariadne`) | hand recursive-descent | max throughput / API stability → winnow |
| Declarative grammar file (PEG) | `pest` + `pest_derive` 2.x | `lalrpop` / `peg` | need LR + left-recursion → lalrpop |
| Fast lexer | `logos` 0.16 | hand-rolled | trivial token set → hand-roll |
| Scalar / split a delimited line | **std `str::parse`/`split`** | a parser crate | nested/recursive/quoted → winnow/logos |

- **`winnow` reached stable 1.0** and is the recommended combinator lib (nom's maintainer's successor; folds in `nom_locate`/`nom-supreme`). `chumsky`'s usable line is 0.13 (the `1.0.0-alpha` line stalled — avoid it and yanked 0.11.0). **`nom` 8 is a full rewrite** (nom-7 code won't compile). **`serde_yaml` is deprecated/archived** → `serde_yaml_ng`/`serde_norway`, or drop YAML. Don't parse JSON/TOML by hand; don't use `regex` for nested/balanced structure.

## Perf: allocators, hashers, secrets → detail in `references/performance.md`

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Swap the global allocator | `mimalloc` 0.1 | `tikv-jemallocator` 0.7 | need jemalloc heap profiling / long-run fragmentation — **only after profiling** |
| Fast internal HashMap, TRUSTED keys | `foldhash` 0.2 (hashbrown default) | `rustc-hash` (`FxHashMap`) | integer/small keys → rustc-hash |
| Map keyed by UNTRUSTED input | **std `HashMap` (SipHash)** | `ahash` (keyed) | only if profiling proves SipHash is the hot spot |
| Wipe secret bytes on drop | `zeroize` 1.x | — | need Debug/serde masking → `secrecy` |
| Carry a secret without leaking | `secrecy` 0.10 (`SecretBox`/`SecretString`) | `zeroize` alone | just wiping a local buffer → zeroize |

- **`mimalloc`/`jemalloc` are a post-profiling step, never a reflexive "make it fast."** "jemalloc is dead" is stale (Meta un-archived it) — but use `tikv-jemallocator` 0.7, never the frozen `jemallocator` alias. **hashbrown's default is `foldhash`, not `ahash`** (since 0.15); std `HashMap` is still SipHash. `rustc-hash` 2.0 changed its algorithm (same name, different bytes — pin 1.x if you persist hashes). `secrecy` 0.10 **removed** `Secret<T>` → `SecretBox`/`SecretString`.

## Schema codegen — never hand-transcribe a schema (SKILL.md §1 その手があったか)

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| OpenAPI/JSON-Schema → Rust types | `typify` 0.7 | hand structs | a 3-field one-off |
| Typed HTTP client from OpenAPI | `progenitor` 0.14 | `openapi-generator` (Java) | only need models → typify |
| Protobuf messages / gRPC | `prost` 0.14 / `tonic` 0.14 | — | **`tonic` 0.14 split the prost glue into `tonic-prost-build`** — `tonic_build::compile_protos` moved to `tonic_prost_build::compile_protos` |
| JSON Schema **from** Rust types | `schemars` 1.x | hand schema | (growing use: LLM tool/function-call param schemas) |
| Rust types → TypeScript | `ts-rs` 12 | `specta` (Tauri only) | multi-language → `typeshare` |

- All are actively maintained (`typify`/`progenitor` Oxide; `prost`/`tonic` tokio/hyperium). `schemars` 1.0 changed the default dialect draft-07→2020-12 (pin `SchemaSettings::draft07()` if a validator needs it). Proto codegen no longer auto-vendors `protoc` (enable `prost-build`'s `vendored`, or use pure-Rust `protox`).

## Embed assets & build metadata → std first

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Embed **one** file (config, SQL, schema, license) | **std `include_str!`/`include_bytes!`** | — | it becomes a whole tree |
| Embed a folder into a self-contained binary | `rust-embed` 8.x (pin ≥8.11) | `include_dir` (stale) / `memory-serve` | HTTP-serving with gzip/ETag → `memory-serve`/`rust-embed-for-web` |
| Bake git SHA / build metadata | `vergen` 10 (+ backend `vergen-gix` pure-Rust / `vergen-gitcl`) | `built` 0.8 | prefer a ready-made module → `built` |
| Generate + embed types from a spec | `build.rs` → `OUT_DIR` → std `include!` (via typify/progenitor/prost-build) | hand structs | tiny frozen schema |

- **`vergen` git features live in a backend crate** since v9 (`vergen-gitcl`/`vergen-gix`), not bare `vergen`. `include_dir` is stale (~25mo, no release) → `rust-embed` for web, std for one file. `rust-embed` 8.10 was yanked — pin ≥8.11.

## String ergonomics & compile-time asserts → std owns most now

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| Multiline literal at natural indentation (SQL, help text) | `indoc` 2.x (dtolnay) | raw string + `.trim` (avoid) | runtime (non-literal) string → `unindent` |
| Compile-time concatenated `&'static str` | `const_format` `concatcp!`/`formatcp!` | std `concat!` (literals only) | runtime `String` fine → `format!` |
| Runtime-templated format (i18n, user template) | `formatx` 0.3 (low bus-factor — vet it) | a template engine (`minijinja`/`tera`) | need loops/conditionals/escaping |
| Compile-time size/const invariant | **std `const { assert!(size_of::<T>() == N) }`** (1.79) | `static_assertions` (trait-level only) | — |
| Assert a type impls / doesn't impl / is object-safe | `static_assertions` (`assert_impl_all!`/`assert_obj_safe!`) | zero-dep helper-fn | — |

- **std `const`-assert (1.57) + inline `const {}` (1.79) own size/const checks** — don't add `static_assertions` (frozen since 2019) for those; it survives only for *trait-level* asserts. `indoc`/`unindent` are dtolnay, healthy.

## Cross-platform / Wasm

| Job | Default | Alternative | Switch when |
|---|---|---|---|
| `Instant`/`SystemTime` in browser-targeting code | `web-time` 1.1 | std `time` | provably never target `wasm32-unknown-unknown` → std |
| Entropy on browser wasm (via `rand`/`uuid`) | `getrandom` `features=["wasm_js"]` | — | **only in the final binary**, never a library |
| Multi-branch `#[cfg]` item selection | `cfg-if` 1.0 | plain `#[cfg]`/`#[cfg(not)]` | single / two-way split → plain attributes |

- **std `Instant`/`SystemTime` compiles but PANICS at runtime on `wasm32-unknown-unknown`** — a browser-targeting library uses `web-time` (transparent std re-export elsewhere). The retired `instant` crate (RUSTSEC-2024-0384) → `web-time`. `getrandom`'s wasm config churned across 0.2/0.3/0.4 — read the docs for your minor version.
