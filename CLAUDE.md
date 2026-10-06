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
- **Editor**: VS Code — `e` / `ee` open it (on WSL via the Remote-WSL launcher, see `zsh/zprofile.wsl`).
  Cursor was retired 2026-07-14; do not reintroduce it.

### Package Managers
- **System**: Homebrew (both OSes — linuxbrew on WSL). `Brewfile` is the single source of truth.
- **Node.js**: bun (preferred). **Rust**: cargo. **Python**: pip/uv.

## Repo Architecture — topic-first, one tool = one directory

The annotated topic tree (every directory + what it holds + how it deploys) is the canonical
**README → Architecture**; do not duplicate it here. Topics (one tool = one directory):
`zsh git jj tmux herdr sheldon lazygit cocoindex topgrade agents` (both OSes), `karabiner` `macos` `iterm2` `edge` (mac), `wsl` (WSL).
Repo CLIs live under `tools/<name>/` (own `package.json` semver, `CHANGELOG.md`, `src/`, `tests/`; may import only
their own dir and `tools/shared/`): `tools/smart-open` (both OSes), `tools/shared` (code several tools import).
Plumbing / single sources of truth: `scripts/config-registry.ts` (EVERY config surface — source,
deploy kind, consumer, writer, verifier; `mise run config:map` prints it, `lint:config-map` fails on
a config file in no row), `scripts/link-dots.ts` (realizes its links, OS-aware),
`scripts/check-tools.sh`, `Brewfile` (tools), `mise.toml` (tasks, justfile retired), `.mcp.json` (MCP).
OS variance of a cross-OS tool lives INSIDE its topic dir as `*.mac` / `*.wsl` / `*.win` (or `mac.zsh` / `wsl.zsh`).
`*.win` = the Windows HOST under WSL (read by Windows, so copied, never symlinked).

**Conventions to preserve:**
1. **Topic-first**: adding/removing a tool touches exactly ONE directory + `scripts/config-registry.ts`.
   Never recreate `common`/`mac`/`wsl` as OS-variance *bucket* dirs — OS variance of a
   cross-OS tool lives INSIDE that tool's topic dir as `*.mac` / `*.wsl` / `*.win` (or
   `mac.zsh` / `wsl.zsh`) files. `*.win` is the third target: the Windows HOST underneath WSL
   (`wsl/wslconfig.win`, `wsl/winget.win.json`) — Windows reads it, so it is COPIED by a
   `wsl:*` task, never symlinked. A genuinely single-OS *topic* may still own its dir (e.g.
   `karabiner/` for macOS, `wsl/` for the `wsl.conf` system config) — those are tools, not OS
   buckets.
2. Shared files must never contain machine-absolute paths (`/Users/...`, `/home/...`) or
   unguarded OS-specific commands; branch on `$IS_MAC` / `$IS_WSL`, guard with existence checks.
3. Symlinks have exactly TWO homes, split by fan-out shape: dotfiles → `LINKS` in
   `scripts/config-registry.ts` (realized by `scripts/link-dots.ts`)
   (one source → one destination); `agents/` → `mise.toml`'s `link:skills` (one source → N AI
   tools). Both PRUNE links into this repo that no longer resolve, so a rename cannot leave a
   phantom skill or a dead hook link behind. **PATH commands are neither**: a repo CLI that
   should be callable by name (`agent-resource-run`, `serena-foreground`, `repo-retrieve`) is a
   `package.json` `bin` entry, installed into `~/.bun/bin` by `bun link` (`mise run deps`) —
   never a hand-made symlink of a `.ts` into `~/.local/bin`, which holds standalone binaries
   and shell scripts only. **Three files are RENDERED, not linked** (each is a function of several
   declarations): `~/.claude/settings.json`, `~/.codex/hooks.json` and `~/.claude/CLAUDE.md`, by
   `scripts/render-home.ts` (called from `link-dots.ts`). Inputs: the committed vendor files, an
   untracked `~/.claude/settings.private.json`, `zsh/timezone` (→ `env.TZ`),
   `agents/hooks/hooks.toml` (wired at render time) and the dispatch roster (→ CLAUDE.md block).
   settings.json was forced first — `autoMode` is read from user settings only, and its content is
   machine/repo-specific, so a symlink at this PUBLIC repo meant choosing between losing the
   setting and publishing a private project's structure. Cost: after editing any input, run
   `mise run link:dots` (the post-merge hook already does). `~/.gitconfig` and
   `~/.config/jj/config.toml` are **tool-owned** real files (the repo's halves are linked to
   `~/.config/git/config` and `~/.config/jj/conf.d/dotfiles.toml`).
   Tool list lives ONLY in `Brewfile` (+
   `scripts/check-tools.sh` — a tool in the Brewfile but absent from that array is drift the
   check cannot catch). Repo tasks live ONLY in `mise.toml` — this repo has NO justfile
   (retired); never reintroduce one.
