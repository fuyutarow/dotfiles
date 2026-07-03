# writing-julia — fire / no-fire trigger set (F3 artifact)

Desk-check this table against the FULL skill collection (not just this description) after any
description edit. Added v2607.1.0 with the type-discipline reforge; expanded v2607.1.1 with the
Effective Julia near-miss guardrails.

## FIRES

| Ask | Why |
|---|---|
| 「この Julia コード、勾配計算が遅い — 速くして」 | hot path + AD → §2.1 / autodiff.md |
| "Julia から .so って作れるの?" / "ship a Julia shared library" | §3.5.1 two-route map |
| "`juliac --trim` が verifier error で落ちる" | trim = dispatch-free surface + type-stable deps |
| 「この struct のフィールド型これでいい?」 (Julia code in play) | §2.1.2(b) non-concrete fields |
| 「Julia の let / const って JavaScript と同じ感じで使う?」 | setup.md §6 / performance.md §2.2 scope guard |
| "`Val(:fast)` にしたら Julia は速くなる?" | §2.1.4 Val guardrail |
| 「Julia の2重ループ、行と列どっちを内側にする?」 | §2.5 column-major loop order |
| 「この型、mutable struct にすべき?」 | §2.1.2 struct mutability rule |
| 「Julia では動的 dispatch 禁止を coding 規約にすべき?」 | §2.1.1 — the exact overcorrection this reforge encodes |
| "PackageCompiler で sysimage/ライブラリを作りたい" | §3.5 Layer 2 / §3.5.1 |
| "JET で type stability をチェックして" | §2.1.5 / §2.8 |
| "Julia で数値実験のスクリプトが増殖して管理できない" | §3.4 DrWatson lifecycle |

## MUST NOT FIRE (near-miss)

| Ask | Route |
|---|---|
| "Rust で .so を作って Python から呼びたい" | not Julia — plain task |
| "TypeScript の type エラーを直して" | not Julia (LINT_TS if anything) |
| "Python の型ヒントを追加して" | not Julia; Python tooling → running-python-tools |
| "C++ の virtual dispatch のコストは?" | not Julia — plain answer |
| "Lean でこの定理を形式化して" | proving-theorems |
| "JavaScript で dispatch table を実装したい" | not Julia — plain task |
