---
name: auditing-audience-facing-prose
description: >-
  Audits wording, sentence-level claims, and the agent's own audit reports in audience-facing prose
  so they state the object, comparison, condition, evidence, and output directly instead of sounding
  LLM-ish, managerial, self-justifying, or tooling-first. Use when reviewing or rewriting slide
  titles, headers, abstracts, executive summaries, reports, memos, proposals, rebuttals, technical
  summaries, or an agent's prose review for "LLMっぽい表現", "AI臭い文体", jargon drift, rhetorical fluff,
  claim calibration, coined translations, terminology normalization, PASS/gate theater, or metaphor
  packaging. Triggers: wording audit, prose audit, style rewrite, claim calibration, tooling-first
  titles, "核", "本体", "中核エンジン", "一つに返す", "乗る", "閉じる", "主因", "ここが肝心", "PASS", and metaphor
  jargon such as 床/鎖/背骨/橋/土台/足場/アンカー. Not for document structure, literature synthesis, or
  domain-content generation. Workflow-native: runs the gate script first and fans out read-only
  flaggers only at corpus scale.
---

# Auditing audience-facing prose

Scoped to the **word and sentence level** of anything an audience reads: slide titles and scripts,
but equally abstracts, executive summaries, reports, memos, proposals, application statements,
rebuttals, and an agent's own review/status prose.
Structure, figures, ordering, and slide ownership belong to `designing-presentations`; turning a
recurring fix into a machine check belongs to `operating-the-harness`. This skill identifies
recurring prose failures and, where they are greppable, hands them to a gate. It does **not**
decide the argument, section order, literature position, or technical content.

## The one idea

Audience-facing prose must describe the **object**: what is being chosen, compared, constrained,
proved, or delivered. The failure is prose about packaging, integration, convenience, importance,
or vivid imagery. If a line paraphrases to "this feels neatly organized" or "this matters a lot"
rather than "X implies Y under Z", rewrite it. Packaging language often obscures whether the writer
has named the object and relation clearly enough.

The audit report is also audience-facing prose. Do not let the report become a performance about
how carefully the audit was run. State the target line, the violated rule, the evidence, and the
replacement. Gate output is evidence about one check only; it is not a verdict that the prose or
substance is correct.

## The four-slot test

Before keeping any title, header, or claim line, fill four slots. If a slot is empty, the line is
not ready.

- **object** — what entity is designed, estimated, compared, certified, delivered, or argued for?
- **action** — what relation is claimed about it?
- **comparison** — against what baseline, alternative, or decomposition?
- **scope** — under what condition, phase, audience, or use case?

For an audit report, fill the same discipline as: **target** / **violation** / **evidence** /
**replacement**. If you cannot cite the text or source you read, mark the issue as unverified
rather than turning it into a confident factual verdict.

When a line is weak, the fix is almost always one of four substitutions:

| instead of | write |
|---|---|
| convenience / how it feels to use | the input and the output |
| meta-talk about the line | the object itself |
| an effect word ("effective", "wins") | the comparison condition |
| a summary word ("everything", "all-in-one") | the enumeration |

## Procedure

1. **Recover the proposition.** What is the concrete claim? No subject / comparison / output ⇒ not ready.
2. **Fill the four slots** (above).
3. **Delete meta-language.** Remove "returning", "closing", "flowing through", "connecting as-is",
   "one line / one engine / one spec" — unless the mechanism *is* the claim.
4. **Demote vivid imagery to the literal term** (Denylist 6). Do not paraphrase one metaphor into
   another; map it to the standard word in the field.
5. **Lead with the audience message.** Titles, section headers, opening sentences, and summaries
   start from the task or decision, not tool names, architecture labels, or internal module nouns.
6. **Calibrate the claim** (Claim calibration) — neither inflated nor buried.
7. **Preserve distinctions until earned.** Do not collapse distinct modes / phases / applications
   into one phrase before the audience has seen why they share a formulation.
8. **Normalize terminology, register, and notation** consistently (Beyond words).
9. **Audit the audit report before sending it.** Remove self-congratulation, blame-shifting,
   "good example" narration, and PASS/GREEN claims that exceed the check actually run.

## Non-negotiables

