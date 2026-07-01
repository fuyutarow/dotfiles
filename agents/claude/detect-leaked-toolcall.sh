#!/usr/bin/env bash
# Stop hook — "leaked tool-call" early-warning.
#
# Detects the Opus-4.x serialization regression where a tool call is emitted as
# PLAIN TEXT (e.g. a stray "court"/"count" token then `<invoke name=...>`) instead
# of a real structured call, so nothing executes and the transcript is now poisoned
# (the model imitates the broken XML on later turns = self-poisoning).
#
# DETECTS and ALERTS only. Never re-prompts (no exit 2): feeding "you leaked a tool
# call" back into an already-poisoned context makes it worse. Fix is human: Esc Esc.
#
# Precision design (avoids firing when a turn merely *discusses* this bug):
#   1. TURN-SCOPED  — scans only the current turn's assistant text (blocks after the
#      last user/tool_result entry), never the whole transcript. A Claude turn is
#      logged as several JSONL lines (thinking/text/tool_use), so we gather all
#      trailing assistant text, not just the last entry.
#   2. CODE-STRIPPED — removes fenced ``` blocks and inline `backtick` spans before
#      matching. A real leak is RAW text; mentions of the tags live in code spans.
set -uo pipefail

input=$(cat)
command -v jq > /dev/null 2>&1 || exit 0
transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2> /dev/null)
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# Current turn's assistant text = assistant text blocks after the last user entry.
turn_text=$(jq -rs '
  [ .[] | select(.type=="assistant" or .type=="user") ] as $rel
  | ($rel | map(.type=="user") | rindex(true)) as $u
  | (if $u == null then $rel else $rel[($u + 1):] end)
  | map(select(.type=="assistant") | (.message.content // [])[]
        | select(.type=="text") | .text)
  | join("\n")
' "$transcript" 2> /dev/null || true)
[ -n "$turn_text" ] || exit 0

# Strip fenced code blocks, then inline backtick spans (so tag *mentions* don't fire).
stripped=$(printf '%s\n' "$turn_text" \
  | awk 'BEGIN{f=0} /^[[:space:]]*```/{f=!f; next} !f' \
  | sed 's/`[^`]*`//g')

# A genuine emitted-call-as-text: <invoke name=...> or <function_calls>, raw (post-strip).
if printf '%s' "$stripped" \
  | grep -Eq '<(antml:)?invoke name=|<(antml:)?function_calls'; then
  log="$HOME/.claude/leaked-toolcall.log"
  printf '%s  leaked-toolcall  %s\n' "$(date -Is 2> /dev/null || date)" "$transcript" >> "$log" 2> /dev/null || true
  (printf '\a' > /dev/tty) 2> /dev/null || true # terminal bell (best-effort)
  msg='tool-call が漏れました — Esc Esc で /rewind を'
  case "$(uname -s)" in
    Darwin)
      osascript -e "display notification \"$msg\" with title \"Claude Code\"" > /dev/null 2>&1 || true
      ;;
    *) # Linux / WSL2
      command -v notify-send > /dev/null 2>&1 && notify-send 'Claude Code' "$msg" > /dev/null 2>&1 || true
      ;;
  esac
fi
exit 0
