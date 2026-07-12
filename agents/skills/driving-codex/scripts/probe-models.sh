#!/usr/bin/env bash
# FLOOR PROBE — deterministic availability check. THIS IS NOT A SEMANTIC CHECK.
# It proves only "this account can run model X right now" (C1 gate in SKILL.md);
# it says nothing about quality, cost-fit, or whether X is the right model for a task.
#
# Usage: probe-models.sh <model> [<model> ...]
#   PROBE_DIR=<dir>  working dir for -C (default: $PWD)
# Prints one "RESULT: AVAILABLE|UNAVAILABLE <model>" line per model; exits 1 if any probe failed.
set -u

[ "$#" -ge 1 ] || { echo "usage: probe-models.sh <model> [...]" >&2; exit 2; }
command -v codex >/dev/null 2>&1 || { echo "FATAL: codex not on PATH — environment problem, not a model result" >&2; exit 2; }
DIR="${PROBE_DIR:-$PWD}"
FAILS=0

for model in "$@"; do
  out=$(timeout 120 codex exec --skip-git-repo-check --sandbox read-only -C "$DIR" \
        -m "$model" -c 'model_reasoning_effort="low"' \
        'Reply with exactly: OK' </dev/null 2>&1)
  rc=$?
  if [ "$rc" -eq 0 ]; then
    tokens=$(printf '%s\n' "$out" | grep -A1 '^tokens used' | tail -n 1 | tr -d ' ')
    echo "RESULT: AVAILABLE $model (${tokens:-?} tokens)"
  else
    note=""
    [ "$rc" -eq 124 ] && note=" — timeout, not a catalog verdict"
    [ "$rc" -eq 127 ] && note=" — codex not runnable, environment problem"
    echo "RESULT: UNAVAILABLE $model (exit $rc)$note"
    printf '%s\n' "$out" | grep -E 'ERROR|error|Not inside a trusted|stream' | head -n 2 | sed 's/^/  /'
    # seam: mirrors SKILL.md C1's ASYMMETRY — runtime aid for readers without SKILL.md in
    # context; sync wording on reforge, do not diff for byte-identity.
    case "$out" in *"model is not supported"*)
      echo "  note: 400 is AMBIGUOUS — a wrong/short ID of a real model errors identically to a not-rolled-out one; verify the exact ID (references/model-catalog.md) before concluding non-existence" ;;
    esac
    FAILS=$((FAILS + 1))
  fi
done

[ "$FAILS" -eq 0 ]
