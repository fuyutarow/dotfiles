# Delegation contracts — 発注・分解・役割分離

> **Ownership — SOLE home**: `P4 ROUND-TRIP ECONOMY`、指示書の自己完結、役割分離、
> 委任形状、`C1`〜`C4`、委任の共通規則の詳細手続き・schema・thresholdは
> このファイルだけが所有する。`SKILL.md` はprecedence要約とpointerを持てる。

**Read when**: 腕を発射する直前、仕事を分解するとき、長走行を切り離すとき、査読・照合・
検収を配役するとき、同型の指摘が再発したとき。

**Ledger pointer**: `tests/forge-verification-ledger.md` の
`§採択`、`§第3次ポストモーテム(委任の一枚岩)`、`§GB110`、
`§第5次ポストモーテム`、`§長走行の消失`、`§接地の強制`。
履歴と実測は ledger が正本であり、ここには実行規則だけを置く。

この契約の証拠型は `citation-relay | machine-check | both` のunionである。
`citation-relay` は `source_locus / scope`、`machine-check` は
`command_or_call / input_fingerprint / raw_artifact / output_digest / oracle / result` を運ぶ。
`both` は両方を必須にする。腕の自己申告でなく、一次sourceまたは機械観測を監督まで損失なく運ぶ。
No harness → same map, serial。並列の腕を、互いに出力を見ない個別 pass として順に実行する。

## 1. 発射前の順序

| 順序 | 監督の裁定 | artifact/test |
|---|---|---|
| 1 | domain/craft ownerが署名した `input state → function verb → owned artifact → sole domain owner → next state` のmapをlocus/digestで受け取る。owner不在の一回限りのplain taskだけtask-local provisional mapを作る。 | `domain_function_map_locus`とdigestがあり、同じartifactに二ownerがいない。再利用可能なownership voidは`forging-skills`へ返す。 |
| 2 | 各機能を小規模・大規模・長走行・読解/検証のどれかに型づける。 | 発注記録に形と選択理由がある。形の選択表に当て直す test で一致する。 |
| 3 | 入出力の界面、所有範囲、依存、decision rightsを凍結する。実行体を読む仕事はread-setとcode digest、書く仕事はwrite-setを宣言する。同じcheckoutでread/writeまたはwrite/writeが交差すれば直列化か隔離を先に決める。非生成仕事は合否も発射前に凍結する。生成仕事はlaunch項目だけを第一freezeに置き、domain artifact / digest後にfinal acceptance criteriaを第二freezeする。仕様を書けない仕事は発射しない。 | 指示書の必須欄、read/write依存表、freeze時点、境界外または不可逆な判断の停止条件がある。 |
| 4 | 必要な工程だけを起動する。nontrivial成果物がある、載荷claimがある、または決定的machine oracleがない場合にindependent verifierを起動し、その場合だけauthorと分ける。 | verifierの起動理由、起動時のauthorとの分離、同じ観測が複数役へ重複計上されていないprovenance表。 |
| 5 | 各dispatchへ資源classを一つだけ付け、pilotより前にadmissionする。依存仕事を pipeline、独立かつ予約が競合しない仕事だけcapacity-aware parallelにする。 | `RESOURCE-CLASS(NONCOMPUTE)` または絶対pathの `RESOURCE-ENVELOPE` がちょうど一つあり、後者は `measurement-and-resources.md` P7のrunner verdictを持つ。 |
| 6 | 返り値をschemaで受け、起動したindependent verifierのverdictを入力にsupervisorが採否を決める。domain正本への着地が完成条件なら、そのownerが発行したIDとdigestを正本から読み返す。 | schema検査、証拠の照合、正本のread-back、起動時のverdict、supervisorの採否と根拠がある。 |

## 2. 自己完結する指示書

指示書は、外部の口頭補足なしで着手・停止・納品できなければ無効とする。次の欄を全て必須にする。
ただし、生成 / 評価の条件欄はnovelty-sensitiveまたはcandidate-generatingな生成仕事だけに置く。
domain skillがmaturity gateを明記していなくても、この生成仕事にはdomain ownerによる
formulation / evaluability artifactとdigestを要求する。

