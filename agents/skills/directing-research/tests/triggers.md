# Research-family name + description desk-check

Read **only** the `name` and `description` of:

- `directing-research` (`D`)
- `surfacing-blind-spots` (`B`)
- `forging-novel-theses` (`F`)
- `acting-on-hypotheses` (`A`)
- `raising-resolution` (`R`)
- `systematizing-knowledge` (`S`)
- `orchestrating-agents` (`O`)
- `arguing-research-papers` (`P`)
- `governing-research-documentation` (`G`)
- `continuing-long-running-tasks` (`C`)

A broad request must have one lead. A braided request may co-fire only with an explicit order. A decision
artifact may have one owner.

## Regression matrix

| # | Realistic ask | Lead / ordered route | Boundary being tested |
|---|---|---|---|
| 1 | 「どうすれば創造的な研究ができる？ テーマ、アイデア、実験、撤退まで」 | `D -> B -> D -> F -> D -> [A or domain executor] -> D` | broad lifecycle has one lead; expose, then apply the action gate |
| 2 | “Which of these three research themes deserves the next six months?” | `D` | problem selection / >=2 bets |
| 3 | 「材料探索を速くする、では雑すぎる。決定的な研究問題に作り直して」 | `D` | formulation, not present inspection |
| 4 | “Given this fixed problem, invent a novel thesis from first principles.” | `F` | genesis only |
| 5 | “This systematic residual may imply a new direction.” | `R -> D -> F` | verify present -> frame -> generate |
| 6 | “Transfer this relation from distributed optimization and derive a prediction.” | `F` | structural transfer |
| 7 | “Ten ideas exist; freeze/deduplicate and select by separate axes.” | `D` | batch admission |
| 8 | “One expensive catalyst thesis exists; precommit its cheapest kill experiment.” | `A` | expensive/irreversible one-tree hard gate fires |
| 9 | “Allocate GPU across three independent directions.” | `D` | portfolio cardinality |
| 10 | “Synthesize 60 creativity papers, then identify future research gaps.” | `S -> D` | corpus state -> future selection |
| 11 | “Use multiple agents; decide who generates, criticizes, verifies, and accepts.” | domain sequence `D/F/[A or executor]` fixed first; `O` leads topology | content vs control plane |
| 12 | “Reviewer says the finished paper is not novel; narrow the claim or reopen research?” | `P -> D`; then `F -> [A or executor]` only if reopened | finished claim vs new thesis |
| 13 | “Inspect the benchmark script for leakage and cheap victories.” | `R`; `D` only if reformulation follows | present fact vs normative formulation |
| 14 | “Eight agents build a SoK and then choose research investments.” | `S` schema -> `O` dispatch -> `S` adjudication -> `D` | corpus method vs orchestration vs selection |
| 15 | 「人間研究者として、問いをつくり、行き詰まったら寝かせ、実験で更新する創造的研究プロセス」 | `D`; incubation is an optional human branch | human researcher is in scope |
| 16 | 「この研究計画の盲点と暗黙前提を掘って。まだ解決策や仮説は出さないで」 | `B` | expose only; no frame selection or thesis genesis |
| 17 | “Interview me for unpublished failures, workarounds, and exceptions before reframing this project.” | `B -> D` | human tacit elicitation then program judgment |
| 18 | 「選んだ問題フレームから、水平思考で構造的に異なる仮説を出して」 | `F` | selected frame exists; genesis owns lateral transformations |
| 19 | “Find comparable donor relations from other fields, but do not map them to my target yet.” | `S` | target-agnostic donor discovery owns the `DONOR SET` |
| 20 | “A donor set and selected frame exist. Map the relations, preserve failed correspondences, then decide whether to test or reopen.” | `D -> F -> D` | D admits/disposes; F maps or emits `MAPPING-BREAK`; no source-side adoption |
| 21 | “Audit this completed research episode against its frozen intent and receipts. Did our process justify the frame update?” | `D` | semantic research-process postmortem, not dispatch review |
| 22 | 「失敗して停止した研究 run も含め、事前意図・対照・欠測・代替仮説から振り返って」 | `D` | failed/stopped receipts remain in the denominator |
| 23 | “This old project has no prospective intent and only partial public artifacts. Perform the most honest retrospective possible.” | `D` | historical absence yields `PARTIAL` or `UNAUDITABLE`, never reconstructed precommitment |
| 24 | “Postmortem this generic production outage and fix the software incident process.” | `implementing-and-debugging` | generic software incident/postmortem is neither research-stage judgment nor control-plane review |
| 25 | 「agent の発注が遅く、査読役も見えていた。dispatch/pacing のポストモーテムをして」 | `O` | control-plane postmortem owns bearer, visibility, pacing, and acceptance |
| 26 | “Delete stale generated research views and retire duplicate canonical documents.” | `G` | document admission/lifecycle, not semantic research verdict |
| 27 | “Keep this research task resumable across compact and hand it to another executor.” | `C` | durable task-state transport, not research evidence or judgment |
| 28 | “Formulate this broad topic into several discriminating research problems.” | `D` | ordinary problem formulation; no postmortem ceremony |
| 29 | 「この研究を進めて。必要なら複数 agent に委任して」 | `D` domain map, then `O` overlay | bare research progress has D lead; O fires only after domain-signed function map |
| 30 | 「この研究課題の解像度を上げ、具体化して研究問題として定式化して」 | `D` | Japanese research-problem formulation belongs to `D`; `R` may supply only a silent cited factual row |

