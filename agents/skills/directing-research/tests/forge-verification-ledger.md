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

**HISTORICAL PROSE-DEBT receipt (2026-07-30; superseded).** `skill-check.ts` reported 22 long prose
sentences after that reforge. The active waiver is the 30-WARN receipt in the 2026-08-02 transfer-route
section below. Neither receipt covers a validator or typed-cut failure.

## 2026-08-01 — reciprocal routing pointer / scoped prose-debt waiver

- Artifact: `SKILL.md` ownership and MUST-NOT-FIRE rows route cross-document research lifecycle
  governance to `governing-research-documentation` while retaining research-program judgment here.
- HISTORICAL receipt (2026-08-01; superseded): `skill-check.ts` reported exactly 22 prose sentences
  >120 chars. The active 2026-08-02 waiver below replaces this count without erasing the history.

## 2026-08-02 — transfer-route contract reforge (v2608.1.0)

**Trigger.** A cross-domain-transfer and documentation-governance audit found a missing transition: the
collection could mention analogy, but did not distinguish donor discovery, source-to-target mapping,
and a target-side program verdict. That omission lets source-side success be silently treated as evidence
for the target, and lets failed correspondences disappear from the denominator.

**Function map (live).**

| Input state | Sole verb / owner | Artifact / next state |
|---|---|---|
| source relations are not bounded, and no target map is authorized | `systematizing-knowledge` discovers and compares | target-agnostic `DONOR SET` |
| selected target frame + frozen donor set | `forging-novel-theses` maps or refuses the correspondence | frozen transfer bundle containing `CANDIDATE` and/or `MAPPING-BREAK` attempts |
| frozen bundle + programme context | `directing-research` admits, tests, reopens, adopts, or retires | SHA-256-bound `TRANSFER DISPOSITION`, complete denominator, preserved breaks |

`directing-research` may allocate a bounded route but never constructs or repairs a source-to-target map.
`systematizing-knowledge` stops before target mapping, prediction, thesis, or test verdict. A bundle with
only breaks is an honest `REOPEN`, not a candidate-generation failure to conceal.

**Evidence calibration.** Added C21–C27 for relational structure/comparison (Gentner; Gick & Holyoak;
Gentner et al.), situated brokerage and boundary translation (Hargadon & Sutton; Star & Griesemer;
Carlile; Bechky), and priming/analogy alternatives (Dunbar & Schunn). Each is bounded to its study or
theoretical scope. None is cited as evidence that the house fields, a wiki, distance, a broker, or a
documentation form causally improves discovery.

**House gates.** An active disposition names the bundle path and SHA-256, has every attempt ID in its
denominator, preserves all `MAPPING-BREAK` IDs, and records `TEST|REOPEN|ADOPT|RETIRE` for each candidate.
`TEST` has an untested target prediction registry plus handoff. `ADOPT` and `RETIRE` require a frozen
`TARGET RESULT` whose path/digest, frozen transfer-bundle binding, candidate ID, target observation,
numeric prewritten threshold, non-donor observation locus, threshold result, mapping-assessment request,
and break-preserving handoff are revalidated. `ADOPT` additionally requires `PASS`; retirement names
the tested mapping family/boundary without rewriting its recorded outcome. Donor-side success never
clears either gate.

**OPEN residual.** A read-only repository evidence bundle may eventually deserve a constrained harness
surface only after repeated authority/coverage/digest failures demonstrate that documents and the existing
validators cannot carry it. A generic `repo-write` remains out of scope: any future application surface
must consume a domain-signed artifact, exact base digest, allowlisted files, and acceptance command. This
is a design threshold, not an implementation or a claim about external tools.

