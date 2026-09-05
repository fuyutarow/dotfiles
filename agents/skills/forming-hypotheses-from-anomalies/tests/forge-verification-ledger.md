# Forge verification ledger — forming-hypotheses-from-anomalies

> Narrative, provenance findings, and waivers. Nothing here changes an executor's action; the
> rules live in SKILL.md and `references/`. Grade table is in `references/calibration.md` §4
> (SOLE home) — this file records the FORGE's own verification, not the skill's content.

## §0 — What was forged, and from what

Forged 2026-09-05 in one session. Source class: SURVEY / corpus, handled per `forging-skills`
`references/distilling.md` §1 — the corpus was NOT distilled raw. A method-fit synthesis ran first
and produced a signed position; this skill distils that position's claim-ledger rows.

The position: eight units in the SoK corpus, admitted as one bundle
(`sok/abductive_generation_and_selection_as_separate_operations` and seven siblings), 103 evidence
captures, floor-green under that corpus's own checker. Claim ids cited throughout this skill
(`VOC-003`, `CLV-003`, `EFF-013`, `MCH-012`, …) are ledger rows there, each carrying its own
judgement, reversal condition, and limitations.

## §1 — Corpus-side verification the skill inherits

The corpus bundle was itself adversarially verified before this skill was written: 36 load-bearing
captures were re-opened by independent agents at a second route and checked quote-by-quote against
the stated locus. Result **30 CONFIRMED / 4 LOCUS_WRONG / 2 QUOTE_ALTERED**; all six defects were
corrected and the bundle re-checked green.

Two of those defects are worth recording here because they are the reason this skill does not lean
on unverified numbers:

- a quotation had a word INSERTED (`more designs with tyre railings` where the source prints
  `more designs with railings`);
- a reported standard error was altered by one digit (`SE = 0.09` where the source prints `0.08`),
  found only by rendering the page to an image.

Both survived a first reading and a floor check. This is why `references/calibration.md` §4 grades
the r²/Δ figures as abstract-level or study-attached and forbids restating them as general laws.

One source was DROPPED rather than captured: the canonical abductive-logic-programming survey
(1992) is served as a Type-3-encoded PDF whose text extracts as consistent mojibake. One survey arm
had reported its contents; an independent fetch reproduced the mojibake, so the capture was refused
and the failure recorded in the corpus protocol instead. The proposition it would have supported
(abducibles are a supplied set) is carried by two other captures with verified verbatim.

## §2 — Function + existence gate (pipeline step 0)

```text
fact in doubt            --raising-resolution-->      cited factual row
cited row + account      --HERE (A1)-->               CONTRAST
CONTRAST                 --HERE (A2, A3)-->           SUPPLIED + CLOSED ROUTE record
closed route succeeded   --HERE-->                    explanation (terminal, Introduction type: NONE)
closed route failed      --HERE (A4)-->               ABDUCTION LICENSE
LICENSE + frame          --forging-novel-theses-->    CANDIDATE batch / MAPPING-BREAK
```

**Existence battery** (2026-09-05, `repo-search battery`, 6 JA/EN paraphrases over the installed
collection): *abduction hypothesis formation from an anomaly* / *仮説形成 アブダクション 異常から
仮説を立てる* / *introduce a new predicate outside the current vocabulary* / *語彙の外側 新しい述語
を導入する 創造的* / *contrastive fixation P but not Q anomaly framing* / *対比として異常を固定する
なぜPでQでないのか*. Route `battery → ccc`, 6/6 queries with hits, confidence `verified(index)`.
**No owner.** Top-scoring hits were incidental (control conditions in `orchestrating-agents`,
resolution lenses in `raising-resolution`, refactoring regimes) — none owns the transition.

`forging-novel-theses` was the near miss and was read in full: its entry gate REQUIRES a selected
frame plus a provenance-bearing seed or frozen `DONOR SET` (items 1 and 4). It consumes that
precondition; it does not manufacture it. EXTEND was considered and rejected — the two artifacts
have different lifetimes (a LICENSE is retired by its kill condition; a CANDIDATE by a test) and
merging them would put GENESIS and the license decision in one packet, which is the collapse this
skill's A3 exists to prevent.

## §3 — Single-route captures the skill leans on

`VOC-003` / `VOC-004` (the undecidability + uselessness pair) are load-bearing for gate A3 and were
captured through ONE route: the publisher's DOI landing page, after the PDF endpoint served a
bot-challenge. Flagged at capture time, then independently re-verified during the corpus
verification pass — CONFIRMED word-for-word including the proof, with the caveat that the recorded
locus bundled two theorems that live in a different section (corrected). If that paper is ever
shown to have been misreported, gate A3's *rationale* changes, though not its *form*: the cost
asymmetry (`CLV-003`) independently motivates trying the cheap route first.

## §4 — Waivers

**F3 adversarial verification: WAIVED at the solo tier**, 2026-09-05. The trigger set was
desk-checked (16/16) and the floor script was proven to fire on a known-bad packet and pass a
well-formed one, both recorded in §5. No adversarial fleet was run against the SKILL.md itself.
Queue position: next reforge.

**Prose debt**: 0 WARNs at forge exit across SKILL.md and `references/` (§5). No PROSE-DEBT waiver
needed.

## §5 — Floor runs at forge exit

```text
bun scripts/license-check.ts --self-test
  → 11 findings across A1, A2, A3, A4, SHAPE — "SELF-TEST OK"
bun scripts/license-check.ts <well-formed packet>
  → PASS 1 packet(s)
```

Both directions proven, per `forging-skills` `references/architecture.md` §5 ("a gate never seen
red is decoration"). The self-test is embedded in the script so it survives without a fixture file.

## §6 — F4 STANDING: what this admission charged

The collection's listing ceiling was **already red before this skill existed** — measured 59,104
charged against a declared 59,102 (drift since the 2026-09-03 re-measure). This admission absorbs
that 2-char drift and adds its own description.

Reported, not absorbed: `structuring-documents` charges 1,669 chars, above the observed truncation
window (~1,520–1,570), so its tail-positioned language directive may already be silently dropped.
`issuing-technical-memoranda` (1,515) and `driving-antigravity` (1,514) sit at the edge. This was
already flagged in the budget file's 2026-08-30 raise entry and is still unfixed. Trimming those
three would return roughly 200 chars and repair a live defect; it is out of scope for this forge
and is recorded here so it stays visible.

## §6a — Description length, measured

This skill's description measures **1,383 chars**; with the name, it charges **1,416** per turn.
That is 137 under the observed truncation window (~1,520-1,570), so its tail-positioned language
directive reaches the matcher. It is over the platform's 1,024-char API-deployment cap, as are
roughly a third of this collection's descriptions — recorded rather than hidden, since the house
target is ≤1,500 for the Claude Code listing path and that is the path this skill ships on.

The F3 desk-check found a TOKEN ABSENT defect in this description at forge time (a rule keying on
語彙 that the description did not carry). The generalised form of that failure, and why a green
floor does not exclude it, is written up in `tests/triggers.md`.

## §7 — What this skill does not claim

The corpus found no primary source showing that pre-test quality judgements predict real outcomes
(`EFF-Y002`), and no controlled experiment measuring whether teaching a design theory improves
ideation output (`EFF-012`). This skill therefore claims only that its steps are RECORDED rather
than assumed. It does not claim that following it produces better hypotheses, and a future reforge
must not quietly upgrade that claim.
