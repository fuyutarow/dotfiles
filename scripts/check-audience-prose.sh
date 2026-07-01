#!/usr/bin/env bash
# Audience-prose gate — FAILS (exit 1) when a persisted audience-facing file uses
# audit-theater / metaphor-packaging / unbounded-gate language.
#
# Portable BY DESIGN: pass files or dirs as arguments, so it runs in ANY repo where
# reports / memos / proposals actually live (this dotfiles repo has none):
#   bash scripts/check-audience-prose.sh report.md docs/proposals/
#   mise run lint:audience-prose -- report.md          # thin mise wrapper
#
# Semantic source of the word list: the auditing-audience-facing-prose skill denylist.
# EXCLUDES (so the things-being-banned don't self-trip the gate): skill bodies,
# denylist tables, design docs, fenced code blocks, `inline` spans, > blockquotes
# (where bad examples are quoted).
set -uo pipefail

# --- collect target files from args (files or dirs) ---
targets=()
for p in "$@"; do
  if [ -d "$p" ]; then
    while IFS= read -r f; do targets+=("$f"); done \
      < <(find "$p" -type f \( -name '*.md' -o -name '*.txt' \) 2> /dev/null)
  elif [ -f "$p" ]; then
    targets+=("$p")
  fi
done
if [ "${#targets[@]}" -eq 0 ]; then
  echo "check-audience-prose: no target files (pass reports/memos/proposals as args)"
  exit 0
fi

# direct-hit terms (self-justifying / closed-gate / metaphor-packaging)
direct='核|本体|中核|エンジン|足場|アンカー|畳む|溶ける|囲う|監査完了|好例|私の起因でない|核は stable|gate を通過'

status=0
for f in "${targets[@]}"; do
  case "$f" in
    */skills/* | *denylist* | *DESIGN* | *design*) continue ;;
  esac
  # strip fenced code blocks, inline backtick spans, then markdown blockquotes.
  # shellcheck disable=SC2016  # single-quoted sed is intentional: literal backticks, no expansion
  stripped=$(awk 'BEGIN{f=0} /^[[:space:]]*```/{f=!f; next} !f' "$f" \
    | sed -e 's/`[^`]*`//g' -e '/^[[:space:]]*>/d')

  d=$(printf '%s\n' "$stripped" | grep -nE "$direct" || true)
  # bounded PASS/GREEN: keep only lines WITHOUT a "what was checked/unchecked" clause.
  b=$(printf '%s\n' "$stripped" | grep -nEw 'PASS|GREEN' \
    | grep -Eiv '検査|チェック|scan|checked|未検査|not checked|未確認|remains|残' || true)

  if [ -n "$d" ] || [ -n "$b" ]; then
    status=1
    echo "── $f"
    [ -n "$d" ] && printf '%s\n' "$d"
    [ -n "$b" ] && printf '%s\n' "$b"
  fi
done

if [ "$status" -ne 0 ]; then
  echo
  echo "audience-prose gate FAILED — rewrite with: target / violation / cited evidence / replacement / unchecked risk."
  echo "(criteria: the auditing-audience-facing-prose skill — denylist + bounded-PASS rule)"
fi
exit "$status"
