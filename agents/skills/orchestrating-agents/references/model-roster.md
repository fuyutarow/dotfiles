# Model roster — dated snapshot 2026-07-28

> **Snapshot verified**: 2026-07-28、repository の現行 `SKILL.md` と台帳を照合。
> 外部状態の照合日は軸ごとに異なる。担い手の行は 2026-07-25、effort の束縛は
> 2026-07-28(公式 doc 5 ページを監督自身が取得して逐語照合)。正本は
> `../tests/forge-verification-ledger.md` の各節であり、根拠引用はこの file に再掲しない。

## SOLE owner — 時変の担い手

この reference は、model 名、quota、保持、probe 状態、現在の担い手の唯一の home である。
役の責務と委任の恒久規則は `SKILL.md` が持つ。この file は腐る。下記の staleness triggers が
一つでも発火したら、再照合が済むまで「現在の配役」として黙って使わない。

| 現在の持ち場 | 現在の担い手 | 状態・時変の制約 | 日付・台帳 pointer |
|---|---|---|---|
| 監督 | Opus 5 | 家の binding。公式の一般的な模型選択を、家の配役へ割り当てたもの | 2026-07-25、§配役の更新 |
| 実務 | Sonnet 5 | Agent / Workflow の既定。hook による強制は家の binding であり、起動時の実効値を probe する | 2026-07-25、§配役の更新 |
| 上位実務・harness 内 | Fable 5 | 同じ session と作業木で着地させる単発 Agent。宣言つき昇格に限り、Workflow の腕には使わない | 2026-07-25、§配役の更新 |
| 上位実務・harness 外 | sol ultra | 指示書で渡して成果物で回収する外部艦隊。主 loop の背面から発注する | 2026-07-25、§外部艦隊の配役 |
| 異種検証 | Codex GPT / agy Gemini | 現行 catalog にあり個別 probe 済みの slug だけを使う。同一 vendor の別版を別系統に数えない | 2026-07-25、§腕の版の束縛 |
| 外界の観測 | grok | **未実測・C4 待ち**。常設への昇格前であり、異種検証の既定には含めない | 2026-07-25、§外界の観測の配役 |

## 公式推奨と house binding の境界

2026-07-25 に照合した公式資料は、複雑な agentic work では Opus 5、最高能力が必要な workload
では Fable 5 という一般的な模型選択を示す。これは
`監督 = Opus 5 / 実務 = Sonnet 5 / 上位実務 = Fable 5` という委任先の公式推奨ではない。
後者と Sonnet の hook 強制、Fable の宣言制は家の binding である。

根拠と過去の誤読は、台帳 `§配役の一次錨の蒸留` と `§配役の更新` を参照する。

## effort の束縛 — 2026-07-28

effort は役に属し session に属さない(`SKILL.md` Durable role topology)。
level 名の較正は model ごとに異なるため、値より先に home を固定する。
機構(優先順序、ultracode の実体、frontmatter の対応欄)は
`operating-the-harness` の `references/workflow-and-context.md` が SOLE home である。

| 発射面 | 走る役 | effort の home | 現在の束縛 | 日付・台帳 pointer |
|---|---|---|---|---|
| 主 loop | supervisor | session(`settings.json` の `effortLevel` / `/effort`) | model の documented default。持続する下げの上書きを置かない | 2026-07-28、§effort の役への束縛 |
| Workflow の `agent()` | executor / verifier | 呼び出しごとの `agent({effort})` | 既定据え置き。`'low'` は同一 span の `LOW-EFFORT()` 宣言つきのみ(`enforce-dispatch-contract.ts` が強制) | 同上 |
| Agent tool | executor / verifier | subagent frontmatter の `effort:` | **未配線**。session を継承する | 同上 |

`Agent tool` の行は、2026-07-28 の実測で `agents/claude/agents/` が不在であることに基づく。
Agent tool 自体に `effort` 引数は無い。subagent 定義へ `effort:` が landing するまで、
この行を配線済みと読まない。session に持続する下げの上書きを置かないことだけが、
この穴を安全側へ閉じる。

`Opus 5 @ low` と `Sonnet 5 @ xhigh` の直接比較は 2026-07-28 時点で存在しない。
安く回す裁定が要るときは、推測でなく実測の head-to-head を先に置く。

