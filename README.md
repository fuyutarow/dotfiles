# Dotfiles

知者不惑，仁者不憂，勇者不懼。

> **Dotfiles for the agent era.** One repo configures both my machines (macOS + WSL2) _and_ my AI
> coding agents — Claude Code, Codex, Gemini — from a single source, on a shell that refuses to
> destroy files silently. Topic-first: one tool owns one directory; OS differences live inside it.

macOS + WSL2 · one history since 2017 · plain `ln -sfn` symlinks, no templating layer — you can read exactly what links where.

## What makes it different

Most dotfiles configure a shell. Two things here are less usual:

- **Your coding agent is a first-class topic, not an afterthought.** `agents/` sits beside `zsh/`
  and `git/`. `mise run skills:sync` installs in-house skills as Claude's `dotfiles:<name>` plugin
  and Codex copies; `mise run agents:link` links slash-commands and Codex guidance. It never
  links `agents/skills` into a tool directory. `agents/skills/` contains in-house skills only.
  Third-party source/name pairs live in [`agents/skills.thirdparty.toml`](agents/skills.thirdparty.toml) and
  `mise run skills:sync` installs them into tool-owned global directories. The authored skills —
  `forging-skills`, `linting-prose`, `systematizing-knowledge`, `operating-the-harness`, … — are in
  the [full index](agents/skills/). One `.mcp.json` supplies both Claude and Codex.
  Three narrow **Stop-hook gates** (exit 2) block the agent before it hands you bad work: a
  garbled/mis-serialized tool call, a self-congratulatory "PASS" with no evidence, and accidental
  Japanese/English word-salad in the output.

- **The shell fails loudly, on purpose — because silent success is how an agent corrupts your tree.**
  `cp` / `mv` are guarded functions that **abort with a non-zero exit** when they would overwrite a
  file — they name the conflict and point you at `cpf` / `mvf` to force it. The usual silent
  no-clobber (`cp -n`) exits `0`, fooling a caller — _especially an LLM agent_ — into thinking a copy
  happened when the file was dropped. (`rm` is disabled in favor of `rip`, a trashcan `rm`; that half
  is ordinary hygiene — the overwrite guard is the uncommon part.) `git checkout` is disabled the
  same way, for the reason it was split upstream: one verb does branch-switch, file-restore, and
  branch-creation duty at once, so a typo does something else plausible instead of erroring — the
  guard names which one you meant and points at `git switch` or `git restore`. `ssh` is guarded too, for a
  different failure: a link that dies mid-session never delivers the remote TUI's disable
  sequences, so the terminal keeps reporting input as escapes — mouse motion _and_, separately,
  Kitty-protocol key events — and stays on the alternate screen. The shell re-asserts a
  known-good terminal state before every prompt — by **writing** it
  blind, never by querying the terminal, because a query there can hang the shell. `fixterm` is
  the manual sledgehammer.

## Feedback register

Owner feedback and retrospectives are indexed in [`agents/retros/register.toml`](agents/retros/register.toml). Before acting on new owner feedback, search the register first with `rr about '<feedback text>'` and validate or filter it with `mise run retros:check -- --json`. If it matches an existing lesson, append a recurrence with `mise run retros:recur -- <id>` instead of adding another row. `mise run retros:check` validates the register and prints lessons needing enforcement; JSONL consumers can select them with `jq 'select(.needs_enforcement)'`.

## Toolbox

A curated modern-CLI stack, aliased for a terse daily grammar. Run `hhh` for the full annotated
cheat sheet.

| Replaces | Tool      | Alias         | What you get                                           |
| -------- | --------- | ------------- | ------------------------------------------------------ |
| `ls`     | eza       | `l` `ll` `la` | git-aware colorized listing; `lt` tree, `lll` by mtime |
| `cat`    | bat       | `p`           | syntax-highlighted pager                               |
| `grep`   | ripgrep   | `gr`          | fast, gitignore-aware code search                      |
| `find`   | fd        | `f`           | intuitive file finder (`ff <ext>` bats the matches)    |
| `cd`     | zoxide    | `,` `,,`      | frecency jumping — the comma is the navigation grammar |
| `du`     | dust      | `du2`         | tree-view disk usage by size                           |
| `ps`     | procs     | —             | colored, searchable process tree (run by name)         |
| `diff`   | git-delta | `diff`        | syntax-highlighted diffs + git pager                   |
| `Ctrl+R` | atuin     | `Ctrl+R`      | SQLite-backed searchable history                       |
| `man`    | tldr      | `h <cmd>`     | example-first help                                     |

