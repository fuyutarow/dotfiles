#!/usr/bin/env zsh
# Regression tests for the "Terminal state hygiene" block in zsh/aliases.zsh.
#
# Run: `mise run test:zsh` — which bounds this file with `timeout`. That bound is load-bearing:
# one of the regressions guarded here IS a hang, so "the test never finished" must read as FAIL.
#
# Why zsh and not bun (the house default): the unit under test is zsh functions whose behaviour is
# defined by tty-ness, a zle `precmd` hook, and raw DEC escape output. `zsh/zpty` gives a real pty
# in-process; Bun has no pty, so a Bun test could not reach any of the branches that matter.

emulate -L zsh
setopt no_unset
setopt extended_glob
zmodload zsh/zpty || { print -r -- "[FAIL] zsh/zpty unavailable — cannot test tty behaviour"; exit 1 }

typeset -g PASS=0 FAIL=0
typeset -g ROOT=${0:A:h:h:h}
[[ -f $ROOT/zsh/aliases.zsh ]] || { print -r -- "[FAIL] cannot locate zsh/aliases.zsh from $ROOT"; exit 1 }

# The three constants aliases.zsh defines. Duplicated ON PURPOSE: the test must fail when the
# shipped bytes change, which it cannot do if it sources the same definition it is checking.
typeset -g MODES_OFF=$'\e[?9l\e[?1000l\e[?1001l\e[?1002l\e[?1003l\e[?1004l\e[?1005l\e[?1006l\e[?1015l\e[?1016l'
typeset -g KEYS_OFF=$'\e[=0;1u'
typeset -g RENDER=$'\e[?25h\e[?7h\e[0m\017\e(B'
typeset -g ALT_OFF=$'\e[?1047l'

# `return 0` is load-bearing: `(( PASS++ ))` yields the PRE-increment value, so the very first
# `ok` would exit non-zero and the caller's `&& ok || bad` would then also run `bad`.
ok()  { print -r -- "[PASS] $1"; (( PASS++ )); return 0 }
bad() { print -r -- "[FAIL] $1"; (( FAIL++ )); return 0 }
want()    { [[ $3 == *"$2"* ]] && ok "$1" || bad "$1 (expected sequence absent)" }
wantnot() { [[ $3 != *"$2"* ]] && ok "$1" || bad "$1 (forbidden sequence present)" }

# Run shell lines inside a REAL pty with aliases.zsh loaded; return everything the terminal saw.
pty_run() {
  local out chunk line
  zpty -d TH 2>/dev/null
  zpty TH zsh -f || { print -r -- "[FAIL] zpty could not start zsh"; exit 1 }
  zpty -w TH "setopt interactive; IS_MAC=true IS_WSL=false; source $ROOT/zsh/aliases.zsh >/dev/null 2>&1"
  for line in "$@"; do zpty -w TH "$line"; done
  zpty -w TH 'exit'
  while zpty -r TH chunk; do out+=$chunk; done
  zpty -d TH 2>/dev/null
  print -r -- "$out"
}

# --- 1. the safe repair actually reaches the terminal -------------------------------------
out=$(pty_run '_term_restore; print -r -- MARK1')
want "safe repair emits the mouse-mode disable set"      "$MODES_OFF" "$out"
want "safe repair disables the Kitty keyboard protocol"  "$KEYS_OFF"  "$out"
want "safe repair emits the render reset"                "$RENDER"    "$out"
want "shell stayed alive through it"                     "MARK1"      "$out"

# --- 2. nothing on an automatic path may move the cursor or swap screen buffers ------------
# A cursor-moving sequence here means the next prompt lands on top of existing output.
out=$(pty_run 'print -r -- MARK2')
wantnot "automatic path never homes the cursor"      $'\e[H'      "$out"
wantnot "automatic path never clears the screen"     $'\e[2J'     "$out"
wantnot "automatic path never resets scroll region"  $'\e[r'      "$out"
wantnot "automatic path never sends 1049l"           $'\e[?1049l' "$out"
wantnot "automatic path never leaves alt screen"     "$ALT_OFF"   "$out"
wantnot "automatic path never issues RIS"            $'\ec'       "$out"   # RIS wipes the screen

