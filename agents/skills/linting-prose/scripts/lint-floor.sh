#!/usr/bin/env bash
# Machine floor runner — DETECT-ONLY by contract.
#
# Why this wrapper exists (2026-07-04 external review, F2): textlint treats prh entries as
# fixable, and the house prh dicts' replacement strings are GUIDANCE TEXT, not substitutions —
# so `textlint --fix` would inject meta-instructions like
# 「検証済み（何をどう検証し何が残るかを同一行で明記…）」 straight into the document.
# The anti-auto-substitution rule (references/machine-floor.md) is enforced HERE mechanically,
# not by prose.
#
# Usage:
#   scripts/lint-floor.sh <files...>                      # JA house floor (textlintrc.json)
#   LINT_PROSE_CONFIG=assets/textlintrc-external.json \
#   scripts/lint-floor.sh <files...>                      # external register (adds C9 prh set)
set -euo pipefail

for a in "$@"; do
  case "$a" in
    --fix|--fix-dry-run)
      echo "REFUSED: --fix is banned on the prose floor (detect-only; prh replacements are guidance, not text)." >&2
      echo "See references/machine-floor.md — the anti-auto-substitution rule." >&2
      exit 2
      ;;
  esac
done

here="$(cd "$(dirname "$0")" && pwd)"
cfg="${LINT_PROSE_CONFIG:-$here/../assets/textlintrc.json}"
exec bunx textlint --config "$cfg" "$@"
