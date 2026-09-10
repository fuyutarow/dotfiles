#!/usr/bin/env bash
# shim: bootstrap
# Single source of truth for dotfile symlinks (macOS & WSL).
# Called by `mise run link:dots` — do not duplicate link lists anywhere else;
# add new links HERE. Layout is topic-first: one tool = one directory.
#
# Modes (ONE script + a flag, not two scripts):
#   (default)  SAFE   — idempotent/harmless: never clobber a non-symlink file,
#                       never sudo/rm unless actually needed. This is the default
#                       so the post-merge hook can relink on every `git pull`.
#   --force           — overwrite a regular file with the symlink. For the
#                       intentional `mise run link:dots` (initial setup / fix drift).
set -euo pipefail

DOTFILES="${DOTFILES:-$HOME/dotfiles}"

FORCE=false
[[ ${1:-} == "--force" ]] && FORCE=true

# --- OS detection (same convention as zsh/aliases.zsh) ---
IS_MAC=false
IS_WSL=false
[[ "$(uname -s)" == Darwin ]] && IS_MAC=true
[[ "$(uname -r)" == *[Mm]icrosoft* ]] && IS_WSL=true

link() { # link <repo-relative source> <target>
  local src="$DOTFILES/$1" dst="$2"
  [[ -e $src ]] || {
    echo "skip (missing): $src"
    return 0
  }
  [[ -L $dst && "$(readlink "$dst")" == "$src" ]] && return 0 # already correct -> no-op
  if ! $FORCE && [[ -e $dst && ! -L $dst ]]; then
    echo "skip (exists, not symlink): $dst"
    return 0 # safe (default): don't clobber a real file
  fi
  mkdir -p "$(dirname "$dst")"
  ln -sfn "$src" "$dst"
  echo "linked: $dst -> $src"
}

# --- zsh ---
link zsh/zshenv "$HOME/.zshenv"
link zsh/zshrc "$HOME/.zshrc"
if $IS_MAC; then
  link zsh/zprofile.mac "$HOME/.zprofile"
elif $IS_WSL; then
  link zsh/zprofile.wsl "$HOME/.zprofile"
fi
link sheldon "$HOME/.config/sheldon"

# --- git ---
link git/gitconfig "$HOME/.gitconfig"
if $IS_MAC; then
  link git/local.mac "$HOME/.local-gitconfig"
elif $IS_WSL; then
  link git/local.wsl "$HOME/.local-gitconfig"
fi

