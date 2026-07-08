# Forge verification ledger — arguing-research-papers (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set lives in `tests/triggers.md`
(re-run after any description edit). This file records invariants, open defects, retired decisions,
and the dated forge log with its adversarial-verification results.

## CURRENT STATE

**Invariants (live):**
- **Territory** — this skill owns the RHETORIC + EPISTEMICS of a WRITTEN research paper: *what to
  claim, calibrated to the evidence, positioned against named prior work, hardened for absent peer
  review.* It does NOT own document IA (`structuring-documents`), sentence wording
  (`linting-prose`), the live talk (`designing-presentations`), corpus synthesis
  (`systematizing-knowledge`), or idea generation (`forging-novel-theses`).
- **The five typed cuts** (SKILL.md Routing): PURPOSE vs SD · SCALE/LOCALITY vs LP · MEDIUM/AUDIENCE
  vs DP · DIRECTION/CARDINALITY vs SoK · PURPOSE vs FNT. All resolve by co-fire, never a race; the
  "write my paper" over-trigger is handled by this skill LEADING and the others sequencing (triggers
  C1).
- **One-home imports** — the generic persuasion-ordering machinery (Minto pyramid, SCQA/BLUF,
  vertical-logic, governing-*sentence*, "so what?", objection-*inventory*) is OWNED by
  `designing-presentations`; this skill points, never restates. Sentence mechanics (topic/stress
  position, cohesion, zombie nouns, Knuth-Larrabee-Roberts typography) → `linting-prose`. Document IA
  (MECE, backward-DAG, single-source, 木下 ch.2-3/4-8) → `structuring-documents`/`linting-prose`.
  木下's *事実と意見* and *主張を絞る* aspects are used HERE (claim/epistemics), distinct from its
  document-design and sentence chapters owned by the siblings.
- **Calibration inversion (load-bearing)** — the model's failure is bidirectional & layer-split:
  over-hedging is more FREQUENT (RLHF mush), overclaiming + FABRICATION is more FATAL. Prominence
  follows: the anti-fabrication HARD gate (LAW) + two-pass per-layer calibration are first-class; the
  corrective is per-layer, never a global "be more/less confident". (`references/sources.md` §inversion.)
- **Evidence archetype = CITATION-RELAY + fabrication quarantine** — agents can fetch/verify real
  results & citations, never invent them; every agent return keys on a checkable locus; agent
  agreement is not evidence, refutation is. The claim + its calibration + the reconciliation are SOLO;
  red-team and fact-check fan out read-only.
- **Floor script** `scripts/claim-check.sh` checks the CLAIM SPEC structurally (G1/G2/G3 slots
  filled, positioning not bare/template, deny-list scan). It is NOT semantic — meaning is judged by
  the model against the gates. `[VERIFY]`/`[VALUE]` placeholders are the honest alternative to
  fabrication and PASS the anchor check.

**Open defects / deferred:**
- **Reciprocal-cut debt (deferred, owner-named).** `linting-prose` (≈1674 chars) and
  `structuring-documents` (≈1649) descriptions are already **over the ~1500 listing budget**, so the
  reciprocal DESCRIPTION cut — ceding *argument/contribution-level* claim calibration back to this
  skill — cannot be landed without worsening their truncation. Deferred to each sibling's own
  trim-reforge (owner = that sibling). The cut is one-directional until then; the F7 decisive-signal
  note in `tests/triggers.md` resolves the sharpest race from this side. Also for a future SD/FNT
  reforge: SD's un-earned-claim line should also route argument-level overclaim here; `forging-novel-
  theses` should name arguing for finished-paper novelty positioning (it currently only routes the
  reverse). Re-run the trigger desk-check after any sibling reforge.

**Retired decisions (do not resurrect):** none yet.

## 2026-07-08 — initial forge (v2607.1.0)

**Source.** A 15-agent adversarially-reconciled SoK survey (2026-07) of the paper-writing canon:
12 source-cluster extraction agents (reader-expectation, narrative-arc, argument-logic,
scholarly-conversation, value-to-readers, researcher-guides, cs-ml-venues, math-theory,
calibration-hedging, abstract-title, reviewer-editor, japanese-tradition) + 3 cross-cutting agents
(completeness critic, model-failure analyst, reconciliation analyst). Full provenance & grades:
`references/sources.md`. Reconciliation (the Aufhebung → the four master splits: zone / axis / scale /
fill) and the architecture were done SOLO.

**Design decisions of record.**
- Named `arguing-research-papers` (gerund-object; the verb "arguing" distinguishes it from
  organizing/wording/presenting; "research-papers" is the user's headline object). Considered
  `making-research-claims` (narrower to the claim) — rejected because the scope genuinely spans the
  paper's whole rhetorical construction (intro funnel, abstract genre, positioning, review-survival),
  which "claims" undersells.
- F1 operationality is carried by the **CLAIM SPEC** artifact + G1/G2/G3 gates + the
  `claim-check.sh` floor (mirrors `forging-novel-theses`' Phase-4 template + `gate-check.sh`), so the
  skill is a decision-procedure-with-a-checkable-artifact, not a tip list.
- Book/oral sources predominate → lineage line, not a version-pinned durability contract; the only
  dated snapshot is the venue-fact block (`genre-playbooks.md` §1), re-verified per reforge.

**Verification at forge.** Floor: build-order one-liner + `forging-skills/scripts/skill-check.sh`
(exit 0) + `claim-check.sh` fire-test (unfilled spec → 5 FAILs; bare-positioning spec → G3 FAIL +
fabrication WARN; well-formed spec → exit 0 — the gate is proven to fire red and pass green).
Adversarial **7-lens fleet** (self-contradiction · one-home/architecture · sibling-cuts read against
the SIBLINGS' actual text · bloat/operationality · trigger desk-check · comparative-judge · source-
fidelity), 0 agent errors: **comparative-judge PASSED** — a model WITH the skill is materially better
than a bare frontier model on all 4 diagnostic asks, with no case where skill < nothing. 35 findings
(9 major / 21 minor / 5 nit), all resolved SOLO except: two nits **rejected** as house-inconsistent
(the immunization sentence and the 同型 / 感触では通れない idiom are house-mandated —
`forging-skills/references/execution-models.md` header formula, and forging-skills' own body uses
both), and the reciprocal-cut debt **deferred** above. Key fixes: doc↔script alignment on the deny-list
(FAIL vs WARN semantics; standalone superlative tokens; scan slot VALUES not template labels, killing a
phantom WARN); ceded the objection-inventory / conclusion-first / Minto-apex machinery to
`designing-presentations` by pointer (kept the paper-medium delta); collapsed four overlapping intro
checklists to CARS + one convergent checklist; quarantined the PNAS word-cap as a venue-fact and
dropped the unsourced ~90-second figure; de-quoted the oral McEnerney attribution; single-homed the
calibration-inversion argument in `sources.md`; split the ML-idiom "significantly" rule; added a
fast-path for one-claim diagnostic asks; trimmed the description 1548 → under 1500.
