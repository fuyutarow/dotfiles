---
name: orchestrating-agents
description: >-
  署名済みtask/function mapへ委任・並列化・独立検収を載せるcontrol plane。明示的dispatch、配役、
  visibility、dependency、veto、verification、acceptance、GPU/CPU/RAM/VRAM resource admissionで使う。裸の「研究を進めて」では発火せず、
  programme設計→supervising-research-programmes、grant済みsection→directing-research-sections、
  凍結terminal audit→auditing-research-processesへrouteする。directing-researchはroute-only shim。
  Postmortemはdispatch/pacing/delegation/visibility/acceptance/control-plane failureだけ;
  software incident→implementing-and-debugging。Durable co-fire: continuity record → orchestration overlay → writer
  checkpoint; continuing-long-running-tasksがrecord/writer semanticsを持ち、ここはlocusだけを運ぶ。
  Cuts: research meaning→上記domain owner; document lifecycle→governing-research-documentation;
  present fact→raising-resolution; thesis→forging-novel-theses; premise→surfacing-blind-spots; costly
  one-bet→acting-on-hypotheses; cheap probe→plain executor。Domain content/skill craftは各owner。
  Scope/brief/synthesis/acceptanceはsolo、独立生成/盲検検証はfan-out。Japanese skill; responds in
  the user's language.
---

# orchestrating-agents — 委任体制を運転する監督の規律

> **Version**: v2608.3.0 (2026-08-04) — cross-section learning-bus ownership seam.
> 履歴、実測、採否、fire/no-fire の検証は `tests/forge-verification-ledger.md` が正本。

読み込み元のこの `SKILL.md` があるdirectoryを、実行前に
`ORCHESTRATING_SKILL_DIR` として渡す。cwdから推定しない。

```bash
: "${ORCHESTRATING_SKILL_DIR:?set from the loaded SKILL.md directory}"
missing=()
for f in model-roster delegation-contracts measurement-and-resources reasoning-portfolios; do
  test -f "$ORCHESTRATING_SKILL_DIR/references/$f.md" || missing+=("references/$f.md")
done
test -f "$ORCHESTRATING_SKILL_DIR/tests/forge-verification-ledger.md" ||
  missing+=("tests/forge-verification-ledger.md")
if ((${#missing[@]})); then
  printf 'MISSING %s\n' "${missing[@]}" >&2
  exit 1
fi
```

## 目的と適用範囲

この skill は、決まった仕事を速く、独立に検証できる形で運転する。

何を選ぶか、分野の結論、個別 tool の構文は sibling の正本へ委ねる。

創造的研究では、programme構成とportfolio判断は`supervising-research-programmes`が署名する。
grant済み一sectionのlocal workは`directing-research-sections`が署名する。
凍結terminal episodeのprocess auditは`auditing-research-processes`が署名する。
`directing-research`は意味を変更しないroute-only shimである。

本skillは各domain artifactのlocus/digestを受けた後のdispatch overlayだけを所有する。

署名済みmapが無い場合、本skill単独で研究の意味や順序を作らない。
明示的なdispatch/control-plane依頼だけは、既存mapの所在確認から開始できる。

監督は成果物の作者ではなく、仕事の境界、証拠の境界、採否の境界を所有する。

各 rule は、観測できる artifact または一つの reference pointer を持つ。

artifact が無い規則は、実行済みとして数えない。

## Language

この skill は日本語で書く。次の stable tokens は翻訳せず、同じ意味で使う。

| Token | この skill での意味 |
|---|---|
| `LAW` | 他の局所規則に優先する運転原則。 |
| `gate` | artifact が無ければ通過していない判定点。 |
| `fire / no-fire` | この skill が仕事の運転を所有するかの判定。 |
| `solo` | 一人の指定ownerが整合した一つの判断を出す形。 |
| `fan-out` | 独立な腕へ同時または直列に分岐して候補を得る形。 |
| `barrier` | 次段へ渡す前に入力schemaと到着条件を揃える境界。 |
| `merge` | 判断を含まない決定的な結合。 |
| `synthesis` | 正規化済み候補を証拠で比較する判断。 |
| `acceptance` | 凍結した完成定義に対する監督の最終採否。 |
| `candidate packet` | 候補、証拠、仮定、弱点、費用を揃えた正規化単位。 |
| `LOW-EFFORT(<段>)` | 既定より低い effort で腕を発射するときに prompt へ置く grep 可能な宣言。 |
| `RESOURCE-CLASS(NONCOMPUTE)` | 数値実験、benchmark、resident service、parallel test、nested fanoutを含まないdispatchの宣言。 |
| `RESOURCE-ENVELOPE(<path>)` | 発射前に凍結したCPU/RAM/VRAM/process/walltime envelopeへの絶対path。 |

