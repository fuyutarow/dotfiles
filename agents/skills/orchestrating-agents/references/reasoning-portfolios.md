# 推論ポートフォリオ — 異なる失敗様式を持つ solver を束ねる

> **SOLE HOME**: solver-topology portfolio、candidate packet、判断を伴う synthesis、
> leave-one-out pruning の詳細手続き・schema・thresholdはこのファイルだけが所有する。
> 親 `SKILL.md` はprecedence要約とpointerを持てる。模型の在庫と費用は
> `model-roster.md`、腕の呼び出し方は `driving-*` 系、盲検監査と最終検収のprecedenceは
> 親 `SKILL.md` の P6 が持つ。
>
> **Durability contract**: §1〜§8 は論文の模型名・得点・token 数に依存しない。
> 外部の実測とその解釈は §9 以降の dated evidence に隔離する。

## 1. LAW — DEFAULT は単腕

既定は、一つの solver topology に一つの腕である。腕の数は品質の代理変数ではない。

次のいずれかなら fan-out しない。

- 安価な機械 oracle、決定的な試験、または既知の手続きが候補を直接判定できる。
- 小さく一本道の仕事で、複数のもっともらしい解法が存在しない。
- 失敗しても直ちに検出・再実行でき、単一 trajectory の誤りが成果物へ載荷しない。
- 必要なのが独立部品の生産であって、同じ問題に対する複数解法ではない。

solver portfolio は、次の条件をすべて満たすときだけ起動する。

1. 同じ問題に複数のもっともらしい解法がある。
2. 単一 trajectory の固着・見落とし・もっともらしい誤答が成果物へ載荷する。
3. 候補を比較できる試験、証拠、制約、または acceptance criterion がある。
4. 二本以上の異なる `failure_mode_attacked` を、利用可能な capacity 内で名指しできる。

起動時は二本から始め、名指しした失敗様式を覆う最小の topology 集合だけを選ぶ。本数は
`min(available_capacity, distinct failure modes)` を上限とし、空いている capacity を埋める
ためだけに腕を増やさない。各腕は独立に着手し、他腕の候補や結論を受け取らない。

## 2. Solver topology の palette

役名ではなく、探索手続きと狙う失敗様式で腕を選ぶ。下表は固定四役ではなく選択肢である。

| `topology` | 選ぶ条件 | `failure_mode_attacked` の典型 | 外す条件 |
|---|---|---|---|
| `Direct` | 問題が短く、素直な導出を baseline として残す価値がある | 過剰分解、調停による単純解の毀損 | 既に安価な oracle があり、baseline を足しても裁定情報が増えない |
| `Plan→Execute→Verify` | 長い依存列、部分目標、実行後の整合確認が要る | 手順の脱落、局所修正、長期依存の破綻 | 一本道の小仕事、または計画 overhead が支配する |
| `Adversarial refinement` | 初案は作れるが、もっともらしい誤りや制約違反を攻撃したい | 自己確信、反例の見落とし、論理・事実・制約の穴 | 安価な外部 oracle が同じ穴を決定的に落とせる |
| `Breadth search` | 複数の仮説・プログラム・構成を広く探索し、候補を試験で絞れる | 最初の仮説への固着、局所最適、単一 trajectory の連鎖誤り | 候補を判別する信号がなく、数を増やしても純粋なノイズになる |

`Breadth search` 内部の候補数は、solver portfolio の腕数と別に数える。一つの topology の
内部サンプリングを、複数の異質な腕と数えてはならない。

## 3. 腕の契約 — candidate packet

全腕は同じ schema を返す。自由散文の transcript を統合界面にしない。

```yaml
topology:
failure_mode_attacked:
candidate_or_artifact:
evidence_loci_or_tests:
assumptions:
counterevidence:
known_weakness:
cost:
  tokens:
  wall_time:
  external_budget:
```

各欄の規則:

- `topology` は §2 の探索手続き、`failure_mode_attacked` はその腕が他腕と異なる理由を書く。
- `candidate_or_artifact` は最終候補、patch、proof object、計画、または成果物への path とする。
- `evidence_loci_or_tests` は出典の所在、実行した試験、再現コマンド、または制約照合を列挙する。
- `assumptions` と `counterevidence` は空欄を許すが、省略を許さない。
- `known_weakness` は自信の数値ではなく、未検証の箇所と壊れる条件を書く。
- `cost` は当該 topology の限界価値を後で測れる単位で記録する。

private chain-of-thought の全文を要求・転送しない。裁定に必要なのは、候補、検証可能な根拠、
反証、仮定、弱点である。短い理由の要約はよいが、長い内部推論を「証拠」と数えない。

## 4. Normalize と dedup

supervisorがnormalization barrier、到着条件、除外理由を所有する。決定的なscriptが、
synthesisの前にpacketのschema検査、dedup、identity除去を実行する。

1. schema 欠落、存在しない path、再現不能な test 名を弾く。
2. 表記だけが違う同一候補を、`candidate_or_artifact` と検証結果に基づいて dedup する。
3. 重複候補の証拠と反証は和集合にするが、重複数を票へ変換しない。
4. `agent_id`、模型名、vendor、tier、生成順を裁定用の payload から外す。
5. `topology` と `failure_mode_attacked` は測定用 metadata として残すが、権威や品質の代理にしない。

