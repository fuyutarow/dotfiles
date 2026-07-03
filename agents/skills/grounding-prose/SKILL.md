---
name: grounding-prose
description: >-
  Grounds audience-facing prose at the word and sentence level FOR A DECLARED READER: every
  load-bearing TERM resolvable by the named audience or defined in an explicit terminology table
  (用語表) under a hard term budget, every CLAIM in its object, comparison, and condition, every
  EMPHASIS in structure or information — and internal register (ledger IDs, "receipt:", "gated",
  PASS verdicts, house dichotomies) never exported to external readers. Use BEFORE writing and
  when reviewing or rewriting slide titles, headers, abstracts, executive summaries, one-pagers,
  reports, memos, proposals, rebuttals, or an agent's prose review — 外賓向け / 社外向け / 顧客向け
  資料, "LLMっぽい表現", "AI臭い文体", AI slop, jargon drift, ジャーゴン / jargon, 造語, 内輪用語 /
  insider jargon, 定義されていない用語, 修辞, plain language, terminology normalization, PASS/gate
  theater, metaphor packaging. Triggers: grounding, wording audit, prose audit, style rewrite,
  claim calibration, 用語表 / terminology table, tooling-first titles, "核", "本体", "一つに返す",
  "乗る", "主因", "ここが肝心", "PASS", "receipt:", and metaphor jargon such as
  床/鎖/背骨/橋/土台/足場/アンカー. Not for document structure, literature synthesis, domain-content
  generation, or model-facing SKILL.md prose (→ forging-skills). Workflow-native: runs the gate
  script first and fans out read-only flaggers only at corpus scale.
---

# Grounding prose

