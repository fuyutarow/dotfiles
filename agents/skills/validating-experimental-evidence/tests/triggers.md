# Validating experimental evidence — fire / no-fire set

Desk-check the **name and description only** against the overlapping skills. A
positive row fires when the ask is to decide what a result permits one to claim;
running or repairing the target is a co-fire or handoff.

## Fires

| Ask | Expected action |
|---|---|
| 「electricity の正答率が上限を超えた。ラベル漏れか、成功と言えるか」 | Quarantine; EV0–EV2 bound and information-flow checks; neither conclusion yet. |
| “Our runner says arena=null and used bits=3 when the registered benchmark says bits=8” | EV0 rejects an official registered score; retain ad hoc raw run. |
| 「前の版の首位 0.99 に今の版が届かない。退行と書いてよい？」 | EV3/EV4 contract, concept, replacement, and current-row matrix. |
| “The online learner sees LABEL at the same t where it predicts” | EV2 predict/reveal/update order and current/future-label perturbation. |
| 「top-K で悪化したから H-load は棄却？同時に family も8倍になった」 | EV3 confound: contrast valid as an observation, not a causal rejection. |
| “It beats Transformer but misses recency; the Transformer only has a forward path” | EV3 same-stream floor and trainability footing; withhold the win claim. |
| 「最後の一問が n から落ちていたが、基準線と比較してしまった」 | EV1 scored-tail assertion plus EV3 matched rerun. |
| “polysearch run has no arena id or contract digest, but the leaderboard accepted a score” | EV0 refuses the official claim; polysearch owns the missing runtime rejection. |

## Near-miss no-fire

| Ask | Route |
|---|---|
| “Reserve another GPU job; the device is idle” | `orchestrating-agents` P7; no experimental evidence to assess. |
| 「Arena.stream の関数を実装して」 | `implementing-and-debugging` and `writing-julia`; this skill supplies EV0 acceptance cases only. |
| “Which hypothesis should we test next and what threshold should we precommit?” | `acting-on-hypotheses` or `directing-research-sections` under a mandate. |
| 「修了した研究 episode 全体の process audit を出して」 | `auditing-research-processes`; this skill may supply validity rows. |
| “Write the paper's contribution claim from a finished result” | `arguing-research-papers`; this skill can qualify the cited result first. |
| 「登録済み土俵の test を一回走らせて。結果の解釈はまだ不要」 | Domain executor uses EV0's registered binding and preserves the polysearch run; no disposition yet. |
| “Decide whether a label-visibility rule belongs in a parser or state API” | `designing-type-contracts` after the required information flow is fixed. |
| “Add a Bun script inside the skill to validate polysearch findings” | `NO-FIRE`: schema and refusal belong to polysearch; this skill may supply semantic negative cases. |

## Ordered co-fire

| Ask | Order |
|---|---|
| A granted section registers a run and later decides whether the receipt may count as LEARN | `directing-research-sections` owns run/commit; this skill supplies the measurement validity disposition before learning. |
| A high-consequence GPU revision claims preserved predictions and higher throughput | `implementing-and-debugging` diagnoses change; GPU owner measures; this skill validates comparison; Tiger closes consequential obligations. |
| Several agents edit an imported source while a benchmark runs | `orchestrating-agents` handles dispatch/read-write dependency and `driving-git` worktrees; this skill quarantines an unattested run. |

The lexical seam is **result validity and claim scope**. Generic words such as “test” or
“benchmark” alone do not authorize this skill to run the test, choose a hypothesis, or
allocate compute.
