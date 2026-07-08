#!/bin/sh
# claim-check.sh — FLOOR check for a filled arguing-research-papers CLAIM SPEC.
#
# Verifies the STRUCTURAL presence of the load-bearing artifacts of the three gates:
#   G1  絞る          — governing claim (ONE) + instability/reader-cost, non-empty & non-placeholder
#   G2  calibrate     — evidence anchor + scope qualifier present; scans for fabrication-risk & superlatives
#   G3  position      — nearest NAMED prior work (NOT bare "unlike prior work") + a reviewer objection
#
# THIS IS NOT A SEMANTIC CHECK. It cannot tell whether an anchor really licenses its claim, whether a
# "gap" is consequential, or whether a citation is real — only whether the slots are filled, the
# positioning is not a bare template, and no obvious over-claim/mush tokens are present. A human/agent
# still verifies MEANING against G1/G2/G3 in SKILL.md and `references/calibration.md`.
#
# Usage:  claim-check.sh <spec.md>   |   cat spec.md | claim-check.sh   |   claim-check.sh -
# Exit:   0 = no FAIL (WARN allowed)   1 = >=1 gate FAIL   2 = usage / file error
#
# Portable across BSD awk (macOS default) and gawk (Linux/WSL): full-width colon normalized to ASCII;
# value taken after the LAST colon (labels contain parenthetical colons); UTF-8 keeps 0x3A ASCII-only.

input="${1:-}"
if [ -z "$input" ] || [ "$input" = "-" ]; then
  input=/dev/stdin
elif [ ! -f "$input" ]; then
  echo "claim-check: file not found: $input" >&2
  exit 2
fi

awk '
function trim(s){ gsub(/^[ \t]+|[ \t]+$/,"",s); gsub(/^　+|　+$/,"",s); return s }
function value_after_last_colon(line,   v,i,p){
  v=line
  gsub(/：/,":",v)                 # normalize full-width colon -> ASCII
  p=0
  for(i=length(v); i>=1; i--){ if(substr(v,i,1)==":"){ p=i; break } }
  if(p==0) return ""
  return trim(substr(v,p+1))
}
function is_placeholder(v){
  if (v=="") return 1
  if (v ~ /^\[\.\.\.\]$|^\[…\]$|^\[ *\]$/) return 1                 # the unfilled [...] template slot
  if (v ~ /^(未回答|未記入|未定|TBD|N\/?A|NA|-|—|ー|―|\?+|\.\.\.)$/) return 1
  return 0
}
# a "named" token: a citation year, a Capitalized multi-char name, or a quoted/bracketed real name
function has_named_ref(v){
  if (v ~ /(19|20)[0-9][0-9]/) return 1                             # a 4-digit year
  if (v ~ /[A-Z][A-Za-z0-9.+-]*[A-Za-z0-9] +et al/) return 1        # Author et al.
  if (v ~ /"[^"]+"|“[^”]+”/) return 1                               # a quoted method name
  # a Capitalized multi-char word that is NOT one of the scaffold words:
  if (v ~ /[A-Z][A-Za-z0-9-][A-Za-z0-9-]+/ && v !~ /^Unlike[, ]/) return 1
  return 0
}
function has_unfilled_template(v){ return (v ~ /\[X\]|\[Y\]|\[Z\]/) }
# A value that is WHOLLY one [ ... ] bracket is an unfilled deferral ([VERIFY], [CITATION NEEDED — …],
# [VALUE], [BASELINE …], [STAT …]). These are the SANCTIONED anti-fabrication placeholder for the G2
# evidence ANCHOR ONLY (SKILL.md §G2 / calibration.md §6). Everywhere else a bracket-only value means
# the gate is not filled -> FAIL. So ph() is applied to every load-bearing slot EXCEPT the anchor.
function is_bracket_ph(v){ return (v ~ /^\[[^]]*\]$/) }
function ph(v){ return (is_placeholder(v) || is_bracket_ph(v)) }

/[Gg]overning claim/            && g1c!=1 { v=value_after_last_colon($0); g1cv=v; g1c=1 }
/[Ii]nstability.*cost|reader-cost/ && g1k!=1 { v=value_after_last_colon($0); g1kv=v; g1k=1 }
/evidence anchor/               && g2a!=1 { v=value_after_last_colon($0); g2av=v; g2a=1 }
/[Ss]cope qualifier/            && g2s!=1 { v=value_after_last_colon($0); g2sv=v; g2s=1 }
/[Nn]earest prior work/         && g3p!=1 { v=value_after_last_colon($0); g3pv=v; g3p=1 }
/reviewer objection|Sharpest.*objection/ && g3o!=1 { v=value_after_last_colon($0); g3ov=v; g3o=1 }

