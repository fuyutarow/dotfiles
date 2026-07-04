# Forge verification ledger — structuring-documents (F3 artifact)

Append on reforge; never overwrite. Fire/no-fire desk-check set lives inline in SKILL.md
(Fire / no-fire section) — re-run it after any description edit.

## CURRENT STATE

**Invariants (live):**
- **FIX-LOCALITY cut** vs `linting-prose` (v3, supersedes the MODE cut): runtime question is *how
  does the fix land?* — rewrite-words-in-place → linting-prose; move-information-across-the-document
  → HERE. LP may FLAG a doc-scale problem (buried conclusion, absent 目標規定文) and hand off here,
  one-directional.
- Canon split, one home per 木下 chapter: Kinoshita **ch.4–8** (paragraph→word, rewrite-in-place) =
  linting-prose; Kinoshita **ch.2–3** (目標規定文・一文書一主題・内容の精選・重点先行 at document
  scale) = HERE, unified with this skill's Minto=MECE / DRY / DAG spine. 重点先行 is the one shared
  concept, split BY SCALE (paragraph topic-sentence → LP; document/section order → here), stated
  identically on both sides.
- Preservation-first is the differentiating guard: this skill MUTATES documents, so it carries the
  destructive-overwrite / don't-edit-adequate / preserve-ambitious-claims rules that a read-only
  linter never needs. This is also WHY the two skills stay separate: linting-prose is lent to audit
  fleets as a read-only lens; a mutating skill cannot hold that contract.

**Open defects:** none recorded.

**Retired decisions (do not resurrect):**
- "PURPOSE cut — AXIS / orthogonal axes" framing of the linting-prose boundary — RETRACTED
  2026-07-04 (owner falsified: the document-organization surface is shared; orthogonality was an
  overclaim). Replaced by the MODE cut.
- "MODE cut (AUDIT vs REBUILD)" + "Kinoshita ch.2–4 lives in linting-prose" — RETIRED 2026-07-05
  (user: the split reads ARBITRARY — a verb cut duplicates 重点先行/目標規定文 across both, and
  木下's document-design ch.2-3 sat in the AUDIT skill). Replaced by the FIX-LOCALITY cut above,
  with 目標規定文・重点先行(doc)・内容の精選 relocated to THIS skill.

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

## 2026-07-05 v2607.3.0 — FIX-LOCALITY re-cut + 木下 Ch2-3 grounding

Trigger: user found the LP↔SD split ARBITRARY. Diagnosis (grounded in an 11-agent survey of
木下『理科系の作文技術』, provenance-verified): the MODE/verb cut duplicated 重点先行 and 目標規定文
across both skills, and 木下's document-design chapters (ch.2-3) sat in the AUDIT skill while this
REBUILD skill used only the Minto canon — the seam read as arbitrary.

Change: re-cut the boundary to **FIX-LOCALITY** (rewrite-in-place vs move-across-document). Relocated
目標規定文 + document-scale 重点先行 from linting-prose L4 → here; added 内容の精選 (木下's grounding
of MECE's inclusion test). LP now only FLAGS document structure and owns 木下 ch.4-8; this skill owns
木下 ch.2-3 unified with Minto/DRY/DAG. Edits landed on: this SKILL.md (LAW + MECE-CE + preservation +
routing row + description) and linting-prose (SKILL.md description/scope/lineage/L4 row + patterns.md
F-L4). Commands /koreo and /umada reduced to thin skill-firing aliases (craft distilled into skills).

Verification: 5-lens adversarial fleet (cut-refuter / one-home / cross-consistency / trigger
desk-check / 木下-fidelity) — results appended on completion.
