---
name: forging-novel-theses
description: >-
  Construct a NOVEL venture / research / product thesis that does NOT yet exist — via a trainable
  GENERATION engine (first-principles decomposition → cross-domain structure-transfer → recombination) —
  AND harden it through the CONTROL LOOP that idea-books (『天才思考』-type "10 の思考法") omit: falsification
  design · why-now timing · capital fit · pre-committed kill criteria. Law: 着想の発生は易しい、生き延び
  させる制御が難しくそこが実利の中心 — a thesis with no designed kill-experiment is 信仰, not 戦略. Fire when
  you must INVENT and harden the idea itself, not merely test a bet you already hold. Trigger on:
  事業アイデア / 新規事業, thesis を固めたい, novelty / この着想は弱くないか, 第一原理で分解,
  アナロジー / 構造転移 / structure-mapping / 新結合, 箱A vs 箱B (物理 vs 慣習), 原価テアダウン, フェルミ分解,
  SF プロトタイピング, ナラティブ / マスタープラン, 反証設計, why now / タイミング,
  資本適合 / time-to-truth / runway, beachhead / wedge, 撤退基準 / kill criteria, ピッチで語る thesis の中身,
  イノベーションの型, 後付けでない検証. DECISIVE CUT vs acting-on-hypotheses: that skill TESTS & COMMITS a bet
  you ALREADY hold (Map/Loop/Leap, no invention); THIS fires only when you must GENERATE the novel thesis —
  nothing to invent, or a bare 反証 / kill / pivot / MVP ask on an idea in hand → acting-on-hypotheses.
  Deck / talk DELIVERY → designing-presentations; distributing an EXISTING tool → growing-oss-adoption;
  inspecting a PRESENT fact → raising-resolution. Workflow-native: forge solo — agents verify facts and
  refute gates only; agent consensus is an ANTI-signal. English skill; respond in the user's language
  (default Japanese).
references:
  - generation-engine
  - control-loop
  - boundaries
  - lineage
  - source-map
  - case-ledger
---

# Forging novel theses — generate the idea, then design what kills it

