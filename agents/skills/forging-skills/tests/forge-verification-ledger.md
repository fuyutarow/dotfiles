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