Plus: **lazygit** (`lg`, with `Ctrl+A` AI commit messages) · **tmux** (`t2`–`t6` spin up an N-pane
session in one keystroke) · **cross-OS clipboard** (`c`, `pp` = view+copy, `pwdc`; OSC-52 so a copy
over SSH reaches your _local_ terminal) · **bun** · **direnv** · **mise** · a linted LaTeX build
(`x` / `xx`).

Install tier follows when a tool is needed; OS guards remain in the Brewfiles:

| Tier | Declaration | Use |
| --- | --- | --- |
| core | `Brewfile.core` | Installed on every box; missing commands point to `mise run install:tools`. |
| on-demand | `Brewfile.ondemand` | Install a missing formula on first need with `mise run tool:get <cmd>`; casks use `mise run install:tools`. |
| repo `mise.toml` | that repo's `mise.toml` | Run `mise install` in that repo. |
| `uvx` / `bunx` | no Brewfile declaration | Run the one-shot CLI through `uvx` or `bunx`. |

`mise run tool:which <cmd>` reports the declaration tier and formula. The root `Brewfile` is the
union of core and on-demand entries for full Homebrew Bundle installs.
For large research-store objects, `git-lfs` is on-demand: check it with
`mise run tool:which git-lfs`, then install it with `mise run tool:get git-lfs`. In the repo that
needs LFS, run `git lfs install --local` so the setup stays repo-local.

## Architecture

Topic-first: one tool owns one directory; OS variance lives inside it as `*.mac` / `*.wsl`.

```
~/dotfiles/
├── zsh/         # zshenv (tiny, SSH-safe), zshrc, aliases.zsh (+ IS_MAC/IS_WSL), mac.zsh / wsl.zsh
├── git/         # gitconfig + local.mac / local.wsl (per-OS include)
├── tools/       # repo CLIs and libraries, one directory each (release notes in .changes/, generated package.json semver + CHANGELOG.md, src/, tests/); may import its own dir and tools/shared/
│   ├── rr/          # rr (= repo-retrieve): declared query-shape router over ccc / rg / Serena; src/ (CLI, ccc adapters, python helpers), retrieval.toml, tests/
│   ├── smart-open/  # smart-open (`o`/`oo`, git/jj `o`): over ssh/herdr a URL → the client you sit at, a path → its VS Code Remote-SSH; else here; src/receive.ts + launchd plist on mac
│   ├── agx/ # agx (Jev-selected worker routing; append-only records stay in ~/.local/state/agx-next)
│   ├── storage-headroom/ # storage decisions (decide) and read-only headroom CLI; hooks adapt the verdict
│   └── shared/      # code several tools import (Bash syntax parsing, hook path resolution, zod, attempt, narrow, typesafe-key, sockets, model-orders, worker-env)
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
│                #   and shared agent assets (commands/, skills/); other repos call task helpers
│                #   through package.json bins instead of skill installation paths
├── tools/       # repo CLIs (rr, agent-resource-run, serena-foreground, smart-open, secrets-push, sui-keystore-merge) + shared TS modules
├── scripts/     # plumbing — config-registry.ts, link-dots.ts, check-tools.sh, shared tool lookup
├── Brewfile.core      # tools needed on every box
├── Brewfile.ondemand  # tools installed when first needed (OS guards stay here)
├── Brewfile           # union used for full Homebrew Bundle installs
└── mise.toml    # the task runner (no justfile)
```

Each tool change records its release intent in a generated `tools/<name>/.changes/<slug>.md`
file. Run `mise run changeset -- <tool> <patch|minor|major> "<entry>"`; do not hand-write the file. Tickets do not edit
`package.json` versions or `CHANGELOG.md`. At land, `scripts/land.ts` applies the highest pending
bump per tool, prepends all entries under one new SemVer heading, and removes the changeset files
in the same landed commit. `gate:land` and land validate the file through the same zod schema.
Landing with no changesets leaves tool versions and changelogs alone.

**Single sources of truth** — each fact has one home, so nothing drifts:

