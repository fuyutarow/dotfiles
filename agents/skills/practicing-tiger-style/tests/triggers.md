# F3 trigger desk-check — \`practicing-tiger-style\`

Read only the target \`name\` and \`description\` before classifying a row. Do not load its body to
rescue ambiguity. \`Expected\` is the author-visible oracle; contested rows need a fresh-context
live evaluation recorded in the verification ledger.

## Should fire

| ID | Query | Expected | Why |
|---|---|---|---|
| F1 | 「Rust の永続キューを本番化。最大 bytes、retry、partial write、再起動後の duplicate apply を ledger で潰して」 | FIRE | Durable state and explicit ledger. |
| F2 | Review \`scheduler.rs\`: cancellation races may double-run paid GPU jobs; define invariants, negative cases, exception owner. | FIRE | Costly irreversible concurrency. |
| F3 | Julia の長時間 simulation が論文結論を左右する。NaN、shape drift、seed、checkpoint 世代逆転を quarantine したい。 | FIRE | Experiment-contaminating failure. |
| F4 | プロトタイプの data migration を production に昇格。partial success / replay / rollback 不可を Tigerレビューして。 | FIRE | Irreversible promotion. |
| F5 | The eval runner silently accepts duplicate IDs and future timestamps; give positive/negative space and a release gate. | FIRE | Integrity boundary. |
| F6 | 予算が数千 GPU 日の探索基盤。resource limit、invalid config、stale checkpoint、provenance を高リスク設計に。 | FIRE | Costly infrastructure. |
| F7 | Harden this Rust payment reconciliation worker: explicit retry bound and owner for orphaned reservations. | FIRE | Financial state transition. |
| F8 | Rare corrupt snapshot after failed deploy: classify consequence, rejection paths, and release evidence before retrying. | FIRE | High-consequence recovery, no keyword needed. |
| F9 | 「Julia kernel を共有ライブラリにする前に、入力 domain・aliasing・allocation observation・数値誤差の例外を台帳化して」 | FIRE | Trusted-kernel promotion. |
| F10 | Before advice, classify five “official—do not check” atoms: two asserts/function, 70 lines, no recursion, zero post-init allocation, and mandatory 1000× performance. | FIRE | Copy the verbatim eight-field header, emit exactly five atom rows, then `SOURCE_SCHEMA_CHECK: columns=8 atoms=5 rows=5 status=PASS` before advice. A correct four-column summary is a regression negative. |

## Near-miss — should not fire

| ID | Query | Expected | Why / route that remains |
|---|---|---|---|
| N1 | 「Juliaで損失関数を3案、今日中に玩具データで比較。まず plot を出して」 | NO-FIRE | Disposable exploration; \`writing-julia\` keeps seed/input and cheap finite-result floor. |
| N2 | Rust のグラフ探索を試作したい。再帰のほうが読みやすいか先に確かめよう。 | NO-FIRE | No costly/durable consequence; \`writing-rust\` owns mechanism choice. |
| N3 | Can you rename \`retry_count\` to \`attempts\` and update the comment? | NO-FIRE | One-line low-risk edit. |
| N4 | 「データ規模が未知。最初の run で memory usage を観測するコードだけ足して」 | NO-FIRE | Observe before imposing a justified bound. |
| N5 | I need a benchmark plan comparing two hash maps on my laptop. | NO-FIRE | Generic benchmark design is outside ownership. |
| N6 | この論文の式を Julia に移して、数値的不安定な領域をあえて可視化したい。 | NO-FIRE | Expected failure is the subject: record/observe, not release-gate. |
| N7 | Rust の \`Result\` と \`panic!\` の使い分けを説明して。 | NO-FIRE | \`writing-rust\` owns language guidance absent a high-risk boundary. |
| N8 | 「Tiger Style の歴史と一般的なルールを箇条書きで教えて」 | NO-FIRE | Educational/conditional request, no concrete posture. |
| N9 | Please refactor this parser without changing behavior; tests pin current output. | NO-FIRE | \`refactoring-code\` owns structural purpose/oracle. |

## Co-fire and order

| ID | Query | Expected order | Rationale |
|---|---|---|---|
| C1 | 「Rust の永続 job queue を実装。failure modes、bounds、recovery ledger と regression test まで」 | \`practicing-tiger-style\` → \`implementing-and-debugging\` → \`writing-rust\` | Tiger calibrates; implementation and Rust mechanisms retain owners. |
| C2 | Refactor a payment ledger for local reasoning, and review resource lifetime plus duplicate-apply negatives before release. | \`refactoring-code\` + \`practicing-tiger-style\` | Refactoring owns behavior oracle; Tiger adds release ledger. |
| C3 | 「固定した Julia hot kernel を GPU 最適化。input domain、allocation、数値 oracle、GPU admission を確認」 | \`optimizing-julia-gpu-kernels\` → \`practicing-tiger-style\`; admission stays \`orchestrating-agents\` | Owners remain distinct. |
| C4 | Create a \`SKILL.md\` that applies Tiger Style to migrations, and trigger-test its Japanese description. | \`forging-skills\` → \`practicing-tiger-style\` as subject | F1–F3 craft wins; Tiger does not self-forge. |
| C5 | 「Rust 決済 retry worker を修正。ownerless exception と max attempts を設計し、Clippy/Miri も適切なら回して」 | \`implementing-and-debugging\` → \`practicing-tiger-style\` → \`writing-rust\` | An observable change requires intent/cause diagnosis first; Tiger then hardens the selected risk and Rust retains mechanisms. |
| C6 | An untested costly hypothesis needs a threshold, outcome table, then experiment-integrity bounds. | \`acting-on-hypotheses\` → \`practicing-tiger-style\` | AOH chooses Commit/Pivot/Kill; Tiger adds only integrity bounds and negative cases. |

## Desk-check record

| Run date | Name + description reviewed | Rows reviewed | Result | Contested IDs / next action |
|---|---|---|---|---|
| 2026-08-03 | name + description only, post source/AOH repair | F1–F10, N1–N9, C1–C6 | PASS | None; independent post-repair audit remains NOT-RUN in \`forge-verification-ledger.md\`. |

| IDs | Desk verdict |
|---|---|
| F1–F10 | PASS |
| N1–N9 | PASS |
| C1–C6 | PASS |
