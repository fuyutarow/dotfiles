# Forge verification ledger — this skill's own F3 artifact (2026-07-02)

This file is the adversarial-verification findings ledger that gate F3 demands of every forged
skill, produced for THIS skill's own forge — and the worked example of what `references/verifying.md`
§2's fleet returns. A skill that teaches verification and ships without this artifact fails its
own LAW. Re-run the fleet (or write a scale waiver, `references/verifying.md` §7) on any reforge
that touches the LAW, the gates, or a sibling cut; append findings here, never overwrite.

## Fleet summary

5 lenses + a comparative judge (vs the two skill-creator defaults), per `references/verifying.md`
§2: self-contradiction, architecture, sibling cuts, bloat/drift, trigger desk-check. 12 read-only
agents total (two per lens, two judges); fixes applied solo by the editor in the same change-set.

Comparative-judge verdict: realistic asks answered with the defaults loaded vs this skill loaded —
this skill won the creation, reforge, routing, and verification asks; packaging asks tied. A tie
is a regression at cost (`references/verifying.md` §2), which is why the packaging no-fire row now
routes model-native: no skill fires, and if this one does, it delegates to `references/verifying.md`
§4 machinery and stops.

## Findings

| Severity | Lens | Finding | Resolution |
|---|---|---|---|
| BLOCKER | comparative judge | Source taxonomy had no TACIT/ELICITED class — the defaults handle "skill from tacit knowledge you extract by asking"; this skill's engine table silently could not | Source class added to `references/distilling.md` §1; messy no-headline-keyword FIRES row added to SKILL.md |
| MAJOR | self-contradiction | `scripts/` role stated wider than greppable floors — racing the floor-vs-semantic boundary the skill itself teaches | Narrowed to floors; `skill-check.ts` header declares NOT-semantic; F1 pointer re-aimed at `references/architecture.md` §5 |
| MAJOR | trigger desk-check | "why isn't my skill triggering?" conflated two symptoms: not-LISTED (harness mechanics) vs listed-but-never-fires (description craft) — one no-fire row mis-routed half the asks | Split: not-LISTED / truncated → `operating-the-harness` ALONE; listed-but-never-fires → co-fire, diagnostics FIRST, then description craft here |
| MAJOR | sibling cuts | Description raced `operating-the-harness` ("Skills (SKILL.md)") and `raising-resolution` (inspect-before-assert) — no match-time resolution | Sequential split encoded in the description; `raising-resolution` owner-filter row added (reciprocal edit landed 2026-07-02) |
| MAJOR | architecture | Frontmatter carried a `references:` key not in the official allowed set — the skill failed the lint discipline it imposes | Key dropped; the reference index table + build-order one-liner carry the dangling-pointer check |
| MAJOR | architecture | `$PLUGIN` / `$CODEX` used across references with no single defining home (one machine-absolute `/Users/...` path among them) | Defined ONCE in the SKILL.md routing table, `~`-relative; references point |
| MINOR | (various) | 7 further: wording, `wc -c` → `wc -m`, missing plain-scalar WARN, seam comments on the two encoded thresholds, ledger unnamed in SKILL.md, packaging-row route, verify one-liner coverage | All applied in the same change-set |

## Provenance grade — this skill's own content

Per `references/distilling.md` §3 (whose reflexive corollary points HERE): the skill's own claims
are graded like any distilled source's, at capture time.

| Content class | Grade | Notes |
|---|---|---|
| Official-docs rules (frontmatter contract, third-person POV, naming caps, reserved words) | author-confirmed | Fetched with URLs at build (platform.claude.com / agentskills.io, 2026-07-02); re-verify every URL on reforge — docs move |
| The defaults' quoted text (anti-leak rule, near-miss-negative rule, trigger surfaces) | author-confirmed | Quoted verbatim from the `$PLUGIN` / `$CODEX` sources, 2026-07 dissection |
| The 8-skill session patterns (gates carrying the LAW, owner-filter chains, seam clauses, description races) | observed-in-production | 2026-07 reforging of the house collection; captured while the transcripts existed |
| F1–F3 gates, the pipeline, typed-cut vocabulary, the treatment tiers | skill-supplied / constructed | Engineered by the forger, found in no source — never presented in a source's voice |

