#!/usr/bin/env sh
# mise-contract.sh — muscle-memory token gate for the house mise task graph.
#
# THIS IS NOT A SEMANTIC CHECK. It proves token RESOLUTION and grammar floors only:
# it cannot judge whether task bodies do the right thing, whether check's depends are
# sufficient gates, or whether a language cell matches the house recipe (those live in
# wiring-mise-tasks/SKILL.md + references/recipes.md and reviewer judgment).
#
# Contract (SSOT: wiring-mise-tasks/SKILL.md — never re-argue tiers, resolution
# semantics, or waiver rules here; this header restates them ONLY for standalone
# auditability — agrees in substance with SKILL.md, do NOT diff for byte-identity):
#   HARD  fmt f fmt:check lint test up check   → FAIL if unresolved and unwaived
#   SOFT  setup i l t u c                      → WARN if unresolved
#   A token resolves iff it is a LOCAL task name or alias — `mise tasks ls --json`
#   filtered to tasks whose source file lives under the repo root. Global tasks
#   (~/.config/mise) do NOT count: the contract is a property of the repo.
#   Resolution delegates to mise itself, so file-based tasks (mise-tasks/ etc.) and
#   every config spelling count — closing the gaps of regex-parsing mise.toml
#   (qoed mise:refs precedent: bare hyphenated headers were invisible to it).
# Grammar floors (WARN): hyphen inside a task name (colon-only separator rule);
#   `check` with empty depends (check = all-gates aggregate); depends entries that
#   do not resolve locally (wildcard patterns are skipped).
# Waiver — a visible surface for a deliberate hole (silent absence is the failure):
#   # mise-contract: waive <token> -- <reason>        (comment line in mise.toml)
#   One token per line; the ` -- <reason>` part is REQUIRED (a reasonless waive is
#   inert and warned). Lines inside triple-quoted run bodies (''' / """) are ignored
#   — a run-body comment cannot spoof a waiver. Waiving a verb waives its standard
#   single-letter alias too (setup→i, fmt→f, lint→l, test→t, up→u, check→c) — the
#   family is one decision.
#
# Usage: mise-contract.sh [repo-dir ...]   (default: .)
# Exit:  0 = contract satisfied (WARNs allowed) · 1 = HARD violation · 2 = environment error
set -u

command -v mise >/dev/null 2>&1 || { echo "ENV mise not installed"; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "ENV jq not installed"; exit 2; }

HARD="fmt f fmt:check lint test up check"
SOFT="setup i l t u c"

TOTAL_FAILS=0
ENV_FAIL=0

