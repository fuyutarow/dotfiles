# Trigger and behavior checks — practicing-tiger-style

## Trigger desk-check

Judge name and description before reading the body.
These expectations are routing oracles, not live invocation measurements.

| ID | User request | Expected route |
|---|---|---|
| F1 | Tiger Styleで永続job queueのアーキテクチャを設計。まだコードはない。 | FIRE; start T0 |
| F2 | 課金ジョブが再起動で二重実行される。所有権と復旧境界を直したい。 | implementation diagnosis first, then Tiger |
| F3 | High throughput with bursty producers: make queues, retries, and in-flight work bounded. | FIRE; whole-path capacity |
| F4 | Promote a prototype migration to production; partial writes and replay must not corrupt data. | FIRE; selected recovery/state/capacity contracts; T3 only if an exception is proposed |
| F5 | Costly R&D runner: invalid checkpoints must not enter reported results. | FIRE; integrity boundary |
| F6 | Tigerレビュー: control plane/data planeとI/O待ちを分けたい。 | FIRE; applicable design choices |
| F7 | Design state ownership and cancellation for a durable worker before implementation. | FIRE; design-only outcome |
| F8 | この評価基盤、失敗した処理が成功として集計される。境界と受領確認を点検して。 | FIRE with diagnosis; no headline keyword |
| F9 | この costly R&D learner を GPU first に作り直す。理論的な仕事量、速度下限、同じ予測を保つ条件を発注時に固定したい。 | implementing-and-debugging first; Tiger T0/T2/T4 for a consequential performance contract; GPU skill for device mechanics |
| N1 | Tiger Style の歴史を説明して。 | NO-FIRE; explanation or survey |
| N2 | 関数名とインデントだけ直して。 | NO-FIRE; plain edit |
| N3 | Toy Julia experiment: plot unstable solutions to understand the equation. | NO-FIRE; language/domain owner |
| N4 | Rename this parser module while preserving behavior. | NO-FIRE; refactoring-code |
| N5 | Explain Rust Result and panic syntax. | NO-FIRE; language explanation |
| N6 | Compare two hash-map benchmarks on my laptop. | NO-FIRE; benchmark/domain owner |
| N7 | 小規模ブログのfrontendとbackendの配置だけ相談したい。 | NO-FIRE; general architecture |
| N8 | Reserve aggregate GPU/RAM capacity for a fleet of agents. | NO-FIRE; orchestrating-agents |
| N9 | Reorganize the Tiger Style SKILL.md. | NO-FIRE as executor; forging-skills owns craft |
| N10 | Compare two throwaway GEMM timings on my laptop. | NO-FIRE; benchmark/domain owner, no retained consequence |
| C1 | Implement a new durable queue with Tiger bounds and recovery checks. | Tiger design → implementing-and-debugging + language owner |
| C2 | Refactor a payment ledger without behavior changes; check ownership and replay boundaries. | refactoring-code + Tiger |
| C3 | Choose JSON canonicalization and signing, then review resource limits. | governing-configuration-systems + Tiger |
| C4 | Test an unproven expensive architecture bet; decide whether to commit. | acting-on-hypotheses first; Tiger for experiment integrity |
| C5 | Set organization-wide trade-off priorities under delegated authority. | codifying-doctrine; Tiger only for a separate system contract |
| C6 | A consequential benchmark looks implausibly good and may leak the label. | validating-experimental-evidence determines validity; Tiger keeps the risk/acceptance row open until its disposition |

## Behavioral regressions

Inspect the output/artifact, not whether the model says it followed the skill.

Negative-space enforcement cases (design checks, not executed effect tests):

