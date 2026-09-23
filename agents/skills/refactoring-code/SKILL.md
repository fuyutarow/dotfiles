---
name: refactoring-code
description: >-
  Governs behavior-preserving structural change. DECISIVE Beck two-hats cut: observable behavior
  changes (feature, bugfix, performance, logs) → implementing-and-debugging; structure only → HERE.
  Co-fire sequentially for preparatory refactoring. Pursues 責務分界 and 局所化; refuses 場当たり
  churn unless the smell and improved property are named. Name claim-specific behavior, structure,
  and deletion-absence oracles. Prefer small reversible edits and
  LSP/ast-grep/codemod over whole-file rewrites. Use for refactor/リファクタリング, cleanup, code
  smell, extract/inline/move, structural rename, duplication, wrong abstraction,
  coupling/cohesion, legacy seams, Strangler Fig, Branch by Abstraction, Parallel Change, Mikado,
  rewrite-vs-refactor, 振る舞い保存, or two hats. Expensive/irreversible rebuild bets → AOH; cheap
  probes → domain/plain executor. Document IA → structuring-documents; hooks/CI →
  operating-the-harness. English skill; answer in the user's language.
---

# Refactoring — behavior-preserving structural change, on purpose

> **Version**: v2609.3.0 (2026-09-23) — re-distilled from the canonical general-refactoring and
> LLM existing-code-modification positions; claim provenance lives in the forge ledger.
> **Scope**: change HOW code is structured without changing WHAT it observably does.

```bash
for f in architecture catalog safety-net strategy; do test -f "references/$f.md" || echo "MISSING references/$f.md"; done; for f in forge-verification-ledger refactoring-survey-sok; do test -f "tests/$f.md" || echo "MISSING tests/$f.md"; done
```

## Language & stable tokens

English skill; respond in the user's language (default Japanese). Emit the deny-gate lines (G3) with
these EXACT grep-able token strings even inside Japanese prose — `MOTIVE`, `PROPERTY-DELTA`,
`smell removed:`, `imminent change enabled:`, `Rule-of-Three:` — so a reviewer can grep a
transcript/commit for them. Other technical tokens (two hats, oracle, 責務分界, 局所化, connascence,
seam) stay in English/standard form as identifiers.

## THE LAW — two poles

> Refactoring is behavior-preserving structural change **with a purpose**: to give every
> responsibility ONE home (**責務分界**) and keep each likely change LOCAL (**局所化**). Two
> invariants bracket it, and each has a counterfeit the model ships by default:
>
> 1. **SAFETY.** Preservation is an **oracle you name before you touch**, not a reassuring label.
>    One oracle proves one claim: behavior, requested structure, absence, or edit scope.
>    Name every oracle the task needs. (Counterfeit: green tests with a partial/substituted move,
>    or code retained behind a guard instead of removed.)
> 2. **PURPOSE.** A structural edit that improves **no named architecture property** — no cohesion
>    raised, no coupling/connascence lowered, no responsibility re-homed, no change localized — is
>    not refactoring. It is **場当たり churn**, and it is forbidden. (Counterfeit: motive-less /
>    aesthetic / cargo-cult restructuring of working code.)
>
> Pursuing good architecture and obeying YAGNI are the **same** check, not rival dials: demarcate a
> responsibility that a **present** smell already tangles → do it mercilessly; add a layer for an
> **imagined future** with no present caller → refuse it. (The full cut — present consumer vs
> hypothetical, never volume — is owned by `references/architecture.md` §7.)

## MUST NOT FIRE — this is not ceremony

