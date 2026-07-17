#!/usr/bin/env bash
# FLOOR PROBE — deterministic availability check. THIS IS NOT A SEMANTIC CHECK.
# It proves only "this session can run model X right now" (G1 gate in SKILL.md);
# it says nothing about quality, cost-fit, or whether X is the right model for a task.
#
# Usage:
#   probe-models.sh                 no args -> print `grok --version` + the full roster (free,
#                                    local, no quota). Roster comes from `grok models`.
#   probe-models.sh <model> [...]   with args -> treat each arg as an EXACT model id (copied from
#                                    `grok models` or references/model-catalog.md) and run a
#                                    trivial --output-format json ping per model.
#
# PATH NOTE: if `grok` is not on PATH (e.g. a linuxbrew install absent from a non-login shell's
# PATH, or a binary on a remote host reached over ssh), point GROK at the full path, e.g.
#   GROK=/path/to/grok probe-models.sh ...
# GROK overrides the binary this script invokes (default: grok, resolved off PATH).
#
# Verdicts are TRI-STATE (a nonzero exit is NOT automatically "unavailable"):
#   AVAILABLE     rc=0 AND .text == "OK"          -> the account can run this model now;
#                                                     also prints .usage.total_tokens (METERED)
#   INVALID_NAME  the client-side "unknown model id" error (a wrong id; free, no quota consumed)
#   INCONCLUSIVE  anything else (timeout / auth / service / malformed json) -> NOT a catalog verdict
# Exits 1 if ANY model came back INVALID_NAME or INCONCLUSIVE (i.e. not a clean AVAILABLE).
set -u

GROK="${GROK:-grok}"
command -v "$GROK" >/dev/null 2>&1 || { echo "FATAL: $GROK not on PATH — environment problem, not a model result" >&2; exit 2; }

if [ "$#" -eq 0 ]; then
  "$GROK" --version
  echo "roster (copy model ids VERBATIM from this list — -m rejects anything else client-side):"
  "$GROK" models || { echo "FATAL: \`$GROK models\` failed (rc $?) — cannot list the roster" >&2; exit 2; }
  exit 0
fi

have_jq=0
command -v jq >/dev/null 2>&1 && have_jq=1

# EXFIL-RISK (SKILL.md G1/G2): grok bundles the whole tracked repo even on a trivial prompt, so the
# ping must NOT run in a real repo. Run every ping from a fresh throwaway dir under --sandbox
# read-only; the trap cleans it up. (The sandbox does NOT close the in-process upload channel — the
# empty cwd is the real control; the sandbox only bounds filesystem blast radius.)
PROBE_TMP=$(mktemp -d 2>/dev/null) || { echo "FATAL: mktemp -d failed — cannot make a scrubbed probe dir" >&2; exit 2; }
trap 'rm -rf "$PROBE_TMP" 2>/dev/null' EXIT

FAILS=0
for model in "$@"; do
  out=$(cd "$PROBE_TMP" && timeout 120 "$GROK" -p 'Reply with exactly: OK' -m "$model" \
        --output-format json --sandbox read-only </dev/null 2>&1)
  rc=$?

  text=""
  tokens=""
  if [ "$rc" -eq 0 ]; then
    if [ "$have_jq" -eq 1 ]; then
      # jq parse doubles as a JSON-wellformedness check — a truncated envelope fails here.
      text=$(printf '%s' "$out" | jq -r '.text // empty' 2>/dev/null)
      tokens=$(printf '%s' "$out" | jq -r '.usage.total_tokens // empty' 2>/dev/null)
    else
      # grep fallback: crude field extraction. Guard against a TRUNCATED envelope whose intact
      # "text":"OK" precedes the cut point — require the payload to end in '}' AND carry a usage
      # block, else treat as malformed (INCONCLUSIVE), not a clean AVAILABLE. (Does NOT unescape \" —
      # safe here only because $text is compared for exact equality against the literal OK.)
      case "$out" in
        *'}') if printf '%s' "$out" | grep -q '"usage"'; then
                text=$(printf '%s' "$out" | grep -oE '"text"[[:space:]]*:[[:space:]]*"[^"]*"' | head -n1 | sed -E 's/^"text"[[:space:]]*:[[:space:]]*"([^"]*)"$/\1/')
                tokens=$(printf '%s' "$out" | grep -oE '"total_tokens"[[:space:]]*:[[:space:]]*[0-9]+' | head -n1 | grep -oE '[0-9]+$')
              fi ;;
      esac
    fi
  fi

  if [ "$rc" -eq 0 ] && [ "$text" = "OK" ]; then
    # METERED seam: unlike agy's probe (nothing to grep — agy exposes zero per-call usage), grok's
    # json envelope carries real numbers here — show total_tokens.
    echo "RESULT: AVAILABLE $model (usage.total_tokens: ${tokens:-?})"
    continue
  fi

  case "$out" in
    *"unknown model id"*)
      echo "RESULT: INVALID_NAME $model (exit $rc) — not an exact model id (\`$GROK models\` or references/model-catalog.md); copy it verbatim" ;;
    *)
      note="rc=$rc"
      [ "$rc" -eq 0 ] && note="rc=0 but .text != \"OK\" (empty/malformed json, or a genuinely different reply) — not a clean AVAILABLE"
      [ "$rc" -eq 124 ] && note="timeout — not a catalog verdict"
      echo "RESULT: INCONCLUSIVE $model ($note)"
      printf '%s\n' "$out" | grep -E 'Error|error|denied|quota|auth' | head -n 2 | sed 's/^/  /' ;;
  esac
  FAILS=$((FAILS + 1))
done

[ "$FAILS" -eq 0 ]