# --- ssh (client POLICY only; the host inventory stays machine-local) ---
# Same split as git above: tracked policy here, untracked machine identity beside it.
# ssh/config Includes ~/.ssh/config.local FIRST, and that file holds HostName/Port/User — a
# tailnet map that must never enter this PUBLIC repo. A missing config.local is not an error
# (ssh -G still resolves, exit 0), so a fresh clone links cleanly and simply has no hosts yet.
# ~/.ssh must exist and be 700 before ssh will read anything in it; create it if this is a fresh
# machine, since unlike ~/.config the linker cannot assume it is there.
[[ -d "$HOME/.ssh" ]] || { mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"; }
link ssh/config "$HOME/.ssh/config"

# --- tmux ---
link tmux/tmux.conf "$HOME/.tmux.conf"

# --- herdr (agent multiplexer; link the config file only — ~/.config/herdr/ also holds live sockets/logs) ---
link herdr/config.toml "$HOME/.config/herdr/config.toml"

# Prune first: a link this script USED to create keeps pointing into the repo after the source is
# renamed or deleted (the .sh → .ts hook migration left six dangling links under ~/.claude). Only
# symlinks INTO this repo that no longer resolve are removed — foreign or healthy links are never
# touched, so a link some other tool owns is safe here.
#
# EVERY directory this script links INTO is swept, not just ~/.claude. It scanned only ~/.claude
# until 2026-09-10, which was enough for the migration that prompted it and silently wrong for
# everything else: retiring the mcp-reaper stopgap deleted its three sources and left
# ~/.local/bin/mcp-reaper and two units under ~/.config/systemd/user/ pointing at nothing, through
# a full `mise run link:dots`. A prune that covers one of five destinations is not a prune; it is
# a coincidence that happened to match the first case anyone tested.
#
# Keep this list in step with the `link` calls below — a new destination directory needs a line
# here, or its dead links become the next thing nobody notices.
for _dir in "$HOME"/.claude "$HOME"/.local/bin "$HOME"/.config/systemd/user "$HOME"/.codex "$HOME"/.config; do
  [ -d "$_dir" ] || continue
  for _stale in "$_dir"/*; do
    [ -L "$_stale" ] || continue
    [ -e "$_stale" ] && continue
    case "$(readlink "$_stale")" in
      "$DOTFILES"/*) rm -f "$_stale" && echo "pruned (dangling): $_stale" ;;
    esac
  done
done
unset _stale _dir

# --- claude code (user-level config; the repo's own project .claude/ is separate) ---
link agents/claude/statusline-command.ts "$HOME/.claude/statusline-command.ts"
link agents/claude/hooks "$HOME/.claude/hooks"
link cocoindex/repo-search.ts "$HOME/.local/bin/repo-search"
link agents/resource-control/agent-resource-run.ts "$HOME/.local/bin/agent-resource-run"
link agents/serena-control/serena-foreground.ts "$HOME/.local/bin/serena-foreground"
link agents/claude/CLAUDE.md "$HOME/.claude/CLAUDE.md"
link agents/claude/keybindings.json "$HOME/.claude/keybindings.json"

# settings.json is GENERATED, not linked — the one exception in this file, and it is forced.
# `autoMode` is read from user settings ONLY (ignored in project and local settings, per
# code.claude.com/docs 2026-08-17), and its content is inherently machine- and repo-specific. With
# ~/.claude/settings.json symlinked at this PUBLIC repo, keeping that setting meant publishing a
# private project's paths and sensitive-data map. So: committed base here + untracked overlay at
# ~/.claude/settings.private.json, merged into a real file. Renderer owns the merge and atomicity.
# Deliberately not `link`: the destination is not a symlink any more, and `link`'s no-clobber guard
# would refuse to touch it. Runs before `mise run deps` on a fresh machine, so the renderer is
# zero-dependency by design.
bun "$DOTFILES/scripts/render-claude-settings.ts" || echo "warn: settings render failed — ~/.claude/settings.json left as-is" >&2

# --- third-party skill provenance ledger ---
# `bunx skills add -g` records where each vendored skill came from in ~/.agents/.skill-lock.json.
# That file sits one level ABOVE ~/.agents/skills (which link:skills points at agents/skills), so
# it would otherwise stay outside the repo and the provenance would never be committed. Measured:
# the CLI writes THROUGH this symlink and leaves it intact, so the ledger lands in git by itself.
# 1 source -> 1 destination, so it belongs here and not in link:skills.
link agents/skills-lock.json "$HOME/.agents/.skill-lock.json"

# --- codex (user-level hooks; AGENTS.md / prompts / skills fan out via link:skills) ---
link agents/codex/hooks.json "$HOME/.codex/hooks.json"
link agents/codex/hooks "$HOME/.codex/hooks"

# NOTE for every systemd unit linked below: `systemctl --user disable <unit>` DELETES the
# symlink this script places in ~/.config/systemd/user/. systemd treats any symlink found in
# the unit search path as an enablement link and removes it, not just the *.wants/ entry —
# so a disable leaves the unit reporting `not-found`, not `disabled`. Always re-run
# `mise run link:dots` after disabling one. Measured 2026-08-24 on the since-retired
# mcp-reaper.timer — the lesson outlived the unit and applies to every unit linked below.
#
# --- cocoindex-code (MCP code search; declarative global settings = no interactive `ccc init`) ---
link cocoindex/global_settings.yml "$HOME/.cocoindex_code/global_settings.yml"
# The daemon needs a systemd owner or it is spawned uncapped by whichever client calls first.
# Linking the unit is also what arms the client-side guard in zsh/zshenv, so the link and the
# `export COCOINDEX_CODE_DAEMON_SUPERVISED=1` can never drift apart. Activate: mise run wsl:ccc-daemon
if $IS_WSL; then
  link cocoindex/ccc-daemon.service.wsl "$HOME/.config/systemd/user/ccc-daemon.service"
fi

# --- topgrade (govern which update steps run; e.g. disable flutter/tlmgr) ---
link topgrade/topgrade.toml "$HOME/.config/topgrade.toml"

# --- bottom/btm (group processes by default; per-PID rows hide swarm leaks) ---
link bottom/bottom.toml "$HOME/.config/bottom/bottom.toml"

# --- lazygit (cross-OS topic; config dir differs by OS — lazygit honors XDG_CONFIG_HOME on both) ---
if $IS_MAC; then
  link lazygit/config.yml "$HOME/Library/Application Support/lazygit/config.yml"
elif $IS_WSL; then
  link lazygit/config.yml "$HOME/.config/lazygit/config.yml"
fi

# --- karabiner (macOS only; whole-dir replace, so guard the rm against repeat runs) ---
if $IS_MAC; then
  kdst="$HOME/.config/karabiner"
  if [[ -L $kdst && "$(readlink "$kdst")" == "$DOTFILES/karabiner" ]]; then
    : # already linked -> nothing to rm
  elif ! $FORCE && [[ -e $kdst && ! -L $kdst ]]; then
    echo "skip (exists, not symlink): $kdst" # safe (default): don't rm a real dir
  else
    rm -rf "$kdst"
    link karabiner "$kdst"
  fi
fi

# --- wsl (WSL2 system config; /etc needs root — guard sudo so pulls don't re-prompt) ---
if $IS_WSL; then
  if [[ "$(readlink /etc/wsl.conf 2> /dev/null)" == "$DOTFILES/wsl/wsl.conf" ]]; then
    : # already linked -> no sudo prompt
  elif sudo ln -sfn "$DOTFILES/wsl/wsl.conf" /etc/wsl.conf 2> /dev/null; then
    echo "linked: /etc/wsl.conf -> $DOTFILES/wsl/wsl.conf (sudo)"
  else
    echo "skip: /etc/wsl.conf needs root — run: sudo ln -sfn $DOTFILES/wsl/wsl.conf /etc/wsl.conf"
  fi

  # Kernel tunables. Same guarded-sudo shape as wsl.conf above, and the same reason for a
  # symlink rather than a copy: systemd-sysctl reads the path at boot and follows links fine.
  # 50- so it applies after the distro's own 10-* drop-ins and before 99-sysctl.conf.
  # Editing the file alone changes nothing until `sudo sysctl --system` or a distro restart.
  sysctl_dst=/etc/sysctl.d/50-dotfiles.conf
  if [[ "$(readlink "$sysctl_dst" 2> /dev/null)" == "$DOTFILES/wsl/sysctl.conf" ]]; then
    : # already linked -> no sudo prompt
  elif sudo ln -sfn "$DOTFILES/wsl/sysctl.conf" "$sysctl_dst" 2> /dev/null; then
    echo "linked: $sysctl_dst -> $DOTFILES/wsl/sysctl.conf (sudo) — apply: sudo sysctl --system"
  else
    echo "skip: $sysctl_dst needs root — run: sudo ln -sfn $DOTFILES/wsl/sysctl.conf $sysctl_dst"
  fi

  # .wslconfig is NOT linked here on purpose: it is read by the Windows-side WSL service, which
  # cannot follow a WSL symlink, so it must be COPIED. That is a separate, reportable step —
  # `mise run wsl:wslconfig` (scripts/wsl-wslconfig.ts), which also guards the machine-specific
  # memory= against the host's actual RAM before writing.
fi

if ! $IS_MAC && ! $IS_WSL; then
  echo "warn: neither macOS nor WSL detected — OS-specific links skipped" >&2
fi

echo "done."
