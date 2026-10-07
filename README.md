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
  is ordinary hygiene — the overwrite guard is the uncommon part.) `git checkout` is disabled the
  same way, for the reason it was split upstream: one verb does branch-switch, file-restore, and
  branch-creation duty at once, so a typo does something else plausible instead of erroring — the
  guard names which one you meant and points at `git switch` or `git restore`. `ssh` is guarded too, for a
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
├── tools/       # repo CLIs, one directory each (package.json with semver, CHANGELOG.md, src/, tests/); may import only its own dir and tools/shared/
│   ├── rr/          # rr (= repo-retrieve): declared query-shape router over ccc / rg / Serena; src/ (CLI, ccc adapters, python helpers), retrieval.toml, tests/
│   ├── smart-open/  # smart-open (`o`/`oo`, git/jj `o`): over ssh/herdr a URL → the client you sit at, a path → its VS Code Remote-SSH; else here; src/receive.ts + launchd plist on mac
│   ├── agent-dispatch/ # agent-dispatch / one-release agent-router alias and codex-run (Jev-selected worker routing; state stays in ~/.local/state/agent-router)
│   └── shared/      # code several tools import (zod, attempt, narrow, typesafe-key, sockets, model-orders, worker-env)
├── jj/          # config.toml — Jujutsu user config for every repo (identity, trunk() = alpha, snapshot cap)
├── tmux/        # tmux.conf, clipboard.conf, scripts/ (status bar, layouts)
├── herdr/       # config.toml (agent multiplexer; tmux muscle-memory port)
├── sheldon/     # zsh plugin manager (sources only zsh/aliases.zsh)
├── lazygit/     # config.yml + ai-commit.sh
├── cocoindex/   # cocoindex-code (ccc) settings + its capped daemon unit
├── android/     # Pixel LINE vibration policy: ADB audit/apply script and one-time UI recipe
├── bottom/      # btm system monitor — groups same-named processes so swarm leaks are visible
├── topgrade/    # which update steps `mise run up` runs
├── karabiner/   # keyboard remap (macOS only)
├── macos/       # declarative `defaults write` system settings (macOS only, defaults.ts)
├── iterm2/      # terminal prefs, synced via iTerm2's own custom-folder mechanism (macOS only)
├── edge/        # Microsoft Edge managed policy (macOS only): blocklist + pinned default search; COPIED with sudo by `mise run edge:policy`, checked by doctor
├── wsl/         # /etc/wsl.conf system config (WSL only)
├── agents/      # AI-assistant config: claude/ (statusline, hooks, settings), codex/, commands/, skills/,
│                #   hooks/ (vendor-neutral hooks: hooks.toml wires them into Claude AND Codex),
│                #   and shared agent assets (commands/, skills/); repo-retrieve lives in tools/rr/ and
│                #   agent-resource-run and serena-foreground live in tools/
├── tools/       # repo CLIs (rr, agent-resource-run, serena-foreground, smart-open) + shared TS modules
├── scripts/     # plumbing — config-registry.ts (every config surface), link-dots.ts (deploys it), check-tools.sh
├── Brewfile     # every CLI tool (mac casks gated by OS.mac?)
└── mise.toml    # the task runner (no justfile)
```

**Single sources of truth** — each fact has one home, so nothing drifts:

- **Every configuration surface** → `scripts/config-registry.ts`: for each one its source, how it
  reaches the machine (link, rendered, tool-owned, applied, in-place, machine-local), its consumer,
  its one writer and its verifier. `mise run config:map` prints it; `mise run lint:config-map` fails
  on a config file in no row. The deploy code reads the same tables.
- **Symlinks** → the registry's `LINKS`, realized by `scripts/link-dots.ts` (OS-aware; a safe mode re-links on every `git pull` via `.githooks/post-merge`).
- **Rendered `$HOME` files** → `scripts/render-home.ts` (called by link-dots; checked by `mise run doctor`). See invariant 8.
- **Tools** → `Brewfile` · **Tasks** → `mise.toml` · **Agent + MCP config** → `agents/` and `.mcp.json`.

## Design — the invariants

The rules that keep the repo coherent. The agent-facing operational encoding lives in
[`CLAUDE.md`](CLAUDE.md) (Claude Code) and [`AGENTS.md`](AGENTS.md) (Codex).

1. **Topic-first.** Adding or removing a tool touches exactly one directory plus `scripts/config-registry.ts`.
   No `common` / `mac` / `wsl` bucket directories — OS variance goes *inside* the tool's directory.
2. **Single source of truth.** Each fact has one home (see *Architecture → Single sources of truth*):
   to change it you edit one file, never many.
3. **OS-neutral.** Shell logic branches on `IS_MAC` / `IS_WSL` (computed once in `zsh/aliases.zsh`);
   shared files never hard-code a machine-absolute path.
4. **A quiet `zshenv`.** `zsh/zshenv` stays tiny — zsh reads it on *every* invocation, including
   `ssh host 'cmd'`, so user CLIs in `~/.local/bin` and bun's global bins in `~/.bun/bin`
   (this repo's own `bin` commands) work in non-login SSH shells.
5. **Fail loudly, never silently.** `rm` is disabled; `mv` / `cp` abort on overwrite (see above).
6. **No implicit global toolchain.** A managed tool is reachable where a config *declares* it,
   or not at all: no global default version, and no second version manager hooking a login
   shell. mise's two delivery paths stay apart — `mise activate` serves interactive shells
   per-directory; the shim directory serves *only* non-interactive ones (`ssh host 'cmd'`
   never reads `.zshrc`, so it has no other way to reach a declared tool). Merging them puts a
   name like `npm` on every PATH for a tool nothing declared, which then refuses to run.
   Enforced by `mise run test:mise-scope`.
7. **Core dev utilities, everywhere, at once; experiments belong to the repo.** On any machine —
   the Mac, R99, a rented GPU box, a fresh VM — dotfiles' job is to make the core dev utilities
   (brew, herdr, mise, jj, gh, the shell and its aliases, the search/VCS CLIs — `Brewfile.core` — Rust's cargo, and the agent CLIs Claude Code, Codex and Antigravity's agy)
   usable immediately, reachable with `herdr --remote`. It is not a portable container image, and
   it never builds an experiment environment: Julia, CUDA, Python and their versions are each
   repo's `mise.toml` (`mise install` in that repo). A machine where an alias is missing is a
   dotfiles bug, not a property of the machine. Entry points: *Setup* below.
8. **Data flows one way; every file has one writer.** declaration (the repo, hand-written) →
   render (`mise run link:dots`) → deployed (`$HOME`, never edited) → runtime. Nothing flows
   back as data; the only way back is a check (`mise run doctor`, `link:dots --check`).
   - A deployed path is a **link** when it is one declaration verbatim, and **rendered** when it
     is a function of several (`scripts/render-home.ts`: `~/.claude/settings.json` = base +
     private overlay + `zsh/timezone` + the hook registry; `~/.codex/hooks.json`;
     `~/.claude/CLAUDE.md` = template + dispatch roster). A generator never writes INTO a
     hand-written file — `mise run lint:one-writer` fails on registry hooks in a committed vendor
     file or a rendered roster in the CLAUDE.md template.
   - A file a tool rewrites on command is **tool-owned**: a real machine-local file, never a link
     into the repo, with the repo's half in a path the tool only reads (`~/.gitconfig` beside the
     linked `~/.config/git/config`; jj's `config.toml` beside the linked `conf.d/dotfiles.toml`).
     Measured 2026-10-06: through a link, `git config --global` and `jj config set --user` both
     rewrote the repo. Third-party fetches run in a throwaway HOME and are imported explicitly
     (`mise run skills:add`).
   - A value has one home: the zone name is `zsh/timezone`, read by zshenv/bashrc, rendered into
     Claude Code's `env.TZ`, and expected by `doctor:remote`.
   - Remaining human-driven write-through, by design: `sheldon add` (edits `sheldon/plugins.toml`,
     measured) and Karabiner's GUI (macOS) are the owner editing the declaration through a tool.

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

### Throwaway Linux box (rented GPU, fresh VM, container)

dotfiles gives such a box the **core dev utilities** only — `Brewfile.core` (shell, search, VCS,
herdr, mise …) as prebuilt releases via mise, root or not, plus the agent CLIs and the dotfile
links — so it is usable at once and reachable with `herdr --remote`. Verify it from your machine with
`mise run doctor:remote -- <alias>`. It does **not** build experiment environments: Julia, CUDA, Python
and their versions belong to each repo's `mise.toml` (`mise install` inside that repo).

```bash
# as root on the box (one line; creates user fuyu, then runs `mise run linux:init` as that user)
curl -fsSL https://raw.githubusercontent.com/fuyutarow/dotfiles/alpha/scripts/bootstrap-linux.sh | bash
# from the Mac: a Host block in ~/.ssh/config.local (never this repo) — `Host <alias> <alias>-code`
# plus `Tag smart-open`, so `o`/`oo` there open on the Mac — then
herdr --remote <alias>
```

Renting, choosing and destroying a GPU box (Vast.ai) is the `renting-cloud-gpus` skill.

## Tasks

All repo tasks are defined in `mise.toml` (single task runner — no justfile here):

```bash
mise tasks            # list
mise run up           # update everything (topgrade)
mise run link:dots    # (re)create symlinks   — scripts/link-dots.ts
mise run tools:audit  # audit CLI toolbox     — scripts/check-tools.sh
mise run doctor       # does this machine realize the repo? (read-only) — scripts/doctor.ts
mise run install:tools  # install toolbox     — Brewfile
mise run link:skills  # deploy agents/ (skills → Claude/Codex, commands → +Gemini)
```
