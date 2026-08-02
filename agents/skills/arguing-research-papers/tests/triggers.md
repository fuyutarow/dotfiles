# Fire / no-fire desk-check — arguing-research-papers (F3 artifact)

Re-run after ANY description edit. **Protocol**: for each row read ONLY the `name:` + `description:`
(the model's stage-1 view) of this skill AND every plausibly-matching sibling, then answer
fire / no-fire / co-fire. A wrong answer is a description bug (or a badly-designed query — decide
which, in writing, before editing). A green desk-check after every edit is the regression floor.

## FIRES (≥5 — realistic-messy, ≥1 Japanese, ≥1 with no headline keyword)

| # | Ask | Why HERE |
|---|---|---|
| F1 | "reviewer 2 says our contribution isn't novel enough — how do I reframe the claim?" | the claim + positioning + review-survival = core territory |
| F2 | "help me write the intro / motivate this paper against Chen et al. 2023" | the intro funnel (CARS) + named positioning = G3 |
| F3 | 「この論文の abstract、evidence に対して主張しすぎでは?」 (JP) | claim calibration to evidence (argument level) = G2 |
| F4 | "draft the rebuttal to reviewer 2's soundness complaint for our ICML submission" | the rebuttal genre = `reviewer-defense.md` §5 |
| F5 | 「うちの手法の貢献を先行研究に対してどう位置づける?」 (JP) | 位置づけ / 新規性 = G3 positioning |
| F6 | "reviewers keep saying our paper is 'clear but not exciting' and we don't know why" (**no headline keyword** — describes the situation) | the McEnerney value-reset / instability (§5); "clear and useless" is the named failure |
| F7 | "is 'our method significantly outperforms' overclaiming if I only ran one benchmark?" | the two-pass calibration + warrant-or-downgrade = G2 |
| F8 | "write a Limitations section that won't get us desk-rejected" | limitations-as-ethos, objection triage = `reviewer-defense.md` §4 |
| F9 | "Critically appraise whether this one paper's identification strategy and robustness checks support its causal claim." | single-paper argument/method/validity appraisal = reviewer red-team |

## MUST NOT FIRE (≥5 — near-miss negatives, each names who fires instead)

| # | Ask | Route (who fires) |
|---|---|---|
| N1 | "reorganize my paper — methods and results are scattered across three sections and it repeats itself" | **structuring-documents** — organize info you've decided to include (MECE/DRY/section order); no claim decision |
| N2 | "this paragraph reads AI-ish; fix the wording of these two sentences" | **linting-prose** — rewrite-in-place; sentence mechanics |
| N3 | "make my conference-talk slides more convincing for the 15-min slot" | **designing-presentations** — a live talk for a present room |
| N4 | "survey the 40 papers on diffusion sampling and tell me what the field knows" | **systematizing-knowledge** — synthesize OTHERS' corpus into a position |
| N4a | "Extract the sample size and confidence interval from Table 3 of this one paper." | **raising-resolution** — bounded factual extract, no argument appraisal |
| N4b | "Give me a neutral summary of this one paper." | direct answer; use **raising-resolution**'s citation gate silently, but no specialist skill fires |
| N4c | "Surface the hidden premises in this manuscript; do not judge whether they hold." | **surfacing-blind-spots** — premise-only excavation |
| N5 | "given this selected problem, generate novel thesis candidates" | **forging-novel-theses** — candidate genesis, not write-up |
| N5a | "The source field succeeded; construct a correspondence to our target or say exactly where it breaks." | **forging-novel-theses** — transfer mapping / `MAPPING-BREAK`, not a finished target warrant |
| N5b | "this result means we may need to reopen the research problem/program" | **directing-research** — program-stage reopen decision |
| N5c | "precommit a test/commit/kill table for this expensive/irreversible selected thesis" | **acting-on-hypotheses** — hard-gated forward tree |
| N5c2 | "run this deterministic 30-second reversible check" | domain/plain executor; return `EXECUTOR RESULT` to **directing-research** |
| N5d | "decide author/reviewer/verifier roles and acceptance timing" | **orchestrating-agents** — control plane |
| N6 | "the bibliography isn't rendering / fix my LaTeX build" | **compiling-latex** — build/tooling |
| N7 | "fix this typo in my abstract" | just fix it — no ceremony (trivial) |
| N8 | 「この日本語の技術文書、てにをはと文体（である体）を直して」 (JP) | **linting-prose** / **writing-technical-japanese** — prose mechanics, not the argument |
| N9 | "trim/proofread my abstract down to the 150-word limit" | **linting-prose** — wording/length trim; the *argument* is not in question (trivial/format, not a claim decision) |

## CO-FIRE (braided — state the order; these are the executable form of the description's cuts)

| # | Ask | Fires (in order) |
|---|---|---|
| C1 | "help me write my paper" (broad) | **arguing-research-papers LEADS** (decide + argue the ONE claim) → **structuring-documents** (organize the sections) → **linting-prose** (polish the words). The argument is the spine; the others serve it. |
| C2 | "my abstract overclaims AND the prose is clunky" | **arguing-research-papers** (is the CLAIM calibrated to the evidence — argument level, G2) + **linting-prose** (the sentence wording). Order: calibrate the claim HERE → word it THERE. |
| C3 | "I need to write the paper and also give the talk on it" | **arguing-research-papers** (the written paper) + **designing-presentations** (the live talk) — parallel, independent; the medium cut separates them. |
| C4 | "position this against prior work AND make the related-work section well-organized" | **arguing-research-papers** (which named prior work, which gap — G3) + **structuring-documents** (the section's IA). Decide the positioning HERE → organize THERE. |
| C5 | "the research problem is selected but the thesis is missing; later write the completed result" | **forging-novel-theses** generates `CANDIDATE` packets → **directing-research** admits one → [**acting-on-hypotheses** if hard-gated / domain executor if cheap-reversible] earns evidence → **arguing-research-papers** argues the finished claim. A FINISHED result begins HERE, not at genesis. |
| C5b | "reviewer says not novel; should we narrow the claim or reopen the research?" | **arguing-research-papers** diagnoses the finished claim → **directing-research** decides whether to reopen → **forging-novel-theses** only if a selected frame again lacks a thesis. |
| C6 | "write my related-work section covering the 30 papers in this area" | **cut vs systematizing-knowledge**: positioning MY claim against them (the gap, the delta, the nearest competitor) → arguing-research-papers; a standalone synthesis of what the FIELD knows (survey/SoK) → systematizing-knowledge. If the ask is purely "summarize 30 papers", SoK leads; if it's "situate MY contribution", arguing leads. |
| C7 | "Surface the hidden premises in this paper, then assess which ones invalidate its claim." | **surfacing-blind-spots** exposes premises without verdict → **arguing-research-papers** reviewer red-team evaluates warrants, method, and validity |
| C8 | "A donor mechanism inspired our target study; test it, then write the finished result." | `forging-novel-theses` maps/breaks → `acting-on-hypotheses` earns target-side signal when hard-gated → HERE argues only the completed target evidence |

## Notes on the closest cut

The over-trigger risk is `structuring-documents` / `linting-prose` on "help me write my paper". The
resolution is **co-fire, not a race**: this skill owns the CLAIM/ARGUMENT dimension and is the natural
lead on "write my paper", with SD (organize) and LP (word) as sequenced co-fires. The description's
PURPOSE cut (vs SD) and SCALE cut (vs LP) make the lead deterministic; N1/N2 prove it does NOT steal
pure-organization or pure-wording asks.

**The sharp F7 case** ("is 'significantly outperforms' overclaiming if I only ran one benchmark?"):
the *surface* ("significantly outperforms") looks like sentence wording that arguing itself cedes to
linting-prose. The **decisive signal** that routes it HERE is "**if I only ran one benchmark**" —
that is an *evidence-sufficiency* question (does the evidence license the claim's scope = G2), which is
argument-level, not word-choice. Route on the evidence question, not the quoted phrase.

**Reciprocal-cut status.** `forging-novel-theses`, `directing-research`,
`acting-on-hypotheses`, and `orchestrating-agents` now name the phase/purpose seams above. The previously
recorded `forging-novel-theses` debt is closed by the 2026-07-30 genesis-only reforge.
`linting-prose`'s reciprocal claim-calibration cut is also landed. The older
`structuring-documents` reciprocal-description debt remains outside this research-family reforge; do
not use it to blur the finished-claim versus candidate-genesis boundaries fixed here.
