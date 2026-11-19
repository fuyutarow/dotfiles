#!/usr/bin/env zsh
# Run directly or source from terminal-hygiene.test.zsh: tty output, native clipboard stubs.
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
  local fixture out chunk socket_fd
  fixture=$(mktemp -d /tmp/clipremote.XXXXXX) || { bad "clipboard: mktemp failed"; return }
  local payload='clipboard 日本語' osc=$'\e]52;c;'
  local username=$(id -un)
  mkdir -p "$fixture/bin" "$fixture/sockets"
  printf '#!/bin/sh\nprintf "%%s\\n" "$CLIP_TEST_OS"\n' > "$fixture/bin/uname"
  # clip.exe and the Windows VS Code launcher record the WSL_INTEROP they were started with.
  printf '#!/bin/sh\nprintf "%%s" "${WSL_INTEROP-unset}" > "$CLIP_TEST_CAPTURE.interop"\ncat > "$CLIP_TEST_CAPTURE"\nexit "${CLIP_TEST_EXIT:-0}"\n' > "$fixture/bin/clip.exe"
  cp "$fixture/bin/clip.exe" "$fixture/bin/pbcopy"
  printf '#!/bin/sh\nprintf "%%s" "${WSL_INTEROP-unset}" > "$CLIP_TEST_CAPTURE.interop"\n' > "$fixture/bin/code"
  # A stand-in for `bun scripts/wsl-interop-session.ts`: records its first argument, then prints the
  # socket CLIP_TEST_HELPER names (a bound fixture socket), or fails like the helper does.
  printf '#!/bin/sh\nprintf "%%s" "$1" > "$CLIP_TEST_BUN_ARG"\ncase "$CLIP_TEST_HELPER" in\n  fail) echo "wsl-interop-session: no live /run/WSL/*_interop socket runs in the desktop session 1" >&2; exit 1 ;;\n  *) printf "%%s\\n" "$CLIP_TEST_HELPER" ;;\nesac\n' > "$fixture/bin/bun"
  chmod +x "$fixture/bin/"*
  zsocket -l "$fixture/sockets/smart-open-$username--r99-u26.sock" || {
    bad "clipboard: could not bind fixture socket"; rip "$fixture"; return
  }
  socket_fd=$REPLY
  local desktop=$fixture/desktop_interop inherited=$fixture/inherited_interop desktop_fd
  zsocket -l "$desktop" || {
    bad "clipboard: could not bind fixture desktop socket"; rip "$fixture"; return
  }
  desktop_fd=$REPLY

  # All environment inputs are explicit: the runner's own SSH/herdr state cannot select a route.
  clipboard_case() {
    local os=$1 herdr=$2 dir=$3 pinned=$4 native_exit=${5:-0} shell_command=${6:-'printf "%s" "$1" | /bin/sh "$2"'}
    out=''
    : > "$fixture/capture"
    print -rn -- NOT_RUN > "$fixture/capture.interop"   # overwritten by the Windows program, if it runs
    : > "$fixture/bun-arg"                              # filled by the helper stand-in, if it runs
    local -a clip_command=(env -i PATH="$fixture/bin:$PATH" HOME="$fixture" \
      WSL_INTEROP="$inherited" CLIP_TEST_HELPER="${CLIP_TEST_HELPER:-$desktop}" CLIP_TEST_BUN_ARG="$fixture/bun-arg" \
      CLIP_TEST_OS="$os" CLIP_TEST_CAPTURE="$fixture/capture" CLIP_TEST_EXIT="$native_exit" \
      WSL_DISTRO_NAME=r99-u26 HERDR_ENV="$herdr" SMART_OPEN_SOCKET_DIR="$dir" \
      COPY_TO_CLIPBOARD_QUIET=1 DOTFILES="$ROOT" CLIP_TEST_PIN="$pinned" \
      zsh -f -c '[[ $CLIP_TEST_PIN == unset ]] || export SMART_OPEN_SOCKET=$CLIP_TEST_PIN
        eval "$3"; printf "\nCLIP_STATUS=%s\n" "$?"' _ "$payload" "$ROOT/zsh/copy-to-clipboard.sh" "$shell_command")
    zpty CLIP "${(q)clip_command[@]}"
    while zpty -r CLIP chunk; do out+=$chunk; done
    zpty -d CLIP
  }

  clipboard_case Linux 1 "$fixture/sockets" unset
  want "remote herdr WSL without SSH uses OSC 52" "$osc" "$out"
  want "remote tty write reports delivery" 'CLIP_STATUS=0' "$out"
  [[ ! -s $fixture/capture ]] && ok "remote copy never invokes clip.exe" || bad "remote copy invoked clip.exe"
  want "OSC 52 carries UTF-8 payload" "$(printf '%s' "$payload" | base64 | tr -d '\n')" "$out"

  # A hook or tool call an agent spawned has no controlling terminal (setsid stands in for that);
  # the script must reach the terminal of the nearest ancestor that has one, with no pane or shell.
  if command -v setsid > /dev/null 2>&1; then
    clipboard_case Linux 1 "$fixture/sockets" unset 0 'printf "%s" "$1" | setsid --wait /bin/sh "$2"'
    want "a caller without a terminal reaches its ancestor's terminal" "$osc" "$out"
    want "a caller without a terminal reports delivery" 'CLIP_STATUS=0' "$out"
  fi

  clipboard_case Linux '' "$fixture/sockets" unset
  wantnot "plain WSL with a forward still uses native clipboard" "$osc" "$out"
  [[ $(iconv -f UTF-16LE -t UTF-8 < "$fixture/capture") == "$payload" ]] \
    && ok "plain WSL sends UTF-16LE to clip.exe" || bad "plain WSL clipboard payload"

  clipboard_case Linux 1 "$fixture/missing" unset
  wantnot "local herdr without forward uses native clipboard" "$osc" "$out"
  [[ -s $fixture/capture ]] && ok "local herdr invokes clip.exe" || bad "local herdr skipped clip.exe"

  clipboard_case Darwin '' "$fixture/sockets" unset
  wantnot "plain Darwin uses pbcopy" "$osc" "$out"
  [[ $(cat "$fixture/capture") == "$payload" ]] && ok "Darwin pbcopy receives UTF-8" || bad "Darwin clipboard payload"

  clipboard_case Linux '' "$fixture/sockets" unset 23
  want "native clipboard failure status is preserved" 'CLIP_STATUS=23' "$out"

  clipboard_case Linux 1 "$fixture/missing" "$fixture/sockets/smart-open-$username--r99-u26.sock"
  want "SMART_OPEN_SOCKET pins the forward" "$osc" "$out"
  clipboard_case Linux 1 "$fixture/sockets" ''
  wantnot "empty pinned socket suppresses discovery like smart-open" "$osc" "$out"

  # A named regular file or symlink is not a bound socket (smart-open uses lstat).
  mkdir "$fixture/invalid"
  : > "$fixture/invalid/smart-open-$username--regular.sock"
  ln -s "$fixture/sockets/smart-open-$username--r99-u26.sock" "$fixture/invalid/smart-open-$username--link.sock"
  clipboard_case Linux 1 "$fixture/invalid" unset
  wantnot "regular files and symlinks do not imply attachment" "$osc" "$out"

  printf '#!/bin/sh\nprintf "%%s" "clipboard 日本語"\n' > "$fixture/bin/bat"
  chmod +x "$fixture/bin/bat"
  clipboard_case Linux 1 "$fixture/sockets" unset 0 \
    'IS_MAC=false IS_WSL=true; source "$DOTFILES/zsh/aliases.zsh" >/dev/null 2>&1; pp fixture.txt'
  want "pp in remote WSL uses shared OSC 52 route" "$osc" "$out"
  [[ ! -s $fixture/capture ]] && ok "remote pp never invokes clip.exe" || bad "remote pp invoked clip.exe"

  clipboard_case Linux 1 "$fixture/sockets" unset 0 \
    'IS_MAC=false IS_WSL=true; source "$DOTFILES/zsh/aliases.zsh" >/dev/null 2>&1; eval c <<< "$1"'
  want "c in remote WSL uses shared OSC 52 route" "$osc" "$out"
  clipboard_case Linux 1 "$fixture/sockets" unset 0 \
    'IS_MAC=false IS_WSL=true; source "$DOTFILES/zsh/aliases.zsh" >/dev/null 2>&1; eval pwdc'
  want "pwdc in remote WSL copies the current path" "${osc}$(printf '%s' "$PWD" | base64 | tr -d '\n')" "$out"

  # ── Windows desktop calls run in the owner's desktop session (scripts/wsl-interop-session.ts) ──
  # The pane's inherited WSL_INTEROP is `$inherited` (nothing listens there). The helper stand-in names
  # `$desktop`. A Windows program must see `$desktop`; when the helper fails it keeps `$inherited`
  # and one stderr line says so; and no shell-wide WSL_INTEROP change ever happens.
  local interop_seen
  interop_seen() { cat "$fixture/capture.interop" }

  clipboard_case Linux '' "$fixture/sockets" unset
  [[ $(interop_seen) == $desktop ]] && ok "copy: clip.exe starts through the desktop-session socket" \
    || bad "copy: clip.exe saw $(interop_seen), want $desktop"
  [[ $(<"$fixture/bun-arg") == */scripts/wsl-interop-session.ts ]] \
    && ok "copy: the socket comes from scripts/wsl-interop-session.ts" || bad "copy: helper path was $(<"$fixture/bun-arg")"
  [[ $(iconv -f UTF-16LE -t UTF-8 < "$fixture/capture") == "$payload" ]] \
    && ok "copy: payload still reaches clip.exe through the helper's socket" || bad "copy: payload lost"
  wantnot "copy: a qualifying socket prints no interop warning" 'desktop-session WSL interop' "$out"

  CLIP_TEST_HELPER=fail clipboard_case Linux '' "$fixture/sockets" unset
  [[ $(interop_seen) == $inherited ]] && ok "copy: helper failure keeps the inherited WSL_INTEROP" \
    || bad "copy: after helper failure clip.exe saw $(interop_seen), want $inherited"
  want "copy: helper failure says so on stderr" 'no desktop-session WSL interop socket' "$out"
  want "copy: the stderr line carries the helper's reason" 'runs in the desktop session 1' "$out"
  [[ ${#${(@M)${(@f)out}:#*no desktop-session WSL interop socket*}} == 1 ]] \
    && ok "copy: helper failure is one stderr line" || bad "copy: helper failure line count"
  [[ $(iconv -f UTF-16LE -t UTF-8 < "$fixture/capture") == "$payload" ]] \
    && ok "copy: helper failure still copies" || bad "copy: helper failure lost the payload"
  want "copy: helper failure keeps a successful exit" 'CLIP_STATUS=0' "$out"

  CLIP_TEST_HELPER=$fixture/not-a-socket clipboard_case Linux '' "$fixture/sockets" unset
  [[ $(interop_seen) == $inherited ]] && ok "copy: a printed path that is no socket is not used" \
    || bad "copy: non-socket path was used: $(interop_seen)"

  clipboard_case Linux '' "$fixture/sockets" unset 23
  want "copy: clip.exe status survives the socket choice" 'CLIP_STATUS=23' "$out"

  clipboard_case Linux 1 "$fixture/sockets" unset
  [[ ! -s $fixture/bun-arg ]] && ok "copy: the OSC 52 route never asks for a Windows socket" \
    || bad "copy: OSC 52 route ran the helper"
  clipboard_case Darwin '' "$fixture/sockets" unset
  [[ ! -s $fixture/bun-arg ]] && ok "copy: pbcopy never asks for a Windows socket" || bad "copy: Darwin ran the helper"

  # code/ide (hence e/ee) and start go through _wsl_desktop_run, defined by zsh/wsl.zsh.
  local launch='source "$DOTFILES/zsh/wsl.zsh" >/dev/null 2>&1; code --version; print -r "SHELL_INTEROP=$WSL_INTEROP"'
  clipboard_case Linux '' "$fixture/sockets" unset 0 "$launch"
  [[ $(interop_seen) == $desktop ]] && ok "code: the launcher starts through the desktop-session socket" \
    || bad "code: launcher saw $(interop_seen), want $desktop"
  want "code: the shell's own WSL_INTEROP is untouched" "SHELL_INTEROP=$inherited" "$out"

  CLIP_TEST_HELPER=fail clipboard_case Linux '' "$fixture/sockets" unset 0 "$launch"
  [[ $(interop_seen) == $inherited ]] && ok "code: helper failure keeps the inherited WSL_INTEROP" \
    || bad "code: after helper failure the launcher saw $(interop_seen)"
  want "code: helper failure says so on stderr" 'code: no desktop-session WSL interop socket' "$out"

  clipboard_case Linux '' "$fixture/sockets" unset 0 \
    'source "$DOTFILES/zsh/wsl.zsh" >/dev/null 2>&1; code "$PWD"; print -r "ARGS_OK"'
  [[ $(interop_seen) == $desktop ]] && ok "e/ee: the remote-URI launch path starts through the desktop-session socket" \
    || bad "e/ee: URI launch saw $(interop_seen)"

  clipboard_case Linux '' "$fixture/sockets" unset 0 \
    'source "$DOTFILES/zsh/wsl.zsh" >/dev/null 2>&1; print -r -- "$(whence -f start)"'
  want "start: a function that goes through the desktop-session socket" '_wsl_desktop_run /mnt/c/Windows/System32/cmd.exe /c start' "$out"
  wantnot "start: no longer a plain alias" 'start: aliased to' "$out"

  exec {desktop_fd}>&-
  unlink "$desktop"
  unfunction interop_seen
  exec {socket_fd}>&-
  unlink "$fixture/sockets/smart-open-$username--r99-u26.sock"
  rip "$fixture"
  unfunction clipboard_case
}
clipboard_routing_tests
unfunction clipboard_routing_tests
if [[ $ZSH_EVAL_CONTEXT == toplevel ]]; then
  print -r -- "passed=$PASS failed=$FAIL"
  (( FAIL == 0 ))
fi
