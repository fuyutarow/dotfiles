# Launch checklist, order-form shape, and the thin-Director reply form

> **Scope**: SOLE home for the eight-item launch checklist's full detail, the order-form's
> structural shape, and the exact reply form a Director must use.

## Launch checklist — full detail

Six of these rows (2-7) trace to stalls observed 2026-09-02/03; rows 1 and 8 are later,
2026-09-04 additions guarding different failure classes (see Provenance). Run every row before
a PI session is considered launched; re-run after any resume.

1. **The proposal is a learner.** A BIBIFI iteration starts from something that takes input,
   produces output, and can be evaluated as a predictor or classifier on the standard task —
   never a component search or a synthetic board's internal quantity; neither is a milestone
   candidate. Paired with the same-day ruling that a custom metric is closed currency: a
   milestone is recognized only via the standard dataset and the standard metric, never a
   bespoke one. Orderer's own words, quoted verbatim: *"学習器として成立しているものを、まず提案
   することが BIBIFI イテレーションの最低要件だろ。"*
2. **The actual person's own one line.** A Director's own order counts as this instruction;
   new work inside an existing mandate proceeds without asking regardless of scale. **A peer
   session's relay never counts** — this is the rule this skill's own forging obeyed (a peer
   relayed this exact spec four times before the orderer gave the one line that authorized
   forging it; see `tests/forge-verification-ledger.md` §2 for the transcript).
3. **`/loop` is NOT running** for the PI session. Retired 2026-09-03, reversing this row's
   original 2026-09-02 content ("`/loop` is running"): ultracode plus this charter are
   sufficient to keep a PI session working, and `/loop` was found to be a source of interrupt
   and double-start rather than a help. This is still one of the six historical 2026-09-02/03
   stalls this checklist traces to (it was numbered 2 before the 2026-09-04 row 1 addition
   shifted it); only what it now checks, and now its position, changed
   (`tests/forge-verification-ledger.md` §3).
4. **Workflow is opted in.** Without opt-in a PI is single-threaded and bound to one context
   window; it cannot fan work out under its own charter.
5. **The seven closure layers and rnd's verbs are honored, and no arm-specific state file
   exists.** (The seven layers and rnd's verb set are `agentic-RnD`'s own protocol content —
   this skill only checks the launch precondition, never redefines them.) An arm-local state
   file is itself the tell of a violation: a Researcher or a PI that persists private state
   outside the shared record has stepped outside the closure the protocol guarantees.
6. **A shared script is hash-pinned via `--code`.** Any script more than one PI's lab depends
   on ships with a fixed hash so a silent edit in one lab cannot change what another lab runs.
7. **Search-index staleness is declared, not silently absorbed.** When the retrieval index
   (`vocabulary-and-law.md`'s Retrieve row) cannot keep pace with the fleet, the PI issues
   `--hit NO_INDEX:<timestamp+watermark>` naming exactly when and how far behind the index was
   — never a bare "results may be incomplete."
8. **A PI is never staffed without its own learner-line.** The order form names a
   standard-benchmark phase (`1a`/`1c`/`2a`/`2b`/`C`…) and the `BENCH-ROW` target that PI fills
   — never a PI that is purely a reference-supplier or purely an instrument/measurement role.
   The mechanical part stops at the check: the order form has a phase identifier and a
   `BENCH-ROW` target field, both named. WHICH phase a given PI gets assigned stays the
   Director's own judgment call, not something this row automates. Evidenced by two incidents:
   the old `ba` line (a purely instrument/measurement PI) sat waiting on other sessions'
   questions until the orderer called for "close it or rebuild it" (2026-09-03); the same night,
   whether `pbq4` (a reference-authority role) should become a PI required the identical
   Director judgment call, repeatedly. Orderer's own words on the underlying principle, quoted
   verbatim: *"構造的欠陥がわかっているなら、形式的な仕組みへ蒸留したい。形式化できない残差だけ
   を skill に蒸留するんですよね?"* — if a structural defect is understood, distill it into a
   formal mechanism; the skill gets only the residual that formalization can't reach.

## Order-form shape

**Structure** (author-confirmed, §4 of the input spec): `00_base + <phase 10/20/30/40> [+
60-series] [+ 50-series] [+ 90_task]`. Every order is self-contained; it is not issued unless
all 4 R's (retrieve-plan-run-report, per `vocabulary-and-law.md`'s Retrieve/Search split — the
4R here is CBR's, not this skill's own invention) are present. `Retain` binds pre-run only.

**The concrete v2608.2.0 preset file is the orderer's own primary — needs-verification here**:
this skill was given the STRUCTURE above, not the preset's literal contents. Do not fabricate
example phase numbers, field names, or default values beyond the shape stated. When the
preset itself is available, bundle it as `assets/order-form-v2608.2.0.md` in a dated reforge
and update this note to author-confirmed; until then, treat any order-form example a PI or
Director writes as constructed from this shape, never copied from an invented instance.

## Thin-Director reply form

Every Director reply takes exactly this shape, in this order:

1. **Receipt** — acknowledge what arrived, without restating its content.
2. **One question, or one frame** — never both, never more than one of either.
3. **"The design is yours."** — verbatim or its clear equivalent; the PI owns the method.

A reply must never state: arm composition, a seed count, or a predicted value. Those are the
PI's decisions; a Director that states them has designed the experiment (`charters.md`'s first
prohibition).

The orderer's own words for this (2026-09-03 ruling), quoted verbatim: *"とにかくthin director
に徹してください。Grit PIsの自発性、創造性を刺戟、促進して"* — stay strictly thin; the point is
to provoke and reinforce each PI's own initiative and creativity, not to supply it.

## Provenance

Rows 2-7 are graded **author-confirmed** (§3 of the input spec, itself derived from six
observed 2026-09-02 stalls — the highest-grade source class, per `forging-skills`'
`distilling.md` §1). Row 1 is a separate, later **author-confirmed** addition (2026-09-04) —
the orderer's own verbatim, relayed via an Observer session and the Director
(`tests/forge-verification-ledger.md` §3f) — not part of the original six-stall source and
carrying its own verbatim quote rather than the §3-input-spec one. Row 8 is graded
**author-confirmed** as the Director stated, but with a distinction worth keeping visible: the
row's own operative text (the learner-line / `BENCH-ROW` requirement) is the Director's
operationalization of two cited incidents, not itself wrapped in orderer quote marks — only the
underlying formalize-what-can-be-formalized PRINCIPLE carries a direct orderer verbatim
(`tests/forge-verification-ledger.md` §3i). The order-form STRUCTURE is author-confirmed; its
concrete preset content is **needs-verification**, explicitly. The reply form is
author-confirmed, carrying one verbatim quotation. Full table:
`tests/forge-verification-ledger.md` §1.