- **Every configuration surface** → `scripts/config-registry.ts`: for each one its source, how it
  reaches the machine (link, rendered, tool-owned, applied, in-place, machine-local), its consumer,
  its one writer and its verifier. `mise run config:map` prints it; `mise run lint:config-map` fails
  on a config file in no row. The deploy code reads the same tables.
- **Symlinks** → the registry's `LINKS`, realized by `scripts/link-dots.ts` (OS-aware; a safe mode re-links on every `git pull` via `.githooks/post-merge`).
- **Rendered `$HOME` files** → `scripts/render-home.ts` (called by link-dots; checked by `mise run doctor`). See invariant 8.
- **Tools** → `Brewfile.core` and `Brewfile.ondemand` (`Brewfile` is their install union) · **Tasks** → `mise.toml` · **Agent + MCP config** → `agents/` and `.mcp.json`.

## Design — the invariants

The rules that keep the repo coherent. The agent-facing operational encoding lives in
[`CLAUDE.md`](CLAUDE.md) (Claude Code) and [`AGENTS.md`](AGENTS.md) (Codex).

1. **Topic-first.** Adding or removing a tool touches exactly one directory plus `scripts/config-registry.ts`.
   No `common` / `mac` / `wsl` bucket directories — OS variance goes _inside_ the tool's directory.
2. **Single source of truth.** Each fact has one home (see _Architecture → Single sources of truth_):
   to change it you edit one file, never many.
3. **OS-neutral.** Shell logic branches on `IS_MAC` / `IS_WSL` (computed once in `zsh/aliases.zsh`);
   shared files never hard-code a machine-absolute path.
