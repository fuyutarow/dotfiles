# Fire / no-fire desk-check — planning-experiment-iterations

Read only this skill's name and description plus plausible siblings. A race is a description or
cut defect.

## FIRES

| Ask | Why here |
|---|---|
| 「次の実験を決めて。6分で回して」 | Next boxed test and its row |
| 「sweep と大規模実験はしない。効率的な実験計画を示して」 | Box and scale basis |
| "VRAM is idle — what should run?" | Free-resource table |
| 「この仮説と対立仮説を見分ける最小の実験は？」 | I1 predictions and outcome regions |
| "Plan the smoke for the closure hypothesis at the smallest n" | I2–I3 |
| 「実験ごとの RAM/VRAM の予定・ピーク・解放を管理して」 | Resource line in the row and log |
| 「基準線が怪しい。次は機構の比較か、経路の診断か？」 | I0 readiness and next-test selection |
| "Compilation consumes the iteration; how should I plan the next GPU check?" | Phase costs and bounded diagnostic |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| "Should we bet the next month on the GPU rewrite?" | `acting-on-hypotheses` |
| 「研究プログラム全体の課題を並べ直して」 | `supervising-research-programmes` |
| "Is 0.994 real or a label leak?" | `validating-experimental-evidence` |
| "Write the agent-resource-run manifest for this job" | `orchestrating-agents` |
| 「この異常を説明する仮説を一つ立てて」 | `forming-hypotheses-from-anomalies` |
| "Speed up this CUDA kernel" | `optimizing-julia-gpu-kernels` |
| 「終了した研究のポストモーテムを書いて」 | `auditing-research-processes`; this skill may be an audit target |
| "Distill that postmortem into this SKILL.md" | `forging-skills`; editing the manual is not executing it |

## Ordered co-fire

| Braided ask | Order |
|---|---|
| An anomaly, then its test | `forming-hypotheses-from-anomalies` → here |
| A test inside a granted section | here (row) → `directing-research-sections` (`RUN_INTENT`) |
| A test, then a claim from its result | here → `validating-experimental-evidence` |
| A failed validity check, then the next diagnostic | `validating-experimental-evidence` → here |
