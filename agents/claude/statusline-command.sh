#!/bin/sh
# Claude Code statusLine — two lines, portable (POSIX sh + jq + git). mac & WSL.
# Source of truth: ~/dotfiles/agents/claude/statusline-command.sh
#   -> symlinked to ~/.claude/statusline-command.sh by scripts/link-dots.sh
#   line 1: PS1 mirror   user@host:MM-DD HH:MM|cwd    (mirrors .zshrc PROMPT)
#   line 2: Model: <name> | Ctx: <tok>k | <git branch> | (+added,-removed)
# Input: JSON via stdin from Claude Code.

input=$(cat)

user=$(whoami)
host=$(hostname -s 2>/dev/null || hostname)
dt=$(date "+%m-%d %H:%M")

# zsh %~ : leading $HOME -> ~  (POSIX case; dash-safe, unlike bash ${var/#})
shorten() {
  case "$1" in
    "$HOME")   printf '~' ;;
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *)         printf '%s' "$1" ;;
  esac
}

# Render line 1 (needs no JSON: env-derived).
line1() {
  printf '\033[35m%s\033[0m@\033[33m%s\033[0m:\033[36m%s\033[0m|\033[32m%s\033[0m\n' \
    "$user" "$host" "$dt" "$(shorten "$1")"
}

# Graceful degradation if jq is absent (e.g. fresh WSL before `apt install jq`):
# still render line 1; hint on line 2 instead of a blank/garbled status bar.
if ! command -v jq >/dev/null 2>&1; then
  line1 "$PWD"
  printf '\033[2mModel: ? | install jq for line 2\033[0m'
  exit 0
fi

# One jq pass -> tab-separated fields (avoids ~6 jq forks).
TAB=$(printf '\t')
fields=$(printf '%s' "$input" | jq -r '[
  (.cwd // .workspace.current_dir // ""),
  (.model.display_name // ""),
  (.model.id // ""),
  (.context_window.total_input_tokens // .context_window.current_usage.input_tokens // 0),
  (.cost.total_lines_added // 0),
  (.cost.total_lines_removed // 0)
] | @tsv')
IFS="$TAB" read -r cwd model model_id ctx_tok add del <<EOF
$fields
EOF
[ -n "$cwd" ] || cwd="$PWD"

# model name (guarantee e.g. "Opus 4.8"): keep display_name if it already has a
# version, else derive "Family X.Y" from id (claude-opus-4-8[1m] -> Opus 4.8).
case "$model" in
  *[0-9]*) : ;;
  *)
    base=${model_id#claude-}; base=${base%%"["*}
    fam=${base%%-*}; ver=${base#*-}
    ver=$(printf '%s' "$ver" | tr '-' '.')
    f1=$(printf '%s' "$fam" | cut -c1 | tr '[:lower:]' '[:upper:]')
    model="${f1}$(printf '%s' "$fam" | cut -c2-) ${ver}"
    ;;
esac
[ -n "$model" ] || model="?"

# Ctx: live context tokens -> 100800 -> "100.8k"
ctx=$(awk -v t="$ctx_tok" 'BEGIN{ if(t>=1000) printf "%.1fk",t/1000; else printf "%d",t }')
# git branch from cwd (segment omitted if not a repo)
branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)

# --- render ---
line1 "$cwd"
printf '\033[38;5;30mModel:\033[0m %s' "$model"
printf ' \033[2m|\033[0m \033[38;5;66mCtx:\033[0m %s' "$ctx"
[ -n "$branch" ] && printf ' \033[2m|\033[0m \033[38;5;96m\342\216\207 %s\033[0m' "$branch"
printf ' \033[2m|\033[0m \033[38;5;178m(+%s,-%s)\033[0m' "$add" "$del"