## 2026-07-24: CONFIRMED — SKILL.md 散文の責任空白(発注者検出、ポストモーテム)

発見: routing 表の linting-prose 行が「do NOT run prose-lint gates on a SKILL.md」と免除し、
linting-prose 側の cut は「SKILL.md の文言監査は forging-skills」と逆送 — 双方が相手を指し、
散文の床を誰も所有しない F2 型の空白。既存 gate は内容(F1)・構造(skill-check)・門数
(堆積の門)のみを測り、散文の負債(規則セル内の実測物語・版見出しの括弧連鎖・長文)を
測らない。結果: acting-as-director が3日6版の append-only 蒸留で全 gate green のまま
テクニカルコミュニケーションとして破綻(発注者検出 2026-07-24)。前提の誤り: skill の読者は
model だけではない — 監査し信頼する人間が第二の読者であり、model にとっても物語混入は
prominence を壊す(この skill 自身の calibration 論に矛盾)。

是正プログラム(機構、徳目でない):
1. skill-check.ts に散文床 WARN 3種(文長・版見出し行数・表セル長)— 実装腕発射済み、
   corpus 負債の baseline 取得込み。
2. acting-as-director の sol 全面改鋳(保全原則つき)を新しい床の pilot とする — 走行中。
3. 本 skill の reforge(免除行の破棄・散文床の明文化・堆積の門に散文負債の軸を追加)は
   pilot 着地後の一巡で行う — append-only patch はこの skill 自身の §6 が禁じるため。

## 2026-07-24: v2607.2.0 reforge — 散文免除の破棄と dual-reader bar の設置(是正プログラム第3段の執行)

AUDIT 2腕(棚卸し腕: 免除の全出現 file:line・堆積 gate の不在の発見/蒸留腕: pilot からの
候補規則13本・負債全数計測・適用範囲の反証4件)→ SPEC/FORGE/検収は監督 solo。

採択と設置:
- THE LAW に「二人の読者」条項。description と routing の免除2行を破棄し、dual-reader bar
  の宣言に置換(SOLE home = architecture.md §5)。F1 に「触った skill は WARN 0 か日付つき
  waiver で forge を出る」、F3 に「床の実測値を台帳に記録」。
- verifying.md §5 の「structure, never meaning」の stale 記述を実装(WARN 3種)と整合。
  §6 staleness に散文負債の行(= 本 skill 初の堆積 analogue — 棚卸し腕の発見どおり、
  「堆積の門」は本 skill 内では未定義語だった — orchestrating-agents には数値上限12の実在の門としてある。未定義だったのは forging-skills 自身の中でのこと)。
- distilling.md §2 に FORM-vs-CONTENT carve-out(散文床規則は command test の対象外 —
  蒸留せず床で執行)。triggering.md §7 に「Mutual-deferral void」型を新設(既存表は
  double-fire 型しか名指していなかった)。execution-models.md の Header formula に
  ≤3行制約の cross-ref。linting-prose の相互 seam は本文 L131 に根拠つきで着地
  (description 側は 1500 字予算のため素の矢印を維持 — 予算超過 1519 を実測して差し戻し)。
- bar の適用範囲は蒸留腕の反証4件どおり限定を明文化: references の論証散文・≥3者 seam・
  index 行・非堆積 EN 本文には全面 atomization を掛けない。

自己適用(touch it, clear it):
- 版見出し: 10行 → 2行+隣接 code fence(WARN 消滅を実測)。scope/lineage の原文は本節末尾に
  逐語退避: 「**Scope**: the CRAFT of creating and reforging Agent Skills — existence,
  distillation, architecture, trigger surface, execution model, verification. Host-agnostic
  core; every Claude-Code-specific number and mechanism is POINTED at operating-the-harness,
  never restated here.」「**Lineage**: forged from the 2026-07 reforging of 8 house skills +
  dissection of both skill-creator defaults + the platform.claude.com / agentskills.io docs
  (Fable 5, 2026-07).」
- WAIVER(dated 2026-07-24): 残余の散文 WARN {長文11・長セル2(既存の defaults 行ほか)} は
  EN 論証本文であり非堆積 — bar 自身の適用範囲判定により全面 atomization の対象外。
  reforge queue は蒸留腕の順位(writing-julia → structuring-documents →
  arguing-research-papers → directing-research → driving-* family)の後段に置く。
