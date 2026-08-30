#!/usr/bin/env zsh

# ============================================
# Unified Command Recommendation System
# ============================================

# Function to check if a command exists
command_exists() {
  type "$1" >/dev/null 2>&1
}

# OS detection — define once, reuse everywhere (and for the OS-specific files
# sourced at the end of this file: zsh/mac.zsh, zsh/wsl.zsh)
IS_WSL=false
IS_MAC=false
[[ "$(uname -r)" == *microsoft* ]] && IS_WSL=true
[[ "$OSTYPE" == darwin* ]]         && IS_MAC=true

# --- shadow dangling completion symlinks (must run BEFORE any compinit) ------
# Docker Desktop's WSL integration installs /usr/share/zsh/vendor-completions/_docker as a
# symlink into /mnt/wsl/docker-desktop/…; when Docker Desktop is stopped or uninstalled that
# mount is gone, the link dangles, and every full compinit prints
#   compinit:527: no such file or directory: /usr/share/zsh/vendor-completions/_docker
# The dir is root-owned, so a user shell cannot delete the link. We SHADOW it instead:
# compinit keeps the FIRST file of a given name in fpath order and skips later ones, so an
# equally-named stub in a user-owned dir at the front of fpath silences the dangling one.
# Self-healing in both directions — when the real target comes back the stub is pruned and
# the vendor completion loads again. Generic: any dangling `_*` symlink in fpath is covered.
# This lives here (not zshrc) because sheldon sources this file first, before the compinit in
# the eza block below AND before zshrc's — whichever runs first must already see the stub.
shadow_dangling_completions() {
  local dir file name
  local stubs=${XDG_CACHE_HOME:-$HOME/.cache}/zsh/stub-completions
  local -a broken
  for dir in $fpath; do
    for file in $dir/_*(N@); do            # (@) = symlinks only: nothing else can dangle
      [[ -e $file ]] || broken+=("${file:t}")
    done
  done
  [[ -d $stubs ]] || (( $#broken )) || return 0
  # Builtin rm/mkdir from zsh/files — unaffected by this repo's disabled `rm` (see CLAUDE.md);
  # they only ever touch $stubs, a cache dir generated entirely by this function.
  zmodload -F zsh/files b:zf_rm b:zf_mkdir 2>/dev/null || return 0
  zf_mkdir -p -- $stubs 2>/dev/null || return 0
  for file in $stubs/_*(N); do             # prune stubs whose real completion came back
    (( ${broken[(I)${file:t}]} )) || zf_rm -f -- $file
  done
  (( $#broken )) || return 0
  for name in $broken; do
    [[ -f $stubs/$name ]] || print -rl -- "#compdef ${name#_}" '_default "$@"' > $stubs/$name
  done
  fpath=($stubs $fpath)
}
shadow_dangling_completions
unfunction shadow_dangling_completions

# Define command recommendations with their alternatives and installation info
typeset -A COMMAND_RECOMMENDATIONS=(
  ["grep"]="rg:brew install ripgrep:cargo install ripgrep"
  ["find"]="fd:brew install fd:cargo install fd-find"
  ["du"]="dust:brew install dust:cargo install du-dust"
  ["ps"]="procs:brew install procs:cargo install procs"
  ["top"]="btop:brew install btop:cargo install bottom"
  ["htop"]="btop:brew install btop:cargo install bottom"
  ["ping"]="gping:brew install gping:cargo install gping"
  ["sed"]="sd:brew install sd:cargo install sd"
  ["cut"]="choose:brew install choose-rust:cargo install choose"
  ["man"]="tldr:brew install tldr:cargo install tealdeer"
  ["cd"]="zoxide:brew install zoxide:cargo install zoxide"
  ["tree"]="broot:brew install broot:cargo install broot"
)

# ============================================
# Essential Tool Initialization
# ============================================

# Initialize zoxide (smart directory navigation)
command_exists "zoxide" && eval "$(zoxide init zsh)"

# Initialize atuin (enhanced history management)
command_exists "atuin" && eval "$(atuin init zsh)"

# Function to get installation instructions
get_install_instructions() {
  local tool="$1"
  local info="${COMMAND_RECOMMENDATIONS[$tool]}"
  if [[ -n "$info" ]]; then
    IFS=':' read -r recommended brew_install cargo_install <<< "$info"
    echo "   Install: $brew_install (macOS) or $cargo_install (cross-platform)"
  fi
}

# Check and warn for missing recommended tools at startup
check_recommended_tools() {
  local checked_tools=()
  for cmd in ${(k)COMMAND_RECOMMENDATIONS}; do
    local info="${COMMAND_RECOMMENDATIONS[$cmd]}"
    IFS=':' read -r tool _ _ <<< "$info"
    # Avoid duplicate checks
    if [[ ! " ${checked_tools[@]} " =~ " ${tool} " ]]; then
      checked_tools+=("$tool")
      if ! command_exists "$tool"; then
        echo "⚠️  Warning: '$tool' is not installed. Consider installing it for better experience."
        get_install_instructions "$cmd"
      fi
    fi
  done
}

# Run the check on startup
check_recommended_tools

if [ -x /usr/bin/dircolors ]; then
  test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
  #alias dir='dir --color=auto'
  #alias vdir='vdir --color=auto'

  # ripgrep recommendation
  # type "rg" >/dev/null 2>&1 && echo "Using ripgrep (rg) for faster searching"
  alias fgrep='grep -F --color=auto'
  alias egrep='grep -E --color=auto'
fi

# bat for better file viewing
if ! command_exists "bat"; then
  alias bat="cat"
fi

if type lolcat >/dev/null 2>&1; then
  alias lcat='lolcat'
fi

# diff with better visualization
command_exists "delta" && alias diff='delta' || alias diff='diff --color=auto'

# cocoindex-code (ccc): provided by the PERSISTENT uv tool — installed by
# `mise run cc:install-mcp` (`uv tool install cocoindex-code[full]`), on PATH at
# ~/.local/bin/ccc. Deliberately NO uvx alias: an ephemeral `uvx --from cocoindex-code[full]`
# alias would shadow that binary and, because the ccc daemon is shared state, let an
# interactive ccc and the .mcp.json daemon (bare `ccc`, version-pinned) run one daemon at two
# client versions (skew). One binary, one home. If `ccc` is missing, run `mise run cc:install-mcp`.

# vim
# ===
command_exists "nvim" || alias nvim="vim"
alias view='nvim -R'
alias vd='nvim -d'
alias sp='nvim -o'
alias vs='nvim -O'
alias vi='vs'

alias b='bun'
alias bb='bun run build'
alias bn='bun run'


alias rgf='rg -F'

# change directory with zoxide integration
# ========================================
# zoxide replaces cd with smart directory jumping
# traditional `cd` aliases (now using zoxide)
# -----------------------------------------------
# alias ..='cd ..'    # → kept as is
# alias ...='cd ../..'
# alias ....='cd ../../..'
# alias .....='cd ../../../..'
# alias ~='cd ~'
# alias -- -='cd -'
#
# Enhanced navigation with zoxide + custom system
# ------------------------------------------------
# `,` system is kept for compatibility
# `j` for zoxide smart jumping
# `zi` for interactive directory selection
commad() {
  if [ $# -eq 0 ]; then
    pushd ~ > /dev/null
  else
    local target_path="$1"

    if [ -d "$target_path" ]; then
      pushd "$target_path" > /dev/null
    else
      local fallback_path=$(dirname "$target_path")
      pushd "$fallback_path" > /dev/null
    fi
  fi
}

# Function for popping n directories off the stack
commad_popd() {
  local n=${1:-1}
  while [ $n -gt 0 ]; do
    popd > /dev/null
    n=$((n-1))
  done
}

alias ,='z'        # Replace commad with zoxide
alias ,,='cd "$_"' # Go to directory from previous command's last argument
alias ..=', ..' # change to parent directory (now using zoxide)
alias ...=', ../..'
alias ....=', ../../..'
alias .....=', ../../../..'
alias ......=', ../../../../..'
alias ~=', ~' # change to home directory (now using zoxide)

# Directory stack navigation (popd functionality)
alias ,.='z -'           # Go to previous directory with zoxide
alias ,..='commad_popd 2' # popd twice - go back two entries in stack
alias ,...='commad_popd 3' # popd three times - go back three entries in stack

# ============================================
# Productivity Tools Integration
# ============================================

# Zoxide integration is now handled above with , alias
# Additional zoxide commands:
alias zi='zi'         # Interactive directory selection
alias zl='zoxide query --list'   # List frequent directories
alias zs='zoxide query --stats'  # Show directory statistics

# Enhanced navigation combining zoxide with existing system
,d() {
  # Jump to dotfiles subdirectory
  z ~/dotfiles/"$1"
}

,p() {
  # Jump to projects subdirectory
  z ~/projects/"$1" 2>/dev/null || z ~/Projects/"$1"
}

# Lazygit - Beautiful Git TUI
# ----------------------------
alias lg='lazygit'
alias lgd='cd ~/dotfiles && lazygit'    # Git operations in dotfiles
alias lgp=',p && lazygit'               # Git operations in projects

# Combined zoxide + lazygit
lg,() {
  if [ $# -eq 0 ]; then
    lazygit
  else
    z "$1" && lazygit
  fi
}

# Atuin - Enhanced history management
# -----------------------------------
# Note: eval "$(atuin init zsh)" should be in .zshrc
# Ctrl+R is automatically replaced by atuin
alias hs='atuin search'                 # CLI history search
alias hst='atuin stats'                 # History statistics
alias hi='atuin import auto'            # Import existing history

# Cross-platform clipboard function. Logic lives in zsh/copy-to-clipboard.sh (single source of
# truth, POSIX sh) so a non-interactive caller with no zsh functions loaded — a Claude Code
# slash command's `!command` step (/quote, /c) — can reuse the exact same
# SSH/WSL/mac/OSC-52 handling instead of a second, drifting copy. This is a thin exec wrapper.
copytoclipboard() { "${DOTFILES:-$HOME/dotfiles}/zsh/copy-to-clipboard.sh"; }

# Clipboard aliases
alias c='copytoclipboard'
alias pwdc='pwd | copytoclipboard'


# WSL/macOS-specific aliases (open, o, oo, winget, …) now live in
# zsh/wsl.zsh and zsh/mac.zsh, sourced conditionally at the end of this file.

# colored GCC warnings and errors
#export GCC_COLORS='error=01;31:warning=01;35:note=01;36:caret=01;32:locus=01:quote=01'

alias cake='cargo make'

# some more ls aliases
# alias cr='cp -R ${1%/}'

cr() {
  cp -R "${1%/}" "$2"
}

alias di='diff -u'

alias d='hunk'          # review-first diff viewer for agent-authored changesets (was: docker)
alias dc='docker-compose'

alias dl='yt-dlp'

# `e` with no args opens the git top-level (falling back to $PWD); with args, opens them.
# Editor is VS Code. On WSL it must be the `code` launcher VS Code ships FOR WSL — it opens a
# Remote-WSL window (authority wsl+$WSL_DISTRO_NAME) and returns immediately; see zsh/zprofile.wsl.
editor () {
    local target
    if [ $# -eq 0 ]; then
        target=$(git rev-parse --show-toplevel 2>/dev/null) || target=.
        [ -n "$target" ] || target=.
        set -- "$target"
    fi
    # NOT `command code`: on WSL, `code` is a FUNCTION (zsh/wsl.zsh) that opens a Remote-WSL
    # window via a remote-authority URI. Bypassing it with `command` would call the raw launcher
    # and reopen the whole UNC-path / non-remote-window failure. On mac `code` is just the binary.
    code "$@"
}


alias a="agy"
alias aa="agy ."
alias e="editor"
alias ee="editor ."

# log command
# -----------
# Export the previous command as a log
# $ ee ~/dotfiles/shell.md
# alias ee='echo "$(!!)" >> '

alias em='emacs'


ff() {
  # Usage: ff [ext] [dir=.]
  if [ -z "$1" ]; then
    echo "Usage: ff [ext] [dir=.]" >&2
    return 1
  fi
  local ext="$1"
  local dir="${2:-.}"
  if type "fd" >/dev/null 2>&1; then
    fd --type f "\.${ext}$" "$dir" --exec-batch bat {} --style=plain --paging=never
  else
    /usr/bin/find "$dir" -name "*.${ext}" | sort | xargs cat
  fi
}


# fd for better file finding
command_exists "fd" || alias fd="find"
alias f='fd'


alias g='git'

alias gr='rg'
alias grr='rg'
alias gv='rg -v'
alias gl='rg -l -i'

grl() {
  if type "rg" >/dev/null 2>&1; then
    rg "$@" -l
  else
    /usr/bin/grep "$@" -rl .
  fi
}

# Help and History management
alias h='tldr'                          # Better man pages with practical examples
alias hh='atuin search --interactive'   # Interactive history search
alias hhh='show_aliases_help'           # Show custom aliases help

# History management with atuin integration
alias ha='atuin history list'           # Show all history
alias hg='atuin search'                  # Search history

# Custom help function for our aliases
show_aliases_help() {
  cat << 'EOF'
🚀 Custom Aliases & Productivity Tools
======================================

📁 Navigation (zoxide-powered):
  ,  <dir>     Smart directory jump
  ,,           Previous directory
  ..           Parent directory
  ...          Two levels up
  ~            Home directory
  ,d <subdir>  Jump to ~/dotfiles/<subdir>
  ,p <subdir>  Jump to ~/projects/<subdir>

📚 Help & History:
  h  <cmd>     Better man pages (tldr)
  hh           Interactive history search (atuin)
  hhh          This help
  ha           Show all history
  hg <query>   Search history

🔧 Development:
  j            Just (task runner)
  lg           Lazygit (Git TUI)
  lgd          Lazygit in dotfiles
  lg, <dir>    Lazygit in specific directory
  e            Editor (VS Code; Remote-WSL on WSL)

📂 File Operations:
  l            List files (eza)
  ll           Detailed listing
  p            View file (bat)
  f            Find files (fd)
  gr           Search in files (rg)

🛠️  Modern Tools:
  zi           Interactive directory selection
  zl           List frequent directories
  zs           Directory statistics
  Ctrl+R       Enhanced history search
  fixterm      Repair a terminal wrecked by a dropped ssh / crashed TUI

💡 Tip: Most commands have enhanced modern versions!
    grep→rg, find→fd, cd→zoxide
EOF
}

# Network info
alias lip='ip -4 addr show | grep inet'
alias gip='curl -s ifconfig.me'

# alias j='jobs'
alias j='just'
alias jl='just -l'



alias kl='kill -9'

# eza for better directory listing
command_exists "eza" || alias eza="ls --color=auto"
alias l='eza -F always'
alias la='eza -A'
alias ll='eza -alF'
alias lll='eza -alF -s=mod --time-style=long-iso'
# alias lll='ll --sort=time'
alias lt='eza -FT --color=always' # tree
# alias lt='eza --tree'
alias lp='eza --absolute=on'
alias llp='eza -alF --absolute=on'

# Enable file completion for eza aliases
if command_exists "eza"; then
  # Initialize zsh completion system if not already done
  if ! type compdef >/dev/null 2>&1; then
    autoload -Uz compinit && compinit
  fi
  # Set up completion for eza aliases to use file/directory completion
  compdef '_files -/' l la ll lll lt lp llp  # -/ means files and directories
fi


alias m='mise run'
alias md='mkdir'
alias mp='mkdir -p'


alias p='bat'
# p() {
#   ext=${@##*.}
#   case $ext in
#   'md')
#     mdr $@ 2>/dev/null || cat $@
#     ;;
#   *) cat $@ ;;
#   esac
# }

# procs for better process viewing
command_exists "procs" || alias procs="ps aux"

# pp command: view file content and copy to clipboard
pp() {
  if [ $# -eq 0 ]; then
    echo "Usage: pp <file>" >&2
    return 1
  fi

  # Handle encoding for WSL
  if $IS_WSL; then
    bat "$1" | tee >(iconv -f UTF-8 -t UTF-16LE | clip.exe)
  else
    bat "$1" | copytoclipboard
  fi
}

alias s='start'

# alias sudo='sudo -E '

# Quick source and edit
# ---------------------
alias sa='. $HOME/.aliases'
# alias sa='source activate'
alias sb='. $HOME/.bashrc'
alias sz='. $HOME/.zshrc'
# sz re-reads ONLY .zshrc (interactive rc); relogin reproduces a full login by replacing
# this process with a fresh login shell — re-runs .zprofile THEN .zshrc clean, so
# direnv/sheldon hooks are re-eval'd once (not stacked) and PATH is rebuilt from scratch.
# Twin entrypoint: `mise run relogin` (mise.toml) runs the same command, and is reachable in the
# one shell where THIS alias is not — one started before the commit that defined it. It NESTS
# instead of replacing (a mise task is a child process); rationale is in mise.toml.
alias relogin='exec zsh -l'
alias rl='exec zsh -l'
alias st='tmux source-file $HOME/.tmux.conf'

alias sae='vi $HOME/.aliases'
alias sbe='vi $HOME/.bashrc'
alias sde='vi $HOME/dotfiles/nvim/dein.toml'
alias see='vi $HOME/.emacs'
alias sge='vi $HOME/.gitconfig'
alias sme='vi $HOME/dotfiles/Makefile.toml'
alias sle='vi $HOME/.latexmkrc'
alias ste='vi $HOME/.tmux.conf'
alias sve='vi $HOME/dotfiles/nvim/init.vim'
alias sze='vi $HOME/.zshrc'

# herdr
# -----
# `t` = launch-or-attach the herdr persistent session; hosts without herdr keep the old tmux attach
if command -v herdr >/dev/null 2>&1; then
  alias t='herdr'
else
  alias t='tmux a'
fi

# tmux
# ----
alias tn='tmux new -s'
alias tl='tmux ls'
alias ta='tmux a'
alias tt='tmux new-session'
alias tks='tmux kill-session -t'

# tmux multiple horizontal panes
th() {
  local n=${1:-2}
  if [ $n -lt 1 ] || [ $n -gt 6 ]; then
    echo "Usage: th [1-6]"
    return 1
  fi

  tmux new-session \; \
    run-shell "
      for i in \$(seq 2 $n); do
        tmux split-window -h
      done
    " \; \
    select-layout even-horizontal
}

alias t2='th 2'
alias t3='th 3'
alias t4='th 4'
alias t5='th 5'
alias t6='th 6'

alias to='touch'

alias tf='tail -fF'

# ============================================
# Terminal state hygiene (remote TUI / dropped ssh)
# ============================================
# A remote full-screen app (herdr, tmux, vim, an agent TUI) drives THIS terminal: it switches
# on mouse reporting + bracketed paste and moves to the alternate screen. It undoes all of that
# when it exits cleanly — but a link that dies mid-session (`client_loop: send disconnect:
# Broken pipe`) never delivers the disable sequences, so the local terminal is left mid-flight:
#   - it keeps reporting mouse motion as SGR escapes (`\e[<35;86;59M`); zle swallows the
#     leading `\e[<` and hands the rest to zsh -> `zsh: command not found: 35`
#   - it stays on the alternate screen, so the dead remote frame sits under the prompt and
#     scrollback is gone
# ssh restores the tty *modes* (termios) on exit but never the remote app's DEC private modes —
# it cannot know which were set. Only this side can undo them, so undo them here.
#
# LAW — the automatic paths WRITE ONLY; they never read the terminal. A read here would
#   (a) HANG the shell whenever fewer bytes arrive than it asked for: zsh's `read -t` bounds the
#       wait for the FIRST byte, not the whole `-k n` read (measured — see zsh/tests/),
#   (b) swallow whatever the user typed ahead while a slow connect was failing, and
#   (c) take SIGTTIN and suspend the job whenever the triggering ssh was backgrounded
#       (`ssh -N -L 8080:localhost:80 host &`), because `read -k` reads /dev/tty, not fd 0.
# So state is repaired by asserting a known-good state blind, never by asking the terminal what
# state it is in. Only `fixterm`, which the user invokes deliberately, is allowed to read.

# ONE definition of each repair — the ssh wrapper, the per-prompt hook and `fixterm` all send
# exactly these, so a newly-discovered leaking mode is added in one place. `$'…'` expands at parse
# time, so these hold real bytes and must be written with `print -r` (no second round of escapes).
# mouse: X10(9) / normal(1000) / highlight(1001) / btn-event(1002) / any-event(1003); focus
# events(1004); and the UTF-8 / SGR / urxvt / SGR-pixel encodings (1005/1006/1015/1016).
typeset -g _TERM_MODES_OFF=$'\e[?9l\e[?1000l\e[?1001l\e[?1002l\e[?1003l\e[?1004l\e[?1005l\e[?1006l\e[?1015l\e[?1016l'
# Keyboard reporting is a SECOND, independent leak with the same shape and a different alphabet:
# the Kitty keyboard protocol reports keys as `CSI code;mods:event u`, so a herdr/agent TUI that
# dies with it enabled turns every keypress AND key release into text — `;1:3u12;5:3u…` at the
# prompt (`:3` is event type 3, key release). Observed 2026-08-10 after `herdr --remote` lost its
# bridge; mouse-only repair sailed straight past it. `CSI = 0 ; 1 u` sets the CURRENT flags to 0
# (mode 1 = "set all"), which is idempotent and touches no stack, so it is safe every prompt.
# Not included: xterm modifyOtherKeys (`CSI > 4 ; 0 m`) — same failure family, but its default is
# terminal-dependent, so disabling it blind could take away key combos nothing here broke. Add it
# here if `\e[27;…~` garbage ever shows up.
typeset -g _TERM_KEYS_OFF=$'\e[=0;1u'
# Render state a crashed app leaves behind: hidden cursor, autowrap off, a stuck SGR colour, and
# G0 mapped to the line-drawing set (the "every character is a box-drawing glyph" wreck).
# Bracketed paste (2004) is deliberately absent: zle turns it on and off per line and owns it.
typeset -g _TERM_RENDER_RESET=$'\e[?25h\e[?7h\e[0m\017\e(B'
# Leave the alternate screen — 1047, NOT 1049. xterm defines the 1047 reset as "use the Normal
# Screen Buffer, clearing screen first if currently in the Alternate", i.e. CONDITIONAL, and it
# carries no DECRC cursor restore. So on a healthy terminal it is a no-op, instead of 1049l's
# restore-to-a-stale-saved-cursor that drops the next prompt over line 1. That is precisely what
# makes it safe to send blind, which is what lets this whole block avoid querying the terminal.
typeset -g _TERM_LEAVE_ALTSCREEN=$'\e[?1047l'

# Everything safe to assert at any moment: writes only, moves the cursor nowhere, touches no
# screen buffer, and is a no-op on a healthy terminal. Runs before every prompt and after ssh.
_term_restore() {
  [[ -t 1 ]] || return 0                       # piped/redirected: no terminal to fix
  print -rn -- "$_TERM_MODES_OFF$_TERM_KEYS_OFF$_TERM_RENDER_RESET"
  return 0
}

# Discard input the dead session already queued — the stray mouse escapes that would otherwise be
# run as commands. BOUNDED: a terminal that keeps feeding us (a multiplexer that ignored the
# disable, a mouse still moving) must not spin the shell forever. `fixterm` is the ONLY caller,
# because this also eats type-ahead — unacceptable on an automatic path, fine when asked for.
_term_drain() {
  [[ -t 0 ]] || return 0
  local junk i
  for (( i = 0; i < 4096; i++ )); do
    read -s -t 0 -k 1 junk 2>/dev/null || break
  done
  return 0
}

# ssh: hand the terminal back usable however the session ended. No message: on a healthy exit
# there is nothing to report, and a warning here would fire on every typo'd hostname too.
ssh() {
  command ssh "$@"
  local ec=$?
  _term_restore
  # 255 is ssh's OWN error status — a dropped link included. That is the case where the remote app
  # never got to leave the alternate screen. Sent blind; see _TERM_LEAVE_ALTSCREEN for why that is
  # safe even when we were never on it, and the LAW above for why we must not ask instead.
  (( ec == 255 )) && [[ -t 1 ]] && print -rn -- "$_TERM_LEAVE_ALTSCREEN"
  # ssh restores termios itself on every NORMAL exit, its own 255 included; only a signal kill
  # leaves the tty raw. Running `stty sane` after every ssh would fork each time and silently undo
  # a user's own `stty -ixon` / custom erase / intr, so pay for it only where it is the cure.
  (( ec >= 128 && ec != 255 )) && [[ -t 0 ]] && stty sane 2>/dev/null
  return $ec
}

# Manual sledgehammer for a terminal wrecked by anything else (a crashed TUI, a cat'ed binary, a
# killed ssh). Unlike the automatic paths this MAY read input, fork, move the cursor and clear the
# screen — you asked for it — so it finishes in a known state rather than printing the next prompt
# over whatever the stale saved cursor happened to point at.
fixterm() {
  _term_restore
  _term_drain
  [[ -t 0 ]] && stty sane 2>/dev/null
  # RIS (`\ec`) is the point of this command: the named disables above can only undo the modes we
  # already know leak, and the list has grown twice (mouse, then the Kitty keyboard protocol).
  # A full reset also takes the ones nobody has met yet — including the Kitty flag stack, which
  # RIS clears. Then pin the end state explicitly, for terminals whose RIS is partial:
  # normal screen buffer (both spellings), no scroll region, cursor home, screen cleared.
  [[ -t 1 ]] && print -rn -- $'\ec\e[?1049l\e[?1047l\e[r\e[H\e[2J'
  return 0
}

# The ssh() wrapper above only sees a TOP-LEVEL `ssh`. It cannot see an ssh that another program
# execs for you — `herdr --remote` spawns its own `ssh -F <generated config> ... remote-client-bridge`,
# so the function is bypassed entirely — nor an ssh killed by a signal, nor a locally crashed TUI.
# So assert the same safe repair before every prompt: one write, no fork, and a prompt is by
# definition a moment when no full-screen app owns the terminal. add-zsh-hook is idempotent, so
# re-sourcing this file does not stack duplicates (asserted in zsh/tests/).
autoload -Uz add-zsh-hook
add-zsh-hook precmd _term_restore

# File operation safety: cp / mv overwrite-guard
# 旧実装は silent no-clobber (cp -n / cp --update=none) で、上書きをブロックしても
# exit 0 のまま「成功」に見え、呼び出し側（特に LLM エージェント）を騙していた。
# 代わりに上書き衝突を検知したら *大声で中止 (exit 1)* し、cpf / mvf を案内する
# ── rm() が rip を案内するのと同じ思想。cpf / mvf (= command cp / mv) は強制上書き。
# OS 非依存: cp/mv のフラグを一切注入せず存在チェックを zsh 内で行うため macOS(BSD) /
# WSL(GNU) で同一挙動 → IS_MAC 分岐は不要（旧分岐の理由 -n vs --update=none は消滅）。
# 注: 従来の `cp -i`/`mv -i` プロンプトは置き換わる。明示的な -n も衝突時は大声中止に
# 昇格。再帰コピー (-r) の衝突検知は第1階層のみ（深いマージは real cp に委譲）。
unalias cp mv 2>/dev/null   # 上流に stray な `alias cp=...` が残ると関数定義がパースエラーで全滅するのを防ぐ
overwrite_guard() {
  local tool="$1"; shift
  local -a args=("$@") opts srcs conflicts
  local target="" use_t=0 no_target_dir=0 parents_flag=0
  local end_opts=0 a i n
  n=${#args[@]}
  for (( i = 1; i <= n; i++ )); do
    a="${args[i]}"
    if (( end_opts )); then
      srcs+=("$a")
    elif [[ "$a" == "--" ]]; then
      end_opts=1
    elif [[ "$a" == "--target-directory="* ]]; then
      target="${a#--target-directory=}"; use_t=1; opts+=("$a")
    elif [[ "$a" == "-t" || "$a" == "--target-directory" ]]; then
      opts+=("$a"); (( i++ )); target="${args[i]}"; use_t=1
    elif [[ "$a" == -t?* && "$a" != --* ]]; then
      target="${a#-t}"; use_t=1; opts+=("$a")   # GNU attached form: -tDEST (e.g. `cp -t/tmp/x src`)
    elif [[ "$a" == "-T" || "$a" == "--no-target-directory" ]]; then
      no_target_dir=1; opts+=("$a")
    elif [[ "$a" == "--parents" ]]; then
      parents_flag=1; opts+=("$a")   # GNU: recreates the source path under the target dir
    elif [[ "$a" == "-S" || "$a" == "--suffix" ]]; then
      opts+=("$a"); (( i++ )); opts+=("${args[i]}")
    elif [[ "$a" == -* && "$a" != "-" ]]; then
      opts+=("$a")
    else
      srcs+=("$a")
    fi
  done

  if (( ! use_t )); then
    if (( ${#srcs[@]} >= 2 )); then
      target=${srcs[-1]}; srcs=("${(@)srcs[1,-2]}")
    else
      command "$tool" "${args[@]}"; return $?   # 操作対象が足りない等は real cp/mv に委譲
    fi
  fi

  if [[ -d "$target" && $no_target_dir -eq 0 ]]; then
    local s base tdir="${target%/}" cpath
    for s in "${srcs[@]}"; do
      s="${s%/}"
      [[ -z "$s" ]] && continue
      if (( parents_flag )); then
        cpath="$tdir/${s#/}"   # --parents: GNU cp recreates the source path under target (first level only, see note above)
      else
        base="${s:t}"          # 末尾スラッシュを剥がしてから basename
        [[ -z "$base" ]] && continue
        cpath="$tdir/$base"
      fi
      [[ -e "$cpath" || -L "$cpath" ]] && conflicts+=("$cpath")
    done
  else
    [[ -e "$target" || -L "$target" ]] && conflicts+=("$target")
  fi

  if (( ${#conflicts[@]} )); then
    print -u2 "⛔ ${tool}: BLOCKED — refusing to overwrite existing path(s) (shell overwrite guard)."
    local c; for c in "${conflicts[@]}"; do print -u2 "     exists: $c"; done
    print -u2 "   This is intentional. Plain cp/mv NEVER overwrite in this shell. Do NOT retry the same command."
    print -u2 "   To overwrite on purpose, re-run with '${tool}f':  ${tool}f ${(q-)args[@]}"
    print -u2 "   (${tool}f = force overwrite via 'command ${tool}'; cannot be undone)"
    return 1
  fi
  command "$tool" "${args[@]}"
}
# Claude Code's shell-snapshot mechanism drops every function whose name starts with a
# single leading underscore (collateral of filtering zsh completion widgets `_foo`), so
# overwrite_guard must NOT be underscore-prefixed. If the snapshot strips it anyway, the
# wrappers below fail CLOSED: they refuse to run an unguarded cp/mv and return 1 — they
# never fall through to the real command. Both wrappers are generated from ONE template
# below so they cannot drift, but each generated function stays self-contained at runtime
# (no shared helper-function dependency, which would recreate the stripped-helper fragility).
() {
  local t tmpl='
__TOOL__() {
  if (( ! $+functions[overwrite_guard] )); then
    print -u2 "⛔ __TOOL__: BLOCKED — overwrite-guard helper is not loaded in this shell (snapshot stripped it)."
    print -u2 "   Refusing to run an unguarded __TOOL__. To proceed deliberately:"
    print -u2 "     __TOOL__f <args>          # force overwrite"
    print -u2 "     command __TOOL__ <args>   # vanilla __TOOL__ (overwrites!)"
    return 1
  fi
  overwrite_guard __TOOL__ "$@"
}
'
  for t in cp mv; do
    eval "${tmpl//__TOOL__/$t}"
  done
}
alias cpf='command cp'   # 強制上書き (両OS共通)
alias mvf='command mv'   # 強制上書き (両OS共通)

# rip for safer file removal
command_exists "rip" || alias rip='command rm -i'   # bypass the disabled rm() function above

# grep nudge: a NUDGE, not a block (unlike rm() above) — real grep always runs,
# unchanged args, unchanged exit status. Prints ONE suggestion line to stderr
# first, context-aware on whether $PWD is inside a cocoindex-code (ccc) project.
#
# Registry note (verified 2026-07-22): ~/.cocoindex_code/ holds daemon state
# (daemon.pid/.log/.sock) + global_settings.yml (embedding MODEL config) —
# there is no central file listing registered project roots, so a cached
# roots-list lookup isn't possible. Instead each registered project carries
# its OWN marker at its root: <root>/.cocoindex_code/settings.yml — the same
# convention as .git (confirmed against ~/Workspace/{qoed,firedancer,beateater},
# ~/DPP/min-sys-dpp-mvp, ~/ARTS/qinfogeo). Detection walks up from $PWD for
# that marker (bounded at "/"; pure zsh `[[ -f ]]` stat checks only — no ccc
# invocation, no python, no file *content* read) and caches the per-$PWD
# verdict in $_GREP_NUDGE_CCC_CACHE so repeated calls from the same directory
# are an O(1) hash lookup instead of re-walking the tree each time.
#
# Kept self-contained on purpose (no separate helper function): the cp/mv
# guard above notes Claude Code's shell-snapshot mechanism strips any
# single-underscore-prefixed FUNCTION, which would break a wrapper that
# depends on one. Only a plain global array is used here, not a helper fn.
typeset -gA _GREP_NUDGE_CCC_CACHE
grep() {
  local verdict="${_GREP_NUDGE_CCC_CACHE[$PWD]:-}"
  if [[ -z "$verdict" ]]; then
    verdict=0
    local dir="$PWD"
    while [[ -n "$dir" ]]; do
      if [[ -f "$dir/.cocoindex_code/settings.yml" ]]; then
        verdict=1
        break
      fi
      [[ "$dir" == "/" ]] && break
      dir="${dir:h}"
    done
    _GREP_NUDGE_CCC_CACHE[$PWD]=$verdict
  fi
  if [[ "$verdict" == 1 ]]; then
    print -u2 '💡 grep: this dir is ccc-indexed — try `ccc search "<query>"` (semantic) or `rg` (fast text) instead.'
  else
    print -u2 '💡 grep: try `rg` instead (fast text search).'
  fi
  command grep "$@"
}

# ============================================
# Additional Recommended Tools (not replacements)
# ============================================
typeset -A ADDITIONAL_TOOLS=(
  ["just"]="brew install just:cargo install just"
  ["fzf"]="brew install fzf:cargo install skim"
  ["lazygit"]="brew install lazygit:cargo install gitui"
  ["lazydocker"]="brew install lazydocker:go install github.com/jesseduffield/lazydocker@latest"
  ["jq"]="brew install jq:cargo install jaq"
  ["yq"]="brew install yq:pip install yq"
  ["direnv"]="brew install direnv:curl -sfL https://direnv.net/install.sh | bash"
  ["starship"]="brew install starship:cargo install starship"
  ["atuin"]="brew install atuin:cargo install atuin"
  ["mcfly"]="brew install mcfly:cargo install mcfly"
  ["navi"]="brew install navi:cargo install navi"
)

# Check additional tools
check_additional_tools() {
  echo "📦 Checking for additional recommended tools..."
  for tool in ${(k)ADDITIONAL_TOOLS}; do
    if ! command_exists "$tool"; then
      local info="${ADDITIONAL_TOOLS[$tool]}"
      IFS=':' read -r brew_install other_install <<< "$info"
      echo "💡 Consider installing '$tool':"
      echo "   Install: $brew_install (macOS) or $other_install"
    fi
  done
}

# ============================================
# Command Override Functions
# ============================================

# Generic function to handle command overrides with warnings
_command_warning() {
  local cmd="$1"
  shift
  local info="${COMMAND_RECOMMENDATIONS[$cmd]}"

  if [[ -n "$info" ]]; then
    IFS=':' read -r recommended _ _ <<< "$info"

    if ! command_exists "$recommended"; then
      echo "⚠️  Warning: '$recommended' is not installed. Install it for better experience:"
      get_install_instructions "$cmd"
      echo "   Using standard $cmd instead..."
    else
      echo "⚠️  Warning: Consider using '$recommended' instead of $cmd!"
      echo "   Proceeding with $cmd..."
    fi
  fi

  command "$cmd" "$@"
}

# Generic function for disabled commands
_command_disabled() {
  local cmd="$1"
  local info="${COMMAND_RECOMMENDATIONS[$cmd]}"

  if [[ -n "$info" ]]; then
    IFS=':' read -r recommended _ _ <<< "$info"

    echo "⛔ Error: '$cmd' command is disabled!"
    if ! command_exists "$recommended"; then
      echo "   The recommended alternative '$recommended' is not installed."
      get_install_instructions "$cmd"
    else
      echo "   Please use '$recommended' instead."
      # Show relevant aliases if applicable
      case "$cmd" in
        "ls") echo "   Aliases available: l, ll, la, lll, lt" ;;
        "grep") echo "   Aliases available: gr, grr, gv, gl" ;;
        "find") echo "   Alias available: f" ;;
        "du") echo "   Alias available: du2" ;;
        "ps") echo "   Alias available: pp" ;;
      esac
    fi
    echo "   If you really need $cmd, use the full path (e.g., /bin/$cmd, /usr/bin/$cmd)."
  fi

  return 1
}

# Special cases that don't fit the pattern
rm() {
  print -u2 "⛔ rm: BLOCKED — 'rm' is permanently disabled in this shell."
  print -u2 "   Use 'rip' for file removal (moves to trash, recoverable). Do NOT retry rm."
  return 1
}


# alias del='/bin/rm'
# if type "rmtrash" >/dev/null 2>&1; then
#   alias rm='rmtrash'
# else
#   function rm() {
#     mkdir -p $HOME/.Trash
#     mv --backup=numbered --target-directory=$HOME/.Trash "$@"
#   }
# fi
# alias rr='rm -rf'

# dust for better disk usage visualization
command_exists "dust" || alias dust="du -ah"
alias du2='dust -d 2 2>/dev/null || du -ah --max-depth=2'

alias wttr="curl wttr.in/Tokyo"

alias x='latexmk'
alias xp='latexmk -pv'
alias xx='latexmk -pvc'
alias xc='latexmk -c'


trim() {
  sed -ie 's/[ \t]*$//' "$@"
}

unpack() {
  if [ "$2" = "" ]; then
    case "$1" in
    *.zip) unzip "$1" ;;
    *.tar) tar xvf "$1" ;;
    *.tar.gz) tar zxvf "$1" ;;
    *.tgz) tar zxvf "$1" ;;
    *.tar.bz2) tar jxvf "$1" ;;
    *.tbz2) tar jxvf "$1" ;;
    *.gz) gunzip "$1" ;;
    *.Z) gunzip "$1" ;;
    *.bz2) bunzip2 "$1" ;;
    *) echo not support. ;;
    esac
  else
    mkdir "$2"
    case "$1" in
    *.zip) unzip "$1" ;;
    *.tar) tar xvf "$1" -C "$2" --strip-components 1 ;;
    *.tar.gz) tar zxvf "$1" -C "$2" --strip-components 1 ;;
    *.tgz) tar zxvf "$1" -C "$2" --strip-components 1 ;;
    *.tar.bz2) tar jxvf "$1" -C "$2" --strip-components 1 ;;
    *.tbz2) tar jxvf "$1" -C "$2" --strip-components 1 ;;
    *.gz) gunzip "$1" ;;
    *.Z) gunzip "$1" ;;
    *.bz2) bunzip2 "$1" ;;
    *) echo not support. ;;
    esac
  fi
}

