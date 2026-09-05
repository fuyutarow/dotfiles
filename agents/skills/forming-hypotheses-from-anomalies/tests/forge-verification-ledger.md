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
closed route SUCCEEDED   --HERE (A4)-->               HYPOTHESIS, Status CLOSED-VOCABULARY (terminal)
closed route EXHAUSTED   --HERE (A4)-->               HYPOTHESIS, Status LICENSED
HYPOTHESIS + frame       --forging-novel-theses-->    CANDIDATE batch / MAPPING-BREAK
```

(Map as re-drawn 2026-09-05; §8 records what the first version of it got wrong.)

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
have different lifetimes (a HYPOTHESIS is retired by its kill condition; a CANDIDATE by a test) and
merging them would put GENESIS and the vocabulary decision in one packet, which is the collapse
this skill's A3 exists to prevent. The 2026-09-05 reorganization kept that cut intact, but the
shipped test is a PRECONDITION test, not a cardinality one: frame selected plus a frozen `DONOR
SET` routes there, and only its absence routes here. Cardinality (one versus a ranked batch)
describes the two artifacts; it is not what decides the route. §8 records how that was found.

## §3 — Single-route captures the skill leans on

`VOC-003` / `VOC-004` (the undecidability + uselessness pair) are load-bearing for gate A3 and were
captured through ONE route: the publisher's DOI landing page, after the PDF endpoint served a
bot-challenge. Flagged at capture time, then independently re-verified during the corpus
verification pass — CONFIRMED word-for-word including the proof, with the caveat that the recorded
locus bundled two theorems that live in a different section (corrected). If that paper is ever
shown to have been misreported, gate A3's *rationale* changes, though not its *form*: the cost
asymmetry (`CLV-003`) independently motivates trying the cheap route first.

## §4 — Waivers

**F3 adversarial verification: WAIVER LIFTED**, 2026-09-05, at the reorganization. The forge had
waived it at the solo tier; a five-lens read-only fleet plus a blind desk-check ran instead, and
found seven BLOCKERs. All are dispositioned in §8. The waiver text is kept here rather than deleted
because what it cost is the point: the defect that started the reorganization was in the shipped
packet contract, and only reading the skill as a stranger surfaced it.

**Prose debt**: 0 WARNs at forge exit across SKILL.md and `references/` (§5). No PROSE-DEBT waiver
needed.

## §5 — Floor runs at forge exit

```text
bun scripts/hypothesis-check.ts --self-test
  → 19 findings across A1, A2, A3, A4, SHAPE from three known-bad packets;
    all 3 good packets clean — "SELF-TEST OK"
bun scripts/hypothesis-check.ts <the fleet's four probe packets>
  → FP1 now FAILs (2 findings); FF1 and FF2 now PASS; FP2 PASSes by design (§8)
bun agents/skills/writing-bun-scripts/scripts/script-check.ts scripts/hypothesis-check.ts
  → floor: FAIL=0 WARN=0
