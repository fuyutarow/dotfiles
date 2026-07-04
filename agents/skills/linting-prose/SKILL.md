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

> **Version** v2607.4.0 (2026-07-04) · **Scope** the word, sentence, paragraph, and structure of
> anything a human audience reads — slide titles and scripts, abstracts, executive summaries,
> reports, memos, proposals, application statements, rebuttals, READMEs, and an agent's own
> review/status prose.
> **Lineage** reforged 2026-07-04 from `grounding-prose` (Opus 4.8). Adds: machine-floor delegation
> to `textlint`/`Vale` (the hand-maintained L1/L2 denylist was a degraded self-textlint); the
> Kinoshita four-layer frame (word/sentence/paragraph/structure) + two cross-cutting axes (register,
> lifecycle); the HARD/MIX/VIBE tier split (credited: JakobThumm/proofreading); and the
> lifecycle-integrity family (from the QOED 71-finding audit). Postmortem:
> `tests/forge-verification-ledger.md`, reforge #3.
> **Build order** ATOMIC — this file ships with its references and its F3 ledger; verify:
> `for f in patterns machine-floor; do test -f references/$f.md || echo MISSING $f; done; for a in textlintrc textlintrc-research textlintrc-external prh-house prh-external prh-gairaigo; do test -f assets/$a.* || echo MISSING asset $a; done; test -f tests/forge-verification-ledger.md || echo MISSING ledger; test -x scripts/lint-floor.sh || echo MISSING lint-floor; test -f scripts/coinage-flag.py || echo MISSING coinage-flag; test -f scripts/codemix-flag.py || echo MISSING codemix-flag; test ! -d ../grounding-prose || echo STALE-DIR`

## The law

> Audience-facing prose must be **READ CORRECTLY ON ONE PASS BY ITS DECLARED READER**. That
> decomposes by layer: every load-bearing **TERM** grounded in a taxonomy the named reader already
> holds or defined within the term budget (**register**); every **SENTENCE** single-valued and short
> enough to parse (**L2**); every **PARAGRAPH** led by its topic sentence (**L3**); the document's
> **CONCLUSION** reachable without reading to the end (**L4**); and **no retracted claim left
> standing** (**lifecycle**). What a machine can check, a machine checks FIRST; what needs reading
> comprehension, the model judges — and the two are never confused (HARD vs VIBE).
>
> **Reader corollary.** "Shared taxonomy" ALWAYS means shared WITH THE READER, never with the
> authoring project. A document grounded only in the project's internal ledger is ungrounded for
> everyone else. No declared audience ⇒ the prose cannot be graded; declare the reader before
> writing or linting a single line.
>
> **Enforcement corollary.** What cannot be grounded is mapped to the reader's standard term, stated
> as the literal relation, or deleted — and a document that NEEDS new terms carries an explicit
> terminology table WITHIN the budget. Implicit coinage is the violation; so is tabled coinage past
> the budget. What a preset already greps, the preset greps — this skill re-implements no HARD check.

## The tier — what a machine does vs what the model must read

Borrowed from `JakobThumm/proofreading` and made the skill's spine. Every check carries a tier:

- **HARD** — deterministic; a `textlint`/`Vale` rule or an unambiguous prh pattern (ledger IDs,
  verdict enums, `receipt:`, known 表記ゆれ, dearu/desumasu mixing) decides it alone. **Owned by the
  machine floor** (`references/machine-floor.md`); the skill never re-implements one. Runs FIRST.
- **MIX** — a pattern flags a candidate, but a reader confirms it: a dying-metaphor or
  verbal-false-limb token that is also an ordinary word (`橋`/`返す`), a coined label in the house
  denylist, terminology drift against the table. Machine narrows; model decides.
- **VIBE** — reading comprehension; no regex reaches it. This is the skill's differentiated ceiling —
  paragraph logic, structure, register export (house dichotomies), lifecycle. The model reads and judges.