alias apt-remove-force='dpkg --force-all -r'
alias cpu-temp='cat /sys/class/thermal/thermal_zone0/temp'

gpp() {
  if [ $(echo $1 | fgrep '.c') ]; then
    #gcc $1 -o ${1%.c}
    gcc $1 -o ${1/.c/.out}
  elif [ $(echo $1 | fgrep '.cpp') ]; then
    #g++ -std=c++11 $1 -o ${1%.cpp}
    g++ -std=c++11 $1 -o ${1/.cpp/.out}
  else
    :
  fi
}

colorcode() {
  for fore in $(seq 30 37); do
    printf "\e[${fore}m \\\e[${fore}m \e[m\n"
    for mode in 1 4 5; do
      printf "\e[${fore};${mode}m \\\e[${fore};${mode}m \e[m"
      for back in $(seq 40 47); do
        printf "\e[${fore};${back};${mode}m \\\e[${fore};${back};${mode}m \e[m"
      done
      echo
    done
    echo
  done
  printf " \\\e[m\n"
}



subs() {
  if [ "$3" = "" ]; then
    grep -rl $1 ./* | xargs sed -i.bak -e "s/${1}/${2}/g"
  else
    grep -rl $1 $3 | xargs sed -i.bak -e "s/${1}/${2}/g"
  fi
}

reverse-pdf() {
  orgfile=${1/.pdf/.org.pdf}
  mv "$1" "$orgfile"
  qpdf --empty "$1" --pages "$orgfile" z-1 --
}

alias mem='cat /proc/meminfo |egrep -e "Active:|Inactive:|MemFree:"'
alias git-help='echo https://qiita.com/muran001/items/f13742b51da3a22117ee'


##cat ~/.ssh/id_rsa.pub | ssh username@xx.xx.xx.xx "cat >> ~/.ssh/authorized_keys"
alias del-swp="rm ~/.local/share/nvim/swap/*"
alias enja="trans -b -sl=en -tl=ja"
alias jaen="trans -b -sl=ja -tl=en"



# start app
# =========

# `start` (and `mnt-d`) are OS-specific → defined in zsh/mac.zsh and zsh/wsl.zsh



# Temporarily disabled due to hanging issue
# if [[ -n "$(uname -r 2>/dev/null | grep -i 'microsoft' || true)" ]]; then
#   pbcopy() {
#     tee <&0 | clip.exe
#   }
# else
# fi

# ============================================
# OS-specific aliases (loaded last so they can override the common ones above)
# ============================================
$IS_MAC && [[ -f "${HOME}/dotfiles/zsh/mac.zsh" ]] && source "${HOME}/dotfiles/zsh/mac.zsh"
$IS_WSL && [[ -f "${HOME}/dotfiles/zsh/wsl.zsh" ]] && source "${HOME}/dotfiles/zsh/wsl.zsh"
