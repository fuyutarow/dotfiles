#!/usr/bin/env zsh
# WSL-specific aliases — sourced from zsh/aliases.zsh when $IS_WSL.
# Common aliases live in zsh/aliases.zsh; only WSL-only ones belong here.
#
# THIS FILE IS THE HOME OF EVERY WSL↔WINDOWS BRIDGE, on purpose: it is sourced by EVERY
# interactive shell (aliases.zsh → here; zshrc loads sheldon when .zprofile was skipped).
# zsh/zprofile.wsl is LOGIN-only, and herdr spawns panes as bare `/usr/bin/zsh` — non-login.
# Anything a pane needs must live here, or it silently never runs inside herdr.

# ── WSL identity ──────────────────────────────────────────────────────────────
# Windows-launched sessions get WSL_DISTRO_NAME injected; sshd- and herdr-born ones do NOT.
# Every VS Code-family launcher keys its "am I in WSL?" test on that var, then falls back to a
# WSL1-era `uname -r` regex ("...-Microsoft") that today's "-microsoft-standard-WSL2" kernels
# never match. Missing var ⇒ launcher decides it is NOT in WSL ⇒ it hands Windows a raw
# /mnt/c/... path, which interop rewrites as \\wsl.localhost\<distro>\mnt\c\... — the UNC host
# prompt ("host 'wsl.localhost' was not found in the list of allowed hosts"). Derive it; never
# hardcode. Everything below depends on this being set FIRST.
if [[ -z "$WSL_DISTRO_NAME" ]] && command -v wslpath > /dev/null 2>&1; then
  _wsl_root="$(wslpath -w / 2> /dev/null)"
  _wsl_root="${_wsl_root%\\}"
  [[ "$_wsl_root" == '\\'* ]] && export WSL_DISTRO_NAME="${_wsl_root##*\\}"
  unset _wsl_root
fi
# Belt and braces for the paths we do NOT control (a raw `code`, an extension spawning the CLI):
# tell Windows-side Node that this UNC host is trusted, so the prompt cannot appear at all.
# WSLENV's /w flag is what carries the var across the WSL→Windows boundary.
export NODE_UNC_HOST_ALLOWLIST="wsl.localhost"
case ":$WSLENV:" in
  *":NODE_UNC_HOST_ALLOWLIST/w:"*) ;;
  *) export WSLENV="NODE_UNC_HOST_ALLOWLIST/w:${WSLENV:-}" ;;
esac