## LAW

絶対命題にしない。次の scope と artifact が揃う場合だけ適用する。

| LAW | 規則 | Artifact |
|---|---|---|
| 公表門 | 許可済み・可逆・隔離済みの生産は、検証の完了待ちで止めない。同じ巡に並べるのは verification design、oracle、brief の準備までとし、成果物依存の blind audit は凍結後に行う。検証は公表と acceptance を止める。 | 同じ巡の production と verification-design dispatch、scope 三条件、audit入力の凍結digest。 |
| Control plane | supervisor は設計、brief、dispatch、interrupt/status、裁定、acceptance、対話を持つ。supervisor bearerはexecutor、deliverable author、independent verifier、subagentにならない。成果物の実装、起草、探索、計測、独立検証はdelegated bearerへ渡す。 | 全 tool 行為の級。supervisorとauthor / verifierが分離し、authorとverifierも異なるbearerであるprovenance。 |
| 認知的異質性 | ensemble は agent 数でなく、狙う failure mode と reasoning topology を異質化する。固定人格の複製を多様性と数えない。 | 各腕の `topology / failure_mode_attacked` を持つ portfolio manifest。 |

未許可、不可逆、隔離不能な変更は第一の LAW の scope 外である。

その場合の artifact は、停止理由と必要な権限または安全境界である。

## 行為級 — supervisor の宣言制

supervisor が tool を使う前に行為級を宣言する。

対話だけで tool を使わない場合は宣言を要しない。

| 級 | 許されること | 禁止 | Artifact |
|---|---|---|---|
| 検分 | 裁定を養う読み取り専用の現物確認を一〜二操作行う。 | 編集、生成、計測、広い探索。 | `検分: <養う裁定>` の札と read-only log。 |
| 委任 | 自己完結した brief を作る。非生成仕事は完成定義と検収試験を発射前に凍結する。生成仕事はstage mapの二段freezeを使う。 | 成果物を代作すること。 | brief、owner、期限、仕事型に応じたfreeze、試験。 |
| 運転 | 事前指定jobを launch、poll、interrupt し、差分statusを報告する。 | job の仕様変更、成果物の生成・修復。 | job id、操作、状態差分、次の判定時点。 |
| 検収 | delegated verifierの凍結した試験結果だけを受け、採否と観測を記録する。 | 試験の実行、新規実装、起草、試験に合わせた修復。 | `検収: <claim>` の札、独立oracle、verdict、PASS/FAIL。 |

運転中は、完了待ちだけの空のstatusを作らない。

artifact は、前回から変わった状態、裁定、または新しい阻害要因である。

検収試験は「主張が偽でも同じ観測が出るか」を先に問う。

答えが yes ならその試験は無効とし、独立な一致照合へ差し替える。

artifact は、反証可能性への回答と採用した oracle の locus である。

## 可逆な裁定の既定

可逆で開示でき、与えられた権限内の裁定は、supervisor が暫定の既定を選んで進める。

報告には `覆せる既定(暫定・追認待ち)` の札と、戻し方を置く。

不可逆な変更と統治の変更だけを user の裁定待ちへ積む。

artifact は、decision log の可逆性、戻し方、裁定者である。

## Durable role topology

現在の担い手、model 名、availability と probe 状態は
`references/model-roster.md` が SOLE home である。

dispatch 前に同 reference を読み、利用不能な担い手を黙って代替しない。

effort は役に属し、session に属さない。

同じ level 名が model ごとに別の量を指すため、混成の配役へ単一の全域値を置かない。

既定は各 model の documented default とし、既定より下げる dispatch だけが
`LOW-EFFORT(<段>): <この段が intelligence-sensitive でない理由>` の宣言を要する。

artifact は、dispatch ごとの effort の出所と、下げた場合の宣言行である。

