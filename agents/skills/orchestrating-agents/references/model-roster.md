# Model roster — dated snapshot 2026-10-05

> **Snapshot verified**: 2026-07-31。**2026-08-26 に availability gate が一度失敗している**(下の記録)。model 名と現在のavailabilityはこの file の SOLE home。
> 役の恒久規則は `SKILL.md`、過去の配役と根拠は `../tests/forge-verification-ledger.md` が持つ。

## SOLE owner — current bearers

この snapshot は現在のdispatchだけに使う。supervisor bearerは実務・成果物作成・独立検証・
subagentを担わない。非supervisory roleは下のexecutor行のbearerだけが担う(supervisorと同じOpus 5.5でも、
subagentとして別contextで動くopus-mediumはexecutor行に属する)。productionとverificationでは
authorとverifierを同じbearerにしない。outside observerはtechnical truthの根拠やverifierにならない。

| Slot | Current bearer | Allowed work | Dispatch constraint |
|---|---|---|---|
| supervisor / planning | Opus 5 | control plane only | executor、author、verifier、subagentへ配役しない。 |
| supervisor / planning | gpt-5.6-sol | control plane only | executor、author、verifier、subagentへ配役しない。 |
| delegated executor / verifier / outside observer | Sonnet 5.5 @ medium (`subagent_type:"sonnet-medium"`) | 端末操作や多段の道具の使用など、luna が苦手な作業の軽い側 | authorならverifierはgpt-5.6-terra。 |
| delegated executor / verifier / outside observer | Sonnet 5.5 @ high (`subagent_type:"sonnet-high"`) | 仕様が明確な実装、バグ修正、テスト、ターミナル作業、量産、independent verification、または外界観測 | authorならverifierはgpt-5.6-terra。outside observerはtechnical truthの根拠にしない。 |
| delegated executor / verifier / outside observer | Opus 5.5 @ medium (`subagent_type:"opus-medium"`) | 仕様が曖昧、複数リポジトリや大規模リファクタ、設計判断、事実の正確さ、Sonnet が同じ作業で詰まった | authorならverifierはgpt-5.6-terra。 |
| delegated executor / verifier / outside observer | gpt-5.6-terra @ high (`model:"gpt-5.6-terra", reasoning_effort:"high"`) | production、independent verification、または外界観測 | authorならverifierはSonnet 5.5。outside observerはtechnical truthの根拠にしない。 |
| delegated executor / verifier / outside observer | gpt-6.1-sol 以上 @ medium or high (`model:"gpt-6.1-sol", reasoning_effort:"medium" or "high"`) | production、independent verification、または外界観測 | authorならverifierはSonnet 5.5。outside observerはtechnical truthの根拠にしない。 |
| delegated executor / verifier / outside observer | gpt-6-luna @ any effort — Claude 側からは `agx dispatch`(既定 `luna-high`)、Codex 側は `model:"gpt-6-luna", reasoning_effort:<any>` | production、independent verification、または外界観測 | authorならverifierはSonnet 5.5。outside observerはtechnical truthの根拠にしない。 |

Claude 側の dispatch は `agents/models/dispatch-roster.toml`(2026-10-05、luna first)の表から1行を
選ぶ。理由の記述はいらない(ラジオボタン式)。各行の `enabled` がconfigのスイッチで、`false` の行は実装を残したまま表から外れ、hook が「disabled」として拒否する(2026-10-05 の config は luna のみ。Claude の行は off、`enabled = true` 一行で戻る)。luna の行は main の Bash から
`agx dispatch --prompt-file <brief> --cd <dir> --sandbox none|read-only|workspace-write`（none は network または ssh が必要な worker に明示指定）(並列なら背景で複数)、Claude の行は Agent ツールの
`subagent_type:"<id>"`。Workflow ツールは使わない。`enforce-dispatch-contract.ts` が、Workflow、
表にない `subagent_type`、luna の id を Agent に渡したものを拒否し、表を示す。
Codex側の`spawn_agent`も同様に`model`と`reasoning_effort`を必ず明示する(上の三系統のみ、
2026-09-27、`agents/codex/hooks/enforce-dispatch-contract.ts`が強制。世代の下限は`agents/hooks/model-floor.toml`が持つ(sol >= 6.1 など。新世代は編集なしで通る)。gpt-6.1-sol は 2026-10-03 に probe で PROBE_OK)。

## Availability gate — no silent fallback

binding は可用性の証明ではない。指定bearerが利用不能、指定が実効化できない、または独立性を
満たす相手bearerが利用不能なら、別bearerへ黙って代替しない。発射を止めてsupervisorの裁定へ戻す。

```yaml
requested_slot:
requested_bearer:
probe_date:
probe_result:
failure_or_constraint:
available_alternate:
cross_bearer_verification_possible:
supervisor_decision:
```

## Staleness triggers

次のいずれかで snapshot を stale とし、一次資料とcapability probeを再照合してから更新する。

- 上記bearerの利用可否、名称、model解決、またはdelegation surfaceが変わった。
- supervisor-only prohibition、二bearerのproduction/verification限定、またはcross-bearer ruleが変わった。
- availability gateがdispatch時に失敗した。

## Availability gate — 記録

### 2026-08-26 — gpt-5.6-terra が independent verifier として実効化できなかった

```yaml
requested_slot: independent verifier
requested_bearer: gpt-5.6-terra
probe_date: 2026-08-25
probe_result: |
  極小の probe(`codex exec -m gpt-5.6-terra --sandbox read-only 'Reply with exactly: PROBE_OK'`)は
  成功し PROBE_OK を返した。実務量の 3 batch はいずれも判定を一件も出さずに終了した。
  tokens used 62,433 / 49,605 / 77,273。
failure_or_constraint: |
  account の Codex quota 枯渇。CLI の逐語:
  "You've hit your usage limit. ... try again at Sep 24th, 2026 11:26 PM."
  transcript を `命題[0-9]` と `BLOCKING|MATERIAL|MINOR` で検索して 0 件を確認済み。
  **probe の成功は実務量の可用性を証明しない。**これが今回の教訓である。
available_alternate: |
  grok(xAI)は導入済みだが選ばなかった。2026-07 に repo 全体を xAI へ送出した事例があり
  server 側の緩和のみである。対象 repo が未公表の理論・覚書を含むため、
  送出範囲を限定できる保証が無い。
cross_bearer_verification_possible: false
supervisor_decision: |
  覆せる既定(暫定・追認待ち)。同一 bearer(Sonnet)の盲検監査で代替した。
  起草していない腕が読むという盲検性は得たが、模型の系統が違うことによる独立性は得ていない。
  この差を検収記録に明示した。
  戻し方: quota 回復後に同じ指示で gpt-5.6-terra を撃ち直す。
```

**probe の設計についての教訓。**可用性の probe は、実務量に比例した消費を伴う形で撃たなければ
意味を持たない。一往復の probe が通ることは、数万 token の検収が通ることを保証しない。
次に availability gate を書くときは、`probe_result` に「どれだけの量で確かめたか」を含める。