# ── Windows-exe symlink farm ──────────────────────────────────────────────────
# Curated allowlist, NOT full interop:
#  * Windows-ONLY tools earn a symlink into ~/.local/bin (explorer, powershell, agy, the IDE
#    launchers). The huge parent dirs stay OFF $PATH — TAB-completion over 9p is slow.
#  * Cross-platform tools (uv/uvx, codex, claude, rg …) use the LINUX install — never link their
#    .exe twins even though winget ships them; the Linux binary must win.
#  * Why symlinks and not PATH: ~/.local/bin is already on the PATH of every long-lived env
#    snapshot (herdr's server freezes its env at start and has no way to refresh it). A new
#    symlink changes directory CONTENT, not PATH — so it lands in ALL live panes instantly.
typeset -gA _WIN_EXES=(
  explorer.exe    '/mnt/c/Windows/explorer.exe'
  powershell.exe  '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
  agy.exe         '/mnt/c/Users/*/AppData/Local/Microsoft/WinGet/Packages/Google.AntigravityCLI_*/agy.exe'
  # Bare name too: `alias agy=agy.exe` only fires in an interactive zsh, but scripts resolve via
  # PATH — agents/skills/driving-antigravity/scripts/probe-models.sh gates on `command -v agy`.
  agy             '/mnt/c/Users/*/AppData/Local/Microsoft/WinGet/Packages/Google.AntigravityCLI_*/agy.exe'
  # NOT .exe files: the sh launchers VS Code / Antigravity ship FOR WSL. They self-locate via
  # `realpath "$0"`, so symlinking them is safe. Never link Code.exe / "Antigravity IDE.exe"
  # directly — that opens a Windows-side window with no remote attachment.
  code            '/mnt/c/Users/*/AppData/Local/Programs/Microsoft VS Code/bin/code'
  antigravity-ide '/mnt/c/Users/*/AppData/Local/Programs/Antigravity IDE/bin/antigravity-ide'
)
link-win-exes() {
  local name pat
  local -a hits
  mkdir -p "$HOME/.local/bin"
  for name pat in "${(@kv)_WIN_EXES}"; do
    # -e follows symlinks: a healthy link = one stat. A DANGLING link fails -e and is relinked
    # here — that self-heal is why a Windows-side reinstall or upgrade cannot rot a shim.
    [[ -e "$HOME/.local/bin/$name" ]] && continue
    hits=(${~pat}(N))
    (($#hits)) && ln -sf "$hits[1]" "$HOME/.local/bin/$name"
  done
  # Sweep shims the allowlist no longer owns AND that no longer resolve (e.g. `agy` when
  # Antigravity moved to a winget package dir). A dangling shim is worse than a missing one:
  # `command -v` fails while the name still looks present to a human.
  for name in "$HOME"/.local/bin/*(N@); do
    [[ -e "$name" ]] && continue                      # resolves → keep
    [[ -n "${_WIN_EXES[${name:t}]:-}" ]] && continue  # allowlisted → relinked above
    command rm -f -- "$name"
  done
}
link-win-exes

# Normalize `open` to the Windows file explorer, then build on it
alias open='explorer.exe'
alias o='open'
alias oo='explorer.exe .'   # open the current directory in Windows Explorer
# winget: run the real thing, then refresh the symlink farm (`link-win-exes`, above) so a
# just-installed allowlisted tool is usable in EVERY live pane immediately — PATH never changes,
# so herdr's frozen server env cannot stale it out.
winget() { winget.exe "$@"; link-win-exes; }
alias agy='agy.exe'   # Antigravity CLI: Windows-only binary (winget Google.AntigravityCLI).

# ── VS Code family: always open as a REMOTE-WSL window ────────────────────────
# `code` (VS Code) and `ide` (Antigravity IDE) both route through here.
#
# WHY NOT just call the launcher: its "am I in WSL, and where is the remote extension?" chain is
# fork-rotted and version-fragile. It shells out to the WINDOWS app to locate the extension by the
# MICROSOFT id — Antigravity ships `google.antigravity-remote-wsl` instead (never matches), and
# VS Code's own probe comes back EMPTY after an auto-update (observed 2026-07-14, right after it
# bumped its commit). On any miss the launcher hands Windows a raw /mnt/c path, which interop
# rewrites to \\wsl.localhost\... — that is the UNC-host prompt, and the window that finally opens
# is a Windows-side folder, not a remote session.
#
# Addressing the resolver DIRECTLY with a remote-authority URI skips that whole chain. Both apps
# register `onResolveRemoteAuthority:wsl`, so the URI alone makes them install/start their WSL-side
# server and attach. Verified from inside a herdr pane: window opens, server starts, no prompt.
_remote_uri_open() {
  emulate -L zsh
  local launcher=$1; shift
  local -a args
  local t

  # A flag anywhere (--wait, -d, --version, --install-extension …) → hand the launcher the call
  # untouched. Only plain path arguments get URI treatment; `git` using `code --wait` still works.
  for t in "$@"; do
    [[ $t == -* ]] && { command "$launcher" "$@"; return }
  done
  # No distro name (should be impossible — derived above) → do not forge a broken URI.
  [[ -n $WSL_DISTRO_NAME ]] || { command "$launcher" "$@"; return }

  (( $# )) || set -- "${$(git rev-parse --show-toplevel 2> /dev/null):-$PWD}"

  for t in "$@"; do
    t=${t:A}                                            # absolute, symlink-resolved
    if [[ -d $t ]]; then
      args+=(--folder-uri "vscode-remote://wsl+${WSL_DISTRO_NAME}${t}")
    else
      args+=(--file-uri "vscode-remote://wsl+${WSL_DISTRO_NAME}${t}")
    fi
  done
  command "$launcher" "${args[@]}"
}
code() { _remote_uri_open code "$@" }             # `e` / `ee` (zsh/aliases.zsh) land here
ide() { _remote_uri_open antigravity-ide "$@" }   # Antigravity IDE; its CLI is `agy`
alias start='/mnt/c/Windows/System32/cmd.exe /c start'  # abs path, NOT a bare `cmd.exe` PATH shim.
# WHY abs path: a bare `cmd.exe` on PATH makes Zed's remote-SSH probe (`cmd.exe /c ver`) exec the
# real Windows cmd via WSL interop -> Zed misdetects this Linux box as Windows. See zprofile.wsl.
alias mnt-d='sudo mount -t drvfs D: /mnt/d' # mount Windows D: drive

# ── tmux: manual attach by design ─────────────────────────────────────────────
# NO auto-attach on inbound SSH — attach on YOUR timing with `t`/`ta` (aliases in
# zsh/aliases.zsh), detach with prefix+d. A durable "auto-attach tmux on inbound
# SSH" block used to live here (so a dropped connection during long compute became
# a reattach, not a lost job). Auto-attach was unwanted — removed 2026-06-23.
# To resurrect it (gating on PTY, $SSH_CONNECTION, $NO_TMUX/~/.no-auto-tmux opt-out,
# wedged-server timeout): `git show 28e93b8 -- zsh/wsl.zsh`, or `git revert` it.
