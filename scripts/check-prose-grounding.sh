#!/usr/bin/env bash
# Prose-grounding gate — FAILS (exit 1) when a persisted audience-facing file uses
# audit-theater / metaphor-packaging / unbounded-gate language.
#
# Portable BY DESIGN: pass files or dirs as arguments, so it runs in ANY repo where
# reports / memos / proposals actually live (this dotfiles repo has none):
#   bash scripts/check-prose-grounding.sh report.md docs/proposals/
#   mise run lint:prose-grounding -- report.md         # thin mise wrapper
#
# --external : the document's declared audience is OUTSIDE the project (外賓/顧客/reviewer).
#   Additionally fails on insider register exported to that reader (grounding-prose C9):
#   ledger/provenance IDs, "receipt:", "gated", ALL-CAPS verdict enums. Internal reports
#   legitimately carry these — that is why the C9 set is opt-in, keyed to the audience line.
#
# Semantic source of the word list: the grounding-prose skill denylist.
# EXCLUDES (so the things-being-banned don't self-trip the gate): skill bodies,
# denylist tables, design docs, fenced code blocks, `inline` spans, > blockquotes
# (where bad examples are quoted).
set -uo pipefail

# --- flags & collect target files from args (files or dirs) ---
external=0
targets=()
for p in "$@"; do
  if [ "$p" = "--external" ]; then
    external=1
  elif [ -d "$p" ]; then
    while IFS= read -r f; do targets+=("$f"); done \
      < <(find "$p" -type f \( -name '*.md' -o -name '*.txt' \) 2> /dev/null)
  elif [ -f "$p" ]; then
    targets+=("$p")
  fi
done
if [ "${#targets[@]}" -eq 0 ]; then
  echo "check-prose-grounding: no target files (pass reports/memos/proposals as args)"
  exit 0
fi

# direct-hit terms (self-justifying / closed-gate / metaphor-packaging)
direct='核|本体|中核|エンジン|足場|アンカー|畳む|溶ける|囲う|監査完了|好例|私の起因でない|核は stable|gate を通過'

# C9 — insider register exported to an external reader (only with --external):
# provenance lines, ledger IDs (R2607_016-style), insider verdict verb, verdict enums.
c9='receipt:|\b[A-Z]{1,3}[0-9]{4}_[0-9]{2,3}\b|\bgated\b|\b[A-Z]{3,}_[A-Z_]{3,}\b'

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
  x=''
  if [ "$external" -eq 1 ]; then
    x=$(printf '%s\n' "$stripped" | grep -nE "$c9" || true)
  fi

  if [ -n "$d" ] || [ -n "$b" ] || [ -n "$x" ]; then
    status=1
    echo "── $f"
    [ -n "$d" ] && printf '%s\n' "$d"
    [ -n "$b" ] && printf '%s\n' "$b"
    [ -n "$x" ] && printf '%s\n' "$x" | sed 's/$/   [C9 insider register — external audience]/'
  fi
done

if [ "$status" -ne 0 ]; then
  echo
  echo "prose-grounding gate FAILED — rewrite with: target / violation / cited evidence / replacement / unchecked risk."
  echo "(criteria: the grounding-prose skill — denylist + bounded-PASS rule)"
fi
exit "$status"
