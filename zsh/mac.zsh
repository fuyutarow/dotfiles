#!/usr/bin/env zsh
# macOS-specific aliases — sourced from zsh/aliases.zsh when $IS_MAC.
# Common aliases live in zsh/aliases.zsh; only macOS-only ones belong here.

# `o` / `oo` live in zsh/aliases.zsh (smart-open); `open` stays macOS's own.
alias start='open -a'    # launch a macOS app by name

# Open the registered Obsidian vault containing the requested path, or register a new directory.
# Resolve symlinks first so
# aliases such as ~/Personal-Drive match the path Obsidian stores in its vault registry.
obs() {
  emulate -L zsh

  if [[ -n ${SSH_CONNECTION:-} || -n ${SSH_TTY:-} ]]; then
    print -u2 -- 'obs: cannot open a remote path in the Mac Obsidian app; run obs in a local macOS shell'
    return 1
  fi

  if (( $# > 1 )); then
    print -u2 -- 'usage: obs [dir]'
    return 2
  fi

  local target
  if (( $# == 0 )); then
    target=$PWD
  else
    target=$1
  fi

  if [[ ! -e $target ]]; then
    print -u2 -- "obs: $target does not exist"
    return 1
  fi

  if ! command -v jq >/dev/null 2>&1; then
    print -u2 -- 'obs: jq is required to read the Obsidian vault registry'
    return 127
  fi

  local resolved=${target:A}
  local registry="$HOME/Library/Application Support/obsidian/obsidian.json"
  local vault_id vault_path vault_root
  local best_id='' best_root='' best_length=0

  if [[ -r $registry ]]; then
    while IFS=$'\t' read -r vault_id vault_path; do
      [[ -n $vault_id && -n $vault_path && -d $vault_path ]] || continue
      vault_root=${vault_path:A}
      if [[ $vault_root == / ]]; then
        [[ $resolved == /* ]] || continue
      elif [[ $resolved != "$vault_root" && $resolved != "$vault_root"/* ]]; then
        continue
      fi
      if (( ${#vault_root} > best_length )); then
        best_id=$vault_id
        best_root=$vault_root
        best_length=${#vault_root}
      fi
    done < <(command jq -r '.vaults // {} | to_entries[] | [.key, .value.path] | @tsv' "$registry" 2>/dev/null)
  fi

  if [[ -z $best_id ]]; then
    command bun "${DOTFILES:-$HOME/dotfiles}/obsidian/open-vault.ts" -- "$resolved"
    return $?
  fi

  local uri encoded
  if [[ $resolved == $best_root ]]; then
    encoded=$(command jq -nr --arg value "$best_id" '$value | @uri') || return 1
    uri="obsidian://open?vault=$encoded"
  else
    encoded=$(command jq -nr --arg value "$resolved" '$value | @uri') || return 1
    uri="obsidian://open?path=$encoded"
  fi

  if [[ ${OBS_DRY_RUN:-0} == 1 ]]; then
    print -r -- "$uri"
    return 0
  fi

  command open "$uri"
}
