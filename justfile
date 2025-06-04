
up:
    topgrade --disable containers || echo "Topgrade completed with some errors"

cc-install-mcp:
    claude mcp add context7 -- bunx @upstash/context7-mcp@latest # ライブラリドキュメント検索・取得
    claude mcp add sequential-thinking -- bunx @modelcontextprotocol/server-sequential-thinking # 複雑タスクの段階的推論・分析強化
    claude mcp add github -- bunx @modelcontextprotocol/server-github # GitHub API連携（リポジトリ・Issue・PR管理）
    claude mcp add memory -- bunx @modelcontextprotocol/server-memory # セッション間記憶保持・プロジェクト理解継続
    claude mcp add postgres -- bunx @modelcontextprotocol/server-postgres # データベース操作・スキーマ検査
    claude mcp add playwright -- bunx @playwright/mcp@latest # ブラウザ自動化・Web操作
