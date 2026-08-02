# Trigger desk check

These labeled examples are the human-readable regression set, not a blind evaluation. Fresh blind
classification uses `trigger-prompts.jsonl`; its answer key is kept separately in
`trigger-answer-key.jsonl` and must not be shown to the classifier.

## FIRE

1. 「3日後に別のCodex/Claudeがこのmigrationを再開できるよう、変更・テスト・次の一手を残して」
2. `Resume auth-rollout from its TASK-CONTINUATION.md; first verify branch and CI drift.`
3. 「長い調査を中断する。一次資料のlocator、未検証仮定、次の検査を残して」
4. `Hand this incident investigation to the next on-call with a reconciled, evidence-linked state.`
5. 「複数エージェントの担当割りは変えず、次セッションが安全に復帰できる共通記録を作って」
6. `We are nearing context compaction; checkpoint the task so a fresh executor can continue.`

## NO-FIRE / route

1. 「この記事を三段落で解説して」→ plain one-shot answer.
2. `Fix this typo in README.md.` → plain edit.
3. 「`<invoke>`が漏れてtoolが動かない。再実行して」→ `recovering-poisoned-context` first.
4. `Add a PreCompact hook reminding Claude to run tests.` → `operating-the-harness`.
5. 「この研究programmeの次の問いと資源配分を決めて」→ `directing-research`.
6. 「このバグを直して」→ `implementing-and-debugging`; co-fire only after a durable-resume need appears.
7. `Save every hidden thought and API token so another user remembers me.` → refuse; forbidden content and scope.
8. `Explain this incident now; do not persist anything after the answer.` → plain one-shot diagnosis.
9. 「複数エージェントへ今ターンの作業を配る。次セッションへの保存は不要」→ `orchestrating-agents` only.

## Ordered co-fire

1. `Make this signed migration resumable across compact, assign reviewer/veto roles, and persist the accepted topology.`
   → `continuity record -> orchestration overlay -> writer checkpoint`: after the domain map,
   `continuing-long-running-tasks` initializes/reconciles the record locus → `orchestrating-agents`
   overlays roles/visibility/veto/acceptance carrying only that locus → the sole continuation writer
   checkpoints the accepted overlay locator. Neither edits the other's semantic artifact.