| 必須欄 | 書く内容 | artifact/test |
|---|---|---|
| **機能遷移** | `domain_function_map_locus` / digestと、この発注が消費する署名済み行。OAが加えるのはagent、visibility、dependency、veto、verification、acceptanceのdispatch overlayだけ。 | mapの一行と一致し、隣接発注とのhandoff schemaが接続する。domain semanticsをoverlayが上書きしない。 |
| **目的** | 解く問い、利用者、成果物が変える裁定。 | 一文の目的と、その成果物を消費する仕事が名指しされている。 |
| **入力と根拠** | 読む正本、入力版、事実・数値の錨、対象 HEAD または同等の不変識別子。 | 各入力に locus と版があり、実在を read-only test で確認できる。 |
| **境界** | read-set、write-set、checkout/worktree、対象code digest、禁止範囲、外部送信、依存、担当外。 | 同じcheckoutでwrite/writeまたはread/writeが交差する腕は同時に発射されず、別worktreeなら実行時digestを照合する。 |
| **出力 schema** | 成果物、返却状態、主張、証拠、限界の機械可読な形。domain正本を要する成果物はそのlocus/digest、正本がIDを発行するならそのIDも含める。 | schema validation が通る。最終メッセージだけでも同じ情報を回収でき、正本を読み返せる。 |
| **完成の定義** | 非生成仕事は最終完成条件を発射前に凍結する。生成仕事はlaunch時のphase-exitとmaturity release condition、domain artifact / digest後のfinal acceptance criteriaを分ける。 | 各条件が成果物の locus または runnable test に結線され、生成仕事では二つのfreeze時点が記録されている。 |
| **独立検収** | 主張が偽なら落ちる oracle、再計算、照合手順を成果物を見る前に設計し、lens / oracle / expected verdictを生成側からsealedにする。既知のhard constraintsとstage-exit criteriaは開示できる。 | 「主張が偽でもこの観測は出得るか」の答えが NO。YES なら test を無効とする。sealと開示範囲が記録されている。 |
| **時間予算** | 硬い期限、中間報告点、中断条件、部分納品の保存先。 | 発射時刻・期限・中間条件があり、超過時の処理を再現できる。 |
| **資源 admission** | `RESOURCE-CLASS(NONCOMPUTE): <理由>` または `RESOURCE-ENVELOPE(/absolute/path.json): agent-resource-run only` を一つだけ置く。数値実行、benchmark、resident service、parallel test、nested fanoutはNONCOMPUTEにしない。pilotもCPU/RAM/VRAM/process/scratch/walltimeと算術memory boundを先に凍結する。 | `measurement-and-resources.md` P7のschema/admission test、runnerの`ADMIT` verdict、発射後の高水位/cleanup。 |
| **decision rights** | supervisorが凍結する外部界面・不可逆判断・acceptance、executorへ委譲する境界内の可逆な方法・仮説・表現、停止する境界外・不可逆判断。 | `C3` の三分類、decision log、停止命令がある。 |
| **生成 / 評価の条件欄** | 生成仕事では必ず、launch freeze、domain maturity owner / release condition、第二freezeの時点、generative challengeの非veto、verdict-bearing evaluationの開始条件を書く。 | launch→domain artifact / digest→final criteria freeze→verdict / blind auditの順序がある。release artifact / digestが無いpacketをnormalization、synthesis、verdictへ渡さない。非生成仕事では欄を省略できる。 |
| **P10 再利用** | 流用する中間物、入力指紋、失効条件、再構築理由。 | `measurement-and-resources.md` の `P10` test が通る。 |
| **未確認の明示** | 証明・確認できない箇所を、ごまかさず列挙する命令。 | `unverified` が空配列を含めて存在し、空なら検査手段が示されている。 |

理論・相談の発注には、さらに「消費する建造の名前と着地予定」を必須とする。二つの建造以内に
実験が消費できない理論は発注しない。artifact は消費者と予定を持つ行、test は依存DAG上で
二つ以内に実験または実装へ到達できること。

数値を生む実行体には、別法・極限・次元・既測との照合から異なる自己検定を二つ以上入れる。
自己検定の PASS は検収の代用ではない。artifact は各 test の方法、入力、観測、終了状態である。

