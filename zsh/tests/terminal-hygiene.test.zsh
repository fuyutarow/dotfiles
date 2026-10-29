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
zmodload zsh/datetime || { print -r -- "[FAIL] zsh/datetime unavailable — cannot time test cases"; exit 1 }

typeset -g PASS=0 FAIL=0
typeset -g CASE_STARTED_AT=$EPOCHREALTIME
typeset -g ROOT=${0:A:h:h:h}
[[ -f $ROOT/zsh/aliases.zsh ]] || { print -r -- "[FAIL] cannot locate zsh/aliases.zsh from $ROOT"; exit 1 }

# The three constants aliases.zsh defines. Duplicated ON PURPOSE: the test must fail when the
# shipped bytes change, which it cannot do if it sources the same definition it is checking.
typeset -g MODES_OFF=$'\e[?9l\e[?1000l\e[?1001l\e[?1002l\e[?1003l\e[?1004l\e[?1005l\e[?1006l\e[?1015l\e[?1016l'
typeset -g KEYS_OFF=$'\e[=0;1u'
typeset -g RENDER=$'\e[?25h\e[?7h\e[0m\017\e(B'
typeset -g ALT_OFF=$'\e[?1047l'

case_time() {
  local label=$1 elapsed
  printf -v elapsed '%.3f' $(( EPOCHREALTIME - CASE_STARTED_AT ))
  print -r -- "[TIME] ${elapsed}s case=$label"
  CASE_STARTED_AT=$EPOCHREALTIME
}
# `return 0` is load-bearing: `(( PASS++ ))` yields the PRE-increment value, so the very first
# `ok` would exit non-zero and the caller's `&& ok || bad` would then also run `bad`.
ok()  { case_time "$1"; print -r -- "[PASS] $1"; (( PASS++ )); return 0 }
bad() { case_time "$1"; print -r -- "[FAIL] $1"; (( FAIL++ )); return 0 }
want()    { [[ $3 == *"$2"* ]] && ok "$1" || bad "$1 (expected sequence absent)" }
wantnot() { [[ $3 != *"$2"* ]] && ok "$1" || bad "$1 (forbidden sequence present)" }

source "$ROOT/zsh/tests/clipboard-routing.test.zsh"
source "$ROOT/zsh/tests/role-readers.test.zsh"

# --- role.env gates sccache without executing the role declaration -----------------------------
role_home=$(mktemp -d) || exit 1
role_missing_home=$(mktemp -d) || exit 1
mkdir -p "$role_home/.config/dotfiles"
role_profile() {
  local profile=$1 role_value=$2 expected=$3 out config_home=$role_home/.config
  if [[ $role_value == absent ]]; then
    config_home=$role_missing_home/.config
  else
    print -r -- "$role_value" >| "$role_home/.config/dotfiles/role.env"
  fi
  out=$(env -i HOME="$role_home" XDG_CONFIG_HOME="$config_home" PATH="/usr/bin:/bin" \
    RUSTC_WRAPPER=sentinel PROFILE="$ROOT/zsh/zprofile.$profile" \
    zsh -f -c 'source "$PROFILE" >/dev/null 2>&1; print -r -- "WRAPPER=${RUSTC_WRAPPER-unset}"' 2>/dev/null)
  [[ $out == "WRAPPER=$expected" ]] && ok "$profile role sccache=$role_value -> $expected" \
    || bad "$profile role sccache=$role_value -> $out (expected $expected)"
}
for profile in mac wsl; do
  role_profile "$profile" 'DOTFILES_ROLE_RUSTC_WRAPPER=sccache' sccache
  role_profile "$profile" 'DOTFILES_ROLE_RUSTC_WRAPPER=none' unset
  role_profile "$profile" absent sccache
done
for profile in mac wsl; do
  role_profile "$profile" $'DOTFILES_ROLE_RUSTC_WRAPPER=sccache\nprint -r -- ROLE_ENV_EXECUTED > "$HOME/role-env-executed"' sccache
done
[[ ! -e $role_home/role-env-executed ]] && ok "role.env is read as data, not sourced" \
  || bad "role.env was executed by profile"
rip "$role_home" "$role_missing_home" >/dev/null 2>&1

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

