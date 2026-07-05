# Forge verification ledger — writing-rust (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set is `tests/trigger-set.md` —
re-run it after any description edit.

## CURRENT STATE

**LAW (live, since v2607.1.0):** in Rust the ecosystem IS the language — effectiveness is decided
by SELECTION before a line is written; a dependency / `async` coloring / `unsafe` block is a
liability earned, never defaulted; a `.clone()` to quiet the borrow checker is a modeling smell;
crate facts ROT. Precedence: right crate before hand-roll · lightest fit before famous · sync
before async · ownership before clone · verified before recommended. §1 (default stack + deltas)
and §2 (the four over-reaches) are read FIRST and outrank `references/`.

**Gates:** RG0 select-by-role (deny-gate; each dep traces to a job + why-not-lighter) · RG1
dep-hygiene (`cargo machete`/`deny` clean, edition 2024, features trimmed) · RG2
ownership-not-escape-hatch (deny-gate; no clone/`Arc<Mutex>`/`unsafe`/`unwrap` to appease the
borrow checker; `// SAFETY:` on every `unsafe`) · RG3 error-model (app=anyhow/eyre, lib=thiserror;
no unwrap on fallible lib paths) · RG4 verify-before-recommend (citation-relay: check crates.io
before asserting; `[dated:]` tags).

**Invariants (live):**
- **Calibration inversion** (the design axis): the source (a Google-AI-Mode crate catalog) was
  written for a human who doesn't KNOW the crates; a capable model already knows serde/tokio/clap,
  so a catalog changes nothing. The skill's value is INVERSE/orthogonal: (a) the DECISION spine
  (use-X-not-Y switch conditions), (b) the 2025/2026 supersession DELTAS the model's training lags
  on, (c) the four DENY over-reaches, (d) the "その手があったか" table (a grungy manual pattern → the
  crate that erases it) — the user's stated #1 value. A flat crate list is the anti-pattern; it
  dies at distillation.
- **Co-fire ORDER with the discipline skills** (mirrors writing-julia): Rust feature/bugfix →
  `implementing-and-debugging` gates first, this skill for idiom; Rust behavior-preserving
  restructure → `refactoring-code` governs (two hats / oracle / deny-gate), this supplies the Rust
  oracle (`cargo check`+clippy+nextest) + Rust-safe transforms. LANGUAGE cut vs
  `running-python-tools` (PyO3/maturin FROM Rust stays HERE — a Rust dep-architecture decision).
  PURPOSE cut vs `growing-oss-adoption` (publishing a crate for adoption → there; the code → here).
- **Staleness registry**: fast-moving facts carry an in-place `[dated:2026-07]` tag; the SKILL.md
  header lists what to re-verify. `paths: "**/*.rs"` auto-activates on Rust files.

**Open defects:** none recorded.

**Retired decisions (do not resurrect):**
- A flat "here are the modern crates" catalog as the skill body — REJECTED at design: it fails F1
  (a capable model already knows the famous crates, so the lines change no tool call). The body is
  a DECISION spine + deltas + deny-gates instead.

## 2026-07-06 forge (v2607.1.0) — creation from an adversarially-verified harvest

**Trigger**: user request to survey the modern Rust crate ecosystem and distill it into a skill
for effective 2025/2026-era projects, with crate selection as the explicit centerpiece.

**Source discipline** (forging-skills `distilling.md` §1: a SURVEY source is verified by a fleet
FIRST, then the RESULT is distilled — never the raw catalog):
- **Harvest fleet**: two background workflows, ~44 agents, ~1.9M subagent tokens.
  - `rust-crate-landscape-2026` — 15 categories (error/async/serde/cli-config/concurrency/
    builders-derive/data-repr/bytes-zerocopy/testing/http-web/db/observability/time-ids/parsing/
    perf-alloc-hashing/project-tooling), each harvest→refute, every crate version checked against
    crates.io/lib.rs.
  - `rust-crate-sweep-supplement` — 6 pattern-obsoleting clusters the first sweep didn't pin
    (static_assertions, typify/progenitor/prost-tonic, rust-embed/vergen, indoc/const_format,
    web-time/getrandom/cfg-if, MaybeUninit/array::from_fn), added after the user surfaced the
    "その手があったか" framing.
- **Adversarial verdicts**: main sweep 377 findings → **367 CONFIRMED, 10 OVERSTATED, 0 REFUTED,
  0 STALE** (no hallucinated crates, no false claims). The 10 OVERSTATED were minor date/label/
  authorship fixes, applied at distillation:

