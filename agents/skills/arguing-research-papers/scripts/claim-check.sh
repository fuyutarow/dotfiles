#!/bin/sh
# claim-check.sh — FLOOR check for a filled arguing-research-papers CLAIM SPEC.
#
# Verifies the STRUCTURAL presence of the load-bearing artifacts of the gates:
#   G0  materials     — the "In hand" audit line (what results/priors/venue actually exist), filled
#   G1  絞る          — governing claim (ONE) + instability/reader-cost, non-empty & non-placeholder
#   G2  calibrate     — evidence anchor + scope qualifier (BOTH required; scope missing = FAIL);
#                       scans for fabrication-risk & superlatives
#   G3  position      — nearest NAMED prior work (NOT bare "unlike prior work") + a reviewer objection
# Placeholder discipline: a slot whose value is WHOLLY a [ ... ] bracket ([VERIFY] etc.) counts as
# UNFILLED (FAIL) — except the G2 anchor, where the bracket is the sanctioned anti-fabrication
# deferral (calibration.md §6).
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
#
# Spec contract (SKILL.md CLAIM SPEC): slot labels are grep-anchors — keep them verbatim (English),
# ONE line per slot, the value ON the label line (a value on the next line reads as empty -> FAIL).
# Slot lines are matched at bullet-label START (- Label: / **Label**:) so prose mentioning a label
# phrase cannot steal a slot.

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
  if (v ~ /^(未回答|未記入|未定|TBD|N\/?A|NA|[Nn]one( yet)?|[Nn]othing|なし|-|—|ー|―|\?+|\.\.\.)$/) return 1
  return 0
}
# a "named" token: a citation year, a Capitalized multi-char name, or a quoted/bracketed real name
function has_named_ref(v,   u){
  if (v ~ /(19|20)[0-9][0-9]/) return 1                             # a 4-digit year
  if (v ~ /[A-Z][A-Za-z0-9.+-]*[A-Za-z0-9] +et al/) return 1        # Author et al.
  if (v ~ /"[^"]+"|“[^”]+”/) return 1                               # a quoted method name
  # Strip scaffold/frame phrases (case-insensitive) BEFORE the capitalized-word test:
  #  - "Unlike " is the templates OWN connector ("Unlike [X], which [Y], we [Z]") — stripping it
  #    (instead of blanket-suppressing the WHOLE check whenever v started with "Unlike ", the old
  #    bug) lets the named prior INSIDE the frame ("Unlike ResNet, which requires labels, ...")
  #    still be found.
  #  - "Existing Methods"/"Prior Work"/"Current Approaches"/"Previous Work" are scaffold nouns,
  #    capitalized only because they sit at a clause start, not real names. Stripped so a scaffold
  #    phrase alone can never BE the "capitalized word" that satisfies this check.
  u = strip_scaffold(v)
  if (u ~ /[A-Z][A-Za-z0-9-][A-Za-z0-9-]+/) return 1
  return 0
}
# Case-insensitive removal of scaffold/frame phrases, portable (no gensub/IGNORECASE — BSD awk +
# gawk both support match()/substr() and a dynamic (string) regex): walk the lower-cased copy for
# match positions, splice the SAME-length span out of the original (ASCII case-fold preserves
# length) — repeat until no more matches.
function strip_scaffold(v,   pat,rest,out,s){
  pat = "(existing methods?|prior work|current approaches?|previous work|unlike)"
  rest = v; out = ""
  while ((s = match(tolower(rest), pat)) > 0) {
    out = out substr(rest, 1, s-1)
    rest = substr(rest, s + RLENGTH)
  }
  return out rest
}
# Bare-positioning phrase in the slots OWN value — checked BEFORE has_named_ref (in the G3 chain
# below) so a scaffold sentence like "Existing Methods fail; our approach wins." FAILs even though,
# pre-strip, it looked capitalized enough to pass as a name. Mirrors the whole-spec advisory
# deny-scan later in this script, but as a hard FAIL scoped to the G3 slot itself.
function is_bare_positioning(v,   low){
  low = tolower(v)
  return (low ~ /unlike prior work|(existing methods?|prior work|current approaches?|previous work) (struggle|fail|cannot|are)/)
}
function has_unfilled_template(v){ return (v ~ /\[X\]|\[Y\]|\[Z\]/) }
# A value that is WHOLLY one [ ... ] bracket is an unfilled deferral ([VERIFY], [CITATION NEEDED — …],
# [VALUE], [BASELINE …], [STAT …]). These are the SANCTIONED anti-fabrication placeholder for the G2
# evidence ANCHOR ONLY (SKILL.md §G2 / calibration.md §6). Everywhere else a bracket-only value means
# the gate is not filled -> FAIL. So ph() is applied to every load-bearing slot EXCEPT the anchor.
function is_bracket_ph(v,   t){
  # wholly-placeholder = starts with "[" and nothing but [..] segments + separators remains.
  # Catches the compound forms the template itself teaches ([VERIFY]/[CITATION NEEDED],
  # "[VERIFY] [VERIFY]", nested "[VERIFY (see [3])]") while "Table 3 [VERIFY] on C-bench"
  # and "[VERIFY] ただし低SNR域では成立見込み" (real content outside brackets) still pass.
  t=v
  gsub(/\[[^]]*\]/,"",t)                  # drop every [...] segment
  gsub(/[][()\/ \t·・、,;:-]/,"",t)       # drop separators / stray bracket bits
  return (v ~ /^\[/ && t=="")
}
function ph(v){
  gsub(/［/,"[",v); gsub(/］/,"]",v)      # full-width brackets -> ASCII (JA-writing model)
  gsub(/【/,"[",v); gsub(/】/,"]",v)
  return (is_placeholder(v) || is_bracket_ph(v))
}

