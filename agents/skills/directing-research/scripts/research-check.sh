#!/bin/sh
# research-check.sh — FLOOR check for a filled directing-research RESEARCH SPEC.
#
# Verifies the STRUCTURAL presence of the four gates' MECHANISM slots (the LAW: a virtue targets an
# inner disposition the agent lacks, so the signal must live in an external artifact):
#   G1  select     — consequence-ranked slate + fresh lever (+ fluency check)
#   G2  formulate  — the cheap victory + the optimize/trust firewall (held-out witness)
#   G3  honesty    — pre-registration (TIMESTAMP + threshold) + denominator + generator!=auditor (+ negation)
#   G4  steer      — portfolio + learning-rate kill/persist + >=3 live hypotheses
#
# THIS IS NOT A SEMANTIC CHECK. It cannot tell whether the witness is truly un-gameable, the lever truly
# fresh, or the kill-rule truly keyed to learning-rate — only whether the mechanism slots are filled,
# not placeholders, and carry the load-bearing tokens (a timestamp, a threshold, a denominator number,
# >=3 hypotheses). A human/agent still judges MEANING against G1-G4 in SKILL.md and the references.
#
# Usage:  research-check.sh <spec.md>   |   cat spec.md | research-check.sh   |   research-check.sh -
# Exit:   0 = no FAIL (WARN allowed)   1 = >=1 gate FAIL   2 = usage / file error
#
# Portable across BSD awk (macOS) and gawk (Linux/WSL): full-width colon normalized; value split on the
# label-closing "):" so a colon inside the user's value does not truncate it; UTF-8 keeps 0x3A ASCII-only.

input="${1:-}"
if [ -z "$input" ] || [ "$input" = "-" ]; then
  input=/dev/stdin
elif [ ! -f "$input" ]; then
  echo "research-check: file not found: $input" >&2
  exit 2
fi

awk '
function trim(s){ gsub(/^[ \t]+|[ \t]+$/,"",s); gsub(/^　+|　+$/,"",s); return s }
function value_after_label(line,   v,p){
  # Every SPEC label ends "...): value"; split on the label-closing "):" so a colon INSIDE the
  # user value (e.g. "kill-threshold: ...") does not truncate it. Fallback: after the first colon.
  v=line; gsub(/：/,":",v)
  p=index(v,"):")
  if(p>0) return trim(substr(v,p+2))
  p=index(v,":")
  if(p>0) return trim(substr(v,p+1))
  return ""
}
function is_placeholder(v){
  if (v=="") return 1
  if (v ~ /^\[\.\.\.\]$|^\[…\]$|^\[ *\]$/) return 1
  if (v ~ /^(未回答|未記入|未定|TBD|N\/?A|NA|-|—|ー|―|\?+|\.\.\.)$/) return 1
  return 0
}
function has_number(v){ return (v ~ /[0-9]/) }
function has_timestamp(v){ return (v ~ /(19|20)[0-9][0-9][-\/][0-9]|timestamp|TIMESTAMP|dated|[0-9]{4}-[0-9]{2}/) }
function has_threshold(v){
  if (v ~ /[0-9]/) return 1
  if (v ~ /割|超|未満|以上|以下|%|％|閾値|threshold|kill|below|above|<|>|→ *0|stall/) return 1
  return 0
}
function ge3_items(v,   n,i){
  # >=3 items: a digit >=3 present, OR >=2 item-separators (;, /, newline-list, or numbered)
  if (v ~ /[3-9]|[0-9][0-9]/) return 1
  n=gsub(/;|·|、|, | vs | \/ /,"&",v)
  return (n>=2)
}

/[Cc]onsequence-ranked slate/ && g1s!=1 { g1sv=value_after_label($0); g1s=1 }
/[Ff]resh lever|why-now/       && g1l!=1 { g1lv=value_after_label($0); g1l=1 }
/[Cc]heap victory/             && g2c!=1 { g2cv=value_after_label($0); g2c=1 }
/firewall/                     && g2f!=1 { g2fv=value_after_label($0); g2f=1 }
/[Pp]re-registration/          && g3p!=1 { g3pv=value_after_label($0); g3p=1 }
/[Dd]enominator/               && g3d!=1 { g3dv=value_after_label($0); g3d=1 }
/generator/ && /auditor/       && g3a!=1 { g3av=value_after_label($0); g3a=1 }
/[Pp]ortfolio/                 && g4p!=1 { g4pv=value_after_label($0); g4p=1 }
/[Ll]earning-rate kill/        && g4k!=1 { g4kv=value_after_label($0); g4k=1 }
/[Ll]ive hypothes/             && g4h!=1 { g4hv=value_after_label($0); g4h=1 }
/[Ff]luency check/             && g1fl!=1 { g1flv=value_after_label($0); g1fl=1 }
/formalization throws away|throws away/ && g2t!=1 { g2tv=value_after_label($0); g2t=1 }
/[Nn]egation/                  && g3n!=1 { g3nv=value_after_label($0); g3n=1 }

# deny-scan: a slot filled with a VIRTUE exhortation instead of a mechanism (the LAW) — advisory.
# Anchored on exhortation FORMS ("be/stay/remain <adj>", "make sure to ...") so a descriptive use of a
# word the skill itself directs toward (a "bold" probe, "curiosity" as the generator) does NOT fire.
{
  if ($0 ~ /^[ \t]*-/) {
    sv=tolower(value_after_label($0))
    if (sv ~ /^(be|stay|remain) (honest|careful|rigorous|bold|brave|curious|objective|thorough)([ .]|$)/ || sv ~ /make sure to|try to be|remember to be|just be /) virtue++
  }
}

