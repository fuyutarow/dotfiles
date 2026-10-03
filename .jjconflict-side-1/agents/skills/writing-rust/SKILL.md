---
name: writing-rust
description: >-
  Writes/reviews Rust and Cargo.toml; creates packages/workspaces (cargo new/init,
  プロジェクト構成, ディレクトリ構造, crate分割), selects crates/依存選定, and handles
  ownership, async, errors, CLI and performance. Read before Rust code or manifest edits.
  Verify crate facts; sync before async, ownership before clone, lightest fit before famous.
  Cargo layout → here; repo layers/polyglot placement → wiring-repositories;
  mise task graph → wiring-mise-tasks.
  Change/debug → implementing-and-debugging; structure-only → refactoring-code;
  invariant placement/type-as-spec → designing-type-contracts; consequential risk → practicing-tiger-style.
  PyO3/maturin binding design stays here; Python tooling → running-python-tools.
  Excludes Rust-written CLI installation, syntax explanations, and prose editing with settled design.
  Workflow-native: source harvest may fan out; crate selection stays SOLO.
  English skill; respond in the user's language.
---

# Writing Rust — modern crate selection & coding discipline

> **Version**: v2609.3.0 (2026-09-23) — Cargo layout and verification scope.
> Crate catalog snapshot: `[dated:2026-07]`; this layout revision does not refresh crate recommendations.
> Provenance, comparison cases and verification: `tests/forge-verification-ledger.md`.

Atomic build verification, from this skill directory:

```sh
for f in selection async errors ownership performance project layout; do test -f references/$f.md || echo MISSING $f; done; for t in trigger-set forge-verification-ledger; do test -f tests/$t.md || echo MISSING $t; done
```

Read §1 and §2 for selection precedence; load other references for the current task.
The catalog is a lookup, not a starter kit; this skill does not teach syntax or cover every embedded stack.
Fast-moving facts carry per-fact `[dated:YYYY-MM]` tags, or a file-level tag for selection.md.
Locate them through the repository's declared retrieval route and reverify facts older than two quarters.
RG4 still requires checking a crate recommendation at use time.

## THE LAW

> In Rust the ecosystem IS the language: most of a project's effectiveness is decided by
> **SELECTION**, before a line is written. A dependency, an `async` coloring, and an `unsafe`
> block are each a liability paid at every future build, read, and audit — **earn them, never
> default to them.** A `.clone()` or `Arc<Mutex<_>>` reached for to quiet the borrow checker is a
> modeling smell, not a fix. And crate facts **ROT** — a recommendation you have not checked
> against crates.io / lib.rs today is a guess, not knowledge. Precedence:
> **right crate before hand-roll · lightest fit before famous · sync before async · ownership
> before clone · verified before recommended.**

## Function map

Rust task → choose mechanisms and Cargo boundaries → scoped source/manifests → verified behavior and scope.
For project creation or layout changes, RG5 owns the Cargo layout decision; its workflow stays SOLO.
Repository layer admission and the mise task graph go to their named owners below.

## The gates — RG0–RG5, each with a checkable artifact