意味検索が使える登録済みrepoでは、返り値 schema に
`queries: [{query, hits: [file:line]}]` を必須化する。検索したという自己申告だけでは受理しない。

### 返り値の最小 schema

```yaml
status: completed | partial | blocked
deliverables:
  - locus: path-or-id
    digest: content-digest
claims:
  - id: C1
    statement: checkable-claim
    locus: file:line-or-artifact-key
    evidence:
      kind: citation-relay | machine-check | both
      citation:
        source_locus: source-id-and-location
        scope: applicability-boundary
      machine:
        command_or_call: exact-invocation-or-call-id
        input_fingerprint: input-digest
        raw_artifact: path-or-id
        output_digest: output-digest
        oracle: independent-check
        result: observed-result
    test: runnable-or-read-only-check
unverified: []
limitations: []
```

`citation` と `machine` はunionの選択に応じて不要な側を省略する。
`status: completed` という語だけでは完成にならない。各主張のevidence kindを指示書で決め、
選んだ型の必須欄が欠けた主張は quarantine する。
監督は返り値と実物の digest を再計算し、不一致なら受理しない。
domain正本への着地が完成条件の仕事では、正本のlocus/digestと発行済みIDを照合する。
必要な識別子が欠けた報告は`partial`として扱う。
正本と異なる場所にある報告を監督の会話へ転記して代用しない。ownerへ着地を差し戻す。

## 3. 仕事の形と分解

### C0 — 親の調整責任は委任しない

まず次の仕事に必要な実行能力を、現在のtool/launcherとその観測で照合する。
これは既存board/briefの参照欄であり、新しいstate machineや起動ごとの全件検査ではない。

| 能力 | 必要な観測 | 不明・不成立なら |
|---|---|---|
| workerへの発注/変更/停止 | toolが扱う実ID、受領/実行の観測、利用できるinterrupt経路 | 未受領をrunningとしない。短い一発の発注へ縮め、変更可能性を仮定しない。 |
| processの時間/資源上限 | P7実行器の有効設定と停止/cleanupのreceipt | その計算の前にbounded probeで確認するか実行器を修復する。独立した非計算作業は続ける。 |
| 実行版の隔離 | EV1が要求する入力/code範囲とlauncherが実際に読む不変対象 | snapshot対応を推測せず確認し、必要区間だけ直列化する。 |
| 部分納品の消費 | artifactの版、consumer側の受領/実行、結果または明示pending | 提出を統合済みと呼ばない。次の接合probeを一件切る。 |

観測のlocus、対象版/環境、成立する範囲を保持し、変更がその証拠を失効させたときだけ取り直す。
skillの存在・更新・リンクは、そのworkerがその版を読んだ証拠にはならない。
重要な規則は現在のbriefに渡し、長いsessionの既読contextを更新済みと推定しない。
設計上の要求と、実行基盤が実証した能力を同じPASSで表さない。

親は発注前に、最初の検証可能な部分納品と返却期限、その消費者、次の介入時刻または事象を決める。
返却期限はdomainのfeedback周期と、前提を変える次の結果に間に合わせる。
既存ticket/boardへ`event/time + artifact -> parent decision -> consumer/brief revision + action/receipt`を残す。
消費・受領が未確認ならpending/blockedと記す。一般的な「継続」の一言を接合済みの証拠にしない。
新しい台帳は作らない。未変更の状態を繰り返し報告して調整の証拠にしない。

| 観測 | 親の必須行為 | 不合格となる運転 |
|---|---|---|
| 部分納品または依存を変える結果が届く | 証拠と界面を照合し、消費者へ渡す。影響する実行中/待機中ticketを継続・縮小・停止へ裁定する。 | 全部品の完成まで保留する。結果を転記して終える。 |
| 最初の返却点を過ぎた、またはworkerがrun待ち | job、実行phase、直近artifact、stop条件を確認し、解除・再分割・停止のいずれかを決める。 | 「担当待ち」でETAだけ延長する。未確認を実行中と断定する。 |
| 変更指示の受領が不明 | C3aで送信・受領・実行を区別し、古い仕事の継続可否を決める。 | 送信だけで配線変更が実行されたと扱う。 |
| 親が結果を消費できず介入が遅れる | 構造化返却・既存routing・決定的joinを整え、criticalな返却を先に消費する。実際に詰まった枝だけ絞る。 | 全体を小人数へ固定する。ticket数のためだけに増員する。 |

