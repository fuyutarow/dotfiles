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
script (`skill-check.ts`) demands `>-` with a 2026-07-02 incident note, and 16 house skills already
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

**Floor-script + parse status at freeze**: `skill-check.ts` clean run and strict-YAML parse of all
three touched skills recorded in the shell log of the forge session (2026-07-05); description
~1500 chars (≤1500 warn threshold), `>-` folded.

## 2026-07-30 — rebuild-bet seam

Behavior-preserving structure stays HERE. A cheap reversible probe uses the domain executor; only an
expensive or irreversible rebuild bet can enter `acting-on-hypotheses`. The description now meets the
Codex 1024-character limit.

**PROSE-DEBT waiver (2026-07-30).** `skill-check.ts` exits 0 with 26 long prose sentences, a 7-line
version block, and two long table cells. Queue position: before the next feature reforge; move version
history here first, then atomize prose without blurring the behavior-preservation cut.

## 2026-08-03: PROSE-DEBT waiver — practicing-tiger-style reciprocal cut
Observed floor: 26 long prose sentences, 7-line version block, and 2 long table cells; exit 0.
This change is the reciprocal cut only; no unrelated prose rewrite was authorized.
Queue: retain the existing reforge position; retire this waiver when the recorded classes reach 0.


## PROSE-DEBT waiver (2026-09-21)

This skill's SKILL.md gained one reciprocal routing row for `driving-git` (a new sibling). The
prose-debt WARNs the floor reports predate that edit and are untouched by it. Waived for this
seam edit; queue position: with the next reforge of this skill, not before.

## 2026-09-22 — LLM existing-code modification re-distillation (v2609.2.0)

**Canonical sources.** The raw papers were synthesized before skill work. This reforge consumes
the resulting positions, not the raw corpus:

- general refactoring: `urn:uuid:01a0c779-fd07-719d-a845-3d9c0c8cfb3d`, especially `RFG-001`–`003`;
- LLM existing-code modification: `urn:uuid:01a0c7a4-ceb4-7743-bdf6-52d96467c1e9`, especially
  `LECM-Y001`–`Y004` and source claims `LECM-003`–`006`.

**Function map.** `non-trivial behavior-preserving structural request (including deletion or a
compound move) → classify the claims to prove → name behavior/structure/absence/scope oracles →
execute atomic rows → return only when every required row is green`. The owned artifacts are the
G2 claim→oracle table and G4 atomic acceptance table. The stop condition is a missing oracle or a
red/partial row.

**Calibration inversion.** The bounded literature does not establish that LLMs are universally
worse at refactoring than generation. It does establish benchmark-specific partial/substituted
refactors, under-deletion, and test oracles that miss unwanted retained code. The agent's default
failure is SAME-direction: accept green tests as completion. Therefore the skill does not repeat a
model-capability ranking; it promotes claim-specific completion oracles.

**Distilled rules and grades.** G2's behavior/structure/absence/scope separation is a
`supported-with-limitations` operationalization of `LECM-Y002`–`Y003` plus `RFG-002`–`003`.
Deletion's zero-state contract is skill-supplied from the same claims. G4's compound→atomic table is
skill-supplied from `LECM-004`'s observed partial operations. The rule that generic AST rewrites are
not semantic proofs repairs an overclaim in the previous Regime 1 table.

**Incidental defect fixed.** The routing table carried two identical `/code-review`, `/simplify`
rows. One was removed; no semantic cut changed.

**Adversarial verification.** The first source-fidelity pass found one P1 and two P2 issues:
semantic engines were still conflated with generic AST executors; G4 required tests even when G2
selected a semantic precondition; and the dead-code trigger exceeded the source boundary. The first
structure pass found two P1 and one P2 issue: dead-private deletion could not fill G3, compound rows
omitted scope, and public-API deletion lacked an early handoff. All were fixed. Follow-up source
audit returned CLEAN. Follow-up structure audit confirmed all five desk checks; its one remaining
pointer finding added `refactoring-survey-sok.md` to the literal verify command.