| Gate | Rule | Artifact |
|---|---|---|
| **RG0 SELECT-BY-ROLE** (§1 + selection.md, deny-gate) | Choose each crate by the JOB and current maintenance, from `references/selection.md` — **never by fame or training-recency.** App binary → `anyhow`/`eyre`; library → `thiserror` (RG3). **Sync by default**; `tokio` only for real concurrent I/O (async.md). Lightest crate that fits (`argh`/`ureq`/`rusqlite` over `clap`/`reqwest`/`sqlx` when the job is small). **RG0 is BIDIRECTIONAL**: auditing declared deps is only half the gate — the first time this session you add/change a **dependency**, or write/restructure non-trivial code (NOT gated on new logic; a bare feature-toggle / metadata edit / mechanical rename are NO-FIRE — ★ callout), SWEEP the WHOLE codebase for §1/その手 hand-rolls — once per session, whether or not the lines you touched expose one + the その手があったか table UNPROMPTED and produce the adopted/declined-with-reason table. Waiting for a reviewer to name each crate ("why no anyhow? why no clap?") is the gate's defining failure mode — distilled from a live session where clap AND anyhow were each user-prompted one at a time `[dated:2026-07]` | Every added dependency traces to a named job + a one-line "why not the lighter / std alternative"; the UNPROMPTED sweep table (adopted / declined-with-reason, one row per §1+その手 crate matched against the codebase) on first crate-entry this session; selection.md is the lookup |
| **RG1 DEP-HYGIENE** (project.md) | New crates use the current edition; preserve existing compatibility unless migrating. Remove unused deps, trim features, and inherit intentionally shared versions. | `cargo machete` findings resolved; supply-chain check; manifest features and inheritance checked. |
| **RG2 OWNERSHIP-NOT-ESCAPE-HATCH** (ownership.md, deny-gate) | Do **not** `.clone()` / `Arc<Mutex<_>>` / `unsafe` / `.unwrap()` to make the compiler stop complaining — restructure ownership (borrow, `Cow`, split borrows, index-don't-hold). Every `unsafe` carries a `// SAFETY:` line stating the upheld invariant | `clippy` clean under `undocumented_unsafe_blocks`; no hot-path `.clone()` without a one-line reason; `unsafe` blocks greppable-commented |
| **RG3 ERROR-MODEL** (errors.md) | Binary → `anyhow`/`eyre` + `.context()`; library → a typed `thiserror` enum. `?` not hand-rolled `match`. **No `unwrap`/`expect`/`panic!` on a fallible path in library non-test code** | lib crate: `clippy::unwrap_used` + `expect_used` clean; public error is an `enum`, not `Box<dyn Error>` by default |
| **RG4 VERIFY-BEFORE-RECOMMEND** (staleness, citation-relay) | A crate fact not checked against crates.io / lib.rs **today** is a guess: before adding or recommending, confirm the latest version + last-release recency; a crate with no release in ~18 months is a maintenance flag to state. Dated facts carry `[dated:YYYY-MM]` | `grep -rn '\[dated:'` re-verified per the header registry; each recommendation cites a checked version |
| **RG5 CARGO-BOUNDARIES** (layout.md) | On project creation or layout changes, choose package/workspace boundaries and explicit verification scope. | Compact layout decision + `cargo metadata` member/target check; scoped checks from layout.md. |

### RG0 fires on ENTRY — the sweep is your FIRST artifact, not the reviewer's job  ★

The single most-dropped step in this skill. **The first time this session you add/change a dependency, or write/restructure non-trivial code,
your first artifact is the RG0 adopted/declined sweep table** (§1 + the その手 table matched against
the actual code) — a once-per-session sweep of the WHOLE codebase, not just the lines you touched,
UNPROMPTED; it is NOT gated on writing NEW logic. **NO-FIRE**
(the edit exposes no selection opportunity): a comment/string typo, a pure `cargo fmt`/whitespace
pass, a **metadata-only `Cargo.toml` change** (version / `[profile]` / authors / edition), a **single
feature-flag toggle on an already-declared crate**, or a **mechanical rename** (identifier
substitution only, however many files it touches) that changes no dependency and reshapes no
ownership/API — ceremony on these fails RG0's own F1. A crate *rebrand* still fires when it adds a dep or reworks code: an observed rebrand fired on
clap + `main.rs`, not on `[package].name`. Co-firing does not exempt you: under `refactoring-code` the passive-sounding "oracle"
role does **not** suspend RG0 (a substantive restructure — one that adds a dep or reworks code — is still first-crate-entry; a mechanical rename that only substitutes an identifier is the NO-FIRE case above); under
`implementing-and-debugging` its DEBUG/BUILD gate still runs FIRST and the sweep is writing-rust's
first artifact WITHIN its turn, not the literal first output. Waiting for a reviewer to name crates
one at a time ("why no clap? why no anyhow?") is the gate's **defining failure mode**, and it
recurs — a prose gate alone is not enough, so the durable fix is a PreToolUse hook blocking the
first `*.rs`/`Cargo.toml` edit until the table exists (→ `operating-the-harness`; not shipped here).
Full artifact spec + trigger: RG0 row above; lookup: `references/selection.md`.

## Routing — sibling cuts (reciprocal)

| Sibling | Cut |
|---|---|
| `wiring-repositories` | **PURPOSE:** Cargo package/workspace/target semantics stay here; repository layer admission and cross-language manifest placement stay there. Agree in substance; do not diff for byte identity. |
| `wiring-mise-tasks` | **PURPOSE:** Rust package, feature and test-mode coverage stays here; task names, dependencies and runtime declarations stay there. Pass the RG5 scope to the task writer. |
| `designing-type-contracts` | **PURPOSE:** choose predicates, representations, construction paths and residual obligations there. Rust visibility, ownership, conversions, Serde APIs and crate choices remain here. |
| governing-configuration-systems | **DECISIVE:** Cargo.toml or a Rust parser's crate-specific manifest, API, and implementation → HERE. A format-independent configuration contract → governing-configuration-systems. |
| `implementing-and-debugging` | **Co-fire on any non-trivial Rust feature/bugfix, with ORDER**: that skill owns language-agnostic change-safety (intent reconstruction, edit-surface scoping, **root-cause vs symptom** — a `.clone()`/`unwrap()` band-aid is the symptom-fix it forbids, RG2 is the Rust form, regression fear) — run its BUILD/DEBUG gate FIRST; this skill owns what correct Rust looks like inside that frame (RG0–RG4). |
| `refactoring-code` | **Co-fire on any behavior-preserving Rust restructuring, with ORDER**: its two-hats / oracle / deny-gate govern the change discipline; this skill supplies the Rust **oracle** (`cargo check` + `clippy` + `cargo nextest` green as the bracket) and the Rust-safe transforms (module/visibility moves, ownership refactors, `impl Trait` extraction). A Rust refactor that improves no named property is still 場当たり churn — its deny-gate applies unchanged. **The "oracle" role does NOT suspend RG0** — a rename/refactor here is still first-crate-entry; the fire/no-fire boundary is the ★ callout. |
| `practicing-tiger-style` | **LANGUAGE cut**: “Is the unresolved question Rust-specific type, ownership, Result/panic, crate, unsafe, or tool choice rather than the cross-language risk ledger?” **Yes** → Rust mechanisms stay HERE; **No** → `practicing-tiger-style` owns the ledger. Co-fire when both remain material. |
| `running-python-tools` | LANGUAGE cut: invoking a Python CLI/one-off → there. Calling Python FROM Rust or exposing Rust TO Python (**PyO3 / maturin / the FFI boundary**) → HERE — that is a Rust dependency-architecture decision (RG0 / selection.md), not Python tooling. |
| `writing-python` | LANGUAGE cut on a shared PyO3/maturin project: the Rust crate + the FFI boundary shape → HERE; the Python side of the same project (pyproject.toml, dependency selection, typing/ruff/pytest discipline) → `writing-python`; running the `maturin` command itself → `running-python-tools`. |
| `writing-julia` / `writing-typescript` | LANGUAGE cut: different language, disjoint — Julia numerics → writing-julia; `.ts/.tsx` idiom → writing-typescript; Rust → here. Same family shape (LAW + gates + selection spine). |
| `growing-oss-adoption` | PURPOSE cut: if the Rust crate is being published for ADOPTION (naming, positioning, README-as-landing-page, distribution, benchmarks-as-marketing) → that skill. The code and its crate selection → here. |
| `raising-resolution` | Silent sub-step (its owner-filter routes Rust work here): inspect the actual `Cargo.toml` / `cargo tree` / crates.io / `rustc --version` before asserting a crate or edition fact (this IS RG4). |

## MUST NOT FIRE

A pure ecosystem or syntax question needs no construction workflow.
Examples: licensing, Rust history, or explaining lifetimes without a code change.
Installing or using a **Rust-written end-user
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
| `references/layout.md` | RG5 home — package/module/workspace choice, member vs dependency, examples and nested roots, verification scope | project creation; directory/crate reorganization; choosing which packages/tests a command covers |
| `references/project.md` | RG1 home — edition/MSRV, dependency and lint inheritance, supply chain, profiles, tool selection | configuring a selected package/workspace; dependency hygiene; lint/test tools |

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
| Hash map | **std `HashMap`** (SipHash — DoS-safe) | *profiled* hot + trusted keys only → `foldhash` / `rustc-hash` (performance.md) |

**Supersessions — a former default has been replaced; using the old one now is a tell that
training data is stale** `[dated:2026-07]` (SOLE home; verified in the forge ledger):

| Former default | Now use | Since | Residual caveat (when the old thing is still needed) |
|---|---|---|---|
| `lazy_static` / `once_cell` for a global | std `OnceLock` (1.70, 2023-06) / `LazyLock` (1.80, 2024-07) | 1.80 | `once_cell` only for `get_or_try_init` (fallible init — still nightly in std) or `no_std` |
| `crossbeam::scope` for scoped threads | std `thread::scope` | 1.63 | `crossbeam` still for channels / deque / epoch GC |
| `async-trait` on every async trait | native `async fn` in traits (AFIT) | 1.75 | `dyn` dispatch → `dynosaur` (new code) / `async-trait` (existing); `Send`-bounded futures → `trait-variant` — the split is async.md's |
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
| Validating a `String` (email, non-empty, trimmed) at every call site | **`nutype`** | Candidate for checked construction and sanitization; verify the chosen predicates and every ingress/mutation path before claiming validity. |
| Hand-maintaining a long expected value in `assert_eq!` | **`insta`** | snapshot on first run; `cargo insta accept` updates all expected values on a spec change |
| Repeating the same setup (db conn, fixtures) at the top of every test | **`rstest`** fixtures | name the fixture as a test *argument*; the macro runs it and injects the value |
| A runtime/test check for a compile-time invariant — a size/layout check (`assert_eq!(size_of::<H>(), 16)`) or "does `T` impl `Send`?" | std **`const { assert!(size_of::<H>() == 16) }`** for size/const; **`static_assertions`** only for *trait*-level asserts (`assert_impl_all!`, `assert_obj_safe!`) | the check runs at **compile time** — a violation fails the build, can't be skipped. Note std `const`-assert (1.57/inline `const{}` 1.79) now owns size/const; `static_assertions` is stale (2019) but the only one-liner for trait-level |
| Hand-transcribing an OpenAPI / JSON-Schema spec into Rust structs | **`typify`** / **`progenitor`** | Generate the supported surface; check regeneration and actual consumers. Unsupported refinements and deployed-version compatibility remain explicit. |
| Reading HTML/CSS/config assets at runtime with `fs::read` (crashes if missing on deploy) | **`rust-embed`** / std `include_str!` | bake the folder into the binary at compile time → one static file to deploy, no missing-asset crash |
| Manually stripping leading indentation from a multiline string literal | **`indoc`** | keep the source indentation; the macro removes the common leading whitespace at compile time |
| `std::time::Instant`/`SystemTime` in a wasm-targeting library (panics in the browser) | **`web-time`** | drop-in shim: native `std::time` off-wasm, `performance.now()` on wasm — no runtime panic |
| A plain-text error dump for a user-facing tool | **`miette`** | graphical diagnostics — source snippet, underlines, help text — instead of an opaque string |
| `Arc<Mutex<HashMap<_,_>>>` for a shared concurrent map | **`scc`** (or `RwLock<HashMap>` at low contention) | sharded concurrent map — no global lock; `dashmap` only if you know its deadlock footgun (selection.md) |
| `.to_string()` everywhere for short strings (IDs, statuses, enum names) | **`compact_str`** | small-string optimization: ≤24 bytes stay on the stack, serde-compatible drop-in for `String` |
| A fact Cargo already knows, re-typed as a constant — `const VERSION: &str = "0.4.2"` beside `Cargo.toml`'s `version` — plus a release script that rewrites both copies | std **`env!("CARGO_PKG_VERSION")`** (+ `_MAJOR`/`_MINOR`/`_PATCH`, `CARGO_PKG_NAME`) | Cargo sets these for the crate being compiled; `env!` reads them at compile time, so the manifest is the one home and the copy cannot drift. Parts parse to integers in a `const fn`, making a malformed version a compile error (project.md) |

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

### 2.5 formatting is prose; encoders and binders own target languages

For controlled human text with quotes or backslashes, use a raw format literal rather than a field
of `\"` escapes: `format!(r#"run "{name}" scored {score:.4}"#)`. Add `#` delimiters when the
literal contains `"#`. Raw literals remove source escapes, not format braces or target-language
escaping. JSON, SQL, HTML, shell arguments, and URLs therefore use their serializer or binding API;
for JSON, `serde_json::to_string(&serde_json::json!({ "name": name, "score": score }))?`, never
`format!`. Values remain raw until that boundary.

---

## Checklist before submitting Rust

Selection & dependencies (RG0/RG1 — `references/selection.md`, `references/project.md`):
- [ ] Every dependency traces to a real job; the **lightest crate that fits** was chosen (not the famous one); no declared-but-unused deps (`cargo machete` clean)
- [ ] Edition/MSRV preserved or deliberately migrated; features trimmed; shared versions inherited by their consumers
- [ ] Supply chain checked (`cargo deny check` / `cargo audit`); no crate flagged stale (no release ~18mo) used without noting it
- [ ] No stale-training tell: std `OnceLock`/`LazyLock` (not `lazy_static`); `clap` v4 (not `structopt`); std `thread::scope` (not `crossbeam::scope`) — see §1 supersessions

Over-reaches (§2 — FORBIDDEN as default, deviation needs a stated reason):
- [ ] Not async-by-default: `tokio`/`async` present ⇒ the job is genuinely concurrent I/O (§2.1)
- [ ] No `.clone()`/`Arc<Mutex>`/`unsafe`/`.unwrap()` reached for to appease the borrow checker; ownership restructured first (§2.2 / ownership.md)
- [ ] No heavyweight crate where a light one or std fits (§2.3); no hand-roll of what a crate does correctly, no crate for what std already does (§2.4)
- [ ] `format!` produces controlled human text; machine formats use their serializer/binder, and raw strings remove source escapes only (§2.5)

Correctness & idiom (RG2/RG3 — `references/ownership.md`, `references/errors.md`):
- [ ] Error model matches the crate kind: binary → `anyhow`/`eyre` + `.context()`; library → typed `thiserror` enum; **no `unwrap`/`expect`/`panic!` on fallible library paths** (`clippy::unwrap_used` clean)
- [ ] `?` propagation, not hand-rolled `match` on `Result`; `From`/`#[from]` conversions where they earn their keep
- [ ] Every `unsafe` block has a `// SAFETY:` comment; `clippy` clean (at least default; pedantic where the project sets it)

Verification (RG4):
- [ ] Any crate/version/edition fact asserted here was checked against crates.io / lib.rs today, not recalled from training; dated facts tagged `[dated:YYYY-MM]`
