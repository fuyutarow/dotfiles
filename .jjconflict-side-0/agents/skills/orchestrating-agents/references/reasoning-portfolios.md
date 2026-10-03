# 推論ポートフォリオ — 異なる失敗様式を持つ solver を束ねる

> **SOLE HOME**: solver-topology portfolio、candidate packet、判断を伴う synthesis、
> leave-one-out pruning の詳細手続き・schema・thresholdはこのファイルだけが所有する。
> 親 `SKILL.md` はprecedence要約とpointerを持てる。模型の在庫と費用は
> `model-roster.md`、腕の呼び出し方は `driving-*` 系、盲検監査と最終検収のprecedenceは
> 親 `SKILL.md` の P6 が持つ。
>
> **Durability contract**: runtime規則は論文の模型名・得点・token数に依存しない。
> 外部の実測、source grade、採否は `tests/forge-verification-ledger.md` がSOLE homeである。

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
4. 複数の異なる `failure_mode_attacked` を、利用可能な capacity 内で名指しできる。

名指しした失敗様式を覆う最小の topology 集合だけを、利用可能な capacity の範囲で選ぶ。
空いている capacity を埋めるためだけに腕を増やさない。最小集合をcapacity内で構成できなければ
portfolioを起動せず、DEFAULTの単腕または独立性を保った直列passへ戻す。各腕は独立に着手し、
他腕の候補や結論を受け取らない。

domain skillが生成を`SOLO`と指定した場合は、そのdomain判断を優先し、portfolioを起動しない。
generator / criticというstage roleを二つのtopologyと数えない。

## 2. Solver topology の palette

役名ではなく、探索手続きと狙う失敗様式で腕を選ぶ。下表は固定四役ではなく選択肢である。

| `topology` | 選ぶ条件 | `failure_mode_attacked` の典型 | 外す条件 |
|---|---|---|---|
| `Direct` | 問題が短く、素直な導出を baseline として残す価値がある | 過剰分解、調停による単純解の毀損 | 既に安価な oracle があり、baseline を足しても裁定情報が増えない |
| `Plan→Execute→Verify` | 長い依存列、部分目標、実行後の整合確認が要る | 手順の脱落、局所修正、長期依存の破綻 | 一本道の小仕事、または計画 overhead が支配する |
| `Adversarial refinement` | 初案を攻撃し、別候補または修正版へ変換できる | 自己確信、反例の見落とし、論理・事実・制約の穴 | critique、clearing condition、discriminating probeだけを返す、または安価な外部oracleが同じ穴を決定的に落とせる |
| `Breadth search` | 複数の仮説・プログラム・構成を広く探索し、候補を試験で絞れる | 最初の仮説への固着、局所最適、単一 trajectory の連鎖誤り | 候補を判別する信号がなく、数を増やしても純粋なノイズになる |

`Breadth search` 内部の候補数は、solver portfolio の腕数と別に数える。一つの topology の
内部サンプリングを、複数の異質な腕と数えてはならない。

persona、model、vendor、prompt toneだけの違いも別topologyと数えない。探索手続きまたは
`failure_mode_attacked`が変わらなければ同じ腕の反復である。

## 3. 腕の契約 — candidate packet

全腕は同じ schema を返す。自由散文の transcript を統合界面にしない。

```yaml
topology:
failure_mode_attacked:
candidate_or_artifact:
maturity:
  status: seed | released
  domain_gate_locus:
  artifact_digest:
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
- `candidate_or_artifact` は非空の実候補または実成果物を必須とする。最終候補、修正版候補、
  別候補、patch、proof object、計画、または成果物へのpathを置く。批評だけ、clearing
  conditionだけ、discriminating probeだけの文字列はsolver候補でない。
- `maturity`はnovelty-sensitiveまたはcandidate-generatingな生成仕事で必須とする。domain skillが
  gateを明記していなくても省略しない。release前は
  `status: seed`、release後は`status: released`とし、後者は`domain_gate_locus`と
  `artifact_digest`を必須にする。非生成仕事では`maturity`を省略できる。
- `evidence_loci_or_tests` は出典の所在、実行した試験、再現コマンド、または制約照合を列挙する。
- `assumptions` と `counterevidence` は空欄を許すが、省略を許さない。
- `known_weakness` は自信の数値ではなく、未検証の箇所と壊れる条件を書く。
- `cost` は当該 topology の限界価値を後で測れる単位で記録する。

private chain-of-thought の全文を要求・転送しない。裁定に必要なのは、候補、検証可能な根拠、
反証、仮定、弱点である。短い理由の要約はよいが、長い内部推論を「証拠」と数えない。

challengeがclearing conditionまたはdiscriminating probeだけを返した場合は、候補packetにせず
domain ownerのmaturity支援logへ置く。候補の改稿やrelease判断には使えるが、solver腕の納品、
normalizationの到着数、synthesisのcandidate、oracle coverageには数えない。

## 4. Normalize と dedup

supervisorがnormalization barrier、到着条件、除外理由を所有する。決定的なscriptが、
synthesisの前にpacketのschema検査、dedup、identity除去を実行する。

1. schema欠落、空の`candidate_or_artifact`、批評だけ・clearing conditionだけ・discriminating
   probeだけのpacket、存在しないpath、再現不能なtest名を弾く。支援artifactはmaturity支援logへ送る。
2. 生成仕事の`seed`、または`domain_gate_locus / artifact_digest`が無い
   `released` packetを弾く。seedをnormalizationやsynthesisへ入れない。
3. 表記だけが違う同一候補を、`candidate_or_artifact` と検証結果に基づいて dedup する。
4. 重複候補の証拠と反証は和集合にするが、重複数を票へ変換しない。
5. `agent_id`、模型名、vendor、tier、生成順を裁定用の payload から外す。
6. `topology` と `failure_mode_attacked` は測定用 metadata として残すが、権威や品質の代理にしない。

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
- 人格名、generator / criticというstage role、模型名、vendor、prompt toneの違いを、
  独立な失敗様式の証拠とみなさない。
- 重複候補を票へ変え、多数派を真とみなさない。
- candidate packet に private chain-of-thought 全文を要求しない。
- critique、clearing condition、discriminating probeだけのmaturity支援artifactをsolver候補へ数えない。
- solver を、その成果物の blind auditor または独立検収者に再利用しない。
- pilot の役 mapping、精度、token 効率を task distribution の外へ一般化しない。
- 「異質な portfolio は常に単腕・同質 sampling より安い」と主張しない。

## 9. Dated evidence pointer

PoTREの数値、source grade、calibration、採否と、創造研究・LLM idea generationの
2026-07-30追加サーベイは`tests/forge-verification-ledger.md`がSOLE homeである。
runtimeでは本ファイル§1〜§8のgateとpacketだけを使い、論文の構成や本数を既定にしない。
