#!/usr/bin/env bash
# Stop hook — code-switching (verb-calque) guard.
#
# BLOCKS (exit 2) when the assistant's own turn text calques an English verb onto する —
# `commitする` / `citeする` / `validateする` — the Language-Confusion tic (Marchisio et al.,
# EMNLP 2024) that linting-prose's hygiene corollary forbids in ANY register. The FIX is always
# trivial and register-independent: use the katakana verb (コミットする) or the Japanese verb
# (引用する / 実行する). This is the feedback layer of the cure; the PRIMARY lever is the
# generation guardrail (operating-the-harness). A gate cannot cure a generation pathology — it
# only catches the one deterministic, always-wrong residue class.
#
# Deliberately NARROW to stay low-FP (a blanket latin-in-Japanese gate is register-relative and
# would false-positive on legitimate domain terms — see linting-prose):
#   - LOWERCASE-initial latin only ⇒ English verbs (commit/cite), never proper nouns (GitHub/AWS).
#   - する-conjugation must sit immediately after ⇒ `commit を実行する` (noun) does NOT match.
#   - katakana verbs (コミットする) are latin-free ⇒ never match.
#
# Safety (mirrors detect-audit-theater.sh):
#   0. FAIL-SAFE   — no jq / no transcript / parse error ⇒ exit 0.
#   1. LOOP-GUARD  — stop_hook_active ⇒ exit 0 (force-stop caps at 8 consecutive blocks).
#   3. TURN-SCOPED — scans only THIS turn's assistant text.
#   4. CODE-STRIPPED — removes ``` fences, `inline` spans, > blockquotes first, so a QUOTED bad
#                    example ("Bad: citeする") never fires.
set -uo pipefail

input=$(cat)
command -v jq > /dev/null 2>&1 || exit 0

[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2> /dev/null)" = "true" ] && exit 0

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2> /dev/null)
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

turn_text=$(jq -rs '
  [ .[] | select(.type=="assistant" or .type=="user") ] as $rel
  | ($rel | map(.type=="user") | rindex(true)) as $u
  | (if $u == null then $rel else $rel[($u + 1):] end)
  | map(select(.type=="assistant") | (.message.content // [])[]
        | select(.type=="text") | .text)
  | join("\n")
' "$transcript" 2> /dev/null || true)
[ -n "$turn_text" ] || exit 0

# strip fenced blocks, inline backtick spans, then markdown blockquotes.
# shellcheck disable=SC2016
stripped=$(printf '%s\n' "$turn_text" \
  | awk 'BEGIN{f=0} /^[[:space:]]*```/{f=!f; next} !f' \
  | sed -e 's/`[^`]*`//g' -e '/^[[:space:]]*>/d')

# lowercase-initial latin word (≥2) immediately + a する-conjugation = verb calque.
# (^|[^A-Za-z]) = word boundary, so GitHub/JavaScript (uppercase-initial) never match via an
# internal lowercase run; [a-z] first char ⇒ English verbs (commit/cite), not proper nouns.
printf '%s' "$stripped" \
  | grep -Eoq '(^|[^A-Za-z])[a-z][a-zA-Z]+ ?(する|します|した|して|される|できる|しない|せず|しよう|すれば|すべき)' \
  || exit 0

cat >&2 << 'MSG'
Code-switching: you calqued an English verb onto する (e.g. "commitする").
Rewrite it — katakana verb (コミットする) or Japanese verb (引用する / 実行する).
Latin verbs never take する directly; this is register-independent (linting-prose hygiene corollary).
MSG
exit 2
