
up:
    topgrade --disable containers || echo "Topgrade completed with some errors"

# Productivity tools installation and setup
install-productivity:
    brew install atuin zoxide lazygit
    @echo "✅ Productivity tools installed"
    @echo "🔄 Tools are auto-initialized in aliases.zsh"
    @echo "📖 New aliases available:"
    @echo "   , <dir>  - Smart directory jump (zoxide)"
    @echo "   ,,       - Previous directory"
    @echo "   j        - Just (task runner)"
    @echo "   lg       - Lazygit"
    @echo "   Ctrl+R   - Enhanced history search (atuin)"

cc-install-mcp:
    claude mcp add context7 -- bunx @upstash/context7-mcp@latest # ライブラリドキュメント検索・取得
    claude mcp add sequential-thinking -- bunx @modelcontextprotocol/server-sequential-thinking # 複雑タスクの段階的推論・分析強化
    claude mcp add github -- bunx @modelcontextprotocol/server-github # GitHub API連携（リポジトリ・Issue・PR管理）
    claude mcp add memory -- bunx @modelcontextprotocol/server-memory # セッション間記憶保持・プロジェクト理解継続
    claude mcp add postgres -- bunx @modelcontextprotocol/server-postgres # データベース操作・スキーマ検査
    claude mcp add playwright -- bunx @playwright/mcp@latest # ブラウザ自動化・Web操作
