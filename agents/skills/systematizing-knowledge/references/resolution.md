# Resolution — the content bar: mechanism + magnitude + regime, and the expert-surprise test

> Scope: the CONTENT gate the formal machinery cannot check — whether claims and sections are
> stated at high enough resolution that a domain expert learns something non-obvious. This file
> owns the **resolution grammar** (per load-bearing claim), the **four resolution axes** (per
> section), the **expert-surprise test**, the **substance-audit table**, and the
> **vague-quantifier deny-list**. It fires TWICE in the pipeline: at **extraction** (step 3 —
> extract results, not gists) and at **writing** (step 10 — audit every section before delivery).
> Presence of ledger/GRADE/moderators is owned by the other references; THIS file rejects the
> checklist-complete-but-shallow deliverable. Axis-level content quality (does an axis predict
> behavior) is owned by `taxonomy.md`'s EXPLANATORY gate; this file extends the same demand down
> to the claim sentence and up to the section.

## 0. Why this gate exists — the observed failure

2026-07, a 13-document production corpus: every document had ONE RQ, scope-in/out, a claim
ledger, GRADE labels, named moderators, flip conditions, a hero table — every formal gate green —
and the expert owner's verdict was still **"稚拙" (immature)**. Post-mortem: the machinery was
PRESENT but the cells were LOW-RESOLUTION — mechanisms summarized by vague quantifiers, citations
decorative (paper-level, not result-level), sections an expert could have written without reading
the corpus. **Formal gates check that machinery exists; none of them check that it is filled.**
This file is that check. The precedence rule:

> **A checklist-complete SoK whose cells are qualitative placeholders is *scaffold theater* —
> machinery must be FILLED, not PRESENT.**

Corollary for effort allocation: when time is short, deepen three load-bearing claims to full
resolution rather than adding a ninth formal artifact. Scaffolding has diminishing returns;
resolution does not.

## 1. The resolution grammar — every load-bearing claim

A load-bearing claim (one the position would change without) must instantiate ALL six slots.
Non-load-bearing prose is exempt — this bar is for the claims the argument stands on.