END{
  fails=0; warns=0
  # G1
  if(!g1s)                     { print "G1  MISSING  『Consequence-ranked slate』の行が無い"; fails++ }
  else if(is_placeholder(g1sv)){ print "G1  FAIL     slate 未記入 -> consequence 前に fluency で選んでいる疑い"; fails++ }
  else                         { print "G1  PASS     consequence-ranked slate あり" }
  if(!g1l)                     { print "G1  WARN     『Fresh lever / why-now』の行が無い"; warns++ }
  else if(is_placeholder(g1lv)){ print "G1  WARN     lever 未記入 -> lever 無しなら shelve with a trigger"; warns++ }
  else                         { print "G1  PASS     fresh lever / why-now あり" }
  if(!g1fl)                    { print "G1  WARN     『Fluency check』の行が無い"; warns++ }
  else if(is_placeholder(g1flv)){ print "G1  WARN     fluency check 未記入 -> effortless method = crowdedness alarm"; warns++ }
  else                         { print "G1  PASS     fluency check あり" }
  # G2 (load-bearing)
  if(!g2c)                     { print "G2  MISSING  『The cheap victory』の行が無い"; fails++ }
  else if(is_placeholder(g2cv)){ print "G2  FAIL     cheap victory 未記入 -> metric が gameable か未検討 (Goodhart)"; fails++ }
  else                         { print "G2  PASS     cheap victory あり" }
  if(!g2f)                     { print "G2  MISSING  『Optimize/trust firewall』の行が無い"; fails++ }
  else if(is_placeholder(g2fv)){ print "G2  FAIL     firewall 未記入 -> held-out witness 無し = optimize した数字を trust している"; fails++ }
  else                         { print "G2  PASS     optimize/trust firewall あり" }
  if(!g2t)                     { print "G2  WARN     『What the formalization throws away』の行が無い"; warns++ }
  else if(is_placeholder(g2tv)){ print "G2  WARN     throws-away 未記入 -> 捨てた所に難しさが有れば frame が誤り (Type III)"; warns++ }
  else                         { print "G2  PASS     throws-away あり" }
  # G3 (load-bearing)
  if(!g3p)                     { print "G3  MISSING  『Pre-registration』の行が無い"; fails++ }
  else if(is_placeholder(g3pv)){ print "G3  FAIL     pre-registration 未記入 -> predicted/postdicted 境界が無い (HARKing)"; fails++ }
  else {
    print "G3  PASS     pre-registration あり"
    if(!has_timestamp(g3pv))   { print "G3  WARN     pre-reg に TIMESTAMP/日付が無い -> 事前に書いた証拠にならない"; warns++ }
    if(!has_threshold(g3pv))   { print "G3  WARN     pre-reg に kill-threshold が無い"; warns++ }
  }
  if(!g3d)                     { print "G3  MISSING  『Denominator』の行が無い"; fails++ }
  else if(is_placeholder(g3dv)){ print "G3  FAIL     denominator 未記入 -> best-of-N を point estimate として報告する疑い"; fails++ }
  else if(!has_number(g3dv))   { print "G3  WARN     denominator に N (試行数) が無い"; warns++ }
  else                         { print "G3  PASS     denominator あり" }
  if(!g3a)                     { print "G3  MISSING  『generator≠auditor』の行が無い"; fails++ }
  else if(is_placeholder(g3av)){ print "G3  FAIL     generator≠auditor 未記入 -> 生成者が自分を監査している (leakage 不可視)"; fails++ }
  else                         { print "G3  PASS     generator≠auditor あり" }
  if(!g3n)                     { print "G3  WARN     『Negation』の行が無い"; warns++ }
  else if(is_placeholder(g3nv)){ print "G3  WARN     negation 未記入 -> 反対仮説を先に述べる (anti-sycophancy)"; warns++ }
  else                         { print "G3  PASS     negation あり" }
  # G4
  if(!g4p)                     { print "G4  WARN     『Portfolio』の行が無い"; warns++ }
  else if(is_placeholder(g4pv)){ print "G4  WARN     portfolio 未記入 -> all-in or scatter の疑い"; warns++ }
  else                         { print "G4  PASS     portfolio あり" }
  if(!g4k)                     { print "G4  MISSING  『Learning-rate kill/persist』の行が無い"; fails++ }
  else if(is_placeholder(g4kv)){ print "G4  FAIL     kill/persist 未記入 -> 方向レベルの kill 基準が無い"; fails++ }
  else                         { print "G4  PASS     learning-rate kill/persist あり" }
  if(!g4h)                     { print "G4  WARN     『Live hypotheses』の行が無い"; warns++ }
  else if(is_placeholder(g4hv)){ print "G4  WARN     live hypotheses 未記入"; warns++ }
  else if(!ge3_items(g4hv))    { print "G4  WARN     live hypotheses が >=3 に見えない -> 1 つに collapse させない (Chamberlin)"; warns++ }
  else                         { print "G4  PASS     >=3 live hypotheses あり" }

  print "----"
  if(virtue>0){ printf "LAW   WARN  virtue らしき記述 %d 件 -> 「be honest」等の徳目ではなく MECHANISM を書く (SKILL.md THE LAW)\n", virtue; warns++ }
  printf "gates: FAIL=%d WARN=%d  (FLOOR — 構造のみ。意味は SKILL.md の G1-G4 と references に照らして人/agent が判定)\n", fails, warns
  if(fails>0){ print "-> FAIL の欄は該当ゲート未通過。徳目で埋めず、どのゲートの mechanism が欠けているかを述べよ。"; exit 1 }
}
' "$input"
