# Claude Code Environment Information

This file provides essential context for Claude Code to understand your development environment and preferences.

## Development Environment

### Operating System
- **Platform**: WSL2 (Ubuntu on Windows)
- **Primary Shell**: zsh with sheldon plugin manager
- **Terminal**: Windows Terminal with tmux sessions
- **Editor**: Cursor (primary), VS Code (fallback)

### Package Managers
- **System**: apt (Ubuntu), brew (Homebrew on Linux)
- **Node.js**: bun (preferred), npm (fallback)
- **Rust**: cargo
- **Python**: pip

### Key Tools & Preferences

#### Modern CLI Replacements (all installed and aliased)
- `ls` → `eza` (aliases: l, ll, la, lll, lt)
- `cat` → `bat` (alias: p)
- `grep` → `ripgrep` (aliases: gr, grr, gv, gl)
- `find` → `fd` (alias: f)
- `cd` → `zoxide` (aliases: , and ,,)
- `du` → `dust` (alias: du2)
- `ps` → `procs`
- `rm` → `rip` (rm is DISABLED for safety)

#### Development Tools
- **Git TUI**: lazygit (alias: lg)
- **Task Runner**: just (alias: j)
- **Directory Navigation**: zoxide + custom commad system
- **History Management**: atuin (Ctrl+R integration)
- **File Viewer**: bat with syntax highlighting

#### tmux Configuration
- **Prefix Keys**: Alt+g (primary), Ctrl+g (secondary)
- **Japanese Input Support**: Full-width character bindings
- **Mouse Support**: Enabled with right-click context menus
- **Status Bar**: Custom system monitor with colored indicators
- **Window Naming**: Auto-detection of project names from package.json, Cargo.toml, etc.

## Project Structure

```
~/dotfiles/
├── common/              # Shared configurations
│   ├── aliases.zsh      # 700+ lines of modern CLI aliases and functions
│   ├── .tmux.conf       # Comprehensive tmux configuration
│   └── sheldon/         # Zsh plugin management
├── wsl/                 # WSL-specific files
├── karabiner/           # Keyboard customization (unused in WSL)
├── justfile             # Main task runner
├── tmux-*.sh           # Custom tmux scripts
└── CLAUDE.md           # This file
```

## Command Conventions

### Navigation
- `, <path>` - Smart directory jump with zoxide
- `,,` - Previous directory
- `,d <subdir>` - Jump to ~/dotfiles/<subdir>
- `,p <subdir>` - Jump to ~/projects/<subdir>

### File Operations
- `p <file>` - View file with bat (syntax highlighted)
- `pp <file>` - View file and copy to clipboard
- `f <pattern>` - Find files with fd
- `gr <pattern>` - Search in files with ripgrep

### Development
- `j` - Run just commands (check justfile)
- `lg` - Launch lazygit
- `e` - Open editor (cursor for Git repos, code otherwise)
- `c` - Claude Code CLI
- `cc` - Copy to clipboard (cross-platform)

### Help & Discovery
- `hhh` - Show all custom aliases and their descriptions
- `h <command>` - Better man pages with tldr
- `jl` - List available just commands

## Safety Features

### Disabled Commands
- `rm` - Permanently disabled, must use `rip` for file removal
- Standard commands show warnings when modern alternatives are available

### Clipboard Integration
- Cross-platform clipboard support (WSL ↔ Windows)
- UTF-8 encoding handling for Japanese text
- Commands: `cc`, `pwdc`, `pp`

## Git Configuration

- Default branch: `alpha` (not main/master)
- Automatic project detection in tmux windows
- Branch status indicators: `*` (uncommitted), `+` (untracked), `↑` (unpushed), `↓` (unpulled)

## Task Management

### Available Just Commands
- `just up` - System update with topgrade
- `just install-productivity` - Install atuin, zoxide, lazygit
- `just cc-install-mcp` - Install Claude MCP servers

### Recommended Workflow
1. Use `lg` for all Git operations (lazygit TUI)
2. Navigate with `, <path>` instead of cd
3. Use `j` for project-specific tasks
4. Check `jl` for available commands
5. Use `hhh` to discover aliases

## Language Preferences

- **Primary**: English for code and comments
- **Secondary**: Japanese support enabled in tmux and clipboard
- **Encoding**: UTF-8 with proper WSL integration

## Notes for Claude

1. **Always check `jl`** to see available just commands before suggesting manual installation
2. **Use modern CLI tools** - they're all aliased and preferred over standard Unix tools
3. **tmux is heavily customized** - reference .tmux.conf for advanced features
4. **Safety first** - rm is disabled, use rip for file removal
5. **Clipboard integration works** - use `cc` or `pp` commands for copying
6. **zoxide is primary navigation** - use `, <path>` instead of cd

## Testing & Development

- **Preferred test runner**: Check package.json or justfile for project-specific commands
- **Build systems**: Cargo for Rust, bun for Node.js, just for multi-language projects
- **Linting**: Usually `bun run lint` or `cargo clippy` - check project files first

This environment prioritizes safety, modern tooling, and efficient workflows. When in doubt, use `hhh` for help or `jl` for available tasks.