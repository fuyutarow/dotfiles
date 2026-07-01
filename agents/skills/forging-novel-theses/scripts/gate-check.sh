#!/bin/sh
# gate-check.sh — FLOOR check for a filled forging-novel-theses Phase-4 output.
#
# Verifies the STRUCTURAL presence of the load-bearing artifacts:
#   G1  制約を装った慣習 (箱B) ≥ 1        — non-empty, non-placeholder
#   G2  転移した構造 + 新予測              — non-empty, and a prediction/mapping marker present
#   G3  3a 反証実験 + kill-signal(閾値)    — non-empty AND a threshold token (else "殺せる実験" ではない)
#   3d  撤退基準 (閾値)                    — non-empty; warns if no threshold token
#
# THIS IS NOT A SEMANTIC CHECK. It cannot tell a real 箱B from 箱B-flavored prose, or a genuine
# relation-mapping from a metaphor. It only catches empty / placeholder fields and missing thresholds —
# the "語彙だけ纏った検証不能な作文" floor. A human/agent still verifies MEANING against the gates.
#
# Usage:  gate-check.sh <output.md>   |   cat output.md | gate-check.sh   |   gate-check.sh -
# Exit:   0 = no FAIL (WARN allowed)   1 = ≥1 gate FAIL   2 = usage / file error
#
# Portable across BSD awk (macOS default) and gawk (Linux/WSL): full-width colon is normalized to ASCII
# before splitting, and UTF-8 guarantees 0x3A appears only as a standalone ASCII colon, so [^:]*: is safe.

input="${1:-}"
if [ -z "$input" ] || [ "$input" = "-" ]; then
  input=/dev/stdin
elif [ ! -f "$input" ]; then
  echo "gate-check: file not found: $input" >&2
  exit 2
fi

awk '
function trim(s){ gsub(/^[ \t]+|[ \t]+$/,"",s); gsub(/^　+|　+$/,"",s); return s }
function value_after_colon(line,   v){
  v=line
  sub(/←.*$/,"",v)          # drop trailing template annotation "← ... (Gn)"
  gsub(/：/,":",v)           # normalize full-width colon → ASCII
  if (index(v,":")==0) return ""
  sub(/^[^:]*:/,"",v)        # delete label up to & including the first colon
  return trim(v)
}
function is_placeholder(v){
  if (v=="") return 1
  if (v ~ /\[\.\.\.\]|\[…\]|\[ *\]/) return 1
  if (v ~ /^(未回答|未記入|未定|TBD|N\/?A|NA|-|—|ー|―|\?+)$/) return 1
  return 0
}
function has_threshold(v){
  if (v ~ /[0-9]/) return 1
  if (v ~ /割|超|未満|以上|以下|%|％|閾値|threshold|倍|円|ドル|\$|秒|分|時間|日|週|月|年|回|件|人/) return 1
  return 0
}
function has_prediction(v){ return (v ~ /予測|→|=>|ならば|なら/) }

/制約を装った慣習/            && g1seen!=1 { g1=value_after_colon($0); g1seen=1 }
/転移した構造|源分野/          && g2seen!=1 { g2=value_after_colon($0); g2seen=1 }
/最も安い反証実験|反証実験/     && g3seen!=1 { g3=value_after_colon($0); g3seen=1 }
/撤退基準/                    && d3seen!=1 { d3=value_after_colon($0); d3seen=1 }

END{
  fails=0; warns=0
  if(!g1seen)                     { print "G1  MISSING  『制約を装った慣習』の行が見つからない"; fails++ }
  else if(is_placeholder(g1))     { print "G1  FAIL     箱B 未達（空/placeholder）→ 記述しただけ = me-too"; fails++ }
  else                            { print "G1  PASS     覆す慣習を名指し" }

  if(!g2seen)                     { print "G2  MISSING  『転移した構造』の行が見つからない"; fails++ }
  else if(is_placeholder(g2))     { print "G2  FAIL     転移が空 → 新結合なし"; fails++ }
  else if(!has_prediction(g2))    { print "G2  WARN     新予測/写像記号(→,予測,ならば)が無い → 表層類似(比喩)の疑い"; warns++ }
  else                            { print "G2  PASS     関係写像+予測あり" }

  if(!g3seen)                     { print "G3  MISSING  『3a 最も安い反証実験』の行が見つからない"; fails++ }
  else if(is_placeholder(g3))     { print "G3  FAIL     反証実験が空 → 反証不能 = 信仰"; fails++ }
  else if(!has_threshold(g3))     { print "G3  FAIL     kill-signal に閾値(数値/割/超/%…)が無い → 殺せる実験になっていない"; fails++ }
  else                            { print "G3  PASS     kill-experiment + 閾値あり" }

  if(!d3seen)                     { print "3d  MISSING  『撤退基準』の行が見つからない"; fails++ }
  else if(is_placeholder(d3))     { print "3d  FAIL     撤退基準が空 → 事前 kill-criteria なし"; fails++ }
  else if(!has_threshold(d3))     { print "3d  WARN     撤退基準に閾値が検出できない → 主観的（なんとなく）の疑い"; warns++ }
  else                            { print "3d  PASS     撤退閾値あり" }

  print  "----"
  printf "gates: FAIL=%d WARN=%d  (floor check — 構造のみ検査。意味は人間/エージェントが G1/G2/G3 に照らす)\n", fails, warns
  if(fails>0){ print "→ FAIL の欄は Phase 3 通過条件では『未回答』扱い。thesis を磨く前に、どのゲートが落ちたかを述べよ。" ; exit 1 }
}
' "$input"
