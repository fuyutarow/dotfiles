#!/bin/sh
# Body of the /quote and /c slash commands (agents/commands/{quote,c}.md). Lives here, not
# inline in those files, because a command file has NO alias/include mechanism — two commands
# pointing at one behavior means two files, and only the shell can be shared.
#
# Prints a STATUS line the calling command file's instructions branch on:
#   STATUS: delivered    + NAME, PANE      — landed on the clipboard
#   STATUS: undelivered  + NAME, PAYLOAD   — no idle shell pane; caller prints it for manual copy
#   STATUS: no-body                        — nothing captured for this session yet
set -eu

sid="${CLAUDE_CODE_SESSION_ID:-}"
dotfiles="${DOTFILES:-$HOME/dotfiles}"
body_file="$HOME/.cache/claude/last-response/$sid.txt"

# capture-last-response.ts (Stop hook) writes that file after every turn. Missing = first turn
# of the session, or the hook is not wired up.
if [ -z "$sid" ] || [ ! -f "$body_file" ]; then
  echo "STATUS: no-body"
  exit 0
fi

# The cross-session addressable name ("firedancer-fe"), not the AI-generated title — that
# distinction is the whole point of the from: header. Falls back to the raw uuid.
name=$(bun "$dotfiles/agents/claude/hooks/resolve-agent-name.ts" "$sid" || true)
[ -n "$name" ] || name="$sid"

# NOTE: no cleanup trap. `rm` is permanently disabled in this repo's shell (CLAUDE.md safety
# rule — `rip` is the replacement), and the pane consuming this file races us anyway: deleting
# it on exit could pull it out from under the `herdr pane run` we just fired. mktemp files
# under $TMPDIR are reaped by the OS; one small file per invocation is the right trade.
payload_file=$(mktemp)
{
  printf 'from: %s\n' "$name"
  cat "$body_file"
} > "$payload_file"

# Claude Code cannot reach the clipboard from a process it spawns — see
# agents/claude/hooks/copy-via-herdr-pane.ts's header for why, and what it does instead.
if pane=$(bun "$dotfiles/agents/claude/hooks/copy-via-herdr-pane.ts" "$payload_file"); then
  echo "STATUS: delivered"
  echo "NAME: $name"
  echo "PANE: $pane"
else
  echo "STATUS: undelivered"
  echo "NAME: $name"
  echo "PAYLOAD_START"
  cat "$payload_file"
  echo "PAYLOAD_END"
fi
