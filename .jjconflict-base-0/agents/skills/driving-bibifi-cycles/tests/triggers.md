# BIBIFI trigger desk check

Read name/description with plausible siblings. Tests are routing expectations, not live-trigger measurements.

| ID | Request | Route / expected work |
|---|---|---|
| F1 | 「最初の有用な返りを6分以内に取って、BIBIFIを回して」 | HERE: short first-return loop; no periodic status implied |
| F2 | 「マイクロチケットに切って、空いたRAMとVRAMも使って」 | HERE: slice/priority/independent ready queue |
| F3 | GPU is idle while the core is being built; what useful work can run now? | HERE: protect critical path and fill genuinely spare capacity |
| F4 | Stop long-lived agents from holding reservations while waiting | HERE plans lifetime/returns; orchestration executes limits/release |
| F5 | Give a JST release ETA when the milestone changes; no recurring status requested | HERE: event update from observed result and existing release plan; no cron |
| F6 | Experiments should take about two minutes, ten max; no sweeps | HERE: size useful discriminators and end-to-end cycle |
| F7 | A new model waits for all components; get the first useful result sooner | HERE: smallest real executable path and BIBIFI slices |
| F8 | Run one microticket, use its result to choose the next; don't end with a plan | HERE: execute through owners and close the loop |
| F9 | GPU is occupied; advance independent formal counterexamples and source checks now | HERE selects parallel microtickets; proof/evidence owners qualify their results |
| F10 | 「状況掌握、競合仮説・予測表・識別実験・排除表から候補機械を再提案して」 | HERE owns the scientific loop; generation/evidence/proof owners supply their scoped outputs |
| F11 | `/driving-bibifi-cycles` while a parent is repeating release-wait reports | HERE resumes actual authorized work; report-only response fails when a useful action is available |
| F12 | 「標準ベンチマークの突破が目標なのに現行版は未測。理論の ticket ばかり増える」 | HERE selects the next actual-path coverage/conformance result; evidence owner qualifies each row |
| F13 | 「研究のETAが外れ続ける。スクラムポーカーで次の実装を見積もり直して」 | HERE selects measurement, optional independent estimates or a feasibility probe; keeps points separate from deadlines |
| N1 | Is this benchmark score leaking? | `validating-experimental-evidence` |
| N2 | Generate five new research theses with no selected candidate | `forging-novel-theses` with its entry requirements |
| N3 | Reallocate next quarter's research programme | `supervising-research-programmes` |
| N4 | Write the exact resource-envelope JSON | `orchestrating-agents` |
| N5 | Optimize this CUDA kernel | `optimizing-julia-gpu-kernels` plus implementation owner |
| N6 | Audit a frozen historical research episode | `auditing-research-processes` |
| N7 | Update theorem dependencies after this validated finding | `systematizing-theories` |
| N8 | Decide whether to commit to an expensive irreversible rewrite | `acting-on-hypotheses` |
| N9 | Reforge this SKILL.md | `forging-skills` owns the edit |
| N10 | Prove this one lemma, with no scheduling or execution-loop request | `proving-theorems` |
| N11 | This measured score beats the paper: is it comparable and concept-eligible? | `validating-experimental-evidence` |
| N12 | What is Planning Poker, with no active work-selection request? | Plain sourced explanation; no discovery loop or agent launch |

Ordered handoffs: a granted section's admission → HERE's microticket plan → existing run/dispatch owners →
validated receipt → immediate next selection and theory update where relevant. Respect local WIP slots;
independent work elsewhere in the authorized work set may proceed without a global barrier.
