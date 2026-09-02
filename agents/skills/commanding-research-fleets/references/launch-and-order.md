# Launch checklist, order-form shape, and the thin-Director reply form

> **Scope**: SOLE home for the six-item launch checklist's full detail, the order-form's
> structural shape, and the exact reply form a Director must use.

## Launch checklist — full detail

All six stalls observed 2026-09-02/03 trace to one of these rows going unchecked. Run every
row before a PI session is considered launched; re-run after any resume.

1. **The actual person's own one line.** A Director's own order counts as this instruction;
   new work inside an existing mandate proceeds without asking regardless of scale. **A peer
   session's relay never counts** — this is the rule this skill's own forging obeyed (a peer
   relayed this exact spec four times before the orderer gave the one line that authorized
   forging it; see `tests/forge-verification-ledger.md` §2 for the transcript).
2. **`/loop` is NOT running** for the PI session. Retired 2026-09-03, reversing this row's
   original 2026-09-02 content ("`/loop` is running"): ultracode plus this charter are
   sufficient to keep a PI session working, and `/loop` was found to be a source of interrupt
   and double-start rather than a help. The row stays numbered 2 — it is still one of the six
   historical stalls this checklist traces to; only what it now checks changed
   (`tests/forge-verification-ledger.md` §3).
3. **Workflow is opted in.** Without opt-in a PI is single-threaded and bound to one context
   window; it cannot fan work out under its own charter.
4. **The seven closure layers and rnd's verbs are honored, and no arm-specific state file
   exists.** (The seven layers and rnd's verb set are `agentic-RnD`'s own protocol content —
   this skill only checks the launch precondition, never redefines them.) An arm-local state
   file is itself the tell of a violation: a Researcher or a PI that persists private state
   outside the shared record has stepped outside the closure the protocol guarantees.
5. **A shared script is hash-pinned via `--code`.** Any script more than one PI's lab depends
   on ships with a fixed hash so a silent edit in one lab cannot change what another lab runs.
6. **Search-index staleness is declared, not silently absorbed.** When the retrieval index
   (`vocabulary-and-law.md`'s Retrieve row) cannot keep pace with the fleet, the PI issues
   `--hit NO_INDEX:<timestamp+watermark>` naming exactly when and how far behind the index was
   — never a bare "results may be incomplete."

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

The checklist is graded **author-confirmed** (§3 of the input spec, itself derived from six
observed 2026-09-02 stalls — the highest-grade source class, per `forging-skills`'
`distilling.md` §1). The order-form STRUCTURE is author-confirmed; its concrete preset content
is **needs-verification**, explicitly. The reply form is author-confirmed, carrying one
verbatim quotation. Full table: `tests/forge-verification-ledger.md` §1.
