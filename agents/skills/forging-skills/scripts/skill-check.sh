#!/usr/bin/env bash
# FLOOR CHECK — structure only, NOT semantic (the 語彙だけ costume floor).
# A human/agent still verifies MEANING against the three gates (F1 operationality,
# F2 placement, F3 self-verification) in forging-skills/SKILL.md.
#
# Usage: skill-check.sh [skill-dir ...]   (default: the directory it is run from)
# Emits FAIL/WARN lines; exits 1 on any FAIL. POSIX sh + grep/awk/wc/tr/basename.
set -u

FAILS=0
fail() { echo "FAIL $1: $2"; FAILS=$((FAILS + 1)); }
warn() { echo "WARN $1: $2"; }

check_dir() {
  d="${1%/}"
  md="$d/SKILL.md"
  if [ ! -f "$md" ]; then fail "$d" "SKILL.md missing"; return; fi

  # Frontmatter = lines between the first and second '---'
  fm=$(awk 'NR==1{ if ($0 !~ /^---[[:space:]]*$/) exit; next }
            /^---[[:space:]]*$/{ exit } { print }' "$md")
  [ -n "$fm" ] || warn "$d" "no YAML frontmatter (body loads with empty metadata)"

  # --- name: matches dir basename (if present); regex/length/reserved on effective name
  base=$(basename "$d")
  name=$(printf '%s\n' "$fm" | awk -F': *' '$1=="name"{print $2; exit}' | tr -d '"'"'")
  eff="$base"
  if [ -n "$name" ]; then
    eff="$name"
    [ "$name" = "$base" ] || fail "$d" "frontmatter name '$name' != dir basename '$base'"
  fi
  printf '%s' "$eff" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' \
    || fail "$d" "name '$eff' violates ^[a-z0-9]([a-z0-9-]*[a-z0-9])?\$"
  [ "${#eff}" -le 64 ] || fail "$d" "name '$eff' exceeds 64 chars (${#eff})"
  case "$eff" in *--*) fail "$d" "name '$eff' has consecutive hyphens" ;; esac
  case "$(printf '%s' "$eff" | tr 'A-Z' 'a-z')" in
    *claude*|*anthropic*) fail "$d" "name '$eff' contains a reserved word (claude/anthropic)" ;;
  esac

  # --- description: present; length ≤1500 is only a WARN.
  # Platform hard cap is 1024 for API skills; the Claude Code listing-truncation cap is
  # owned by operating-the-harness (commands-and-skills reference) — not restated here.
  desc=$(printf '%s\n' "$fm" | awk '
    started==1 { if ($0 ~ /^[[:space:]]/ || $0 == "") { sub(/^[[:space:]]+/,""); print; next } else exit }
    /^description:[[:space:]]*[>|]/ || /^description:[[:space:]]*$/ { started=1; next }
    /^description:/ { sub(/^description:[[:space:]]*/,""); print; exit }')
  printf '%s\n' "$fm" | grep -Eq '^description:[[:space:]]*[^>|[:space:]]' \
    && warn "$d" "plain-scalar description — any ': ' inside will break YAML parsing (observed 2026-07-02); use >-"
  if [ -z "$desc" ]; then
    fail "$d" "description: missing or empty"
  else
    # SEAM: the ≤1500 margin's home is forging-skills references/triggering.md §3.8
    # (platform hard cap 1024 for API skills; the listing-truncation cap is owned by
    # operating-the-harness) — re-sync this number on reforge.
    # wc -m counts chars, not bytes; joining lines with tr approximates folded (>-)
    # scalars, which fold blank lines to newlines — treat dlen as ~exact, not exact.
    dlen=$(printf '%s' "$desc" | tr '\n' ' ' | wc -m | tr -d ' ')
    [ "$dlen" -le 1500 ] || warn "$d" "description $dlen chars > 1500 (platform hard cap 1024 for API skills; listing cap owned by operating-the-harness)"
  fi

  # --- dangling-file check: every references/*.md must be mentioned in SKILL.md
  for rf in "$d"/references/*.md; do
    [ -e "$rf" ] || continue
    grep -q "$(basename "$rf")" "$md" \
      || fail "$d" "references/$(basename "$rf") exists but is never mentioned in SKILL.md"
  done

  # --- dangling-pointer check: every entry in a frontmatter references: list must exist
  refs=$(printf '%s\n' "$fm" | awk '
    /^references:/ { m=1; next }
    m==1 { if ($0 ~ /^[[:space:]]*-[[:space:]]*/) { sub(/^[[:space:]]*-[[:space:]]*/,""); print } else if ($0 ~ /^[^[:space:]]/) exit }' \
    | tr -d '"'"'")
  for r in $refs; do
    if [ ! -f "$d/$r" ] && [ ! -f "$d/references/$r" ] && [ ! -f "$d/references/$r.md" ]; then
      fail "$d" "frontmatter references '$r' has no file (references/$r.md missing)"
    fi
  done

  # --- body size: >500 lines is a WARN
  # SEAM: the ~500-line body guidance's home is operating-the-harness (commands-and-skills
  # reference) — re-sync this number on reforge.
  body=$(awk '/^---[[:space:]]*$/ && f<2 { f++; next } f==2 { n++ } END { print n+0 }' "$md")
  [ "$body" -le 500 ] || warn "$d" "SKILL.md body $body lines > 500"
}

if [ "$#" -eq 0 ]; then set -- "$PWD"; fi
for dir in "$@"; do check_dir "$dir"; done
[ "$FAILS" -eq 0 ] || exit 1
exit 0
