# Model roster — authority and historical evidence

## Current dispatch authority

現在の worker roster の唯一の正本は agx roster (`agx worker roster --json`) である。
この参照には model 一覧、利用可否、固定配役、選択スコアを複製しない。

通常の dispatch は caller 所有の ticket を `agx worker run <ticket>` に渡し、
正本の roster と capability routing に選択を委ねる。
model 指定の例外は、今回の caller が明示的に要求した正確な model だけである。
この参照や過去の成功回数から手動で model・effort・verifier を固定しない。
役と独立検収の責任分界は [SKILL.md](../SKILL.md)、過去の配役と根拠は
[forge-verification-ledger.md](../tests/forge-verification-ledger.md) を参照する。
履歴は現行の選択規則に昇格させない。

## Historical availability incident

以下は 2026-08-26 当時の失敗、代替判断、再検証案の記録であり、
現在の model の利用可否、配役、fallback、再実行を指示するものではない。
保持する教訓は、一往復の probe 成功では実務量の可用性を証明できず、
検証した仕事量と独立性の限界を記録する必要がある、という点である。

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
  当時の再検証案: quota 回復後に同じ指示で gpt-5.6-terra を撃ち直す。
```

