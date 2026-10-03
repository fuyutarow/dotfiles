#!/usr/bin/env bash
# AI commit-message generator for lazygit (bound to Ctrl+A in lazygit/config.yml).
# *** TEMPORARY DEBUG BUILD *** — logs to /tmp/lazygit-ai-debug.log so we can see
# why claude fails under lazygit's shell. Reverted to the clean version once fixed.
set -u

LOG="/tmp/lazygit-ai-debug.log"
{
  echo "===== run $(date '+%F %T') ====="
  echo "PWD=$PWD"
  echo "SHELL=${SHELL:-?}  TERM=${TERM:-?}  TTY=$(tty 2> /dev/null || echo none)"
  echo "PATH=$PATH"
} >> "$LOG" 2>&1

if git diff --staged --quiet; then
  echo "Nothing staged — stage changes first."
  echo "RESULT: nothing staged" >> "$LOG"
  exit 0
fi

cl="$HOME/.local/bin/claude"
echo "claude=$cl exists=$([ -x "$cl" ] && echo yes || echo NO)" >> "$LOG"
if [ ! -x "$cl" ]; then
  echo "claude not found at $cl — run the claude installer."
  echo "RESULT: claude missing" >> "$LOG"
  exit 0
fi

ed="${GIT_EDITOR:-${VISUAL:-${EDITOR:-vim}}}"
echo "editor=$ed" >> "$LOG"

msg="$(mktemp "${TMPDIR:-/tmp}/lazygit-ai-msg.XXXXXX")"
echo "msg=$msg" >> "$LOG"

# claude stderr -> log (this is where the real error message lands).
{
  git diff --staged --stat
  echo
  git diff --staged | head -c 100000
} \
  | "$cl" -p 'Write a Conventional Commit message for the staged diff on stdin.
Output ONLY the message, no markdown, code fences, or preamble. Subject line:
"type(scope): summary" imperative, max 72 chars (types: feat, fix, refactor,
chore, docs, build; scope = tool/topic dir e.g. zsh, tmux, git). If non-trivial
add a blank line then 1-3 short body lines explaining why. If the diff is empty
or you cannot determine a message, output exactly the single token NO_MESSAGE.' \
    --model haiku --allowed-tools '' --strict-mcp-config --output-format text \
    > "$msg" 2>> "$LOG"
rc=$?
{
  echo "claude rc=$rc  msg_bytes=$(wc -c < "$msg")"
  echo "--- msg content (between markers) ---"
  cat "$msg"
  echo "--- end msg ---"
} >> "$LOG"

if [ -s "$msg" ] && ! grep -qx NO_MESSAGE "$msg"; then
  echo "RESULT: opening editor with message" >> "$LOG"
  git -c core.editor="$ed" commit -e -t "$msg"
else
  echo "RESULT: guard rejected (empty/NO_MESSAGE) — nothing committed" >> "$LOG"
  echo "claude returned no usable message — nothing committed."
fi
# NOTE: cleanup trap intentionally omitted in this debug build so $msg survives.
