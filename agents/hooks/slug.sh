#!/bin/sh
# shim: hook-entry
# Missing-runtime diagnostics cannot use Bun. Read the SAME registry as the TS emitter.
# Caller supplies its directory and TS basename; rendered commands already export HOOK_SLUG.
hook_slug() {
  if [ -n "${HOOK_SLUG:-}" ]; then
    printf '%s' "$HOOK_SLUG"
    return
  fi
  slug_dir=$1
  slug_script=$2
  slug_registry="$slug_dir/hooks.toml"
  case "$slug_dir" in
    */claude/hooks)
      slug_script="claude/hooks/$slug_script"
      slug_registry="$slug_dir/../../hooks/hooks.toml"
      ;;
    */codex/hooks)
      slug_script="codex/hooks/$slug_script"
      slug_registry="$slug_dir/../../hooks/hooks.toml"
      ;;
  esac
  awk -v script="$slug_script" '
    function emit() { if (!found && name == script && slug != "") { print slug; found = 1 } }
    /^\[\[/ { emit(); slug = ""; name = "" }
    /^slug = / { slug = $3; gsub(/"/, "", slug) }
    /^script = / { name = $3; gsub(/"/, "", name) }
    END { emit(); if (!found) print "hook-registry" }
  ' "$slug_registry"
}

hook_prefix() {
  printf '[dotfiles:%s] ' "${HOOK_SLUG#dotfiles:}"
}

hook_stderr() {
  printf '%s%s\n' "$(hook_prefix)" "$1" >&2
}

hook_deny() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s%s"}}\n' "$(hook_prefix)" "$1"
}