> **The prh-dict split (stated once, load-bearing).** The house prh dict carries BOTH tiers: its
> deterministic entries (IDs, verdict enums, `receipt:`, normalization) are **HARD**; its
> coined-label graveyard and metaphor tokens, which fire on ordinary words and need context, run
> detect-only and are **MIX**. A prh hit is HARD or MIX by WHICH entry matched, never both at once.

> "HARD → a tool already does it, so delegate; VIBE → the model must read, so this is where the
> skill earns its keep." A green machine floor is step 1 of N, never "done."

## This skill's own terminology table

The skill practices what it enforces: every house term is ANCHORED to the established taxonomy
(named; URLs in the Sources block of `references/patterns.md`), DECLARED novel here, or defined
inline at first use in the body.

| house term | status | definition |
|---|---|---|
| HARD / MIX / VIBE tier | derived — JakobThumm/proofreading | a check's rigor class: deterministic-delegable / pattern-plus-judgment / reading-comprehension |
| machine floor | novel — declared | the delegated deterministic tier: `bunx textlint` (JA) + `Vale` (EN) run before any judgment pass; the skill configures, never re-codes it |
| the four layers | anchored — Kinoshita, *理科系の作文技術* (1981) | word (L1) / sentence (L2) / paragraph (L3) / structure (L4) granularity of a document |
| register (axis) | anchored — sociolinguistic register; plain-language "write for your audience" | the for-whom axis crossing all layers: which terms/claims are admissible for the DECLARED reader |
| lifecycle (axis) | novel — declared | document-over-time integrity: a retracted/superseded claim left standing in a table, heading, or self line-number reference; undated "本セッション再走" numbers |
| insider register export | novel — declared (was C9) | internally-defined grammar (ledger IDs, receipts, verdict tokens, house dichotomies) shipped to a reader who was never given the definitions |
| audience line | novel — declared | the one-line reader declaration (reader / holds / register) that must exist before any drafting or grading |
| term budget | novel — declared | ≤3 define-at-first-use terms per page-equivalent for external registers; past it, restructure — never extend the table |
| スリカエ (fact/opinion swap) | anchored — Kinoshita ch.7 | a sentence written as opinion, then treated as established fact in the next — the canon's stated worst failure |
| bounded-PASS | novel — declared | `PASS`/`GREEN` is legal only with a same-line clause naming what was checked and what remains |
| audit-report theater | novel — declared; echoes Schneier's security theater | the lint report reproducing the failure it polices; the Stop hook `detect-audit-theater.sh` is named for it |
| packaging | derived — house umbrella over Orwell's four vices | prose about integration/convenience/importance/imagery instead of the object |
| repair spiral | novel — declared | two failed correction passes or one new contradiction ⇒ stop patching; rewrite the smallest coherent block |
| worker-side duty | novel — declared | this skill's contract when spawned as a lens in another skill's fleet: read-only, schema findings, no verdict language |

## The gate — audience, then floor, then judgment

Run in this order on any document; do not start the judgment pass before the floor is green.

### 0. AUDIENCE check — declare the reader first (before everything)

Write the **audience line**: **reader** (外賓, reviewer, customer, teammate — who actually reads
this), **holds** (the vocabulary that reader can be assumed to hold), **register** (internal |
external). Then classify every load-bearing term:

- **reader-resolvable** — in the reader's taxonomy; use the reader's standard surface form;
- **define-at-first-use** — necessary, not held; counts against the term budget;
- **internal-only** — ledger IDs, house dichotomies, verdict tokens, audit grammar; for an external
  register these are register-export violations: translate, move to an appendix, or delete.

**Term budget.** An external-audience page-equivalent (a slide, a one-pager section, an abstract)
earns at most **three** define-at-first-use terms. Past it, restructure around the reader's
vocabulary — never extend the table. The table is a disclosure device, not a coinage license.

### 1. Machine floor (HARD) — `bunx textlint` / `Vale`, run as a script

