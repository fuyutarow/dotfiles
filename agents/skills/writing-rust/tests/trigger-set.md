# writing-rust — fire / no-fire trigger set (F3 artifact)

Desk-check this table against the FULL skill collection (not just this description) after any
description edit. A no-fire row names which sibling (or no skill) fires instead; a co-fire row
states the order. Created v2607.1.0 (2026-07-06).

## FIRES

| Ask | Why |
|---|---|
| 「この Rust の関数、引数が5個もあって毎回 Config 構造体作ってる。もっと綺麗にできない?」 | §1 その手があったか → `bon` (no "crate" keyword — describes the pain, must still fire) |
| "add a dependency to parse JSON in my Rust CLI" | RG0/RG1 + selection.md (serde) — a crate-selection decision |
| 「borrow checker に怒られたから とりあえず全部 .clone() してる」 | RG2 / ownership.md — the escape-hatch reflex |
| "should I use anyhow or thiserror here?" | RG3 / errors.md — the app-vs-library split |
| "is once_cell still how you do a global static in Rust in 2026?" | §1 supersession → std `LazyLock`/`OnceLock` |
| 「この Cargo.toml、依存が多すぎる気がする。整理して」 | RG1 / project.md — dependency hygiene |
| "my Rust client drags in all of tokio for one GET — necessary?" | §2.1 async over-reach → `ureq` (async.md) |
| "write a Rust function that validates and normalizes an email string" | §1 その手があったか → `nutype` (model would hand-roll the validation) |
| 「Rust で OpenAPI の schema から型を手で書き起こしてる…」 | §1 その手があったか → `typify`/`progenitor` |
| "pick a date/time crate for a new Rust project" | §1 supersession + selection.md → jiff vs chrono/time |
| "which crate for a fast concurrent hashmap in Rust?" | selection.md → `dashmap`/`scc` (not `Arc<Mutex<HashMap>>`) |
| review this `src/parser.rs` (paths auto-activation on `**/*.rs`) | general Rust idiom review — RG0–RG4 |
| 「この Rust、思ったより速くない。blazing fast にしたい」 | performance.md — the measured ladder (Rust ≠ automatically fast; measure first) |
| "should I add jemalloc or a custom hasher to speed up my Rust service?" | performance.md — allocator/hasher are measure-gated; by key trust, not reflex |
| 「Rust で書いたのに Go より遅い。なんで?」 | performance.md — the thesis + the ladder (with code to inspect); measure to find the 1% |

## MUST NOT FIRE (near-miss — same vocabulary, different owner)

| Ask | Route |
|---|---|
| 「ripgrep をインストールして」 / "install eza / bat / fd" | Rust-*written* end-user tool → package management (Brewfile / cargo install), NOT writing Rust |
| 「Rust って Go より速いの?」 | language comparison, no code → plain answer |
| "write the README for my Rust crate" | prose ABOUT Rust → `linting-prose` / `structuring-documents` |
| 「この Rust CLI を OSS で公開して広めたい。名前どうする?」 | adoption / naming / positioning → `growing-oss-adoption` (the code stays here, but this ask is adoption) |
| "uv で Python の数値実験環境を作って" | Python tooling, no Rust → `running-python-tools` |
| 「crates.io のライセンスとガバナンスってどうなってる?」 | ecosystem question, no code → plain answer |
| 「この Julia コードの勾配計算を速くして」 | different language → `writing-julia` |
| "format / fix the types in this `app.tsx`" | different language → `writing-typescript` |
| 「Rust リポジトリを git subtree で分割したい」 | VCS surgery, not Rust code → plain task (`refactoring-code` if code moves) |
| "explain what lifetimes are, conceptually" | concept explainer, no code to write → plain answer (fires here only if Rust code is in play) |
| 「Rust ってなんで速い言語なの?」 | language-design question, no code → plain answer (fires only when there's actual code to profile/optimize) |

## Co-fire order checks (not fire/no-fire — sequencing)

| Ask | Expected order |
|---|---|
| 「この Rust モジュールに機能を足して」 | `implementing-and-debugging` BUILD gate first (intent/edit-surface/root-cause) → this skill for the Rust inside (RG0–RG4) |
| 「この Rust パッケージ、リファクタして」 | `refactoring-code` governs (two hats / oracle / deny-gate) → this skill supplies the Rust oracle (`cargo check`+clippy+nextest) + Rust-safe transforms |
| 「動かない Rust コードをデバッグして」 | `implementing-and-debugging` DEBUG gate first → this skill for Rust-specific diagnosis (`clippy`, `cargo check`, the error model) |
| "publish my Rust CLI and also fix the arg parsing" | `growing-oss-adoption` (publish/adoption) + this skill (the arg-parsing code / crate choice) — parallel, different concerns |
