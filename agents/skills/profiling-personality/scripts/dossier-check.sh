#!/usr/bin/env bash
# dossier-check.sh — floor check that a produced dossier carries every gate section.
# Structural only: it proves the gate HEADINGS exist, never that the content is calibrated.
# The semantic gates (G3 confidence tiers, G4 Barnum filter, G6 ethics) live in
# references/calibration-and-ethics.md — this script is the mechanical floor under them.
# Usage: dossier-check.sh <dossier.md>   → exit 0 all present, 1 if any gate section missing.
set -euo pipefail

f="${1:-}"
if [[ -z "$f" || ! -f "$f" ]]; then
  echo "usage: dossier-check.sh <dossier.md>" >&2
  exit 2
fi

# Each gate → a regex that its heading must match (case-insensitive).
# G1 baseline · G2 state-vs-trait · G3 HEXACO+confidence · G4 Barnum · G5 competing hypotheses ·
# G6 ethics. Layer L4/L5 are method-quality, not gate-mandatory, so not enforced here.
declare -a gates=(
  "G1|Baseline"
  "G2|State.vs.?trait|state vs trait"
  "G3|HEXACO"
  "G4|Barnum"
  "G5|Competing hypotheses"
  "G6|Ethics"
)

missing=0
for entry in "${gates[@]}"; do
  gate="${entry%%|*}"
  pat="${entry#*|}"
  if ! grep -qiE "^#+ .*(${pat})" "$f"; then
    echo "MISSING ${gate}: no heading matching /${pat}/ in $f" >&2
    missing=1
  fi
done

# Confidence-tier presence (G3 substance floor): at least one A/B/C tier marker.
if ! grep -qE '\b(Tier [ABC]|withheld)\b' "$f"; then
  echo "WARN G3: no 'Tier A/B/C' or 'withheld' marker found — confidence may not be tiered" >&2
fi

if [[ $missing -eq 0 ]]; then
  echo "OK: all gate sections present in $f"
fi
exit $missing