- 誠実性の訂正(蒸留腕の指摘): orchestrating-agents 台帳の「改鋳前: 版見出し8行」は 700f55d
  に対して再現しない(当該 header は1行の連鎖で、床は連続行数を数える)。正しい改鋳前実測は
  {長文9・長セル4・版見出し WARN なし}。教訓を bar に反映済み — before 数値は台帳の散文で
  なく床の再実行から導く(蒸留腕の候補規則13)。

検証: skill-check テスト25 green(回帰なし)・自己床は WARN {長文11・長セル2}+上記 waiver で
forge 出口条件を満たす・保全性の read-only 検証レンズは発射済み(判定は本節へ追記)。

### 検証レンズの判定と閉鎖(2026-07-24)

read-only レンズ(自己矛盾・void 閉鎖・one-home・機械照合・SPEC 忠実性): BLOCKER 2・MAJOR 2・
MINOR 3・no_change 4。全件採択して修理:
- BLOCKER: 証明行のトリガ語(散文/読みにくい)が body のみ→ description に日本語 doublet を
  設置(自 skill の triggering 教義への違反だった)。linting-prose を触りながら waiver 無し→
  同 skill の台帳に dated prose-debt waiver を記載し、bar 本文を「ANY commit that edits a
  skill's SKILL.md」に硬化(seam 編集の抜け穴を明示的に閉鎖)。
- MAJOR: description の判断層の帰属曖昧→「floor AND judgment bar owned HERE」に修正。
  one-home の引用鎖→ F1 セルと verifying §5 に §5 への cite を追加(SOLE home へ閉鎖)。
- MINOR: LAW に FORM carve-out の cross-ref、waiver の2機構を PROSE-DEBT waiver / F3
  solo-tier waiver に命名分離、堆積の門の訂正の過剰一般化をスコープ修正。
機械閉鎖: 修理後の床・テスト・description 長は下記コミット前の実測どおり全 green。

## 2026-07-30: v2607.3.0 function-first existence gate

**発端。** 創造的研究familyの再編で、既存skill名へbehaviorを割り当ててから境界を考える順序が、
人間の暗黙知を露出する機能空白を隠した。topicとroute名は違っても、input/outputが同じなら
新skillではない。逆にtopicが近くても、固有のstate transitionとartifactを持つownership voidは
incumbentへ埋め込まない。

**変更。**

1. F2の前提artifactを
   `input state → function verb → owned artifact → next state` のfunction mapへ変更した。
2. pipeline step 0をFUNCTION + EXISTENCE GATEへ変更した。
3. `architecture.md` §2で、MECEの対象をdeclared responsibilities/artifactsと定義した。
   Open-world contentには明示的residualを残し、taxonomyを埋めるための偽の網羅を禁じた。
4. `verifying.md`のreforge-vs-createを、distinct input/output/stop + typed cutが全て書ける場合だけ
   new siblingを認める規則へ硬化した。

この規則により、今回の`ONE existing artifact --EXPOSE--> Blind-spot packet`は再利用可能な
ownership voidとして`surfacing-blind-spots`へ分離された。一方、frame構成、thesis生成、
one-tree testingは各incumbentのartifact ownershipに残った。

**PROSE-DEBT waiver (2026-07-30)。** `skill-check.ts`実測は長文12・長セル2。
前回waiverから長文が1件増えたが、追加箇所はF2の三者以上を結ぶfunction-map seamであり、
`architecture.md` §5が全面atomizationの適用外とするshared-object seamである。既存長文11・
長セル2のqueue位置は2026-07-24節を継承する。descriptionは1500字以下へ戻した。

## 2026-07-30: function-map signer correction (v2607.4.0)

F2のsemantic function mapは対象skillのcraft ownerが署名する。
`orchestrating-agents`はそのlocus/digestを消費してdispatch overlayを加えるだけであり、
mapを共同所有または再定義しない。これによりskill craftとcontrol planeのartifact collisionを
閉じた。

Codex `quick_validate.py`は`Skill is valid!`。`skill-check.ts`はexit 0で長文12・長セル2のため、
直前のdated waiverと同じqueue位置を継承する。descriptionはCodex上限1024文字以内へ蒸留済み。

