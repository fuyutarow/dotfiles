# writing-julia — fire / no-fire trigger set (F3 artifact)

Desk-check this table against the FULL skill collection (not just this description) after any
description edit. Added v2607.1.0 (type-discipline reforge); expanded v2607.1.1 (Effective Julia
near-miss guardrails); overhauled v2607.2.0 — architecture asks added to FIRES (they were in the
description but untested), no-fire set rebuilt as TRUE near-misses (the old set was far-language
asks — Rust/TS/C++ — which test nothing).

## FIRES

### Core (methodology / performance / types)

| Ask | Why |
|---|---|
| 「この Julia コード、勾配計算が遅い — 速くして」 | hot path + AD → §2.1 / autodiff.md (co-fire i&d if behavior changes) |
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

### Architecture (JG3 — added v2607.2.0; description triggers on these, so F3 must test them)

| Ask | Why |
|---|---|
| 「Julia パッケージの `include` の順番でエラーが出る / UndefVarError」 | §10.1 boss-file include order |
| 「struct A が B を参照して B も A を参照する — 循環依存どう解く?」 | §10.2 hoist abstract types to interfaces.jl |
| 「パッケージが大きくなってきた。submodule に分けるべき?」 | §10.3 subpackage/interface package, NOT submodules |
| "Plots のサポートを optional dependency にしたい / Requires.jl 使う?" | §10.4 `[weakdeps]` extensions, not Requires.jl |
| 「他人のパッケージの型に自分のメソッドを生やしていい?」 | §10.6 type piracy — NO; Aqua catches it |
| 「`export` と `public` どっち使う? API はどう見せる?」 | §10.5 public API |
| "MethodError: ambiguous — 曖昧性エラーの直し方" | §10.6.1 method ambiguity / `@which` tracing |
| 「パッケージ読み込みが遅くなった — invalidation って何?」 | §10 TTFX & invalidation hygiene |
| 「新しい Julia パッケージのディレクトリ構成、どうするのが正しい?」 | JG3 fires at package birth, not on request |

## MUST NOT FIRE (near-miss — same vocabulary, different owner)

| Ask | Route |
|---|---|
| 「この Julia プロジェクトの README を整理して」 | prose/document → `structuring-documents` / `linting-prose` (Julia is the topic, not the code) |
| 「Julia で書いたこの結果を Lean で形式化したい」 | → `proving-theorems` (the ask is the PROOF; this skill only if the Julia side also changes) |
| "uv で Python の数値実験環境を作って" | numerics vocabulary but Python tooling → `running-python-tools` |
| 「JuMP と Gurobi のライセンス形態は?」 | ecosystem question, no code to write — plain answer |
| 「Julia という言語の歴史と設計思想を教えて」 | encyclopedia ask, no code — plain answer |
| 「この Julia リポジトリを git subtree で分割したい」 | VCS surgery, not Julia structure — plain task (refactoring-code if code moves) |
| 「NumPy の column-major/row-major の違いは?」 | memory-order vocabulary but Python/NumPy — plain answer (fires here ONLY if a Julia port is in play) |
| 「行列積の計算量を説明して」 | math theory, no Julia code — plain answer |

## Co-fire order checks (not fire/no-fire — sequencing)

| Ask | Expected order |
|---|---|
| 「Julia のこのモジュールに機能を足して」 | `implementing-and-debugging` BUILD gate first → this skill for the Julia inside |
| 「この Julia パッケージ、リファクタして」 | `refactoring-code` (two hats / oracle / deny-gate) governs → this skill supplies JET/Aqua bracket + JG3 transforms |
| 「動かない Julia コードをデバッグして」 | `implementing-and-debugging` DEBUG gate first → this skill for Julia-specific diagnosis (`@code_warntype`, JET) |
