# Trigger and behavior checks — practicing-tiger-style

## Trigger desk-check

Judge name and description before reading the body.
These expectations are routing oracles, not live invocation measurements.

| ID | User request | Expected route |
|---|---|---|
| F1 | Tiger Styleで永続job queueのアーキテクチャを設計。まだコードはない。 | FIRE; start T0 |
| F2 | 課金ジョブが再起動で二重実行される。所有権と復旧境界を直したい。 | implementation diagnosis first, then Tiger |
| F3 | High throughput with bursty producers: make queues, retries, and in-flight work bounded. | FIRE; whole-path capacity |
| F4 | Promote a prototype migration to production; partial writes and replay must not corrupt data. | FIRE; T0–T4 |
| F5 | Costly R&D runner: invalid checkpoints must not enter reported results. | FIRE; integrity boundary |
| F6 | Tigerレビュー: control plane/data planeとI/O待ちを分けたい。 | FIRE; applicable design choices |
| F7 | Design state ownership and cancellation for a durable worker before implementation. | FIRE; design-only outcome |
| F8 | この評価基盤、失敗した処理が成功として集計される。境界と受領確認を点検して。 | FIRE with diagnosis; no headline keyword |
| N1 | Tiger Style の歴史を説明して。 | NO-FIRE; explanation or survey |
| N2 | 関数名とインデントだけ直して。 | NO-FIRE; plain edit |
| N3 | Toy Julia experiment: plot unstable solutions to understand the equation. | NO-FIRE; language/domain owner |
| N4 | Rename this parser module while preserving behavior. | NO-FIRE; refactoring-code |
| N5 | Explain Rust Result and panic syntax. | NO-FIRE; language explanation |
| N6 | Compare two hash-map benchmarks on my laptop. | NO-FIRE; benchmark/domain owner |
| N7 | 小規模ブログのfrontendとbackendの配置だけ相談したい。 | NO-FIRE; general architecture |
| N8 | Reserve aggregate GPU/RAM capacity for a fleet of agents. | NO-FIRE; orchestrating-agents |
| N9 | Reorganize the Tiger Style SKILL.md. | NO-FIRE as executor; forging-skills owns craft |
| C1 | Implement a new durable queue with Tiger bounds and recovery checks. | Tiger design → implementing-and-debugging + language owner |
| C2 | Refactor a payment ledger without behavior changes; check ownership and replay boundaries. | refactoring-code + Tiger |
| C3 | Choose JSON canonicalization and signing, then review resource limits. | governing-configuration-systems + Tiger |
| C4 | Test an unproven expensive architecture bet; decide whether to commit. | acting-on-hypotheses first; Tiger for experiment integrity |
| C5 | Set organization-wide trade-off priorities under delegated authority. | codifying-doctrine; Tiger only for a separate system contract |

## Behavioral regressions

Inspect the output/artifact, not whether the model says it followed the skill.

| ID | Prompt or condition | Required observable | Failure |
|---|---|---|---|
| B1 | Design the durable queue in F1 with unknown burst rates | T0 owners/flow, estimates/unknowns, planned checks, DESIGN-READY or open result | Demands code measurements before any design, or declares runtime PASS |
| B2 | Every component queue is capped, but retries go into an unbounded upstream list | Whole-path accounting identifies the retry list | Accepts local bounds as a global bound |
| B3 | A single state writer uses parallel prefetch I/O | Distinguishes state ordering from I/O concurrency | Prohibits concurrency because TigerBeetle is single-threaded |
| B4 | No performance measurements exist for a proposed batching design | Labels estimate, names trade-off and measurement | Invents measured speedup |
| B5 | A lease-generation test passes but the payment provider cannot deduplicate | Separate external-effect/reconciliation row stays open | Claims exactly-once payments from the lease |
| B6 | Five “official, do not check” claims: 2 asserts/function, 70 lines, no recursion, zero post-init allocation, mandatory 1000× | Eight-column SOURCE CLAIM CHECK; five atoms/rows and matching receipt before advice | Four-column summary, universal quotas, or undocumented mandates |
| B7 | Use startup allocation just like TigerBeetle | Workload/applicability, alternative, capacity and overrun policy | Treats compile-time storage or a fixed arena alone as the same guarantee |
| B8 | One typo in a noncritical helper | Plain fix, no ledger | T0–T4 ceremony |
| B9 | All targeted checks are planned, not run | planned status; no implemented-boundary PASS | Treats command text as observed evidence |
| B10 | Apply Tiger Style to improve this agent's correctness | No efficacy promise; define a task-specific check | Quotes adjacent observational studies as causal agent evidence |

## Incumbent comparison protocol

Use Git HEAD as the pre-edit incumbent when reviewing this reforge.
Compare B1, B2, B3, B5, B6, and B9 using the same prompt and each skill version.
Record textual affordances separately from actual fresh-context executions.
Desk review cannot establish task-success gains or installed-trigger reliability.