**Verification.** `bun test agents/skills/directing-research/tests/research-check.test.ts
agents/skills/directing-research/tests/transfer-chain.test.ts` passed 32 tests / 133 assertions. The suite
exercises a complete lower-case/detail `Operation: transfer — ...` bundle; incomplete bundle rejection;
omitted `MAPPING-BREAK`; all-break `REOPEN`; source-side-only `ADOPT` rejection; frozen `TARGET RESULT`
validation before `ADOPT`; wrong candidate, cross-bundle ID rebinding, nested-heading field borrowing,
donor ID/result laundering, exact-locator and same-source alternate-anchor reuse, vague/vacuous or
arithmetically contradictory thresholds, `FAIL` adoption, unresolved mapping reassessment, destructive
or negated break handoff, wrong digest, and fatal missing result; valid `RETIRE` after either `PASS` or
`FAIL` without outcome rewriting, plus rejection of unbounded retirement; missing `--donor-set`; fatal missing donor and transfer-bundle dependencies;
realpath-equivalent symlink acceptance; parser boundary alignment with the FNT validator; duplicate
field/section rejection; and the full DONOR SET → FNT → director chain.
`bun agents/skills/writing-bun-scripts/scripts/script-check.ts
agents/skills/directing-research/scripts/research-check.ts` reported `FAIL=0 WARN=0`.
`quick_validate.py` passed via `uv run --with pyyaml`; `git diff --check` and scoped Biome check passed.
**PROSE-DEBT waiver (2026-08-02).** `skill-check.ts` reports 30 long-sentence technical-prose WARNs,
with no structural failure. A prose-only pass must reduce them without weakening the transition or
freeze contracts. This waiver covers no validator, trigger, or evidence-boundary failure. Do not claim
this ledger row proves cross-domain creative success.

## 2026-08-02 — research-process postmortem extension

**Existence decision.** This is an `EXTEND`, not a new Skill and not a split, merge, rename, or
retirement. The incumbent already owns D4 standing integrity, T6 result-to-update, stage diagnosis,
and reopen/portfolio judgment. The missing surface was a named retrospective transition with
prospective evidence and an explicit semantic artifact.

**Function map.** A completed, failed, stopped, or aborted research episode, frozen `RUN INTENT`
artifacts, terminal `RUN RECEIPT` artifacts, and the current frame are compared against registered
expectations, controls, missingness, alternatives, and process integrity. The output is one
`RESEARCH PROCESS POSTMORTEM`: a `RETROSPECTIVE JUDGMENT` plus an updated
`RESEARCH JUDGMENT SPEC`. It chooses `persist`, `pause`, bounded `retire`, or the earliest honest
research-stage `reopen`.

**One-home decision.** `directing-research` owns semantic lens verdicts and the research transition.
`governing-research-documentation` owns durable admission, authority, review, retention, and deletion.
`orchestrating-agents` owns bearers, visibility, veto, acceptance, and dispatch/pacing/delegation
postmortems. `continuing-long-running-tasks` transports artifact loci across sessions without copying
research evidence. A repository checker owns structural fields, hashes, enums, joins, terminal
coverage, and known privacy patterns; it cannot certify creativity or semantic validity.

**Calibration.** Process and outcome are separate axes. The semantic lenses use only `EVIDENCED`,
`VIOLATED`, `NOT-EVIDENCED`, and `NOT-APPLICABLE`; no scalar creativity score is admitted. Missing
prospective or terminal history yields `PARTIAL` or `UNAUDITABLE`. No precommitment may be reconstructed
after outcome access, and no raw reasoning, transcript, prompt/control text, secret, or credential may
enter the artifacts.

**Source and limit.** This is a house contract distilled from the signed task transition and the
incumbent's existing integrity/update seams. It is not external evidence that this process causes
creativity or that a structural PASS proves causal validity, surprise importance, independence, or
coverage beyond the declared denominator.

**Component verification receipt.** The Codex default
`quick_validate.py agents/skills/directing-research` returned `Skill is valid!`. House
`skill-check.ts agents/skills/directing-research` returned exit 0 with `FAIL=0 WARN=0`, clearing the
superseded 30-WARN waiver without weakening its gates. The existing director suite returned 32 pass,
0 fail, and 133 assertions. The classified trigger query returned all nine new rows; manual
name+description arbitration confirmed `D`, `O`, `G`, `C`, incident-owner, and ordered `D -> O` routes.
Scoped tracked `git diff --check` passed. The untracked reference returned the expected no-index diff
status 1 with no whitespace finding. An initial component probe reported the separately owned
`scripts/research-run-check.ts` as missing. After that component landed, the final atomic-build probe
printed nothing and passed. File digests are reported in the executor handoff because embedding this
ledger's own digest here would be self-referential.

## 2026-08-02 — research-run tooling integration receipt (v2608.2.1)

The semantic docs now name every landed component explicitly: three assets, the
`scripts/research-run-check.ts` entry, five `scripts/research-run/*.ts` modules, three research-run
test/helper files, and `tests/family-routing.test.ts`. The atomic-build list contains exact paths;
it does not depend on an unchecked wildcard.

The C1 draft was rejected as a 912-line checker plus a 454-line test monolith. The accepted
decomposition is 114 lines for the entry; 183, 174, 228, 117, and 180 lines for the five modules;
and 245, 114, 207, and 88 lines for the test/helper/routing files. Every component is below 300 lines.