| Durable role | 所有する仕事 | 境界 | Artifact |
|---|---|---|---|
| supervisor | scope、interface、brief、運転、裁定、acceptance、対話。 | executor、deliverable author、independent verifier、subagentにならない。 | signed spec、dispatch graph、acceptance record。 |
| executor | 起草、実装、探索、計測、自己試験。 | 自分の成果物を独立検収しない。 | deliverable、provenance、self-test。 |
| independent verifier | 成果物を盲検で照合し、反証または独立再計算を行う。 | 生成、修復、作者の自己評価への依存をしない。 | blind brief、oracle、verdict。 |
| outside observer | 世評、受容、直近の外界信号を所在つきで観測する。 | 技術的真偽の根拠や独立検証者にしない。 | 観測日、範囲、source locus。 |

## Workflow-native stage map

以下で生成仕事とは、novelty-sensitiveまたはcandidate-generatingな仕事を指す。

domain skillがmaturity gateを明記していなくても、生成仕事はdomain ownerによる
formulation / evaluability artifactとdigestを必須にする。

### Function-first composition

配役、並列数、modelを決める前に、domain/craft ownerが署名した次の分解を受け取る。

```text
<input state> --<function verb>--> <owned artifact> --<sole domain owner>--> <next state>
```

機能名をagent role名で代用しない。このskillはdomain/craft function mapを再定義しない。
`domain_function_map_locus`とdigestを照合し、同じ成果物に二つのownerが付いていたらdispatchせず、
domain/craft ownerへtyped cutの修復を返す。既存domain ownerが無い一回限りのplain taskだけは、
supervisorがtask-localなprovisional mapを作れる。固有のinput/output/stopを持つ再利用可能な
ownership voidなら`forging-skills`へ渡す。

このskillのartifactは、署名済みmapへの`domain_function_map_locus + digest`である。
各行へagent、visibility、dependency、veto、verification、acceptanceを載せる。
これを**dispatch overlay**と呼ぶ。topologyは後から載せるcontrol planeである。
domain機能やsemantic mapを代理しない。

長期タスクのcross-session stateは`continuing-long-running-tasks`が所有する。両者がco-fireする
場合、このoverlayは`continuation_record_locus`だけを運び、recordのsemantic stateを複製・編集
しない。continuity側もagent、dependency、veto、acceptanceを決めない。

Stable order: `continuity record -> orchestration overlay -> writer checkpoint`. Domain mapの後、
`continuing-long-running-tasks`がrecord locusをinitialize/reconcileし、本skillがそのlocusだけを
運ぶroles/visibility/veto/acceptance overlayを作る。受理されたoverlay locatorはCのsole writerが
checkpointする。どちらも相手のsemantic artifactを編集しない。

| Stage | Mode | Why | Artifact |
|---|---|---|---|
| scope / map intake / interface / portfolio / brief | `SOLO` | 発射前にdomain-signed mapのlocus/digest、外部界面、hard constraints、安全、予算、phase-exit、maturity release conditionを一つの仕様にする。owner不在のplain taskだけtask-local provisional mapを許す。 | domain-function-map pointer + dispatch overlay + launch freeze。 |
| verification design / oracle / audit brief | productionと同じ巡に準備可 | 成果物を見ずにheld-out lensとoracleを準備する。既知のhard constraintsとstage-exit criteriaは生成側へ開示できる。 | 生成側からsealedなlens、oracle、expected verdictと、開示した制約の一覧。 |
| production / candidate generation | `FAN-OUT` where independent | solver腕は実候補、修正版、別候補、または実成果物を返す。成熟前のgenerative challengeは別候補か修正版へ変換する。clearing condition / discriminating probeだけならmaturity支援artifactへ分け、solver候補に数えない。いずれもreject / prune / PASS / FAILの権限を持たない。 | dependencyとownerが分離したdispatch graph、非空の実候補・成果物、または候補外と明記したmaturity支援artifact。 |
| maturity release | 生成仕事だけのdomain `BARRIER` | 全ての生成仕事で、domain ownerがformulation / evaluabilityを確定する。verified fact、hard constraint、安全、権限、決定的矛盾はこの前でも停止できる。 | `domain_gate_locus`、`artifact_digest`、release record。 |
| normalization | `PIPELINE` + `BARRIER` | release済みの実候補・成果物だけを同じ比較面へ写す。maturity支援artifactを候補へ混ぜない。 | schema-valid candidate packetsと、除外した支援artifactのlog。 |
| synthesis / verdict-bearing evaluation | conditional `SOLO` | portfolio時だけ候補を比較する。生成仕事ではmaturity release後、final acceptance criteriaの第二freeze後にだけreject / prune / verdictを許す。 | frozen criteria、synthesis recordと候補ごとの採否理由、またはskip理由。 |
| blind verification | capacity-aware `FAN-OUT` | synthesis後の成果物、またはsolo成果物を凍結してから異なる反証lensを当てる。 | frozen digestとblind inputを持つaudit manifest。 |
| acceptance | `SOLO` | userへの公表責任を一つのcontrol planeへ閉じる。 | frozen criteria、独立検収、acceptance record。 |