該当する介入点で裁定記録が無ければ、委任運転は不合格とする。後日の成果で遡って合格にしない。
再発時は同じ大きさの発注を繰り返さず、未消費の返却を処理し、最初の部分納品まで範囲を縮める。
不合格は親の運転への判定である。有効な科学的証拠を罰として廃棄しない。
裁定を要しない通常の状態変化は記録を増やさない。承認済み分岐は現在の前提を再確認して自走できる。
parentは全transcriptの再読を経路に置かず、artifactと差分・例外を消費する。
agentの並列枠、host資源、GPU予約、write-set競合は別々に判定する。
GPU待ちのcompute phaseだけを止め、独立したread/設計/隔離patchのmicroticketは進める。
同一live fileのwriterは一人とし、他の担当は別snapshotの提案を返す。接合は短い独立ticketにする。
独立性を要するblind腕には他腕の結論を漏らさず、必要な停止/版変更だけを通知する。
理由や結果を示唆する版名を渡さない。結果依存の停止で盲検性が崩れた腕を独立検証として数えない。
他腕のartifactやconsumer/版を含む調整記録は、既存の親専用visibilityで保持する。
blind腕には中立な識別子と継続/停止だけを渡す。隔離できない共有boardをblind入力にしない。

R&Dの仕事選択とmicroticketの切り方は`driving-bibifi-cycles`が所有する。
同skill適用時は、下のcomponent分解や長走行規則を長期ticketの許可として使わない。
実装だけの担当にもmicroticketの返却点を置く。実験だけ短くして長い実装を丸投げしない。

| 仕事の形 | 発注形 | artifact/test |
|---|---|---|
| 読解・独立検証・独立計測 | 必要なlensだけを起動する。複数観測が必要なときだけ独立な腕を足し、capacityがなければ直列化する。 | 起動理由を持つlens表があり、腕間に成果・結論の共有がなく、同じ schema で比較できる。 |
| 小さい実装・計測 | 次の判断に必要な最小の成果物を単一の腕へ渡す。 | 最初の返却点、消費者、自己試験、所有範囲がある。 |
| 大きい単一成果物 | `C1` に従い、共通土台・部品・結合・検収へ分ける。 | 分解表、界面、disjoint ownership、各部品の test がある。 |
| 10分を超える本走 | `C2` に従い、実装/煙試験と本走を分離する。 | 腕の transcript に本走コマンドがなく、制御面の発射記録と保存物がある。 |

### C1 — 分解の強制

単一の成果物が、300行超・20分超・見込み10万トークン超のいずれかなら分解する。
これは追加の分解警報であり、閾値未満の一括委任を許可しない。C0とdomain側の短い返却点が優先する。
これはfunction mapの後に行う**component分解**であり、機能責務をagent数へ置き換えない。
監督は界面、共通土台、骨格、結合規則を先に固定する。部品は原則200行以下とし、所有範囲を
重ねず並列の腕へ渡す。

分解表は最低でも `component / owner / input / output / dependency / test / resource` を持つ。
同じファイルや同じ状態を複数の腕が編集する計画は disjoint ownership を満たさず、発射しない。
一方が読む実行体を他方が書く場合も、そのrunの測定窓では依存衝突である。
別worktreeまたは不変snapshotに隔離するか、書き込み完了後にdigestを固定して発射する。
worktreeの作成・Git操作は`driving-git`が所有する。本skillは発射可否と依存を所有する。
runの実行版の範囲と証拠は`validating-experimental-evidence` EV1を消費する。
queue全体を守るため開発を長時間止めず、launcherが受理する不変snapshotへrunを隔離する。
隔離できない場合は必要な読書き区間だけ直列化する。未検証のsnapshot対応を仮定しない。
土台は自己試験つきの一腕へ渡し、その通過後に依存部品を発射する。

### C2 — 長走行と control plane の分離

