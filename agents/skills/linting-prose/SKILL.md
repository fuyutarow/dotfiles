---
name: linting-prose
description: >-
  Lints audience-facing prose against a DECLARED READER — machine floor (bunx textlint / Vale) for
  word/sentence tics, model judgment for the layers a linter cannot reach: paragraph logic (topic
  sentences), document logic (conclusion-first / BLUF, fact/opinion separation), REGISTER export
  (internal ledger IDs, receipts, verdict tokens, 造語/内輪ジャーゴン shipped to a reader who lacks
  them), and LIFECYCLE integrity (retracted claims left standing in tables/headers). Use BEFORE
  writing and when reviewing slide titles, abstracts, reports, proposals, rebuttals, READMEs, or an
  agent's own review prose — 外賓向け / 社外向け / 顧客向け 資料, 文章校正 / 推敲, "LLMっぽい表現" /
  "AI臭い文体" / AI slop, ジャーゴン / jargon / 造語, 用語表 / terminology table, 事実と意見,
  トピックセンテンス, 結論ファースト, 撤回済み / 言い切り. Triggers: grounding, prose lint, wording
  audit, claim calibration, textlint, Vale, prh, tooling-first titles, "核" / "本体" / "一つに返す" /
  "ここが肝心" / "PASS" / "receipt:", metaphor jargon 床/鎖/橋/土台/足場. Machine floor is DELEGATED to
  textlint/Vale.
  Not for deck structure, section order, or slide ownership (→ designing-presentations), wiring the
  lint into hooks/CI (→ operating-the-harness), literature synthesis (→ systematizing-knowledge),
  model-facing SKILL.md prose (→ forging-skills), or document information architecture — MECE /
  restructuring (→ structuring-documents). Workflow-native: machine floor first as a script,
  judgment SOLO, read-only flaggers only at corpus scale. English skill; respond in the user's
  language (default Japanese).
---

# Linting prose

> **Version** v2607.5.1 (2026-07-04) · **Scope** word, sentence, paragraph, and document logic of anything
> a human audience reads — slides, abstracts, reports, proposals, rebuttals, READMEs, an agent's own
> review prose. **Lineage** grounding-prose → reforge #3 (machine-floor delegation, Kinoshita layers,
> HARD/MIX/VIBE) → reforge #4 (hostile audit: one-home compression; history: `tests/forge-verification-ledger.md`).
> **Build order** ATOMIC — verify:
> `for f in patterns machine-floor; do test -f references/$f.md || echo MISSING $f; done; for a in textlintrc textlintrc-research textlintrc-external textlintrc-strict prh-house prh-external prh-codemix; do test -f assets/$a.* || echo MISSING asset $a; done; for t in forge-verification-ledger.md triggers.md; do test -f tests/$t || echo MISSING $t; done; test -x scripts/lint-floor.sh || echo MISSING lint-floor; test -f scripts/coinage-flag.py || echo MISSING coinage-flag; test -f scripts/codemix-flag.py || echo MISSING codemix-flag; test ! -d ../grounding-prose || echo STALE-DIR`

## The law

> Audience-facing prose must be **READ CORRECTLY ON ONE PASS BY ITS DECLARED READER**: every
> load-bearing TERM held by the reader or defined within the term budget; every SENTENCE
> single-valued; every PARAGRAPH led by its topic sentence; the CONCLUSION reachable without reading
> to the end; no retracted claim left standing. What a machine can check, a machine checks FIRST;
> what needs reading comprehension, the model judges; the two are never confused (HARD vs VIBE).
>
> **Reader corollary.** "Shared taxonomy" means shared WITH THE READER, never with the authoring
> project. No declared audience ⇒ the prose cannot be graded — declare the reader before writing or
> linting a single line. **Hygiene corollary:** an internal register waives the COMPREHENSION check,
> never the HYGIENE check (verb calques, exact-equivalent loan nouns are violations in any register).
>
> **Enforcement corollary.** What cannot be grounded is mapped to the reader's standard term, stated
> as the literal relation, or deleted; a document that NEEDS new terms carries a terminology table
> WITHIN the budget. Implicit coinage is the violation. What a preset already greps, the preset greps.

## Tiers — who decides

- **HARD** — a textlint rule or unambiguous prh entry decides alone. Owned by
  `references/machine-floor.md`; never re-implemented here. Runs first.
- **MIX** — a pattern narrows (metaphor tokens, coined labels, coinage/code-mix flaggers), the model
  confirms.
- **VIBE** — reading comprehension; no regex reaches it. The skill's differentiated value.
- prh entries are HARD or MIX **by which entry matched** (normalization/IDs = HARD; graveyard/metaphor
  tokens = MIX, detect-only).

## The gate — audience → floor → judgment

**0 · AUDIENCE.** Write the audience line: **reader / holds / register (internal|external) / prose
language**. Classify each load-bearing term: reader-resolvable · define-at-first-use (≤ **3** per
external page-equivalent — past the budget, restructure, never extend the table) · internal-only
(ledger IDs, verdict tokens, house dichotomies — for an external register: translate, appendix, or
delete). An English token in Japanese prose is admissible only as a standard domain term or a pinned
house identifier — never a verb calque (`citeする`) or an exact-equivalent noun (`deliverable`).

