#!/usr/bin/env bash
# FLOOR PROBE — deterministic availability check. THIS IS NOT A SEMANTIC CHECK.
# It proves only "this account can run model X right now" (A1 gate in SKILL.md);
# it says nothing about quality, cost-fit, or whether X is the right model for a task.
#
# Usage:
#   probe-models.sh                 no args -> print `agy --version` + the full roster (free,
#                                    local, no quota). Roster comes from `agy models`.
#   probe-models.sh <model> [...]   with args -> treat each arg as an EXACT `agy models`
#                                    display string and run a trivial ping per model.
#
# Verdicts are TRI-STATE (a nonzero exit is NOT automatically "unavailable"):
#   AVAILABLE     rc=0 AND stdout is exactly "OK"      -> the account can run this model now
#   INVALID_NAME  the client-side "not recognized" error (a wrong display string; free, no quota)
#   INCONCLUSIVE  anything else (timeout / auth / service / empty stdout) -> NOT a catalog verdict
# Exits 1 if ANY model came back INVALID_NAME or INCONCLUSIVE (i.e. not a clean AVAILABLE).
set -u

command -v agy >/dev/null 2>&1 || { echo "FATAL: agy not on PATH — environment problem, not a model result" >&2; exit 2; }

# Version floor (A1 / THE LAW): below 1.1.2, an invalid --model silently downgrades and a swallowed
# server error returns exit-0 + empty stdout — so probes below the floor can LIE. Warn, don't hard-fail.
# </dev/null on EVERY agy call in this script — a bare call hangs on the non-TTY stdin
# status check (antigravity-cli#76 class; observed live 2026-07-16: bare `agy models`
# below hung >2 min under Claude Code's Bash while `agy models </dev/null` returned in seconds).
ver=$(timeout 30 agy --version </dev/null 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n1)
floor="1.1.2"
if [ -n "$ver" ] && [ "$(printf '%s\n%s\n' "$floor" "$ver" | sort -V | head -n1)" != "$floor" ]; then
  echo "WARNING: agy $ver is below the $floor floor — invalid-model downgrade + empty-stdout-swallow bugs may make probes unreliable (SKILL.md A1)" >&2
fi

if [ "$#" -eq 0 ]; then
  echo "agy version: ${ver:-unknown}"
  echo "roster (copy display strings VERBATIM — spaces/parens/capitalization are literal):"
  timeout 60 agy models </dev/null || { echo "FATAL: \`agy models\` failed (rc $?) — cannot list the roster" >&2; exit 2; }
  exit 0
fi

FAILS=0
for model in "$@"; do
  out=$(timeout 120 agy --model "$model" -p 'Reply with exactly: OK' </dev/null 2>&1)
  rc=$?
  # trimmed stdout for the exact-"OK" check (strip surrounding whitespace/newlines)
  trimmed=$(printf '%s' "$out" | tr -d '[:space:]')
  if [ "$rc" -eq 0 ] && [ "$trimmed" = "OK" ]; then
    # NO-METER seam: unlike codex's probe there is NOTHING to grep for tokens —
    # agy exposes zero per-call usage anywhere (no stdout line, no --json, no DB field).
    echo "RESULT: AVAILABLE $model (usage: n/a — agy exposes none)"
    continue
  fi
  case "$out" in
    *"not recognized as a known model"*|*"is not recognized"*)
      echo "RESULT: INVALID_NAME $model (exit $rc) — not an EXACT \`agy models\` display name; copy it verbatim incl. spaces/parens/capitalization" ;;
    *)
      note="rc=$rc"
      [ "$rc" -eq 0 ] && note="rc=0 but stdout != 'OK' (empty/other) — possible <1.1.2 swallowed-error landmine (antigravity-cli#76)"
      [ "$rc" -eq 124 ] && note="timeout — not a catalog verdict"
      echo "RESULT: INCONCLUSIVE $model ($note)"
      printf '%s\n' "$out" | grep -E 'Error|error|denied|quota|auth' | head -n 2 | sed 's/^/  /' ;;
  esac
  FAILS=$((FAILS + 1))
done

[ "$FAILS" -eq 0 ]