4. **A quiet `zshenv`.** `zsh/zshenv` stays tiny — zsh reads it on _every_ invocation, including
   `ssh host 'cmd'`, so user CLIs in `~/.local/bin` and bun's global bins in `~/.bun/bin`
   (this repo's own `bin` commands) work in non-login SSH shells. It reads the rendered
   `~/.config/dotfiles/brew-prefix` and quietly adds Homebrew bin/sbin and rustup proxies;
   exports `GRAVEYARD` (the variable read by `rm-improved` rip) and `RIP_GRAVEYARD` (used by repo
   tools) under `$XDG_DATA_HOME` or `~/.local/share`. The `rip` function refuses tmpfs/ramfs
   graveyards; linked `environment.d` settings cover systemd user services and `systemd-run --user`.
   For durable `agx run` dispatches, carry the caller's session with
   `systemd-run --user -E CLAUDE_CODE_SESSION_ID -E CODEX_SESSION_ID --unit=agx-<name> --collect -- agx run TICKET.md`.
   Before dispatch, agx refuses a Git ref lock with no open holder that is older than 60 seconds.
   It prints the lock path and age, then gives the `rip <path>` repair after confirming no holder.
   Bash SSH shells read the same prefix and export both variables. `brew shellenv` belongs in login
   profiles, never zshenv.
5. **Fail loudly, never silently.** `rm` is disabled; `mv` / `cp` abort on overwrite (see above).
6. **No implicit global toolchain.** A managed tool is reachable where a config _declares_ it,
   or not at all: no global default version, and no second version manager hooking a login
   shell. mise's two delivery paths stay apart — `mise activate` serves interactive shells
   per-directory; the shim directory serves _only_ non-interactive ones (`ssh host 'cmd'`
   never reads `.zshrc`, so it has no other way to reach a declared tool). Merging them puts a
   name like `npm` on every PATH for a tool nothing declared, which then refuses to run.
   `Brewfile.core` declares bun/uv and the other core utilities for every cwd; these are
   Homebrew tools, not global mise versions. Enforced by `mise run test:mise-scope`.
7. **Core dev utilities, everywhere, at once; experiments belong to the repo.** On any machine —
   the Mac, R99, a rented GPU box, a fresh VM — dotfiles' job is to make the core dev utilities
   (brew, herdr, mise, jj, gh, the shell and its aliases, the search/VCS CLIs — `Brewfile.core` — Rust's cargo, and the agent CLIs Claude Code, Codex and Antigravity's agy)
   usable immediately, reachable with `herdr --remote`. **ONE installer: Homebrew**, through
   `brew bundle --file=Brewfile.core` on every OS. Linux defaults to `/home/linuxbrew/.linuxbrew`;
   `scripts/config-registry.ts`'s `LAND_HOSTS` declares `~/.linuxbrew` for no-root hosts such as sol.
   Standard-prefix bottles are preferred; source builds are allowed, including herdr and
   non-standard-prefix dependencies. At a nonstandard Linux prefix, Bun uses its official
   `oven-sh/bun/bun` Homebrew tap release instead of compiling WebKit; Bundle supplies its bunx
   alias. Both providers are Homebrew-managed. Claude Code uses its native self-updating installer.
   On macOS and ordinary Linux, Codex uses its standalone installer. Brewfile.core declares the
   Homebrew CLI only on WSL, where plain `codex` stays native while Windows Desktop remains the
   explicit `codex.exe` through a runtime-owned launcher with a separate Windows config home.
   It is not a portable container image, and
   it never builds an experiment environment: Julia, CUDA, Python and their versions are each
   repo's `mise.toml` (`mise install` in that repo). A machine where an alias is missing is a
   dotfiles bug, not a property of the machine. Entry points: _Setup_ below.
8. **Data flows one way; every file has one writer.** declaration (the repo, hand-written) →
   render (`mise run link:dots`) → deployed (`$HOME`, never edited) → runtime. Nothing flows
   back as data; the only way back is a check (`mise run doctor`, `link:dots --check`).
   - A deployed path is a **link** when it is one declaration verbatim, and **rendered** when it
     is a function of several (`scripts/render-home.ts`: `~/.claude/settings.json` = base +
     private overlay + `zsh/timezone` + the hook registry; `~/.codex/hooks.json`;
     `~/.claude/CLAUDE.md` = template + dispatch roster; `~/.config/dotfiles/brew-prefix` = host
     declaration + OS + HOME). A generator never writes INTO a
     hand-written file — `mise run lint:one-writer` fails on registry hooks in a committed vendor
     file or a rendered roster in the CLAUDE.md template.
   - A file a tool rewrites on command is **tool-owned**: a real machine-local file, never a link
     into the repo, with the repo's half in a path the tool only reads (`~/.gitconfig` beside the
     linked `~/.config/git/config`; jj's `config.toml` beside the linked `conf.d/dotfiles.toml`).
     Measured 2026-10-06: through a link, `git config --global` and `jj config set --user` both
     rewrote the repo. Third-party skills are declared in `agents/skills.thirdparty.toml` and
     installed globally with `mise run skills:add`; `mise run skills:sync` installs that set with
     the in-house plugin and Codex copies. Sync removes old links into this checkout. If a global
     skill path still links into another repo, `mise run skills:migrate` copies it into a real
     tool-owned directory before add/sync.
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

On WSL, `Brewfile.core` declares the Homebrew `codex` cask. Install the Windows Codex Desktop
app too, then run `mise run install:ai-clis` from the WSL checkout to deploy explicit `codex.exe`.
The task keeps Claude native to WSL, retains the two distinct config homes, and retires only its
old managed plain-Codex facade. macOS and ordinary Linux retain the standalone Codex installer.
`mise run doctor` verifies both WSL providers and launchers.

The WSL capacity controller runs every minute and reclaims stale `/tmp` directories at 80% inode use, before storage-headroom warns at 85%.

When Google Drive for Windows is available as `G:`, `wsl/wsl.conf` enables WSL automount at
`/mnt`. Google Drive's virtual `G:` is not found by WSL automount. Run `mise run wsl:drive-mount`
once to install the declared drvfs entry from `wsl/gdrive.fstab` into `/etc/fstab`; WSL will mount
it at `/mnt/g` on later distro starts. `mise run doctor` reports when
that mount is absent. `mise run link:dots` declares `~/Google Drive` for the drive root and
discovers the `Personal-Drive` directory under `My Drive` for `~/Personal-Drive`. The discovered
target is cached in an untracked host-specific file under `~/.local/state/dotfiles/`; an existing
valid link seeds the cache on already-deployed hosts. A fresh discovery walks at most six levels
and 15 seconds, printing its bounds before it starts. The Drive account's folder name is never
stored in this repository. After changing `wsl/wsl.conf`, restart the distro for automount settings
to take effect.

### Throwaway Linux box (rented GPU, fresh VM, container)

dotfiles gives such a box the **core dev utilities** only — `Brewfile.core` (shell, search, VCS,
herdr, mise …) via `brew bundle --file=Brewfile.core`, plus the agent CLIs and the dotfile
links — so it is usable at once and reachable with `herdr --remote`. Verify it from your machine with
`mise run doctor:remote -- <alias>`; `mise run box:init -- <alias> [--gh] [--repo owner/name …]`
runs the bootstrap, the repos' setup and both doctors in one idempotent pass. It does **not** build experiment environments: Julia, CUDA, Python
and their versions belong to each repo's `mise.toml` (`mise install` inside that repo).

Root bootstrap prepares the user and build prerequisites once; Homebrew and bundle run as the
user. On an existing host, run `mise run linux:migrate-brew -- --dry-run`, then
`mise run linux:migrate-brew`. A declared no-root host installs Homebrew into its home-relative
prefix without sudo; longer HOME paths use Homebrew's manual Git checkout layout. Source builds
may take a long time; migration reports elapsed install/build time.
Downloads and source-build scratch use a private `/var/tmp` directory rather than HOME quota.
The installer uses at most two allowed CPUs, with Make/Go worker limits, and streams verbose
progress. Scratch is removed on success and its location is reported on failure.
Brewfile.core selects Bun's official Homebrew tap at nonstandard Linux prefixes; no system
compiler repair is needed for Bun. Other formulas may still build from source.

Migration verifies core command provenance in login and SSH command shells before retiring
legacy downloader links. It checks `/proc` executable links, mapped files and inherited PATHs,
prints deferred links, and leaves them until their jobs/sessions finish. It never deletes mise
installations, including Julia experiment toolchains. Re-run migration later to complete cleanup.
Doctor requires brew and checks core command paths against the host's declared prefix.

`coredev deploy <approved-alias>` is target-owned: it connects to that approved SSH alias, reads
the remote checkout's `scripts/deployment-selection.ts`, and runs the selected existing `mise`
tasks there. The remote checkout is `$DOTFILES` when that remote environment declares it, otherwise
`$HOME/dotfiles`; a missing checkout or transport failure stops without a local fallback. Live
remote support remains limited to an already-prepared host; `coredev` neither clones a checkout nor
copies profiles, credentials, or installers. WSL remains an explicit caller identity in the host
registry, rather than inferred from the machine issuing the command.

```bash
# as root on the box (one line; creates user fuyu, then runs `mise run linux:init` as that user)
curl -fsSL https://raw.githubusercontent.com/fuyutarow/dotfiles/alpha/scripts/bootstrap-linux.sh | bash
# from the Mac: a Host block in ~/.ssh/config.local (never this repo) — `Host <alias> <alias>-code`
# plus `Tag smart-open`, so `o`/`oo` there open on the Mac — then
herdr --remote <alias>
```

Renting, choosing and destroying a GPU box (Vast.ai) is the `renting-cloud-gpus` skill.

`rip` keeps recoverable removals under `$XDG_DATA_HOME/graveyard` (or `~/.local/share/graveyard` when XDG data home is unset), exported by both `zsh/zshenv` and `zsh/bashrc`. `mise run doctor` evaluates the zshenv declaration, fails if the configured graveyard is RAM-backed or exceeds 10 GiB, and warns separately when a legacy `/tmp/graveyard-<user>` remains. The blind `mise run reclaim` tier purges eligible rip entries after 24 hours.

## Tasks

All repo tasks are defined in `mise.toml` (single task runner — no justfile here):

verify should include `mise run gate:land` for a change that will land in dotfiles.

```bash
mise tasks            # list
mise run up           # update everything (topgrade)
mise run link:dots    # (re)create symlinks   — scripts/link-dots.ts
mise run tools:audit  # audit CLI toolbox     — scripts/check-tools.sh
mise run tool:which pdftoppm # declaration tier and formula
mise run tool:get pdftoppm  # install a declared formula on first need
mise run doctor       # does this machine realize the repo? (read-only) — scripts/doctor.ts; reports ownerless ref locks in registered repos too
mise run install:tools  # install core + on-demand formulas and casks — Brewfile union
mise run agents:link      # deploy commands + Codex guidance links
mise run skills:sync       # install Claude plugin + Codex copies + declared vendors
```
