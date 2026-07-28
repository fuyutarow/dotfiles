# Measurement and resources — 比較・交絡・再利用

> **Ownership — SOLE home**: `P7 DEVICE-BUDGET`、`P8 FOOTING`、
> `P9 CONFOUND-TABLE`、`P10 ARTIFACT-REUSE` の詳細手続き・schema・thresholdは
> このファイルだけが所有する。`SKILL.md` はprecedence要約とpointerを持てる。

**Read when**: 計算資源を割り当てるとき、費用未測定の本走を始める前、数値を比較するとき、
一変数の効果や機構の効果を主張するとき、既存の中間生成物を再利用または再構築するとき。

**Ledger pointer**: `tests/forge-verification-ledger.md` の
`§第2次ポストモーテム`、`§GB110`、`§長走行の消失`、
`§規則の不適用の反復`、`§数値の接合`、`§PoCの無効化`。
事例、数値、変更履歴は ledger が正本であり、ここには再実行可能な規則だけを置く。

測定の PASS は散文の印象でも腕の自己申告でもない。raw artifact、実行log、入力指紋、
独立な参照量との一致を一つの measurement packet として残す。

```yaml
measurement:
  claim_id: stable-id
  input_fingerprint: digest
  code_revision: revision
  command_or_call: exact-invocation
  environment: versions-and-resource
  conditions: all-comparison-axes
  raw_artifacts: [path-or-id]
  artifact_digests: [digest]
  tests: [independent-check-and-result]
  result: value-with-unit
```

schema validation とdigest再計算が共通の floor test である。意味上の合否は各gateの
`artifact/test` で別に判定する。

## P7 DEVICE-BUDGET — 資源と費用

| 規則 | artifact/test |
|---|---|
| 結論を左右する計算は、利用可能な最速の適合資源へ置く。 | 発射記録に資源、選定理由、見積り時間がある。より速い適合資源が遊休なら FAIL。 |
| 遅い資源は、記録用または制約固有の計測だけに使う。 | 遅い資源を選ぶ理由が一行であり、結論経路にないことをDAGで確認する。 |
| 新しい計測は最小規模で費用を実測する。 | pilotの入力規模、wall time、使用量、出力が本走より前にある。 |
| 本走はpilotの実測後にだけ発射する。 | pilotから算出した本走見積りと中断閾値がある。見積りのない本走は発射しない。 |
| 同じ資源または同じ外部勘定を要する重い走行は直列にする。 | 発射表にresource/account列があり、競合する重い走行の時間区間が重ならない。 |

資源は装置だけでなく、外部サービスの勘定、同時実行枠、rate limit、共有メモリ、共有scratchを
含む。capacity-aware parallelism は、独立な仕事で、かつ競合資源を占有しない場合だけ許す。
発射表には `job / dependency / resource / account / pilot cost / ETA / stop threshold` を置く。

pilotの目的は最終結論を出すことではなく、費用・失敗様式・保存形式を測ることにある。
pilotと本走で条件が変わる場合は、外挿式と限界を measurement packet に残す。

## P8 FOOTING — 同じ土俵

数値は、比較を左右する全軸が一致したときだけ差として読む。最低限、次の軸を比較表へ置く。

| 軸 | 記録するもの |
|---|---|
| 入力 | データ、分割、前処理、入力版、input fingerprint |
| 実行体 | code revision、設定、依存版、実行コマンド |
| 確率性 | 乱数seed、sampling規則、反復回数 |
| 判定 | 指標、単位、しきい値、停止規則、多重比較の扱い |
| 資源 | 装置、並列度、精度、時間/使用量の上限 |
| 範囲 | 対象集合、除外、測定窓、欠測の扱い |

比較表の脚注に土俵を逐語で書く。一軸でも違えば、同条件で再測するか、条件差を主張文に含めて
因果比較を撤回する。artifact/test は全軸の差分表と、差分ゼロまたは再測記録である。

凍結した成功条件を持つ実験は、本走前に到達可能性を算術で検算する。有限標本で得られる
最小値としきい値、探索空間の上限と要求値、反復数と検出力など、構造上の上下限を先に比べる。
到達不能なら仕様と実装の不一致として発射を止める。artifact/test は計算式、代入値、判定、
独立な再計算である。

条件の違う数値を同じ表へ載せる場合、セルまたは脚注に異なる軸を明示する。異なる測定から
分子と分母を接合しない。測定されなかった量を、推定であるとの表示なしに数値へしない。

## P9 CONFOUND-TABLE — 交絡と対照

一変数を動かす前に、変数と同時に動く量を表へ出す。

| 操作変数 | 同時に動く量 | 結果への経路 | 固定方法 | 正規化/対照 | 残る限界 |
|---|---|---|---|---|---|
| named-variable | coupled-quantity | causal-path | hold-constant | control-arm | disclosed-limit |

交絡表を実験設計より先に保存し、各連動量について固定・層別・正規化・対応する対照のいずれかを
選ぶ。打ち消せない交絡は限界として主張文に載せる。artifact/test は、実行時設定を表へ逆写像し、
表にない連動量がないことを独立に再点検すること。

**機構が効果を生んだと主張する実験には、その機構を外した対照を同一の条件で置く。**
この対照は任意でない。データ、乱数、反復、しきい値、資源、評価を `P8` と同じ土俵に固定し、
対象機構だけを外す。artifact/test は比較表の「機構なし」行と、全条件の差分が対象機構だけで
あること。機構ありだけが自己検定を通っても、効果の証拠にはならない。

## P10 ARTIFACT-REUSE — 保存・指紋・失効

分単位以上かかる中間生成物は最初の生成時に保存し、同じ作業系列では再構築しない。
保存物には次のmanifestを添える。

```yaml
artifact:
  locus: path-or-id
  digest: content-digest
  created_at: date-time
  input_fingerprint: input-version-and-digest
  code_revision: revision
  command_or_call: exact-invocation
  environment: relevant-versions
  specification: spec-id-or-digest
  self_tests: [test-and-result]
  consumers: [job-or-deliverable]
```

再利用前にmanifestと現在の入力・仕様・実行体を照合する。fingerprintが一致し、必要なself-testが
通る場合だけ再利用する。入力更新、仕様変更、実行体の意味変更、digest不一致のいずれかで失効する。
artifact/test は照合結果と、再利用側が保存先とdigestを名指ししていることである。

再構築時は、`data update / specification change / implementation change / corrupted artifact`
のいずれかを一行で申告する。理由のない再構築はしない。同じ委任一巡で再利用できる保存物を
作り直した場合は FAIL とする。

途中artifactもchunk単位でdigestと指紋を持たせる。長走行の保存・再開契約は
`delegation-contracts.md` の `C2` が SOLE owner、指紋と失効判定はここが SOLE owner である。
両者は内容を重複させず、保存時に同じmanifestを参照する。

## 再現性と昇格

探索段階の数値を設計・報告・正本へ昇格させる前に、次を満たす。

1. exact invocation、入力、設定、環境、raw artifactが保存されている。
2. digestを独立に再計算できる。
3. 数値実行体に二つ以上の異なる自己検定があり、結果が保存されている。
4. 主張を偽にする独立oracleまたは再計算がある。
5. `P8` の土俵と `P9` の交絡/対照が記録されている。

artifact/test はmeasurement packetの再実行で同じ離散結果、または宣言した許容差内の数値を
得ること。再現不能な値は探索artifactに留め、完成・実証・確定の根拠へ昇格させない。