harness が無い場合も stage map は変えず、同じ腕を順番に実行する。

artifact は、serial 化した順序と、独立入力が腕の間で共有されていない記録である。

生成仕事のfreezeは二段である。
第一freezeは発射前のinterface、hard constraints、安全、予算、phase-exit、maturity release conditionである。
第二freezeはdomain ownerがformulation / evaluability artifactとdigestを出した後に行う。
verdict-bearing evaluationまたはblind auditの前に、final acceptance criteriaを凍結する。
auditやverdictを見てcriteriaを変えない。

非生成・決定的な仕事は従来どおりlaunch specでcriteriaを凍結でき、maturity ceremonyを追加しない。
候補到着後にsupervisorがnormalization barrierを所有し、scriptがschema検査とdedupを行う。
portfolioが無ければsynthesisはskipできる。synthesis後またはsolo成果物の凍結後にblind auditを
発射し、独立verdictの到着後にacceptance barrierを置く。

## Evidence boundary

agent の出力は proposal であり、提出されたこと自体は evidence ではない。

事実は `citation-relay | machine-check | both` のいずれかで境界を越える。

1. `citation-relay`: claim、一次sourceの locus、適用scopeを一緒に渡す。
2. `machine-check`: `command_or_call`、`input_fingerprint`、`raw_artifact`、
   `output_digest`、独立`oracle`、`result`を一緒に渡す。

artifact は、各載荷claimから relay または check への逆向きpointerである。

複数agentの agreement、自己申告の PASS、長い推論は、それ自体を証拠にしない。

独立 verifier へ渡すのは、問題、成果物、凍結した判定条件だけにする。

held-out audit lens、oracle、expected verdictはgeneratorからsealedにする。既知のhard constraintsと
stage-exit criteriaは開示できる。生成側の意図、期待する判定、自己評価はblind inputに入れない。

不一致は多数決せず、最初に引く糸として一次資料、機械oracle、独立再計算へ戻す。

artifact は、disagreement log、裁定根拠、再開したclaim idである。

外界の観測を成果物へ載せるときは、観測日と範囲を主張に含める。

技術的真偽へ転用しないことを acceptance record で確認する。

## v2 research verification cut

この節はv2 research packetに限り、本文中のgenericな独立検収表現に優先する。
常設Verifierは置かず、claim typeとpromotion riskでtierを選ぶ。

| Tier | Check | Hot-path effect |
|---|---|---|
| V0 | 全packet/state mutationをschema、digest、role/write/read set、join、revision、fence、visibility、replayで決定的に検査する。 | packetをatomic rejectできる。LLMを呼ばない。 |
| V1 | localで可逆なcandidate、admission、cheap probe、reviewはDirector charter rule、V0、executor receiptで学習する。 | verifierなしでsectionを続ける。 |
| V2 | programmeへpromotionするload-bearing empirical assertionに独立machine oracleが無い場合だけ、declassification後に独立reviewする。 | `PENDING_VERIFICATION`はpromotionだけを止め、search/learn queueを止めない。 |
| V3 | broad RETIRE/CLOSE、公的達成claim、不可逆allocation、safety-critical transitionをdistinct bearerまたはauthorised humanが凍結criteriaでreviewする。 | enact/publiciseだけを止める。 |

