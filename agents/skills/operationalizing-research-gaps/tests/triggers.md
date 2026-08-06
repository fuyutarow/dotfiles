# Trigger regression set — gate F3

Desk-check protocol: for each row read ONLY `name:` + `description:` of every plausibly-matching skill
in the collection, then answer fire / no-fire / co-fire. Re-run after ANY description or cut edit. A
wrong answer is a description bug or a badly designed query — decide which, in writing, before editing.

## Should FIRE

| # | Query | Why it fires |
|---|---|---|
| T1 | 「soks/sok-近似最近傍探索 の sok.md、調査自体は終わってるんだけど『更新条件』が全部「一次資料が読めたら」になってて誰も動けない。次にやることの形にして」 | Japanese; names the exact observed failure — world-conditions where openings belong |
| T2 | "We finished the review last month. Now I want the open bits in a shape someone could actually pick up next week, with a deadline on each." | No headline keyword; describes the transition this skill owns |
| T3 | "Take the living gaps out of this SoK and give each one a test that would close it, an owner, and an expiry." | Names the artifact cells directly |
| T4 | "Turn this literature review into an open-problem list — typed, and please don't rank them." | Carries the no-ranking constraint the skill enforces |
| T5 | "Of the 12 unresolved items in this survey, which can be turned into a benchmark with a referee and a fixed threshold?" | The `TASK` promotion test |
| T6 | 「この2つの SoK、同じ量を縛ってるのに互いに引用してない。関係は主張しないで、その事実だけ行にして」 | Japanese; `NON-ADJACENCY` with its own restraint stated |
| T7 | "Our openings sheet closed its cycle. What do we report, and does the layer survive its own threshold?" | Gate O5, accounting and self-retirement |

## Should NOT fire — near misses

| # | Query | Fires instead |
|---|---|---|
| N1 | "Synthesize these 40 papers into what is known, uncertain, disputed, and missing." | `systematizing-knowledge` — the position must be signed before anything is operationalized |
| N2 | "Is this a coverage gap or a comparability gap?" | `systematizing-knowledge` `references/delivery.md` §5 — SOLE owner of the gap typology |
| N3 | "We have six candidate directions and two slots. Which do we fund this quarter?" | `supervising-research-programmes` — selection and allocation, the CARDINALITY cut |
| N4 | "Map donor D-007 onto our quantization frame and write the transfer thesis." | `forging-novel-theses` — target correspondence |
| N5 | "We picked the DiskANN comparison and it costs three GPU-days. Commit, pivot, or kill?" | `acting-on-hypotheses` — one selected expensive bet |
| N6 | "Section B declared a need for sparse-routing work; send them our note." | **NO OWNER** — delivery is a declared residual. This skill must say so and stop at addressing, not improvise a channel |
| N7 | "Where should this sheet live, who owns it, and when does it retire as a document?" | `governing-research-documentation` — durable locus and authority |
| N8 | "Check whether HNSW's Theorem 1 really assumes an exact Delaunay graph." | `raising-resolution` — one cited observation |
| N9 | "This report repeats itself and references forward twice. Reorganize it." | `structuring-documents` — information architecture |
| N10 | "Find every place in the repo that mentions the ANN theme." | `driving-cocoindex` / `repo-search` — locating, not operationalizing |
| N11 | "Write a research proposal arguing why this direction matters." | `arguing-research-papers` — positioning a governing claim, not a bill of work |

## CO-FIRE — order matters

| # | Query | Order |
|---|---|---|
| C1 | "Survey this corpus and then tell me what we should actually do next." | `systematizing-knowledge` FIRST — it signs the position; THEN here, which never operates on an unsigned corpus |
| C2 | "Turn these openings into offers for the sections that asked about them." | HERE writes and addresses the rows, then STOPS and names the residual: no skill owns consent, matching, delivery, or pull today. Restore this row to a co-fire when one is forged |
| C3 | "One of our openings got retired by evidence — update the SoK." | HERE closes the row and hands the observation over; THEN `systematizing-knowledge` re-runs its own gates. Belief moves only there |
| C4 | "Promote the two most promising openings into programme issues." | HERE supplies the rows unranked; `supervising-research-programmes` does the promoting and owns the word "most promising" — this skill must not answer it |
| C5 | "Reforge this skill's description; it collides with systematizing-knowledge." | `forging-skills` owns the edit; this file is the artifact it re-runs |

## Known contested rows

| Row | Contest | Resolution |
|---|---|---|
| T4 | `systematizing-knowledge` also matches "literature review" | Its description says it *signs the position*; this one says it operates on an *already signed* one. If the user has no signed position, N1 is the correct answer and C1 is the correct order — the desk-check answer depends on that fact, and the query is deliberately written to require asking |
| C4 | "most promising" is a ranking word this skill forbids | The co-fire is the resolution: the rows come from here, the ranking from there. A single-skill answer to C4 is a bug in whichever skill answers it alone |
