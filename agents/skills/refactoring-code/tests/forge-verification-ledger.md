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

**Open defects:** none blocking. Deferred (recorded, not fixed): house-wide plain-scalar
descriptions in OTHER skills still fail strict YAML (this skill, implementing-and-debugging, and
structuring-documents are fixed/already `>-`; a repo-wide sweep is `operating-the-harness` territory).

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

**Verification pass 1 — 6-lens adversarial fleet (read-only, same day)**: cut-refuter / one-home /
survey-fidelity / trigger desk-check / F1-operationality / user-acceptance. Result: **0 blockers,
8 major, 12 minor, 6 nits** — all lenses `defects-found`, all findings fixed same day (below).
Notable CLEAN verdicts: the four adversarial routing asks (preparatory refactor, mixed
extract+bugfix, rename, review+cleanup) route without a race; the SKILL.md LAW/PURPOSE poles do not
cite "faster" as fact.

Major findings → fixes (all landed v2607.1.0):
1. PERFORMANCE/OPTIMIZATION raced between siblings and the two-hats cut wasn't runtime-answerable
   for it → PERF routing row added HERE + i&d gained perf FIRES/triggers; "this is slow" is
   behavior-changing on the declared observable surface (safety-net §5).
2. Connascence spectrum split-brained across 3 files with an undefined "Value" level →
   architecture.md §5 declared SOLE home (static/dynamic canonical lists); SoK now points.
3. Rule of Three split-brained (numeric gate vs sampling procedure) → strategy.md §4 declared SOLE
   home; architecture.md §7 points and keeps only the motive-direction cut.
4. strategy.md §3 stated Beck's DCF/optionality as fact → marked conceptual model GRADE Low at
   point of use.
5. strategy.md §2 asserted deferred-payoff (Design Stamina) as fact → reworded; hypothesis flagged.
6. **G3 deny-gate was self-certifiable prose** (template-fill without evidence) → each line now
   REQUIRES a cited mechanical observation (grep/git-log/one-sentence-test at file:line); uncited
   line = failed gate. "future speedup / better design / cleaner" = invalid fillers.
7. **"responsibility relocated" filler had no present-driver floor** (astronaut license through the
   split direction) → bound to the SRP-actor predicate: named distinct second actor + cited
   cross-break required, else DENIED as SRP-over-application; §7 gained the MOVE/SPLIT branch.
8. Same as 6 (two lenses converged on the self-certification hole from different directions).

Minor/nit fixes: description truncation risk (DECISIVE cut moved to FRONT, triggers trimmed);
rename disambiguated (cross-file rename-for-structure vs trivial); locality predicate's next-change
input gated by provenance (issue # / TODO file:line / git-log co-change ≥2, else Speculative
Generality); "over-firing is dominant" reframed as design posture reconciled with SoK §4.1 (both
directions listed; under-firing guarded by G1); G1 pointer retargeted; token block made operational
(grep-able gate tokens); DI added to safety-net Regime 2; SoK §3.5/§2.2/§2.4-E marked
architecture.md as owner; SoK §4/§4.1 stale gate numbers fixed to shipped G1–G5; structuring-
documents gained the reciprocal NOT-code pointer; Weirich attribution added.

**Verification pass 2 — external independent review (user-run, Codex/strict-YAML lens, same day)**:
P0 frontmatter fails strict YAML (plain scalar with ": ") — **partially refuted** (Claude Code's
lenient parser demonstrably loads the identical pattern — i&d fired in-session while strictly
invalid), **but fix accepted**: the repo dual-deploys to Codex (strict PyYAML), the house floor
script (`skill-check.sh`) demands `>-` with a 2026-07-02 incident note, and 16 house skills already
use `>-`. → description converted to `>-` AND compressed ~2117→~1500 chars with the DECISIVE cut
front-loaded; i&d converted too (same latent defect; reloaded live, verified). P1 ledger-pending →
this entry completes it. P1 destructive git (`git checkout --` / `git checkout .`) taught in
strategy.md → replaced with `git stash` (recoverable) + explicit-approval rule for destructive
restores (G4 + strategy §2/§7). P2 commit-as-artifact over-demanded → G1/G4 artifacts reworded to
separable diffs/steps; "commit only when asked". P2 tests-contradiction (Fowler's "adds no tests"
vs characterization-first) → strategy §1 clarified: the refactoring hat never changes behavior
EXPECTATIONS; characterization tests may PRECEDE the refactor as net-building. P2 one-home erosion
on the deny-gate (3 copies, stale numbering) → architecture.md §6 declared SOLE owner; G3
abbreviated + points; SoK marked snapshot; stale gate numbers fixed.

**Floor-script + parse status at freeze**: `skill-check.sh` clean run and strict-YAML parse of all
three touched skills recorded in the shell log of the forge session (2026-07-05); description
~1500 chars (≤1500 warn threshold), `>-` folded.