# --- Atuin opens on Ctrl+R only; terminal wheel-up remains zsh history -----------------------
if (( $+commands[atuin] )); then
  out=$(pty_run 'stty -echo' \
    "widget=\$(bindkey '^R'); widget=\${widget##* }; [[ \$widget == *atuin* ]] && print -r -- CTRL_R_ATUIN || print -r -- CTRL_R_OTHER")
  want "Ctrl+R remains bound to an atuin widget" 'CTRL_R_ATUIN' "$out"
  out=$(pty_run 'stty -echo' \
    "widget=\$(bindkey '^[[A'); widget=\${widget##* }; [[ \$widget == *atuin* ]] && print -r -- CSI_UP_ATUIN || print -r -- CSI_UP_NO_ATUIN")
  want "Up-arrow CSI sequence has no atuin widget" 'CSI_UP_NO_ATUIN' "$out"
  out=$(pty_run 'stty -echo' \
    "widget=\$(bindkey '^[OA'); widget=\${widget##* }; [[ \$widget == *atuin* ]] && print -r -- SS3_UP_ATUIN || print -r -- SS3_UP_NO_ATUIN")
  want "Up-arrow SS3 sequence has no atuin widget" 'SS3_UP_NO_ATUIN' "$out"
else
  print -r -- "[SKIP] atuin key bindings not checked — atuin is not installed"
fi

# Exercise zshenv's missing-command handler against the repository declarations in a real pty.
tool_home=$(mktemp -d) || exit 1
mkdir -p "$tool_home/.config/dotfiles" "$tool_home/empty-bin"
print -r -- "$tool_home/no-brew-prefix" >| "$tool_home/.config/dotfiles/brew-prefix"

tool_pty_run() {
  local requested="$1" out chunk
  zpty -d TOOL_NOT_FOUND 2>/dev/null
  zpty TOOL_NOT_FOUND zsh -f || { print -r -- "[FAIL] zpty could not start zshenv probe"; exit 1 }
  zpty -w TOOL_NOT_FOUND "export HOME=${(q)tool_home} PATH=${(q)tool_home}/empty-bin LANG= LC_ALL="
  zpty -w TOOL_NOT_FOUND "source ${(q)ROOT}/zsh/zshenv"
  zpty -w TOOL_NOT_FOUND "$requested"
  zpty -w TOOL_NOT_FOUND 'print -r -- STATUS=$?'
  zpty -w TOOL_NOT_FOUND 'exit'
  while zpty -r TOOL_NOT_FOUND chunk; do out+=$chunk; done
  zpty -d TOOL_NOT_FOUND 2>/dev/null
  print -r -- "$out"
}

out=$(tool_pty_run pdftoppm)
want "zshenv explains a missing on-demand command" \
  'zsh: pdftoppm is declared on-demand (formula poppler) → mise run tool:get pdftoppm' "$out"
want "on-demand missing command returns 127" 'STATUS=127' "$out"
out=$(tool_pty_run bun)
want "zshenv explains a missing core command" \
  'zsh: bun is a core tool but missing → mise run install:tools' "$out"
want "core missing command returns 127" 'STATUS=127' "$out"
out=$(tool_pty_run tool-tier-unknown-command)
want "zshenv preserves the normal missing-command message" \
  'zsh: command not found: tool-tier-unknown-command' "$out"
want "undeclared missing command returns 127" 'STATUS=127' "$out"
command rm -rf "$tool_home"

# Match the non-interactive command shell used by agent Bash and ssh: source zshenv, then run the
# missing command in one `zsh -f -c` invocation. CWD discovery must find this workspace's files.
notfound_path=$(mktemp -d) || exit 1
mkdir -p "$notfound_path/home/.config/dotfiles"
print -r -- "$notfound_path/no-brew-prefix" >| "$notfound_path/home/.config/dotfiles/brew-prefix"
typeset zsh_bin=${commands[zsh]}
typeset tool_probe="source $ROOT/zsh/zshenv; pdftoppm -v"
zpty -d TOOL_COMMAND_SHELL 2>/dev/null
zpty TOOL_COMMAND_SHELL zsh -f || { print -r -- "[FAIL] could not start pty wrapper"; exit 1 }
zpty -w TOOL_COMMAND_SHELL "export HOME=${(q)notfound_path}/home PATH=${(q)notfound_path} LANG= LC_ALL="
zpty -w TOOL_COMMAND_SHELL 'cd /tmp'
zpty -w TOOL_COMMAND_SHELL "exec ${(q)zsh_bin} -f -c ${(q)tool_probe}"
zpty -w TOOL_COMMAND_SHELL 'exit'
out=""
while zpty -r TOOL_COMMAND_SHELL chunk; do out+=$chunk; done
zpty -d TOOL_COMMAND_SHELL 2>/dev/null
want "non-interactive zshenv lookup finds the workspace on-demand formula" \
  'zsh: pdftoppm is declared on-demand (formula poppler) → mise run tool:get pdftoppm' "$out"
