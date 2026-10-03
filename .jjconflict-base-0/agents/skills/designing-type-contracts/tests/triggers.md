# Trigger and behavior cases

## Fire / no-fire — routing desk-check

| Request | Expected owner and result |
|---|---|
| 型を仕様として注文状態を設計したい | Here: predicates, selected variants, construction and transition checks. |
| Schema-firstかtype-firstか、このAPIの正本を決めたい | Here: consumers, authority, derivation, fidelity and deployment compatibility. |
| Parse, don't validateをこの境界に適用したい | Here: predicate-preserving parsed output and construction-path audit. |
| UserIdとOrderIdの混同を型で防ぎたい | Here plus language owner: distinct representation and intended rejection boundary. |
| typestateでDBから復元した注文の支払いを保証できるか | Here: hydration, authoritative state and freshness; runtime residuals stay explicit. |
| このenumなら不正な状態は作れないという主張を監査して | Here: exact predicate, construction paths, positive and forbidden cases. |
| TypeScriptでoptional propertyを書く構文は | Plain/language explanation; no contract procedure. |
| Fix this parser's known off-by-one | implementing-and-debugging; no modeling detour unless predicate is unclear. |
| この変数に既知の型注釈を足して | Language owner or direct edit. |
| TOML overrideの優先順位と署名対象を決めたい | governing-configuration-systems. |
| FCISとは何か説明して | Plain explanation. |
| Retry queueの永続化と容量上限をTigerレビューして | practicing-tiger-style. |
| 型は障害を何%減らすかsurveyして | systematizing-knowledge. |
| 振る舞いを変えずにmoduleを移動して | refactoring-code. |

## Behavioral exercises — prompts independent of expected observations

### A: transfer API

Request: “We use `transfer(from: UserId, to: UserId, amount: Money)`.
Can we promise the compiler catches argument reversal? Suggest a proportionate design.”

Expected observation: same-typed positions can swap; role wrappers or named fields are contextual choices.
Neither branded IDs nor named fields prove the caller chose the intended recipient.

### B: trusted snapshot

Request: “JSON decoding produces `AuthorizedOrder`; it stores a mutable list and a permission snapshot.
May internal functions skip every subsequent check?”

Expected observation: separate stable shape from mutable contents and expiring authority.
Trace aliases and decoding; identify a runtime use-point check without blanket revalidation.

### C: generated clients

Request: “Our schema generates Rust and TS clients; both build. May old mobile clients keep running
after the service removes a field? We only want a design review.”

Expected observation: inspect the independently deployed consumer contract and compatibility direction.
Produce planned cases; do not claim tests ran, install generators, or rewrite the source of truth.

### D: state and effects

Request: “A pure checkout function returns `PaidOrder` and `SendReceipt`.
The shell may crash after charging. What does the type prove?”

Expected observation: model the payment confirmation boundary and the crash window separately.
No claim that purity, `Result`, or state labels establish atomicity or exactly-once execution.
