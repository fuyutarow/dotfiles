# Model roster — dated snapshot 2026-07-31

> **Snapshot verified**: 2026-07-31。model 名と現在のavailabilityはこの file の SOLE home。
> 役の恒久規則は `SKILL.md`、過去の配役と根拠は `../tests/forge-verification-ledger.md` が持つ。

## SOLE owner — current bearers

この snapshot は現在のdispatchだけに使う。supervisor bearerは実務・成果物作成・独立検証・
subagentを担わない。非supervisory roleは下の二bearerだけが担う。productionとverificationでは
authorとverifierを同じbearerにしない。outside observerはtechnical truthの根拠やverifierにならない。

| Slot | Current bearer | Allowed work | Dispatch constraint |
|---|---|---|---|
| supervisor / planning | Opus 5 | control plane only | executor、author、verifier、subagentへ配役しない。 |
| supervisor / planning | gpt-5.6-sol | control plane only | executor、author、verifier、subagentへ配役しない。 |
| delegated executor / verifier / outside observer | Sonnet 5 | production、independent verification、または外界観測 | authorならverifierはgpt-5.6-terra。outside observerはtechnical truthの根拠にしない。 |
| delegated executor / verifier / outside observer | gpt-5.6-terra | production、independent verification、または外界観測 | authorならverifierはSonnet 5。outside observerはtechnical truthの根拠にしない。 |

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