command rm -rf "$notfound_path"
unset zsh_bin tool_probe

rip_missing_tmp=$(mktemp -d) || exit 1
mkdir -p "$rip_missing_tmp/bin"
print -r -- '#!/bin/sh' "printf 'RM_CALLED\\n'" >| "$rip_missing_tmp/bin/rm"
chmod +x "$rip_missing_tmp/bin/rm"
# Queue only the commands under test through the pty. Typing the expanded PATH while no
# output is being drained can fill the terminal queues and block a later zpty -w on macOS.
out=$(PATH="$rip_missing_tmp/bin:$PATH" pty_run \
              'whence() { return 1 }' \
              'rip; print -r -- STATUS=$?')
want "rip refuses loudly when its binary is missing" \
  'rip missing: mise run install:tools' "$out"
want "rip missing reports 127" 'STATUS=127' "$out"
wantnot "rip never invokes rm as a fallback" 'RM_CALLED' "$out"
command rm -rf "$rip_missing_tmp"

# --- rip graveyard is disk-backed and follows XDG data home -------------------------------
out=$(env -u GRAVEYARD -u RIP_GRAVEYARD ZSHENV_FILE="$ROOT/zsh/zshenv" zsh -f -c \
  'source "$ZSHENV_FILE"; print -r -- "GRAVEYARD=$GRAVEYARD RIP_GRAVEYARD=$RIP_GRAVEYARD"')
want "rip graveyard uses the home data directory by default" \
  "GRAVEYARD=$HOME/.local/share/graveyard RIP_GRAVEYARD=$HOME/.local/share/graveyard" "$out"
graveyard_xdg="${TMPDIR:-/tmp}/rip-graveyard-xdg"
out=$(env -u GRAVEYARD -u RIP_GRAVEYARD XDG_DATA_HOME="$graveyard_xdg" \
  ZSHENV_FILE="$ROOT/zsh/zshenv" zsh -f -c \
  'source "$ZSHENV_FILE"; print -r -- "GRAVEYARD=$GRAVEYARD RIP_GRAVEYARD=$RIP_GRAVEYARD"')
want "rip graveyard follows XDG_DATA_HOME" \
  "GRAVEYARD=$graveyard_xdg/graveyard RIP_GRAVEYARD=$graveyard_xdg/graveyard" "$out"

# The shell guard is tested with a fake filesystem probe, so it is portable to hosts where /tmp
# is disk-backed. The target must remain in place when the selected graveyard is RAM-backed.
rip_guard_tmp=$(mktemp -d) || exit 1
mkdir -p "$rip_guard_tmp/bin"
print -r -- '#!/bin/sh' 'printf tmpfs' >| "$rip_guard_tmp/bin/stat"
chmod +x "$rip_guard_tmp/bin/stat"
print -r -- 'keep' >| "$rip_guard_tmp/target"
typeset rip_bin=${commands[rip]:-}
typeset rip_path=${rip_bin:h}
out=$(PATH="$rip_guard_tmp/bin:$rip_path:$PATH" pty_run \
              'rehash' \
              "rip --graveyard ${(q)rip_guard_tmp}/graveyard ${(q)rip_guard_tmp}/target; print -r -- STATUS=\$?")
want "rip reports an unsafe graveyard" 'rip:' "$out"
want "rip refuses an unsafe graveyard" 'refusing removal' "$out"
want "rip reports refusal to its caller" 'STATUS=1' "$out"
[[ -f "$rip_guard_tmp/target" ]] && ok "rip leaves the target in place" || bad "rip removed the guarded target"
command rm -rf "$rip_guard_tmp"

