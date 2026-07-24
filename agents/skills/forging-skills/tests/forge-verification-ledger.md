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
