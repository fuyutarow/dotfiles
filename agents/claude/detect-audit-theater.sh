#!/usr/bin/env bash
# Stop hook — audit-theater guard.
#
# BLOCKS (exit 2) when the assistant's own prose-audit / style-review report uses
# self-justifying or unbounded gate language — the "監査完了 / PASS / 核は stable /
# 私の起因でない" performance the linting-prose skill forbids. The
# skill states the criterion; this hook makes it actually FAIL instead of "be careful".
#
# Safety (mirrors detect-leaked-toolcall.sh, plus a Stop-loop guard):
#   0. FAIL-SAFE   — no jq / no transcript / parse error ⇒ exit 0 (never break a turn).
#   1. LOOP-GUARD  — stop_hook_active ⇒ exit 0 (force-stop cap is 8 consecutive blocks).
#   2. CONTEXT-GATE— only audit/review turns: the user asked for a prose/style/skill
#                    review, OR the assistant invoked linting-prose.
#   3. TURN-SCOPED — scans only THIS turn's assistant text (after the last user entry).
#   4. CODE-STRIPPED — removes ``` fences, `inline` spans, and > blockquotes first, so a
#                    QUOTED bad example ("Bad: 監査完了") never fires.
# Detection: specific phrases fire directly; PASS/GREEN fire only when the line carries
# NO "what was checked / what is unchecked" clause (the skill's bounded-PASS rule).
set -uo pipefail

input=$(cat)
command -v jq > /dev/null 2>&1 || exit 0

# 1. loop guard — bail if this is a re-entrant Stop (avoids the 8-block force-stop churn).
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2> /dev/null)" = "true" ] && exit 0

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2> /dev/null)
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

# 3. current turn's assistant text = assistant text blocks after the last user entry.
turn_text=$(jq -rs '
  [ .[] | select(.type=="assistant" or .type=="user") ] as $rel
  | ($rel | map(.type=="user") | rindex(true)) as $u
  | (if $u == null then $rel else $rel[($u + 1):] end)
  | map(select(.type=="assistant") | (.message.content // [])[]
        | select(.type=="text") | .text)
  | join("\n")
' "$transcript" 2> /dev/null || true)
[ -n "$turn_text" ] || exit 0

# most recent HUMAN prompt text (skip tool_result user entries, which have no text).
user_text=$(jq -rs '
  [ .[] | select(.type=="user")
    | (.message.content // []) as $c
    | (if ($c | type) == "string" then $c
       else ($c | map(select(.type=="text") | .text) | join("\n")) end) ]
  | map(select(. != "")) | (last // "")
' "$transcript" 2> /dev/null || true)

# 2. context gate — (a) user asked for a prose/style/skill review, OR (b) skill invoked.
ctx=0
printf '%s' "$user_text" | grep -Eqi 'prose audit|prose review|文体|style (review|rewrite)|skill ?review|skill ?レビュー|レビュー|audit|監査' && ctx=1
# old names kept as back-compat alternates: transcripts and older sessions may still carry them.
printf '%s' "$turn_text" | grep -Eq 'linting-prose|grounding-prose|auditing-audience-facing-prose' && ctx=1
[ "$ctx" = "1" ] || exit 0

# 4. strip fenced blocks, inline backtick spans, then markdown blockquotes.
# shellcheck disable=SC2016  # single-quoted sed is intentional: literal backticks, no expansion
stripped=$(printf '%s\n' "$turn_text" \
  | awk 'BEGIN{f=0} /^[[:space:]]*```/{f=!f; next} !f' \
  | sed -e 's/`[^`]*`//g' -e '/^[[:space:]]*>/d')

hit=0
# specific self-justifying / closed-gate phrases — fire directly.
printf '%s' "$stripped" | grep -Eq '監査完了|核は stable|私の起因でない|好例|gate を通過' && hit=1
# PASS / GREEN (uppercase whole word) — bounded: fire only WITHOUT a checked/unchecked clause.
if printf '%s' "$stripped" | grep -Eqw 'PASS|GREEN'; then
  printf '%s' "$stripped" | grep -Eqi '検査|チェック|scan|checked|未検査|not checked|未確認|remains|残' || hit=1
fi
[ "$hit" = "1" ] || exit 0

cat >&2 << 'MSG'
Your audit report used self-justifying or unbounded gate language.
Rewrite with: target / violation / cited evidence / replacement / unchecked risk.
Do not say PASS, GREEN, 監査完了, 好例, 核, 本体, or 私の起因でない unless bounded to an exact check.
MSG
exit 2