> **Version** v2607.3.0 (2026-07-03) · **Scope** the word and sentence level of anything a human
> audience reads — slide titles and scripts, abstracts, executive summaries, reports, memos,
> proposals, application statements, rebuttals, and an agent's own review/status prose.
> **Lineage** reforged 2026-07-03 from `auditing-audience-facing-prose` (re-anchoring, Fable 5);
> v2607.3.0 same day adds the reader anchor — AUDIENCE check, C9, term budget, write-time
> protocol (postmortem: `tests/forge-verification-ledger.md`, reforge #2).
> **Build order** ATOMIC — this file ships with its reference and its F3 ledger; verify:
> `test -f references/patterns.md && test -f tests/forge-verification-ledger.md || echo MISSING`.

Three PURPOSE cuts, each a runtime-answerable question — "is the finding about wording, or about
…?": structure, figures, ordering, and slide ownership belong to `designing-presentations`;
turning a recurring fix into a machine check belongs to `operating-the-harness`; model-facing
SKILL.md prose belongs to `forging-skills`. This skill identifies recurring prose failures and,
where they are greppable, hands them to a gate. It does **not** decide the argument, section
order, literature position, or technical content.

## The law

> Every load-bearing expression must be **GROUNDED — FOR THE DECLARED READER**: a **TERM** in a
> taxonomy the named audience already holds, or an explicit local definition within the term
> budget; a **CLAIM** in its object, comparison, and condition; an **EMPHASIS** in structure or
> information. Ungrounded language — dying metaphors, verbal false limbs, pretentious diction,
> meaningless words, undefined coinage, insider register, asserted emphasis, theater, slop — is
> mapped to the reader's standard term, stated as the literal relation, or deleted.
>
> **Reader corollary.** "Shared taxonomy" ALWAYS means shared WITH THE READER, never with the
> authoring project. A document grounded only in the project's internal ledger is ungrounded for
> everyone else. No declared audience ⇒ the prose cannot be graded; declare the reader before
> writing or auditing a single line.
>
> **Enforcement corollary.** What cannot be grounded is mapped, restated literally, or deleted —
> and a document that NEEDS new terms carries an explicit terminology table WITHIN the term
> budget. Implicit coinage is the violation; so is tabled coinage past the budget.

## This skill's own terminology table

The skill practices what it enforces: every house term is ANCHORED to the established taxonomy
(named; URLs once in the Sources block of `references/patterns.md`) or DECLARED novel. This table
is the worked example of the terminology-table mandate (C7).

| house term | status | definition |
|---|---|---|
| four-slot test | derived — cousin of PICO and Minto's governing thought | a claim line must fill object / action / comparison / scope; kept because the flagger contract and the anti-priming epigram hang on the word "slots" |
| bounded evidence / bounded-PASS | novel — declared | `PASS`/`GREEN` is legal only with a same-line checked/unchecked clause naming what was checked and what remains |
| audit-report theater | novel — declared; echoes Schneier's security theater | the audit report reproducing the failure it polices; the Stop hook `detect-audit-theater.sh` is named for it |
| packaging | derived — house umbrella over Orwell's four vices (dying metaphors, verbal false limbs, pretentious diction, meaningless words) | prose about integration, convenience, importance, or imagery instead of the object |
| name-the-slots-never-the-sins | novel — declared | anti-priming rule for spawned auditors: prompts carry slot and class NAMES, never example bad lines from the document under audit |
| repair spiral | novel — declared | two failed correction passes or one newly introduced contradiction ⇒ stop patching locally; rewrite the smallest coherent block |
| grounding | anchored — symbol grounding (Harnad 1990), linguistics; plain-language "define your terms" | the property the LAW demands: every load-bearing expression resolves to a shared referent or an explicit local definition |
| false unity | derived — premature abstraction / lumping | claiming one formulation where inputs, outputs, or phases differ (C5); fix = the four-way split |
| titles-only test | derived — assertion-evidence titles (Alley) | reading only the titles must reconstruct the claim chain |
| claim-theater | novel — declared | inflating with a big word and offsetting with a caveat in the same line |
| pendulum | novel — declared | re-evaluating on mood between drafts; revise only on newly-read evidence, cited |
| stakes-without-claim | novel — declared | raising the stakes of a point whose claim slots are still empty |
| worker-side duty | novel — declared | this skill's contract when spawned as a lens in another skill's fleet: read-only, schema findings, no verdict language |
| audience line | novel — declared | the one-line reader declaration (reader / holds / register) that must exist before any drafting or grading; no audience line ⇒ prose not gradeable |
| term budget | novel — declared | hard cap for external registers: ≤3 define-at-first-use terms per page-equivalent; past it, restructure — never extend the table |
| insider register export | novel — declared (C9) | internally-defined grammar (ledger IDs, receipts, verdict tokens, house dichotomies) shipped to a reader who was never given the definitions |
| register containment | novel — declared | the audit grammar (receipts, bounded-PASS, five-slot findings) is audit-artifact register only; its appearance in a deliverable is C9, not diligence |

## The grounding gate

Run the AUDIENCE check once per document, then three checks on every load-bearing expression —
title, header, claim line, summary sentence, report line. If a line paraphrases to "this feels
neatly organized" or "this matters a lot" rather than "X implies Y under Z", it is ungrounded
packaging — rewrite it.

### AUDIENCE check — declare the reader first (runs before everything)

Write the **audience line** at the top of the audit (and before drafting): **reader** (who
actually reads this — 外賓, reviewer, customer, teammate), **holds** (what vocabulary that reader
can be assumed to hold), **register** (internal | external). Then classify every load-bearing
term into exactly one of:

- **reader-resolvable** — in the declared reader's taxonomy; use the reader's standard form;
- **define-at-first-use** — necessary, not held by the reader; counts against the term budget;
- **internal-only** — project ledger IDs, house dichotomies, verdict tokens, audit grammar;
  for an external register these are C9 violations: translate, move to an appendix, or delete.

**Term budget.** An external-audience document earns at most **three** define-at-first-use terms
per page-equivalent (a slide, a one-pager section, an abstract). Past the budget, the fix is to
restructure around the reader's vocabulary — never to extend the terminology table. The table is
a disclosure device, not a coinage license.

### TERM check

- **Reader-standard term exists?** Use THE standard surface form the declared audience holds, one
  per concept — never alternate synonyms for the same artifact (terminology normalization, under C7).
- **Necessary but not held by the reader?** Define at first use, within the term budget. At
  **three or more** such terms the document MUST carry an explicit terminology table: term |
  definition | nearest standard term and why it fails (format and placement:
  `references/patterns.md` → The terminology table).
- **Neither?** Map to the reader's standard term or delete.

### CLAIM check — the four-slot test

Anchored to Grice's **QUANTITY** (as informative as required — no more) and **QUALITY** (adequate
evidence) maxims, "Logic and Conversation" (1975) — quoted in full in `references/patterns.md`
C4/C5. Before keeping any title, header, or claim line, fill four slots; if a slot is empty, the
line is not ready.

- **object** — what entity is designed, estimated, compared, certified, delivered, or argued for?
- **action** — what relation is claimed about it?
- **comparison** — against what baseline, alternative, or decomposition?
- **scope** — under what condition, phase, audience, or use case?

**Prose-only ⇒ no truth verdict.** When you are given only the text (not the underlying evidence
or data), audit textual over-/under-claiming only; do NOT rule on whether a claim is factually
true — flag any claim whose evidence you have not read as *truth unverified (内容未確認)*, rather
than endorsing or refuting it.