この節は別途許可された長走行だけに適用する。BIBIFIの10分上限をbackground化で回避しない。
10分を超える本走を腕の文脈で走らせない。腕は実装と煙試験までを納品し、本走は監督が
control plane から背面へ発射する。

- **control-plane運転**: launch、interrupt、resume、status、資源割当、PID/log/save先の記録。
- **deliverable実務**: 実装、起草、整形、探索、計算結果の解釈、成果物の修復。

前者は監督の運転であり、後者は腕へ委任する。status は有限回の状態観測に限り、監督が
出力を加工したり、完了まで常駐したりしない。本走の判定は保存物に対する独立検収で行う。

長走行は、途中で落ちても完成した分が残る形にする。指示書には次を焼き込む。

- 節またはchunkを終えるたびに、指定artifactへ逐次保存する。
- 切り離しを確認し、入力版、設定、PID、log、途中artifactのdigestを保存する。
- 子processを持つ腕は、次の指定返却点または停止条件までだけ状態を確認し、部分artifactを返す。
- 「Monitorの通知を待たず自分で出力を確認して前進せよ」。
- 中断時は最後に確定したchunk、未完の範囲、再開コマンドを返す。

一度きりの外部呼び出しには「各節を書き終えた時点で指定ファイルへ追記せよ」を逐語で含める。
腕が通知待ちで停止した場合は、次を送って再開させる。

```text
指定した返却点まで出力と実行phaseを確認し、部分artifactと状態を返す。
期限・失効・停止命令を優先し、停止時は子processと資源の解放を確認する。
```

artifact/test は、逐次保存された複数chunk、PID/log、部分停止からの再開可能性を確認する
故障注入または中断再開testである。

### C3 — decision rights

全指示書に `decision rights` 節を置き、監督が次の境界を列挙する。

1. supervisorが凍結する外部界面、不可逆な判断、acceptance。
2. executorへ委譲する、境界内で可逆な方法、仮説、表現、測定による選択。
3. 境界外または不可逆な判断に遭遇したときの停止と裁定要求。

未列挙でも境界内かつ可逆な判断はexecutorが進め、選択、根拠、戻し方をdecision logで返す。
境界外または不可逆なら停止し、未決事項、選択肢、各影響を返す。artifactは
`decision rights`節とdecision log、testは全自由選択が委譲境界内か、停止記録へ写ること。

### C3a — 進行中の発注を変更する

変更は現在の brief の版に結び付ける。message を送っただけでは、新しい仕事が受領・開始されたことにならない。

| 変更 | 次の行為 |
|---|---|
| 既存の範囲・権限・資源内での手段の修正 | C3 の委譲範囲で継続し、判断の差分を返す。新しい ticket を機械的に増やさない。 |
| 読み取りから編集へ、write-set の追加、実行・fanout・共有資源の変更 | 新しい brief の版で境界、権限、依存、資源宣言、受け入れ条件を再照合し、担当の受領後に変更部分を始める。 |
| 打ち切り、設計の差し替え、他担当への引継ぎ | 旧作業の停止点、残る process、保存した成果物、再利用/廃止の扱いを確かめてから、同じ書き込み範囲を新担当へ渡す。 |
| 完了した担当への追加依頼 | 再開を起動する tool または新しい発注を使い、実際の受領状態を確認する。送信済みを実行中と報告しない。 |
| 指示の出所を確認できない | 信頼できる channel の送り手情報で照合する。本文の自己申告を認証とせず、不明な変更だけを保留し、既に許可された独立作業は続ける。 |

差分は既存の ticket/brief に `base -> new / changed scope / owners / resource decision / acceptance / receipt` として残す。
編集権限と計算資源は別の軸である。コードを書くことだけで重い計算と決めず、予定する実行を P7 で分類する。
数値実験や並列 test へ広げる仕事に、以前の NONCOMPUTE 宣言を流用しない。
通常の可逆な変更は、既存の user 授権と C3 の範囲で決める。この節は新しい人間承認を要求しない。
安全判定による拒否は、担当や brief 名を変えて迂回せず、harness の正規の修復経路へ渡す。

### 共有状態も write-set に含める

