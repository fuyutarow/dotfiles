---
name: refactoring-code
description: Behavior-preserving structural change done as a discipline — improve HOW code is organized without changing WHAT it does, toward 責務分界 (one home per responsibility) and 局所化 (change stays local), and HARSHLY refuse 場当たり churn (motive-less/aesthetic restructuring). Use when refactoring, cleaning up, extracting/inlining/moving/renaming for structure, untangling a God class, removing duplication, reducing coupling / raising cohesion, breaking dependencies to add tests, or doing a large structure migration (Strangler Fig / Branch by Abstraction / Parallel Change / Mikado) — and BEFORE a feature when the code must be reshaped first (preparatory refactoring: make the change easy, then make the easy change). Enforces the two-line deny-gate (name the smell/imminent-change + the architecture property improved, or do NOT edit), the two hats (never mix a refactor with a feature/bugfix), name-your-oracle-before-you-touch (green tests / engine precondition / characterization tests first — an LLM edits text not a precondition-checked AST), small reversible Edits over whole-file Write, and prefer LSP/ast-grep/codemod. Triggers: refactor, リファクタ, リファクタリング, 場当たりリファクタ, clean up / 掃除 / tidy, code smell, 責務分界 / separation of concerns / SRP / SOLID, 局所化 / locality / cohesion / coupling / connascence, extract / inline / move / rename, God class / Feature Envy / Shotgun Surgery / Divergent Change / dead code, DRY vs YAGNI / wrong abstraction, behavior-preserving / 振る舞い保存, two hats, preparatory refactoring, characterization test / legacy code / seam, Strangler Fig / Branch by Abstraction / Parallel Change / Mikado, rewrite vs refactor / 書き直し. DECISIVE cut vs implementing-and-debugging = Beck's two hats: does OBSERVABLE BEHAVIOR change? yes (feature/bugfix) → implementing-and-debugging; no (structure only) → here (they co-fire in sequence for preparatory refactoring). Post-hoc review of a written diff → /code-review; restructuring a DOCUMENT/prose (not code) → structuring-documents; wiring a refactor-lint into hooks/CI → operating-the-harness. English skill; respond in the user's language (default Japanese).
---

# Refactoring — behavior-preserving structural change, on purpose

> **Version**: v2607.1.0 (2026-07-05) — distilled from a 19-agent SoK survey of the refactoring
> canon (Fowler / Beck / Feathers / Opdyke / empirical SE) + a 7-agent architecture-axis survey
> (Parnas 1972 / Constantine / Martin / DDD). Full provenance, claim ledger, moderator table, and
> GRADEs: `tests/refactoring-survey-sok.md`.
> **Scope**: the discipline of changing HOW code is structured WITHOUT changing WHAT it observably
> does. Behavior-CHANGING work (features, bug fixes) and the anti-flailing guards for it are the
> sibling `implementing-and-debugging` — the cut is Beck's two hats (below).

## Language & stable tokens

English skill; respond in the user's language (default Japanese). Keep these technical tokens
stable even inside Japanese prose — they are identifiers, not translatable words: **two hats**,
**oracle**, **behavior-preserving / 振る舞い保存**, **smell**, **責務分界**, **局所化**,
**cohesion / coupling / connascence**, **deny-gate**, **MOTIVE / PROPERTY-DELTA**, **characterization
test**, **seam**, **Strangler Fig / Branch by Abstraction / Parallel Change / Mikado**.

## THE LAW — two poles

> Refactoring is behavior-preserving structural change **with a purpose**: to give every
> responsibility ONE home (**責務分界**) and keep each likely change LOCAL (**局所化**). Two
> invariants bracket it, and each has a counterfeit the model ships by default:
>
> 1. **SAFETY.** Preservation is not the word's reassuring connotation — it is an **oracle you name
>    before you touch**. An LLM edits *text*, not a precondition-checked *AST*, so a "refactor" with
>    no oracle that would FAIL on a behavior slip is an edit-and-hope: **the next bug wearing the
>    safe word.** (Counterfeit: silently changing behavior inside a "refactor".)
> 2. **PURPOSE.** A structural edit that improves **no named architecture property** — no cohesion
>    raised, no coupling/connascence lowered, no responsibility re-homed, no change localized — is
>    not refactoring. It is **場当たり churn**, and it is forbidden. (Counterfeit: motive-less /
>    aesthetic / cargo-cult restructuring of working code.)
>
> Pursuing good architecture and obeying YAGNI are the **same** check, not rival dials: demarcate a
> responsibility that a **present** smell already tangles → do it mercilessly; add a layer for an
> **imagined future** with no present caller → refuse it. The discriminator is *present consumer vs
> hypothetical*, never volume ("smaller", "more SOLID", "cleaner").

## MUST NOT FIRE — this is not ceremony

