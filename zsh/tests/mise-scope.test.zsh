#!/usr/bin/env zsh
# Regression tests for INV-6 — NO IMPLICIT GLOBAL TOOLCHAIN.
#
# Run: `mise run test:mise-scope` — which bounds this file with `timeout`. That bound is an
# assertion: the last case boots the REAL login+interactive config in a pty, so "never
# finished" must read as FAIL, not as a pass that hung.
#
# THE LAW. A managed tool is reachable where a config DECLARES it, or not at all. mise ships
# two delivery paths and this repo keeps them apart:
#   `mise activate` (zsh/zshrc)  → INTERACTIVE shells. Per-directory, declaration-driven.
#   the shim dir    (zsh/zshenv) → NON-INTERACTIVE shells only. `ssh host 'cmd'` skips .zshrc,
#                                  so activate never runs there and a declared tool would
#                                  otherwise be unreachable.
#
# THE REGRESSION GUARDED (measured 2026-08-06). zshenv added the shim dir unconditionally, so
# both paths ran at once and every installed version squatted a name on the interactive PATH.
# What leaked was the NAME, not a version — the shim resolves the version at exec time and,
# finding no declaration, refuses. `which npm` answered with a path; `npm -V` died with
# "No version is set for shim: npm". A name that exists and cannot run.
#
# Why zsh and not bun (the house default): the unit under test is a startup file whose whole
# behaviour is a function of shell mode (`-o interactive`) and of inherited PATH. Only zsh can
# be started in those modes, and only `zsh/zpty` can give the last case a real login tty.

emulate -L zsh
setopt no_unset extended_glob

typeset -g PASS=0 FAIL=0
typeset -g ROOT=${0:A:h:h:h}
typeset -g ZSH_BIN=${commands[zsh]:-/bin/zsh}
typeset -g SHIMS="$HOME/.local/share/mise/shims"
[[ -f $ROOT/zsh/zshenv ]] || { print -r -- "[FAIL] cannot locate zsh/zshenv from $ROOT"; exit 1 }

ok()   { print -r -- "[PASS] $1"; (( PASS++ )); return 0 }
bad()  { print -r -- "[FAIL] $1"; (( FAIL++ )); return 0 }
skip() { print -r -- "[SKIP] $1"; return 0 }