# --- 3. ssh: exit status decides the alternate-screen repair, and passes through ------------
# Non-interactive shells must keep the executable `ssh`, never install a wrapper whose terminal
# repair dependency is only meaningful in an interactive shell.
zsh -f -c "source $ROOT/zsh/aliases.zsh >/dev/null 2>&1; type ssh; [[ \$(whence -w ssh) != 'ssh: function' ]]" \
  >/dev/null 2>&1 \
  && ok "non-interactive sourcing leaves ssh as a command" \
  || bad "non-interactive sourcing must not install the ssh wrapper"

# Bare `ssh` prints usage and exits 255 — a real 255 with no network involved.
out=$(pty_run 'ssh; print -r -- "EC=$?"')
want "ssh exit 255 leaves the alternate screen" "$ALT_OFF" "$out"
want "ssh exit 255 propagates"                  "EC=255"   "$out"

out=$(pty_run 'ssh -V; print -r -- "EC=$?"')
wantnot "ssh exit 0 does not touch the screen buffer" "$ALT_OFF" "$out"
want    "ssh exit 0 propagates"                       "EC=0"     "$out"

# --- 4. THE HANG GUARD --------------------------------------------------------------------
# The shipped-and-reverted bug: a DECRQM probe using `read -t 0.3 -k 11`. zsh's `-t` bounds the
# wait for the FIRST byte, not the whole read, so any short reply — here, the next command line
# arriving as ordinary type-ahead — left the shell blocked for the remaining bytes. If anything
# on the ssh path ever reads the terminal again, AFTER_255 never prints and `timeout` fails us.
out=$(pty_run 'ssh' 'print -r -- AFTER_255')
want "no read on the ssh path: shell survives exit 255" "AFTER_255" "$out"

# --- 5. the precmd hook is registered exactly once, however often the file is sourced -------
# `${#${(M)arr:#pat}}` is a zsh trap, and NOT atuin- or this-box-specific (root-caused 2026-09-12,
# verified directly against zsh 5.9 across 0/1/2/3-element arrays): without `@`, a nested
# substitution collapses the WHOLE array to a SCALAR (elements joined on $IFS[1]) BEFORE `:#pat`
# is applied, so `:#pat` then keeps that joined string only if the ENTIRE thing matches `pat`,
# discarding it (empty) otherwise. That can never report the match count: with exactly one hook
# registered the joined string IS `pat`, so `${#...}` reports the FUNCTION NAME'S length (13, not
# 1); with two or more hooks — atuin's, a real double-stack, or any other precmd function — the
# joined string can never equal the bare pattern, so it reports 0. Confirmed unconditional: every
# matching and non-matching shape tried printed 0 or 13, never once "1". `(@M)` keeps the filtered
# result as an array through the nesting, so `${#…}` counts elements correctly (0/1/N; verified
# for 0-, 1-of-1, 1-of-2, and 2-of-2 match shapes on a real zsh).
out=$(pty_run "source $ROOT/zsh/aliases.zsh >/dev/null 2>&1" \
              "source $ROOT/zsh/aliases.zsh >/dev/null 2>&1" \
              'print -r -- "HOOKCOUNT=${#${(@M)precmd_functions:#_term_restore}}"')
want "precmd hook does not stack on re-source" "HOOKCOUNT=1" "$out"

# --- 6. bounded drain returns instead of spinning ------------------------------------------
# `exit` rides on the SAME line: draining eats queued type-ahead, so a separately-written `exit`
# would be swallowed and the pty would never close. (That swallowing is exactly why the drain is
# confined to `fixterm` and kept off every automatic path.)
out=$(pty_run '_term_drain; print -r -- DRAINED; exit')
want "_term_drain terminates" "DRAINED" "$out"

# --- 7. fixterm is the only path allowed to move the cursor --------------------------------
out=$(pty_run 'fixterm; print -r -- FIXED; exit')   # same reason as above: fixterm drains
want "fixterm issues a full reset (RIS) for unknown modes" $'\ec'       "$out"
want "fixterm leaves the alternate screen (1049)"          $'\e[?1049l' "$out"
want "fixterm resets the scroll region"                    $'\e[r'      "$out"
want "fixterm ends in a known state"                       $'\e[H\e[2J' "$out"
want "fixterm returns"                                     "FIXED"      "$out"