Do **not** invoke on a single trivial tool-done rename, a pure formatter run, or a one-line
mechanical tidy you could describe in one sentence. Gating a trivial edit behind this discipline is
this skill failing its own PURPOSE pole. It fires on a **non-trivial** structural change: a refactor
task, a cleanup pass, an extract/move/untangle, dependency-breaking to place tests, a large
structure migration, or the preparatory reshape before a feature. And it fires HARD to **refuse**
場当たり churn. (Design posture, not a measured fact: the survey's agent-failure table — SoK §4.1 —
lists both over-firing (churn, #5/#6/#9) and under-firing (structure+behavior jammed into one diff,
#1/#4); this skill tunes hard against churn because its counterfeit is cheaper to ship and harder to
detect, while the under-firing direction is already guarded by G1.)

## The five gates — each names a checkable artifact

Not a pre-pass to tick; every line changes the next tool call. Skip one a specific change makes
irrelevant — never because it "looks like just a cleanup."

### G1 — One hat (behavior-preservation IS the definition)
A diff labeled *refactor* changes **structure only**. If you notice a bug or want a feature
mid-refactor, **STOP and flag it** — do not fix/add it in the same diff. Feature/bugfix goes in a
**separate step/diff** (separate commits, if committing at all — commit only when asked). **An
edited test assertion is the tell** that behavior changed — a true refactor step keeps every
expected value identical and green. When a feature needs a new shape, do the **preparatory refactor
first** as its own green step, then the easy change (co-fire with `implementing-and-debugging`). →
sequencing in `references/strategy.md` §2–3.
*Artifact*: two separable diffs, not one; the refactor diff has zero edited assertions.

### G2 — Name the oracle stack before you touch
Declare every claim the change must satisfy. Select its oracle from
`references/safety-net.md` §1.1. **Behavior**, **requested structure**, **absence**, and
**edit scope** are separate claims. A green suite supports only covered behavior. It does not prove
that a named move finished, deleted code is absent, or unrelated loci stayed untouched.

An LLM hand-edit is never tool-verified. A generic AST rewrite is a structural executor, not a
behavior proof. If a required oracle is missing, install it or refuse the edit.
*Artifact*: a claim→oracle table with a cited red condition for every required claim, before edit #1.

### G3 — 場当たり禁止 / 責務分界・局所化 へ  ★ the spine — emit the deny-gate or do NOT edit
Before **any** structural edit (extract/inline/move/rename-for-structure/introduce-or-remove
pattern/split-or-merge module), emit **two lines, each citing a mechanical observation** — a line
with no cited command/file:line is a vacuous fill and **counts as a failed gate**:
- **MOTIVE** — `smell removed: <named>` ∨ `imminent change enabled: <the specific change>` ∨
  `Rule-of-Three: <the 3rd real duplication>` — **with the evidence cited** (the grep/`git log`
  hits or occurrence list at `file:line`). "future speedup" / "better design" / "cleaner" are
  **invalid fillers** (Design-Stamina is a GRADE-Low hypothesis, `references/strategy.md` §8).
- **PROPERTY-DELTA** — at least one, **citing the measured BEFORE state**: `cohesion raised` /
  `coupling lowered` / `connascence lowered/localized` / `responsibility relocated to one home` —
  exact filler grammar, citation rules, and the second-actor requirement for splits are owned by
  `references/architecture.md` §6 (SOLE owner of the gate wording — read it before first use).

**Cannot fill BOTH with cited fillers → it is 場当たり churn → do NOT edit** (leave the working
code, say why). Supporting rules (full text in `architecture.md` §6): **SMELL ≠ EDIT** — next call
after spotting a smell is a **Read/investigation**, never an Edit. **Over-refactor check** — a
present consumer must exist before adding any abstraction; **removal passes the PURPOSE gate** but
never bypasses G2's absence and behavior oracles. **Wrong-abstraction reversal** — inline back,
don't add param N. **No "while I'm here".**
*Artifact*: the cited MOTIVE + PROPERTY-DELTA pair in the message/commit for every structural edit.

### G4 — Small reversible steps; Edit, not Write
Refactor as a chain of **small, individually-reversible, named** steps (Extract Function here, Rename
there). Run that row's declared oracles between steps. Checkpoint only when all required rows pass
(commit only when asked), and **never hand off a red tree**. On red: revert **your own last step** — re-apply the inverse edit or `git stash` (recoverable);
never a destructive `git checkout .` / file-restore without explicit user approval. Prefer many scoped
**Edit** calls over one **Write** that regenerates a file (a whole-file rewrite loses comments/blame,
balloons the diff, and hides behavior changes — that is a rewrite, not a refactor). Prefer
semantic refactoring engines (LSP `rename_symbol` / `find_referencing_symbols`) when supported.
Use ast-grep/codemods as structural executors with separate behavior and reference oracles; they do
not prove semantic preservation or update every dynamic reference. **Preserve WHY-comments and
load-bearing "weirdness"** (an odd branch is often a past bug fix, not cruft). →
catalog of named moves + the depth test in `references/catalog.md`.

For a compound request, write atomic acceptance rows before editing:
`named move | intended loci | structure/absence oracle | behavior oracle | scope oracle`. Execute and verify one
row at a time. A partial compound, or a different structure that merely keeps tests green, is not
done without explicit user acceptance.
*Artifact*: per-step oracle receipts plus an all-passing atomic acceptance table and final intended-loci→diff check.

### G5 — Big change → incremental on trunk, never a rewrite-in-disguise
A large structural change is **many always-green commits on trunk**, not a long-lived branch:
**Branch by Abstraction** / **Parallel Change** (expand → migrate → contract) / **Strangler Fig** /
**Mikado** (probe → record prereqs → revert → do leaves first). A from-scratch **rewrite is a
labeled high-risk bet**, not a silent "refactor": prove the target is *unreachable* by
behavior-preserving steps AND that current behavior *cannot* be characterized before proposing one —
and even then, replace behind a facade with the old system as live fallback. → `references/strategy.md`.
*Artifact*: a migration sequence of green commits (no long-lived branch); a rewrite is named as a bet.

**FULL-TREE claim gate** (added 2026-07-22, firedancer postmortem): declaring a reorganization
"full/全面" imposes two extra artifacts BEFORE the first move: (1) an **extension-blind inventory**
(`find . -type f` with NO name filters — filtering by extension is how .mjs/.bin strays survive a
"complete" sweep), and (2) a **written completion criterion** (what zero-state proves done: e.g.
"zero references to old paths repo-wide + full test suite green"). Executing a subset while the
claim says 全面 is a G5 violation — either narrow the claim or finish the inventory's scope.

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `implementing-and-debugging` | **DECISIVE cut = Beck's two hats**: "Does this change alter OBSERVABLE behavior?" **Yes** (add/change a feature, fix a bug) → there (the anti-flailing guards for behavior change). **No** (structure only, outputs/API/side-effects identical) → here. They **co-fire in sequence** for "make the change easy, then make the easy change": preparatory refactor here (hat 1, own step) → feature there (hat 2). If a diff does both, it violates G1 — split it. |
| `practicing-tiger-style` | **CO-FIRE**: “Does behavior-preserving restructuring also need a ledger review of bounds, resource lifetime, and negative cases?” **Yes** → `practicing-tiger-style` owns the cross-language ledger review; this skill retains the preservation oracle and structural purpose. |
| PERFORMANCE / OPTIMIZATION asks | Goal = change a runtime observable (latency / throughput / memory / allocation) — "make it faster", "optimize", "this is slow" — is **behavior-changing on the declared observable surface** (`references/safety-net.md` §5) → `implementing-and-debugging`, **even when phrased as "clean up"**. Fowler separates refactoring from optimization (optimization often trades clarity away — the opposite of the PURPOSE pole). A preparatory reshape BEFORE the measured optimization co-fires in sequence: reshape here → optimize there, profiler-first (`references/strategy.md`). |
| `structuring-documents` | **PURPOSE cut = object**: that skill localizes information in a DOCUMENT/prose (MECE one-home, single-source-of-truth, backward-only reference DAG). This skill localizes responsibility in CODE. Same 認識体系 (Parnas's uses-DAG = its reference DAG; Martin's CCP = its single-update-point), different artifact — never run one on the other's object. |
| `implementing-and-debugging` (again, on `raising-resolution`) | Inspecting the actual code + callers + git co-change before restructuring is `raising-resolution` running as a **silent sub-step** inside G3/G4 — not a separate fire. |
| `writing-typescript`, `writing-julia`, `writing-python`, `writing-rust`, `writing-bun-scripts`, `linting-sui-move` | **Co-fire**: they own language idiom & language-specific safe transforms; this owns language-agnostic behavior-preservation + architecture. Follow the language skill for idiom, this for the two hats / oracle / deny-gate. |
| `operating-the-harness` / `driving-git` (concurrency) | **PURPOSE cut — one question each.** Isolation tier and how to launch it → `operating-the-harness`. What a session checks and announces when another may write the repo → `driving-git` shared-checkouts. **What shape the CODE needs so N editors do not collide → HERE** (`architecture.md` §8). |
| `driving-git` | **DECISIVE — what vs how it enters history.** This skill owns WHAT changes and the oracle; how the change becomes commits (scope, message, rewrite, publish) and the `git stash`-not-`checkout .` discipline's owner is `driving-git`. Co-fire at commit time. Seam agrees in substance; do not byte-diff (2026-09-21) |
| `acting-on-hypotheses` | A rewrite-vs-refactor call is *mostly* here (reachability by behavior-preserving steps is inspectable). Only an expensive/irreversible uncertain-payoff rebuild bet → AOH; a cheap deterministic reversible probe → domain/plain executor. |

## Fire / no-fire

FIRES: "refactor this module / リファクタして", "clean this up / 掃除して" (non-trivial), untangle a
God class, remove duplication / reduce coupling, extract-or-inline for structure, or remove an
already-proven unreachable private element with cited G3 evidence. It also fires on "responsibilities are tangled / 責務が混ざってる",
dependency-breaking to add tests, a large structure migration (Strangler / Branch by Abstraction /
Mikado), "reshape this before I add the feature"
(preparatory), "is this refactor safe without tests", "should we rewrite or refactor X".

MUST NOT fire: a single trivial tool-done rename / a pure formatter run / a one-line mechanical tidy ·
adding or changing a feature, fixing a bug, or removing a supported feature/API
(→ `implementing-and-debugging`) · a performance
optimization that targets the timing/allocation observable surface — "make it faster / optimize /
this is slow" (→ `implementing-and-debugging`, two hats; see the PERFORMANCE routing row) · reviewing
an already-written diff (→ `/code-review`) · restructuring a DOCUMENT or prose, not code (→
`structuring-documents`) · wiring a refactor-lint into hooks/CI (→ `operating-the-harness`) · a
from-scratch greenfield build with no existing code to preserve.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/architecture.md` | 責務分界 + 局所化 as checkable predicates: Parnas information-hiding + the `|modules touched by change|=1` locality test + uses-DAG; Constantine one-sentence cohesion test + coupling spectrum; SRP-actor + CCP (+ the structuring-documents isomorphism); DDD/Conway/vertical-slice next-change test; connascence spectrum (§5, SOLE home); the deny-gate (§6, SOLE owner of the wording); the YAGNI reconciliation (§7); **parallel-edit capacity (§8)** incl. the 3-slot MANDATORY test | applying G3; deciding where a responsibility belongs; judging a decomposition; is this architecture or churn |
| `references/catalog.md` | Smells as triggers (the ~24, read as coupling/cohesion failures); the named refactorings' mechanics + common shape; the depth test for extraction; Remove Flag Argument / narrow-signature / encapsulate-global by coupling class; Kerievsky refactor-to/away-from patterns | picking the transform for a smell; the mechanics of a named move; when to extract vs inline |
| `references/safety-net.md` | Claim-specific oracle stack (behavior/structure/absence/scope); tool/test/characterization regimes; deletion negative contract; seams; mutation/golden-master/property-based oracles; non-static references; observable-surface boundary; AST-vs-text gap | applying G2; refactoring untested code; any rename/move/delete; deciding whether the requested transformation is both safe and complete |
| `references/strategy.md` | WHETHER/WHEN: two hats, preparatory, Rule of Three, tidy first/after/never, DRY-vs-AHA, rewrite-vs-refactor decision, hotspot prioritization (churn×complexity), when NOT to refactor, epistemic status (Design-Stamina/DCF are hypotheses). HOW-BIG: Strangler / Branch by Abstraction / Parallel Change / Mikado / keystone / codemods at scale | deciding whether/when to refactor at all; sequencing a large change; a rewrite proposal |

## Forge provenance

Canonical positions: `urn:uuid:01a0c779-fd07-719d-a845-3d9c0c8cfb3d` (general refactoring) and
`urn:uuid:01a0c7a4-ceb4-7743-bdf6-52d96467c1e9` (LLM existing-code modification). Legacy survey:
`tests/refactoring-survey-sok.md`. Distillation decisions: `tests/forge-verification-ledger.md`.
