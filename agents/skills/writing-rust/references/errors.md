# Error model — the app/library split (RG3)

> SOLE home of RG3 — the error-handling *model*. The crate table (which crate, which version) is
> `references/selection.md`; this file argues *how to model errors* and points there for the
> picks. The one rule that governs everything: **choose your error representation by whether the
> code is a binary (application) or a library — they have opposite needs.**

## The decisive cut: application vs library

| | Application / binary | Library / reusable crate |
|---|---|---|
| Caller | a human reading output | *other code* that must branch on the error |
| Needs | a readable report + context trail; doesn't care about the concrete type | a **typed, matchable** error so callers can handle each case |
| Default | **`anyhow`** (or `eyre`/`color-eyre` for richer reports) — one opaque `anyhow::Error`, add `.context(..)` as it propagates | **`thiserror`** — a concrete `enum` per fallible module, one variant per failure kind, `#[from]` for conversions |
| Signature | `fn main() -> anyhow::Result<()>`, `-> anyhow::Result<T>` internally | `pub fn f() -> Result<T, MyError>` with `MyError` a public enum |

Getting this backwards is the classic error: an `anyhow::Error` in a library's public API forces
every caller to string-match (they can't branch), and a hand-written enum in a throwaway binary is
boilerplate for a report nobody pattern-matches. **Binary → opaque + context. Library → typed enum.**

The boundary crate (a binary's own internal modules) can go either way — a typed enum inside, then
`?` into `anyhow` at the top. When a library binary is one crate, keep the *public* library surface
typed and let the `main.rs` side use `anyhow`.

## Library errors: designing the enum

```rust
#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("config file not found: {0}")]
    NotFound(PathBuf),
    #[error("invalid TOML")]
    Parse(#[from] toml::de::Error),   // ? auto-converts toml errors into this variant
    #[error("missing required key: {key}")]
    MissingKey { key: String },
}
```

Rules that change what you write:
- **One variant per *kind* the caller might handle differently** — not one per line that can fail.
  If callers will never distinguish two failures, merge them.
- **`#[from]`** on the wrapped source enables `?` to convert automatically; add `#[source]` (or
  `#[from]`) so the error chain is preserved for `{:?}` / report printers.
- **`#[error("...")]`** messages are lowercase, no trailing period, no "error:" prefix (the printer
  adds context) — they compose into a chain.
- **Don't reach for `Box<dyn std::error::Error>`** as the considered public error type: it's
  untyped (callers can't match) *and* loses `Send`/`Sync` guarantees unless you spell them. It's a
  fallback for prototypes, not a design. Typed enum for a library; `anyhow` for a binary.
- **Never make a library depend on `anyhow`** for its public errors — you're imposing an opaque
  type on every consumer. (A library may use `anyhow` *internally* in its tests or bins.)

## Application errors: context, not types

```rust
use anyhow::{Context, Result};
fn load(path: &Path) -> Result<Config> {
    let text = std::fs::read_to_string(path)
        .with_context(|| format!("reading config {}", path.display()))?;  // adds a frame
    toml::from_str(&text).context("parsing config")
}
fn main() -> Result<()> { /* ? bubbles a full context chain to stderr */ }
```

- **`.context()` / `.with_context()`** at each layer builds a human-readable trail ("parsing
  config: reading config /etc/app.toml: No such file"). Use the closure form (`with_context`) when
  building the message allocates, so the happy path pays nothing.
- **`eyre` + `color-eyre`** when you want spans, colored backtraces, and section reports in a CLI;
  it's a drop-in `anyhow`-shaped API. `miette` when you want *graphical* diagnostics with source
  snippets and underlines (a compiler-style error for a user-facing tool). Picks/versions →
  selection.md.

## `?`, not hand-rolled matching

`?` is the propagation operator — it applies `From` to convert the error into the function's error
type and returns early. Hand-writing `match res { Ok(v) => v, Err(e) => return Err(e.into()) }` is
the same thing, longer and error-prone. Use `?`. Design your error type (or `anyhow`) so the
conversions `?` needs exist (`#[from]`, or `anyhow`'s blanket `From`). Reserve `match`/`if let` for
when you actually *handle* an error, not to propagate it.

## No `unwrap`/`expect`/`panic!` on a fallible path (the RG3 artifact)

- **Library, fallible path**: forbidden. Return the error. `clippy::unwrap_used` +
  `clippy::expect_used` in the lint set is the enforcement.
- **Binary**: prefer `?` to `main() -> Result<()>`. `.expect("invariant message")` is allowed only
  where a failure means a *bug* (a `Mutex` poisoned, a compile-time-guaranteed-present resource) —
  and then with a message naming the invariant. Bare `.unwrap()` is never the final answer.
- **Tests**: `.unwrap()`/`.expect()` are fine — a failed unwrap is a failed test.
- `panic!`/`unreachable!`/`todo!` are for genuinely-impossible states and unfinished code, not for
  errors you didn't feel like handling.

See ownership.md for why `.unwrap()` is an escape hatch of the same family as `.clone()`.
