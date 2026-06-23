#!/usr/bin/env bash
# AI commit-message generator for lazygit (bound to Alt+C in lazygit/config.yml).
# Pipes the STAGED diff to Claude (claude CLI, headless + tool-free) and opens the
# result in the git editor for review. Tool-free + review-gated by design: it can
# NEVER auto-commit or auto-push (an earlier non-bare `claude -p` run was observed
# agentically auto-committing AND auto-pushing — the guards below prevent that).
#
# PRIVACY: sends your staged diff to Anthropic on every run. The lazygit keybinding
# is GLOBAL (fires in every repo) — do NOT use it where the staged diff may contain
# secrets (.env, keys, tokens). Diff is sent on STDIN only, never as an argument.
set -u

# Nothing staged → clean no-op (lazygit shows the message, no error popup).
if git diff --staged --quiet; then
  echo "Nothing staged — stage changes first."
  exit 0
fi

# claude by absolute $HOME-relative path: lazygit runs commands in a NON-interactive
# shell that does NOT source ~/.zshrc, so ~/.local/bin may be off PATH. $HOME-relative
# keeps it portable (claude installs to ~/.local/bin on both mac and WSL).
# Do NOT add --bare: it skips keychain reads and breaks OAuth auth (no ANTHROPIC_API_KEY).
cl="$HOME/.local/bin/claude"
if [ ! -x "$cl" ]; then
  echo "claude not found at $cl — run the claude installer."
  exit 0
fi

# Guarantee an editor for `git commit -e` (EDITOR/VISUAL/core.editor may all be unset;
# vim ships on macOS and WSL Ubuntu). If you set a GUI editor, make it block (--wait).
ed="${GIT_EDITOR:-${VISUAL:-${EDITOR:-vim}}}"

msg="$(mktemp "${TMPDIR:-/tmp}/lazygit-ai-msg.XXXXXX")"
cleanup() { command -v rip >/dev/null 2>&1 && rip "$msg" 2>/dev/null || rm -f "$msg"; }
trap cleanup EXIT

# Cap what we send: full file-level --stat (always small) + up to ~100KB of hunk
# detail, so a huge staged diff stays bounded in tokens/cost while scope/subject stay
# sensible. NO_MESSAGE is the model's escape hatch when it cannot produce a message.
{ git diff --staged --stat; echo; git diff --staged | head -c 100000; } \
  | "$cl" -p 'Write a Conventional Commit message for the staged diff on stdin.
Output ONLY the message, no markdown, code fences, or preamble. Subject line:
"type(scope): summary" imperative, max 72 chars (types: feat, fix, refactor,
chore, docs, build; scope = tool/topic dir e.g. zsh, tmux, git). If non-trivial
add a blank line then 1-3 short body lines explaining why. If the diff is empty
or you cannot determine a message, output exactly the single token NO_MESSAGE.' \
      --model haiku --allowed-tools '' --strict-mcp-config --output-format text \
  > "$msg"

if [ -s "$msg" ] && ! grep -qx NO_MESSAGE "$msg"; then
  # -t = template: git ABORTS if you save it UNEDITED ("you did not edit the
  # message"). Intentional no-blind-commit guard — change >=1 byte to commit.
  # A network hang shows only lazygit's loadingText: press Ctrl-C, lazygit resumes.
  git -c core.editor="$ed" commit -e -t "$msg"
else
  echo "claude returned no usable message — nothing committed."
fi