**F3 receipts.** `skill-check.ts agents/skills/refactoring-code` has no structural FAIL. The full
collection floor reports `LISTING 71 skills, 65218 chars charged per turn`, below the declared
65242 ceiling. Fire/no-fire desk checks: proven-unreachable private removal→HERE; supported public
feature/API removal→implementing-and-debugging; trivial tool rename→no-fire; compound split+move→
HERE with atomic rows; green tests with guarded retained code→red absence oracle.

**PROSE-DEBT waiver (2026-09-22).** Baseline was 122 long reference sentences, 26 long SKILL.md
sentences, a 7-line version block, and two long table cells. This reforge leaves 119/26/2 and clears
the version-header class; no debt class increased. The previous queue is partially discharged, not
silently retired. Queue the remaining mature-body atomization as a dedicated prose-only reforge
before another broad architecture/catalog revision; do not mix it into a source-fidelity change.


## 2026-09-23: parallel-edit capacity (architecture.md §8) — distilled from one day of live fan-out

Source: a Rust CLI (~104k lines) with ~15 subagent arms dispatched against it in one day, each in
its own worktree off a moving trunk, integrated by a single director. Every row of §8's table is a
collision that actually cost time that day. The narratives live here; the rules there stay LOOKUP.

**Why it is not a new property.** The first draft framed parallel-friendliness as a fourth thing to
trade against cohesion and coupling. That was wrong and would have justified churn: it let any
extraction claim a benefit no one had measured. The correct framing is Parnas §1's own predicate
with the quantifier changed — one change touching one module becomes N concurrent changes touching
disjoint modules. Nothing new is traded; the same locality is being spent by more consumers at once.

**The observed collisions.**

| Shape | What happened |
|---|---|
| long function | one 1,488-line function inside a 4,357-line file; 24 commits touched that file in 24 h for unrelated reasons, so every task "in that area" queued on it |
| shared struct | two arms extended the same payload struct in parallel — a 21-hunk merge conflict, entirely self-inflicted by the dispatch |
| hand-maintained mirror | a hand-kept list of payload member names drifted from its type four separate times before a mechanical check was added |
| global snapshot | one insta golden file covering the whole CLI surface; every arm changing observable output rewrites it. The working technique: regenerate twice against an intermediate tree state so each commit's snapshot diff contains only that commit's lines |
| privileged region | frozen schema bundles an arm may not edit. A staging directory existed, but the drift test gated on the frozen copy, so the unprivileged half of the task could not complete — the arm stopped and reported rather than guessing |
| append-only beside mutable | an arm cut from an older trunk edited an already-accepted, digest-chained spec revision, because "which revision is current" was guessable from the directory listing |

**The two brief rules.** The scope oracle (G4) caught two stray edits that day, but only because it
was run against the integrator's tip rather than the arm's own base — those had diverged by four
commits. The green-and-blocked rule comes from two arms that stopped rather than fabricate: one
found a genuine circularity (a duration cannot be written into the payload of the call it measures),
and one corrected the director's own premise. The counterexample was reported the same day from a
neighbouring project: a subagent reported "zero deletions" on a diff that had deleted seven lines.

**Floor.** `skill-check.ts` run with and without the edit: identical WARN counts (references 119
long sentences, SKILL.md 26, 2 table cells >400). The first draft scored 122 and 4 and was rewritten
rather than waived. Pre-existing debt untouched and still queued.

**Deliberately not included.** Dispatch mechanics (which isolation tier, worktree flags, resource
envelopes) stay with `operating-the-harness`; what a session must check and announce when another
may write the same repo stays with `driving-git`'s shared-checkouts. §8 owns only the code's shape.

## 2026-09-23 — invariant design versus preservation

Added the `designing-type-contracts` cut; preservation stays here.
Tightening input acceptance/public construction must not silently become a behavior-preserving refactor.
Source: SoK `urn:uuid:01a0cd74-0db5-7631-a93d-b6a4a73e1b19` and this skill's two-hats rule.
PROSE-DEBT waiver: references 119 long sentences, body 26, 2 long cells; unchanged from baseline.
Queue: next full reforge; no additional structural rewrite belongs to this reciprocal seam.