```

Both directions proven, per `forging-skills` `references/architecture.md` §5 ("a gate never seen
red is decoration"). The self-test is embedded in the script so it survives without a fixture file.
It now carries GOOD fixtures as well as bad ones — three of them, one per branch plus a
marker-free contrast. The forge had none, and that is exactly how an unrepresentable branch shipped
(§8).

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

This skill's description measures **1,382 chars**; with the name, it charges **1,415** per turn.
That is 138 under the observed truncation window (~1,520-1,570), so its tail-positioned language
directive reaches the matcher. The reorganization first pushed it to 1,436 and put the collection
2 chars over its declared ceiling; the answer was to trim this description back rather than raise
the ceiling, so no F4 ratchet was spent (§8). It is over the platform's 1,024-char API-deployment cap, as are
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

## §8 — The 2026-09-05 reorganization: what the first forge got wrong

### The defect

The forge shipped a packet named `ABDUCTION LICENSE` with **no row for the hypothesis**. Its
`Closed route:` field accepted only `EXHAUSTED` or `NOT-EXHAUSTED`. But SKILL.md itself called
`Introduction type: NONE` — the closed route WORKING — "a first-class, common, and usually correct
outcome". That outcome had no representation in the artifact: writing `Closed route: SUCCEEDED`
produced `FAIL [A3] Closed route must start with EXHAUSTED or NOT-EXHAUSTED`.

So the branch the skill named as its most common one could not be written down in the skill's own
packet, and the product — the explanation — had nowhere to live at all. Four independent cold
readings, run blind, each concluded the skill was a permission gate wearing a hypothesis-formation
name, and each proposed a licensing-shaped rename.

The name was not the defect. The artifact was. A skill that forms hypotheses must have a row that
holds one.

### What changed

| Change | Why |
|---|---|
| `Hypothesis:` row added, required on every branch | the product had no home; `Status:` is a verdict, not a claim |
| `Closed route: SUCCEEDED` accepted as a third token | the branch SKILL.md called common was unrepresentable |
| `Status: CLOSED-VOCABULARY` added | `LICENSED`/`NO-LICENSE` cannot describe a packet where nothing needed licensing |
| A3 renamed EXHAUSTION → VOCABULARY; branch table added | A3 decides WHICH branch, never whether a hypothesis exists |
| Hole type paid before the branch split (step 5) | the old step 5 jumped to step 8, skipping the only place it was decided |
| branch-agreement rungs added to the floor | three rows state one decision; disagreement is checkable with no judgement |
| `license-check.ts` → `hypothesis-check.ts`, with a Cleye boundary | the name lied, and the file was one of three repo-wide Bun-floor FAILs |
| registered in `agents/skills/README.md` (3 places) | the forge never added it; `lint:skills-index` was red at HEAD |

### The adversarial pass — 1 blind desk-check + 5 read-only lenses

Blind desk-check (name + description only, no access to this file or `triggers.md`): **19/19**.
It also reported that F2, F4, F6 and C3's anomaly half fire on semantic match with no lexical hook
— recorded in `triggers.md` so a later trim knows those rows have no token to lose.

Four of five lenses returned REFUTED. Seven BLOCKERs, each with a command and its output:

| # | Lens | Finding | Disposition |
|---|---|---|---|
| 1 | FLOOR | FALSE PASS: `Status: LICENSED` with `Introduction type: NONE` — a license over nothing | FIXED; fixture `BAD_LICENSE` locks it |
| 2 | FLOOR | FALSE PASS: `Status: NO-LICENSE` on a fully-paid introducing packet | **NOT a defect** — see below |
| 3 | FLOOR | FALSE FAIL: 「b7でハングし、6台では90秒で完了する」 rejected; no listed connective | FIXED by a structural fallback; the fixture now uses this exact string |
| 4 | FLOOR | FALSE FAIL: `the ARM build crashes at link time; the x86 build completes cleanly` rejected | FIXED by the same fallback; fixture `GOOD_PLAIN` locks it |
| 5 | CROSS-CONSISTENCY | §5 above still invoked the deleted `license-check.ts` | FIXED |
| 6 | OPERATIONALITY | following step 5 literally skipped `Hole type`, whose enum has no escape value, so the documented common branch failed the mandatory floor | FIXED by paying Hole type before the split |
| 7 | PLACEMENT | the DECISIVE cut's two halves are not mutually exclusive, and stage-1 firing never reads the routing table that resolved the conjunction | FIXED: the description now states the order; `N9` desk-checks it |

**Why finding 2 is not a defect.** The branch checks are deliberately ASYMMETRIC. Claiming MORE
than the rows support is caught. Claiming LESS is not: a writer may self-declare `NO-LICENSE` on a
mechanically complete packet, because the reason to downgrade — the discriminator turns out
expressible in the old vocabulary — is a judgement the floor cannot see. Forcing `LICENSED` would
be the floor certifying necessity, which is precisely what `VOC-003` says no procedure can do. The
asymmetry is now stated in the script's header comment rather than left to be rediscovered.

Two MAJORs were dispositioned without a code change and are recorded so they are not re-found:

- **The floor still weighs the licensing apparatus more than the hypothesis.** True, and partly
  irreducible: whether a hypothesis is a good explanation is the judgement `references/gates.md`
  says these gates never make. Two content rungs were added anyway — the claim may not restate the
  `Anomaly` or the `Closed route` account, and on an introducing packet the `Introduced terms` must
  share a word with the claim.
- **The skill disciplines a hypothesis you can already reach; it teaches no way to invent one.**
  True and deliberate — `references/calibration.md` §2 argues it from the corpus. It was invisible
  to a reader, so the LAW now says it outright and routes a reader with no candidate at all to
  `forging-novel-theses`.

### What this round cost, and the standing lesson

The forge was floor-green, prose-debt 0, desk-checked 16/16, and shipped a packet in which its own
most common outcome could not be written. Every mechanical gate passed. What caught it was reading
the skill as a stranger and trying to USE it. That is the F3 adversarial half the forge waived —
`forging-skills` `references/verifying.md` §2 is right that one lens per failure class is not
optional, and the waiver bought exactly one day.