> **Fire when**: you must *invent* a novel venture / research / product thesis (not just evaluate one you
> hold) AND it is meant to be *bet on* (so survival planning is load-bearing). **Deliverable**: a filled
> Phase-4 template that passes the three gates. **Language**: this skill is English; the deliverable
> defaults to the user's language (Japanese). Keep stable tokens even in Japanese: 箱A/箱B, 制約を装った慣習,
> 構造写像, 新結合, beachhead/wedge, 反証設計, why now, time-to-truth vs runway, 撤退基準, 合意非依存.
>
> **Why this shape (1 line)**: idea-books mix trainable *procedure* with untrainable *気質* and omit the
> *control loop*; this skill 工程化 only the procedure, gates 気質 at Phase 0, and makes the loop first-class.
> Full critique + intellectual lineage → `references/lineage.md` (don't recite it; execute the phases).
>
> **Build order (ATOMIC — ship in ONE commit; no pointer may dangle).** Verify from the skill dir:
> `for f in generation-engine control-loop boundaries lineage source-map case-ledger; do test -f references/$f.md || echo MISSING $f; done; test -f scripts/gate-check.ts || echo MISSING gate-check.ts`
> (must print nothing).

## 運用契約 (When invoked) — 毎回この順で回す

> ゲート定義は下の CORE 三ゲート表、Phase 詳細は各節、機械検査は Phase 4。判別の実例は `references/case-ledger.md`。

1. **発火判定** — GENESIS（novel な thesis を *発明*）要る? ＋ SURVIVAL（*賭ける* ので生存計画が load-bearing）
   要る? **両方 No なら別スキルへ**（賭けの検証だけ→acting-on-hypotheses / DELIVERY→designing-presentations /
   現在事実の inspect→raising-resolution）。
2. **Phase 0 は記録して続行**（停止しない）→ **Phase 1–2 で生成**し、G1（箱B ≥ 1 名指し）・G2（写像から新予測）の
   artifact を必ず出す。
3. **現在事実**（価格・可能化する変化・コスト曲線・市場規模）は一次情報を引く（grep/read/fetch/measure）か、
   引けなければ **「要検証／推定」と明示**。捏造は artifact を空洞化する。
4. **Phase 3 制御ループ**で G3（kill-experiment + 閾値つき kill-signal）と 3b/3c/3d を埋める。**どれかのゲート／
   副ゲートが落ちたら thesis を磨かず、どのゲートが落ちたかを名指し**し弱点として晒す。
5. **Phase 4 template** を埋め、`bun scripts/gate-check.ts <出力.md>` で floor-check。FAIL 欄は「未回答」扱い。
6. **次の『最も安い 1 手』を 1 つ**出す（律速＝生成 or 生存 のどちらかを名指し、それを崩す最安の一撃）。

## CORE — read every time (precedence-setting)

### THE LAW

> **着想の発生 (Phase 1–2) は易しい部分。それを不確実性下で生き延びさせる制御ループ (Phase 3) が難しく、
> そこが実利の中心。** 生成だけを回して制御を欠いた出力は、批判した着想系書籍そのもの。反証・why-now・資本・
> 撤退の **1 つでも未回答なら生存計画は不完全** — その欄を弱点として明示し、埋めるまでピッチ／実装に進むな。

### The three gates — each demands a grep-able artifact (no artifact → gate un-passed)

同型: systematizing-knowledge の ledger 規律・acting-on-hypotheses の R1/R2/R3。**感触では通れない。**

| # | Gate | 反転する誤り | ARTIFACT (存在必須) |
|---|---|---|---|
| **G1** | 分解は「箱B = 制約を装った慣習」を **最低 1 つ名指し**して初めて成立。箱B が空なら、分解ではなく *記述しただけ* = me-too。(Phase 1a) | 記述を分解と誤認 | **覆す対象の慣習リスト (≥1)**、各々に「なぜ物理でなく経路依存か」の 1 行由来 |
| **G2** | 転移は *関係構造* の写像でなければ比喩 = 装飾。写像から **新しく検証可能な予測**が出ないなら表層類似、棄却。(Phase 1b) | 比喩を新結合と誤認 | **源分野 → 対象の関係マッピング** ＋ そこから出る新予測 1 つ |
| **G3** | thesis を「最も安く殺せる実験」を実装フル投資の *前* に書けなければ、反証不能 = 信仰であって戦略ではない。(Phase 3a) | 確信を支持する証拠集めを検証と誤認 | 着手前に書いた **kill-experiment + kill-signal (閾値つき)** |

**確信を支持する証拠を増やすな、確信を殺す最安の一撃を探せ。** これが G3 の姿勢であり、Phase 0 の合意非依存
(群衆からの独立) の対抗軸 = 自己反証。独立 + 自己反証 = 良い認識論。自己反証なき独立は、ただの奇人。

### 現在事実の規律 (raising-resolution の citation gate を継承)

価格・可能化する変化・コスト曲線・市場規模など *現在の事実* を主張するときは、一次情報を引く
(grep / read / web-fetch / measure) か、引けないなら **「未検証／推定」と明示**せよ。もっともらしい数字の捏造は
G1–G3 の artifact を空洞化する（＝この skill の最悪の失敗＝語彙だけ纏った検証不能な作文）。

### Phase 0 — 気質ゲート (anti-freeze: 判定して記録、停止しない)

skill はこれを install できない — 判定して**記録**するだけ。**書けなくても停止して問い詰めない**（それは
acting-on-hypotheses R1 が禁じる freeze）。

- **合意非依存 (Thiel の問い)**：多くの人が誤っていて自分だけが正しい、重要で具体的な真実は何か。1 文で書けるか。
  書けなければ「未回答」と記録し、暫定の逆張り仮説を 1 つ置いて生成を続け、Phase 4 で弱点として晒す。
- **内発性**：誰も称賛しなくても追うか。外的報酬が主成分なら「要注意」と記録（逆風で折れる）。
- ユーザーへの質問は、それが **安く かつ 生成を実際にブロックする 1 問**に限る。

## The stack — 最短手順 (Phase 0 gates → 1–2 generate → 3 wraps as a loop → 4 output)

```
Phase 0  GATE      合意非依存(1文) + 内発性     ── 判定して記録（停止しない）
Phase 1  GENERATE  1a 分解 → 箱B(G1)  ×  1b 転移(G2) → 1c 再結合 → thesis 候補集合
Phase 2  PROJECT   2a 未来外挿 → beachhead   2b ナラティブ (説得 / 知覚変容 を明示)
Phase 3  CONTROL   3a 反証(G3) · 3b why-now · 3c 資本適合 · 3d 撤退  ── 全体を包む反復ループ
                     ↑ 実装で現実接触 → 新観測 → Phase 1 へ
Phase 4  OUTPUT    template を埋め、scripts/gate-check.ts で検査。空欄は「未回答」と明記し弱点と述べる
```

## Phase 1 — 生成エンジン (訓練可能な核) → `references/generation-engine.md`

**分解と転移は独立した工程ではなく、1 つの機構の両半分。** 分解だけなら空虚な問題文、転移だけなら表層の比喩。

- **1a. 分解** — 原始要素まで割る。3 手法併用：**原価テアダウン** (素材原価 vs 完成品価格の乖離)、**公理列挙**
  (制約を 箱A=物理/数学 と 箱B=業界慣習 に二分)、**フェルミ分解** (数量を独立因子に割り支配因子を特定)。
  *出力*：プリミティブ + **「制約を装った慣習」のリスト**。← **G1**：空なら分解未達 — 別角度で 1a を再実行
  (ユーザーに聞く前に)。
- **1b. 構造転移** — 問題の *関係構造* に、同じ関係構造を持つ別分野を探し緩和策を写像 (Gentner の
  structure-mapping)。表層でなく関係の写像。← **G2**：新しい検証可能な予測を産まないなら表層類似 = 棄却。
- **1c. 再結合** — プリミティブ × 転移構造から候補を列挙し「箱B のどの慣習を覆すか」で評価 (Schumpeter の新結合)。
  慣習を覆さない組合せは me-too。**最も安い反証実験 (3a) を設計できる候補を優先。** 深掘りは候補を種に 1a へ
  2〜3 往復（表層の novelty でなく構造の novelty へ）。

## Phase 2 — 投射 (存在しない状態の構築) → `references/generation-engine.md` 末尾

- **2a. 未来外挿 (SF プロトタイピング, B.D. Johnson)** — 技術を選ぶ → 10 年後の世界 → 何が可能になるか → 逆算して
  近未来の **wedge (beachhead)** を特定 → 検証点を置く。予測でなく外挿による発明 (invent forward)。
- **2b. ナラティブ (テスラ・マスタープラン型)** — なぜ存在するか → 何が変わるか → 到達の順序。機能は「未来状態を
  伝達可能にする」(動員)。英雄の旅の型は任意。**通過条件**：「既に世界観を共有する人にしか刺さらない」なら
  *説得*、枠を差し替えるなら *知覚変容* — どちらか明示 (両者は同じ機能の深度違い、混同すると焦点を失う)。
  ▶ ここは thesis の **中身 (未来状態)** まで。deck / 順序 / Q&A の DELIVERY は designing-presentations へ。

## Phase 3 — 制御ループ (欠落層・実利の中心) → `references/control-loop.md`

**着想系の書籍が丸ごと欠く層。ここが最大の価値。** 4 つの副ゲートを **全て** 通す。falsify-and-commit の *一般*
機構 (cheapest disconfirming test / kill condition / reversibility) は **acting-on-hypotheses (Loop/Leap)** が
owner — Phase 3 はその *venture 特化版*。一般則が要るときはそちらへ。

- **3a. 反証設計** — 「最も安く殺せる実験」を実装前に書く。← **G3**。deep-tech では理論主張 (KKT / f-invariant 等)
  は裏付けを積むより、数値の hard instance を 1 つ作って落とす方が安く殺せる。
- **3b. why-now** — 実現を可能にする *具体的で名指しできる変化* は今日あるか (規制 / コスト曲線の交差 / 技術成熟 /
  需要転換 / 標準確定 / 供給制約解消)。5 年前に無く 5 年後に陳腐化しないか。**early / on-time / late** で置く
  (early は資本を焼く、late は差別化が消える)。Bill Gross 約 200 社分析の最大説明因子 = タイミング。
  ※可能化する変化は**現在事実の規律**（上）に従い、一次情報で裏を取るか「未検証」と明示。
- **3c. 資本適合** — 核心仮説の **time-to-truth** が資本の **runway** に収まるか。収まらねば (i) 検証を早める /
  (ii) runway を延ばす / (iii) beachhead を短い time-to-truth に差し替え。資本源の horizon と thesis の horizon を
  一致させる。
- **3d. 撤退・pivot 基準** — 「この道は死んだ」信号を感情が高ぶる前 (着手時) に **閾値つき**で紙に固定
  (pre-committed kill-criteria)。良い撤退 = 仮説が偽と判明 (学習が残る)、悪い撤退 = 資本枯渇 (学習ゼロ)。

**通過条件 (Phase 3)**：4 つを **全て** 通して初めて生存計画が立つ。**1 つでも未回答なら生存計画は不完全** —
その欄を弱点として明示し、埋めるか埋まらない理由を述べるまでピッチ／実装に進むな (control-loop.md と同条件)。

## Phase 4 — 出力契約

以下を埋める。埋まらない欄は「未回答」と明記し、それが弱点だと述べる（隠さない）。

```markdown
# Thesis: [1 文]

## Phase 0 ゲート
- 合意非依存の真実 (1 文): [...]
- 内発性: [pass / 要注意 — 理由]

## Phase 1 生成
- プリミティブ: [...]
- 制約を装った慣習 (覆す対象): [...]   ← 空なら分解未達 (G1)
- 転移した構造 (源分野 → 写像 + 出る新予測): [...]   ← 予測が無ければ表層類似 (G2)
- 再結合 thesis 候補: [...]

## Phase 2 投射
- 10 年後の世界と近未来 wedge: [...]
- ナラティブ: [...]（説得 / 知覚変容 のどちらか明示）

## Phase 3 制御ループ
- 3a 最も安い反証実験 + kill-signal: [...]   ← 空なら反証不能 = 信仰 (G3)
- 3b why now（可能化する具体的変化 / early・on-time・late）: [...]
- 3c 資本適合（time-to-truth vs runway、埋め方）: [...]
- 3d 撤退基準（事前定義の kill signal、閾値つき）: [...]

## 総合判定
- 生成の強度 / 生存計画の強度: [...]
- 律速はどちらか、次の 1 手: [...]
```

▶ **機械検査**：埋めたら `bun scripts/gate-check.ts <出力.md>` を実行。G1 (箱B≥1)・G2 (新予測あり)・G3 (kill-signal
に閾値)・3d (撤退に閾値) の *構造* が揃うかを見る **floor check**（意味は検証しない。語彙だけ纏った空欄・作文を
弾く最低限の関門）。FAIL が出た欄は「未回答」扱いで、Phase 3 通過条件に照らす。

## ループとしての運用

Phase 3 は 1 回の判定でなく反復ループ：(1) 3a で殺しにかかる → (2) 生き残れば 3b、early/late なら wedge を差し替え
Phase 1 へ → (3) 3c、合わねば beachhead を差し替え Phase 2 へ → (4) 3d で撤退基準を固定 → (5) 実装で現実接触 →
新観測 → (1)。**発生は易しい。生き延びさせる制御ループが難しく、そこが実利の中心。**

## Execution model — forge solo, delegate only facts and refutation → `references/boundaries.md` 実行モデル節

生成・ゲート判定・資本適合・撤退コミットは**常に solo** — forger は bettor の代理人、agents は fact-checker と
assassin であって共著者ではない。fan out するのは**現在事実の検証・graveyard sweep・deep-tech の hard instance・
Phase 4 の read-only per-gate skeptics** のみ（solo/fan-out/barrier の地図・agent 証拠規律・skeptic lens set は
`references/boundaries.md` の実行モデル節）。**Agent 合意は、合意非依存を要求する thesis にとって ANTI-signal** —
agent が返す現在事実は locus か「未検証」か。No harness → 同じ地図を直列の self-audit で回す。

## 失敗時の復旧・境界 → `references/boundaries.md`

in-skill anti-patterns (箱B 未達・表層転移・反証不能・後付け検証・タイミング欠落・金尽き撤退・10 個羅列・気質を
工程化) の TELL と復旧、sibling 全 owner との routing 表、除外した組織運用層 (Wasserman / Grove / Bezos) は
`boundaries.md`。要点だけ：

- **DECISIVE CUT vs acting-on-hypotheses** — そちらは *既にある賭け* を検証・コミット (発明はしない)。本スキルが
  fire するのは novel な thesis を *生成* せねばならないとき。生成は HERE → 一般的な検証・コミットは THERE
  (Phase 3 はあちらの Loop/Leap を借りる)。
- **designing-presentations** — 本スキルは thesis の *中身*、deck / talk の DELIVERY はそちら。
- **growing-oss-adoption / raising-resolution** — 既存ツールの *普及* / *現在事実* の inspect はそちら。

## Reference index — load the file you need

| File / dir | Covers | Read/run when |
|---|---|---|
| `references/generation-engine.md` | 分解 3 drill (テアダウン・公理列挙 箱A/箱B・フェルミ)・構造写像・表層類似棄却・再結合・2〜3 往復 | Phase 1–2 を実際に回す / 箱B が出せない |
| `references/control-loop.md` | 3a–3d checklist・deep-tech の型・early/on-time/late・time-to-truth vs runway・kill-criteria・反復 | Phase 3 を実際に回す |
| `references/boundaries.md` | routing 表・DECISIVE CUT 詳細・co-fire・in-skill anti-patterns・除外運用層・multi-agent 実行の solo/fan-out 境界 | 発火可否を迷う / 別スキルへ回す / 自分の出力を監査 |
| `references/lineage.md` | 着想系書籍の 2 欠陥の詳論・名指しソースの役割・6 機能への収束・**隣接理論との差分 (Lean/TRIZ/Effectuation/Design Fiction/Gentner/DDP)** | 「なぜこの構造か / なぜ既存理論で代替不能か」を説明するとき (実行には不要) |
| `references/source-map.md` | 原典『天才思考』10 章題 → 6 機能 → 本スキルの Phase/ゲート/除外 への写像 (章題は一次資料で検証済) | 原典のどの思考法がどこへ変換されたかを示すとき |
| `references/case-ledger.md` | 成功 4 + 失敗 6 例。各失敗を「最初に落ちるゲート」に 1 対 1 で紐付け、ゲート集合が MECE な判別器であることを実証 | thesis を実例と突き合わせる / 判別器として使う |
| `scripts/gate-check.ts` | 埋めた出力を G1/G2/G3/3d の構造有無で floor-check する validator | Phase 4 出力を機械検査する |
