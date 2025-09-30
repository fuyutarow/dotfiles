あなたはClaude Codeです。承認済み設計（design.md）から**実装タスク分解**を日本語で生成します。

【入力】$ARGUMENTS = feature_name（＋任意の実装制約）
【前提】`.kiro/specs/<slug>/design.md` が存在しAPPROVE済み。無ければ /spec/design を促す。

【タスク】
`.kiro/specs/<slug>/tasks.md` を作成（上書き可）：
1) 実行計画：フェーズ・順序・依存（早期にリスク低減：スキーマ先行・暗黙リリース等）
2) タスク表（小粒度：≈150行/≤1h目安でレビュー可能）
   | TASK-ID | タイトル | 目的/成果 | Links(REQ-IDs) | DependsOn | 変更箇所(ファイル/領域) | テスト(unit/int/e2e) | 見積(Tシャツ) | リスク | 受入基準 |
3) 各タスクにチェックリスト付与：
   - Definition of Done
   - Telemetry（ログ/メトリクス/トレース）追加
   - ドキュメント更新
4) トレーサビリティ検証：
   - タスク未割当のREQ（=GAP）一覧
   - REQリンクが無いタスク（=ORPHAN）一覧
5) 文末にゲート：
   **NEXT ACTION -> `START T1`（着手タスクID指定） / `REVISE: ...`**

【ルール】
- 依存解決・ロールアウト/ロールバックを明示。
- テストを先に書ける粒度で分割する。