When a line is weak, the fix is almost always one of four substitutions:

| instead of | write |
|---|---|
| convenience / how it feels to use | the input and the output |
| meta-talk about the line | the object itself |
| an effect word ("effective", "wins") | the comparison condition |
| a summary word ("everything", "all-in-one") | the enumeration |

### EMPHASIS check

Anchored to Gopen & Swan's **stress position** and **topic position** ("The Science of Scientific
Writing", 1990 — quoted in full in `references/patterns.md` C4/C6).

Emphasis is structural — it lives in the stress position, the topic position, and information the
reader can check — never asserted. Delete `ここが肝心`-class assertions (C4), or state the factual
reason the point changes a decision, bound, or comparison.

## The violation classes

The old Denylist 1–8 renamed to their anchors, plus C9 (declared novel; provenance in the F3
ledger). Each class is quoted and argued in `references/patterns.md`. Each token list is the
battle-tested house instance set — instances from PAST failures; the class judgment, not the
token grep, is what catches the next project's coinage.

**C1 — Dying metaphors (Orwell).** Structural / body-part metaphors standing in for the literal
term: `床`(floor), `鎖`(chain), `扇`(fan), `背骨`/`spine`, `顔`(face), `橋`(bridge),
`土台`(foundation), `山場`(climax), `持ち上げ`(lift), `挟む`(sandwich), `段差`(step), `アンカー`,
`足場`, `ノブ`, `畳む`, `溶ける`, `囲う` — and `殺す` in the full table.
→ Map each to the standard term (floor→lower bound, chain→inequality/ordering, fan→spread,
face→side/use-case, bridge→connection/shared, foundation→lower bound/basis); do not paraphrase one
metaphor into another. Recurs during revision — check diagram/style/variable names too. When the
term is also a common everyday word, prefer phrase-level review over a blind hard-ban.

**C2 — Verbal false limbs (Orwell).** Processing / meta verbs that pad the sentence and dodge the
relation: `返す`(returning), `閉じる`(closing), `通す`(flowing through), `乗る`, `接続する`, `再走`,
`一度に`.
→ Replace with explicit input/output or causal relation. Use only when the control flow is the content.

**C3 — Zombie nouns & pretentious diction (Sword + Orwell).** Architecture nouns as rhetoric —
abstract entities hiding the missing object: `核`, `中核`, `コア`, `エンジン`, `基盤`, `パイプライン`,
`層`, `本体`, `HUB`, `live`.
→ Name the concrete function, optimization problem, deliverable, or question. If deleting the word
does not change the meaning, delete it.

**C4 — Asserted emphasis (derived: Gopen & Swan stress position + Grice QUANTITY).** Emphasis the
structure has not earned: `ここが肝心`, `今日いちばん大事`, `合否を分ける`, `執念`, `ようやく`,
`肝心`, `核心`, `正直な到達点`, `これは重要な pattern` — plus `この実務の執念から` and `好例` in the
patterns.md variant list.
→ Delete, or state the factual reason the point changes a decision/bound/comparison.

