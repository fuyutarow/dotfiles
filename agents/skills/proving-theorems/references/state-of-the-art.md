# State of the art (as of June 2026)

> **READ THE LIVE SOURCE FIRST.** This file is a dated snapshot and is stale within weeks by design.
> Every number, model name, contest outcome, and library count below is time-sensitive. Before
> quoting anything here, open the cited primary source and check its own date stamp. Do NOT lift
> these numbers into durable prose (the `SKILL.md` body and the other `references/*.md` files must
> stay number-free) and do NOT answer from memory.
>
> **Canonical live sources** (check the generation date embedded in each):
> - Mathlib size/health: the auto-generated `mathlib_stats.html` stats page (read its embedded
>   `gen_date`, not this paragraph).
> - Prover SOTA: the live `miniF2F` / `PutnamBench` leaderboards and each system's own paper/repo.
> - Contest outcomes: the official IMO site and the system authors' primary write-ups (treat
>   vendor-blog subject labels as unverified — see the IMO 2024 note below).

## How to update this file

When refreshing, replace the dated heading above with the new `(as of <month year>)`, re-pull every
number from its live source, and keep the *durable* files untouched — if a fact wants to live in
`SKILL.md` or another reference, it is by definition not a fact for this file.

## AI provers and the flywheel — current systems

Named frontier systems (whole-proof / expert-iteration / tree-search lineages) and their benchmark
positions move monthly. Read the live leaderboards and each system's primary paper/repo rather than
trusting any ranking cached here. When recording a number, always record its **sampling budget**
(pass@k) and the **benchmark version**, and distinguish *proof-given-a-blessed-statement* from
*end-to-end statement+proof* (the latter is far lower).

## IMO 2024 — AlphaProof + AlphaGeometry 2 (DeepMind)

Use the **official IMO subject classification**, not the vendor blog's loose labels.

- **Score: 28 of 42 → silver-medal range.** The gold threshold that year was **29** (met by **58 of
  609** contestants). 28 fell one point short of gold.
- **Problems solved (4 of 6):**
  - **P1 — number theory** (solved by AlphaProof, formal/Lean pipeline).
  - **P2 — number theory** (solved by AlphaProof).
  - **P6 — algebra / functional equation** (solved by AlphaProof). This is the official
    classification: the "aquaesulian function" problem, `f : Q → Q`, **proposed by Japan**. NOTE:
    DeepMind's blog loosely tagged this solve as "number theory" — that label is **wrong** by the
    official IMO classification; do not repeat it.
  - **P4 — geometry** (solved by **AlphaGeometry 2** in ~**19 seconds**).
- **Unsolved by the systems: P3 and P5.**
- **Difficulty anchor:** P6 received full marks from exactly **5 of 609** contestants — i.e. the
  hardest problem on the paper, which AlphaProof nonetheless solved.
- **Source / date:** DeepMind announcement (July 2024) plus the official IMO 2024 results and problem
  classification. Re-verify against the official IMO site before citing; prefer it over the blog for
  per-problem subject labels.

## IMO 2025 and later

Outcomes after IMO 2024 (formal-pipeline results, natural-language "gold-medal" claims, and the
distinction between the two) change every contest cycle. Pull from the official IMO site and the
system authors' primary write-ups; treat any natural-language "gold" claim as **un**verified
mathematics until a kernel-checked formalization exists (per the `SKILL.md` verification-depth table).

## Library counts, kernels, funding

Mathlib theorem/definition counts, per-kernel trusted-core line counts, hammer/Sledgehammer maturity,
and ecosystem funding figures all belong here and nowhere else. Do not cache them in prose — read the
live `mathlib_stats.html`, the relevant kernel repos, and current funding announcements at use time.
