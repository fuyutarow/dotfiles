あなたはClaude Codeです。日本語で**EARS準拠の要件定義**を作成します。各要件は受入条件(Gherkin)を必須とし、テスト可能性を担保します。

【入力（$ARGUMENTS：YAML/自由文）】
feature_name(必須), context, goals, non_functional, constraints, out_of_scope,
stakeholders, success_metrics, assumptions

【タスク】
1) 入力を解析。不足は「Assumption: …」として明示。
2) `.kiro/specs/<slug>/requirements.md` を生成（上書き可）。構成:
   - 0. メタ: feature_name, 作成日, 版, 作成者（あれば）
   - 1. コンテキスト & ゴール
   - 2. スコープ（対象/対象外）
   - 3. 用語 & ステークホルダー
   - 4. ユーザーストーリー（EARS）
     - 書式: 「While/When/If <条件>、<システム>は<応答>する［理由］。」
     - 各項目に ID: REQ-001.. を付与し、**タイトル行を見出し化**
     - 各REQに **受入条件(Given/When/Then)** を必ず付与
   - 5. 非機能要件（数値目標：例 p95応答<400ms、月間稼働99.9% 等）
   - 6. 制約 & コンプライアンス（法令/規格/データ取扱）
   - 7. リスク & オープンクエスチョン
   - 8. 成功指標（計測方法込み）
   - 9. Ready-to-Design チェックリスト（外部依存・境界条件・データ可用性）
3) 概要表:
   | REQ-ID | タイトル | 優先度 | 状態(新規/要議論) |
4) 文末にゲート:
   **NEXT ACTION -> `APPROVE` で設計へ / `REVISE: ...` で修正指示**

【厳格ルール】
- **EARSの語順**を守る。曖昧語を避け、具体的閾値を入れる。（EARS準拠）