# Slot capture: anchored to bullet-label START (kills prose-steal: "doma[in hand]-crafted",
# a Sub-contributions label mentioning "governing claim", etc.). A later duplicate line may
# OVERWRITE a still-placeholder capture (iterating agents append rather than rewrite).
/^[ \t]*[-*][ \t*]*[Ii]n hand/                        { v=value_after_last_colon($0); if(!g0 || ph(g0v)) { g0v=v; g0=1 } }
/^[ \t]*[-*][ \t*]*[Gg]overning claim/                { v=value_after_last_colon($0); if(!g1c || ph(g1cv)){ g1cv=v; g1c=1 } }
/^[ \t]*[-*][ \t*]*([Ii]nstability|[Rr]eader-cost)/   { v=value_after_last_colon($0); if(!g1k || ph(g1kv)){ g1kv=v; g1k=1 } }
/^[ \t]*[-*][ \t*]*([Ee]vidence anchor|[Pp]er claim.*anchor)/ { v=value_after_last_colon($0); if(!g2a || ph(g2av)){ g2av=v; g2a=1 } }
/^[ \t]*[-*][ \t*]*[Ss]cope qualifier/                { v=value_after_last_colon($0); if(!g2s || ph(g2sv)){ g2sv=v; g2s=1 } }
/^[ \t]*[-*][ \t*]*[Nn]earest prior/                  { v=value_after_last_colon($0); if(!g3p || ph(g3pv)){ g3pv=v; g3p=1 } }
/^[ \t]*[-*][ \t*]*([Ss]harpest|[Rr]eviewer objection)/ { v=value_after_last_colon($0); if(!g3o || ph(g3ov)){ g3ov=v; g3o=1 } }

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

  # ---- G0 ----
  if(!g0)                         { print "G0  FAIL     『In hand』(materials audit) の行が無い -> 手元の results/priors/venue を監査してから主張を組む (SKILL.md G0)"; fails++ }
  else if(ph(g0v))                { print "G0  FAIL     materials audit 未記入 -> 実際に手元にある物を列挙 (無い物は placeholder 化し下流で断言しない)"; fails++ }
  else                            { print "G0  PASS     materials audit あり" }

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
    # WARN only when a number rides with NEITHER a placeholder NOR a stated locus (Table/Fig/…) —
    # a locus-explicit anchor ("Table 3, 0.24") is the canonical CORRECT fill, not a risk.
    if (g2av ~ /[0-9]/ && g2av !~ /\[VERIFY|\[VALUE|\[CITATION|\[BASELINE|\[STAT/ && g2av !~ /[Tt]able|[Ff]ig|[Tt]heorem|[Ll]emma|§|[Aa]ppendix|表|図|定理|補題|付録/) {
      print "G2  WARN     anchor に数値があるが [VERIFY]/[VALUE] placeholder も locus 明示も無い -> 実在確認 or placeholder 化 (捏造禁止, calibration.md §6)"; warns++ }
  }
  if(!g2s)                        { print "G2  FAIL     『Scope qualifier』の行が無い -> scope を hedge していない (SKILL.md §G2 の必須 artifact)"; fails++ }
  else if(ph(g2sv))               { print "G2  FAIL     scope qualifier が未記入/placeholder -> \"in regime S ... unless Y\" を書く (scope-hedge/importance-bold)"; fails++ }
  else                            { print "G2  PASS     scope qualifier + rebuttal あり" }

  # ---- G3 ----
  if(!g3p)                        { print "G3  MISSING  『Nearest prior work』の行が無い"; fails++ }
  else if(ph(g3pv))               { print "G3  FAIL     positioning が未記入/placeholder ([CITATION NEEDED] 等) -> 具体の prior を NAMED で"; fails++ }
  else if(has_unfilled_template(g3pv)) { print "G3  FAIL     positioning が template のまま ([X]/[Y]/[Z]) -> 具体の prior method と gap を名指し"; fails++ }
  else if(is_bare_positioning(g3pv)) { print "G3  FAIL     bare positioning 句 (\"unlike prior work\"/\"existing methods fail\" 等) -> 具体の named prior method + gap に置換 (CARS Move 2)"; fails++ }
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
