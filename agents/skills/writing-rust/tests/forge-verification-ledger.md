# Forge verification ledger — writing-rust (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set is `tests/trigger-set.md` —
re-run it after any description edit.

## 2026-08-03: match-time Tiger seam

Description now states that `practicing-tiger-style` owns cross-language phase/risk/ledger choice
while this skill owns Rust mechanisms. PyYAML count: 1411 (down from 1489); generic floor exit 0
with existing WARNs: prose 31, version block 21, table cells 2.

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
mechanical floor is the shared `forging-skills/scripts/skill-check.ts`.

**Floor status at freeze**: `skill-check.ts` pass; description trimmed to ≤1500 chars (block scalar
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

**Floor after fixes**: `skill-check.ts` clean over writing-rust + both edited siblings; strict-YAML
re-parse OK; growing-oss-adoption description 1487/1500; live listing reload confirmed for the
edited siblings (2026-07-06).

## 2026-07-06 external review #2 — adjudication (5 findings; 4 accepted, 1 partial)

All five findings are the SAME defect class: **read-first shorthand (SKILL.md §1 tables /
ownership.md quick lists) dropping the calibration the owning reference carries (measure-first
gates, hazard flags)** — i.e. the read-first layer re-creating the §2 over-reach it forbids.
Named as a standing reforge lens: after any §1/table edit, diff each row against its owner file
for lost qualifiers.

| Finding | Verdict | Resolution |
|---|---|---|
| #1 ownership.md "prefer parking_lot" contradicts selection.md's std-first/features-only rule | **Accepted in full** | ownership.md §4 rewritten: std `sync` first; `parking_lot` for features, never "because faster" |
| #2 SKILL.md async-trait supersession row folds `Send` bounds into async-trait, missing the dynosaur/trait-variant split | **Accepted** | Residual cell now carries the split (`dyn` → dynosaur new / async-trait existing; `Send` → trait-variant), owner named (async.md) |
| #3 dashmap/scc "並列推奨" in read-first + trigger-set | **Partial**: trigger-set half REFUTED — that row was already scc-first + selection.md pointer after fleet round 1, and desk-check rows are routing artifacts, not guidance. SKILL.md その手があったか row half ACCEPTED (dashmap-first, no hazard) | Row flipped: `scc` (or `RwLock<HashMap>` low-contention) first; dashmap demoted behind its deadlock-footgun flag; ownership.md §4 aligned in the same edit |
| #4 fast hashers presented as "default stack" vs performance.md's measured-micro-lever | **Accepted — sharpest finding** | §1 row inverted: std `HashMap` IS the default; `foldhash`/`rustc-hash` behind *profiled + trusted* (performance.md); selection.md trusted-hasher row gains the same gate ("unprofiled → stay std") |
| #5 "[dated:] per fact" wording stronger than selection.md's file-level dating | **Accepted as wording; design retained** | Header now states the TWO grains explicitly: per-fact in prose files; file-level for selection.md (whole file = one snapshot table; per-row tags would be noise — same Locality rationale as the writing-julia 2026-07-05 裁定) |

**Floor after round 2**: `skill-check.ts` clean (no warnings); strict-YAML parse OK; description
unchanged (≤1500).

## 2026-07-08 RG0 prominence reforge — recurrence-driven (self-reported from a live session)

**Trigger**: a live session (`correo` crate: rename → mise setup → clap adoption) where writing-rust
co-fired in its `refactoring-code`/`implementing` "oracle" role and the **RG0 BIDIRECTIONAL
entry-sweep never fired unprompted** — the user had to say "適切な crate選択がなされていない" before any
adopted/declined table appeared. This is the SAME failure the RG0 row already names as its
"defining failure mode" (the clap+anyhow one-at-a-time session) — a **recurrence**, proving the
prose gate alone did not hold.

**Root-cause split** (post-mortem): ~70% executor (a clearly-MANDATORY gate not run), ~30% skill
design — the highest-value proactive action was (a) buried in a dense RG0 table cell while §2
over-reaches get prominent `###` headings (calibration-inversion: the default-failure-direction
rule is the least visible), (b) thresholded on undefined "substantive work" (is a rename
substantive?), (c) framed away by the `refactoring-code` routing row's passive "supplies the
oracle" wording.

| Fix | Where | One-home note |
|---|---|---|
| Promote entry-sweep to a prominent `### … ★` callout (models refactoring-code's G3 spine) | new callout above Routing | Salience+trigger home; POINTS to RG0 row for the artifact spec (no restatement) |
| Trigger sharpened: "first edit to a crate THIS SESSION (rename/refactor/config incl — not gated on new logic)" | RG0 rule cell + artifact cell + callout | Replaces ambiguous "first substantive work" |
| Co-fire does NOT suspend RG0 | callout + refactoring-code routing row (pointer) | Kills the passive-"oracle" framing at its source |
| Durable fix named: PreToolUse hook blocking the first `*.rs`/`Cargo.toml` edit until the table exists | callout pointer → `operating-the-harness` | Not shipped here (this skill ships no `scripts/`) |

**Floor after reforge**: `skill-check.ts` clean over writing-rust; fire/no-fire desk-check — the
`correo` rename now correctly FIRES the entry-sweep under the new threshold (old "substantive work"
could ambiguously no-fire). Adversarial 3-lens verify (over-fire / trigger-desk-check / one-home
consistency) **round 1 → 3 ISSUE (all `minor`), converging on ONE defect**: the callout's "reading
before writing all count" + the dropped word "substantive" over-broadened the trigger — it compelled
the full sweep on typo / `cargo fmt` / private-local-rename (= the F1 ceremony the skill forbids),
contradicted trigger-set's `implementing-and-debugging` DEBUG-first row (a debug starts by reading →
sweep-as-first-output overrides "diagnose first"), and disagreed with the RG0 row's edit-only
enumeration (two-home trigger drift; the callout's own edit-gated hook fix contradicted its
"reading counts" prose). **Fixes (solo)**: scoped the trigger to a crate's SELECTION surface
(`Cargo.toml` / `use` / dependency / non-trivial change); added an explicit NO-FIRE trivia carve-out
(restoring the escape the deleted "substantive" gave); reframed "first output" → "first artifact
WITHIN its turn" so i-and-d's DEBUG-gate-first order holds; dropped the read-only "reading before
writing" widening; aligned "reviewer" wording; added two trigger-set desk-check rows (trivia NO-FIRE
+ rename-entry-sweep FIRE). The motivating failure stays closed: a crate rename IS a `Cargo.toml`
edit and clap IS selection surface, so "correo rename + mise + clap" still fires.