**1 · FLOOR (HARD).** Run `scripts/lint-floor.sh` (refuses `--fix`; prh is detect-only). Pick the
config by register — the choice is load-bearing, the base config false-positives every である
sentence:

| register | config |
|---|---|
| ですます / general (default) | `assets/textlintrc.json` |
| である体 internal/research | `assets/textlintrc-research.json` |
| external deliverable (+C9 insider-register set) | `assets/textlintrc-external.json` |
| strict code-mixing (latin catch-all + allowlist) | `assets/textlintrc-strict.json` (opt-in) |

JA only. **EN floor is UNSHIPPED** — English prose gets the VIBE pass; do not claim a Vale run
(status + packaging path: `references/machine-floor.md`). MIX pre-filters when the smell warrants:
`scripts/coinage-flag.py` (novel kanji compounds), `scripts/codemix-flag.py` (latin density).

**2 · JUDGMENT (VIBE).** A green floor proves only the listed patterns absent — the taxonomy below
is where the value lives. Read the rendered page with the reader's eyes; titles-only test first.

At write time the same gate runs in order 0 → draft in the reader's vocabulary (IDs/verdict tokens
stay in working notes) → 1 → 2.

## The taxonomy — four layers × three axes

Layers (Kinoshita); axes cross all layers. Arguing home, token lists, C1–C9 instances:
`references/patterns.md`.

| check | tier | one-line test |
|---|---|---|
| **L1 word** | HARD/MIX/VIBE | dying metaphors (`床`/`鎖`/`橋`), zombie nouns (`核`/`基盤`), hype vocab, novel coinage |
| **L2 sentence** | HARD + VIBE | length/読点/negation/助詞 = floor; 一文一義・主述近接・修飾語順・逆茂木 = read |
| **L3 paragraph** | VIBE | topic sentence present and leading; 1-paragraph-1-topic; known→unknown flow |
| **L4 document logic** | VIBE | conclusion-first/BLUF; **スリカエ** (fact written as opinion, then used as fact — the canon's worst failure); 目標規定文; tool-first titles. This layer FLAGS; a fix that moves sections is a REBUILD → hand off to `structuring-documents` |
| **A-register** | HARD/VIBE | insider export (IDs, `receipt:`, verdict enums → external prh dict); prose-language hygiene; dearu/desumasu |
| **A-lifecycle** | VIBE | retraction reaches EVERY surface (table cell, heading, abstract); no self line-number refs; no undated volatile numbers |
| **A-calibration** | VIBE | claim = evidence, exactly: no overclaim, no underclaim, limits inside the claim stated first; prose-only ⇒ no truth verdict (内容未確認); revise only on newly-read evidence |

## Report contract

Every finding fills five slots: **target** (file+line+quote) / **check+tier** / **cited evidence** /
**replacement** / **unchecked risk**. No quote or rule ⇒ mark **unverified**. `PASS`/`GREEN`/
"verified" are legal only with a same-line clause naming what was checked and what remains
(**bounded-PASS**). The five-slot grammar and verdict tokens are audit-artifact register — they
address the operator; inside an external deliverable they are themselves an A-register violation.
After two failed correction passes or one new contradiction: stop patching, rewrite the smallest
coherent block (**repair spiral**).

## Execution model

Floor = script, never an agent. Single document = SOLO end-to-end. Read-only five-slot flaggers only
for a multi-file package / 50+ slides / as another skill's prose lens (worker duty: read-only,
findings as data, no verdict language). Calibration, rewrite, and report signing stay SOLO. Stage
map + flagger contract: `references/patterns.md`.

## Fire / no-fire

FIRES: 文章校正・推敲 of a report/abstract/README/proposal · "LLMっぽい/AI臭い" · ルー語/ジャーゴン
complaints · reviewing an agent's own review prose · BEFORE drafting external-facing prose · choosing
the textlint profile for a document. MUST NOT fire: deck/section order (→ designing-presentations) ·
MECE/scatter/restructuring (→ structuring-documents) · SKILL.md prose (→ forging-skills) · hook/CI
wiring (→ operating-the-harness) · paper-corpus synthesis (→ systematizing-knowledge) · a one-line
typo fix. Full desk-check set: `tests/triggers.md` — re-run it after ANY description edit.

## References

| file | sole owner of | open when |
|---|---|---|
| `references/patterns.md` | the layer/axis checks argued in full, C1–C9 instances, token lists, terminology-table format, rewrite/calibration/audit-failure ledgers, deck/document rules, flagger contract, skill glossary, sources | any VIBE pass |
| `references/machine-floor.md` | everything deterministic: presets, profiles, prh dicts, coinage/code-mix tooling incl. what was disproven, EN status (UNSHIPPED), gate wiring (mise/CI/hook), FP-advisory boundary ("green ≠ done" lives THERE), anti-auto-substitution | configuring/running the floor |
| `tests/triggers.md` | the F3 fire/no-fire desk-check set | any description edit |
| `tests/forge-verification-ledger.md` | history: current invariants → open defects → retired decisions → append-only reforge log | reforging; "is this stale?" |