| Slot | Requirement | Failure mode it kills |
|---|---|---|
| **OBJECT** | the specific quantity / system / theorem — not the topic | "measurement optimization helps" (topic, no object) |
| **COMPARISON** | against which baseline, held at what | "10× faster" (than what? same hardware? same accuracy?) |
| **MAGNITUDE** | number + units + uncertainty; or an explicit `qualitative` tag + WHY no number exists | "substantially reduces" (unfalsifiable) |
| **REGIME** | the conditions under which it holds — the ledger context vector surfaced into prose | unconditional generalization (invariant #5's sibling) |
| **MECHANISM** | the causal WHY, at least one level below the assertion | correlation reported as if it were an explanation |
| **ANCHOR** | the specific locus: Theorem 2 / Table 3 / Fig. 5 / dataset — not just a bibkey | citation-as-decoration (paper cited, result unlocatable) |

Relation to `ledger.md`: the grammar extends the atomic-claim grammar; the `effect` and
`source(s)`+locus columns already exist there. This bar makes them **mandatory for load-bearing
claims**: a row still at `dir-only` with no recorded reason, or a source with no locus, may not be
rendered as a load-bearing sentence — it renders as an explicitly-hedged aside or not at all.

**Worked rewrite (low → high resolution):**

- LOW: 「適応的手法は測定コストを大幅に削減できる \cite{vendor2025}.」
  (no object, no baseline, no magnitude, no regime, no mechanism, decorative cite)
- HIGH: 「Vendor X の自律較正は shot 数 10× 減を逐次適応測定選択に帰属させる (whitepaper §3) が,
  情報理論的 BED が O(1) 倍を超える利得を証明できるのは非線形・大域推定 regime のみで
  (Ryan et al. 2016, §4), 局所・線形 regime では利得は定数倍に有界 (Theorem 1 of …).
  従って 10× は regime 依存の経験値であり保証値ではない.」
  (object = shot count; comparison = non-adaptive baseline; magnitude = 10×, flagged empirical;
  regime = nonlinear/global vs local/linear; mechanism = sequential selection vs bounded local
  gain; anchors = §3, §4, Theorem 1)

The HIGH version is *longer*. That is normal: resolution costs words. Buy the words by deleting
low-resolution filler elsewhere, never by compressing the claim back to a slogan.

## 2. The four resolution axes — every section

Adapted from 馬田『解像度を上げる』 (depth / breadth / structure / time) to SoK sections. Diagnose
each top-level section on all four; a section failing ≥2 axes is a summary, not synthesis.

| Axis | Pass test | Fail signal |
|---|---|---|
| **DEPTH** | the mechanism is stated ≥1 level below the headline claim — the WHY behind the WHAT | the section restates its own heading with adjectives |
| **BREADTH** | alternatives and counterexamples appear WITH the conditions that select among them | one method narrated as if alternatives did not exist |
| **STRUCTURE** | relations between claims are quantified (a comparison with values), not listed | bullet lists of facts with no ordering, trade-off, or dominance statement |
| **TIME** | what changed recently and why the synthesis is possible/needed NOW | timeless prose that could have been written five years ago |

## 3. The expert-surprise test — per section

For each top-level section, complete the sentence:

```
An expert in <field> reads this section and learns: ___
```

**Fail** when the blank is (a) a textbook fact, (b) a restatement of the section title, or (c) a
repeat of the abstract. **Pass** requires a specific, non-obvious content: a reconciliation, a
quantified boundary, an empty cell with a WHY, a cross-source synthesis no single paper states.

Aggregate gate: if fewer than ~3 sections pass across the document, the problem is upstream —
corpus too thin (return to step 2) or genre miscast (`genre.md`) — not a writing problem. Do not
polish prose to hide an empty corpus.

## 4. The substance-audit table — the check you can run

Produce this table before delivery (analog of the ledger orphan-grep, at content level). An empty
cell = the gate fails; either fill it (deepen the section) or cut the section.

```
| § | An expert learns (1 sentence) | Magnitude + regime | Anchor (locus) |
|---|-------------------------------|--------------------|----------------|
```

This is deliberately cheap: one row per section, four columns. If filling it feels hard for a
section, that section IS the problem — the table is diagnosis, the fix is content work
(back to steps 2–3), not table work.

## 5. The vague-quantifier deny-list — greppable

In a **load-bearing sentence**, each of these must be replaced by a number+regime or explicitly
justified as qualitative (`MAGNITUDE` slot rule, §1). In non-load-bearing prose they are style
noise at worst — flag, judge, don't auto-delete.

| EN | JA |
|---|---|
| significantly / substantially / considerably | 大幅に / 著しく / 大きく |
| efficient(ly) / effective(ly) | 効率的に / 効果的に |
| many / most / a wide range of | 多くの / ほとんどの / 幅広い |
| important / crucial / key | 重要な / 本質的な / 鍵となる |
| improves / outperforms (bare) | 改善する / 上回る（裸） |
| state-of-the-art (unanchored) | 最先端（アンカーなし） |

```bash
grep -nE 'significantly|substantially|efficient|many|important|大幅に|著しく|効率的|多くの|重要な' \
  the-sok.md   # then judge each hit: load-bearing? -> number+regime or declared-qualitative
```

The grep yields *candidates for judgment*, not automatic sins — mechanize the FINDING, keep the
VERDICT human/agent.

## 6. Resolution × GRADE — orthogonal, both required

| | High resolution | Low resolution |
|---|---|---|
| **High GRADE** | the goal | **impossible** — you cannot grade what is not stated precisely; treat as an extraction failure, re-extract (step 3) |
| **Low GRADE** | fine — a precise claim on weak evidence, SAID to be weak | scaffold theater |

Two distinct failure directions:
- **Scaffold theater** — machinery present, cells vague (the §0 failure).
- **Resolution theater** — fake precision: numbers quoted without regime or uncertainty, spurious
  significant digits, a magnitude copied from an abstract without its conditions. The MAGNITUDE
  slot without the REGIME slot is theater, not resolution.

## 7. Where it fires in the pipeline

- **Step 3 (extraction)**: pull the *specific result* — the theorem statement, the number from
  Table 3 WITH its conditions — never the abstract-level gist. Sibling failure: *spin inheritance*
  (`ledger.md` §ANTI, extracting the abstract's framing). A ledger row that cannot fill MAGNITUDE
  + REGIME from the paper's methods/results is recorded with `???` and capped (per `ledger.md`).
- **Step 10 (writing)**: run §4's substance-audit table + §5's deny-list grep + §3's
  expert-surprise test, WITH the adversarial self-review (`writing.md` §6). Findings loop back to
  step 3 (the mandatory loop edge in SKILL.md §CORE).

## Anti-patterns (resolution-scoped)

| Anti-pattern | Fix |
|---|---|
| **Scaffold theater** — all formal gates green, cells qualitative | Fill the six slots (§1) for every load-bearing claim; run the substance audit (§4) |
| **Vague-quantifier laundering** — "substantially/大幅に" where a number exists in the source | Deny-list grep (§5); re-extract the number + regime from the source's results section |
| **Citation-as-decoration** — bibkey with no locus; result unlocatable in one hop | ANCHOR slot: theorem/table/figure (`ledger.md` locus rule) |
| **Expert-trivial section** — restates textbook knowledge as synthesis | Expert-surprise test (§3); deepen with the corpus or cut |
| **Resolution theater** — precise-looking numbers with no regime/uncertainty | MAGNITUDE without REGIME fails §1; restore the conditions or downgrade the claim |
| **Gist extraction** — ledger rows summarize abstracts, not results | Extract from methods/results with locus (step 3 rule, §7) |

## Cross-references

| Need | Go to |
|---|---|
| Atomic-claim grammar, context vector, locus rule | `ledger.md` |
| Axis-level content gate (EXPLANATORY), cell anchors | `taxonomy.md` |
| GRADE certainty machinery | `synthesis.md` |
| The adversarial self-review + STOP gates this audit joins | `writing.md` |
| Section-resolution ↔ genre problems (corpus too thin) | `genre.md`, `workflow.md` |
| Running this audit as a fan-out (per-section auditors, per-claim skeptics) | `orchestration.md` |