**Round 2 re-verify** → **3 ISSUE (all `minor`), one self-defeating bug**: the round-1 fix anchored
the exemption on "zero dependency delta," but a crate *rename* (the must-fire case) also has zero
dependency delta — a model could rationalize skipping it and reproduce the original miss; and "any
`Cargo.toml` edit" fired on version bumps (F1 ceremony), self-contradicting the same line. **Fix**:
re-anchored every home on ONE criterion — crate-SELECTION opportunity (dependency change or code
restructure) — dropping the leaky "Cargo.toml-touch" / "dep-delta" / "private-local" proxies.

**Round 3** → over-fire CLEAN; TRIGGER + ONE-HOME converged on the callout's co-fire parenthetical
"(a rename/restructure is still first-crate-entry)" being unqualified — colliding with its own
NO-FIRE carve-out and the `correo` example. **Fix**: qualified it (substantive restructure vs
mechanical rename); added feature-flag-toggle + mechanical-rename (any file count) to NO-FIRE.

**Round 4** → over-fire CLEAN; TRIGGER + ONE-HOME converged on a contradiction the round-3 fix itself
introduced: the RG0 row still fired on "or **feature**" while the callout NO-FIRE exempted a single
feature-flag toggle. Root cause (named by the one-home lens): the trigger was DUPLICATED across the
row and the callout, so every patch had to be hand-synced and kept drifting. **Fix**: dropped the
leaky "or feature"; made the FIRE phrasing verbatim-identical across both homes.

**Round 5 (capped final)** → over-fire CLEAN (severity **none** — "textbook-defended"); two remaining
`minor` items: a scope nuance (a selection-inert substantive refactor read as edited-lines-scoped →
under-fire vs the routing row) + the residual trigger duplication. Both encode a genuine design
tension (should a selection-inert substantive refactor fire?) that the fleet surfaces but cannot
resolve — an editor call. **Resolution (stated design decision)**: RG0's sweep is a **once-per-session
ENTRY audit** — first substantive engagement fires ONE codebase-wide sweep; the "hand-roll" clause is
the sweep's TARGET, not a fire gate. Implemented R5's own recommended fixes: scoped the sweep to the
whole codebase (removes the under-fire edge, makes both homes verbatim-consistent); reduced the
refactoring-code routing row to a pointer (the ★ callout is the sole fire/no-fire boundary home).

**Convergence + F3 waiver**: 5 fleet rounds went real bug (R2) → wording collision (R3) →
self-introduced contradiction (R4) → editor-judgment residuals (R5). The final structural pass is
`skill-check.ts`-clean + desk-read for coherence but **NOT fleet-re-verified** — a bounded waiver: a
6th round would over-fit a single gate. Convergence declared 2026-07-08.

## 2026-08-03: PROSE-DEBT waiver — practicing-tiger-style reciprocal cut
Observed floor: 31 long prose sentences, 21-line version block, and 2 long table cells; exit 0.
This change is the reciprocal cut only; no unrelated prose rewrite was authorized.
Queue: next Rust reforge; retire this waiver when the recorded classes reach 0.