The retrospective judgment has two distinct axes. `TRANSITION` chooses the semantic research-state
update; `EPISODE_DISPOSITION` chooses `PERSIST`, `PAUSE`, `RETIRE`, or `REOPEN` for the programme.
The artifact must argue that pair's compatibility from evidence and current state. The checker only
verifies field presence and enum membership; it intentionally does not certify semantic compatibility.

Verification receipts:

- research-run checks plus family routing -> 29 pass, 0 fail, 71 assertions across three files;
- every D Bun test -> 61 pass, 0 fail, 204 assertions across five files;
- `script-check.ts` over all ten landed TypeScript components -> `FAIL=0 WARN=0`;
- Biome over the same ten files -> `Checked 10 files`; no fixes applied;
- Codex `quick_validate.py` -> `Skill is valid!`;
- house `skill-check.ts` -> silent, `FAIL=0 WARN=0`;
- exact atomic-build existence check and scoped `git diff --check` -> exit 0.

Structural limits remain explicit. The checker caps a packet at 256 KiB and a run at 1024 packets,
refuses symlink inputs, and checks required fields, enums, hashes, joins, duplicate IDs, terminal
coverage, denominator integrity, and known privacy patterns. It cannot judge creativity, causality,
surprise importance, true independence, coverage outside the declared denominator, or compatibility
between the two judgment axes. Earlier receipts remain intact as history.

## 2026-08-02 — R2/fresh lexical trigger repair

Classification: description and regression repair. The function map and artifact contracts are unchanged.

- The stage-1 description shrank from 1018 to 959 Unicode characters.
- Japanese research-problem resolution, concretization, and formulation now route to `D`.
- `R` may contribute only a silent cited factual row to that route.
- A generic software incident/postmortem now routes to `implementing-and-debugging`.
- The trigger matrix records both the Japanese positive and the software-incident near miss.

`family-routing.test.ts` is a deterministic lexical description contract. It covers all ten family
descriptions under a 960-character budget and exercises 20 prompt classes. It checks agreed text,
polarity, and order only. It is not a selector, model-inference test, or live-routing proof.

Verification after the repair:

- the family contract passed 21 tests and 50 assertions;
- every directing-research Bun test passed: 81 tests and 254 assertions;
- Codex `quick_validate.py` returned `Skill is valid!`;
- house `skill-check.ts` was silent: `FAIL=0 WARN=0`.

## 2026-08-03 — final adversarial and bearer-verification receipt

An independent Terra checker audit initially returned `FAIL` despite green happy-path tests. It found
an incomplete `UNAUDITABLE` equation; document-wide privacy/causality regex false positives; duplicate
process-lens acceptance; sub-millisecond timestamp inversions; repeated singular `--judgment` flags;
escaped-pipe rejection; a vacuous family-routing contract; and a check/open race. The author repaired
those defects. The final directing-research run, after explicit two-space Biome formatting, passed
81 tests and 254 assertions. Biome checked all ten new TypeScript components without fixes;
`script-check.ts` reported `FAIL=0 WARN=0` across the same ten components. Every production module and
test/helper file remains below 300 lines (largest: 297 lines).

The staged repository gate then exposed one additional BG1 boundary defect: the new Cleye CLI turned an
ordinary unknown flag into domain exit 2, while the house contract requires framework exit 1. The red
corpus fixture reported expected 1 / received 2. Restricting the local `ignoreArgv` guard to
`--__proto__` restored Cleye ownership of ordinary unknowns. The focused Cleye corpus passed 32/32,
and the local adversarial suite passed 12/12 with the corrected exit contract.

A fresh independent Terra trigger probe judged 20/20 prompt routes coherent, but its verdict is only
`SCOPE-LIMITED PASS`: no live Codex or Claude product selector was executed. Accordingly,
`family-routing.test.ts` remains what it names itself—a deterministic lexical description contract,
not live routing proof.

The exact Claude `sonnet` availability probe succeeded. Two detailed verifier calls then timed out
without output; a shorter call returned a zero-token timeout; and a safe-mode retry hung until it was
terminated. None produced a usable audit verdict. Cross-bearer verification is therefore
`UNAVAILABLE` for this reforge and is not counted as independent acceptance. Repository-wide gates,
link deployment, and the final commit are intentionally not claimed by this receipt; they remain the
shipping authority's terminal work.