Do **not** invoke on a single trivial tool-done rename, a pure formatter run, or a one-line
mechanical tidy you could describe in one sentence. Gating a trivial edit behind this discipline is
this skill failing its own PURPOSE pole. It fires on a **non-trivial** structural change: a refactor
task, a cleanup pass, an extract/move/untangle, dependency-breaking to place tests, a large
structure migration, or the preparatory reshape before a feature. And it fires HARD to **refuse**
場当たり churn — the model's dominant error here is over-firing (restructuring on sight), not
under-firing.

## The five gates — each names a checkable artifact

Not a pre-pass to tick; every line changes the next tool call. Skip one a specific change makes
irrelevant — never because it "looks like just a cleanup."

### G1 — One hat (behavior-preservation IS the definition)
A diff labeled *refactor* changes **structure only**. If you notice a bug or want a feature
mid-refactor, **STOP and flag it** — do not fix/add it in the same diff. Feature/bugfix goes in a
**separate commit**. **An edited test assertion is the tell** that behavior changed — a true
refactor commit keeps every expected value identical and green. When a feature needs a new shape, do
the **preparatory refactor first** as its own green commit, then the easy change (co-fire with
`implementing-and-debugging`). → mechanics in `references/strategy.md`.
*Artifact*: two commits, not one; refactor commit has zero edited assertions.

### G2 — Name your oracle before you touch
Before the first structural Edit, **name the behavior-preservation oracle**: (a) a real refactoring
**tool** performs the step (invoke it — LSP rename, gopls/Roslyn/rope, ast-grep/comby/codemod), its
precondition IS the oracle; or (b) a **green test suite** brackets the change (run it *before* and
after each step); or (c) the code is untested → write a **characterization test** that pins *current*
behavior FIRST (Feathers), through a seam if needed. **An LLM hand-editing text is never in the
tool-verified regime — its default is the strict branch.** No oracle you could name, and the edit
crosses reflection / serialization / DI / public-API / concurrency, or exceeds one screen → do not
touch; install the bracket first. → regimes, seams, mutation/golden-master in `references/safety-net.md`.
*Artifact*: a named oracle (tool / green run cited / characterization test written) before edit #1.

### G3 — 場当たり禁止 / 責務分界・局所化 へ  ★ the spine — emit the deny-gate or do NOT edit
Before **any** structural edit (extract/inline/move/rename-for-structure/introduce-or-remove
pattern/split-or-merge module), emit **two concrete lines**:
- **MOTIVE** — `smell removed: <named>` ∨ `imminent change enabled: <the specific change>` ∨
  `Rule-of-Three: <the 3rd real duplication, pointed at>`.
- **PROPERTY-DELTA** — at least one, concrete: `cohesion raised: <module> <level>→<level>` ∨
  `coupling lowered: <edge> <level>→<level>` ∨ `connascence lowered/localized: <strong>→<weak> / into <one home>` ∨
  `responsibility relocated to one home: <resp> now lives only in <place>, localizing <the multi-file change>`.