## Job shape → current bearer

| 仕事の形 | 現在の選択 | 選択時の制約 | 日付・台帳 pointer |
|---|---|---|---|
| 通常の起草・計算・編集・試験・調査 | Sonnet 5 | Agent / Workflow の実効 model を probe してから発射する | 2026-07-25、§配役の更新 |
| session の文脈と作業木を共有して着地させる上位の単発 | Fable 5 | `ESCALATION(fable)` の三欄を満たす単発 Agent に限る | 2026-07-25、§配役の更新 |
| 広い掃引を自己完結の指示書で渡し、成果物で回収する上位実務 | sol ultra | Codex 契約の capacity を使う。遊休なら harness 外を先に当てる | 2026-07-25、§外部艦隊の配役 |
| 独立の第二意見 | Codex GPT または agy Gemini | 実務に使った bearer と同じ腕を監査へ戻さない | 2026-07-25、§外部艦隊の配役 / §腕の版の束縛 |
| 世評・受容・直近の話題の所在を観測する | grok | 問いだけを渡す。repo と成果物は渡さない | 2026-07-25、§外界の観測の配役 |

## Quota・保持・排他

- Fable 5 は Anthropic の通常の週次枠を使い、他の同社 model より速く枠を消費する。
  2026-07-24 の根拠は台帳 `§配役の一次錨の蒸留` に置く。
- sol ultra は Codex 契約の capacity に載り、Anthropic の週次枠を消費しない。
  2026-07-25 の選択規則は台帳 `§外部艦隊の配役` に置く。
- Fable 5 は 30 日保持の Covered Model で、ZDR では利用できない。秘密を含む repo へ
  向けない。2026-07-25 の照合は台帳 `§配役の更新` に置く。
- sol を実務に使った仕事では、sol を異種監査から外す。2026-07-25 時点の例外候補は
  Codex GPT の terra だが、同一 vendor・同一世代なので独立性は部分的である。
  判定が割れたら agy Gemini を足す。台帳 `§外部艦隊の配役` を参照する。
- grok へは問いだけを送り、秘密、repo、成果物を渡さない。例外的に監査へ使う場合も、
  秘密を含まない repo と明示指示が必要である。台帳 `§grok の配役制限` と
  `§外界の観測の配役` を参照する。
- grok が返すのは「何が言われているか」であり、技術的真偽の根拠にしない。
  能力は 2026-07-25 時点で未実測である。台帳 `§外界の観測の配役` を参照する。

## Availability gate — 黙って代替しない

binding は可用性の証明ではない。指定 bearer が利用不能、slug が未 probe / legacy、
hook や harness が model 指定を強制できない、または quota・保持条件を確認できない場合は、
別 model へ黙って差し替えない。

発射前に capability probe を行い、失敗時は次を記録して監督が裁定する。

```yaml
requested_slot:
bound_bearer:
probe_date:
probe_result:
failure_or_constraint:
fallback_candidate:
independence_quota_retention_delta:
supervisor_decision:
```

2026-07-25 の Fable 5 昇格は、deny 経路と配線だけが実機確認済みで、allow 経路の実 model は
未確定だった。成功を推定せず、次の利用時に probe する。台帳 `§配役の更新`
`昇格経路の実機検証` を参照する。

## Staleness triggers — この file は腐る

次のいずれかで snapshot を stale とする。

- 公式 model 表、legacy 指定、slug、利用可能 tier が変わった。
- `driving-*` の catalog または個別 capability probe が変わった。
- Sonnet 強制 hook、Fable 昇格経路、Workflow の model 解決順が変わった。
- Codex / Anthropic の契約、quota、課金先、週次枠の扱いが変わった。
- 保持期間、Covered Model、ZDR、秘密の持ち出し条件が変わった。
- sol ultra の形、外部艦隊の回収方法、監査排他が変わった。
- grok の C4 head-to-head が完了した、または観測用途の制約が変わった。
- 現在の担い手を監督が変更した。

発火後は capability probe と一次資料を再照合し、fallback と監督裁定を台帳へ記録してから、
この見出しの日付と該当行の pointer を更新する。