**C5 — Unearned abstraction (Grice QUALITY: "Do not say that for which you lack adequate
evidence").** A claimed unity ("one line / one engine / one spec") asserted before it is earned:
`一つに返す`, `一つの仕様に乗る`, `一本に通す`, `そのまま接続(できる)`.
→ Split into: shared formulation / differing inputs / differing outputs / differing phases. Do not
collapse distinct modes/phases/applications before the audience has seen why they share a formulation.

**C6 — Topic-position violations (Gopen & Swan principle 3).** The tool occupies the topic
position that belongs to the task — tooling-first titles: `製造前設計: PDK・GDSFactory/SAX`,
`QASM に挿す`.
→ State the task or outcome first; the toolchain is a subtitle or caption. Same rule for headings
in proposals and submission documents — and for opening sentences and summaries.

**C7 — Undefined coinage (plain language: avoid-jargon + define-your-terms; digital.gov,
ISO 24495-1).** A newly invented translation for an established term (e.g. fabricating a native
phrase for "most informative").
→ Keep the established term, or give an operational description ("the minimum cost achievable by
individual measurements"). Do not invent vocabulary the field does not use. When new terms are
genuinely needed, the terminology-table mandate applies (TERM check above; format in patterns.md).

**C8 — AI slop & audit-report theater (DECLARED NOVEL).** The theater token family itself is
covered by the established taxonomy (Grice QUALITY/QUANTITY, Orwell's meaningless words); what is
declared novel is the self-auditing-agent failure taxonomy and the statistical machine fingerprint,
for which the pre-2023 taxonomy has no term — anchored to the emerging vocabulary: Kobak et al.
(excess vocabulary), Liang et al. (AI-modified content), "slop" (Merriam-Webster and American
Dialect Society 2025 Word of the Year), and Wikipedia's "Signs of AI writing" list. House instances: `監査完了`, `PASS`,
`GREEN`, `好例`, `核は stable`, `私の起因でない`, `gate を通過` — plus `通過` and `正直な到達点` in
the patterns.md variant list — and the LLM markers: not-just-X-but-Y negative parallelism,
sycophantic openers, hedging boilerplate, em-dash overuse.
→ Replace with a bounded statement: checked file/line or rendered artifact, command if any, result,
and explicit residual risk. A passing denylist scan only says the scan found no listed strings in
its scope; it does not prove clarity, correctness, or consistency.

**C9 — Insider register export (DECLARED NOVEL; cousin of C7 with the definition PRESENT).**
Internal project grammar shipped to an external reader: ledger/provenance IDs (`R2607_016 §7`),
`receipt:`, `gated`, verdict tokens (`PASS`, `certified`, `CELL_DEGENERATE`-style enums), house
dichotomies (`agnostic`/`aware`) and internal cell taxonomies. Every one of these IS defined —
in the project — so C7's "undefined" never fires; the violation is that the DECLARED READER holds
none of it. C7 polices missing definitions; C9 polices definitions the reader was never given.
→ Translate each to the reader's vocabulary; provenance moves to an appendix or a citation in the
reader's format, or is dropped; a house dichotomy becomes the plain contrast it names (e.g.
"standard practice" vs "the audited redesign"). The audit grammar this skill itself mandates
(receipts, bounded-PASS, five-slot findings) is the most dangerous C9 source — see Report discipline.

## Claim calibration

Anchored to Grice **QUANTITY** (as informative as required — no more) and **QUALITY** (adequate
evidence), and to the hedges-and-boosters literature (Hyland). Audit for over- and under-claiming
as carefully as for wording — this is where proposals and rebuttals fail hardest.

- **Prose-only ⇒ no truth verdict** — stated verbatim in the CLAIM check; it governs calibration too.
- **No overclaim.** Match the evidence exactly. Grandiose nouns (platform, hero, flywheel, winner)
  are banned unless literally earned.
- **No underclaim.** Do not bury the real contribution under caveats; a caveat is secondary, set in gray.
- **Limits go inside the claim, stated first** — not as a separate hedge bolted on afterward.
- **No claim-theater.** Avoid inflating with a big word and offsetting it with a caveat. Calibrate
  to the single claim the evidence supports.
- **No pendulum.** Do not swing the evaluation ("weak" → "amazing" → "weak again"). If you revise,
  cite the new evidence you read; do not oscillate on mood.
- **No factual verdict from prose alone.** If a wording audit reveals a possible contradiction,
  cite both source lines. Without that, write "possible contradiction; evidence not inspected" and
  do not repair the technical claim.

## Report discipline

The audit report is itself audience-facing prose — it obeys the same LAW. Do not let it become a
performance about how carefully the audit was run. Every finding fills the unified five-slot
grammar: **target** (file + line + quoted text) / **violation** (the named class C1–C9 or the
empty claim slot) / **cited evidence** (the quoted line or source actually read) /
**replacement** (the grounded rewrite) / **unchecked risk** (what this finding's check cannot
prove). If you cannot cite the text or source you read, mark the finding **unverified** rather
than turning it into a confident factual verdict. Gate output is evidence about one check only;
it is not a verdict that the prose or substance is correct.

**Register containment.** The five-slot grammar, bounded-evidence clauses, receipts, and
PASS-with-bounds are **audit-artifact register** — they address the operator, never the audience.
A bounded-evidence clause, a `receipt:` line, or a verdict enum inside an external-audience
deliverable is a C9 violation, not diligence. When a finding from an audit must reach the
audience, translate it into the reader's vocabulary and citation format.

## Non-negotiables

- Titles and headers must pass the titles-only test (the argument survives reading titles/headers
  alone), unless the document deliberately uses label-titles. Two legitimate conventions — pick one
  per document, apply it uniformly: **assertion-title** (a falsifiable sentence) or **label-title**
  (a short noun phrase; the assertion moves to the first body line just under it). Either way: no
  tool/module names, no product-copy, no metaphor, no writer emphasis in the title.
- Dividers and section separators are separators, not pseudo-claims. If they carry no message, keep them minimal.
- Never substitute writer emphasis for logic. Delete "this is the key point" unless it adds information.
- Avoid convenience verbs for mathematical or system claims. State input, output, and relation directly.
- When claiming benefit, state the comparison class. Replace "effective" / "wins" / "main factor" with the exact contrast.
- Tool names are secondary — use them only after the audience-facing task is named.
- The same discipline holds in slide titles, abstracts, executive summaries, application statements, and rebuttals.
- The report must not excuse itself. Do not write "not my cause", "good example", "core is stable",
  "PASS", "GREEN", or "verified" unless the sentence names exactly what was checked and what
  remains unchecked.
- After two failed correction passes or one newly introduced contradiction, stop patching locally.
  Re-read the target section and rewrite the smallest coherent block; report that prior edits were
  unstable instead of claiming convergence.

## Beyond words: register, notation, disclosure

- **Register consistency.** Pick the venue's register (formal/declarative for a proposal; etc.) and
  hold it. Do not drift into casual asides, keigo, or "honestly, …" interjections.
- **Notation hygiene.** One symbol per object (do not write the same quantity two ways). Spell out
  each acronym in full + gloss on first use, then abbreviate. Do not bare-emit notation a reader
  cannot pause on (especially in a spoken script).
- **Disclosure of names.** Do not print an unconfirmed proper name or a *current/ongoing*
  collaboration you have not verified. A factual **past** affiliation (a CV line) is fine; a claimed
  **present** partnership is a hallucination risk — leave it out until confirmed.

## Write-time protocol — this skill fires at generation, not only at review

A review-only skill enters after the damage; grounding is cheapest before the first draft line.
Before writing ANY audience-facing prose:

1. **Write the audience line** (reader / holds / register) — it goes at the top of the working
   notes, and the reader/holds decision drives every later choice.
2. **Set the term budget** and list the define-at-first-use candidates BEFORE drafting; if the
   plan already needs more than the budget, restructure the plan, not the table.
3. **Draft** in the reader's vocabulary; internal ledger IDs and verdict tokens never enter the
   draft — they stay in the working notes.
4. **Run the gate** on the draft (`--external` when register = external) — a green gate is step
   4 of 5, not "done".
5. **Titles-only test + read the rendered page** with the declared reader's eyes; then the C1–C9
   judgment pass. The denylist is instance-overfit BY DESIGN (past failures); novel coinage of
   the same classes is caught only by this pass — never skip it because the grep was green.

## Make the audit a gate

Word-level discipline regresses under deadline — willpower is not a harness. Where the rendered
audience-facing text is greppable, convert each class token list into a machine check (see
`operating-the-harness`):

- A regex over the **rendered** audience-facing files only — strip comments; exclude design docs,
  denylist ledgers, and orphan draft files (they legitimately contain the banned words as the
  things-being-banned).
- **Bare common verbs need guards.** `返す` matches `繰り返す`; `通す` matches `見通し`. Add lookbehinds or match the specific collocation, not the lone verb.
- **Wire it into the command you actually run.** A check that exists but is not in the aggregate task/CI you invoke is not enforced.
- **Prove it fires.** Inject a known-bad string, watch it FAIL, then revert. Do not trust "I added a rule."
- **The gate is necessary, not sufficient.** Overflow, mid-word title wraps, crushed figures, and layout breakage never show in a grep — render the document and read **every page** before saying "verified".
- **Close recurring feedback with three artifacts when appropriate:** (1) fix the instance, (2) the
  gate, (3) the skill rule. For one-off cases, a local rewrite may be enough.

House wiring: the Stop hook `detect-audit-theater.sh` (C8 on the agent's own turn text) and the
portable repo lint `scripts/check-prose-grounding.sh` (mise task `lint:prose-grounding`) over
persisted prose files — pass `--external` when the audience line says external, which adds the
C9 pattern set (ledger IDs, `receipt:`, `gated`, verdict enums). Scripts own the greppable tier — never spawn an agent to run this regex.
Agents enter only at corpus scale (a multi-file package, or this skill running as the prose lens
in another skill's audit fleet), and an agent return claiming `PASS` / `監査完了` / `GREEN` is
bounced under C8. The stage map and the flagger contract live in `references/patterns.md`
("Running the audit on a harness").

## When to open the reference file

Open `references/patterns.md` for: the fast lint, the full class families (C1–C9) and mapping
tables, the terminology-table format (C7's arguing home) and terminology normalization, the
rewrite ledger, the claim-calibration and audit-report failure ledgers, deck-level and
document-level rules, the portable denylist-as-regex appendix, the harness execution map
(script-first stage table, flagger contract) for corpus-scale audits, and the Sources block with
the URL for every anchor named above.