- Titles and headers must pass the titles-only test, unless the document deliberately uses
  label-titles (see Titles: label vs assertion).
- Dividers and section separators are separators, not pseudo-claims. If they carry no message, keep them minimal.
- Never substitute writer emphasis for logic. Delete "this is the key point" unless it adds information.
- Avoid convenience verbs for mathematical or system claims. State input, output, and relation directly.
- When claiming benefit, state the comparison class. Replace "effective" / "wins" / "main factor" with the exact contrast.
- Tool names are secondary — use them only after the audience-facing task is named.
- The same discipline holds in slide titles, abstracts, executive summaries, application statements, and rebuttals.
- The report must not excuse itself. Do not write "not my cause", "good example", "core is stable",
  "PASS", "GREEN", or "verified" unless the sentence names exactly what was checked and what remains
  unchecked.
- After two failed correction passes or one newly introduced contradiction, stop patching locally.
  Re-read the target section and rewrite the smallest coherent block; report that prior edits were
  unstable instead of claiming convergence.

## Denylist categories

### 1. Processing / meta verbs
`返す`, `閉じる`, `通す`, `乗る`, `接続する`, `再走`, `一度に`.
→ Replace with explicit input/output or causal relation. Use only when the control flow is the content.

### 2. Architecture nouns as rhetoric
`核`, `中核`, `コア`, `エンジン`, `基盤`, `パイプライン`, `層`, `本体`, `HUB`, `live`.
→ Name the concrete function, optimization problem, deliverable, or question. If deleting the word does not change the meaning, delete it.

### 3. Writer emphasis
`ここが肝心`, `今日いちばん大事`, `合否を分ける`, `執念`, `ようやく`, `肝心`, `核心`,
`正直な到達点`, `これは重要な pattern`.
→ Delete, or state the factual reason the point changes a decision/bound/comparison.

### 4. False unity
`一つに返す`, `一つの仕様に乗る`, `一本に通す`, `そのまま接続`.
→ Split into: shared formulation / differing inputs / differing outputs / differing phases.

### 5. Tooling-first titles
`製造前設計: PDK・GDSFactory/SAX`, `QASM に挿す`.
→ State the task or outcome first; the toolchain is a subtitle or caption.

### 6. Metaphor & decorative imagery  *(a common LLM-style failure mode)*
Structural / body-part metaphors stand in for the literal term: `床`(floor), `鎖`(chain), `扇`(fan),
`背骨`/`spine`, `顔`(face), `橋`(bridge), `土台`(foundation), `山場`(climax), `持ち上げ`(lift),
`挟む`(sandwich), `段差`(step), `アンカー`, `足場`, `ノブ`, `畳む`, `溶ける`, `囲う`.
→ Map each to the standard term (floor→lower bound, chain→inequality/ordering, fan→spread,
face→side/use-case, bridge→connection/shared, foundation→lower bound/basis). This category often
reappears during revision, so check diagram/style/variable names too. When the term is also a
common everyday word, prefer phrase-level review over a blind hard-ban.

### 7. Coined / fabricated translations
A newly invented translation for an established term (e.g. fabricating a native phrase for "most informative").
→ Keep the established term, or give an operational description ("the minimum cost achievable by individual measurements"). Do not invent vocabulary the field does not use.

### 8. Audit-report theater
`監査完了`, `PASS`, `GREEN`, `好例`, `核は stable`, `私の起因でない`, `gate を通過`.
→ Replace with a bounded statement: checked file/line or rendered artifact, command if any, result,
and explicit residual risk. A passing denylist scan only says the scan found no listed strings in
its scope; it does not prove clarity, correctness, or consistency.

## Claim calibration

Audit for over- and under-claiming as carefully as for wording — this is where proposals and
rebuttals fail hardest.

- **Prose-only ⇒ no truth verdict.** When you are given only the text (not the underlying evidence or
  data), audit textual over-/under-claiming only; do NOT rule on whether a claim is factually true —
  flag any claim whose evidence you have not read as *truth unverified (内容未確認)*, rather than
  endorsing or refuting it.
