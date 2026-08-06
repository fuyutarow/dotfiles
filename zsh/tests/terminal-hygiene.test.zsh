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
zmodload zsh/zpty || { print -r -- "[FAIL] zsh/zpty unavailable — cannot test tty behaviour"; exit 1 }

typeset -g PASS=0 FAIL=0
typeset -g ROOT=${0:A:h:h:h}
[[ -f $ROOT/zsh/aliases.zsh ]] || { print -r -- "[FAIL] cannot locate zsh/aliases.zsh from $ROOT"; exit 1 }

# The three constants aliases.zsh defines. Duplicated ON PURPOSE: the test must fail when the
# shipped bytes change, which it cannot do if it sources the same definition it is checking.
typeset -g MODES_OFF=$'\e[?9l\e[?1000l\e[?1001l\e[?1002l\e[?1003l\e[?1004l\e[?1005l\e[?1006l\e[?1015l\e[?1016l'
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
  zpty -w TH "IS_MAC=true IS_WSL=false; source $ROOT/zsh/aliases.zsh >/dev/null 2>&1"
  for line in "$@"; do zpty -w TH "$line"; done
  zpty -w TH 'exit'
  while zpty -r TH chunk; do out+=$chunk; done
  zpty -d TH 2>/dev/null
  print -r -- "$out"
}

# --- 1. the safe repair actually reaches the terminal -------------------------------------
out=$(pty_run '_term_restore; print -r -- MARK1')
want "safe repair emits the mode-disable set"   "$MODES_OFF" "$out"
want "safe repair emits the render reset"       "$RENDER"    "$out"
want "shell stayed alive through it"            "MARK1"      "$out"

# --- 2. nothing on an automatic path may move the cursor or swap screen buffers ------------
# A cursor-moving sequence here means the next prompt lands on top of existing output.
out=$(pty_run 'print -r -- MARK2')
wantnot "automatic path never homes the cursor"      $'\e[H'      "$out"
wantnot "automatic path never clears the screen"     $'\e[2J'     "$out"
wantnot "automatic path never resets scroll region"  $'\e[r'      "$out"
wantnot "automatic path never sends 1049l"           $'\e[?1049l' "$out"
wantnot "automatic path never leaves alt screen"     "$ALT_OFF"   "$out"

# --- 3. ssh: exit status decides the alternate-screen repair, and passes through ------------
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
out=$(pty_run "source $ROOT/zsh/aliases.zsh >/dev/null 2>&1" \
              "source $ROOT/zsh/aliases.zsh >/dev/null 2>&1" \
              'print -r -- "HOOKCOUNT=${#${(M)precmd_functions:#_term_restore}}"')
want "precmd hook does not stack on re-source" "HOOKCOUNT=1" "$out"

# --- 6. bounded drain returns instead of spinning ------------------------------------------
# `exit` rides on the SAME line: draining eats queued type-ahead, so a separately-written `exit`
# would be swallowed and the pty would never close. (That swallowing is exactly why the drain is
# confined to `fixterm` and kept off every automatic path.)
out=$(pty_run '_term_drain; print -r -- DRAINED; exit')
want "_term_drain terminates" "DRAINED" "$out"

# --- 7. fixterm is the only path allowed to move the cursor --------------------------------
out=$(pty_run 'fixterm; print -r -- FIXED; exit')   # same reason as above: fixterm drains
want "fixterm leaves the alternate screen (1049)" $'\e[?1049l' "$out"
want "fixterm resets the scroll region"           $'\e[r'      "$out"
want "fixterm ends in a known state"              $'\e[H\e[2J' "$out"
want "fixterm returns"                            "FIXED"      "$out"

# --- 8. no terminal, no output: never corrupt a pipe or a redirect --------------------------
tmp=$(mktemp) || exit 1
zsh -f -c "IS_MAC=true IS_WSL=false; source $ROOT/zsh/aliases.zsh >/dev/null 2>&1; _term_restore" \
  > $tmp 2>/dev/null
[[ -s $tmp ]] && bad "_term_restore wrote to a non-tty stdout" || ok "_term_restore is silent off-tty"
command rm -f $tmp 2>/dev/null

print -r -- "---"
print -r -- "passed=$PASS failed=$FAIL"
(( FAIL == 0 ))