# Source zshenv ALONE (zsh -f reads no startup file of its own) under a chosen shell mode and
# a chosen inherited PATH, and report the PATH it produces. $ZSH_BIN is absolute on purpose:
# the incoming PATH is the input under test and may not contain zsh at all.
env_path() {  # $1 = "" | "-i"   $2 = inherited PATH
  local flags=$1 start=$2
  if [[ -n $flags ]]; then
    PATH=$start $ZSH_BIN -f $flags -c "source ${(q)ROOT}/zsh/zshenv; print -r -- \$PATH" 2>/dev/null
  else
    PATH=$start $ZSH_BIN -f -c "source ${(q)ROOT}/zsh/zshenv; print -r -- \$PATH" 2>/dev/null
  fi
}
on_path()    { [[ ":$2:" == *":$1:"* ]] }
count_path() { local -a p=(${(s.:.)2}); print -r -- ${#${(M)p:#$1}} }

# Non-comment, non-blank lines of $1 that mention $2 — i.e. a LIVE reference, not a tombstone.
live_refs() {
  local f=$1 needle=$2 line
  [[ -f $f ]] || return 0
  while IFS= read -r line; do
    [[ $line == [[:space:]]#(\#|//)* ]] && continue
    [[ -z ${line//[[:space:]]/} ]] && continue
    [[ $line == *$needle* ]] && print -r -- "${f:t}: $line"
  done < $f
}

typeset -g BASE=/usr/bin:/bin:/usr/sbin:/sbin

# --- 1. the non-interactive contract: the shim dir IS delivered -----------------------------
# This is `ssh host 'cmd'`. It reads only .zshenv, so without the shim dir a DECLARED tool
# would be unreachable over ssh — the one job the shim dir still has.
out=$(env_path "" $BASE)
on_path $SHIMS "$out" && ok "non-interactive: shim dir is on PATH" \
                      || bad "non-interactive: shim dir MISSING — ssh host 'cmd' loses every declared tool"

# --- 2. the interactive contract: the shim dir is WITHHELD ----------------------------------
# The regression itself. Interactive shells get tools from `mise activate` only.
out=$(env_path "-i" $BASE)
on_path $SHIMS "$out" && bad "interactive: shim dir LEAKED onto PATH (INV-6 violated)" \
                      || ok "interactive: shim dir is withheld"

# --- 3. ~/.local/bin is unconditional in both modes ------------------------------------------
# Narrowing the shim dir must not narrow the reason .zshenv exists: standalone CLIs
# (codex, claude, ccc, uv) must stay visible to `ssh host 'cmd'`.
if [[ -d $HOME/.local/bin ]]; then
  out=$(env_path "" $BASE)
  on_path "$HOME/.local/bin" "$out" && ok "non-interactive: ~/.local/bin still delivered" \
                                    || bad "non-interactive: ~/.local/bin lost"
  out=$(env_path "-i" $BASE)
  on_path "$HOME/.local/bin" "$out" && ok "interactive: ~/.local/bin still delivered" \
                                    || bad "interactive: ~/.local/bin lost"
else
  skip "~/.local/bin absent on this machine"
fi

# --- 4. inheritance cannot smuggle the shim dir in -------------------------------------------
# An interactive shell inherits PATH from whatever spawned it: the tmux server, an editor, a
# non-interactive parent that legitimately had the shim dir. Gating the ADD is not enough —
# .zshenv must also STRIP, or the gate is decorative.
out=$(env_path "-i" "$SHIMS:$BASE")
on_path $SHIMS "$out" && bad "interactive: inherited shim dir survived (strip is missing)" \
                      || ok "interactive: inherited shim dir is stripped"

# --- 4b. the SECOND carrier: mise's own stashed base PATH ------------------------------------
# `mise activate` exports __MISE_ORIG_PATH and reuses an inherited one verbatim, rebuilding
# PATH from it on every hook. Stripping $path alone is therefore not enough: mise restores the
# shim dir one prompt later. Caught by case 9 on 2026-08-06, pinned hermetically here.
out=$(__MISE_ORIG_PATH="$SHIMS:$BASE" $ZSH_BIN -f -i \
        -c "source ${(q)ROOT}/zsh/zshenv; print -r -- \$__MISE_ORIG_PATH" 2>/dev/null)
on_path $SHIMS "$out" && bad "interactive: shim dir survives in __MISE_ORIG_PATH (mise will restore it)" \
                      || ok "interactive: shim dir stripped from __MISE_ORIG_PATH too"
out=$(__MISE_ORIG_PATH="$SHIMS:$BASE" $ZSH_BIN -f \
        -c "source ${(q)ROOT}/zsh/zshenv; print -r -- \$__MISE_ORIG_PATH" 2>/dev/null)
on_path $SHIMS "$out" && ok "non-interactive: __MISE_ORIG_PATH left intact" \
                      || bad "non-interactive: __MISE_ORIG_PATH was stripped — ssh-cmd delivery weakened"

# --- 5. re-entry does not duplicate the entry ------------------------------------------------
# .zshenv is read again by every nested zsh; a strip-then-prepend that failed to strip would
# grow PATH without bound.
out=$(env_path "" "$SHIMS:$BASE")
n=$(count_path $SHIMS "$out")
[[ $n == 1 ]] && ok "non-interactive: shim dir appears exactly once on re-entry" \
              || bad "non-interactive: shim dir appears $n times (strip-then-prepend broken)"

# --- 6. no global default version anywhere ---------------------------------------------------
# The other way to get an implicit global: declare it. `mise use -g` writes [tools] into the
# global config, at which point every squatting shim starts silently WORKING — which is worse
# than today's honest failure, because the version is then chosen by nobody.
typeset -g GCFG=${XDG_CONFIG_HOME:-$HOME/.config}/mise/config.toml
if [[ -f $GCFG && -s $GCFG ]]; then
  gcontent="$(<$GCFG)"
  [[ $gcontent == *'[tools]'* ]] && bad "global mise config declares [tools] — implicit global toolchain" \
                                 || ok "global mise config declares no [tools]"
else
  ok "global mise config declares nothing (absent or empty)"
fi
[[ -e $HOME/.tool-versions ]] && bad "~/.tool-versions exists — a global default by another name" \
                              || ok "no ~/.tool-versions"

# --- 7. no second version manager hooks a login shell ----------------------------------------
# fnm was removed 2026-08-06: it held no node (`fnm list` → only `* system`) yet ran `fnm env`
# on every login, prepending a PATH entry no config asked for and leaving 1672 stale dirs in
# ~/.local/state/fnm_multishells. Tombstone COMMENTS are fine; live references are not.
for tool in fnm nvm volta nodenv asdf; do
  refs=""
  for f in $ROOT/zsh/zprofile.mac $ROOT/zsh/zprofile.wsl $ROOT/zsh/zshenv $ROOT/zsh/zshrc $ROOT/Brewfile; do
    refs+="$(live_refs $f $tool)"
  done
  [[ -n $refs ]] && bad "live '$tool' reference in shell startup: $refs" \
                 || ok "no live '$tool' reference in shell startup"
done
refs=""
for f in $ROOT/zsh/zprofile.mac $ROOT/zsh/zprofile.wsl $ROOT/zsh/zshenv $ROOT/zsh/zshrc; do
  refs+="$(live_refs $f 'use -g')$(live_refs $f 'use --global')"
done
[[ -n $refs ]] && bad "shell startup runs a global mise pin: $refs" \
               || ok "shell startup never runs 'mise use -g'"

# --- 8. end to end, in the real ssh-cmd environment ------------------------------------------
# Declared → runs. Undeclared → refuses. Both halves matter: the first is why the shim dir
# survives at all, the second IS the law.
if [[ -d $SHIMS && -f $ROOT/mise.toml && -e $SHIMS/bun ]]; then
  out=$(env -i HOME=$HOME TERM=dumb PATH=$BASE $ZSH_BIN -c "cd ${(q)ROOT} && bun --version" 2>&1)
  [[ $out == [0-9]*.[0-9]* ]] && ok "ssh-cmd env, declared dir: bun runs ($out)" \
                              || bad "ssh-cmd env, declared dir: bun did not run ($out)"
  out=$(env -i HOME=$HOME TERM=dumb PATH=$BASE $ZSH_BIN -c "cd ${(q)HOME} && bun --version" 2>&1)
  [[ $out == *"No version is set"* ]] && ok "ssh-cmd env, undeclared dir: bun correctly refuses" \
                                      || bad "ssh-cmd env, undeclared dir: bun resolved anyway ($out)"
else
  skip "mise shim dir or bun shim absent — end-to-end delivery cases not run"
fi

# --- 9. THE USER-VISIBLE CASE: a real login+interactive shell, in $HOME -----------------------
# Cases 1-8 test zshenv in isolation. This one boots the WHOLE chain — zshenv, zprofile
# (Homebrew, sheldon, direnv), zshrc (mise activate), the final PATH-hygiene pass — in a real
# pty, because any one of those files could re-add the shim dir after zshenv withheld it.
# This is the exact shell the user types in, at the exact directory where nothing is declared.
if zmodload zsh/zpty 2>/dev/null; then
  probe='print -r -- "SHIMS_ON_PATH=$([[ ":$PATH:" == *":$HOME/.local/share/mise/shims:"* ]] && echo YES || echo NO)"'
  out=""
  zpty -d MS 2>/dev/null
  if zpty MS $ZSH_BIN -l -i; then
    zpty -w MS "cd $HOME"
    zpty -w MS $probe
    zpty -w MS 'exit'
    while zpty -r MS chunk; do out+=$chunk; done
    zpty -d MS 2>/dev/null
    case $out in
      *SHIMS_ON_PATH=NO*)  ok  "real login+interactive shell in \$HOME: no shim dir on PATH" ;;
      *SHIMS_ON_PATH=YES*) bad "real login+interactive shell in \$HOME: shim dir LEAKED — some later startup file re-adds it" ;;
      *)                   bad "real login+interactive shell in \$HOME: probe never reported" ;;
    esac
  else
    skip "zpty could not start a login shell"
  fi
else
  skip "zsh/zpty unavailable — real-shell case not run"
fi

print -r -- "---"
print -r -- "passed=$PASS failed=$FAIL"
(( FAIL == 0 ))
