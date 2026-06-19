# State of the art — as of mid-2026; read live sources, do not hardcode

> **THIS FILE IS DATED AND DECAYS.** Every claim here carries a date stamp. The
> durable methodology lives in `SKILL.md` and the other `references/*.md`
> (`landscape.md`, `workflow.md`, `faithfulness.md`, `benchmarks-and-trust.md`,
> `epistemics.md`); those are written to survive. This file is a **quarantine**
> for named systems, version numbers, benchmark percentages, sampling budgets,
> contest outcomes, library counts, funding amounts, and tooling release facts —
> exactly the things that go stale within weeks-to-months. Do not lift a number
> out of here into durable prose. When a number is superseded, move it to
> [Old patterns / superseded](#old-patterns--superseded) rather than deleting it,
> so the trajectory stays legible.

## Table of contents
- [How to use this file](#how-to-use-this-file)
- [Frontier formal result (IMO 2024)](#frontier-formal-result-imo-2024)
- [Informal frontier (IMO 2025)](#informal-frontier-imo-2025)
- [Open-weight provers & benchmark numbers](#open-weight-provers--benchmark-numbers)
- [Library statistics (read live)](#library-statistics-read-live)
- [Institutionalization & funding](#institutionalization--funding)
- [Tooling specifics](#tooling-specifics)
- [Foundational lineage (durable-as-history, dated-as-SOTA)](#foundational-lineage-durable-as-history-dated-as-sota)
- [Old patterns / superseded](#old-patterns--superseded)

---

## How to use this file
Read this only to **instantiate** the durable principles with current names and
numbers — never to learn the principles themselves. The right reflex when you
need a current figure is: **go to the live source cited here, not to the number
printed here.** Benchmark percentages and library counts in particular are
"stale on arrival." Treat every entry's date stamp as a freshness warning: an
entry older than ~6 months from your current date should be re-verified before
you repeat it to a user.

**Verification status convention.** Entries backed by a primary link are quotable
once you re-confirm freshness at that link. Entries tagged
**`[unverified — confirm before quoting]`** carry a plausible claim that has **no
primary source captured here**; do not repeat them to a user until you have
located and read a primary source. This tag is itself a freshness/trust marker,
not a license to cite.

---

## Frontier formal result (IMO 2024)
**[as of mid-2026]** The standing frontier *formal, kernel-checked* contest
result is Google DeepMind's combined **AlphaProof + AlphaGeometry 2** system at
**IMO 2024**:

- **Score 28/42 — silver medal.** The gold threshold that year was **29**
  points, reached by 58 of 609 contestants (108 countries).
- **4 of 6 problems solved.** AlphaProof (an RL-trained Lean prover) solved
  **P1, P2, P6**; AlphaGeometry 2 solved **P4** (the geometry problem) in **19
  seconds**. **P3 and P5 were not solved.**
- **P6 was the hardest problem** of the contest — full marks from only **5 of
  609** human contestants (per-problem 7-point count: 5,1,7,2,9,27,76,482; mean
  0.396). The "aquaesulian function" `f:ℚ→ℚ`, proposed by Japan.
- **The proofs are kernel-checked Lean.** This is a genuine formal result, not
  natural-language prose.

**The durable lesson — carry THIS, not the score:**
1. **Faithfulness was outsourced to humans.** The contest problem statements were
   **manually translated into Lean by people**; the automated formalizer was used
   only to build the *training* curriculum, never the actual contest statements.
   The strongest formal result to date still hand-owned the NL→formal step. This
   is the central evidence for the "statement is the deliverable, and humans own
   faithfulness" thesis (`faithfulness.md`).
2. **Training ran on ~80M auto-formalized statements** (≈1M natural-language
   problems expanded stochastically into ≈80M distinct formal Lean statements as
   an RL curriculum) — i.e. autoformalization is the *data engine*, with the
   kernel filtering unprovable items in the loop.
3. **Compute was enormous:** up to **three days** per hard problem (one solve
   landed in minutes; the slow ones took days).

**Publication.** Peer-reviewed in *Nature*, **"Olympiad-level formal mathematical
reasoning with reinforcement learning"** (Hubert, Mehta, Sartran, et al.),
**published online 12 November 2025**, DOI `10.1038/s41586-025-09833-y` (print:
Nature vol 651, pp 607–613, 19 Mar 2026).

- Blog (scores, per-problem solves, compute):
  <https://deepmind.google/blog/ai-solves-imo-problems-at-silver-medal-level/>
- Nature paper:
  <https://www.nature.com/articles/s41586-025-09833-y>
- Official IMO 2024 (609 contestants / 108 countries):
  <https://www.imo-official.org/year_info.aspx?year=2024>

> **Cross-source caveat (topic labels):** DeepMind's blog loosely tags P6 as
> "number theory," but the official IMO classification makes **P6 an
> algebra/functional-equation problem**; P1 and P2 are the number-theory
> problems. Does not change the score, but note the inconsistency if you quote
> topic labels.

**AlphaProof's own benchmark scaling (Nature Table 1, [as of mid-2026]).** Note
the benchmark axis is **miniF2F-test** (the headline scaling table) — *not*
miniF2F-valid, on which the paper reports a saturated **100%**:

| Compute budget | miniF2F-test | PutnamBench-test |
| --- | --- | --- |
| 2 TPU·min | 96.3% | 27.9% |
| 12 TPU·hr | 97.7% | 39.4% |
| +TTRL, 500 TPU·days | 99.6% | ~56% [^putnam] |

The "**56% on PutnamBench**" figure quoted by later papers is this 500-TPU-day
TTRL value. Source:
<https://www.nature.com/articles/s41586-025-09833-y/tables/1>

[^putnam]: The canonical PutnamBench-test top value is **~56% (56.1%)**. A small
    HTML-parse artifact in the source table occasionally mis-aligns the final two
    columns, surfacing a stray pairing of **formal-IMO 58.3% vs PutnamBench
    56.1%**; **56.1%** is the corroborated PutnamBench figure — do **not** lift
    58.3% as the PutnamBench value.

---

## Informal frontier (IMO 2025)
**[as of mid-2026]** The *informal, natural-language* frontier moved decisively at
**IMO 2025**. **The specific outcomes below are not yet backed by a primary link
captured in this file — treat them as `[unverified — confirm before quoting]`
until you read the contest results and the labs' own writeups
(<https://www.imo-official.org/year_info.aspx?year=2025>):**

- **`[unverified — confirm before quoting]`** Two general-reasoning LLMs reportedly
  reached **gold (35/42, 5 of 6 problems) end-to-end in natural language, within
  the contest time limit, with no Lean.**
- **Grading caveat — do not erase it:** by the reported account only **one** of
  those runs was *officially IMO-graded*; the other was graded by selected
  medalists, not the official jury. Quote the gold result only with this asterisk
  **and** only once verified.
- **`[unverified — confirm before quoting]`** In parallel, formal (Lean) provers
  also reportedly reached **5/6** on the same contest.

**Durable lesson (holds regardless of the exact 2025 numbers):** informal LLM
reasoning is now **contest-rigorous as prose but machine-UNverifiable** — it
carries no transferable correctness guarantee. The coverage-vs-certifiability
split is the standing structural fact (`epistemics.md`): informal output is
broader and now rhetorically gold-medal, formal output is the only kind that
ships a kernel guarantee. **Do not cite a natural-language "gold-medal" output as
an established theorem** without subsequent formalization.

---

## Open-weight provers & benchmark numbers
**[as of mid-2026]** Open-weight Lean provers have **caught and in places passed
the closed frontier** on the saturated competition benchmarks. **All specific
model names, parameter counts, sampling budgets, and percentages below move
fast — read the live leaderboard/repo with its pass@k; never hardcode these into
durable guidance.**

> **Read every number with three guards (`benchmarks-and-trust.md`):**
> (1) the dominant competition benchmark (**miniF2F**) is **effectively
> saturated** (top scores ~88–90%+ *at large sampling budgets*) and is known to
> contain **mistranslated / unprovable items**; (2) a headline pass-rate is
> **proof-given-a-blessed-statement**, not end-to-end — true
> **autoformalize-then-prove pipelines score far lower (~mid-30s%)** because
> faithfulness errors compound multiplicatively; (3) **pass@k must be disclosed
> and matched** — an 88.9% at pass@8192 is not comparable to a pass@32 number.

Representative open-weight numbers **[as of mid-2026]** (each `pass@k` stated;
re-verify before quoting):

- **DeepSeek-Prover-V2-671B** — **88.9% on miniF2F-test (CoT, pass@8192)** (up
  from 82.4% at pass@32); **49/658 on PutnamBench**; introduced **ProverBench**
  (325 problems). arXiv `2504.21801`, 2025-04-30.
  <https://arxiv.org/abs/2504.21801> ·
  <https://github.com/deepseek-ai/DeepSeek-Prover-V2>
- **Goedel-Prover-V2-32B** — miniF2F **88.0%/88.1% pass@32** (standard;
  88.1%±0.8% in the paper, 88.0% on the repo card — same result, two roundings)
  and **90.4% pass@32** with self-correction; the **8B** model hits **84.6%
  pass@32**, outperforming DeepSeek-Prover-V2-671B "under the same metric"
  despite being **~80×–100× smaller** (671B/8B ≈ 84×; "100× smaller" is the
  looser phrasing). The 32B also leads PutnamBench among open source: **86
  problems at pass@184** vs DeepSeek-Prover-V2-671B's 47 at pass@1024. arXiv
  `2508.03613`, v1 2025-08-05. <https://arxiv.org/abs/2508.03613> ·
  <https://github.com/Goedel-LM/Goedel-Prover-V2> ·
  <https://blog.goedel-prover.com/>

**The durable capability signal is NOT these percentages.** It is **completed,
human-driven library/blueprint formalizations** (see
[Institutionalization](#institutionalization--funding) and `workflow.md`).
Benchmark leaderboards over-state real capability; prefer demonstrated finished
formalizations as your evidence.

---

## Library statistics (read live)
**[as of mid-2026]** Lean 4's **Mathlib** is the dominant unified library and
grows **weekly** — **any count is stale within weeks.**

> **READ THE LIVE PAGE, NOT THIS NUMBER.** Authoritative auto-generated source,
> with its own embedded generation timestamp:
> **<https://leanprover-community.github.io/mathlib_stats.html>** — always quote
> its `gen_date` alongside any figure. The page's own variables are the ground
> truth (HTML table for theorems/definitions/contributors; `gitstats4.js` for
> `number_files` / `number_lines`). Corroborating prose ("over two million
> lines") on <https://leanprover-community.github.io/> and lean-lang.org.

**Sample figures (STALE ON ARRIVAL — verify live before repeating):**

| Metric | Value | Snapshot |
| --- | --- | --- |
| Theorems | 279,401 | gen_date 2026-06-19 |
| Definitions | 132,992 | gen_date 2026-06-19 |
| Contributors | 772 | gen_date 2026-06-19 |
| Lines of code (`number_lines`) | 2,369,316 (~2.37M) | gen_date 2026-06-19 |
| Files (`number_files`) | 8,890 | gen_date 2026-06-19 |
| Theorems / definitions (historical) | 215,059 / 105,718 | 2025-05-23 (Wayback) |

> **Coherence warning:** quote a *single-date* reading only. It is easy to mix a
> current contributor count with an older theorem count — that produces an
> incoherent bundle. Pull every figure from one `gen_date`.

The durable point (carry this, not the counts): Mathlib's **size and weekly
growth** are what make it the default AI4S target — and what create the
maintenance-load and bus-factor concerns now being funded against (below).

---

## Institutionalization & funding
**[as of mid-2026]** Formal math is being **institutionalized**, which directly
de-risks the historic **volunteer-library bus-factor**. The specific amounts,
funders, and grant scopes belong in this dated file only — and the items below
are **not yet backed by a primary link captured here**, so each is tagged
accordingly. **Do not repeat any of these until you have named the funder /
initiative / theorem from a primary source.**

- **`[unverified — confirm before quoting]`** A **multi-million-dollar
  philanthropic "AI for Math" fund** reportedly went live in 2025. *(Capture the
  funder name + announcement URL + dollar figure before quoting.)*
- **`[unverified — confirm before quoting]`** A **professional initiative to
  maintain Mathlib** (paid maintenance, not volunteer-only) reportedly went live
  in 2025. *(Capture the host org + announcement URL before quoting; cross-check
  against <https://leanprover-community.github.io/>.)*
- **`[unverified — confirm before quoting]`** A **multi-year, grant-funded
  flagship effort** to formalize a landmark theorem by reducing it to
  late-20th-century mathematics is reportedly underway. *(Name the theorem +
  blueprint/repo URL before quoting.)*

**Durable lesson (holds regardless of the specific funders):** the "what if the
volunteers leave?" risk against betting on a single dominant library is being
actively mitigated by professional funding — reinforcing the "default to Lean +
Mathlib" call in `landscape.md`.

---

## Tooling specifics
**[as of mid-2026]** These release facts move; the durable point is that
**push-button automation is maturing on the default ecosystem** (`workflow.md`):

- **`[unverified — confirm before quoting]`** **Lean "hammers" landed in 2025** —
  premise-selection + external-ATP + in-kernel proof **replay** (the ATP result
  is re-checked by Lean's kernel, so trust is not exported to the external
  prover). This closes Lean's historic gap to **Isabelle's Sledgehammer**.
  Reported hammer proof-rates are **setting-sensitive** (cumulative vs
  single-shot premise context) and reverse on goals needing genuine insight or
  unavailable premises. *(Capture the hammer tool's repo/announcement URL before
  quoting a proof-rate; the durable claim — "Lean now has hammer-class
  automation" — is the part to carry.)*
- **`[unverified — confirm before quoting]`** **Coq → Rocq rename:** the proof
  assistant formerly called **Coq** was renamed **Rocq**, version **9.0, March
  2025**. *(Confirm version + date against the Rocq release notes /
  <https://rocq-prover.org/> before quoting.)*

---

## Foundational lineage (durable-as-history, dated-as-SOTA)
**[as of mid-2026]** The architectural recipe behind every modern frontier prover
is stable enough to read as history, but the dates are SOTA-stamped:

- **2020–2023:** the **expert-iteration / RL-on-kernel-verified-outputs** recipe
  and **premise-selection co-training** were established. This
  verifier-in-the-loop **flywheel** (sample many attempts → keep only
  kernel-verified → retrain/iterate; decompose into subgoals; compiler-feedback
  self-correction) is the durable architecture, not any specific search
  algorithm.
- **Three inference paradigms:** whole-proof generation · best-first / tree
  search with critic-value models · subgoal/lemma decomposition. Elaborate
  search earns its keep as **target proof depth grows**; it is an accelerant, not
  a necessity, when a strong RL policy reaches the needed depth in-context.
- **2024–2025 shift:** **unification of informal chain-of-thought with formal
  output, trained by large-scale RL** — the bridge between the IMO-2025 informal
  gold and the formal pipeline.

---

## Old patterns / superseded
*(Empty at file creation. When a figure here is overtaken, MOVE it down here with
its date and a one-line note on what replaced it — do not delete. This preserves
the trajectory and prevents anyone re-citing a retired number as current.)*

- *(none yet — this file is at its first dated snapshot, mid-2026)*

