# Claude Code Environment Information

This file provides essential context for Claude Code to understand this dotfiles repo and the
user's environment. It is **OS-neutral**: the same repo drives **macOS** and **WSL2 (Ubuntu)**.

> The human-facing map and rationale live in `README` — **Architecture** (the annotated topic
> tree) and **Design — the invariants** (why the repo is shaped this way). This file is the
> agent-facing operational encoding; treat those README sections as canonical and keep them in sync.

## Development Environment

### Operating Systems (dual-target)
- **macOS** (primary at the moment) and **WSL2 Ubuntu** — detect at runtime, never assume one.
- Shell config detects OS **once** via `IS_MAC` / `IS_WSL` (defined at the top of
  `zsh/aliases.zsh`). Use these booleans for any new OS-dependent logic; do not add new
  inline `uname` / `$OSTYPE` checks.
- **Shell**: zsh with sheldon plugin manager. **Terminal**: iTerm2 (mac) / Windows Terminal (WSL),
  with tmux.
- **Editor**: Cursor (primary), VS Code (fallback) — `e` opens the right one.

### Package Managers
- **System**: Homebrew (both OSes — linuxbrew on WSL). `Brewfile` is the single source of truth.
- **Node.js**: bun (preferred). **Rust**: cargo. **Python**: pip/uv.

## Repo Architecture — topic-first, one tool = one directory

The annotated topic tree (every directory + what it holds + how it deploys) is the canonical
**README → Architecture**; do not duplicate it here. Topics (one tool = one directory):
`zsh git tmux sheldon lazygit cocoindex topgrade agents` (both OSes), `karabiner` (mac), `wsl` (WSL).
Plumbing / single sources of truth: `scripts/link-dots.sh` (all symlinks, OS-aware),
`scripts/check-tools.sh`, `Brewfile` (tools), `mise.toml` (tasks, justfile retired), `.mcp.json` (MCP).
OS variance of a cross-OS tool lives INSIDE its topic dir as `*.mac` / `*.wsl` (or `mac.zsh` / `wsl.zsh`).

**Conventions to preserve:**
1. **Topic-first**: adding/removing a tool touches exactly ONE directory + `scripts/link-dots.sh`.
   Never recreate `common`/`mac`/`wsl` as OS-variance *bucket* dirs — OS variance of a
   cross-OS tool lives INSIDE that tool's topic dir as `*.mac` / `*.wsl` (or `mac.zsh` /
   `wsl.zsh`) files. A genuinely single-OS *topic* may still own its dir (e.g. `karabiner/`
   for macOS, `wsl/` for the `wsl.conf` system config) — those are tools, not OS buckets.
2. Shared files must never contain machine-absolute paths (`/Users/...`, `/home/...`) or
   unguarded OS-specific commands; branch on `$IS_MAC` / `$IS_WSL`, guard with existence checks.
3. Symlink list lives ONLY in `scripts/link-dots.sh`. Tool list lives ONLY in `Brewfile`
   (+ `scripts/check-tools.sh` for the check). Repo tasks live ONLY in `mise.toml` —
   this repo has NO justfile (retired); never reintroduce one.
4. `zsh/mac.zsh` / `zsh/wsl.zsh` load **after** the common aliases, so they may override.
   sheldon sources ONLY `zsh/aliases.zsh` (never `*.zsh` glob — OS files are conditional).
5. `zsh/zshenv` is deliberately tiny and quiet because zsh reads it for **every** invocation,
   including `ssh host 'cmd'`. It exists so standalone user CLIs in `~/.local/bin` (notably
   Codex remote bootstrap) work in non-login SSH command shells. Do not put Homebrew shellenv,
   plugins, prompts, completions, or anything that can print/hang there.
6. Startup debug logs are gated: `export DOTFILES_DEBUG=1` to see `[DEBUG]` lines (`_dbg`).
7. **Skill naming** (`agents/skills/<name>/SKILL.md`): dir name **=** frontmatter `name:`, and
   ALL skills use one consistent shape — the official-recommended **gerund** form
   `<verb-ing>-<object>` describing the activity the skill provides (`writing-julia`,
   `compiling-latex`, `running-python-tools`, `securing-remote-access`, `systematizing-knowledge`,
   `operating-the-harness`). Hard rules: lowercase/numbers/hyphens only, ≤64 chars, and the name
   **must not contain the reserved words `claude`/`anthropic`** (why `operating-the-harness`, not
   `claude-code`). Keep tool names and trigger keywords in `description:` (3rd person, "what + when")
   — that field, with the name, is what the model matches on. Don't mix naming shapes across the
   collection (inconsistency is the documented anti-pattern). Ref: docs.claude.com Agent Skills →
   best-practices. The full CRAFT of creating/reforging skills (gates, pipeline, trigger test
   sets, verification fleet) is the `forging-skills` skill — read it before any skill work.

## Setup / Tasks

All repo tasks go through **mise** (`mise tasks` to list):

- **mac bootstrap**: `mise run mac:init` · **WSL bootstrap**: `mise run wsl:init` (see README)
- **Relink dotfiles**: `mise run link-dots` · **Install tools**: `mise run install:tools`
- **Check tools**: `mise run check-tools` · **Update everything**: `mise run up`
- **MCP servers**: `mise run cc:install-mcp`

(`j`/`jl` aliases for `just` remain for OTHER projects' justfiles — not used by this repo.)

## Key Tools & Aliases

### Modern CLI replacements (installed via Brewfile, aliased in zsh/aliases.zsh)
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
- Per-OS git config via `[include] ~/.local-gitconfig` (linked from `git/local.mac` or `git/local.wsl`)
- Prefer lazygit (`lg`) for interactive git work

## Safety Rules
- `rm` is permanently disabled in shell config — **always use `rip`** (never suggest raw `rm`).
- `mv`/`cp` are shell **functions** that **refuse loudly and abort (exit 1)** when they would
  overwrite an existing path — they print the conflict and tell you to re-run with `mvf`/`cpf`
  (= `command mv`/`command cp`, force-overwrite). This replaces the old *silent* no-clobber skip
  (`-n` / `--update=none`) that exited 0 and fooled callers (esp. agents) into thinking a
  copy/move succeeded when it was dropped. Mirrors `rm`→`rip`; OS-agnostic (same on BSD/GNU).
  When you *intend* to overwrite (incl. in scripts), call `cpf`/`mvf` — a bare `cp`/`mv` won't.
- Clipboard is cross-platform (`cc`, `pp`, `pwdc`) with UTF-8/UTF-16 handling for WSL.

## Notes for Claude
1. Check `jl` / `mise tasks` before suggesting manual installs; prefer `brew bundle`.
2. New OS-dependent logic: branch on `$IS_MAC` / `$IS_WSL`; OS-only files go INSIDE the
   topic dir as `*.mac` / `*.wsl` (e.g. `zsh/mac.zsh`, `git/local.wsl`).
3. Never write machine-absolute paths into shared files (`zsh/`, `git/`, `tmux/`) (tools like juliaup may try to append
   them to `.zshrc` — fold such blocks back into `$HOME`-relative guarded form).
4. tmux is heavily customized (`tmux/tmux.conf`); prefix is Alt+g / Ctrl+g.
5. Language: English for code/comments; Japanese OK in docs and conversation.
