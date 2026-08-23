# Dotfiles

知者不惑，仁者不憂，勇者不懼。

> **Dotfiles for the agent era.** One repo configures both my machines (macOS + WSL2) *and* my AI
> coding agents — Claude Code, Codex, Gemini — from a single source, on a shell that refuses to
> destroy files silently. Topic-first: one tool owns one directory; OS differences live inside it.

macOS + WSL2 · one history since 2017 · plain `ln -sfn` symlinks, no templating layer — you can read exactly what links where.

## What makes it different

Most dotfiles configure a shell. Two things here are less usual:

- **Your coding agent is a first-class topic, not an afterthought.** `agents/` sits beside `zsh/`
  and `git/`, and one `mise run link:skills` fans it out from a single source: **Agent Skills** to
  Claude Code (and Codex), **slash-commands** to Claude, Codex, and Gemini, and one `.mcp.json` to
  Claude and Codex. The tree holds a couple dozen authored skills — `forging-skills`, `linting-prose`,
  `systematizing-knowledge`, `operating-the-harness`, … ([full index](agents/skills/)) — plus a dozen
  vendored upstream (Cloudflare's).
  Three narrow **Stop-hook gates** (exit 2) block the agent before it hands you bad work: a
  garbled/mis-serialized tool call, a self-congratulatory "PASS" with no evidence, and accidental
  Japanese/English word-salad in the output.

- **The shell fails loudly, on purpose — because silent success is how an agent corrupts your tree.**
  `cp` / `mv` are guarded functions that **abort with a non-zero exit** when they would overwrite a
  file — they name the conflict and point you at `cpf` / `mvf` to force it. The usual silent
  no-clobber (`cp -n`) exits `0`, fooling a caller — *especially an LLM agent* — into thinking a copy
  happened when the file was dropped. (`rm` is disabled in favor of `rip`, a trashcan `rm`; that half
  is ordinary hygiene — the overwrite guard is the uncommon part.) `ssh` is guarded too, for a
  different failure: a link that dies mid-session never delivers the remote TUI's disable
  sequences, so the terminal keeps reporting input as escapes — mouse motion *and*, separately,
  Kitty-protocol key events — and stays on the alternate screen. The shell re-asserts a
  known-good terminal state before every prompt — by **writing** it
  blind, never by querying the terminal, because a query there can hang the shell. `fixterm` is
  the manual sledgehammer.

## Toolbox

A curated modern-CLI stack, aliased for a terse daily grammar. Run `hhh` for the full annotated
cheat sheet.

| Replaces | Tool | Alias | What you get |
|---|---|---|---|
| `ls` | eza | `l` `ll` `la` | git-aware colorized listing; `lt` tree, `lll` by mtime |
| `cat` | bat | `p` | syntax-highlighted pager |
| `grep` | ripgrep | `gr` | fast, gitignore-aware code search |
| `find` | fd | `f` | intuitive file finder (`ff <ext>` bats the matches) |
| `cd` | zoxide | `,` `,,` | frecency jumping — the comma is the navigation grammar |
| `du` | dust | `du2` | tree-view disk usage by size |
| `ps` | procs | — | colored, searchable process tree (run by name) |
| `diff` | git-delta | `diff` | syntax-highlighted diffs + git pager |
| `Ctrl+R` | atuin | `Ctrl+R` | SQLite-backed searchable history |
| `man` | tldr | `h <cmd>` | example-first help |

Plus: **lazygit** (`lg`, with `Ctrl+A` AI commit messages) · **tmux** (`t2`–`t6` spin up an N-pane
session in one keystroke) · **cross-OS clipboard** (`c`, `pp` = view+copy, `pwdc`; OSC-52 so a copy
over SSH reaches your *local* terminal) · **bun** · **direnv** · **mise** · a linted LaTeX build
(`x` / `xx`).

## Architecture

Topic-first: one tool owns one directory; OS variance lives inside it as `*.mac` / `*.wsl`.

```
~/dotfiles/
├── zsh/         # zshenv (tiny, SSH-safe), zshrc, aliases.zsh (+ IS_MAC/IS_WSL), mac.zsh / wsl.zsh
├── git/         # gitconfig + local.mac / local.wsl (per-OS include)
├── tmux/        # tmux.conf, clipboard.conf, scripts/ (status bar, layouts)
├── herdr/       # config.toml (agent multiplexer; tmux muscle-memory port)
├── sheldon/     # zsh plugin manager (sources only zsh/aliases.zsh)
├── lazygit/     # config.yml + ai-commit.sh
├── cocoindex/   # cocoindex-code settings + the typed repo-search query router
├── bottom/      # btm system monitor — groups same-named processes so swarm leaks are visible
├── topgrade/    # which update steps `mise run up` runs
├── karabiner/   # keyboard remap (macOS only)
├── wsl/         # /etc/wsl.conf system config (WSL only)
├── agents/      # AI-assistant config: claude/ (statusline, hooks, settings), codex/, commands/, skills/
├── scripts/     # plumbing — link-dots.sh (all symlinks), check-tools.sh
├── Brewfile     # every CLI tool (mac casks gated by OS.mac?)
└── mise.toml    # the task runner (no justfile)
```

**Single sources of truth** — each fact has one home, so nothing drifts:

- **Symlinks** → `scripts/link-dots.sh` (OS-aware; a safe mode re-links on every `git pull` via `.githooks/post-merge`).
- **Tools** → `Brewfile` · **Tasks** → `mise.toml` · **Agent + MCP config** → `agents/` and `.mcp.json`.

## Design — the invariants

The rules that keep the repo coherent. The agent-facing operational encoding lives in
[`CLAUDE.md`](CLAUDE.md) (Claude Code) and [`AGENTS.md`](AGENTS.md) (Codex).

1. **Topic-first.** Adding or removing a tool touches exactly one directory plus `scripts/link-dots.sh`.
   No `common` / `mac` / `wsl` bucket directories — OS variance goes *inside* the tool's directory.
2. **Single source of truth.** Each fact has one home (see *Architecture → Single sources of truth*):
   to change it you edit one file, never many.
3. **OS-neutral.** Shell logic branches on `IS_MAC` / `IS_WSL` (computed once in `zsh/aliases.zsh`);
   shared files never hard-code a machine-absolute path.
4. **A quiet `zshenv`.** `zsh/zshenv` stays tiny — zsh reads it on *every* invocation, including
   `ssh host 'cmd'`, so standalone CLIs in `~/.local/bin` work in non-login SSH shells.
5. **Fail loudly, never silently.** `rm` is disabled; `mv` / `cp` abort on overwrite (see above).
6. **No implicit global toolchain.** A managed tool is reachable where a config *declares* it,
   or not at all: no global default version, and no second version manager hooking a login
   shell. mise's two delivery paths stay apart — `mise activate` serves interactive shells
   per-directory; the shim directory serves *only* non-interactive ones (`ssh host 'cmd'`
   never reads `.zshrc`, so it has no other way to reach a declared tool). Merging them puts a
   name like `npm` on every PATH for a tool nothing declared, which then refuses to run.
   Enforced by `mise run test:mise-scope`.

## Setup

### macOS

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
git clone https://github.com/fuyutarow/dotfiles.git ~/dotfiles
cd ~/dotfiles && brew install mise && mise run mac:init
exec zsh
```

### WSL

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
git clone https://github.com/fuyutarow/dotfiles.git ~/dotfiles
cd ~/dotfiles && brew install mise && mise run wsl:init
exec zsh
```

## Tasks

All repo tasks are defined in `mise.toml` (single task runner — no justfile here):

```bash
mise tasks            # list
mise run up           # update everything (topgrade)
mise run link:dots    # (re)create symlinks   — scripts/link-dots.sh
mise run check:tools  # check CLI toolbox     — scripts/check-tools.sh
mise run install:tools  # install toolbox     — Brewfile
mise run link:skills  # deploy agents/ (skills → Claude/Codex, commands → +Gemini)
```