# --- cp convenience aliases still use the overwrite guard ---------------------------------
copy_tmp=$(mktemp -d) || exit 1
print -r -- 'source' >| "$copy_tmp/source"
chmod 744 "$copy_tmp/source"
print -r -- 'keep' >| "$copy_tmp/existing"
out=$(pty_run "cd ${(q)copy_tmp}" \
              "source ${(q)ROOT}/zsh/aliases.zsh >/dev/null 2>&1" \
              'cpa source existing; print -r -- "BLOCK=$?"' \
              'cpa source free-copy; print -r -- "COPY=$?"')
want "cpa refuses to overwrite an existing file" 'BLOCK=1' "$out"
want "cpa copies to a free destination" 'COPY=0' "$out"
[[ $(<"$copy_tmp/existing") == keep ]] && ok "cpa leaves the existing file unchanged" || bad "cpa changed the existing file"
[[ -x "$copy_tmp/free-copy" ]] && ok "cpa preserves executable permissions" || bad "cpa did not preserve executable permissions"
command rm -rf "$copy_tmp"

# --- Mac core PATH precedence: real login and interactive ptys, isolated HOME ---------------
# Relocate the Apple Silicon prefix into the fixture; never write /opt/homebrew or the real HOME.
core_tmp=$(mktemp -d) || exit 1
core_home="$core_tmp/home"
core_prefix="$core_tmp/opt/homebrew"
mkdir -p "$core_home/.local/bin" "$core_home/.bun/bin" "$core_home/.cargo" \
  "$core_home/.config/dotfiles" "$core_prefix/bin" "$core_prefix/sbin" \
  "$core_prefix/opt/rustup/bin" "$core_home/.local/share/mise/shims"
print -r -- "$core_prefix" >| "$core_home/.config/dotfiles/brew-prefix"
print -r -- 'export PATH="$HOME/.local/bin:$PATH"' >| "$core_home/.cargo/env"
for core_cmd in bun uv uvx; do
  for core_bin in "$core_prefix/bin" "$core_home/.local/bin" "$core_home/.bun/bin"; do
    print -r -- '#!/bin/sh' 'exit 0' >| "$core_bin/$core_cmd"
    chmod +x "$core_bin/$core_cmd"
  done
done
print -r -- '#!/bin/sh' 'exit 0' >| "$core_home/.local/bin/standalone-agent"
chmod +x "$core_home/.local/bin/standalone-agent"
for core_cmd in sheldon direnv mise; do
  print -r -- '#!/bin/sh' 'exit 0' >| "$core_prefix/bin/$core_cmd"
  chmod +x "$core_prefix/bin/$core_cmd"
done
cat >| "$core_prefix/bin/brew" <<'EOF'
#!/bin/sh
printf 'export PATH="%s/bin:%s/sbin:$PATH"\n' "$HOMEBREW_PREFIX" "$HOMEBREW_PREFIX"
EOF
chmod +x "$core_prefix/bin/brew"
ln -s "$ROOT/zsh/zshenv" "$core_home/.zshenv"
ln -s "$ROOT/zsh/zshrc" "$core_home/.zshrc"
sed "s|/opt/homebrew|$core_prefix|g; s|/usr/local|$core_tmp/usr/local|g" \
  "$ROOT/zsh/zprofile.mac" >| "$core_home/.zprofile"
for core_mode in -lc -lic -ic -c; do
  core_probe='command -v bun uv uvx standalone-agent; print -r -- "SHIMS=${path[(Ie)$HOME/.local/share/mise/shims]}"'
  # zpty's command is shell text: quote the compound -c argument explicitly. Keep the parent
  # alive until the probe is queued, as with pty_run below, so a short-lived child is drained.
  zpty CORE_PATH zsh -f
  zpty -w CORE_PATH "env -i HOME=${(q)core_home} ZDOTDIR=${(q)core_home} PATH=${(q)core_home}/.local/bin:/usr/bin:/bin TERM=xterm-256color zsh $core_mode ${(q)core_probe}; exit"
  core_out=''
  while zpty -r CORE_PATH core_chunk; do core_out+=$core_chunk; done
  zpty -d CORE_PATH 2>/dev/null
  for core_cmd in bun uv uvx; do
    want "Mac-shaped $core_mode resolves $core_cmd under /opt/homebrew" "$core_prefix/bin/$core_cmd" "$core_out"
    wantnot "Mac-shaped $core_mode never resolves legacy $core_cmd" "$core_home/.local/bin/$core_cmd" "$core_out"
  done
  want "Mac-shaped $core_mode keeps standalone user commands reachable" \
    "$core_home/.local/bin/standalone-agent" "$core_out"
  if [[ $core_mode == *i* ]]; then
    want "Mac-shaped $core_mode excludes mise shims" 'SHIMS=0' "$core_out"
  else
    wantnot "Mac-shaped $core_mode retains non-interactive mise shims" 'SHIMS=0' "$core_out"
  fi
