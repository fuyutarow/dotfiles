# Claude Code Environment Information

This file provides essential context for Claude Code to understand this dotfiles repo and the
user's environment. It is **OS-neutral**: the same repo drives **macOS** and **WSL2 (Ubuntu)**.

## Development Environment

### Operating Systems (dual-target)
- **macOS** (primary at the moment) and **WSL2 Ubuntu** — detect at runtime, never assume one.
- Shell config detects OS **once** via `IS_MAC` / `IS_WSL` (defined at the top of
  `common/aliases.zsh`). Use these booleans for any new OS-dependent logic; do not add new
  inline `uname` / `$OSTYPE` checks.
- **Shell**: zsh with sheldon plugin manager. **Terminal**: iTerm2 (mac) / Windows Terminal (WSL),
  with tmux.
- **Editor**: Cursor (primary), VS Code (fallback) — `e` opens the right one.

### Package Managers
- **System**: Homebrew (both OSes — linuxbrew on WSL). `Brewfile` is the single source of truth.
- **Node.js**: bun (preferred). **Rust**: cargo. **Python**: pip/uv.

## Repo Architecture — responsibility map

```
~/dotfiles/
├── common/              # Shared between OSes (MUST stay machine/OS-agnostic)
│   ├── aliases.zsh      # All common aliases + IS_MAC/IS_WSL detection;
│   │                    #   sources mac|wsl/aliases.zsh at the END (OS file can override)
│   ├── .zshrc           # Shared zsh config ($HOME-relative, existence-guarded only)
│   ├── .gitconfig       # Includes ~/.local-gitconfig (per-OS, linked from mac|wsl/)
│   ├── .tmux.conf
│   └── sheldon/         # Plugin manager config
├── mac/                 # macOS-only: .zprofile, aliases.zsh, .local-gitconfig
├── wsl/                 # WSL-only:   .zprofile, aliases.zsh, .local-gitconfig
├── scripts/             # SINGLE SOURCES OF TRUTH (edit here, not in task runners)
│   ├── link-dots.sh     # All symlink creation (OS-aware)
│   └── check-tools.sh   # Tool-presence check
├── Brewfile             # All CLI tools (mac casks gated by `if OS.mac?`)
├── mise.toml            # THE task runner (justfile retired): mac:init, wsl:init,
│                        #   link-dots, check-tools, install:tools, cc:install-mcp, link:skills
├── commands/            # AI prompts/skills (linked to ~/.claude/commands etc. via link:skills)
├── skills/              # Claude Code skills (e.g. model-julia)
└── karabiner/           # Keyboard customization (macOS)
```

**Conventions to preserve:**
1. `common/` must never contain machine-absolute paths (`/Users/...`, `/home/...`) or
   unguarded OS-specific commands. OS-specific → `mac/` or `wsl/`; machine-specific → guard with
   existence checks.
2. Symlink list lives ONLY in `scripts/link-dots.sh`. Tool list lives ONLY in `Brewfile`
   (+ `scripts/check-tools.sh` for the check). Repo tasks live ONLY in `mise.toml` —
   this repo has NO justfile (retired); never reintroduce one.
3. OS-specific alias files load **after** common ones, so they may override.
4. Startup debug logs are gated: `export DOTFILES_DEBUG=1` to see `[DEBUG]` lines (`_dbg`).

## Setup / Tasks

All repo tasks go through **mise** (`mise tasks` to list):

- **mac bootstrap**: `mise run mac:init` · **WSL bootstrap**: `mise run wsl:init` (see README)
- **Relink dotfiles**: `mise run link-dots` · **Install tools**: `mise run install:tools`
- **Check tools**: `mise run check-tools` · **Update everything**: `mise run up`
- **MCP servers**: `mise run cc:install-mcp`

(`j`/`jl` aliases for `just` remain for OTHER projects' justfiles — not used by this repo.)

## Key Tools & Aliases

### Modern CLI replacements (installed via Brewfile, aliased in common/aliases.zsh)
- `ls` → `eza` (l, ll, la) · `cat` → `bat` (p) · `grep` → `ripgrep` (gr) · `find` → `fd` (f)
- `cd` → `zoxide` (`,` and `,,`) · `du` → `dust` (du2) · `ps` → `procs`
- `rm` → **DISABLED** (function errors out); use `rip` for file removal

### Daily commands
- `lg` lazygit · `j` just · `e` editor · `c`/`cc` clipboard copy · `pp` view+copy
- `o` open · `oo` open current dir (Finder on mac / Explorer on WSL) · `s`/`start` launch app
- `hhh` list custom aliases · `h <cmd>` tldr · `jl` list just tasks
- History: atuin (Ctrl+R)

## Git
- Default branch: **`alpha`** (not main/master)
- Per-OS git config via `[include] ~/.local-gitconfig` (linked from mac/ or wsl/)
- Prefer lazygit (`lg`) for interactive git work

## Safety Rules
- `rm` is permanently disabled in shell config — **always use `rip`** (never suggest raw `rm`).
- `mv`/`cp` are no-clobber by default (`mvf`/`cpf` to force).
- Clipboard is cross-platform (`cc`, `pp`, `pwdc`) with UTF-8/UTF-16 handling for WSL.

## Notes for Claude
1. Check `jl` / `mise tasks` before suggesting manual installs; prefer `brew bundle`.
2. New OS-dependent logic: branch on `$IS_MAC` / `$IS_WSL`, place code in `mac/` / `wsl/`.
3. Never write machine-absolute paths into `common/` (tools like juliaup may try to append
   them to `.zshrc` — fold such blocks back into `$HOME`-relative guarded form).
4. tmux is heavily customized (`common/.tmux.conf`); prefix is Alt+g / Ctrl+g.
5. Language: English for code/comments; Japanese OK in docs and conversation.
