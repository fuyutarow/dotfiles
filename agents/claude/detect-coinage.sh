#!/usr/bin/env bash
# Stop / PostToolUse hook — 造語（コーパス異常複合語）guard。detect-codemix.sh の姉妹機。
#
# 原理: 列挙型 denylist は未知の造語に汎化しない（a denylist loses to coinage by construction —
# linting-prose references/machine-floor.md）。判定を「禁止リスト一致」から「読者語彙の所持」へ
# 反転する: Sudachi SplitMode.C の辞書見出し語 membership（Breen 2010）。strict=HARD は
# 機能接辞 stoplist 外の単漢字成分を含む複合（機械床/構造腕 型の比喩ラベル class）のみ。
#
# 執行点 = 生成時（proactive）:
#   - PostToolUse (Edit|Write): 書き込んだ new_string/content をその場で判定 → exit 2 で
#     stderr が Claude の context に返り、同一 turn 内で自分の造語を自分で直す。
#   - Stop: この turn の assistant 散文を判定（chat 側の網）。
#
# 実体は repo 側の検出器 lint/coinage_flag.py（qoed 等・allowlist 込み）に委譲 —
# 同じ判定を二箇所に持たない。検出器の無い repo では静かに exit 0（opt-in 設計）。
# qlint --features coinage（Rust・同一核）を build した repo では QLINT_COINAGE_BIN で
# そちらを優先できる（起動 数十 ms）。
#
# Safety（detect-codemix.sh と同型）:
#   0. FAIL-SAFE  — jq/uv/検出器 が無い・parse 失敗 ⇒ exit 0
#   1. LOOP-GUARD — stop_hook_active ⇒ exit 0
#   2. JA-GUARD   — 和文（漢字/かな）が 10 字未満 ⇒ exit 0（純 code 編集を素通し）
#   3. CODE-STRIPPED (Stop) — ``` fence / `inline` / blockquote を除去して引用例に発火しない
set -uo pipefail

input=$(cat)
command -v jq > /dev/null 2>&1 || exit 0
[ -f "lint/coinage_flag.py" ] || exit 0 # opt-in: 検出器を持つ repo でのみ働く

event=$(printf '%s' "$input" | jq -r '.hook_event_name // empty' 2> /dev/null)

text=""
case "$event" in
  PostToolUse)
    text=$(printf '%s' "$input" | jq -r '
      (.tool_input.new_string // .tool_input.content // empty)' 2> /dev/null)
    ;;
  Stop)
    [ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false' 2> /dev/null)" = "true" ] && exit 0
    transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2> /dev/null)
    [ -n "$transcript" ] && [ -f "$transcript" ] || exit 0
    text=$(jq -rs '
      [ .[] | select(.type=="assistant" or .type=="user") ] as $rel
      | ($rel | map(.type=="user") | rindex(true)) as $u
      | (if $u == null then $rel else $rel[($u + 1):] end)
      | map(select(.type=="assistant") | (.message.content // [])[]
            | select(.type=="text") | .text)
      | join("\n")' "$transcript" 2> /dev/null | sed -e 's/```[^`]*```//g' -e 's/`[^`]*`//g' -e '/^>/d')
    ;;
  *) exit 0 ;;
esac

[ -n "$text" ] || exit 0
# JA-GUARD: 和文 10 字未満は判定しない（grep の文字範囲は locale 依存で不可 — perl \p{} を使う）
ja=$(printf '%s' "$text" | perl -CSD -ne '$c += () = /[\p{Han}\p{Hiragana}\p{Katakana}]/g; END { print $c // 0 }' 2> /dev/null)
[ "${ja:-0}" -lt 10 ] && exit 0

allow_args=""
[ -f "lint/coinage-allow.txt" ] && allow_args="--allow lint/coinage-allow.txt"

out=$(printf '%s' "$text" | uv run --with sudachipy --with sudachidict-core python lint/coinage_flag.py --strict $allow_args 2> /dev/null)
code=$?
if [ "$code" -eq 1 ]; then
  {
    echo "COINAGE GUARD: いま書いた文に辞書外の比喩ラベル複合（造語）がある。標準語へ書き直すか lint/coinage-allow.txt に理由つきで登録すること:"
    printf '%s\n' "$out" | grep '辞書見出し語でない' | head -5
  } >&2
  exit 2
fi
exit 0