| ID | Prompt or condition | Required observable | Failure |
|---|---|---|---|
| NS1 | A disk collector accepts a typed `SafeToDelete` plan, then a worker starts using the workspace before unlink | Identify stale permission and require a shared ownership/serialization mechanism covering use and deletion; plan an interleaving test | Brand or last-moment recheck alone proves safe deletion |
| NS2 | Enforce positive byte counts and keep logical unlink bytes distinct from available filesystem bytes | Controlled parsed values and distinct representations where useful; capacity success still requires the relevant observation | All obligations are pushed into runtime checks, or a type proves real capacity recovery |
| NS3 | A postcondition asserts that an irreversible charge was not duplicated | Separate contradiction detection from pre-effect prevention and post-effect recovery; retain provider-boundary uncertainty | Assertion after charging prevents or reverses the charge |
| NS4 | Collector and workers share a lock, but another supported writer bypasses it | Identify incomplete mediation and keep the affected safety guarantee OPEN | Merely naming a lock establishes enforcement |

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
| B11 | F9's optimized step is faster but changes one prediction | Separate speed and semantic T2 rows; T4 stays STOP for the affected claim | Declares PASS from speed alone or writes the parity threshold after observing the run |
| B12 | Capacity grows to remove truncation; dense storage is members × capacity × answers | Re-evaluate the combined byte bound under T0 and reopen dependent memory rows | Accepts each dimension's finite bound as proof the allocation fits |
| B13 | A sparse layout replaces the old capacity function; its old overflow check passed | Old PASS retains old identity; successor overflow/memory obligations need new evidence | Deleting the old function silently closes its obligation |
| B14 | Revision A passes causality while a worker edits revision B | Report A coverage; justify transfer to B or keep B open | A digest alone freezes mutable files or certifies B |
| B15 | A runtime PASS has only command/output; author calls implementation identity immaterial | Refuse implemented-boundary closure until implementation/workload identities exist | Optional metadata lets an unbound check certify changed code |
| B16 | Derived writes contaminated state before contradiction; guard now disables future derivation | Exercise later reads and dependent state; recover or quarantine the affected scope | Guard activation alone restores the baseline |
| B17 | A disposable run aborts on late corruption and publishes no result | Explicit whole-run quarantine may satisfy handling; preserve trusted inputs | Demand rollback despite containment and no continued trusted use |
| B18 | Recovery deletes speculative entries but their descendants remain; observed entries share the table | Track dependency/provenance or rebuild from trusted observations, then test future reads | Delete only direct bad entries or erase trusted observations without reconstruction |
| B19 | Requirement forbids all exceptions, but a failing case is put on a test allowlist | Original requirement remains unmet | Test green means strict conformance |
| B20 | Risk owner accepts a documented temporary exception for one use; every other selected obligation has evidence | ACCEPTED-WITH-EXCEPTIONS for that use; preserve original unmet clause and its observation | Ban all use, return unqualified PASS, or claim original strict conformance |
| B21 | Requirement explicitly demands query dependence on payload values; test only verifies the function accepts x | Use a violating payload-independent implementation as a falsifying witness | Signature or added position channel proves the required dependency |
| B22 | Parameter alpha has a comment naming a standard theory, but no derivation or choice basis | Classify and justify the actual selected value for the workload | Comment presence proves necessity or optimality |
| B23 | Requirement meaning is settled and a narrow checker has a demonstrated violating case | Use that scoped check with its coverage limit | Require full research reauthorization for every local check |
| B24 | Ambiguous external standard has no available owner | Report the stated interpretation and unresolved alternative; withhold unqualified conformance | Stop all read-only assessment until an owner appears |
| B25 | Throughput requirement is checked by a timing predicate or a construction proof | Record the predicate/argument and its scope | Require an input-rejection mechanism for every positive property |
| B26 | Review a retained disk cache; trusted inputs reconstruct it, effects are contained, no financial/safety exposure | Review mode; Medium; scope chosen before checks; persistence alone does not require High | Automatically classify any durable file as High or redesign the whole application |
| B27 | Throwaway prototype sends a non-reversible payment | High wins over disposable label; external-effect/failure contracts selected | Low because the code will be discarded |
| B28 | Retained worker's only copy/recovery and budget are unknown | Classification unresolved; scoped inspection/plans continue; readiness and implementation acceptance OPEN | Guess Medium/High or demand approval before read-only inspection |
| B29 | Design a bounded in-memory queue; losses contained; workload estimate labeled, ownership/overflow and all selected check plans decided | DESIGN-READY; implementation evidence OPEN; concrete implementation next action | HAND-OFF replaces evidence status, or absent runtime tests prevent finishing the design |
| B30 | Same queue design leaves overflow handling undecided | Design readiness OPEN and a concrete resolving action | DESIGN-READY merely because the open issue was written down |
| B31 | Existing local check ordering has a known violation; review requested, no edits | Review finishes with finding, inspected locus, clearing check, and STOP for that requirement | STOP halts all assessment or author edits the reviewed target |
| B32 | All selected checks pass; exceptions are absent | exceptions: none; no T3 fields; PASS and next action reported separately | Require an exception owner/date or HAND-OFF instead of PASS |
| B33 | One obligation has an accepted exception, another is untested and unwaived | Aggregate OPEN; preserve exception and missing evidence separately | Aggregate ACCEPTED-WITH-EXCEPTIONS or PASS from one waiver |
| B34 | Accepted exception plus a different uncovered observed violation | Aggregate STOP takes precedence over OPEN/qualified acceptance | A waiver makes the whole scope accepted |
| B35 | One local logical requirement, no numeric capacity or speed requirement | Compact requirement/enforcement/check/evidence record; logical predicate for bound; no new files | Invent numeric quotas, a cost model, rejected alternatives for unchanged code, or separate ledger documents |
| B36 | High boundary has a separately specified consumer oracle but no subagents | Assess the oracle's independence and coverage; no second agent required | Headcount determines independent closure |
| B37 | Explicit Tiger review of immutable, total, constant-work code with no selected consequence | Explain no applicable constraint; no conformance assessment | PASS from empty selection or invent risks to fill the table |
| B38 | Cache-load review: decoder allocates full unbounded output before enforcing caller's 32 MiB allocation budget | Select allocation/failure/persisted-cache contracts; report late-check violation and a compressed expansion check | "Cache is Medium" permits skipping selected evidence or a size check after allocation proves capacity |
| B39 | Risk owner names no expiry, or governing requirement forbids exceptions | Exception invalid; known violation remains STOP; absent evidence remains OPEN | Accepted exception from an owner name alone |

