#!/usr/bin/env bash
# Stop hook — 散文 slop guard（detect-codemix.sh + detect-coinage.sh を correo 単一 binary へ統合）。
#
# 置換の範囲: 検出の中核だけを correo に移す。harness の配管（transcript 解析・loop-guard・
# turn 限定・code-strip・exit 2 で stderr を context へ返す）はこの wrapper に残る — correo は
# text を読んで finding を吐く lint であって Claude Code の hook プロトコル処理器ではない。
#
# correo が 3 検出器を一つに束ねる（旧: inline calque regex ＋ qlint codemix ＋ Python coinage_flag.py）:
#   - calque   : 英語動詞＋する/される（session-hardened regex を correo へ移植済み・2026-07-09）
#   - codemix  : latin/100字 密度（旧 qlint の後継）
#   - coinage  : Sudachi 辞書外複合（--features coinage build かつ辞書がある時のみ・無ければ静かに skip）
# 判定の分業: correo は候補を advisory で locate する。BLOCK する/しないの policy はこの wrapper が
# 持つ（calque/coinage の hit = exit 2、codemix は密度 hit = exit 2）。
#
# Safety（旧 hook と同型）:
#   0. FAIL-SAFE  — jq/correo が無い・parse 失敗 ⇒ exit 0（turn を壊さない）。
#   1. LOOP-GUARD — stop_hook_active ⇒ exit 0。
#   3. TURN-SCOPED— この turn の assistant text だけを見る。
#   4. CODE-STRIPPED — ``` fence / `inline` / > blockquote を除去（引用例に発火しない）。
set -uo pipefail

input=$(cat)
# PATH が狭い実行コンテキスト（subprocess 起動方式の変化等）でも correo を見つける保険。
command -v correo > /dev/null 2>&1 || PATH="$PATH:/home/linuxbrew/.linuxbrew/bin:$HOME/.cargo/bin:/usr/local/bin"
command -v correo > /dev/null 2>&1 || exit 0 # fallback でも無ければ opt-in で沈黙 fail-safe
command -v jq > /dev/null 2>&1 || exit 0     # jq も fallback 後に判定（correo と同居する brew 環境を拾う）

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

# fence / inline / blockquote を除去（correo も内部で除去するが、二重でも無害・turn 単位の網）。
stripped=$(printf '%s\n' "$turn_text" \
  | awk 'BEGIN{f=0} /^[[:space:]]*```/{f=!f; next} !f' \
  | sed -e 's/`[^`]*`//g' -e '/^[[:space:]]*>/d')

# correo の exit code 規約: 1=hit（block したい）/ 0=clean / 2=error・skip（辞書無し等 ⇒ FAIL-SAFE）。
# ゆえに block は「exit==1」のみ。2 を block に混ぜると no-dict 環境で誤爆する。
run() { printf '%s' "$stripped" | correo "$@" 2> /dev/null; }

# ── layer 1: 動詞カルク（決定論・常に誤り）⇒ exit 1 で block ──
run calque > /dev/null
if [ $? -eq 1 ]; then
  {
    echo 'Code-switching: 英語動詞を する/される に接いだ（例 "commitする" / "flag された"）。'
    echo 'カタカナ動詞（コミットする）か日本語動詞（引用する / 実行する）へ。register 非依存。'
    run calque | grep '\[calque/' | head -5
  } >&2
  exit 2
fi

# ── layer 2: ルー語（借用名詞）密度 ⇒ 閾値超（⚑ 行あり）で block。codemix は常に exit 0 ゆえ ⚑ を数える ──
hot=$(run codemix --threshold 8 | grep -c '^⚑') || true
if [ "${hot:-0}" -gt 0 ]; then
  {
    run codemix --threshold 8 | grep '^⚑' | head -8
    echo 'ルー語密度: この返答の段落が閾値 8 latin/100字 を超えた。'
    echo '英単語を対訳やカタカナの衣で残さず、概念を日本語の文で書き直すこと。'
  } >&2
  exit 2
fi

# ── layer 3: 造語（辞書外複合）⇒ exit 1 で block。build に coinage 無し / 辞書無しは exit 2 ⇒ FAIL-SAFE skip ──
run coinage --strict > /dev/null
if [ $? -eq 1 ]; then
  {
    echo 'COINAGE GUARD: 辞書外の比喩ラベル複合（造語）がある。標準語へ書き直すか correo.toml の allow に理由つきで登録:'
    run coinage --strict | grep 'not a dictionary headword' | head -5
  } >&2
  exit 2
fi

exit 0
