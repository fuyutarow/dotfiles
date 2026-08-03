---
name: forging-skills
description: >-
  Forges and reforges Agent Skills to the house bar: durable operating manuals with LAW, gates,
  grep-able artifacts, MUST-NOT-FIRE, sibling cuts, and adversarial verification. Owns the CRAFT:
  function-first existence, source distillation into tool-changing rules, one-home architecture,
  description/trigger engineering, MECE responsibility cuts, fire/no-fire tests, and the skill's own
  verification. Use for creating, updating, or auditing SKILL.md; skill creator; reforging,
  鍛え直す, 鍛錬, スキル作成, スキル作って, スキルを作って, スキル改善, description tuning, trigger
  collisions, skill evals, 評価セット, or work under agents/skills/. MANDATORY before substantive skill
  revision; generic skill-creator supplies packaging by pointer. Harness listing/firing
  diagnostics belong to operating-the-harness; human-facing prose belongs to linting-prose. Novel thesis
  → forging-novel-theses; corpus synthesis → systematizing-knowledge. Design/cuts stay solo; bounded
  evidence harvest and verification may fan out. English skill; respond in the user's language.
---

# Forging skills — the craft of making operating manuals that outlive their maker

> **Version**: v2607.4.0 (2026-07-30) — craft-signed semantic map; orchestration adds only dispatch.
> History, scope prose, and lineage: `tests/forge-verification-ledger.md`.

Build order (atomic — SKILL.md, 5 references, floor script, ledger ship in ONE commit). Verify:

```bash
for f in distilling architecture triggering execution-models verifying; do test -f references/$f.md || echo MISSING $f; done; test -f scripts/skill-check.ts || echo MISSING skill-check.ts; test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

## Language & stable tokens

This skill is **English**; respond to the user in their language (default Japanese). Keep the
house tokens stable even inside Japanese prose — they are technical identifiers, not
translatable words: **LAW**, **gate** (F1/F2/F3), **fire / no-fire**, **鍛錬 / reforge**,
**solo / fan-out / barrier**, **DECISIVE / CARDINALITY / PURPOSE cut**, **function map**, **one home**,
**scaffold theater**. Every skill you forge defines and pins ITS tokens the same way
(`references/triggering.md`, `references/architecture.md` §6).

## THE LAW

> A skill is a durable operating manual from the model that forged it to every model that
> executes it later — not documentation, not a book summary. And it has TWO READERS: the
> executor model, and the human auditor who must be able to trust it. 形式 is the floor; the
> bar is that EVERY RETAINED LINE CHANGES WHAT THE EXECUTOR DOES — stated so both readers can
> check it. FORM itself is floor-enforced, never line-retained (the dual-reader prose bar,
> `references/architecture.md` §5; carve-out at `references/distilling.md` §2). A skill that cannot be wrong — no
> artifact, no check, no deny-list anywhere — is prose wearing a skill costume. And the
> description is the skill's API: match is lexical and budgeted, so triggering is engineered,
> never assumed.

## The three gates — F1 / F2 / F3

同型: these gates carry the LAW exactly as `systematizing-knowledge`'s ledger discipline,
`acting-on-hypotheses`' R1–R3, and `forging-novel-theses`' G1–G3 carry theirs — each demands a
grep-able artifact; no artifact → gate un-passed, 感触では通れない.

| Gate | Inverts (the error) | ARTIFACT — must exist in the forged skill |
|---|---|---|
| **F1 OPERATIONALITY** | book-summary / scaffold theater — machinery present, every line explains, nothing changes a tool call | The target skill's LAW, gates, or deny-list, each rule naming a grep-able artifact or runnable check; where a rule is greppable, a floor script owns it (`references/distilling.md`; floor split → `references/architecture.md` §5). EXIT: prose-debt WARNs 0, or a dated PROSE-DEBT waiver in the ledger (§5; ≠ F3 solo-tier waiver) |
| **F2 PLACEMENT** | collection collision / description races — two skills match the same ask and neither yields | A **function map** (`input state → verb → artifact → next state`) + one artifact owner + a TYPED cut per overlapping sibling + reciprocal pointers, or an owner-named deferral (`references/architecture.md`, `references/triggering.md`) |
| **F3 SELF-VERIFICATION** | ship-and-hope — the skill that teaches verification ships unverified | Atomic build-order verify command + a fire/no-fire trigger set (≥5 fire / ≥5 near-miss no-fire) + an adversarial-verification findings ledger recording the skill-check run incl. prose-debt counts — waivable ONLY at the solo tier, waiver written (`references/verifying.md`) |

## The pipeline

0. **FUNCTION + EXISTENCE GATE** — decompose the requested behavior as
   `input state → function verb → owned artifact → next state`, then run
   `operating-the-harness`'s decision reflex (CLAUDE.md line / rule / hook / settings / skill).
   If an existing skill owns that transition or artifact, EXTEND it. Forge a sibling only for a
   reusable ownership void with a distinct stop condition.
   The target's craft owner signs this semantic map. `orchestrating-agents` may consume its locus/digest
   and add a dispatch overlay, but never co-owns or rewrites the map.
   → `references/verifying.md` §6 for reforge-vs-create.
1. **SOURCE & DISTILL** — type the source; keep only lines that change what the executor does.
   → `references/distilling.md`
2. **CALIBRATE for the consumer** — the inversion question: is the model's default failure the
   SAME direction as the source's target failure, or the inverse? Prominence follows the answer.
   → `references/distilling.md`
3. **ARCHITECT** — topology, one-home-per-concept, budget pointers. → `references/architecture.md`
4. **TRIGGER SURFACE** — description, naming, the fire/no-fire set. → `references/triggering.md`
5. **EXECUTION MODEL** — treatment tier + the seven components. → `references/execution-models.md`
6. **VERIFY** — adversarial fleet, trigger desk-check, floor scripts. → `references/verifying.md`
7. **SHIP & MAINTAIN** — atomic commit, `mise run link:skills`, staleness triggers.
   → `references/verifying.md`

## Execution model — forge solo, fan out harvest and verification

Harvest and audit FAN OUT: sources, the defaults, sibling skills, official docs — one read-only
agent per surface. DESIGN, the sibling cuts, and the description stay SOLO — an architecture
assembled from shards is not an architecture. Reference drafting fans out only under
editor-signed specs with disjoint file ownership; verification fans out read-only (refuters,
cross-consistency, comparative judge, trigger desk-check); fixes are solo — the editor signs
every line. Scale: a small procedural skill → solo end-to-end, zero agents; a flagship forge or
a reforge-of-N → fleets at harvest and verify. No harness → the same pipeline as serial focused
passes. Written as durable operating guidance from a frontier model (Fable 5, 2026-07). The
forging meta-workflow itself (audit → spec → forge → verify → fix, with contracts and schemas)
is owned by `references/verifying.md` §1; DESIGNING the target skill's workflow-native layer is
`references/execution-models.md`. If a constraint here feels unnecessary, that feeling is the
failure mode — follow the map.

## MUST-NOT-FIRE — and the fire/no-fire set

Over-firing is a first-class liability: ceremony on a typo fix is this skill failing its own F1.
This table doubles as this skill's OWN F3 artifact (≥5 fire / ≥5 near-miss no-fire) — desk-check
it after any description edit. The adversarial half of F3 is this skill's own findings ledger:
`tests/forge-verification-ledger.md` (F3).

FIRES:

| Ask | Why here |
|---|---|
| "create a skill for X" / 「スキル作って」 | creation is the core territory |
| "reforge this skill" / 「鍛え直して」 | reforge = the same pipeline over an existing skill |
| "this SKILL.md is low quality — raise it" | the bar (F1) is owned here |
| 「この SKILL.md、散文が読みにくい/監査して」 | the dual-reader prose bar + floor are owned HERE, not linting-prose (the 2026-07-24 void's proof row) |
| "these two skills collide / both keep triggering" | sibling cuts (F2) are owned here |
| "write a trigger test set for this skill" | the F3 artifact is owned here |
| "tune this skill's description" | trigger-surface engineering is owned here |
| "skill won't trigger though it IS listed" / 「description が発火しない」 | CO-FIRE: `operating-the-harness` diagnostics FIRST (listing/budget); listing healthy → description craft here (`references/triggering.md` §5–§6) |
| 「うちの deploy 手順、毎回説明してる気がする — skill にしといて」 (messy, no headline keyword) | creation from a TACIT source — `references/distilling.md` §1 |
| "評価セットを回してこの skill をベンチマークして" | fires here as router: the plugin's eval loop invoked with the PROXY CAVEAT (`references/verifying.md` §4 / `references/triggering.md` §6) |

MUST NOT fire (with route):

| Ask | Route |
|---|---|
| "use skill X" | just invoke it — no ceremony |
| "skill not LISTED / description truncated in the listing" | mechanics → `operating-the-harness` ALONE |
| "make Claude always do X" | likely a hook/rule → `operating-the-harness` decision reflex |
| a one-line typo fix in a SKILL.md | just fix it — no ceremony |
| "package / install this skill" | model-native routing — no skill needs to fire; if this skill IS fired, delegate to the packaging machinery (`references/verifying.md` §4) and stop |
| a domain question about a skill's SUBJECT | route to that skill, not to its forge |

## Routing — sibling cuts (typed, runtime-answerable)

| Sibling | Cut |
|---|---|
| `operating-the-harness` | PURPOSE cut — contract vs craft. That skill owns the HARNESS CONTRACT of a skill: frontmatter fields, invocation control, disclosure/loading, caps and budgets, triggering diagnostics — everything checkable against the docs. THIS skill owns the CRAFT: whether the skill should exist, how sources distill into rules, one-home placement, sibling cuts, trigger test sets, adversarial proof. Question form: "What will the harness DO with this file?" → theirs; "Is this file WORTH loading, true, and cut correctly against its siblings?" → here. |
| the two defaults — `.system:skill-creator`, `anthropic-skills:skill-creator` | SUPERSEDED as defaults: step lists with no LAW, no gates, no MUST-NOT-FIRE, no verification of the skill itself. Their format/packaging/eval MACHINERY stays live and is invoked by pointer, never rebuilt — trigger-eval + description-optimization loop via `references/triggering.md` §6; validators, grader/comparator/analyzer, viewer, packaging via `references/verifying.md` §4. PURPOSE cut: need their MACHINERY (evals/packaging/scaffold) → invoke by pointer under this pipeline; need GUIDANCE → here. Reciprocal edit impossible (marketplace-managed, read-only) — deferral recorded here. `$PLUGIN` = `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator`; `$CODEX` = `~/.codex/skills/.system/skill-creator` (defined ONCE here; references point). |
| `forging-novel-theses` | PURPOSE cut — name-adjacent, zero overlap: a thesis is a BET about the world; a skill is an OPERATING MANUAL for executors. 鍛錬 of an idea → there; 鍛錬 of a manual → here. |
| `systematizing-knowledge` | Co-fire, sequential never racing: a paper corpus runs as an SoK FIRST (coverage, claim ledger, applicable appraisal, reconciliation), THEN the bounded position distills into a skill here. Never skill-ify a raw corpus. |
| `linting-prose` | PURPOSE cut — human-facing prose deliverables → there. SKILL.md prose is DUAL-READER (executor + auditor): floor (skill-check prose-debt WARNs) and judgment bar owned HERE (`references/architecture.md` §5). Counter-precedent: the 2026-07-24 mutual-deferral void (ledger). Seam: agrees in substance with linting-prose's cut; do not byte-diff. |
| `raising-resolution` | owner-filter chain: its yield list routes skill craft here and harness contract to `operating-the-harness` (reciprocal edit landed 2026-07-02); inspect-before-assert runs as a silent sub-step inside every forge. |
| `practicing-tiger-style` | PURPOSE cut: “Is the request to create, alter, audit, or trigger-test a SKILL.md rather than to apply a risk-calibrated code discipline?” **Yes** → this skill retains F1–F3 craft; **No** → `practicing-tiger-style` owns the risk-calibrated code ledger. |

**Co-fire clause (`operating-the-harness`).** On every skill authoring/edit, CO-FIRE: read that
skill's commands-and-skills reference FIRST for the mechanical contract (frontmatter fields,
description/listing caps, body budget, disclosure stages, `context: fork` constraints — the
numbers live there and are never restated here), THEN apply this skill for what to say and
where. Complementary, never competing — a mechanics-only question ("why isn't my skill
listed?") fires `operating-the-harness` ALONE (one exception: the floor script executably
encodes two thresholds — its seam comments name the owning homes).

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/distilling.md` | Source taxonomy (one engine per source class), the distillation cut — what earns a line, provenance grading / the source-grade table, the calibration inversion (§4), degrees of freedom per rule, anti-patterns | pipeline steps 1–2; any source in hand; deciding what survives distillation |
| `references/architecture.md` | Progressive disclosure as a design act, ONE-HOME-per-concept + SOLE-owner declarations (§2), atomic build order (§3), durability contracts + version headers (§4), floor scripts vs semantic gates (§5), language architecture (§6), anti-patterns | step 3; adding or splitting a file; any fact that could live in two places |
| `references/triggering.md` | The triggering LAW, naming discipline, the house 8-part description anatomy (what+when, Japanese doublets, cuts-in-description, Workflow-native clause, language directive), winning the match vs incumbents (§4), fire/no-fire test sets — gate F3 (§5), the defaults' trigger-eval machinery (§6), anti-patterns | step 4; any description edit; a trigger collision or misfire |
| `references/execution-models.md` | Typing the target's EVIDENCE → its epistemics delta (Step A), the seven components every workflow-native model carries (Step B), treatment tier — where the model lives (Step C), lens conversion + the worker side, anti-patterns | step 5; writing any Workflow-native clause; deciding solo-vs-fleet for a target skill |
| `references/verifying.md` | The two objects to verify (§0), the 鍛錬 meta-workflow audit→spec→forge→verify→fix (§1), the verification fleet — one lens per failure class (§2), forward-testing anti-leak + baseline (§3), live eval machinery pointers (§4), the mechanical floor `scripts/skill-check.ts` (§5), ship & maintain — `mise run link:skills`, staleness triggers, reforge-vs-create (§6), scale calibration (§7) | steps 0, 6–7; before any commit; "is this skill stale?" |