合意は追加試験の優先順位を決める手掛かりにはできる。真であることの証拠にはしない。

## 5. 三つの「統合」を分ける

| 操作 | 何をするか | 担い手 | 出口 |
|---|---|---|---|
| deterministic merge | schema 検査、dedup、独立部品の結合、機械 oracle の実行 | script | 同じ入力なら同じ結合物と試験記録 |
| judgmental synthesis | 相反する候補を、検証可能な証拠・反証・制約適合で選択または合成 | synthesis 担当 | 採択候補、棄却理由、追加した主張、未解決点 |
| supervisor acceptance | 最終物を独立の acceptance test と P6 で出荷判定 | supervisor（独立検収者のverdictを入力） | PASS / FAIL / SCOPE-LIMITED PASS |

judgmental synthesis は多数決をしない。候補ごとに `evidence_loci_or_tests` を再実行または照合し、
より強い反証可能な証拠を持つ候補を優先する。合成によって候補に無かった主張やコードを作ったら、
それを新規成果物として試験し直す。

全候補が食い違い、識別力のある証拠が無い場合は、選択を装わない。最小の追加 probe を発射するか、
未解決として supervisor acceptance へ渡す。synthesis の出力は受入証明ではない。

## 6. Solver portfolio と blind audit fleet を混ぜない

solver portfolio は候補集合を広げる生産機構である。blind audit fleet は、synthesis後の
成果物、またはportfolioなしのsolo成果物を凍結した後に、独立に壊す検証機構である。

- solver の生成者は、その仕事の独立 auditor または最終検収者になれない。
- audit へ渡すのは問題、正規化後の最終成果物、凍結した acceptance criterion である。
- solver の票数、模型名、自己評価、synthesis の結論説明を audit の先入観として渡さない。
- solver topology の多様性は、vendor の異なる blind audit を代替しない。逆も同じである。

監査の盲検、担い手の排他、達成語の出荷門は親 `SKILL.md` の P6 を適用する。このファイルでは
監査 fleet の人数・模型・呼び出し方を再定義しない。

## 7. Pilot、leave-one-out、pruning

topology の常設前に、実運用を代表する小さな pilot を固定する。各課題でfull portfolioと
各leave-one-outを同じ `task_id / input_fingerprint / seed / oracle` に結ぶpaired artifactsとして
保存する。乱数工程は事前宣言した複数seedで反復し、試行回数、停止条件、許容差、不確実性の
扱いを結果を見る前に固定する。

| 指標 | 定義 |
|---|---|
| `oracle coverage` | 少なくとも一腕の `candidate_or_artifact` が oracle を通った課題の割合 |
| `realized final` | synthesis と acceptance 後の最終物が oracle を通った課題の割合 |
| `synthesis yield` | oracle coverage のある課題のうち、最終物が正解を回収した割合 |
| `unique correct` | その腕だけが正解候補を出した課題数 |
| `marginal correct` | full portfolio の oracle coverage から、その腕を外した coverage を引いた差 |
| `observed final marginal` | full portfolio の `realized final` から、その腕を外した `realized final` を引いた観測差 |
| `tokens` | 腕別・全体の生成 token と、synthesis の token |
| `wall-time` | critical path と腕別の実時間。並列時は token と混同しない |

各腕について次を裁定する。

- 複数seedのpaired artifactsで `marginal correct` が事前固定した許容差内のゼロとして再現し、
  費用が正なら、既定portfolioからのprune候補にする。単発の `marginal correct = 0` で確定しない。
- `observed final marginal < 0` またはsynthesis yieldの悪化が許容差を超えて再現した腕は、
  観測上の負の限界効果を持つprune候補にする。原因をsynthesis単独へ帰属しない。
- 同じ失敗様式を覆う別腕に対し、限界正解が少なく費用も低くない状態が反復で再現した腕は、
  dominated armのprune候補にする。
- prune は当該 pilot の task distribution にだけ束縛する。別分布へ「この topology は不要」と一般化しない。

分布、模型、tool access、acceptance criterion のいずれかが変わったら mapping を失効させ、
小さな pilot から測り直す。

## 8. MUST NOT

- **MUST NOT fixed four**: 四 topology の常時起動を要求しない。
- 人格名、役名、模型名の違いを、独立な失敗様式の証拠とみなさない。
- 重複候補を票へ変え、多数派を真とみなさない。
- candidate packet に private chain-of-thought 全文を要求しない。
- solver を、その成果物の blind auditor または独立検収者に再利用しない。
- pilot の役 mapping、精度、token 効率を task distribution の外へ一般化しない。
- 「異質な portfolio は常に単腕・同質 sampling より安い」と主張しない。

## 9. Dated evidence — PoTRE snapshot (2026-07-27)

