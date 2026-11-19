#!/usr/bin/env zsh
# Run directly or source from terminal-hygiene.test.zsh: the copy aliases call `smart-copy`; Windows launchers use the desktop-session socket.
if [[ $ZSH_EVAL_CONTEXT == toplevel ]]; then
  emulate -L zsh
  setopt no_unset
  zmodload zsh/zpty || exit 1
  ROOT=${0:A:h:h:h}
  PASS=0 FAIL=0
  ok() { print -r -- "[PASS] $1"; (( PASS++ )); return 0 }
  bad() { print -r -- "[FAIL] $1"; (( FAIL++ )); return 0 }
  want() { [[ $3 == *"$2"* ]] && ok "$1" || bad "$1" }
  wantnot() { [[ $3 != *"$2"* ]] && ok "$1" || bad "$1" }
fi

clipboard_routing_tests() {
  zmodload zsh/net/socket || { bad "clipboard: zsh/net/socket unavailable"; return }
  # Unix socket names are bounded (104 bytes on macOS); the worker's TMPDIR can exceed that.
  local fixture out chunk
  fixture=$(mktemp -d /tmp/clipremote.XXXXXX) || { bad "clipboard: mktemp failed"; return }
  local payload='clipboard 日本語'
  mkdir -p "$fixture/bin" "$fixture/empty"
  # A stand-in `smart-copy`: the zsh aliases' only clipboard route. It records its arguments and stdin,
  # and exits with CLIP_TEST_EXIT. Routing itself (OSC 52, clip.exe, pbcopy, xclip, sockets) is
  # tested in tools/smart-copy/tests, not here.
  printf '#!/bin/sh\nprintf "%%s" "$*" > "$CLIP_TEST_CAPTURE.args"\ncat > "$CLIP_TEST_CAPTURE"\nexit "${CLIP_TEST_EXIT:-0}"\n' > "$fixture/bin/smart-copy"
  # The Windows VS Code launcher records the WSL_INTEROP it was started with.
  printf '#!/bin/sh\nprintf "%%s" "${WSL_INTEROP-unset}" > "$CLIP_TEST_CAPTURE.interop"\n' > "$fixture/bin/code"
  # A stand-in for `bun scripts/wsl-interop-session.ts`: records its first argument, then prints the
  # socket CLIP_TEST_HELPER names (a bound fixture socket), or fails like the helper does.
  printf '#!/bin/sh\nprintf "%%s" "$1" > "$CLIP_TEST_BUN_ARG"\ncase "$CLIP_TEST_HELPER" in\n  fail) echo "wsl-interop-session: no live /run/WSL/*_interop socket runs in the desktop session 1" >&2; exit 1 ;;\n  *) printf "%%s\\n" "$CLIP_TEST_HELPER" ;;\nesac\n' > "$fixture/bin/bun"
  printf '#!/bin/sh\nprintf "%%s" "clipboard 日本語"\n' > "$fixture/bin/bat"
  chmod +x "$fixture/bin/"*
  local desktop=$fixture/desktop_interop inherited=$fixture/inherited_interop desktop_fd
  zsocket -l "$desktop" || {
    bad "clipboard: could not bind fixture desktop socket"; rip "$fixture"; return
  }
  desktop_fd=$REPLY

  # All environment inputs are explicit: the runner's own SSH/herdr state cannot select anything.
  clipboard_case() {
    local native_exit=${1:-0} shell_command=${2:-true}
    out=''
    : > "$fixture/capture"
    : > "$fixture/capture.args"
    print -rn -- NOT_RUN > "$fixture/capture.interop"   # overwritten by the launcher, if it runs
    : > "$fixture/bun-arg"                              # filled by the helper stand-in, if it runs
    local -a clip_command=(env -i PATH="$fixture/bin:$PATH" HOME="$fixture" \
      WSL_INTEROP="$inherited" CLIP_TEST_HELPER="${CLIP_TEST_HELPER:-$desktop}" CLIP_TEST_BUN_ARG="$fixture/bun-arg" \
      CLIP_TEST_CAPTURE="$fixture/capture" CLIP_TEST_EXIT="$native_exit" CLIP_TEST_EMPTY="$fixture/empty" \
      WSL_DISTRO_NAME=r99-u26 DOTFILES="$ROOT" \
      zsh -f -c 'eval "$2"; printf "\nCLIP_STATUS=%s\n" "$?"' _ "$payload" "$shell_command")
    zpty CLIP "${(q)clip_command[@]}"
    while zpty -r CLIP chunk; do out+=$chunk; done
    zpty -d CLIP
  }
  local load='IS_MAC=false IS_WSL=true; source "$DOTFILES/zsh/aliases.zsh" >/dev/null 2>&1;'

  # ── copytoclipboard and its aliases hand the text to `smart-copy --echo` ──
  clipboard_case 0 "$load eval c <<< \"\$1\""
  [[ $(<"$fixture/capture") == "$payload" ]] && ok "c: the payload reaches smart-copy on stdin" || bad "c: payload was $(<"$fixture/capture")"
  [[ $(<"$fixture/capture.args") == --echo ]] && ok "c: smart-copy is called with --echo and nothing else" \
    || bad "c: smart-copy args were $(<"$fixture/capture.args")"
  want "c: a successful copy keeps a successful exit" 'CLIP_STATUS=0' "$out"

  clipboard_case 0 "$load pp fixture.txt"
  [[ $(<"$fixture/capture") == "$payload" ]] && ok "pp: bat's output reaches smart-copy" || bad "pp: payload was $(<"$fixture/capture")"
  [[ $(<"$fixture/capture.args") == --echo ]] && ok "pp: smart-copy is called with --echo" || bad "pp: args were $(<"$fixture/capture.args")"
  clipboard_case 0 "$load pp"
  want "pp: no file is a usage error" 'Usage: pp <file>' "$out"
  [[ ! -s $fixture/capture.args ]] && ok "pp: no file never calls smart-copy" || bad "pp: no file called smart-copy"

  clipboard_case 0 "$load eval pwdc"
  [[ $(<"$fixture/capture") == "$PWD" ]] && ok "pwdc: the current path reaches smart-copy" || bad "pwdc: smart-copy got $(<"$fixture/capture")"

  clipboard_case 23 "$load eval c <<< \"\$1\""
  want "c: smart-copy's failure status is preserved" 'CLIP_STATUS=23' "$out"

  clipboard_case 0 "$load PATH=\$CLIP_TEST_EMPTY; eval c <<< \"\$1\""
  want "c: a missing smart-copy says so" 'smart-copy is not on PATH; run mise run deps in the dotfiles checkout' "$out"
  want "c: a missing smart-copy fails the command" 'CLIP_STATUS=127' "$out"

  # ── Windows desktop calls run in the owner's desktop session (scripts/wsl-interop-session.ts) ──
  # The pane's inherited WSL_INTEROP is `$inherited` (nothing listens there). The helper stand-in names
  # `$desktop`. A Windows program must see `$desktop`; when the helper fails it keeps `$inherited`
  # and one stderr line says so; and no shell-wide WSL_INTEROP change ever happens.
  local interop_seen
  interop_seen() { cat "$fixture/capture.interop" }

  # code/ide (hence e/ee) and start go through _wsl_desktop_run, defined by zsh/wsl.zsh.
  local launch='source "$DOTFILES/zsh/wsl.zsh" >/dev/null 2>&1; code --version; print -r "SHELL_INTEROP=$WSL_INTEROP"'
  clipboard_case 0 "$launch"
  [[ $(interop_seen) == $desktop ]] && ok "code: the launcher starts through the desktop-session socket" \
    || bad "code: launcher saw $(interop_seen), want $desktop"
  want "code: the shell's own WSL_INTEROP is untouched" "SHELL_INTEROP=$inherited" "$out"

  CLIP_TEST_HELPER=fail clipboard_case 0 "$launch"
  [[ $(interop_seen) == $inherited ]] && ok "code: helper failure keeps the inherited WSL_INTEROP" \
    || bad "code: after helper failure the launcher saw $(interop_seen)"
  want "code: helper failure says so on stderr" 'code: no desktop-session WSL interop socket' "$out"

  clipboard_case 0 \
    'source "$DOTFILES/zsh/wsl.zsh" >/dev/null 2>&1; code "$PWD"; print -r "ARGS_OK"'
  [[ $(interop_seen) == $desktop ]] && ok "e/ee: the remote-URI launch path starts through the desktop-session socket" \
    || bad "e/ee: URI launch saw $(interop_seen)"

  clipboard_case 0 \
    'source "$DOTFILES/zsh/wsl.zsh" >/dev/null 2>&1; print -r -- "$(whence -f start)"'
  want "start: a function that goes through the desktop-session socket" '_wsl_desktop_run /mnt/c/Windows/System32/cmd.exe /c start' "$out"
  wantnot "start: no longer a plain alias" 'start: aliased to' "$out"

  exec {desktop_fd}>&-
  unlink "$desktop"
  unfunction interop_seen
  rip "$fixture"
  unfunction clipboard_case
}
clipboard_routing_tests
unfunction clipboard_routing_tests
if [[ $ZSH_EVAL_CONTEXT == toplevel ]]; then
  print -r -- "passed=$PASS failed=$FAIL"
  (( FAIL == 0 ))
fi