`auditing-research-processes`は凍結episodeのresearch-process integrity ownerであり、general verifierではない。
Programme Supervisorを可逆なcandidate admission、build、executionのhot pathへ置かない。
verifierをreceipt interpretation、learning、Director commitのhot pathへ置かない。
artifactはtier、mode、必要ならdistinct verifier、
verification artifact、timeout時の`PENDING_VERIFICATION`である。

### Cross-section learning-bus cut

Committed section learningの横伝播は`directing-research-sections`が意味を所有する。
同skillが`SECTION_TRANSFER_PACKET`、`SECTION_SUBSCRIPTION`、recipient admission、
`SECTION_TRANSFER_COMMIT`を定義し、source/recipient Directorの局所裁定を閉じる。

brokerはagentでもsemantic ownerでもない。凍結したtopic/premise/interface idとdelta classを扱う。
exact set membershipだけを決定的に照合し、delivery recordを作る。
packetの解釈、採否、ack待ち、Supervisor/verifier/global joinを追加しない。
本skillがco-fireできるのは、明示されたbroker topology、visibility、dependency、V0 enforcementを
dispatch overlayへ載せる場合だけである。transfer artifactやsection stateを所有しない。

artifactは、Section-owned function-map locus/digestと、必要な場合だけbroker dispatch overlayである。

## 監督の一巡

gate は着手から公表までの順で適用する。

P5はP2へ吸収済みであり、この番号を別のgateへ再利用しない。

| Gate | Precedence rule | Artifact / pointer |
|---|---|---|
| P0 GROUNDING | 水準、新規性、不在、能力、成熟度を述べる前と、新しい建造を登録する前に、意味検索と正本索引を照合する。grepだけで閉じない。 | query分母、正本名、`file:line` hit / 軸ごとのno-hit。最低軸は実装・既存資産、別表現、普遍層、撤回台帳。登録では、その分母を登録の文書に書く。 |
| P1 PROBE-FIRST | change/build で、変更が許可済み・可逆・隔離済みの場合だけ、同じturnに最小probeをexecutorへ委任する。answer/explain/review/diagnoseではmutationしない。 | scope三条件、dispatch id、具体出力。確認済み知見をbuildへ出す場合は対応する実装dispatch。 |
| P2 CONCURRENT-VERIFY | 独立でcapacityが競合しないproductionとverification準備を並べる。生成仕事はstage mapの二段freezeを守り、成熟前のchallengeにvetoを与えず、maturity release後だけverdict-bearing evaluationへ渡す。blind auditは最終物の凍結後だけ発射する。 | dependency/resource/accountを持つdispatch表、launch freeze→maturity release→criteria freeze→verdict / auditの順序、frozen digest、status差分。 |
| P3 PRE-SEND FLOOR | 目安十行超の報告は先にfileへ保存し、利用可能な文章検査を通す。報告・設計・登録のいずれでも、数値にはsourceと測定体制を添え、条件差を明記する。体制のない値を設計根拠にしない。 | report path、検査command/resultまたは不存在確認、数値→source/conditions表。 |
| P4 ROUND-TRIP ECONOMY | briefを自己完結させ、全指摘に修復経路を求める。同型指摘が二巡続けば成果物でなく仕様へ戻す。 | `references/delegation-contracts.md` が SOLE home。brief id、round log、spec差分。 |
| P6 VERIFY-NOT-TRUST | 載荷claimは自前計算、一次資料、独立再計算のいずれかで確定する。達成級の語もclaimであり、独立audit前は前進の報告とする。 | claim→evidence表、blind audit、scope付きverdict。不一致claimは裁定まで公表停止。 |
| P7 DEVICE-BUDGET | pilotも含め、数値計算・parallel test・resident serviceは算術memory boundとaggregate資源envelopeのadmission後にだけ発射する。互換で空いたGPUがあればCPUを拒否し、auto parallelismを使わない。 | `references/measurement-and-resources.md` P7がSOLE home。dispatch marker、envelope、`agent-resource-run` verdict、高水位。 |
| P8 FOOTING | 数値は比較軸が一致した土俵だけで差として読み、凍結基準の到達可能性を本走前に検算する。 | 同 reference P8。全軸差分表、到達可能性の式、独立再計算。 |
| P9 CONFOUND-TABLE | 一変数の効果を問う前に交絡表を書く。機構の効果を主張するなら、機構を外した対照を同一条件で置く。 | 同 reference P9が SOLE home。交絡表、「機構なし」行、条件差が対象機構だけの照合。 |
| P10 ARTIFACT-REUSE | 分単位以上の中間生成物は初回に保存し、指紋一致時だけ再利用する。更新・仕様変更・破損で失効させる。 | 同 reference P10。manifest、digest、input fingerprint、再構築理由。 |