**Cannot fill BOTH with concrete fillers → it is 場当たり churn → do NOT edit** (leave the working
code, say why). Supporting rules: **SMELL ≠ EDIT** — on spotting a smell the next call is a
**Read/investigation**, never an Edit; if fine, record "investigated, left as-is". **Over-refactor
check** — before *adding* an abstraction/layer/pattern/param, confirm a **present** consumer exists;
none → Speculative Generality (YAGNI), don't add it. **Removal passes the gate** (`smell removed:
Speculative Generality / Middle Man`). **Wrong-abstraction reversal** — a shared abstraction growing
flags/branches → inline it back to callers, don't add param N. **No "while I'm here".** →
`references/architecture.md` (Parnas locality predicate, cohesion/coupling/connascence, SRP/CCP,
the deny-gate in full).
*Artifact*: the MOTIVE + PROPERTY-DELTA pair in the message/commit for every structural edit.

### G4 — Small reversible steps; Edit, not Write
Refactor as a chain of **small, individually-reversible, named** steps (Extract Function here, Rename
there), **test between each**, commit on green, **never hand off a red tree**. Prefer many scoped
**Edit** calls over one **Write** that regenerates a file (a whole-file rewrite loses comments/blame,
balloons the diff, and hides behavior changes — that is a rewrite, not a refactor). Prefer
symbol-aware tools (LSP `rename_symbol` / `find_referencing_symbols`, ast-grep, codemods) over
freehand text edits — they update all references and you lack the AST precondition check. **Preserve
WHY-comments and load-bearing "weirdness"** (an odd branch is often a past bug fix, not cruft). →
catalog of named moves + the depth test in `references/catalog.md`.
*Artifact*: per-step green test runs; scoped Edits (not a file Write); references updated via tool.

### G5 — Big change → incremental on trunk, never a rewrite-in-disguise
A large structural change is **many always-green commits on trunk**, not a long-lived branch:
**Branch by Abstraction** / **Parallel Change** (expand → migrate → contract) / **Strangler Fig** /
**Mikado** (probe → record prereqs → revert → do leaves first). A from-scratch **rewrite is a
labeled high-risk bet**, not a silent "refactor": prove the target is *unreachable* by
behavior-preserving steps AND that current behavior *cannot* be characterized before proposing one —
and even then, replace behind a facade with the old system as live fallback. → `references/strategy.md`.
*Artifact*: a migration sequence of green commits (no long-lived branch); a rewrite is named as a bet.

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `implementing-and-debugging` | **DECISIVE cut = Beck's two hats**: "Does this change alter OBSERVABLE behavior?" **Yes** (add/change a feature, fix a bug) → there (the anti-flailing guards for behavior change). **No** (structure only, outputs/API/side-effects identical) → here. They **co-fire in sequence** for "make the change easy, then make the easy change": preparatory refactor here (hat 1, own commit) → feature there (hat 2). If a diff does both, it violates G1 — split it. |
| `structuring-documents` | **PURPOSE cut = object**: that skill localizes information in a DOCUMENT/prose (MECE one-home, single-source-of-truth, backward-only reference DAG). This skill localizes responsibility in CODE. Same 認識体系 (Parnas's uses-DAG = its reference DAG; Martin's CCP = its single-update-point), different artifact — never run one on the other's object. |
| `/code-review`, `/simplify` (built-in) | **TIME cut**: they review/clean an already-written DIFF post-hoc. This governs BEFORE/DURING the change. Complementary — `/code-review` after a refactor can catch a smuggled behavior change (a G1 violation). `/simplify` applies quality cleanups to a diff; this owns the discipline of doing them safely. |
| `implementing-and-debugging` (again, on `raising-resolution`) | Inspecting the actual code + callers + git co-change before restructuring is `raising-resolution` running as a **silent sub-step** inside G3/G4 — not a separate fire. |
| `writing-typescript`, `writing-julia`, `linting-sui-move` | **Co-fire**: they own language idiom & language-specific safe transforms; this owns language-agnostic behavior-preservation + architecture. Follow the language skill for idiom, this for the two hats / oracle / deny-gate. |
| `acting-on-hypotheses` | A rewrite-vs-refactor call is *mostly* here (the moderator — reachability by behavior-preserving steps — is **inspectable**). Only a genuine forward bet with uncertain payoff ("should we bet on rebuilding X") → there. |

## Fire / no-fire

FIRES: "refactor this module / リファクタして", "clean this up / 掃除して" (non-trivial), untangle a
God class, remove duplication / reduce coupling, extract-or-inline for structure, "responsibilities
are tangled / 責務が混ざってる", break dependencies to add tests to legacy code, a large structure
migration (Strangler / Branch by Abstraction / Mikado), "reshape this before I add the feature"
(preparatory), "is this refactor safe without tests", "should we rewrite or refactor X".

MUST NOT fire: a single trivial tool-done rename / a pure formatter run / a one-line mechanical tidy ·
adding or changing a feature, or fixing a bug (→ `implementing-and-debugging`) · reviewing an
already-written diff (→ `/code-review`) · restructuring a DOCUMENT or prose, not code (→
`structuring-documents`) · wiring a refactor-lint into hooks/CI (→ `operating-the-harness`) · a
from-scratch greenfield build with no existing code to preserve.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/architecture.md` | 責務分界 + 局所化 as checkable predicates: Parnas information-hiding + the `|modules touched by change|=1` locality test + uses-DAG; Constantine one-sentence cohesion test + coupling spectrum; SRP-actor + CCP (+ the structuring-documents isomorphism); DDD/Conway/vertical-slice next-change test; connascence degree+locality; the deny-gate in full + the YAGNI 3-slot reconciliation | applying G3; deciding where a responsibility belongs; judging a decomposition; is this architecture or churn |
| `references/catalog.md` | Smells as triggers (the ~24, read as coupling/cohesion failures); the named refactorings' mechanics + common shape; the depth test for extraction; Remove Flag Argument / narrow-signature / encapsulate-global by coupling class; Kerievsky refactor-to/away-from patterns | picking the transform for a smell; the mechanics of a named move; when to extract vs inline |
| `references/safety-net.md` | The oracle regimes (tool/test/characterization); characterization tests + seams + Legacy Code Change Algorithm; mutation / golden-master / approval / property-based oracles; tools-still-ship-bugs; non-static-reference hunt before rename; the observable-surface boundary (timing/concurrency/serialization/logs/metrics); AST-vs-text gap; dynamic-language caveat | applying G2; refactoring untested or legacy code; any rename/move; deciding if "behavior-preserving" is trustworthy |
| `references/strategy.md` | WHETHER/WHEN: two hats, preparatory, Rule of Three, tidy first/after/never, DRY-vs-AHA, rewrite-vs-refactor decision, hotspot prioritization (churn×complexity), when NOT to refactor, epistemic status (Design-Stamina/DCF are hypotheses). HOW-BIG: Strangler / Branch by Abstraction / Parallel Change / Mikado / keystone / codemods at scale | deciding whether/when to refactor at all; sequencing a large change; a rewrite proposal |

## Forge provenance

Two SoK surveys, provenance-verified: `tests/refactoring-survey-sok.md` (claim ledger, 9-debate
moderator table, GRADEs, 15-gap agenda). Forge/verification log: `tests/forge-verification-ledger.md`.