## 2026-08-03: PROSE-DEBT waiver — practicing-tiger-style reciprocal cut
Observed floor: 12 long prose sentences and 2 long table cells; exit 0.
This change is the reciprocal cut only; no unrelated prose rewrite was authorized.
Queue: retain the existing reforge position; retire this waiver when the recorded classes reach 0.

## 2026-08-08 — reciprocal row for `codifying-doctrine` (F2)

Edit: one routing row added, typing the cut against the new sibling `codifying-doctrine`
(CARDINALITY/PURPOSE — task manual for one executor vs. the trade-off ordering across tasks).
This skill remains the craft owner of that file; reforging it fires HERE. The reciprocal row
lives in `codifying-doctrine`'s routing table and its `tests/triggers.md` row C3.

**PROSE-DEBT waiver (dated 2026-08-08).** This commit leaves `forging-skills` at 12 long prose
sentences and 2 table cells >400 chars — the pre-existing baseline, unchanged by this edit. The
edit is a single routing row and does not touch the debt-carrying sections. Queue position: clear
at the next substantive reforge of this skill, not in a sibling's forge commit.

## 2026-08-15 — F4 STANDING added: the collection's standing cost and retirement

**The void this closes.** Every gate and every pipeline step was per-skill or pairwise. F1 judges
one manual, F3 verifies one manual, F2 types the cut between two. Step 0 gates ADMISSION. Nothing
gated the sum, and nothing ever re-asked whether an existing member still earned its slot — a
collection could grow monotonically while every single admission was individually correct.

**Measured on the day (`agents/skills`, 60 skills).** 56,420 chars of name+description charged on
every turn. 18 descriptions over 1024 (44% of the total). **13 sat within 12 chars of the 1500
per-skill cap** — an allowance being spent, not a length being chosen. That number is the evidence
the void is real: a cap with no total produces exactly this shape.

**Second finding, same class.** `scripts/skill-check.ts` existed since this skill's forge but was
only ever invoked by hand on ONE skill during a forge. Nothing swept the collection. Consequence,
found by the first sweep: 6 orphan-reference FAILs in `turnstile-spin` standing since 2026-06-19,
and 15 plain-scalar descriptions each one `': '` away from breaking a strict YAML parser —
`compiling-latex` had already broken and was being silently skipped by the `skills` CLI. Floor now
runs from `mise run lint:skills-floor`, inside `mise run lint`. A check nobody runs is not a gate.

**Artifacts.** `agents/skills-listing-budget.json` (declared ceiling, a RATCHET — not an estimate
of what the platform affords; nobody here has that number) + `skill-check.ts --budget` reporting
`LISTING <n> skills, <chars> charged per turn` and failing above the ceiling + the retirement
answer required whenever it binds. No budget file → report only, so the floor stays portable.

**Seam with `operating-the-harness`, sharpened rather than moved.** The NUMBERS stay theirs
(per-skill cap, platform limit, truncation). The SPEND is here: what the total may be, and which
member is retired when it binds. A budget with an owner for the cap but none for the decision is
how 13 descriptions came to sit at the cap.

**Gate-fires-red proof.** (a) ceiling at 56,419 with 56,420 measured → `FAIL listing budget:
56420 chars > 56419`, exit 1, naming the three largest. (b) non-numeric `maxListingChars` → FAIL.
(c) missing budget file → FAIL. (d) one directory → no aggregate line, exit 0, so a per-skill
forge run is undisturbed. (e) **the gate fired on its own author**: adding F4's trigger words to
this description took the collection to 56,582 and turned `lint:skills-floor` red before the
ceiling moved. The ceiling was raised to 56,582 in the same commit with the reason recorded in
`raises[]` — the mechanism working, not an exception to it.

**Not done, deliberately.** No skill was retired. F4 gives the collection a ceiling and a place to
record the trade; deciding WHICH member goes is a judgment for the humans who own the collection,
and making that call inside the commit that builds the gate would be the gate authoring its own
first verdict. The 18 descriptions over 1024 are the obvious first docket.