- **No overclaim.** Match the evidence exactly. Grandiose nouns (platform, hero, flywheel, winner) are banned unless literally earned.
- **No underclaim.** Do not bury the real contribution under caveats; a caveat is secondary, set in gray.
- **Limits go inside the claim, stated first** — not as a separate hedge bolted on afterward.
- **No claim-theater.** Avoid inflating with a big word and offsetting it with a caveat. Calibrate
  to the single claim the evidence supports.
- **No pendulum.** Do not swing the evaluation ("weak" → "amazing" → "weak again"). If you revise, cite the new evidence you read; do not oscillate on mood.
- **No factual verdict from prose alone.** If a wording audit reveals a possible contradiction,
  cite both source lines. Without that, write "possible contradiction; evidence not inspected" and
  do not repair the technical claim.

## Beyond words: register, notation, disclosure

- **Register consistency.** Pick the venue's register (formal/declarative for a proposal; etc.) and
  hold it. Do not drift into casual asides, keigo, or "honestly, …" interjections.
- **Notation hygiene.** One symbol per object (do not write the same quantity two ways). Spell out
  each acronym in full + gloss on first use, then abbreviate. Do not bare-emit notation a reader
  cannot pause on (especially in a spoken script).
- **Disclosure of names.** Do not print an unconfirmed proper name or a *current/ongoing*
  collaboration you have not verified. A factual **past** affiliation (a CV line) is fine; a claimed
  **present** partnership is a hallucination risk — leave it out until confirmed.

## Titles: label vs assertion

Two legitimate conventions; pick one per document and apply it uniformly:

- **assertion-title** — a falsifiable sentence; the document passes the *titles-only test* (the argument survives reading titles/headers alone).
- **label-title** — a short noun phrase; the message moves to the first body line just under it.

A label-title document trades the titles-only test for a cleaner skim — if you choose it, make sure
the first body line carries the assertion. **Either way:** no tool/module names, no product-copy, no
metaphor, no writer emphasis in the title.

## Make the audit a gate

Word-level discipline regresses under deadline — willpower is not a harness. Where the rendered
audience-facing text is greppable, convert each denylist into a machine check (see
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

Scripts own the greppable tier — never spawn an agent to run this regex. Agents enter only at
corpus scale (a multi-file package, or this skill running as the prose lens in another skill's
audit fleet), and an agent return claiming `PASS` / `監査完了` / `GREEN` is bounced under Denylist 8.
The stage map and the flagger contract live in `references/patterns.md` ("Running the audit on a
harness").

## Rewrite patterns

- Packaging → proposition · Bad `既存ツールは一つに返さない` · Better `既存ツールは測定設計・本数設計・誤差限界評価を別々に扱う`
- Passive drift → agency · Bad `測定を変えると分布が変わる` · Better `測定選択は、同じ rho(theta) からどの古典統計モデルを実装するかの選択である`
- Tool-first → task-first · Bad `製造前設計: PDK・GDSFactory/SAX` · Better `製造前設計では、候補設計を較正しやすさ込みで比較する`
- Emphasis → reason · Bad `ここが肝心です` · Better `この制約が測定本数と達成誤差の下限を決める`
- Fake unity → scoped commonality · Bad `pre-fab も post-fab も一つの仕様に乗る` · Better `pre-fab と post-fab は入力重みが異なるが、同じ最適化問題として記述できる`
- Metaphor → literal term · Bad `共通の床` · Better `共通の下界`
- Claim-theater → calibrated · Bad `業界の基盤になる（ただし市場は未成立）` · Better `この空セルを最初に埋める実装である`
- Audit theater → bounded evidence · Bad `banned PASS なので監査完了` · Better `denylist scan found no listed terms in R2607_008; claim consistency was not checked`
- Self-excusing report → owned correction · Bad `R2607_007 は私の起因でない` · Better `R2607_007 still fails the prose gate; fix or report it as outside this change`

## When to open the reference file

Open `references/patterns.md` for: the full pattern families and rewrite ledger, the metaphor and
coined-translation tables, the claim-calibration ledger, deck-level (SCQA / divider / header)
rules, the portable denylist-as-regex appendix, terminology normalization across a deck, memo,
proposal, or script, and the harness execution map (script-first stage table, flagger contract)
for running the audit with subagents at corpus scale.
