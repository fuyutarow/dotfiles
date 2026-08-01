# Forge verification ledger — directing-research (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set lives in `tests/triggers.md`
(re-run after any description edit). This file records invariants, open defects, retired decisions, and
the dated forge log with its adversarial-verification results.

## CURRENT STATE

**Invariants (live):**
- **Territory** — the JUDGMENT / 観察眼 layer of conducting research for an AI4S agent: SELECT (by
  consequence), FORMULATE (un-gameably), don't-fool-yourself (structurally), STEER (by learning-rate). It
  owns none of the discrete research moves.
- **THE LAW — replace virtue with mechanism.** The consumer is an agent with no fear/ego/surprise +
  superhuman cheap search; its failures are structural/statistical, not motivational; so every research
  virtue is converted to a checkable mechanism, and enforcement concentrates on the **capability-scaling**
  failures (self-deception, Goodhart) the human-in-the-loop cannot catch (the auditor's evidence is
  produced by the audited). Full argument: `references/sources.md` §inversion (SOLE home).
- **Four gates → the RESEARCH JUDGMENT SPEC + `scripts/research-check.ts` floor** (F1 operationality; mirrors
  `forging-novel-theses` gate-check + `arguing-research-papers` claim-check). G2 (formulation) and G3
  (honesty) are the load-bearing gates.
- **Two heuristics FLIP for the agent**: "let go" → also "STAY" (agent over-pivots); "broaden" →
  "de-center" (taste is too central/median). Carry both poles; default to the inverted pole.