### P1 change boundary

P1 は、変更または建造を依頼されたturnだけで生産を起動する。

回答、説明、査読、診断はread-onlyで完結し、修復を暗黙に始めない。

許可済みのbuildでは、相談や調査の完了を待たず、最小probeをexecutorへdispatchする。

二つの独立確認が揃った知見は、権限とscopeが既にある場合だけ、同じ巡で実装briefへ接続する。

権限が無い場合は提案に留め、mutationを作らない。

artifact は、user intentの分類、scope三条件、probe id、実装briefまたはno-mutation記録である。

### P6 public-claim contract

`達成 / 決着 / 合格 / 実証 / 確定` は、いずれも載荷claimとして扱う。

達成級の文言には、元の目標、凍結した判定条件、玩具・本機・規模の土俵を含める。

土俵を跨ぐ一般化は、独立auditが済むまで `前進の報告` と呼ぶ。

`全数 / 網羅` のacceptanceには、次の三層を全て要求する。

1. 既知事例との全件照合。
2. 独立担当による敵対的な再掃引。
3. 非作者によるclaim↔raw-data照合。portfolio時はsynthesizerが担ってよい。

artifact は、claim id、目標と基準の引用、scope、三層の照合表、measurement pointerである。

P7〜P10 の詳細をこの core へ複製しない。

測定、交絡、機構なし対照、保存の裁定時に該当referenceを読む。

## 委任形の選択

固定四役や固定本数を既定にしない。

仕事の形、失敗様式、capacityで最小の構成を選ぶ。

| 仕事の形 | 選ぶ形 | Artifact |
|---|---|---|
| trivial / deterministic | `solo`: 既存script、または一人のexecutor。teamを作らない。 | 単一ownerまたはscriptと、直接のcheck。 |
| 不確実で複数の有力経路がある | reasoning portfolio。failure modeが違う腕だけを選ぶ。 | portfolio manifestと `references/reasoning-portfolios.md`。 |
| 読解・検証 | distinct lensを持つ腕。capacityが無ければ独立性を保って直列化する。 | lens、blind input、schemaが揃ったaudit table。 |
| 小さい実装・計測 | 一人のexecutor。時間予算とself-testを固定する。 | brief、ETA、self-test、deliverable。 |
| 大きい単一成果物 | C1でinterfaceと土台を固定し、部品へ分解する。 | `references/delegation-contracts.md` C1の分解表。 |

reasoning portfolioの詳細は`references/reasoning-portfolios.md`がSOLE homeである。
対象はtopology、candidate packet、normalization、leave-one-out pruning、schema、thresholdである。
coreはprecedence要約とpointerだけを持つ。

各腕は別の腕の候補を見ずに packet を作る。

synthesis へ会話全文を渡さず、schema-valid packetだけを渡す。

artifact は、独立入力digest、packet schemaの検査、除外した腕と理由である。

## merge / synthesis / acceptance の cut

| Term | Owner | Rule | Artifact |
|---|---|---|---|
| `merge` | script | 並べ替え、重複除去、集計など決定的な結合だけを行う。 | executable、input/output digest、再実行一致。 |
| `synthesis` | 指定した一役 | 正規化済みcandidate packetsを証拠で比較する。多数決だけで決めない。 | packetごとのevidence、弱点、選択理由。 |
| `acceptance` | supervisor | 凍結した完成定義と独立検収から最終採否を出す。 | criteria、verdict、scope、未解決claim。 |

生成者と独立検収者を同じbearerにしない。authorが一方のdelegated bearerならverifierは他方の
delegated bearerにする。必要なbearerが利用不能なら黙って代替せず、supervisorの裁定へ戻す。

synthesis が新しいcandidateを生成した場合、そのcandidateを独立検証へ戻してから
acceptance する。

artifact は、author / verifier / synthesizer / acceptor のprovenance graphである。

## Canonical fire / no-fire routing