一次資料: Anmol Kankariya and Sercan Ö. Arık, “PoTRE: Test-Time Reasoning inspired by
Cognitive Heterogeneity,” TMLR, July 2026,
[arXiv:2607.20268v1](https://arxiv.org/pdf/2607.20268)。頁は論文に印刷された頁番号。

| 観測 | 一次資料の所在 | この規則が許す読み |
|---|---|---|
| PoTRE は Self-Consistency `N=16` を9設定中8設定で上回る。例外は ARC-AGI-2 / 3.1-Pro の `78.33% < 80.00%` | [Table 1, p.10](https://arxiv.org/pdf/2607.20268#page=10) | 異質topologyとtask-adaptive synthesisの複合構成が、CoT samplingとmajority voteの複合baselineを上回る設定がある。各構成要素の寄与は分離されておらず、全設定での優越でもない |
| Gemini-3-Flash-Preview / HLE no-search の4-CoTは `38.88% @ 119K tokens/task`、PoTREは `39.80% @ 260K` | [Table 26, p.66](https://arxiv.org/pdf/2607.20268#page=66) | 両者は同じtask-adaptive synthesisを使うがtoken条件は整合していない。小さい精度差に倍以上のtokenを使う設定であり、universal efficiencyを反証する |
| Gemini-3-Flash-Preview / HLE open-book のSpectrum 20候補は `51.28% @ 390K`、PoTREは `53.48% @ 340K` | [Table 25, p.65](https://arxiv.org/pdf/2607.20268#page=65) | budget-matched-or-exceededな大量同質探索に対して、異質な配分が精度・tokenの両方で勝つ設定がある |
| Gemini-3-Flash-Preview / HLEではDirectを外すと `40.60%`、fullは `39.80%` | [Appendix G.2, Figure 4, p.67](https://arxiv.org/pdf/2607.20268#page=67) | 全 topology の常設は最適でない。leave-one-out を要求する根拠 |
| Gemini-3-Flash-Preview / ARC-AGI-2ではPlanningを外すと `39.20% > 38.33%`、tokenは約 `7M → 1M`、約85%減 | [Appendix G.2, Figure 5 and text, pp.67–69](https://arxiv.org/pdf/2607.20268#page=67) | 役の限界価値と費用は task distribution ごとに違う |
| 四候補が全て不一致の bucket では oracle `20.7%` に対し synthesis `5.8%` | [Table 8, p.16](https://arxiv.org/pdf/2607.20268#page=16) | 候補集合の coverage と、統合が回収した realized final を別に測る必要がある |

著者は、Direct や Planning を外した際の改善を、競合する reasoning path が synthesis を
混乱させる “synthesis interference” と説明する。これは **author inference** であり、
情報量だけを操作した因果実験ではない。leave-one-out は候補内容、context、token、相互作用を
同時に変えるため、本規則は原因を断定せず、`realized final` と `synthesis yield` の差として測る。

## 10. Source grade と calibration (PoTRE 蒸留の SOLE home)

`author-confirmed` は一次資料本文で確認した意味であり、独立追試済みという意味ではない。

| 規則・主張 | grade | 扱い |
|---|---|---|
| 四 topology の実装、task-adaptive synthesis、§9 の数値 | `author-confirmed` | dated evidence にだけ置き、runtime の普遍主張にしない |
| topology ごとに異なる失敗様式を狙う | `author-confirmed` + `skill-supplied` | 発想は論文、`failure_mode_attacked` 必須欄はこの skill の運用化 |
| DEFAULT 単腕、fan-out gate、candidate packet、identity-blind normalization | `skill-supplied` | 論文の固定構成をそのまま帰属させない |
| deterministic merge / judgmental synthesis / supervisor acceptance の分離 | `constructed` | 現行 skill の役割分離と PoTRE の oracle gap から設計した。論文の分類ではない |
| pilot 指標と prune 条件 | `skill-supplied` | leave-one-out を運用可能な gate に変換したもの。閾値の普遍性は主張しない |

### Calibration inversion

| | 論文の対象 | この skill の agent consumer |
|---|---|---|
| dominant error | 同じ topology の sampling を増やし、相関した誤りを独立票として扱う | **INVERSE が優勢**: subagent capacity があるだけで fan-out し、固定四役を儀式化する |
| corrective bias | 異なる四 topology を並列化して synthesis する | DEFAULT 単腕。載荷する単一 trajectory failure がある場合だけ、最小の異質集合を選ぶ |
| prominent guard | homogeneous repetition との比較 | `MUST NOT fixed four`、安価な oracle なら no fan-out、leave-one-out pruning |
| secondary same-direction risk | topology の違いを作らず同じ prompt を反復する | 各腕に `failure_mode_attacked` を要求し、重複は dedup する |

### 採択しなかった一般化

| 却下した読み | 却下理由 |
|---|---|
| 固定四役が普遍的な最適構成である | 論文自身の leave-one-out で full 構成を上回る設定がある |
| persona や模型名が違えば独立な腕である | 独立性は label でなく、探索手続き・候補・失敗の限界価値で測る |
| 異質な構成は常に token-efficient である | Table 26 に明示的な反例がある |
| ある benchmark で外せた topology は他の仕事でも不要である | HLE と ARC の最適な削除対象が異なる。mapping は task distribution に束縛する |