done
rip --graveyard "$core_tmp-graveyard" "$core_tmp" >/dev/null

# --- 1. the safe repair actually reaches the terminal -------------------------------------
out=$(pty_run '_term_restore; print -r -- MARK1')
want "safe repair emits the mouse-mode disable set"      "$MODES_OFF" "$out"
want "safe repair disables the Kitty keyboard protocol"  "$KEYS_OFF"  "$out"
want "safe repair emits the render reset"                "$RENDER"    "$out"
want "safe repair leaves a stranded alternate screen"   "$ALT_OFF"   "$out"
want "shell stayed alive through it"                     "MARK1"      "$out"

# --- 2. nothing on an automatic path may move the cursor or clear the screen --------------
# A cursor-moving sequence here means the next prompt lands on top of existing output.
out=$(pty_run 'print -r -- MARK2')
wantnot "automatic path never homes the cursor"      $'\e[H'      "$out"
wantnot "automatic path never clears the screen"     $'\e[2J'     "$out"
wantnot "automatic path never resets scroll region"  $'\e[r'      "$out"
wantnot "automatic path never sends 1049l"           $'\e[?1049l' "$out"
wantnot "automatic path never issues RIS"            $'\ec'       "$out"   # RIS wipes the screen

# --- 3. ssh: every exit repairs the terminal, and the exit status passes through ------------
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
want "ssh exit 0 leaves a stranded alternate screen" "$ALT_OFF" "$out"
want "ssh exit 0 propagates"                          "EC=0"     "$out"

# --- 4. THE HANG GUARD --------------------------------------------------------------------
# The shipped-and-reverted bug: a DECRQM probe using `read -t 0.3 -k 11`. zsh's `-t` bounds the
# wait for the FIRST byte, not the whole read, so any short reply — here, the next command line
# arriving as ordinary type-ahead — left the shell blocked for the remaining bytes. If anything
# on the ssh path ever reads the terminal again, AFTER_255 never prints and `timeout` fails us.
out=$(pty_run 'ssh' 'print -r -- AFTER_255')
want "no read on the ssh path: shell survives exit 255" "AFTER_255" "$out"

