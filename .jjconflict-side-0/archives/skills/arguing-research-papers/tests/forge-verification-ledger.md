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
- **Floor script** `scripts/claim-check.ts` checks the CLAIM SPEC structurally (the G0 in-hand line +
  G1/G2/G3 slots filled — scope REQUIRED, wholly-bracket placeholders FAIL everywhere except the G2
  anchor — positioning not bare/template, deny-list scan; slot capture is bullet-label-anchored).
  It is NOT semantic — meaning is judged by the model against the gates. `[VERIFY]`/`[VALUE]`
  placeholders are the honest alternative to fabrication and PASS the anchor check ONLY.

**Open defects / deferred:**
- **Reciprocal-cut debt (partially LANDED, owner-named).** `linting-prose`'s reciprocal cut **LANDED
  2026-07-11** (S3, external-review-#2 fix cycle — see that section below): its "claim calibration"
  trigger narrowed to **"sentence-level claim calibration"**; its Not-for gained **"argument/
  contribution-level claim=evidence & 新規性 positioning (→ arguing-research-papers)"**; description
  trimmed ≈1674→≈1473 chars (re-verified ≤1500 in the same cycle's cross-verification sweep).
  `structuring-documents` (≈1649 chars, still **over the ~1500 listing budget**) remains **DEFERRED**
  to its own trim-reforge (owner = structuring-documents); the cut from that side is still
  one-directional, and the F7 decisive-signal note in `tests/triggers.md` still covers the sharpest
  race from this side. Also still open for a future SD/FNT reforge: SD's un-earned-claim line should
  also route argument-level overclaim here; `forging-novel-theses` should name arguing for
  finished-paper novelty positioning (it currently only routes the reverse). Re-run the trigger
  desk-check after any sibling reforge.

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
  `claim-check.ts` floor (mirrors `forging-novel-theses`' Phase-4 template + `gate-check.ts`), so the
  skill is a decision-procedure-with-a-checkable-artifact, not a tip list.
- Book/oral sources predominate → lineage line, not a version-pinned durability contract; the only
  dated snapshot is the venue-fact block (`genre-playbooks.md` §1), re-verified per reforge.

**Verification at forge.** Floor: build-order one-liner + `forging-skills/scripts/skill-check.ts`
(exit 0) + `claim-check.ts` fire-test (unfilled spec → 5 FAILs; bare-positioning spec → G3 FAIL +
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

## 2026-07-08 external review — adjudication (8 findings: 6 accept · 1 partial · 1 mostly-rebut)

Every finding verified against source (cited line reproduced, or the bug re-run) BEFORE ruling.

| Finding | Verdict | Resolution |
|---|---|---|
| **P1** `claim-check.ts` treats `[VERIFY]`/`[CITATION NEEDED]` as filled → placeholder-only spec passed `FAIL=0` | **ACCEPT** (reproduced) | `ph()` = `is_placeholder` OR wholly-`[…]`-bracket, applied to G1 / instability / scope / G3-prior / G3-objection; the **G2 anchor stays exempt** (its bracket IS the sanctioned anti-fabrication deferral, SKILL.md §G2). Re-tested: placeholder-only → `FAIL=5`, well-formed → PASS, `[VERIFY]` anchor → PASS |
| **P1** scope-missing = WARN, but §G2 lists scope as a **required** artifact | **ACCEPT** | G2 scope missing/placeholder → **FAIL** (was WARN). Re-tested: no-scope spec → `FAIL=1` |
| **P0** reviewer-defense §3 "Fatal-if-true → don't raise unprompted" reads as hide-and-ship | **ACCEPT** (sharpest) | Reworded: resolve OR **rescope** the claim; an unresolved-and-real fatal-if-true = **not ready / submission block**, never "ship silently" — bound to the record-completeness LAW. Kept the legitimate "don't volunteer a speculative, non-certain kill-shot" kernel |
| **P1** no G0 materials audit (model can argue from a user summary) | **ACCEPT** | Added **G0 — materials audit** as build-step 0 + a CLAIM SPEC section: list results / priors / venue in hand; each missing item → placeholder, never a confident assertion. Scoped OUT of the fast-path |
| **P1** citation check = existence only, not support / quality / currency | **ACCEPT** | calibration.md §6: added the **citation-QUALITY check** (support · currency / not-retracted · load-bearing strength), distinct from the fabrication gate; the fact-check lens must return a support verdict, not just "it exists" |
| **P2** resource / dataset / benchmark paper coverage thin | **ACCEPT** | frameworks.md §5: added the **resource / artifact paper** profile (value = reusable object; slots = coverage · access · license · maintenance · reuse evidence) |
| **P2** ledger claims "7-lens fleet / 35 findings" but detail not in-dir | **PARTIAL** | The ledger DID carry counts + key-fixes + rejected/deferred (so not "no findings body"), but the **4 diagnostic asks + per-lens findings were NOT persisted** — a real auditability gap. Per this skill's OWN anti-fabrication rule I do **not** reconstruct them post-hoc (an invented verification record is exactly what the skill forbids). **Forward rule adopted**: persist the diagnostic asks + a per-lens one-line findings summary at forge time |
| **P2** SOLO too strong | **MOSTLY REBUT** | The execution model already fans out red-team + fact-check and reserves SOLO for synthesis; added a one-clause clarifier that calibration **consumes** the fan-out (domain evidence feeds IN; only the final signature is SOLO) — no restructure needed |

**Floor after fixes**: `claim-check.ts` shell-syntax OK + fire-test green (placeholder-only → `FAIL=5`;
no-scope → `FAIL=1`; well-formed incl. anchor-deferral → PASS). `skill-check.ts` + build-order
one-liner re-run clean post-edit.

## 2026-07-08 same-day revise round 2 — G0 floor-wiring + adversarial re-verify

**Solo pre-pass** (drift the round-1 fixes themselves created): G0 wired into the floor
(`claim-check.ts`: `In hand` line missing/placeholder → FAIL; header comment updated to G0–G3 + the
anchor-only bracket exemption); SKILL.md floor-description sentence updated to match (G0 in the
checked list, anchor-exemption named); gates-intro note added — G0 is the **input precondition**, not
a fourth rhetoric gate (the "three gates" framing stays). Floor regression: G0-filled → PASS ·
G0-missing → FAIL · G0-placeholder → FAIL · placeholder-only spec → `FAIL=6`.

**Adversarial re-verify — 3 read-only lenses. Diagnostic asks persisted VERBATIM (the round-1
auditability forward-rule, executed):**
1. *exploit-reading red-team*: "Read reviewer-defense §3 as a motivated author who WANTS to ship a
   flawed paper — who classifies 'speculative' vs 'actually true'? what when truth is UNDETERMINABLE
   (unverifiable data leakage)? does Certain-to-be-raised interact safely with Fatal-if-true? Then read
   the G0 additions as a lazy executor — can a user summary pass as 'in hand'? is the fast-path a
   loophole for whole-paper drafting?"
2. *one-home/consistency*: "For every element now in >1 home (checked-slot list, placeholder
   discipline, scope required-ness, G0 trigger + fast-path exemption, Fatal-if-true policy,
   existence-vs-quality split) verify the copies agree and ONE home owns; check calibration.md §7 vs
   actual FAIL/WARN behavior; the fast-path paragraph vs G0; template-G0 wording vs the script regex."
3. *floor fuzz*: "Find false PASS/FAIL: mid-line brackets, '[VERIFY] [VERIFY]', full-width
   colons/brackets, a prose 'in hand' stealing the G0 slot via first-match, unfilled template G0 line,
   reordered/duplicate slots, digits+[BASELINE] anchor WARN suppression; exit codes."

**Lens returns → adjudication (25 findings: 1 P0 · 7 P1 · 10 P2 · 7 nit; all accepted except 2
consciously narrowed):**

*Lens 1 (exploit red-team).* Confirmed the round-1 P0 core case closed (known-real fatal +
unlikely-raised has no surviving reading). Found: **A1 (P0)** undeterminable-truth fatal flaw defaulted
to non-disclosure ("cannot check" read as "not actually true" → exemption) → FIXED: exemption now
requires **positive ruling-out**, and undeterminable = not-ready; **A5 (P1)** no fatality test →
FIXED: *fatal-if-true = the objection, if it holds, voids the G2 anchor's licence* (mechanical, keyed
to an existing gate); **A2 (P1)** exemption self-certified → FIXED: every non-volunteer is logged in
the spec's G3 block with the ruling-out evidence; **A3 (P1)** private rescope → FIXED: a rescope must
surface (G2 qualifier + Limitations w/ bias direction); **A4/A6 (P2)** fatal-dominance sentence +
"anchor/scope is never narrow" added. **B1 (P1)** a user summary citing loci satisfied "in hand" →
FIXED: in-hand = artifact readable in THIS session; user description → `[VERIFY — user-reported]`;
**B3 (P1)** whole-vs-part fast-path loophole (piecewise drafting) → FIXED: boundary recast as
**diagnostic vs. production**; **B4/B5 (P2)** `none`-passes + honest-FAIL steering → FIXED (regex +
"a FAIL from an honest placeholder is the CORRECT output" sentence).

*Lens 2 (one-home).* **F3 (P1) — the sharpest**: the round-1 Fatal-if-true fix landed in only 1 of 3
homes; SKILL.md's reconciliations bullet + reconciliation.md §3 (the declared principle-home) still
taught "unanswerable → limitation" with no fatal carve-out — the always-loaded surface licensed the
banned move → FIXED in both homes + the G3 gate row ("a concession never covers a fatal-if-true").
**F4 (P2)** the exec-model lens contract still specified existence-only verification → FIXED (locus +
support/currency/strength). **F1/F2 (P2)** ledger invariant lacked G0; FAIL=5 figure superseded →
FIXED (invariant updated; note: with G0 floor-checked, placeholder-only → **FAIL=6**, supersedes
round-1's FAIL=5). **F6/F7 (P2)** = fuzz F9/F3-class (fixed below). Nits: verdict→assessment wording;
"§5 Two"→"Cross-cutting"; index rows gained citation-quality + resource-profile; worker gate enum →
G0-G3. CLEAN elements recorded: placeholder discipline, scope required-ness, G0/fast-path coherence.

*Lens 3 (floor fuzz, 12 probes, files preserved in session scratchpad).* False PASSes: **F2 (P1)**
compound placeholders `[VERIFY]/[CITATION NEEDED]` evaded the single-bracket regex → FIXED
(strip-and-check: starts with `[`, nothing but bracket segments + separators remains); **F3 (P1)**
`/[Ii]n hand/` substring let "doma**in hand**-crafted" prose steal G0 (missing-G0 spec passed) →
FIXED (all 7 slot regexes bullet-label-anchored); F5 reorder-steal, F7 full-width brackets → FIXED
(anchoring + `［】【］`→ASCII normalization in ph()). False FAILs: **F1 (P1)** case-sensitive
`/evidence anchor/`+`/reviewer objection/` → `[Ee]`/`[Rr]` + label-start alternatives
(`Per claim…anchor`, `Sharpest`); F4 prose-line hijack, F6 duplicate-draft-first → FIXED
(anchoring + overwrite-while-placeholder); F8 multiline value → documented (header: value ON the
label line; SKILL.md spec intro: labels verbatim, one line per slot). **F9 (P2)** fabrication-WARN
fired on every correctly-filled numeric anchor (no locus suppressor despite the message claiming one)
→ FIXED (Table/Fig/Theorem/…/表/図/定理 suppress) — this also made calibration.md §7's "or locus"
description true.

**Post-fix regression (all green):** fuzz p01–p12 all at expected outcomes (3 false PASSes now FAIL,
4 false FAILs now PASS, baselines unchanged, p01 WARN-noise gone); raw template → FAIL rows incl. G0 +
scope; `bun build --no-bundle scripts/claim-check.ts` clean; `skill-check.ts` clean; build-order one-liner empty.

**Consciously narrowed (2):** fuzz-F8 multiline support — documented as a contract instead of parsing
continuations (parser stays one-pass simple); consistency-F7 G0 sub-bullet decomposition — same
resolution (ONE-line contract stated at the spec intro), template unchanged.

## 2026-07-11 external review #2 (Codex) — adjudication & fix cycle

**Codex verdict: do-not-ship** (2 blockers + 2 major + 1 minor, `scripts/claim-check.ts` blockers named
explicitly). Every finding re-verified against the script/source before ruling, per this ledger's own
adjudication discipline.

| # | Severity | Verdict | Resolution |
|---|---|---|---|
| **1** | blocker | **ACCEPT** | `claim-check.ts` false-FAILed the canonical positioning form `Unlike ResNet, which requires labels, we remove them.` — fixed by **S1**; landed with 6 red/green fixtures (incl. gawk `--posix` + mawk portability) |
| **2** | blocker | **ACCEPT** | `claim-check.ts` false-PASSed the bare deny-list dodge `Existing Methods fail; our approach wins.` — fixed by **S1**, same fixture suite, now correctly FAILs (exit 1) |
| **3** | major | **ACCEPT** | zone-split over-rigid — recast by **S2** to the 4-invariant record-zone form (completeness / uncertainty / hypothesis timing / claim's reach — "austerity-of-persuasion, not austerity-of-navigation"), landed in `references/reconciliation.md` |
| **4** | major | **ACCEPT** | linting-prose reciprocal cut, previously deferred debt — **LANDED** by **S3**: `linting-prose`'s "claim calibration" trigger narrowed to "sentence-level claim calibration"; its Not-for gained "argument/contribution-level claim=evidence & 新規性 positioning (→ arguing-research-papers)"; description trimmed ≈1674→≈1473 chars (see CURRENT STATE bullet above) |
| **5** | minor | **ACCEPT** | C-C-C (L3) / 事実と意見 (L4) re-owning linting-prose territory — resolved by **S2**'s LP-execution pointers alongside the zone-split recast: this skill retains argument-level claim/positioning, linting-prose keeps sentence-level execution |

**Codex non-findings (recorded):** the arguing↔directing HARKing seam is clean; source spot-checks
sound (Swales / Toulmin / C-C-C / Boutron / Bordage — and, shared with the directing-research review,
Lakatos / Chamberlin / Platt / Goodhart / Kapoor-Narayanan, all with primary links).

Fix execution was delegated to Sonnet-5 agents (S1–S3, disjoint file ownership: S1 →
`scripts/claim-check.ts`; S2 → `references/reconciliation.md` + `tests/triggers.md` LP-execution
pointers; S3 → `linting-prose/SKILL.md`) under Fable-5 direction, with floor (`claim-check.ts`)
verification green after fixes.

## 2026-07-30 — single-paper ownership seam

Bounded extraction remains with `raising-resolution`; neutral summary stays direct; appraisal of one
paper's argument, method, or validity enters this skill's reviewer red-team.

**PROSE-DEBT waiver (2026-07-30).** `skill-check.ts` exits 0 with 44 long prose sentences, a 15-line
version block, and four long table cells. Queue position: after the shared functional-map freeze,
before the next feature reforge; move history here first, then split prose and narrative cells.

## 2026-08-01 — reciprocal routing pointer / scoped prose-debt waiver

- Artifact: `SKILL.md` MUST-NOT-FIRE and Routing rows route portfolio lifecycle governance to
  `governing-research-documentation` while retaining one-manuscript argument ownership here.
- PROSE-DEBT waiver (pre-existing; not cleared): `skill-check.ts` reported exactly 44 prose sentences
  >120 chars, version header 15 lines >3, and 4 table cells >400 chars. This reciprocal-pointer edit
  does not clear or accept that debt; a dedicated reforge owns retirement of this waiver.

## 2026-08-02 — transfer-warrant boundary

The claim-evidence gate now distinguishes donor lineage from target warrant. An analogy, source-domain
success, or correspondence can motivate a target investigation and may appear as scoped related work;
it cannot anchor a finished target claim. Missing target evidence stays an explicit placeholder and
routes to mapping/break generation or a target-side test. This is a constructed calibration rule, not a
claim that the paper-writing source corpus validates the transfer schema. No claim-check script or test
fixture changed.

## 2026-08-02 — stage-1 genre and claim-first reforge (v2608.0.0) — KEEP

Frozen input: `97ec05e84f77068144ecbaca793cf6b3a9a22a12`.
Decision: `KEEP`; no split, merge, rename, or retirement.

The unique transition remains:
`finished claim or one-paper appraisal → sign/judge CLAIM SPEC argument → defended written claim`.
The stop is an evidence-calibrated claim with G0–G3 artifacts, or an explicit not-ready finding.
Whole research lifecycle, document architecture, and sentence polish remain outside this skill.

### Stage-1 defect and repair

The old description named the broad paper-writing territory but omitted several literal genre aliases.
It also left the claim-first order mainly in the loaded body and trigger notes.
At stage 1, “write my introduction” or “clean up related work” could therefore race generic document
architecture and prose skills without exposing which judgment happens first.

The new 928-character description exposes all six alias groups:

| Alias receipt | Positive fixture | Ordered co-fire receipt |
|---|---|---|
| `abstract` | F3 | C9: argument → architecture → sentence polish |
| `introduction/intro` | F2, F10 | C9: argument → architecture → sentence polish |
| `Limitations` | F8 | C10: concession → architecture → sentence polish |
| `related work/related-work` | F11 | C10: positioning → architecture → sentence polish |
| `rebuttal/review response` | F4, F12 | C11: defensible response → architecture → sentence polish |

Near-miss receipts remain explicit. N1 routes generic document structure to `structuring-documents`.
N2 routes generic prose cleanup to `linting-prose`. N5b2 routes an unfinished research question to
`directing-research`. N4 routes a corpus position to `systematizing-knowledge`.

The finished-claim reopen rule is unchanged. A novelty objection starts here as claim diagnosis.
Only an explicit `directing-research` reopen may return the work to candidate generation (C5b).

### Prose-debt closure

Before: 44 prose sentences over 120 characters, one 15-line version block, and four table cells over
400 characters. After: zero long-sentence WARNs, a two-line version block, and zero long table cells.
No waiver remains. Historical scope and lineage stay in this ledger and `references/sources.md`.

### Verification receipts

- `quick_validate.py agents/skills/arguing-research-papers`: `Skill is valid!`.
- `skill-check.ts agents/skills/arguing-research-papers`: exit 0, `FAIL=0`, `WARN=0`, no output.
- Atomic pointer check from the skill directory: exit 0, no output.
- Description length: 928 Unicode characters.
- Trigger desk-check floor: `PASS aliases=6 F=12 N=18 C=12 claim-first=present`.
- Filled CLAIM SPEC through `claim-check.ts -`: `FAIL=0 WARN=0`.
- Placeholder-only red probe: exit 1, `FAIL=6 WARN=0`; the G2 anchor-only deferral remains allowed.
- Scoped `git diff --check`: exit 0, no output.
- `mise run lint:skills-index`: `✅ skills index complete`.

## 2026-08-02 — claim-qualified alias repair (v2608.0.1)

Fresh stage-1 probe found that bare section aliases could outmatch their purpose: typo/format-only
abstract work and corpus-only related-work synthesis both contained positive alias tokens. Clearing:
aliases now require CLAIM/ARGUMENT work; meaning-fixed typo/format work routes direct/plain, and corpus
synthesis routes to `systematizing-knowledge`. Trigger receipts: N4d, N7, and ordered C6. Claim-first
argument → architecture → wording order and one-paper appraisal remain unchanged.

Receipts: description 932 characters; `quick_validate.py` valid; targeted `skill-check.ts` silent
exit 0 (`FAIL=0 WARN=0`); filled CLAIM SPEC smoke `FAIL=0 WARN=0`; fresh N4d/N7/C6 stage-1 desk-check
3/3 PASS.
