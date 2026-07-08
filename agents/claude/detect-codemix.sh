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
# The conjugation list is EXHAUSTIVE across voice/tense/aspect on purpose: the passive-past
# `された` gap let `flag された` slip an entire session (2026-07-05) while `される` was present;
# the causative/desiderative gap let `improveさせたい` slip (2026-07-06) while plain する was
# present — させ*/したい/したく forms added the same day.
# The lowercase-latin guard still exempts 漢語 passives (`解消されている` has no latin ⇒ PASS).
# Regression cases — BLOCK: `flag された` / `sweep されない` / `citeする` / `de-risk する` /
#                           `improveさせたい` / `refactorさせる` / `deployしたい`;
#                    PASS : `解消されている` / `commit を実行する` / `GitHubした` / `設計した`.
if printf '%s' "$stripped" \
  | grep -Eq '(^|[^A-Za-z])[a-z][a-zA-Z]+ *(する|します|した|して|している|していた|しています|しており|される|された|されて|されない|されました|できる|できた|できない|しない|しなかった|せず|しよう|すれば|すべき|しろ|せよ|させる|させます|させた|させて|させている|させたい|させない|させず|させよう|したい|したく|したければ)'; then
  cat >&2 << 'MSG'
Code-switching: you calqued an English verb onto する (e.g. "commitする").
Rewrite it — katakana verb (コミットする) or Japanese verb (引用する / 実行する).
Latin verbs never take する directly; this is register-independent (linting-prose hygiene corollary).
MSG
  exit 2
fi

# ── layer 2: loan-NOUN density, delegated to `qlint codemix` (2026-07-06 user 直命「根治・proactive slop lint」) ──
# The calque grep above catches VERBS (deterministic, always-wrong). Loan NOUNS (`gate へ落とす`
# `judge に丸投げ` `residue へ登録`) are register-relative, so no enumeration here — judgment is
# DELEGATED to the one corpus engine (qlint codemix: latin density per JA paragraph; identifiers
# with _/digits, ALLCAPS acronyms (POVM/SDP), and taxonomy-registered terms are engine-exempt).
# Threshold 8/100字, calibrated on session material (2026-07-06): the assistant's real slop
# reply = 10, its clean rewrite = 0, legitimate technical prose (POVM/Fisher/OED) = 0.
# Paragraphs under 40 JA chars are engine-skipped ⇒ short/English replies never fire.
# FAIL-SAFE: no qlint on PATH (`cargo install --path lint/qlint` in qoed) ⇒ this layer is silent.
if command -v qlint > /dev/null 2>&1; then
  hot=$(printf '%s\n' "$stripped" | qlint codemix --threshold 8 2> /dev/null | grep -c '^⚑') || true
  if [ "${hot:-0}" -gt 0 ]; then
    {
      printf '%s\n' "$stripped" | qlint codemix --threshold 8 2> /dev/null | head -8
      echo 'ルー語密度: この返答の段落が閾値 8 latin/100字 を超えた（上に段落と語彙）。'
      echo '英単語を対訳やカタカナの衣で残さず、概念を日本語の文で書き直すこと。記号・ALLCAPS 略語・taxonomy 登録語は判定から除外済み。'
    } >&2
    exit 2
  fi
fi
exit 0
