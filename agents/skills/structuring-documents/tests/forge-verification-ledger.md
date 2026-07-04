# Forge verification ledger — structuring-documents (F3 artifact)

Append on reforge; never overwrite. Fire/no-fire desk-check set lives inline in SKILL.md
(Fire / no-fire section) — re-run it after any description edit.

## CURRENT STATE

**Invariants (live):**
- MODE cut vs `linting-prose`: that skill AUDITS (read-only findings, incl. flagging a buried
  conclusion — its L4 "document logic" layer); THIS skill REBUILDS (MECE partition, single-source,
  reference DAG, section reorder) under preservation guards. Runtime question: "findings, or a
  reorganization?" Lint L4 findings whose fix moves sections hand off here.
- The canon split is intentional: Kinoshita ch.2–4 lives in linting-prose; this skill's spine is
  MECE (Minto) + single-source (DRY) + backward-only DAG — skills cut by runtime verb, not by book.
- Preservation-first is the differentiating guard: this skill MUTATES documents, so it carries the
  destructive-overwrite / don't-edit-adequate / preserve-ambitious-claims rules that a read-only
  linter never needs. This is also WHY the two skills stay separate: linting-prose is lent to audit
  fleets as a read-only lens; a mutating skill cannot hold that contract.

**Open defects:** none recorded.

**Retired decisions (do not resurrect):**
- "PURPOSE cut — AXIS / orthogonal axes" framing of the linting-prose boundary — RETRACTED
  2026-07-04 (owner falsified: the document-organization surface is shared; orthogonality was an
  overclaim). Replaced by the MODE cut above.

## 2026-07-04 forge (v2607.1.0)

Source: residue distillation from 3 retired commands (`MECE`, `REORG`, `LINT_PAGER`), per the
agents/commands audit (20-agent coverage + adversarial refute; results in the dotfiles session
ledger). Verification at forge, by an independent read-only agent:
- DROPPED RESIDUE: clean — all operative rules from the 3 sources represented; visual-structuring
  and topic-sentence rules intentionally routed out (designing-presentations / linting-prose).
- TRIGGER SOUNDNESS: clean — natural asks (再構成/散在/MECE/前方参照) match.
- SIBLING CUTS: clean at forge time vs linting-prose / designing-presentations / systematizing-knowledge
  (the linting-prose cut was later corrected — see CURRENT STATE).

## 2026-07-04 v2607.2.0 — the seam correction

Owner challenge ("本当に直交? 木下は両方にまたがる") falsified the AXIS framing. Measured against
the rule inventories: Kinoshita concentrates ~fully in linting-prose; this skill's spine is
Minto/DRY/engineering practice. Fix: MODE cut declared on BOTH sides (this SKILL.md routing row +
linting-prose L4 row/flagger contract), L4 renamed "document logic" in linting-prose so the label
no longer collides with this skill's name.