4. `zsh/mac.zsh` / `zsh/wsl.zsh` load **after** the common aliases, so they may override.
   sheldon sources ONLY `zsh/aliases.zsh` (never `*.zsh` glob — OS files are conditional).
5. `zsh/zshenv` is deliberately tiny and quiet because zsh reads it for **every** invocation,
   including `ssh host 'cmd'`. It exists so user CLIs in `~/.local/bin` (notably Codex remote
   bootstrap) and bun's global bins in `~/.bun/bin` (this repo's `bin` commands, `bun add -g`
   tools) work in non-login SSH command shells. Do not put Homebrew shellenv, plugins, prompts,
   completions, or anything that can print/hang there.
6. **No implicit global toolchain (INV-6).** A managed tool is reachable where a config
   DECLARES it, or not at all. mise's two delivery paths must never merge: `mise activate`
   (`zsh/zshrc`) = interactive shells, per-directory; the shim dir (`zsh/zshenv`) =
   non-interactive ONLY, because `ssh host 'cmd'` skips `.zshrc`. Never `mise use -g`, never
   add a second version manager to a login shell (fnm removed 2026-08-06), never put the shim
   dir on an interactive PATH. `mise run test:mise-scope` fails on all three.
6a. **Data flows one way (INV-8).** declaration (repo) → render (`link:dots`) → deployed (`$HOME`)
   → runtime; every file has ONE writer. Never generate INTO a hand-written file (no wired hook
   entries in `agents/claude/settings.json` / `agents/codex/hooks.json`, no rendered roster in
   `agents/claude/CLAUDE.md` — `mise run lint:one-writer` fails on both); never link a path a
   tool writes (`git config --global`, `jj config set --user`) — make it tool-owned and give the
   repo's half a read-only path; run a third-party fetch in a throwaway HOME and import it
   (`skills:add`). A value has one home (the time zone is `zsh/timezone`).
7. Startup debug logs are gated: `export DOTFILES_DEBUG=1` to see `[DEBUG]` lines (`_dbg`).
8. **Skill naming** (`agents/skills/<name>/SKILL.md`): dir name **=** frontmatter `name:`, and
   skills use one consistent shape — the official-recommended **gerund** form
   `<verb-ing>-<object>` describing the activity the skill provides (`writing-julia`,
   `compiling-latex`, `running-python-tools`, `securing-remote-access`, `systematizing-knowledge`,
   `operating-the-harness`). Hard rules: lowercase/numbers/hyphens only and ≤64 chars. Shared
   skills must not contain the reserved words `claude`/`anthropic`. Keep tool names and trigger
   keywords in
   `description:` (3rd person, "what + when") — that field, with the name, is what the model
   matches on. Don't mix naming shapes across the collection (inconsistency is the documented
   anti-pattern). Ref: docs.claude.com Agent Skills → best-practices. The full CRAFT of
   creating/reforging skills (gates, pipeline, trigger test sets, verification fleet) is the
   `forging-skills` skill — read it before any skill work.

## Setup / Tasks

All repo tasks go through **mise** (`mise tasks` to list):

- **mac bootstrap**: `mise run mac:init` · **WSL bootstrap**: `mise run wsl:init` (see README)
- **Throwaway Linux box** (rented GPU, fresh VM): as root `curl -fsSL https://raw.githubusercontent.com/fuyutarow/dotfiles/alpha/scripts/bootstrap-linux.sh | bash`
  → `mise run linux:init`, then `herdr --remote <alias>`. dotfiles installs the **core dev utilities**
  only (`Brewfile.core`, via mise; no root needed — see `scripts/linux-init.ts`); experiment toolchains are each repo's `mise.toml`, never dotfiles.
  Renting/destroying: `renting-cloud-gpus` skill.
- **Relink dotfiles**: `mise run link:dots` · **Install tools**: `mise run install:tools`
- **Audit tools**: `mise run tools:audit` · **Update everything**: `mise run up`
- **MCP servers**: `mise run cc:install-mcp`
- **Is this machine what the repo declares?** `mise run doctor` (read-only; each FAIL names its repair)

