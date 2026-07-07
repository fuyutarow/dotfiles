#!/bin/sh
# Claude Code statusLine — two lines, portable (POSIX sh + jq + git). mac & WSL.
# Source of truth: ~/dotfiles/agents/claude/statusline-command.sh
#   -> symlinked to ~/.claude/statusline-command.sh by scripts/link-dots.sh
#   line 1: PS1 mirror   user@host:MM-DD HH:MM|cwd    (mirrors .zshrc PROMPT)
#   line 2: Model | Eff | Ctx: <k>·<pct>% | Rate: 5h/7d | [wt] | <branch> | (+add,-del)
#   Eff:  live /effort level (.effort.level) + ✦ when extended thinking on; hidden when
#         the model has no reasoning-effort param (field absent). ultracode -> xhigh.
#   Ctx%: context_window.used_percentage, colored green <70 / yellow <90 / red >=90.
#   Rate: rate_limits 5h & 7d used_percentage (Pro/Max, after 1st API resp), same colors.
#         5h also shows its reset as ⟳HH:MM(remaining) from .five_hour.resets_at (epoch s);
#         omitted when the field is absent (7d unchanged — reset shown for 5h only).
#   wt:   worktree.name — shown only in --worktree sessions.
#   Fit:  the whole of line 2 stays on one row when the pane is wide; when it would
#         overflow $COLUMNS, the Rate/wt/branch/diff tail wraps onto a 3rd row. Claude
#         Code exports COLUMNS (v2.1.153+) and otherwise truncates the row with an ellipsis.
# Input: JSON via stdin from Claude Code.

input=$(cat)

user=$(whoami)
host=$(hostname -s 2> /dev/null || hostname)
dt=$(date "+%m-%d %H:%M")

# zsh %~ : leading $HOME -> ~  (POSIX case; dash-safe, unlike bash ${var/#})
shorten() {
  case "$1" in
    "$HOME") printf '~' ;;
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# Render line 1 (needs no JSON: env-derived).
line1() {
  printf '\033[35m%s\033[0m@\033[33m%s\033[0m:\033[36m%s\033[0m|\033[32m%s\033[0m\n' \
    "$user" "$host" "$dt" "$(shorten "$1")"
}

# Graceful degradation if jq is absent (e.g. fresh WSL before `apt install jq`):
# still render line 1; hint on line 2 instead of a blank/garbled status bar.
if ! command -v jq > /dev/null 2>&1; then
  line1 "$PWD"
  printf '\033[2mModel: ? | install jq for line 2\033[0m'
  exit 0
fi