The deterministic tier is DELEGATED, not re-implemented. For Japanese prose run
`bunx textlint` with the house config (`assets/textlintrc.json`: `preset-ja-technical-writing` +
`@textlint-ja/preset-ai-writing` + `prh` house dict); for English, `Vale` with the Google/Microsoft
packages + `proselint`. Setup, the per-rule coverage map, MCP wiring, and the anti-auto-substitution
rule live in `references/machine-floor.md`. **The skill never writes a regex a preset already
ships.** A green floor proves only that the listed patterns are absent in scope — not clarity,
logic, register, or lifecycle.

### 2. Judgment ceiling (VIBE) — the six families the floor cannot reach

The floor is instance-overfit BY DESIGN (past failures). The families below are where the skill's
value lives; each is argued in `references/patterns.md`. If a line paraphrases to "this feels neatly
organized" or "this matters a lot" rather than "X implies Y under Z", it is ungrounded packaging.

## The six families (layer · dominant tier)

Each family names its layer and where the check lands. The old C1–C9 classes are preserved as
INSTANCES within these families (mapping and full token lists: `references/patterns.md`).

**F-L1 — word (HARD→textlint · VIBE for novel coinage).** Dying metaphors (`床`→lower bound,
`鎖`→ordering, `橋`→shared part), zombie nouns / architecture-as-rhetoric (`核`, `本体`, `基盤`,
`エンジン` — name the concrete object or delete), AI hype vocab, undefined coinage. The token grep is
`textlint` + the house prh dict; **novel compound coinage** (機械床-class) has a MIX pre-filter —
`scripts/coinage-flag.py` (SudachiPy dict-membership, high-recall/low-precision) surfaces candidates,
the model confirms; the CLASS JUDGMENT stays VIBE. Full options + what was dis/proven:
`references/machine-floor.md` (the 機械床 gap).

**F-L2 — sentence (HARD→textlint · MIX/VIBE for meaning).** Sentence length, 読点 ≤3, double
negatives, doubled 助詞, weak phrases — all HARD via `preset-ja-technical-writing`. Verbal false
limbs (`返す`/`閉じる`/`乗る` — state input→output instead) are **MIX**: the prh dict flags the token,
the model confirms whether the control flow IS the content. What no preset can do (no off-the-shelf
OSS exists): 一文一義, 主述近接/距離, 修飾語順 (本多), 逆茂木型 — dependency-parse-hard, handled VIBE.