## Procedure rehearsal prompts

Use the skill and raw input below without supplying this table's expected outcomes to an evaluator.
Keep the exercise read-only. Inspect mode, selected/skipped conditions, work required, and completion axes.
These are semantic desk/rehearsal cases, not executable wording tests or proof of live selection accuracy.

| Case | Raw request / artifact | Coverage |
|---|---|---|
| R1 | Tigerレビューして。ローカルdisk cacheは信頼済み入力から再構築可能で、外部副作用なし。writerは一つ、書き換えはatomic。loaderは隔離されており、失敗は再構築可能なcacheと使い捨ての作業だけを失う。loadの割当予算は32 MiB。decoderは内部上限なく全出力を割り当て、その後にサイズを検査する。コード修正は求めない。 | B26/B31/B38; required selection and read-only completion |
| R2 | Tiger Styleでin-memory queueを設計して。データは元入力から再生成可能、課金・安全上の影響なし。局所失敗は隔離・再実行可能。推定burstは100件。受信payloadは1 KiB以下、受信・queue・in-flight・retryの合計を100件に制限する。入力bufferとmetadataを含む予約総量は200 KiB以下、満杯時は送信元へ拒否を返す。state ownerは一つ、cancel時に枠を解放する。実装はまだない。制限が成立する入力範囲とチェック、次の一手まで。 | B29; design plan vs evidence, no exception ceremony |
| R3 | 同じqueue設計だが、満杯時に拒否するか待つかは未決定。設計レビューを終えて、今の状態と次の作業を返して。 | B30; readiness with unresolved design |
| R4 | 本実装の確認範囲はA/B/C。Aは要求を満たし同じrevision/workloadで独立oracleも通過。Bは既知の違反を担当ownerが期限・補償措置・範囲付きで正式に受容、仕様は例外を許す。Cは未検証で例外なし。総合状態と次の行動を答えて。次にCも同じ対象で合格した場合、さらにAが違反した場合も評価して。riskはHighと確定。 | B20/B33/B34; OPEN → qualified acceptance → STOP |
| R5 | 保持する部品のレビュー。信頼状態の唯一のcopyか、復旧可能か、運転budget内かがまだ不明。わかる範囲をレビューして。 | B28; unresolved consequence without invented tier |
| R6 | 一つの内部状態遷移だけ確認。要求はold generationの完了を拒否すること。immutable snapshot v1と固定workload W1を検査した記録がある。2026-10-13にconsumerがvalid completionの受理とlate completionの拒否を観測した生結果、境界locus、検査commandが提示済み。解釈のownerはqueue担当。状態は失っても元入力から再構築可能で、資源・副作用の損失は既定の使い捨て予算内に隔離。変更・例外・性能要求なし。対象はこの拒否条件だけ。 | B32/B35; compact Medium evidence, no T3 or speed model |

## Incumbent comparison protocol

Freeze the actual pre-edit files as the incumbent; in this repository use jj, not Git commands.
For this procedure revision, compare B26–B39 and relevant earlier cases using the same raw input and each skill version.
Record textual affordances separately from actual fresh-context executions.
Desk review cannot establish task-success gains or installed-trigger reliability.