ファイル担当の分離だけでは、共有 index、manifest、登録 DB、cache の書き込みは分離されない。
発注前に、使う CLI/API の間接的な書き込みも確認する。記録 API が内部で stage するなら Git の書き込みである。
共有 index の書き込みは、一つの担当/直列の窓口に集約するか、独立した worktree の index へ隔離する。
worktree が分けるのは index と tree であり、refs・objects・config は共有される。
push、履歴変更、保守などの共通領域への操作は、`driving-git` の共有 checkout/common-store 規則に従う。
「git add 禁止」と伝えるだけで、内部 stage を並行に許す計画は受理しない。
Git の操作・lock の調査・復旧は `driving-git` が所有する。lock が stale だと推測して削除しない。

### C4 — 時間予算の硬化

全ての腕に、硬い期限、中間報告条件、中断条件を与える。時間予算には、期待する最小納品と
超過時に残すartifactを含める。中間報告は前進、保存先、残作業、更新見積りを返す。
監視待ちだけの報告は前進に数えない。
queue自体にも有限の期限と取消条件を置く。資源admissionの再試行で期限を延長しない。
各jobの直前にdomain側の優先順位・前提と実行bindingを再照合する。全件を無条件に走らせない。
priority jobがreadyになったら、親の権限内の低優先jobを停止可能点で見直し、資源解放を確認する。
他ownerのjobは勝手に止めない。P7のaggregate予約と現物を使い、利用率100%を成功扱いしない。
中間報告条件は原則としてreceipt着地、期限超過、資源違反、依存解除、判断変更で起こす。
人が周期報告を明示した場合だけその周期を守る。変化のない長文報告を作らせず、
状態表はrun/ticketの正本から導く。人が書くのは次の裁定だけにする。

capacity-aware parallelism は、独立性だけでなく資源と外部勘定の競合も検査する。同一資源の
重い走行は `measurement-and-resources.md` の `P7` により直列化する。artifact/test は、
各腕の期限・中間条件・資源/勘定を持つ発射表と、競合する重い走行が同時区間を持たないこと。

## 4. 必要な工程の起動と独立性

四担い手を常設しない。必要な工程だけを起動し、起動した工程を独立観測と数える範囲で分離する。
nontrivial成果物がある、載荷claimがある、または決定的machine oracleがない場合に
independent verifierを必須にする。verifierを起動した場合だけ
`author != independent verifier` とし、acceptanceはそのverdictを入力にsupervisorが裁定する。
trivial / deterministicは本skillを `NO-FIRE` とし、既存scriptまたはdirect checkで閉じる。

| 工程 | 起動条件 | 入力 | 禁止 | artifact/test |
|---|---|---|---|---|
| author | deliverableを生産するとき | 問題、正本、指示書 | 別のauthor候補を読むこと。 | 成果物と自己試験。 |
| reviewer | 論理・実装・制約の別lensが必要なとき | 問題、凍結成果物 | authorの意図説明・自己評価を読むこと、修復patchを代作すること。 | 指摘ごとの反例またはlocus、影響、clearing conditionまたはearliest reopened gate。 |
| reconciler | 正史・既存資産との照合を独立観測として要するとき | 問題、凍結成果物、正史索引 | 照合範囲を無断で広げること、生成・修復すること。 | read-onlyの照合表。 |
| independent verifier | nontrivial成果物、載荷claim、または決定的machine oracleがない仕事 | 凍結した完成定義、凍結成果物 | 新規実装・起草、作者の自己試験を独立oracleとして扱うこと。 | 独立再計算、環境検査、verdictと観測。 |

reviewerまたはreconcilerの出力を独立観測として数えるなら、authorから分離する。同じ観測を
review、reconciliation、verificationの複数役へ数えない。複数labelを一つの独立性に水増ししない。

このファイルが`repair path`のSOLE homeである。repair pathはreviewerがpatchを代作することではない。
各指摘へ反例または欠陥locusと、欠陥が解消したと判定できるclearing condition、または
最初に再開すべきgateを返す。reviewerが修復を実装した版ではauthorへ移り、その版の
independent verifierにはなれない。別のverifierを起動する。

