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
- **Four gates → the RESEARCH SPEC + `scripts/research-check.sh` floor** (F1 operationality; mirrors
  `forging-novel-theses` gate-check + `arguing-research-papers` claim-check). G2 (formulation) and G3
  (honesty) are the load-bearing gates.
- **Two heuristics FLIP for the agent**: "let go" → also "STAY" (agent over-pivots); "broaden" →
  "de-center" (taste is too central/median). Carry both poles; default to the inverted pole.
- **Sibling cuts** (SKILL.md Routing): the sharpest is **CARDINALITY/ALTITUDE vs `acting-on-hypotheses`**
  (SINGLE bet there; across-bets + standing-honesty-policy here). Plus PURPOSE vs forging-novel-theses
  (generate), VERB vs raising-resolution (inspect), PURPOSE vs implementing-and-debugging (fix), OBJECT vs
  systematizing-knowledge (others' corpus vs own pipeline), PHASE vs arguing-research-papers /
  designing-presentations (write-up/talk).
- **Execution model** — verdicts SOLO; the **generator≠auditor** separation is a STRUCTURALLY-REQUIRED
  fan-out (the generator cannot audit itself), read-only, refutation-prompted, quarantine-on-locus.

**Open defects / deferred:**
- **Reciprocal-cut debt (LIVE, mitigated — owner-named).** `acting-on-hypotheses` (≈1900 chars) is over
  the ~1500 listing budget AND its description enumerates "research direction" as in-scope with no cut
  ceding the ≥2-direction portfolio altitude here — so at stage-1 a portfolio/allocation ask is a live
  race (reclassified from deferred-cosmetic to live per the trigger lens). Mitigated on this side by (1)
  the re-cut to **CARDINALITY-OF-INDEPENDENT-BETS** (ONE hypothesis tree → a-o-h; ≥2 uncorrelated
  directions / standing honesty policy / selection-formulation → here), (2) description tokens
  (portfolio / allocation / ≥2 bets) + the learning-rate homonym disambiguation, (3) F4/F7 reworded to
  the ≥2-directions signal. The genuine reciprocal cut still needs a-o-h's own trim-reforge (owner =
  acting-on-hypotheses; body home `references/boundaries.md`). Re-run the trigger desk-check after any
  sibling reforge.

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

**Verification at forge.** Floor: build-order one-liner + `forging-skills/scripts/skill-check.sh`
(exit 0) + `research-check.sh` fire-test (unfilled spec → 7 FAILs; well-formed spec → exit 0 — proven
red/green). Adversarial **7-lens fleet** (self-contradiction · one-home/architecture · sibling-cuts read
against the SIBLINGS' actual text · bloat/operationality · trigger desk-check · comparative-judge ·
source-fidelity), 0 agent errors: the top-level verdicts confirmed the **core is sound** (THE LAW, the
four gates, G2/G3 mechanisms, the SPEC + floor are genuinely operational; comparative-judge net-positive
on the honesty/steering asks). 40 findings (18 major / 16 minor / 6 nit), **all resolved SOLO**. Key
fixes: (1) resolved the floor↔LAW contradiction — "concentrate on G2/G3" reworded to *scrutiny* not
*floor-enforcement* (all four gates' artifacts remain required); (2) the floor now checks the three
previously-unchecked declared artifacts (fluency / throws-away / negation) and the virtue deny-scan is
anchored to exhortation forms (no longer false-flags a "bold" probe); (3) **re-cut vs
`acting-on-hypotheses` to CARDINALITY-OF-INDEPENDENT-BETS** (ONE hypothesis tree → there, ≥2 uncorrelated
directions → here) — resolving the single-direction ambiguity; (4) single-homed the calibration inversion
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