## Negative boundaries

| Ask | Must not lead |
|---|---|
| daily imagination/self-care habits unrelated to a research decision | none of this family |
| one present artifact/source/code fact | not `D/F/A`; route `R` |
| hidden premises or human tacit constraints in one existing plan/frame, before solutions | not `D/F/A/R`; route `B` |
| one corpus position | not `D/F/A`; route `S` |
| donor discovery without a selected target mapping | not `D/F`; route `S` |
| source-to-target correspondence or a failed correspondence for one selected frame | not `D/S`; route `F` |
| one expensive/irreversible selected tree's threshold, outcome table, commit, pivot, kill | not `D/F`; route `A` |
| one cheap deterministic reversible probe | not `A`; route domain/plain executor, then return result to `D` |
| agent roles, blindness, visibility, veto, acceptance | not domain skills; route `O` |
| finished manuscript claim | not `D/F/A`; route `P` |
| generic software incident postmortem | not `D/O`; route `implementing-and-debugging` |
| dispatch, pacing, delegation, or acceptance postmortem | not `D`; route `O` |
| durable document admission, authority, review, retention, or deletion | not `D`; route `G` |
| compact, resume, or executor handoff transport | not `D`; route `C` |

## Reciprocal-cut checklist

- `D <-> B`: lifecycle/frame judgment versus premise/tacit-constraint exposure.
- `D <-> S`: program/corpus decision versus evidence state; `S` owns target-agnostic donor discovery and `DONOR SET`.
- `D <-> F`: problem selection/formulation/admission and transfer disposition versus thesis genesis and source-to-target mapping / `MAPPING-BREAK`.
- `D <-> A`: selection/standing policy/>=2 bets versus one expensive/irreversible load-bearing tree.
- `D <-> R`: normative future problem versus inspectable present artifact.
- `D <-> P`: research program before a finished claim versus manuscript argument.
- `D/F/A/P <-> O`: domain meaning versus agent topology/authority.
- `D <-> O` postmortem seam: research semantics and transition versus dispatch/pacing/delegation.
- `D <-> G`: semantic retrospective verdict versus durable document lifecycle.
- `D <-> C`: semantic research state versus cross-session transport of artifact loci.
- `F <-> S`: candidate generation versus novelty/corpus evidence.
- `F <-> R`: future candidate versus present observation.
- `F <-> P`: untested candidate versus finished claim.

Any cut present on only one side is a collection-level failure.
- `B <-> R`: implicit premise/tacit constraint versus fixed present fact with a citable locus.
- `B <-> F`: expose assumptions without solutions versus generate candidate theses after a selected frame.
- `B <-> A`: pre-test premise excavation versus one gated expensive/irreversible tree's forward test/commit.