**F-L3 — paragraph (VIBE).** Topic-sentence presence and lead position; 1-paragraph-1-topic; known→
unknown flow (Kinoshita ch.4, 倉島's 7 rules). No linter reaches this. Reading only the topic
sentences must reconstruct the argument.

**F-L4 — structure (VIBE).** Conclusion-first / BLUF (the conclusion reachable without reading to the
end); **fact/opinion separation** — the スリカエ, Kinoshita's stated most-important rule; 目標規定文
present; tool-first titles (the toolchain in the topic position that belongs to the task —
`製造前設計: PDK・GDSFactory` → task first, tools in the subtitle). Titles must pass the titles-only
test.

**F-register — for-whom (VIBE · MIX where a denylist exists).** **Insider register export**: internal
project grammar shipped to an external reader — ledger IDs (`R2607_016 §7`), `receipt:`, `gated`,
verdict enums (`IMPLEMENTATION_GATED`, `CELL_DEGENERATE`), house dichotomies (`agnostic`/`aware`).
Every one IS defined — in the project — so "undefined" never fires; the violation is that the
DECLARED READER holds none of it. The greppable subset (ID patterns, verdict enums, `receipt:`) is
HARD via the external prh dict (`assets/textlintrc-external.json`); house dichotomies are VIBE. Also
here: dearu/desumasu mixing (HARD), 心情的要素 in a technical register (VIBE), non-specialist
vocabulary (3MT). **Prose-language discipline (ANY register, incl. internal):** an English token in
Japanese prose is admissible only as (1) a standard domain term or (2) a pinned house token used as
an identifier; a **verb calque** (`cite する` — prh role 3, HARD) or a noun with an exact JP
equivalent (`deliverable`→成果物) is a violation even when the reader holds the term — internal
register waives the COMPREHENSION check, never the HYGIENE check (QOED R2607_021: 15 latin/100字
passed a green floor). Density pre-filter: `scripts/codemix-flag.py` (MIX).

**F-lifecycle — over-time (VIBE).** A retracted or superseded claim left standing in a summary table,
a section heading, or a self line-number cross-reference while the body retracts it (QOED
`R2606_081`: body retracts "唯一ギャップ", the table keeps it); tag-system drift across files;
undated "本セッション再走" numbers. No canon and no tool covers this — declared novel. Fix: the
retraction must reach every surface (table cell, heading, abstract), or the claim is not retracted.

## Claim calibration

Anchored to Grice **QUANTITY** (as informative as required — no more) and **QUALITY** (adequate
evidence), and the hedges-and-boosters literature (Hyland). Audit for over- and under-claiming as
carefully as for wording.

- **Prose-only ⇒ no truth verdict.** Given only text (not the evidence), flag any claim whose
  evidence you have not read as *truth unverified (内容未確認)* — do not endorse or refute it.
- **No overclaim.** Match the evidence exactly. Grandiose nouns (platform, hero, flywheel, winner)
  are banned unless literally earned.
- **No underclaim.** Do not bury the real contribution under caveats; a caveat is secondary, in gray.
- **Limits go inside the claim, stated first** — not as a separate hedge bolted on afterward.
- **No claim-theater** (inflate with a big word, offset with a caveat in the same line). **No
  pendulum** (re-evaluating on mood; revise only on newly-read evidence, cited).

## Report discipline

The lint report is itself audience-facing prose — it obeys the same law. Every finding fills the
five-slot grammar: **target** (file + line + quoted text) / **family + tier** (F-L1…F-lifecycle;
HARD/MIX/VIBE) / **cited evidence** (the quoted line or the `textlint` rule that fired) /
**replacement** (the grounded rewrite) / **unchecked risk** (what this finding cannot prove). If you
cannot cite the text or the rule, mark the finding **unverified**. A `textlint` result is evidence
about one check only; it is not a verdict that the prose is correct.

**Register containment.** The five-slot grammar, bounded-PASS, receipts, and verdict tokens are
**audit-artifact register** — they address the operator, never the audience. Any of them inside an
external-audience deliverable is an insider-register-export violation (F-register), not diligence.

## Non-negotiables

- Titles/headers pass the titles-only test (argument survives reading titles alone), unless the
  document deliberately uses label-titles. No tool/module names, product-copy, metaphor, or writer
  emphasis in the title.
- Never substitute writer emphasis for logic. Delete "this is the key point" (`ここが肝心`) unless it
  adds information — state the decision, bound, or comparison it changes.
- Avoid convenience verbs for mathematical or system claims. State input, output, and relation.
- When claiming benefit, state the comparison class. Replace "effective" / "wins" / "main factor"
  with the exact contrast.
- The report must not excuse itself. No "not my cause", "core is stable", "PASS", "GREEN", or
  "verified" unless the sentence names exactly what was checked and what remains unchecked.
- After two failed correction passes or one new contradiction, stop patching locally. Re-read the
  target section and rewrite the smallest coherent block (repair spiral).

## Beyond words: register, notation, disclosure

- **Register consistency.** Hold the venue's register (formal/declarative for a proposal). No casual
  asides, keigo drift, or "honestly, …" — dearu/desumasu mixing is HARD-checked by textlint.
- **Notation hygiene.** One symbol per object. Spell out each acronym + gloss on first use, then
  abbreviate. Do not bare-emit notation a reader cannot pause on (especially in a spoken script).
- **Disclosure of names.** Do not print an unconfirmed proper name or a *current/ongoing*
  collaboration you have not verified. A factual PAST affiliation is fine; a claimed PRESENT
  partnership is a hallucination risk — leave it out until confirmed.

## Write-time protocol — this skill fires at generation, not only at review

Grounding is cheapest before the first draft line. Before writing ANY audience-facing prose:

1. **Write the audience line** (reader / holds / register) — it drives every later choice.
2. **Set the term budget** and list define-at-first-use candidates BEFORE drafting; if the plan needs
   more than the budget, restructure the plan, not the table.
3. **Draft** in the reader's vocabulary; internal ledger IDs and verdict tokens never enter the
   draft — they stay in the working notes.
4. **Run the machine floor** via `scripts/lint-floor.sh` — pick the config by register:
   `textlintrc.json` (default, body = **ですます**), `LINT_PROSE_CONFIG=assets/textlintrc-research.json`
   for **である体** internal/research docs (base FALSE-POSITIVES every である sentence — see
   machine-floor.md), or `assets/textlintrc-external.json` when register = external (adds the C9
   register set). A green floor is step 4 of 5, not "done".
5. **Titles-only test + read the rendered page** with the reader's eyes; then the VIBE pass over the
   six families. The floor is instance-overfit by design; novel coinage of the same classes is caught
   only here — never skip it because textlint was green.

## Make the lint a gate

Word-level discipline regresses under deadline — willpower is not a harness. The machine floor is a
real gate, wired via `operating-the-harness`:

- **`bunx textlint` via `scripts/lint-floor.sh`** (refuses `--fix`; prh is detect-only) over the
  rendered audience-facing files (strip comments; exclude design docs,
  denylist ledgers, orphan drafts — they legitimately contain the banned words). This SUPERSEDES the
  retired hand-maintained `check-prose-grounding.sh`; the house-specific patterns textlint's presets
  do not carry (ledger IDs, verdict enums, coined labels) live in `assets/prh-external.yml`, loaded
  by `textlintrc-external.json`.
- **Wire it into the command you actually run** (the mise task / CI). A check not in the aggregate is
  not enforced.
- **Prove it fires.** Inject a known-bad string, watch it FAIL, revert. The external prh set
  (`textlintrc-external.json`) is proven to fire on QOED `RESEARCH_STATE.md` (verdict enums, ledger
  IDs) while the base config leaves them alone; see the ledger.
- **The gate is necessary, not sufficient.** Overflow, mid-word title wraps, crushed figures, and
  every VIBE family never show in a lint — render the document and read it before saying "verified".

House wiring: the Stop hook `detect-audit-theater.sh` (audit-report theater on the agent's own turn
text) STAYS; the document floor is now `bunx textlint`. Scripts own the greppable tier — never spawn
an agent to run the lint.

## Execution model — floor is a script, judgment is SOLO, flaggers fan out at scale

A single document/deck/abstract is a SOLO job: run `bunx textlint`, then read the rendered text
yourself. Spawn per-file **read-only flaggers** only for a multi-file package, a 50+ slide deck, or
when this skill is the prose lens inside another skill's audit fleet. **Never spawn an agent to run
the lint** — it is a deterministic script. Claim calibration, the coherent-block rewrite, and report
signing stay SOLO (one voice over the whole text). Worker-side duty when spawned as a lens: read-only,
five-slot findings as data, no verdict language, an explicit residual-risk clause. No harness → the
same order serially: floor → per-section flagging → terminology sweep → calibration → rewrite →
bounded report. Full stage map + flagger contract: `references/patterns.md`.

## When to open the reference files

| File | Covers | Read when |
|---|---|---|
| `references/patterns.md` | the six families in full (C1–C9 mapped in as instances, token lists, mapping tables), the terminology-table format + normalization, the rewrite ledger, claim-calibration and audit-report failure ledgers, deck/document rules, the harness execution map + flagger contract, the Sources block | any VIBE judgment pass; a family judgment; deciding what survives; corpus-scale audits |
| `references/machine-floor.md` | the delegated deterministic tier: `bunx textlint` + presets + `prh` (JA), `Vale` + packages + `proselint` (EN), the per-preset coverage-by-layer map (what NOT to re-check), MCP wiring, LaTeX caveat, the anti-auto-substitution rule, the FP-advisory boundary | configuring or running the machine floor; deciding whether a check is already off-the-shelf |