# A Herdr client owns the local terminal directly; repair before the next command on the same
# line, not merely at the next prompt. The stub records argv and simulates success and failure.
herdr_tmp=$(mktemp -d) || exit 1
cat >| "$herdr_tmp/herdr" <<'EOF'
#!/bin/sh
printf 'HERDR_ARGS=<%s><%s>\n' "$1" "$2"
exit "${HERDR_EXIT:-0}"
EOF
chmod +x "$herdr_tmp/herdr"
for herdr_exit in 0 1; do
  out=$(PATH="$herdr_tmp:$PATH" HERDR_EXIT=$herdr_exit pty_run \
    'herdr --remote sol; print -r -- "HERDR_STATUS=$?"' 'print -r -- AFTER_HERDR')
  after_client=${out#*HERDR_ARGS=\<--remote\>\<sol\>}
  before_status=${after_client%%HERDR_STATUS=*}
  want "herdr exit $herdr_exit forwards arguments" 'HERDR_ARGS=<--remote><sol>' "$out"
  want "herdr exit $herdr_exit disables mouse reporting before returning" "$MODES_OFF" "$before_status"
  want "herdr exit $herdr_exit disables Kitty reporting before returning" "$KEYS_OFF" "$before_status"
  want "herdr exit $herdr_exit leaves alternate screen before returning" "$ALT_OFF" "$before_status"
  want "herdr exit $herdr_exit propagates status" "HERDR_STATUS=$herdr_exit" "$out"
  want "herdr exit $herdr_exit does not read queued input" 'AFTER_HERDR' "$out"
done
rip "$herdr_tmp" >/dev/null 2>&1
zsh -f -c "source ${(q)ROOT}/zsh/aliases.zsh >/dev/null 2>&1; [[ \$(whence -w herdr) != 'herdr: function' ]]" \
  && ok "non-interactive sourcing leaves herdr as a command" \
  || bad "non-interactive sourcing must not install the herdr wrapper"

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

# --- 8a. Codex remains a direct executable in an interactive Herdr shell ---------------------
codex_tmp=$(mktemp -d) || exit 1
mkdir -p "$codex_tmp/bin"
cat >| "$codex_tmp/bin/codex" <<'EOF'
#!/bin/sh
printf 'EXECUTED\n' >> "$CAPTURE"
printf '<%s>\n' "$@" >> "$CAPTURE"
EOF
chmod +x "$codex_tmp/bin/codex"
capture="$codex_tmp/argv"
out=$(pty_run "export HOME=${(q)codex_tmp} PATH=${(q)codex_tmp}/bin:\$PATH CAPTURE=${(q)capture} HERDR_ENV=1" \
              "source ${(q)ROOT}/zsh/aliases.zsh >/dev/null 2>&1" \
              'codex resume thread-id; print -r -- CODEX_DONE')
want "Herdr Codex calls the executable directly with its arguments" \
  $'EXECUTED\n<resume>\n<thread-id>' "$(<"$capture")"
want "Herdr Codex direct command returns" 'CODEX_DONE' "$out"
codex_definition=$(zsh -f -c "source ${(q)ROOT}/zsh/aliases.zsh >/dev/null 2>&1; whence -f codex")
want "Codex is not a function that can route through a bridge" '' "$codex_definition"
command rm -rf "$codex_tmp"

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
    # Prompt rendering does not depend on mise config; a global conf.d warning is a fake first screen row.
    tmux -L "$socket" -f /dev/null new-session -d -x 100 -y 20 -s prompt \
      "env HOME=${(q)tmp} ZDOTDIR=${(q)tmp} XDG_CONFIG_HOME=${(q)tmp}/.config XDG_DATA_HOME=${(q)tmp}/.local/share XDG_CACHE_HOME=${(q)tmp}/.cache MISE_NO_CONFIG=1 TERM=xterm-256color zsh -i" \
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

# --- Agent session names: `_agent_name` / claude() match the shared vector table ---------------
# tools/shared/tests/fixtures/agent-name-vectors.tsv is the same table the TS module is held to
# (tools/shared/tests/agent-name.test.ts); a row where zsh and TS differ fails one of the two.
typeset -g VECTORS=$ROOT/tools/shared/tests/fixtures/agent-name-vectors.tsv
if [[ -f $VECTORS ]]; then
  typeset -g kind v_cwd v_role v_id v_name got rows=0
  while IFS=$'\t' read -r kind v_cwd v_role v_id v_name; do
    [[ $kind == format ]] || continue
    (( rows++ ))
    got=$(zsh -fc 'IS_MAC=true IS_WSL=false; source "$1" >/dev/null 2>&1; _agent_name "$2" "$3" "$4"' _ "$ROOT/zsh/aliases.zsh" "$v_cwd" "$v_role" "$v_id")
    [[ $got == $v_name ]] && ok "agent name: $v_cwd $v_role $v_id -> $v_name" || bad "agent name: $v_cwd $v_role $v_id -> got '$got', want '$v_name'"
  done < $VECTORS
  (( rows > 5 )) && ok "agent name: vector table has format rows" || bad "agent name: vector table has only $rows format rows"

  # claude() itself: the wrapper passes `--name <slug>-agt_<id>` through to the real binary.
  typeset -g stub=$(mktemp -d) proj
  proj=$stub/Poly_Search-V1
  mkdir -p $proj
  print -r -- $'#!/bin/sh\nprintf "%s\\n" "$@"' > $stub/claude
  chmod +x $stub/claude
  got=$(cd $proj && PATH=$stub:$PATH zsh -fc 'IS_MAC=true IS_WSL=false; source "$1" >/dev/null 2>&1; claude hello' _ "$ROOT/zsh/aliases.zsh" | tr '\n' ' ')
  [[ $got == --name\ poly-search-v1-agt_[0-9a-hj-km-np-tv-z](#c4)\ hello\ * ]] \
    && ok "claude(): names a new session poly-search-v1-agt_<id>" \
    || bad "claude(): unexpected argv '$got'"
  command rm -rf "$stub"
else
  bad "agent name: vector table missing at $VECTORS"
fi

print -r -- "---"
print -r -- "passed=$PASS failed=$FAIL"
(( FAIL == 0 ))
