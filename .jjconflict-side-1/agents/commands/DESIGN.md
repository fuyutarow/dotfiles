---
description: Kiro spec pipeline (stage 2 of /REQUIREMENTS → /DESIGN → /TASKS) — generate .kiro/specs/<slug>/design.md from an APPROVED requirements.md. Emits architecture Mermaid, API/data + migration tables, state/failmode/idempotency, cross-cutting NFRs (security/SLO/observability/rollout), REQ-ID→design traceability, and an APPROVE gate.
disable-model-invocation: true
---

**承認済み requirements.md** に基づく技術設計書を日本語で作成します。
無ければ中止し `/REQUIREMENTS` を促す。

【タスク】`.kiro/specs/<slug>/design.md` を生成（上書き可）:
1) 概要：範囲・前提・決定・却下案（Decision Logを含む）
2) アーキテクチャ（Mermaid）
   - コンポーネント図（入出力/依存）
   - データフロー図
   - 主要ユースケースのシーケンス図
3) API & データ
   - エンドポイント表（URI/メソッド/認可/Req/Res/エラー抽象型）
   - スキーマ変更・マイグレーション（前方/後方互換）
4) 振る舞い & 状態
   - ステートマシン（該当時）
   - フェイルモード/リトライ/冪等性/一貫性
5) 横断要件
   - セキュリティ（認証/認可/秘密管理/PII/脅威）
   - 性能SLO/容量前提、**負荷時の退化戦略**
   - 観測性（ログ/メトリクス/トレース）、Feature Flag、段階ロールアウト/バックアウト
   - アクセシビリティ & i18n（必要時）
6) テスト戦略（**REQ-IDにマッピング**）
   - 単体/結合/E2E、**UI状態（loading/empty/error）**、**レスポンシブ**視点
7) 影響評価 & 計画
   - 変更箇所、互換性、移行手順、切替/戻し手順
8) トレーサビリティ
   - **REQ-ID → 設計要素** 対応表

【品質ゲート】
**NEXT ACTION -> `APPROVE` でタスク化 / `REVISE: ...`**

【ルール】
- 実装はしない。**図と数値**で具体化する。
