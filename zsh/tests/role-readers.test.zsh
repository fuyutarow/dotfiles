# Both thin shell entry points must treat role.env as inert, all-or-nothing data.
role_home=$(mktemp -d) || exit 1
mkdir -p "$role_home/.config/dotfiles"
role_file=$role_home/.config/dotfiles/role.env
role_cpus=$(command getconf _NPROCESSORS_ONLN)
for role_shell in zsh bash; do
  if [[ $role_shell == zsh ]]; then role_source=$ROOT/zsh/zshenv; else role_source=$ROOT/zsh/bashrc; fi
  role_probe() {
    env -i HOME="$role_home" PATH=/usr/bin:/bin TZ=UTC "$role_shell" -c \
      'source "$1"; printf "value=<%s> set=<%s>\n" "${TOKIO_WORKER_THREADS-}" "${TOKIO_WORKER_THREADS+x}"' _ "$role_source" 2>&1
  }
  print -r -- $'DOTFILES_ROLE=shared-light\nDOTFILES_ROLE_TOKIO_WORKER_THREADS=1\nDOTFILES_ROLE_RUSTC_WRAPPER=none' >| "$role_file"
  [[ $(role_probe) == 'value=<1> set=<x>' ]] && ok "$role_shell reads role cap silently" || bad "$role_shell reads role cap silently"
  print -r -- $'DOTFILES_ROLE=shared-light\nDOTFILES_ROLE_TOKIO_WORKER_THREADS=99999999999999999999999999999\nDOTFILES_ROLE_RUSTC_WRAPPER=none' >| "$role_file"
  [[ $(role_probe) == "value=<$role_cpus> set=<x>" ]] && ok "$role_shell caps at CPU count" || bad "$role_shell caps at CPU count"
  role_out=$(env -i HOME="$role_home" PATH=/usr/bin:/bin TZ=UTC TOKIO_WORKER_THREADS='' "$role_shell" -c 'source "$1"; printf "value=<%s> set=<%s>\n" "$TOKIO_WORKER_THREADS" "${TOKIO_WORKER_THREADS+x}"' _ "$role_source" 2>&1)
  [[ $role_out == 'value=<> set=<x>' ]] && ok "$role_shell preserves user-set empty value" || bad "$role_shell preserves user-set empty value"
  print -r -- $'DOTFILES_ROLE=shared-light\nDOTFILES_ROLE_TOKIO_WORKER_THREADS=4\nDOTFILES_ROLE_RUSTC_WRAPPER=none\necho compromised' >| "$role_file"
  [[ $(role_probe) == 'value=<> set=<>' ]] && ok "$role_shell rejects executable extra line" || bad "$role_shell rejects executable extra line"
  print -r -- $'DOTFILES_ROLE=shared-light\nDOTFILES_ROLE_TOKIO_WORKER_THREADS=0\nDOTFILES_ROLE_RUSTC_WRAPPER=none' >| "$role_file"
  [[ $(role_probe) == 'value=<> set=<>' ]] && ok "$role_shell rejects zero" || bad "$role_shell rejects zero"
  print -r -- $'DOTFILES_ROLE=workstation\nDOTFILES_ROLE_TOKIO_WORKER_THREADS=\nDOTFILES_ROLE_RUSTC_WRAPPER=sccache' >| "$role_file"
  [[ $(role_probe) == 'value=<> set=<>' ]] && ok "$role_shell leaves uncapped role unset" || bad "$role_shell leaves uncapped role unset"
done