- **Sibling cuts** (SKILL.md Routing): the sharpest is **CARDINALITY + DOWNSTREAM EXPOSURE vs
  `acting-on-hypotheses`** (expensive/irreversible SINGLE bet there; cheap reversible probe to the
  domain/plain executor; across-bets + standing-honesty-policy here). Plus PURPOSE vs forging-novel-theses
  (generate), VERB vs raising-resolution (inspect), PURPOSE vs implementing-and-debugging (fix), OBJECT vs
  systematizing-knowledge (others' corpus vs own pipeline), PHASE vs arguing-research-papers /
  designing-presentations (write-up/talk).
- **Execution model** — verdicts stay SOLO. The domain **Independent-audit requirement** fixes
  separation/evidence/acceptance; `orchestrating-agents` instantiates any actor fan-out.

**Resolved defect (historical; do not treat as LIVE).** The earlier AOH boundary used cardinality alone
and its description raced with portfolio asks. The current reciprocal cut is cardinality plus downstream
exposure: multiple bets stay here; one expensive/irreversible load-bearing tree goes to
`acting-on-hypotheses`; one deterministic, bounded, reversible probe goes to the domain/plain executor.
The AOH description and `references/boundaries.md` now carry the reciprocal gate.

**Retired decisions (do not resurrect):** none yet.

## 2026-07-09 — initial forge (v2607.1.0)

**Source.** A 15-agent adversarially-reconciled SoK survey (2026-07) of the research-judgment canon:
12 source-cluster extraction agents (taste-hamming, selection-matrices, formulation-polya,
formulation-ai4s, rigor-feynman, metascience, rigor-ai4s, program-portfolio, productivity-practice,
research-philosophy, field-taste, ai4s-agent) + 3 cross-cutting agents (completeness critic, AI4S-agent
model-failure analyst, reconciliation analyst). Each returned 観察眼 heuristics graded at capture,
contradictions with moderators, an AI4S-agent model-failure note, and MECE boundary flags against the
siblings. Full provenance & grades: `references/sources.md`. The reconciliation (Aufhebung → the
virtue→mechanism LAW + per-tension moderators) and the architecture were done SOLO.

**Design decisions of record.**
- Named `directing-research` (gerund-object; "directing" connotes the helm/judgment altitude — set the
  direction, keep it honest, steer — not the execution). Considered `conducting-research` (umbrella-risk)
  and `steering-research` (under-covers selection/formulation).
- The killer distillation is the **calibration inversion**: human research failures are
  emotional/motivational, the agent's are structural, so **virtue→mechanism** is the LAW, and the
  self-deception + Goodhart failures DOMINATE (scale adversely with capability, human-uncatchable). This
  is why the skill is genuinely MECE-distinct — no other skill addresses the AGENT's structural
  research-judgment failures.
- MECE against the action-trio is an **ALTITUDE cut**: single action (test one bet / invent one thesis /
  inspect one fact) → the trio; the judgment ACROSS bets + the standing honesty policy → here. The survey
  pre-flagged every seam (MECE boundary flags per cluster).

**Verification at forge.** Floor: build-order one-liner + `forging-skills/scripts/skill-check.ts`
(exit 0) + `research-check.ts` fire-test (unfilled spec → 7 FAILs; well-formed spec → exit 0 — proven
red/green). Adversarial **7-lens fleet** (self-contradiction · one-home/architecture · sibling-cuts read
against the SIBLINGS' actual text · bloat/operationality · trigger desk-check · comparative-judge ·
source-fidelity), 0 agent errors: the top-level verdicts confirmed the **core is sound** (THE LAW, the
four gates, G2/G3 mechanisms, the SPEC + floor are genuinely operational; comparative-judge net-positive
on the honesty/steering asks). 40 findings (18 major / 16 minor / 6 nit), **all resolved SOLO**. Key
fixes: (1) resolved the floor↔LAW contradiction — "concentrate on G2/G3" reworded to *scrutiny* not
*floor-enforcement* (all four gates' artifacts remain required); (2) the floor now checks the three
previously-unchecked declared artifacts (fluency / throws-away / negation) and the virtue deny-scan is
anchored to exhortation forms (no longer false-flags a "bold" probe); (3) **re-cut vs
`acting-on-hypotheses` to CARDINALITY-OF-INDEPENDENT-BETS** (historical decision, superseded in
v2607.4.0 by the downstream-exposure gate) — resolving the then-visible single-direction ambiguity;
(4) single-homed the calibration inversion
(SKILL.md THE LAW states it, sources.md §inversion grounds it — dropped the false SOLE-argument claim and
the duplicated machinery); (5) pointed the REFORMS leakage taxonomy to `systematizing-knowledge` and
reframed "become one with the data" as a mandate handing the inspection ACT to `raising-resolution`;
(6) **softened two over-asserted directional thumbs** — the fluency-as-crowdedness rule demoted to a weak
flag (never upgrade what you can't method-sketch), and "default to the inverted pole" softened to
diagnose-don't-default (a flip never overrides the gate's evidence); (7) fixed the virtue leak in
selecting §4 (Alon's intrinsic-motivation → the inject-a-novelty-term mechanism for the ego-less agent);
(8) cut bloat (lab-culture anecdotes, Thiel orphan tension, Cajal/Pólya/Tetlock-disposition enumerations)
and wired Newell's anti-scattershot rule into formulating §5; (9) de-quoted the needs-verification
attributions (Wilson, Cajal, Millikan-as-Feynman-told-it) and added the missing ledger rows
(Box/Occam/Maslow/Newell/Thiel); (10) description trimmed under 1500 with the learning-rate homonym
disambiguated. Two nits **rejected** as house-inconsistent (the immunization sentence and 同型 /
感触では通れない are house-mandated). Post-fix floor: build-order clean, skill-check exit 0, spec
red-on-empty / green-on-well-formed re-verified.

## 2026-07-11 external review #2 (Codex) — adjudication & fix cycle

**Codex verdict: ship-with-fixes** (6 major + 2 minor, all in/around `scripts/research-check.ts` and
the SKILL.md gate table).

| # | Severity | Verdict | Resolution |
|---|---|---|---|
| **1** | major | **ACCEPT** | floor WARN-vs-FAIL contradiction with "no artifact, gate un-passed" — fixed by **S4** (severity-map header added to `research-check.ts`, mirroring SKILL.md's `[floor: FAIL]`/`[floor: WARN]` gate-table annotation) + **S5** (†-marker hard/advisory legend added to SKILL.md so the gate table and the script agree) |
| **2** | major | **ACCEPT** | `has_threshold` passing on bare timestamp digits (a pre-reg date alone read as a kill-threshold) — fixed by **S4**: `strip_timestamp()` removes `YYYY-MM[-DD]`/`YYYY/MM[/DD]` tokens from a COPY of the value before the threshold check runs |
| **3** | major | **ACCEPT** | slot-presence ≠ mechanism-presence (a filled-but-hollow slot still reads as "done") — fixed by **S4**: 4 bounded token-minimum checks added on top of slot presence (firewall optimize/witness = FAIL; the other 3 = WARN) |
| **4** | major | **ACCEPT** | dLearning/dt underspecified as a kill signal — fixed by **S5**: a learning ledger added to `references/steering.md` §1 |
| **5** | major | **ACCEPT** | witness lifecycle missing (adaptive-data-analysis contamination — a witness re-used across rounds stops being held-out) — fixed by **S5**: witness lifecycle added to `references/formulating.md` §2 |
| **6** | major | **ACCEPT** | cardinality cut vs `acting-on-hypotheses` undecidable pre-Map (can't classify single-bet vs. portfolio before the Map step exists) — fixed by **S5**: explicit decision-order added to the routing row + `tests/triggers.md` |
| **7** | minor | **ACCEPT** | ≥3-hypotheses ceremony risk (padding a live-hypotheses list just to clear the floor's count) — fixed by **S5**: exhaustive-binary / nested-in-one-tree exception added, naming the excluded alternative classes instead of padding |
| **8** | minor | **ACCEPT** | Hamming's "measured finding" phrasing overclaims for judgment-layer work — fixed by **S5**: downgraded to "reported observation" |

**Codex non-findings (recorded):** the arguing↔directing HARKing seam is clean; source spot-checks
sound (Lakatos / Chamberlin / Platt / Goodhart / Kapoor-Narayanan, with primary links — and, shared
with the arguing-research-papers review, Swales / Toulmin / C-C-C / Boutron / Bordage).

**S4 residual-risk adjudication.** Firewall optimize/witness token check's case/space brittleness
(`Optimize` capitalized not matched, `held out` with a space not matched) is **FIXED in this wave**
(task 1 of this cycle: `has_optimize_token`/`has_witness_token` now match on a `tolower()` copy) —
re-verified via stdin fixtures: `Optimize on seen MAE || Witness: held out families` → PASS;
`we track validation MAE` → still FAIL; the full unfilled RESEARCH JUDGMENT SPEC template → still FAIL=7
WARN=6, exit 1; a fully-good spec → exit 0. Two residuals **accepted as known, documented residuals,
not fixed this wave**: (a) `has_independence_token`'s WARN-level risk that "indifferent"
substring-matches "different" (a false PASS on the independence check, WARN-level not FAIL-level); (b)
the dropped `→ 0` threshold pattern (an explicit "kill when metric → 0" phrasing is not recognized as
a threshold token by `has_threshold` — no comparator/percent/keyword token accompanies the digit).
Both left for a future reforge.

Fix execution was delegated to Sonnet-5 agents (S4 → `scripts/research-check.ts`; S5 → `SKILL.md` +
`references/steering.md` + `references/formulating.md` + `tests/triggers.md`; disjoint file ownership)
under Fable-5 direction, with floor (`research-check.ts`) verification green after fixes: fixtures
green, no regressions (unfilled template FAIL=7 WARN=6).

## 2026-07-30 creative-research / collection-MECE reforge

**Trigger.** The broad ask “how can I do creative research?” exposed that the collection had no declared
lifecycle lead. `directing-research`, `forging-novel-theses`, and `acting-on-hypotheses` all plausibly
fired; thesis generation duplicated single-bet kill mechanics; problem construction had no explicit
owner. The earlier sections of this ledger describe the superseded v2607.1 architecture and are retained
as change history, not current LAW.

**Evidence work.** A bounded primary-source review covered problem construction, dual-space search,
real-lab discovery, analogy/schema transfer, problem-solution co-evolution, idea-selection bias,
bibliometric recombination/risk, incubation, LLM ideation, execution, and multi-agent diversity. Full
claim/scope/limitation ledger: `references/sources.md`.

**Architecture decision (solo).**

| Responsibility | Sole owner |
|---|---|
| broad creative-research stage diagnosis and lifecycle transitions | `directing-research` |
| research-problem construction, selection, formulation, admission, standing integrity, >=2-bet portfolio | `directing-research` |
| candidate-thesis genesis for a selected frame | `forging-novel-theses` |
| expensive/irreversible selected tree's Map / threshold / outcome table / commit / pivot / kill | `acting-on-hypotheses` |
| deterministic, bounded, reversible probe with no expensive downstream exposure | domain/plain executor |
| corpus state / novelty evidence | `systematizing-knowledge` |
| present artifact / anomaly inspection | `raising-resolution` |
| finished manuscript claim | `arguing-research-papers` |
| agent topology, visibility, veto timing, verification, acceptance | `orchestrating-agents` |

No new skill was created: the broad territory had an incumbent and the missing work was repaired by
reforging and reciprocal cuts.

**Core change.** Replaced the linear four-gate recipe with a coupled loop:
`GROUND -> CONSTRUCT -> FORMULATE -> GENERATE -> FREEZE/DEDUP -> SELECT -> TEST ONE -> UPDATE/REOPEN`.
Human incubation is a conditional side branch after preparation/impasse; it has no agent analogue.

**Removed overclaims.** The current LAW forbids universal claims that problem setting is “80%”, critique
is easy, distant analogy is the main discovery cause, novelty equals value, incubation reliably creates
insight, more agents monotonically increase diversity, or a scalar product ranks research problems.

**Mechanical contract.** `scripts/research-check.ts` now checks ten program artifacts. It explicitly:

- rejects a scalar product in place of separate selection axes;
- requires a registry/ledger locus plus a before/prior rule;
- does not require or parse a per-test kill threshold;
- accepts either >=2 program bets or an explicit one-tree handoff;
- requires an unexpected result to be able to reopen a problem frame or stage;
- closes the old `indifferent` -> `different` auditor false-positive with word-bounded independence
  tokens.

`tests/research-check.test.ts` fixes red/green behavior, including the regression that a timestamped
per-test threshold alone cannot pass the program registry policy. `tests/triggers.md` holds the
cross-skill 15-ask name+description desk-check and reciprocal-cut checklist.

## 2026-07-30 functional decomposition reforge (v2607.3.0)

**Why the prior decision was superseded.** The preceding wave assigned missing behaviors directly to
incumbent skill names. A blind forward test then showed the collection could produce multiple frames and
theses, but had no owner for eliciting human tacit knowledge, no open-set residual, and no recovery when
semantic dedup collapsed nominally different routes. The prior statement “No new skill was created” remains
historical; it is not the current architecture.

**Design unit.** The collection is decomposed by **function × state transition × owned artifact**, not by
topic label:

| Function | Input state → output state | Sole artifact owner |
|---|---|---|
| PRESENT-GROUND | uncited present claim → citable observation | `raising-resolution` |
| CORPUS-GROUND | unsystematized corpus → evidence state | `systematizing-knowledge` |
| EXPOSE | implicit plan/frame → explicit premise surface | `surfacing-blind-spots` (`Blind-spot packet`) |
| FRAME / STEER | exposed premises/evidence → selected problem/program state | `directing-research` (`RESEARCH JUDGMENT SPEC`) |
| FORGE | selected frame → structurally indexed thesis batch | `forging-novel-theses` (candidate packets + coverage matrix) |
| TEST / COMMIT | one expensive/irreversible selected tree → evidence-backed commit/pivot/kill | `acting-on-hypotheses` |
| RUN CHEAP PROBE | one deterministic/reversible tree → observed result with locus | domain/plain executor |
| ARGUE | completed evidence → defensible paper claim | `arguing-research-papers` |

`orchestrating-agents` remains an orthogonal control plane for roles, visibility, veto, and acceptance.
It composes these functions but owns none of their domain artifacts.

**Why `surfacing-blind-spots` is a new skill rather than another paragraph here.** It has a distinct
input (one existing plan/frame/decision), verb (EXPOSE, not choose or solve), output (`Blind-spot packet`),
stop condition (bounded breadth/depth after marginal discovery stops changing the decision), and reusable
handoffs outside research. No incumbent owned that complete state transition. The taxonomy covers declared
assumption slots but carries `OPEN` as a mandatory residual: functional MECE does not license the false claim
that unknown unknowns can be enumerated exhaustively.

**Evidence and limits.** `/dig` supplied the depth-interview pattern but explicitly optimizes depth rather
than breadth; the Serverworks report is one subjective, order-confounded use case and says the recovered
content may be human `Unknown Known` tacit knowledge. Ward (1994) and Smith, Ward & Schumacher (1993)
support default-category inheritance and example fixation; Reiter-Palmon & Murugavel (2018) support team
problem-construction process effects but report only marginal originality evidence; Doshi & Hauser (2024)
show individual generative-AI gains can coexist with lower collective diversity. These justify mechanisms
and cautions, not a claim that the new decomposition guarantees creativity.

**Validator repair.** `research-check.ts` now checks 13 structural mechanisms, including a Blind-spot
packet, breadth/depth exploration budget, functional frame roles (`CONTROL`, `PREMISE-BREAK`,
`ORTHOGONAL`) with explicit assumption slots and discriminators, and one bounded coverage-gap recovery
after diversity collapse. The previous shallow fixture—three synonymous “robustness” frames—now fails.
Focused regression result: `bun test agents/skills/directing-research/tests/research-check.test.ts`
→ 10 pass, 0 fail.

## 2026-07-30 collection-level F2 closure (v2607.4.0)

The independent function-map audit initially returned FAIL-to-freeze. This revision closes its
collection-level seams without claiming creative success:

1. **zero-frame bootstrap** — a broad topic with no inherited frame now yields exactly one
   evidence-located `PROVISIONAL-CONTROL`, which is then exposed by `surfacing-blind-spots`;
2. **honest frame coverage** — CONTROL, PREMISE-BREAK, and ORTHOGONAL are attempted roles, and an
   impossible role becomes `COVERAGE GAP` only with an attempted transformation, fixed
   fact/constraint, and illegitimacy witness;
3. **artifact ownership** — SBS owns its local `Search budget`; DR owns only an
   `Exploration allocation` pointer plus optional cross-frame probe cap;
4. **audit ownership** — DR owns the domain separation invariant, frozen evidence surface, hostile
   lens, and acceptance condition; `orchestrating-agents` alone instantiates actors, visibility,
   veto, authority, and acceptance records;
5. **one-tree action gate** — expensive/irreversible load-bearing bets route to
   `acting-on-hypotheses`; deterministic, bounded, reversible probes route to the domain/plain
   executor and return an observed result;
6. **OPEN continuity** — the one-tree handoff preserves an `OPEN-SET RESIDUAL (PASS-THROUGH)` with
   provenance and an observable reopen trigger.

The validator now rejects a copied SBS breadth/depth budget, an ungated cheap AOH handoff, actor names
without a domain audit requirement, and a vague frame-gap escape hatch. It accepts an explicit
impossibility witness.

Verification:

- `bun test agents/skills/directing-research/tests/research-check.test.ts`
  → 13 pass, 0 fail, 50 assertions;
- shared Bun script floor across DR/FNT/SBS → `FAIL=0 WARN=0`;
- Codex `quick_validate.py` → `Skill is valid!`.

**PROSE-DEBT waiver (2026-07-30).** `skill-check.ts` reports 22 long prose sentences. The increase is
from explicit cross-skill transition seams and adversarial clearing conditions; no validator or typed
cut failure is waived. Queue position: first item in the next prose-only DR pass.