# deny-list scans (references/calibration.md §7) — scan the VALUE of spec bullets, not the template
# labels (else the scaffolding text itself trips the scan). Prose lines are scanned whole.
{
  scanline=$0
  if ($0 ~ /^[ \t]*-/) scanline=value_after_last_colon($0)
  low=tolower(scanline)
  if (low ~ /state-of-the-art|paradigm|paves the way|broad implications|(^|[^a-z])novel([^a-z]|$)|robustly|(^|[^a-z])outperforms|(^|[^a-z])significantly/) sup++
  if (low ~ /may potentially|it is worth noting|to some extent|further research is needed/) mush++
  if (low ~ /unlike prior work|existing methods (struggle|fail|cannot|are)/) bare++
}

END{
  fails=0; warns=0

  # ---- G1 ----
  if(!g1c)                        { print "G1  MISSING  『Governing claim』の行が無い"; fails++ }
  else if(ph(g1cv))               { print "G1  FAIL     governing claim が未記入/placeholder ([VERIFY] 等) -> まだ主張が絞れていない (絞る)"; fails++ }
  else                            { print "G1  PASS     governing claim あり" }
  if(!g1k)                        { print "G1  MISSING  『Instability + reader-cost』の行が無い"; fails++ }
  else if(ph(g1kv))               { print "G1  FAIL     instability/cost が未記入/placeholder -> gap without a cost は problem ではない"; fails++ }
  else                            { print "G1  PASS     instability + reader-cost あり" }

  # ---- G2 ----
  if(!g2a)                        { print "G2  MISSING  『evidence anchor』の行が無い"; fails++ }
  else if(is_placeholder(g2av))   { print "G2  FAIL     evidence anchor 未記入 -> 主張が証拠に紐付いていない"; fails++ }
  else {
    print "G2  PASS     evidence anchor あり (中身が主張を licence するかは人が判定)"
    # fabrication-risk: a bare number / cite-shaped token with no placeholder token
    if (g2av ~ /[0-9]/ && g2av !~ /\[VERIFY|\[VALUE|\[CITATION|\[BASELINE|\[STAT/) {
      print "G2  WARN     anchor に数値があるが [VERIFY]/[VALUE] placeholder も locus 明示も無い -> 実在確認 or placeholder 化 (捏造禁止, calibration.md §6)"; warns++ }
  }
  if(!g2s)                        { print "G2  FAIL     『Scope qualifier』の行が無い -> scope を hedge していない (SKILL.md §G2 の必須 artifact)"; fails++ }
  else if(ph(g2sv))               { print "G2  FAIL     scope qualifier が未記入/placeholder -> \"in regime S ... unless Y\" を書く (scope-hedge/importance-bold)"; fails++ }
  else                            { print "G2  PASS     scope qualifier + rebuttal あり" }

  # ---- G3 ----
  if(!g3p)                        { print "G3  MISSING  『Nearest prior work』の行が無い"; fails++ }
  else if(ph(g3pv))               { print "G3  FAIL     positioning が未記入/placeholder ([CITATION NEEDED] 等) -> 具体の prior を NAMED で"; fails++ }
  else if(has_unfilled_template(g3pv)) { print "G3  FAIL     positioning が template のまま ([X]/[Y]/[Z]) -> 具体の prior method と gap を名指し"; fails++ }
  else if(!has_named_ref(g3pv))   { print "G3  FAIL     bare positioning -> 具体の prior work を NAMED で (\"unlike prior work\" 禁止, CARS Move 2)"; fails++ }
  else                            { print "G3  PASS     named prior work + gap あり" }
  if(!g3o)                        { print "G3  MISSING  『reviewer objection』の行が無い"; fails++ }
  else if(ph(g3ov))               { print "G3  FAIL     sharpest objection が未記入/placeholder -> red-team を回す (reviewer-defense.md §2)"; fails++ }
  else                            { print "G3  PASS     hostile-reviewer objection あり" }

  # ---- whole-spec deny-list (advisory) ----
  print "----"
  if(sup>0)  { printf "DENY  WARN  unwarranted superlative らしきトークン %d 件 -> 各々 inline warrant を付けるか downgrade (calibration.md §1)\n", sup; warns++ }
  if(mush>0) { printf "DENY  WARN  over-hedge mush らしきトークン %d 件 -> verb-softener を削り scope hedge に置換\n", mush; warns++ }
  if(bare>0) { printf "DENY  WARN  bare positioning 句 %d 件 -> named prior method に (spec 外の本文も確認)\n", bare; warns++ }

  printf "gates: FAIL=%d WARN=%d  (FLOOR — 構造のみ。意味は SKILL.md の G1/G2/G3 と calibration.md に照らして人/agent が判定)\n", fails, warns
  if(fails>0){ print "-> FAIL の欄は該当ゲート未通過。fluent な散文で埋めず、どのゲートが落ちたかを述べよ。"; exit 1 }
}
' "$input"