優先規則: user が本 skill を改鋳対象として明示した場合、本skillをdomain正本として読み、
`forging-skills`をcraft ownerとしてco-fireする。

artifact は、loaded skills と `domain / craft` のowner記録である。

| Ask / signal | 判定 | PURPOSE cut と owner | Artifact |
|---|---|---|---|
| generic software incident/postmortemで原因、修復、再発防止を問う。 | `NO-FIRE` | `implementing-and-debugging`が挙動とroot causeを所有する。dispatch/pacing等のcontrol-plane failureが明示された場合だけ別行で本skillがco-fireする。 | implementation diagnosis/fixへのpointer。 |
| 創造的研究の裸の「研究を進めて」「どんどん進めて」。署名済みmapもdispatch指定も無い。 | `NO-FIRE` | route-only `directing-research` shimがprogramme、section、terminal auditを分類し、意味変更なしで新ownerへ渡す。 | routing decisionだけ。 |
| 署名済みmapがある。またはdispatch/control-planeを明示している。 | `FIRE / CO-FIRE` | mapの意味はdomain owner。本skillはagent、visibility、dependency、veto、verification、acceptanceだけを載せる。 | map locus/digestとdispatch overlay。 |
| 「起草と査読を委任」「定理や文書を起草・査読」。 | `FIRE / CO-FIRE` | 運転はここ。数学の中身は `proving-theorems`。 | role分離とco-fire記録。 |
| 「複数の模型で水平思考」「誰に任せる」「配役を決める」。 | `FIRE` | topologyと順序はここ。現在の担い手はmodel roster。 | portfolioまたはrole-selection record。 |
| 「創造と批判をどう配る」「生成と評価を分ける」「早すぎる批判が候補を潰す」。 | `FIRE` | domain ownerが成熟/凍結条件を定義した後のvisibility、challenge release、veto authority、multi-agent topologyはここ。内容と成熟判定はdomain owner。 | domain freeze pointer、権限表、visibility record。 |
| dispatch、pacing、delegation、visibility、acceptance、control-planeの失敗を振り返る。 | `FIRE` | 委任体制と運転規則のpostmortemだけを所有する。 | 観測した失敗→変更したrule/artifact。 |
| 凍結したterminal research episodeのframe、candidate、test、portfolio processを監査する。 | `NO-FIRE` | `auditing-research-processes`がintegrity auditと非enacting recommendationを所有する。live programme/section reviewは各domain ownerへ戻す。 | frozen audit packetへのpointer。 |
| 「検収試験を設計」「完成宣言が監査に落ちる」。 | `FIRE` | P6とacceptance境界はここ。 | falsifying test、blind audit、verdict。 |
| 「中間生成物を再利用」「cacheを作り直している」。 | `FIRE` | 発火はここ、詳細はmeasurement reference。 | P10 manifest pointer。 |
| codeまたは実験のresource boundを問う。 | `NO-FIRE / CO-FIRE` | “Is the resource question aggregate agent CPU/RAM/VRAM/GPU admission rather than the code or experiment’s own resource bound?” **Yes** → P7 alone owns dispatch resources. **No** → `practicing-tiger-style` owns the code/experiment ledger; co-fire only when both bounds matter. | P7 envelope/`agent-resource-run` verdict、またはTiger ledger pointer。 |
| 個別 CLI のflag、slug、呼び出し構文。 | `NO-FIRE` | `driving-*` が一回の呼び出しを所有する。 | routing先だけ。委任体制を起動しない。 |
| 文献群の台帳、確度、矛盾調停、体系化。 | `NO-FIRE` | `systematizing-knowledge` が内容を所有する。 | routing先。並べ方を問う場合だけco-fire。 |
| programme全体の問題構成、OPEN_ISSUE、>=2独立sectionのportfolio配分・再開・撤退。 | `NO-FIRE` | `supervising-research-programmes`がprogramme lifecycleとportfolio判断を所有する。 | programme artifactのlocus/digestを受け取る。 |
| current OPEN_ISSUEへのbid、grant済み一sectionのcharter、local admission、intent、receipt-linked learning。 | `NO-FIRE` | `directing-research-sections`が一sectionのlocal lifecycleを所有する。 | section artifactのlocus/digestを受け取る。 |
| committed section learningのpacket、subscription、recipient ADOPT/REJECT/DEFER、local transfer commit。 | `NO-FIRE / CO-FIRE` | `directing-research-sections`がtransfer semanticsと全section-owned artifactを所有する。本skillは明示されたexact-match brokerのtopology、visibility、dependency、V0 enforcementだけを載せる。 | Section function-map locus/digestと、必要な場合だけbroker dispatch overlay。 |
| compact、session、executorを越えて残るtask stateやresume/handoff record。 | `NO-FIRE / CO-FIRE` | `continuing-long-running-tasks`がdurable stateを所有する。本skillはtopology、役割、vetoだけを載せる。 | continuation locusとdispatch overlay。意味状態を複製しない。 |
| research documentのcreate/update/derive/freeze/retire/delete、authority、admission。 | `NO-FIRE` | `governing-research-documentation`が文書portfolio lifecycleを所有する。 | lifecycle verdictへのpointer。 |
| 既存code/data/API/source/problem artifactのfactual present-state rowを検分する。 | `NO-FIRE` | `raising-resolution`がcitation gate、cheapest rung、stop-at-oneを所有する。 | cited observationだけをoverlayへ渡す。 |
| 既存plan/frameの暗黙前提、無視した例外、人間の暗黙知を、解決案を出す前に掘る。 | `NO-FIRE` | `surfacing-blind-spots` がEXPOSEとBlind-spot packetを所有する。 | function mapでは同skillのpacketを次段のdomain ownerへ渡す。 |
| 選ばれた問題frameから新しいthesis候補を類推・構造移送・再結合で生む。 | `NO-FIRE` | `forging-novel-theses` がGENESISだけを所有する。 | packet/routesを受け、blindnessとfreeze時機だけをここで決める。 |
| 高価/不可逆な既知の一つの賭けをper-test threshold、kill experimentで試す。 | `NO-FIRE` | `acting-on-hypotheses` がgated ONE treeの実行規律を所有する。 | probeの役割分離が必要な場合だけco-fire。 |
| 安価・決定的・可逆でdownstream exposureのない一回のprobeを走らせる。 | `NO-FIRE` | domain/plain executorが実行し、domain ownerへ`EXECUTOR RESULT`を返す。 | topologyを起動しない。 |
| 完成した研究結果からpaperのgoverning claim、positioning、rebuttalを作る。 | `NO-FIRE` | `arguing-research-papers` がargumentを所有する。 | author/reviewer/verifierのtopologyだけをここで決める。 |
| DMN、incubation、mind-wandering、人間の感情や休息の効用。 | `NO-FIRE` | 人間の認知主張をagentのsleep / waitへ翻訳しない。内容調査はdomain research。 | sleep / waitを創造性の代理にしたdispatchが存在しない。 |
| 文章規則、語彙、散文の品質。 | `NO-FIRE` | `linting-prose` が内容を所有する。 | P3では検査結果だけを消費する。 |
| 対象分野の事実、理論的位置づけ、scope判断。 | `NO-FIRE` | 対応するproject skillが正本。 | domain verdictへのpointer。 |
| skillの新設、description、cuts、eval、鍛え直し。 | `NO-FIRE / CO-FIRE` | `forging-skills` がcraftを所有する。明示対象なら上の優先規則。 | craft ownerとdomain ownerの記録。 |
| 一行で済む即答、単純な決定的処理。 | `NO-FIRE` | plain answerまたは既存script。 | subagent dispatchが存在しない。 |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/model-roster.md` | 現在の担い手、model、availability、probe、staleness。 | 配役、担い手の利用不能時。 |
| `references/delegation-contracts.md` | brief schema、C1〜C4、長走行、P4、生成・査読・照合・検収の分離。 | 委任前、長いjob、反復指摘、救済。 |
| `references/measurement-and-resources.md` | P7〜P10、measurement packet、土俵、交絡、機構なし対照、再利用。 | 計算、比較、因果主張、cacheの保存・失効。 |
| `references/reasoning-portfolios.md` | topology、failure mode、candidate packet、normalization、synthesis、pruning。 | 複数の有力経路があり、異質な候補を比較するとき。 |
| `tests/forge-verification-ledger.md` | 履歴、出自、実測、採否、fire/no-fire、F3検証。 | reforge、postmortem、規則の根拠を監査するとき。 |