(`j` = `jj` since 2026-10-01, with git-mirroring subcommand aliases in `jj/config.toml`: `j s`, `j d`, `j pu` …; `jl` = `just -l` remains for OTHER projects' justfiles.)

## Key Tools & Aliases

### Modern CLI replacements (installed via Brewfile, aliased in zsh/aliases.zsh)
- `ls` → `eza` (l, ll, la) · `cat` → `bat` (p) · `grep` → `ripgrep` (gr) · `find` → `fd` (f)
- `cd` → `zoxide` (`,` and `,,`) · `du` → `dust` (du2) · `ps` → `procs`
- `rm` → **DISABLED** (function errors out); use `rip` for file removal

### Daily commands
- `lg` lazygit · `j` jj · `e` editor · `c`/`cc` clipboard copy · `pp` view+copy
- `o` open · `oo` open current dir — both `smart-open` (`tools/smart-open/`): attached over ssh/herdr, a URL opens on the client and a path as a VS Code Remote-SSH window there; else here (Finder / Explorer) · `s`/`start` launch app
- `hhh` list custom aliases · `h <cmd>` tldr · `jl` list just tasks
- History: atuin (Ctrl+R)

## Git → jj (Jujutsu)
- **Agents do not run git in this repo** (2026-10-01, same as firedancer). The repo is a colocated
  jj repo (`.git` + `.jj`); `.claude/settings.json` denies `Bash(git:*)`. Operate it with jj
  (`driving-jujutsu` skill). jj runs no Git hooks, so record and sync through mise:
  `mise run commit -- -m "<msg>" [--push] -- <path>...` (stages exactly those paths, runs
  `hook:pre-commit`, `jj commit`s them, moves `alpha` to `@-`) and `mise run pull` (fetch, rebase
  onto `alpha`, then `hook:post-merge`). mise tasks may still call git internally.
- jj settings shared by every repo live in `jj/config.toml` (linked to `~/.config/jj/config.toml`);
  `jj config set --repo` writes outside the checkout (`~/.config/jj/repos/`), so it is for a
  genuinely repo-specific value only.
- Default branch / bookmark: **`alpha`** (not main/master)
- **Commit messages are ENGLISH — subject and body.** This repo has older Japanese commits;
  they are history, not a template. Do not imitate them (2026-08-23).
- Per-OS git config via `[include] ~/.local-gitconfig` (linked from `git/local.mac` or `git/local.wsl`)
- lazygit (`lg`) remains the human's interactive surface

## Safety Rules
- `rm` is permanently disabled in shell config — **always use `rip`** (never suggest raw `rm`).
- `mv`/`cp` are shell **functions** that **refuse loudly and abort (exit 1)** when they would
  overwrite an existing path — they print the conflict and tell you to re-run with `mvf`/`cpf`
  (= `command mv`/`command cp`, force-overwrite). This replaces the old *silent* no-clobber skip
  (`-n` / `--update=none`) that exited 0 and fooled callers (esp. agents) into thinking a
  copy/move succeeded when it was dropped. Mirrors `rm`→`rip`; OS-agnostic (same on BSD/GNU).
  When you *intend* to overwrite (incl. in scripts), call `cpf`/`mvf` — a bare `cp`/`mv` won't.
- `git checkout` (and the retired aliases `co`/`cb`) is a shell **function** that refuses
  and prints the disambiguated replacement instead of running — branches → `git switch
  [<branch>|-c <branch>]`, files → `git restore [-- <path>]`. Never suggest raw `git checkout`;
  use `git switch`/`git restore` directly. Interactive shells only (scripts/CI/hooks get the
  real binary via `command git`). Git operations follow the `driving-git` skill; `git/gitconfig`
  carries the modern defaults (rerere, updateRefs, zdiff3, histogram, autoSetupRemote …).
- **Terminal state is repaired by WRITING a known-good state, never by querying the terminal.**
  A dropped link never delivers the remote TUI's disable sequences, so the terminal keeps
  reporting input as escapes — mouse motion (`\e[<35;86;59M`) and, independently, Kitty-protocol
  key events (`\e[…;1:3u`, `:3` = key release) — and stays on the alternate screen. Input
  reporting is TWO leaks, not one: repairing only the mouse looks fixed until a herdr/agent TUI
  dies. A `precmd` hook re-asserts the safe modes before every prompt; `ssh` is also a
  function (interactive shells only — scripts get the binary) that leaves the alternate screen on
  exit 255. Both paths WRITE ONLY: a read there hangs the shell on a short reply, eats type-ahead,
  and SIGTTINs a backgrounded `ssh`. `fixterm` is the manual sledgehammer (it may clear the
  screen). Guarded by `mise run test:zsh` — a real pty, where a hang counts as a failure.
- Clipboard is cross-platform (`cc`, `pp`, `pwdc`) with UTF-8/UTF-16 handling for WSL.

## Notes for Claude
1. Check `jl` / `mise tasks` before suggesting manual installs; prefer `brew bundle`.
2. New OS-dependent logic: branch on `$IS_MAC` / `$IS_WSL`; OS-only files go INSIDE the
   topic dir as `*.mac` / `*.wsl` / `*.win` (e.g. `zsh/mac.zsh`, `git/local.wsl`, `wsl/wslconfig.win`).
3. Never write machine-absolute paths into shared files (`zsh/`, `git/`, `tmux/`) (tools like juliaup may try to append
   them to `.zshrc` — fold such blocks back into `$HOME`-relative guarded form).
4. tmux is heavily customized (`tmux/tmux.conf`); prefix is Alt+g / Ctrl+g.
5. Language: English for code/comments **and commit messages**; Japanese OK in docs and conversation.
