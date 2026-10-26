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
  printf '#!/bin/sh\ncat > "$CLIP_TEST_CAPTURE"\nexit "${CLIP_TEST_EXIT:-0}"\n' > "$fixture/bin/clip.exe"
  cp "$fixture/bin/clip.exe" "$fixture/bin/pbcopy"
  chmod +x "$fixture/bin/"*
  zsocket -l "$fixture/sockets/smart-open-$username--r99-u26.sock" || {
    bad "clipboard: could not bind fixture socket"; rip "$fixture"; return
  }
  socket_fd=$REPLY

  # All environment inputs are explicit: the runner's own SSH/herdr state cannot select a route.
  clipboard_case() {
    local os=$1 herdr=$2 dir=$3 pinned=$4 native_exit=${5:-0} shell_command=${6:-'printf "%s" "$1" | /bin/sh "$2"'}
    out=''
    : > "$fixture/capture"
    local -a clip_command=(env -i PATH="$fixture/bin:$PATH" HOME="$fixture" \
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