# One jq pass -> Unit-Separator-joined fields (avoids ~6 jq forks). We join on ASCII
# 0x1F, NOT tab: read() classifies tab as IFS-whitespace and COLLAPSES runs of it +
# trims leading/trailing — which shifts every field left when an interior optional
# field (effort / ctx% / rate) is empty. 0x1F is non-whitespace, so empty fields are
# preserved 1:1. map(tostring) lets numeric/boolean fields survive join (strings-only).
US=$(printf '\037')
fields=$(printf '%s' "$input" | jq -r '[
  (.cwd // .workspace.current_dir // ""),
  (.model.display_name // ""),
  (.model.id // ""),
  (.context_window.total_input_tokens // .context_window.current_usage.input_tokens // 0),
  (.cost.total_lines_added // 0),
  (.cost.total_lines_removed // 0),
  (.effort.level // ""),
  (.context_window.used_percentage // ""),
  (.rate_limits.five_hour.used_percentage // ""),
  (.rate_limits.seven_day.used_percentage // ""),
  (.thinking.enabled // false),
  (.worktree.name // ""),
  (.rate_limits.five_hour.resets_at // "")
] | map(tostring) | join("\u001f")')
IFS="$US" read -r cwd model model_id ctx_tok add del effort ctx_pct rl5 rl7 thinking wt rl5_reset << EOF
$fields
EOF
[ -n "$cwd" ] || cwd="$PWD"

# model name (guarantee e.g. "Opus 4.8"): keep display_name if it already has a
# version, else derive "Family X.Y" from id (claude-opus-4-8[1m] -> Opus 4.8).
case "$model" in
  *[0-9]*) : ;;
  *)
    base=${model_id#claude-}
    base=${base%%"["*}
    fam=${base%%-*}
    ver=${base#*-}
    ver=$(printf '%s' "$ver" | tr '-' '.')
    f1=$(printf '%s' "$fam" | cut -c1 | tr '[:lower:]' '[:upper:]')
    model="${f1}$(printf '%s' "$fam" | cut -c2-) ${ver}"
    ;;
esac
[ -n "$model" ] || model="?"
# Trim the verbose extended-context tag: "Opus 4.8 (1M context)" -> "Opus 4.8 (1M)".
case "$model" in
  *" context)") model="${model% context)})" ;;
esac

# Ctx: live context tokens -> 100800 -> "100.8k"
ctx=$(awk -v t="$ctx_tok" 'BEGIN{ if(t>=1000) printf "%.1fk",t/1000; else printf "%d",t }')
# git branch from cwd (segment omitted if not a repo)
branch=$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2> /dev/null)

# Usage-percent -> rounded int + threshold color (green <70 / yellow <90 / red >=90).
# One awk call; sets $PCT (int) and $PCOL (ANSI 256 code). Guarded by callers on "".
pct_fmt() {
  # awk prints "<int> <color>"; split with parameter expansion (no word-split needed).
  _pf=$(awk -v p="$1" 'BEGIN{ p=p+0; i=int(p+0.5);
    if (i>=90) c="38;5;167"; else if (i>=70) c="38;5;178"; else c="38;5;71";
    print i, c }')
  PCT=${_pf% *}
  PCOL=${_pf#* }
}

# Rate-limit reset epoch (s) -> "⟳HH:MM(<h>h<mm>m)" local clock + time remaining.
# Portable: BSD `date -r <epoch>` (mac) is tried first, GNU `date -d @<epoch>` (WSL)
# is the fallback (on GNU, `-r <n>` fails as "no such file" and drops through). Sets
# $RRESET; guarded by caller on empty input, and blanked if both date variants fail.
rate_reset() {
  RRESET=""
  [ -n "$1" ] || return 0
  _rc=$(date -r "$1" +%H:%M 2> /dev/null || date -d "@$1" +%H:%M 2> /dev/null)
  [ -n "$_rc" ] || return 0
  _rr=$(awk -v s="$(($1 - $(date +%s)))" \
    'BEGIN{ if(s<0)s=0; printf "%dh%02dm", int(s/3600), int(s%3600/60) }')
  RRESET="${RSET}${_rc}(${_rr})"
}

# Escapes/glyphs as vars so segments can be assembled into strings (then measured &
# fitted to width). ESC-based, so `printf '%s'` emits them literally later.
ESC=$(printf '\033')
RST="${ESC}[0m"
DIM="${ESC}[2m"
SEP=" ${DIM}|${RST} "
SPARK=$(printf '\342\234\246') # ✦ extended-thinking marker
MID=$(printf '\302\267')       # · meter middot
BR=$(printf '\342\216\207')    # ⎇ git branch glyph
RSET=$(printf '\342\237\263')  # ⟳ rate-limit reset marker

# HEAD = identity: Model [| Eff ✦] | Ctx [· pct%]
head="${ESC}[38;5;30mModel:${RST} ${model}"
if [ -n "$effort" ]; then
  head="${head}${SEP}${ESC}[38;5;209mEff:${RST} ${effort}"
  [ "$thinking" = "true" ] && head="${head}${ESC}[38;5;222m${SPARK}${RST}"
fi
head="${head}${SEP}${ESC}[38;5;66mCtx:${RST} ${ctx}"
if [ -n "$ctx_pct" ]; then
  pct_fmt "$ctx_pct"
  head="${head} ${DIM}${MID}${RST} ${ESC}[${PCOL}m${PCT}%${RST}"
fi

# TAIL = limits/repo: [Rate 5h·7d] [| wt] [| branch] | (+add,-del)
tail=""
if [ -n "$rl5" ] || [ -n "$rl7" ]; then
  tail="${ESC}[38;5;108mRate:${RST}"
  [ -n "$rl5" ] && {
    pct_fmt "$rl5"
    tail="${tail} 5h ${ESC}[${PCOL}m${PCT}%${RST}"
    rate_reset "$rl5_reset"
    [ -n "$RRESET" ] && tail="${tail} ${DIM}${RRESET}${RST}"
  }
  [ -n "$rl7" ] && {
    pct_fmt "$rl7"
    tail="${tail} ${DIM}${MID}${RST} 7d ${ESC}[${PCOL}m${PCT}%${RST}"
  }
fi
[ -n "$wt" ] && tail="${tail:+${tail}${SEP}}${ESC}[38;5;140mwt: ${wt}${RST}"
[ -n "$branch" ] && tail="${tail:+${tail}${SEP}}${ESC}[38;5;96m${BR} ${branch}${RST}"
tail="${tail:+${tail}${SEP}}${ESC}[38;5;178m(+${add},-${del})${RST}"

# Visible width = strip SGR escapes, count bytes (multibyte glyphs slightly over-count,
# biasing us to wrap a hair early — safe, never truncates). Reserve ~2 cols for Claude
# Code's row indent; COLUMNS unset (pre-2.1.153 or absent) -> assume wide, stay 1 row.
vlen() { printf '%s' "$(printf '%s' "$1" | sed "s/${ESC}\\[[0-9;]*m//g")" | wc -c; }
usable=$((${COLUMNS:-999} - 2))

# --- render: one row if head + " | " + tail fits $COLUMNS, else wrap tail to row 3 ---
line1 "$cwd"
if [ "$(($(vlen "$head") + 3 + $(vlen "$tail")))" -le "$usable" ]; then
  printf '%s%s%s' "$head" "$SEP" "$tail"
else
  printf '%s\n%s' "$head" "$tail"
fi