| # | Overstatement | Correction applied |
|---|---|---|
| 1 | `fehler` is dtolnay's | it's **withoutboats'**; guidance (experimental, avoid) unchanged |
| 2 | `dynosaur` repo under rust-lang | repo is `github.com/spastorino/dynosaur`; the AFIT-as-dyn claim holds |
| 3 | `poem-openapi` "3.x" | it's **5.1.16**; the harvest conflated it with poem-framework 3.1.12 |
| 4,5 | sqlx 0.9 default TLS = rustls+ring | sqlx 0.9 default features enable **no** TLS; opt into `tls-rustls` → `tls-rustls-ring` |
| 6,8,9 | `LazyLock` since "2024-08-08" | Rust **1.80.0 = 2024-07-25** (2024-08-08 is 1.80.1); `OnceLock` = 1.70.0 |
| 7,10 | chrono 0.4.20 "dropped time-0.1" | 0.4.20 fixed the segfault in safe Rust but KEPT time-0.1; removed ~0.4.30. chrono is clean & maintained in 2026 |

Supplement sweep: all CONFIRMED except the same-class minor fixes (prost 0.14.0 yank date was a
year off = 2025-06-13; `vergen` git-split was v8→v9 not v9→v10; `static_assertions`' only surviving
niche is the *trait-level* asserts — std `const`-assert now owns const/size checks).

**Files shipped (atomic, one commit):** SKILL.md + references/{selection,async,errors,ownership,
performance,project}.md + tests/{trigger-set,forge-verification-ledger}.md. No `scripts/` — the
mechanical floor is the shared `forging-skills/scripts/skill-check.sh`.

**Floor status at freeze**: `skill-check.sh` pass; description trimmed to ≤1500 chars (block scalar
`>-`); build-verify one-liner clean; strict-YAML parse OK; verification fleet (self-contradiction /
sibling-cut / trigger desk-check) run before link. (Recorded in the forge-session shell log,
2026-07-06.)

## 2026-07-06 verification fleet — adjudication (4 read-only lenses, all findings resolved)

**Crate-fact RG4 self-audit lens: ZERO findings** — every version/date/stale-flag in selection.md
and SKILL.md §1 held against a fresh crates.io re-check.

| Finding | Verdict | Resolution |
|---|---|---|
| MAJOR: chrono→jiff row inside the "old = stale tell" supersession table contradicts selection.md ("chrono is fine; jiff pre-1.0 option"); "jiff GA" false | **Accepted** | Row removed from the table; explicit anti-resurrection note left in place ("deliberately NOT in this table"); default-stack row now names both with the switch condition |
| MAJOR: selection.md prefers `dynosaur` for dyn async traits, async.md (the owner) said `async-trait` and never named dynosaur | **Accepted** | async.md gap-1 + decision line now prefer `dynosaur` for new code, `async-trait` as existing-code fallback — owner carries the current pick |
| MINOR: edition-2024 unsafe rules argued in both ownership.md and project.md with circular pointers | **Accepted** | project.md declared SOLE home; ownership.md reduced to a pointer + the one SAFETY-block consequence |
| MINOR: performance.md restated version facts selection.md owns (rustc-hash 2.0, criterion org, compact_str O(n)) | **Accepted** | Restatements stripped to pointers; decision content (hasher-by-trust table, ladder) retained |
| NIT: nextest-doctest rule in full in two files | **Accepted** | project.md keeps the full rule; selection.md cell now points |
| MINOR: growing-oss-adoption lists Rust/cargo/blazing-fast tokens with no reciprocal cut | **Accepted** | Reciprocal landed in its description: "Cut: the tool's Rust code & crate selection → writing-rust" (1487/1500 chars) |
| MINOR: running-python-tools has no maturin/PyO3 reciprocal | **Accepted** | Reciprocal landed + its plain-scalar description converted to `>-` (fixed its pre-existing WARN) |
| MINOR: impl-and-debugging / refactoring-code don't name language skills | **Rejected as by-design** | Generic discipline skills stay language-neutral; language skills point up (identical to the writing-julia precedent). Do not add language enumerations there |
| MINOR: `strum` was a dead trigger token (keyword with no body home) | **Accepted** | Given a home: その手があったか row (hand FromStr/Display/variant arrays → strum) |
| MINOR: "explain lifetimes" could over-fire via the `lifetime` keyword | **Accepted** | Concept-explainer carve-out added to the description NOT-clause and the body MUST-NOT-FIRE list; balanced by dropping `cargo-nextest` from keywords (lexically covered by `cargo`) |
| NIT: "uv で Python 環境" no-fire row was a far-miss testing nothing | **Accepted** | Replaced with the genuinely contested maturin boundary: PyO3-architecture FIRE row + maturin-invocation-only NO-FIRE row |

**Floor after fixes**: `skill-check.sh` clean over writing-rust + both edited siblings; strict-YAML
re-parse OK; growing-oss-adoption description 1487/1500; live listing reload confirmed for the
edited siblings (2026-07-06).