check_repo() {
  repo="$1"
  if ! root=$(cd "$repo" 2>/dev/null && pwd -P); then
    echo "ENV cannot cd to $repo"
    ENV_FAIL=1
    return
  fi

  errf=$(mktemp)
  if ! json=$(cd "$root" && mise tasks ls --json 2> "$errf"); then
    echo "ENV mise tasks ls failed in $root:"
    sed 's/^/ENV   /' "$errf"
    grep -q "not trusted" "$errf" && echo "ENV   hint: run \`mise trust $root/mise.toml\` ([env] blocks need trust before mise lists tasks)"
    rm -f "$errf"
    ENV_FAIL=1
    return
  fi
  rm -f "$errf"
  if ! local_json=$(printf '%s' "$json" | jq --arg r "$root/" '[ .[] | select(.source | startswith($r)) ]'); then
    echo "ENV jq parse failed in $root"
    ENV_FAIL=1
    return
  fi

  count=$(printf '%s' "$local_json" | jq 'length')
  if [ "$count" -eq 0 ]; then
    echo "FAIL  $root: no local mise tasks (contract not adopted)"
    TOTAL_FAILS=$((TOTAL_FAILS + 1))
    return
  fi

  # Resolution set = every local task name + every alias (aliases is always an
  # array in mise's JSON, even when mise.toml wrote a single `alias = "f"`).
  resolve=$(printf '%s' "$local_json" | jq -r '.[] | .name, (.aliases // [])[]')

  # Waiver scan: strip triple-quoted TOML string bodies first (''' / """) so a
  # shell comment INSIDE a run body cannot spoof a waiver (proven attack), then
  # accept only lines carrying the REQUIRED ` -- <reason>` delimiter.
  waived=""
  reasonless=""
  if [ -f "$root/mise.toml" ]; then
    toplevel=$(awk -v sq="'''" -v dq='"""' '
      { line = $0; n = gsub(sq, "", line); m = gsub(dq, "", line) }
      inblock { if ((n + m) % 2 == 1) inblock = 0; next }
      { if ((n + m) % 2 == 1) { inblock = 1; next } print }
    ' "$root/mise.toml")
    waived=$(printf '%s\n' "$toplevel" \
      | grep -E '^[[:space:]]*#[[:space:]]*mise-contract:[[:space:]]*waive[[:space:]]+[^[:space:]]+[[:space:]]+--[[:space:]]' \
      | sed -E 's/^[[:space:]]*#[[:space:]]*mise-contract:[[:space:]]*waive[[:space:]]+([^[:space:]]+).*/\1/')
    reasonless=$(printf '%s\n' "$toplevel" \
      | grep -E '^[[:space:]]*#[[:space:]]*mise-contract:[[:space:]]*waive[[:space:]]+' \
      | grep -Ev '[[:space:]]+--[[:space:]]' \
      | sed -E 's/^[[:space:]]*#[[:space:]]*mise-contract:[[:space:]]*waive[[:space:]]+([^[:space:]]+).*/\1/')
  fi
  # Family closure: waiving a verb waives its standard alias (one decision per family).
  for pair in setup:i fmt:f lint:l test:t up:u check:c; do
    verb=${pair%:*}
    al=${pair#*:}
    printf '%s\n' "$waived" | grep -qxF "$verb" && waived=$(printf '%s\n%s' "$waived" "$al")
  done

  fails=0
  warns=0

  # Dead/typo'd waivers and reasonless waivers are warned, never silently inert.
  for w in $reasonless; do
    echo "WARN  waiver for '$w' has no ' -- <reason>' — inert (reason is required)"
    warns=$((warns + 1))
  done
  for w in $waived; do
    case " $HARD $SOFT " in
      *" $w "*) ;;
      *) echo "WARN  waiver names unknown token '$w' — inert (not in the contract)"
         warns=$((warns + 1)) ;;
    esac
  done

  for tok in $HARD; do
    if printf '%s\n' "$resolve" | grep -qxF "$tok"; then
      echo "OK    $tok"
    elif printf '%s\n' "$waived" | grep -qxF "$tok"; then
      echo "WAIVE $tok (mise.toml waiver)"
    else
      echo "FAIL  $tok — unresolved: mise run $tok would die with 'no task $tok found'"
      fails=$((fails + 1))
    fi
  done

  for tok in $SOFT; do
    if printf '%s\n' "$resolve" | grep -qxF "$tok"; then
      echo "OK    $tok"
    elif printf '%s\n' "$waived" | grep -qxF "$tok"; then
      echo "WAIVE $tok"
    else
      echo "WARN  $tok — unresolved (soft token)"
      warns=$((warns + 1))
    fi
  done

  # Grammar floor 1: hyphen inside a task NAME (colon-only separator rule).
  hyph=$(printf '%s' "$local_json" | jq -r '.[].name | select(test("-"))' | tr '\n' ' ')
  if [ -n "${hyph% }" ]; then
    echo "WARN  grammar: hyphen in task name (colon-only rule): $hyph"
    warns=$((warns + 1))
  fi

  # Grammar floor 2: check must aggregate (depends-only task, never empty).
  chk_deps=$(printf '%s' "$local_json" | jq -r '.[] | select(.name == "check") | .depends | length' | head -n1)
  if [ "${chk_deps:-missing}" = "0" ]; then
    echo "WARN  grammar: check has empty depends (check = all-gates aggregate)"
    warns=$((warns + 1))
  fi

  # Grammar floor 3: every depends entry resolves locally (first word; skip wildcards —
  # mise expands them at run time; qoed's mise:refs never validated depends at all).
  # depends entries can be "task", "task args", or ["task","args"] (array form) —
  # normalize all three to the bare task name before resolving.
  bad_deps=$(printf '%s' "$local_json" \
    | jq -r '.[].depends[]? | if type == "array" then .[0] else (split(" ")[0]) end' \
    | grep -v '\*' | sort -u \
    | while IFS= read -r d; do
        printf '%s\n' "$resolve" | grep -qxF "$d" || echo "$d"
      done | tr '\n' ' ')
  if [ -n "${bad_deps% }" ]; then
    echo "WARN  grammar: depends reference unresolved task(s): $bad_deps"
    warns=$((warns + 1))
  fi

  echo "—     mise-contract: $fails hard, $warns warn ($root)"
  TOTAL_FAILS=$((TOTAL_FAILS + fails))
}

if [ "$#" -eq 0 ]; then set -- "."; fi
for r in "$@"; do check_repo "$r"; done
[ "$ENV_FAIL" -eq 0 ] || exit 2
[ "$TOTAL_FAILS" -eq 0 ] || exit 1
exit 0
