# Forge verification ledger — refactoring-code (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set lives inline in SKILL.md
(Fire / no-fire section) — re-run it after any description edit.

## CURRENT STATE

**LAW — two poles (live):**
- **SAFETY**: behavior-preservation is an *oracle you name before you touch*, not the word's
  connotation. An LLM edits text not a precondition-checked AST → default is the strict oracle branch.
- **PURPOSE**: a structural edit improving no named architecture property is 場当たり churn, forbidden.
  責務分界 (one home per responsibility) + 局所化 (change stays local) is the target.

**Invariants (live):**
- **DECISIVE cut vs `implementing-and-debugging` = Beck's two hats**: does OBSERVABLE behavior change?
  yes (feature/bugfix) → i&d; no (structure only) → here. They co-fire in sequence for preparatory
  refactoring. Reciprocal edit landed 2026-07-05 on BOTH sides (i&d description/MUST-NOT-FIRE/routing
  row/fire-no-fire yield リファクタ to here; this skill's routing names the co-fire).
- **PURPOSE cut vs `structuring-documents` = object**: same 認識体系 (Parnas uses-DAG = its reference
  DAG; Martin CCP = its single-update-point), different artifact (code vs document/prose). Never run
  one on the other's object.
- **TIME cut vs `/code-review` /simplify**: they review/clean a written diff post-hoc; this governs
  before/during. `/code-review` after a refactor catches a smuggled behavior change (a G1 violation).
- **G3 = the harsh spine (場当たり禁止)**: the two-line deny-gate (MOTIVE + PROPERTY-DELTA, both
  concrete, or no edit) + SMELL≠EDIT + over-refactor check + wrong-abstraction reversal + no
  "while I'm here". Over-firing (restructuring on sight) is the model's dominant error here — the gate
  is first-class because of that, not despite it.
- **YAGNI reconciliation (D9)**: pursuing architecture and obeying YAGNI is ONE checkable cut
  (present consumer vs hypothetical), not rival dials. The 3-slot MANDATORY test gates merciless
  refactoring; volume ("smaller/cleaner/more SOLID") never justifies a demarcation — run the depth test.

**Open defects:** (pending verification fleet — appended below on completion).

**Retired decisions (do not resurrect):** none yet.

## 2026-07-05 forge (v2607.1.0)

**Source**: two SoK surveys, provenance-verified (full corpus in `refactoring-survey-sok.md`):
1. 19-agent survey of the refactoring canon (Fowler 2e / catalog / smells / Beck *Tidy First?* /
   Feathers *WELC* / Opdyke+empirical SE / large-scale patterns / rewrite-vs-refactor / TDD+Simple
   Design+Clean Code / LLM-agent lens) + 8 debate reconciliations (each with a moderator + GRADE) +
   completeness critic (15 gaps). ~691k tokens, 101 tool uses (risky attributions web-verified).
2. 7-agent architecture-axis survey (Parnas 1972 read verbatim / Constantine Structured Design /
   Martin SRP+CCP+package principles / DDD+Conway+vertical-slice / 場当たり anti-pattern) + the
   YAGNI-vs-architecture reconciliation + the harsh 場当たり test. ~340k tokens, 82 tool uses.

**Why this skill exists (EXISTENCE GATE)**: `implementing-and-debugging` owned「リファクタ」but its
LAW is anti-flailing for behavior-CHANGING work; refactoring is a distinct discipline (behavior
preservation as the definition, smell→transform, the oracle, small reversible steps, the economics of
when). Carved out as a new skill with the two-hats DECISIVE cut rather than reforged into i&d, so one
skill doesn't carry both behavior-change and behavior-preserve. User approved the placement.

**User steer integrated (2026-07-05)**: "場当たりリファクタを厳しく罰しているか / 良いアーキテクチャ
（責務分界・局所化）を追求しているか" → drove the 2nd survey and elevated G3 (the deny-gate) to the
spine, and added the PURPOSE pole to the LAW. The first draft had the material inside a single G4;
the steer surfaced that 場当たり-punishment must be a first-class harsh gate and 責務分界/局所化 the
positive thesis, reconciled with the survey's strong YAGNI finding via motive-direction.

**Architecture**: SKILL.md (LAW + 5 gates + routing + fire/no-fire) + 4 references (architecture =
G3 spine / catalog = smell→move + depth / safety-net = oracle regimes / strategy = whether-when +
how-big) + tests (this ledger + the SoK survey). One-home map: coupling/cohesion/connascence
*classification* + deny-gate → architecture.md; smell list + named moves + depth test → catalog.md;
oracle regimes + characterization/seams/mutation + AST-vs-text → safety-net.md; two-hats/rule-of-
three/tidy-first/rewrite/hotspot + Strangler/BbA/Parallel-Change/Mikado → strategy.md.

**Verification (independent read-only fleet)**: results appended on completion below.