# --- 8. no terminal, no output: never corrupt a pipe or a redirect --------------------------
tmp=$(mktemp) || exit 1
zsh -f -c "IS_MAC=true IS_WSL=false; source $ROOT/zsh/aliases.zsh >/dev/null 2>&1; _term_restore" \
  > $tmp 2>/dev/null
[[ -s $tmp ]] && bad "_term_restore wrote to a non-tty stdout" || ok "_term_restore is silent off-tty"
command rm -f $tmp 2>/dev/null

# --- 9. a real interactive startup survives redraws without duplicating the prompt header ----
# Use the repository zshrc and aliases in an isolated HOME/ZDOTDIR. A precmd hook records how
# many prompt generations occurred outside the pty; the distinctive `|~` in the header lets us
# count every byte-level reprint caused by WINCH/ZLE. Those counts must agree.
tmp=$(mktemp -d) || exit 1
cat >| "$tmp/.zshrc" <<EOF
cd "$tmp"
source $ROOT/zsh/aliases.zsh
source $ROOT/zsh/zshrc
# R99's active main keymap is emacs; exercise the same Ctrl-L binding.
bindkey -e
_prompt_test_count() { print -rn -- x >>| "$tmp/prompt-count" }
autoload -Uz add-zsh-hook
add-zsh-hook precmd _prompt_test_count
EOF
zpty -d PROMPT_TEST 2>/dev/null
zpty PROMPT_TEST env HOME="$tmp" ZDOTDIR="$tmp" TERM=xterm-256color zsh -i \
  || { bad "interactive prompt pty could not start"; command rm -rf "$tmp"; exit 1 }