**PROSE-DEBT waiver (dated 2026-08-15).** Floor after this change: 15 long prose sentences (from
12) and 2 table cells >400 chars. The 3 added sentences are the F4 gate row, the seam sentence,
and the LAW clause — each load-bearing and measured against the HEAD baseline. Queue position:
unchanged, clear at the next substantive reforge. Verification tier: solo — F2/F3 fleets were not
re-run, since the LAW clause and the new gate add a transition without re-typing any existing
sibling cut. That waiver is `references/verifying.md` §7's scale calibration, recorded here rather
than assumed.

## 2026-08-17 — F1's second half: line shape, and the 80% the floor never read

**Trigger.** The user asked whether this skill should carry guidance about the executor's cognitive
load. It should, and the void turned out to be two concrete defects rather than a gap in advice.

**Defect 1 — the floor read SKILL.md only.** `checkDirectory` opened `join(directory, "SKILL.md")`
and nothing else; `references/` was touched solely to check that each `.md` is MENTIONED in the body.
Measured across the collection: `SKILL.md` 853,386 chars over 60 files, `references/` **3,337,663
chars over 511 files — 80% of the corpus, never measured.** F1's exit condition is "prose-debt WARNs
0", so a skill could pass F1 with unreadable references. Extending the floor to references surfaced
**4,205 long sentences across 46 skills**, against the 53 the old check reported for the one skill
being audited. The measured surface was showing roughly 1/80th of the debt. Reported as ONE aggregate
WARN per skill naming the worst file — a flood of 4,205 individual lines would reproduce the same
failure the check exists to catch. FAIL count unchanged at 0, so `mise run lint` stays green.

**Defect 2 — the LAW tested retention, never shape.** The proving incident, same day: the Lux/Reactant
correction in `writing-julia` shipped first as a 27-line paragraph. It passed the LAW (every clause
did change what the executor does), passed F2 (no sibling raced it), passed F4 (body text charges no
listing), and passed the floor (which did not read references). It was still wrong: a decision with
TWO discriminating inputs — device × whether Reactant is present — was written as an argument, so the
executor re-derived a lookup on every read. Rewritten as a 4-row table, it also exposed a missing GPU
row that the prose form had hidden.

**The rule added.** A new `## Line shape` section with a four-shape taxonomy (LOOKUP / PREDICATE /
ARGUMENT / NARRATIVE) and one testable rule: **a decision keyed on 2+ discriminating inputs is a
table, not a paragraph**; ARGUMENT and NARRATIVE belong in the ledger. Grep symptom for review:
`because` / `since` / `verified in` / a version number / a historical date inside a rule paragraph.

**EXTEND, not F5.** Step 0's own instruction was applied to this skill: the transition already had an
owner (F1 owns "does this line belong"), so shape became F1's second half rather than a fifth gate.
A new gate would have re-charged the gates table, the reference index, and every sibling ledger that
cites F1–F4 — the exact marginal-admission move F4 exists to refuse.

**No description edit, deliberately.** F4's ceiling is at 56,582 and the existing fire row
「この SKILL.md、散文が読みにくい/監査して」 already routes readability asks here. Adding 認知負荷 as a
trigger word would have charged the listing and required raising the ceiling for a surface that is
already covered. Recorded so a later reader does not read the omission as an oversight.

**Third instance of one error class, recorded because it recurred twice in one session.** (a) The
plain-scalar `description` rewrite verified the intermediate string, not the file it wrote — 10 files
shipped with the closing fence glued to the last line. (b) The line-shape compaction above was
"verified" by re-running the floor, which does not read references, so the number could not move.
(c) This entry's own first draft of the `writing-julia` prose-debt paragraph asserted "classes
unchanged" without measuring; it was wrong and is corrected there. All three are: **measure the
artifact the checker actually reads, not the one you believe you changed.**

**PROSE-DEBT — measured, zero added.** HEAD vs this change, same floor on both trees: SKILL.md long
prose sentences **15 → 15**, table cells >400 chars **2 → 2**, references long sentences **85 → 85**.
No waiver needed. Reaching zero took two passes: the first draft put the 80% / 4,205 numbers INSIDE
the F1 gate cell (pushing cells to 3) and joined two rule sentences past 120 chars (pushing sentences
to 17) — i.e. the new rule's own two violations, NARRATIVE in a manual and an ARGUMENT written as
prose. Both were moved here and split. A rule whose author cannot obey it in the commit that adds it
is not yet a rule. Queue: the pre-existing 15 / 2 / 85 classes are untouched.