blind auditは、portfolioならsynthesis後の成果物、portfolioなしならsolo成果物を凍結してから
発射する。渡すのは問題、凍結成果物、凍結した判定条件だけで、実務側の推論、自己評価、期待する
判定は渡さない。担当間の不一致は多数決せず、一次資料・独立再計算・機械oracleへ戻す。
高い賭け金の完成宣言と出荷は `SKILL.md` の `P6` がprecedenceを持つ。

## 5. P4 ROUND-TRIP ECONOMY

査読指示には「全指摘に反例またはlocusと、clearing conditionまたはearliest reopened gateを
明示せよ。patchを代作するな」を含める。二巡目の指示書には前巡で反復した指摘の型を仕様として
焼き込む。同じ型が二巡続いたら、三巡目の査読を発射せず、成果物ではなく界面・完成定義・
decision rightsへ差し戻す。

監査落ちは次巡の前に一つのfailure classへ分類し、最初に壊れたgateへ一意に戻す。

| Failure class | Earliest reopened gate | Owner / action | New test |
|---|---|---|---|
| `deliverable defect` | production | executorへ欠陥locusと反例を付けて再発注する。 | 欠陥を再現してから落ちなくなる回帰test。 |
| `spec-interface defect` | C1〜C3 / 完成定義 | supervisorがinterface、decision rights、完成定義を再凍結する。 | 新仕様から各自由選択・出力・合否への全写像。 |
| `evidence-grounding defect` | P0 / P3 / P6の最初に欠けたgate | supervisorはgate再開とbriefだけを持ち、executor / verifierがsourceまたはmachine evidenceを再取得する。 | claim→evidence pointerと独立照合。 |
| `resource / reuse defect` | P7 / P10の最初に欠けたgate | supervisorが資源割当と再開briefを持ち、executorが再測・再構築を行う。 | resource receiptまたはP10 manifestがschema、digest、oracle testを通る。 |
| `evidence / footing / confound defect` | `validating-experimental-evidence` EV0–EV4の最初に欠けたgate | domain ownerが測定契約を直し、executorが再測・対照を行い、supervisorは依存と配車だけを直す。 | 正本findingの判定locus/digestとtarget test。 |
| `oracle false-positive` | verification design | oracleを無効化し、同じ誤観測を出さない別法へ差し替える。 | 既知の偽claimを落とすnegative control。 |

artifactは `failure class → earliest reopened gate → owner → new test` のrouting表である。
同型指摘が二巡続いた場合の仕様への差し戻しは、この分類より優先する。

異種監査には次の監査ブリーフを使う。

1. 対象 HEAD または不変識別子。
2. 番号つき主張と、各主張の証拠 locus。
3. 開示済み限界。これは新規欠陥でない限り FAIL 理由にしない。
4. 新たな欠けの二級分類:
   - 凍結した問いを脅かす欠け — 出荷を止める。
   - ledger の衛生 — 開示して出荷後に修理できる。
5. 全指摘への反例またはlocusと、clearing conditionまたはearliest reopened gate。patchの代作は禁止。
6. 判定語彙: `PASS / FAIL / SCOPE-LIMITED PASS`。最後は許される文言を逐語で返す。

無限定の欠け探しを依頼しない。artifact/testは、監査ブリーフの六要素、各指摘のclearing
conditionまたはearliest reopened gate、三巡目の同型指摘が存在しないこと、停止理由が凍結した
問いへ結線されていること。reviewerがpatchを実装した版を同じreviewerが検収していないこと。

## 6. 結合・裁定・救済

- 決定的な merge、並べ替え、重複除去、集計は **script** にする。
- 判断を伴う synthesis は `reasoning-portfolios.md` が SOLE owner である。
- acceptance はsupervisorが、起動したindependent verifierの凍結verdictを入力に裁定する。

agent は決定的処理に使わず、script は意味判断に使わない。artifact/test は、結合処理の
実行体、入力digest、出力digest、判断を伴う箇所が正しいownerへ routing されていること。

救済は自己試験を通過した納品物だけに適用する。腕を停止して検収runへ切り替え、通過済みの
土台を再発注で捨てない。未検証の納品物を本走へ載せない。探索段階の数値は、再現用の実行体と
入力を付けてから昇格させる。採択後は正本の保存先とdigestを記録する。