zpty -w PROMPT_TEST 'kill -WINCH $$'
zpty -w PROMPT_TEST $'\n'
zpty -w PROMPT_TEST 'stty rows 24 cols 80; kill -WINCH $$'
zpty -w PROMPT_TEST $'\n'
zpty -w PROMPT_TEST 'print -rn -- PARTIAL'
zpty -w -n PROMPT_TEST $'\x0c'
zpty -w PROMPT_TEST $'\n'
zpty -w PROMPT_TEST 'exit'
out=''
while zpty -r PROMPT_TEST chunk; do out+=$chunk; done
zpty -d PROMPT_TEST 2>/dev/null
local_prompt_count=0
[[ -f $tmp/prompt-count ]] && local_prompt_count=$(wc -c < "$tmp/prompt-count")
header_count=0
rest=$out
header_marker=$'~\e[39m'
while [[ $rest == *"$header_marker"* ]]; do
  (( header_count++ ))
  rest=${rest#*"$header_marker"}
done
if (( header_count == local_prompt_count + 1 )); then
  ok "WINCH, empty-line, and clear-screen redraws print one header each"
else
  bad "prompt redraw duplicated or lost the header (prompts=$local_prompt_count headers=$header_count; bytes=${(qqq)out})"
fi
want "partial-line output is followed by zsh's marker" $'PARTIAL\e[1m\e[7m%\e[27m\e[1m' "$out"
clear_sequence=$'\e[H\e[2J'
after_clear=${out##*"$clear_sequence"}
# Stop at the next precmd's terminal repair. A later prompt's header cannot prove that
# Ctrl-L restored it: on R99 the widget printed the header BEFORE ZLE's deferred clear.
after_clear=${after_clear%%"$MODES_OFF"*}
want "Ctrl-L redraws the header after clearing the screen" "$header_marker" "$after_clear"
command rm -rf "$tmp" 2>/dev/null

# --- 10. assert the rendered screen, not just the stream of terminal escapes ----------------
# tmux is the terminal emulator here: a byte stream containing the header can still render a
# blank row, overwrite the buffer, or stack headers. Use a private server, never the user's.
if ! (( $+commands[tmux] )); then
  bad "tmux is required for rendered prompt regression tests (Brewfile)"
else
  zmodload zsh/zselect || exit 1
  # A timeout/startup failure must not leave a private tmux server behind.
  TRAPEXIT() {
    [[ -n ${socket-} ]] && tmux -L "$socket" kill-server 2>/dev/null
    [[ -n ${tmp-} ]] && command rm -rf "$tmp" 2>/dev/null
    return 0
  }
  plugins_script=''
  if (( $+commands[sheldon] )) && [[ -f ${XDG_DATA_HOME:-$HOME/.local/share}/sheldon/plugins.lock ]]; then
    # Replay the installed sheldon source list without linking its writable cache into the
    # throwaway HOME. The common-configs entry is replaced by this checkout's aliases below.
    plugins_script=$(sheldon source) || { bad "cannot read the installed sheldon plugin set"; exit 1 }
  fi

  # Wait for the actual expected screen/cursor, with a bounded deadline. capture-pane retains
  # the space in `$ ` with -N; ordinary capture trims it and cannot assert an empty input row.
  screen_expect() {
    local label=$1 first=$2 input=$3 cursor=$4 attempt row count header_row expected_cursor
    local supply_suggestion=${5:-false}
    local screen='' actual_cursor=''
    local expected_count=$(( (first + 1) / 2 ))
    (( first == 0 )) && expected_count=1
    local -a rows
    for attempt in {1..60}; do
      if [[ $supply_suggestion == true ]]; then
        tmux -L "$socket" send-keys -t prompt:0.0 C-x C-t
      fi
      screen=$(tmux -L "$socket" capture-pane -p -N -t prompt:0.0) || break
      rows=("${(@f)screen}")
      count=0
      header_row=$first
      for row in {1..${#rows}}; do
        if [[ ${rows[$row]} =~ $header_pattern ]]; then
          (( count++ ))
          (( first == 0 )) && header_row=$row
        fi
      done
      # Growing a tmux pane may restore older scrollback above the pair. For resize cases
      # (first=0), assert one header immediately above input and the cursor relative to it.
      expected_cursor=$cursor
      (( first == 0 )) && expected_cursor="${cursor%%,*},$header_row"
      actual_cursor=$(tmux -L "$socket" display-message -p -t prompt:0.0 '#{cursor_x},#{cursor_y}')
      if [[ ${rows[$header_row]-} =~ $header_pattern && ${rows[$(( header_row + 1 ))]-} == "$input"[[:space:]]# &&
            $count == $expected_count && $actual_cursor == "$expected_cursor" ]]; then
        ok "$variant: $label"
        return 0
      fi
      zselect -t 5
    done
    bad "$variant: $label (cursor=$actual_cursor; screen=${(qqq)screen})"
  }

  for variant in minimal sheldon; do
    if [[ $variant == sheldon && -z $plugins_script ]]; then
      print -r -- "[SKIP] sheldon rendered-screen variant: no installed plugin cache"
      continue
    fi
    tmp=$(mktemp -d) || exit 1
    socket="dotfiles-prompt-$$-$variant-${tmp:t}"
    # Quoted paths remain valid when a checkout or temporary directory contains spaces.
    {
      print -r -- "cd ${(q)tmp}"
      # Sandboxed macOS disallows nice(5); this affects mise's background hook, not ZLE.
      print -r -- 'unsetopt bgnice'
      print -r -- "source ${(q)ROOT}/zsh/aliases.zsh"
      if [[ $variant == sheldon ]]; then
        while IFS= read -r line; do
          [[ $line == *'/zsh/aliases.zsh"' ]] || print -r -- "$line"
        done <<< "$plugins_script"
      fi
      print -r -- "source ${(q)ROOT}/zsh/zshrc"
      print -r -- 'bindkey -e'
      if [[ $variant == sheldon ]]; then
        # Wait for any natural async fetch to finish before offering a known suggestion
        # through the plugin's public widget. No history or async setting is changed.
        print -r -- '_prompt_test_suggest() { [[ -n ${_ZSH_AUTOSUGGEST_ASYNC_FD-} ]] && return; zle autosuggest-suggest -- "abc tail"; }'
        print -r -- "zle -N _prompt_test_suggest; bindkey '^X^T' _prompt_test_suggest"
      fi
      print -r -- "_prompt_test_plugins() { print -r -- \"\${+functions[_zsh_autosuggest_start]} \${widgets[clear-screen]}\" >| ${(q)tmp}/plugins; }"
      print -r -- 'add-zsh-hook precmd _prompt_test_plugins'
    } >| "$tmp/.zshrc"
    # Explicit -f /dev/null ignores host tmux config and its status bar, hooks and keymaps.
    tmux -L "$socket" -f /dev/null new-session -d -x 100 -y 20 -s prompt \
      "env HOME=${(q)tmp} ZDOTDIR=${(q)tmp} XDG_CONFIG_HOME=${(q)tmp}/.config XDG_DATA_HOME=${(q)tmp}/.local/share XDG_CACHE_HOME=${(q)tmp}/.cache TERM=xterm-256color zsh -i" \
      || { bad "$variant: tmux could not start zsh"; command rm -rf "$tmp"; continue }
    header_pattern='^[^@]+@[^:]+:[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}[+-][0-9]{2}([0-9]{2})?\|~[[:space:]]*$'
    screen_expect "startup has adjacent header and input" 1 '$ ' '2,1'
    if [[ $variant == sheldon ]]; then
      [[ $(<"$tmp/plugins") == '1 user:_zsh_autosuggest_bound_'* ]] \
        && ok "sheldon: autosuggestions loaded and wrapped clear-screen" \
        || bad "sheldon: autosuggestions must wrap clear-screen"
    fi
    tmux -L "$socket" send-keys -t prompt:0.0 C-l
    screen_expect "Ctrl-L with empty buffer has no blank row" 1 '$ ' '2,1'
    tmux -L "$socket" send-keys -t prompt:0.0 -l abc
    tmux -L "$socket" send-keys -t prompt:0.0 Left Left C-l
    screen_expect "Ctrl-L preserves abc and its interior cursor" 1 '$ abc' '3,1'
    tmux -L "$socket" send-keys -t prompt:0.0 -l X
    screen_expect "typing after Ctrl-L inserts at the preserved cursor" 1 '$ aXbc' '4,1'
    tmux -L "$socket" resize-window -t prompt:0 -x 80 -y 16
    screen_expect "narrower resize leaves exactly one header" 0 '$ aXbc' '4,1'
    tmux -L "$socket" resize-window -t prompt:0 -x 120 -y 24
    screen_expect "wider resize leaves exactly one header" 0 '$ aXbc' '4,1'
    tmux -L "$socket" send-keys -t prompt:0.0 C-l
    screen_expect "Ctrl-L after resize restores rows one and two" 1 '$ aXbc' '4,1'
    tmux -L "$socket" send-keys -t prompt:0.0 C-u Enter
    screen_expect "empty Enter adds one adjacent header and input" 3 '$ ' '2,3'
    tmux -L "$socket" send-keys -t prompt:0.0 C-l
    screen_expect "Ctrl-L after empty Enter restores rows one and two" 1 '$ ' '2,1'
    if [[ $variant == sheldon ]]; then
      # The suggested suffix belongs to POSTDISPLAY; the cursor must stay after `abc`.
      tmux -L "$socket" send-keys -t prompt:0.0 -l abc
      screen_expect "autosuggestion displays its suffix" 1 '$ abc tail' '5,1' true
      tmux -L "$socket" send-keys -t prompt:0.0 C-l
      screen_expect "Ctrl-L preserves the active autosuggestion and cursor" 1 '$ abc tail' '5,1'
      tmux -L "$socket" resize-window -t prompt:0 -x 90 -y 18
      screen_expect "resize with active autosuggestion leaves one header" 0 '$ abc tail' '5,1'
    fi
    tmux -L "$socket" kill-server
    command rm -rf "$tmp" 2>/dev/null
    socket=''
    tmp=''
  done
fi

print -r -- "---"
print -r -- "passed=$PASS failed=$FAIL"
(( FAIL == 0 ))
