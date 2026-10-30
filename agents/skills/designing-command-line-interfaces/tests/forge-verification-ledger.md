# Distillation ledger — 2026-10-30

The frozen UFP triage's 93 actual statement rows are numbered in source order; the 30 RESIDUE-KEEP rows use the separate usecase triage's actual row count. A kept row denotes its decision, not every former mandatory table or procedure. Former routes for CLI interaction and diagnostics are integrated here. Configuration integrity and authority remain in governing-configuration-systems by explicit brief. The historical record below describes the previous edition and is not current instruction.

| Row | Frozen class | Statement | Former locator | Disposition |
|---|---|---|---|---|
| 1 | RESIDUE-KEEP | CLI 設計・監査を本スキルへ振り分ける。 | SKILL.md:3-8 | Kept, integrated: SKILL.md §Contract |
| 2 | RESIDUE-KEEP | 一契約を invocation・effects・channels・outcomes・evolution に統合する。 | SKILL.md:7-8,46-51 | Kept, integrated: SKILL.md §Contract |
| 3 | RESIDUE-KEEP | Interaction/reversibility を designing-interactions へ送る。 | SKILL.md:8-9,59 | Kept, integrated: SKILL.md §Contract |
| 4 | RESIDUE-KEEP | 単一診断カードを designing-developer-diagnostics へ送る。 | SKILL.md:9,61,85,98 | Kept, integrated: SKILL.md §Contract |
| 5 | RESIDUE-KEEP | Config authority を governing-configuration-systems へ送る。 | SKILL.md:10,87,99 | Removed as a triage requirement; explicit brief retains authority boundary in SKILL.md §Contract |
| 6 | RESIDUE-KEEP | Version semantics を designing-version-schemes へ送る。 | SKILL.md:10,62,86 | Removed (USECASE-UNPROVEN) |
| 7 | RESIDUE-KEEP | Implementation を repo instructions / writing-* へ送る。 | SKILL.md:11,91,100 | Moved: writing-bun-scripts; implementation boundary in SKILL.md §Scope |
| 8 | RESIDUE-KEEP | Existing CLI usage を driving-* へ送る。 | SKILL.md:11,84 | Removed (USECASE-UNPROVEN) |
| 9 | RESIDUE-KEEP | Launch/distribution を growing-oss-adoption へ送る。 | SKILL.md:11,88 | Removed (USECASE-UNPROVEN) |
| 10 | RESIDUE-CUT | 英語 skill でもユーザー言語で回答する。 | SKILL.md:12-13,36-38 | Removed |
| 11 | RESIDUE-CUT | Stable token 一覧を固定する。 | SKILL.md:40-42 | Removed |
| 12 | UFP-DERIVED | 実装前に消費者を明示する。 | SKILL.md:46-47 | Kept: SKILL.md §Contract |
| 13 | UFP-DERIVED | invocation/effects/channels/outcomes/evolution の整合を取る。 | SKILL.md:47-48 | Kept: SKILL.md §Contract |
| 14 | UFP-DERIVED | 名前だけから flag/format/exit semantics を推測しない。 | SKILL.md:47-48 | Kept: SKILL.md §Contract |
| 15 | RESIDUE-KEEP | 契約全体を本skill一つの所有物とする。 | SKILL.md:50-51 | Removed (USECASE-UNPROVEN) |
| 16 | RESIDUE-CUT | C0 gate を設け、user のみなら停止する。 | SKILL.md:55-57 | Removed |
| 17 | RESIDUE-CUT | C1 gate で文法・profile・順序等を表にする。 | SKILL.md:58 | Removed |
| 18 | RESIDUE-CUT | C2 gate で effects/recovery table を要求する。 | SKILL.md:59 | Removed |
| 19 | RESIDUE-CUT | C3 gate で channel/mode matrix と liveness rows を要求する。 | SKILL.md:60 | Removed |
| 20 | UFP-DERIVED | Fallback/未観測効果を plain success と報告しない。 | SKILL.md:61 | Kept: SKILL.md §Contract |
| 21 | RESIDUE-CUT | C4 gate で outcome matrix を要求する。 | SKILL.md:61 | Removed |
| 22 | UFP-DERIVED | C5 で互換性の約束と証拠を明示する。 | SKILL.md:62 | Kept: SKILL.md §Contract |
| 23 | RESIDUE-CUT | C0を先に埋めtemplateから開始する。 | SKILL.md:66 | Removed |
| 24 | UFP-DERIVED | C1–C5 を一契約として埋める。 | SKILL.md:67 | Kept: SKILL.md §Contract |
| 25 | RESIDUE-CUT | 各gateのreferenceを読む。 | SKILL.md:67 | Removed |
| 26 | UFP-DERIVED | Parser/profile/format/exit/dry-run/precedence を普遍化しない。 | SKILL.md:68 | Kept: SKILL.md §Contract |
| 27 | RESIDUE-KEEP | 構造 checker を実行し意味証明と扱わない。 | SKILL.md:69 | Removed (USECASE-UNPROVEN) |
| 28 | RESIDUE-KEEP | Accepted/rejected transcript を保持する。 | SKILL.md:70 | Removed (USECASE-UNPROVEN) |
| 29 | RESIDUE-KEEP | Signer が receipt と frozen contract を照合する。 | SKILL.md:71 | Removed (USECASE-UNPROVEN) |
| 30 | RESIDUE-CUT | 読取 inventory/probe を FAN-OUT できる。 | SKILL.md:75-76 | Removed |
| 31 | RESIDUE-CUT | C0–C5 tradeoff と最終受入を SOLO にする。 | SKILL.md:76 | Removed |
| 32 | RESIDUE-CUT | 独立 transcript probe を FAN-OUT できる。 | SKILL.md:76-77 | Removed |
| 33 | RESIDUE-KEEP | Relay に locus または command/output/exit を付ける。 | SKILL.md:77-78 | Removed (USECASE-UNPROVEN) |
| 34 | RESIDUE-CUT | Harness がなければ同じmapをserialで行う。 | SKILL.md:78 | Removed |
| 35 | RESIDUE-KEEP | One-shot CLI、文面修正、version選択、config署名、launchを別skillへ送る。 | SKILL.md:84-88 | Removed (USECASE-UNPROVEN) |
| 36 | RESIDUE-CUT | One-shot pipeline は shell を直接使う。 | SKILL.md:89 | Removed |
| 37 | RESIDUE-KEEP | Unix philosophy の設計論を practicing-unix-philosophy へ送り、protocol は戻す。 | SKILL.md:90 | Moved: base-usecase-first §3; CLI protocol kept in SKILL.md §Contract |
| 38 | RESIDUE-KEEP | Destructive CLI は interactions を先行させる。 | SKILL.md:97 | Removed (USECASE-UNPROVEN) |
| 39 | RESIDUE-KEEP | Known diagnostic は outcome map の後に diagnostics を呼ぶ。 | SKILL.md:98 | Kept, integrated: SKILL.md §Contract |
| 40 | RESIDUE-KEEP | Config precedence は config governance を先行させる。 | SKILL.md:99 | Removed (USECASE-UNPROVEN) |
| 41 | RESIDUE-KEEP | Unsettled interface は本skill後に実装 owner へ送る。 | SKILL.md:100 | Moved: writing-bun-scripts; implementation boundary in SKILL.md §Scope |
| 42 | RESIDUE-CUT | Reference index の「読む時」を規範とする。 | SKILL.md:104-113 | Removed |
| 43 | RESIDUE-CUT | Machine output を framed payload only とする。 | references/channels-and-outcomes.md:7-9 | Removed |
| 44 | RESIDUE-CUT | Machine mode に encoding/framing/schema/compatibility を追加する。 | references/channels-and-outcomes.md:9,13 | Removed |
| 45 | UFP-DERIVED | JSON を普遍的要件にしない。 | references/channels-and-outcomes.md:15 | Kept: SKILL.md §Contract |
| 46 | UFP-DERIVED | Recovery が違う時だけ outcome class を作る。 | references/channels-and-outcomes.md:19 | Kept: SKILL.md §Contract |
| 47 | RESIDUE-CUT | 各 outcome row に exit/status/output/retry/action を対応させる。 | references/channels-and-outcomes.md:21 | Removed |
| 48 | UFP-DERIVED | Exit numbers を製品固有とし、宣言標準時だけ固定する。 | references/channels-and-outcomes.md:23 | Kept: SKILL.md §Contract |
| 49 | RESIDUE-KEEP | Cause を diagnostic/envelope へ置き、単一診断カードは別skillへ送る。 | references/channels-and-outcomes.md:25-27 | Kept, integrated: SKILL.md §Contract |
| 50 | RESIDUE-KEEP | Wait/fallback/handoff の liveness rule を置く。 | references/channels-and-outcomes.md:31-32,36-39 | Kept, integrated: SKILL.md §Contract |
| 51 | RESIDUE-KEEP | 外部waitをboundし、遅延後にstderrとelapsed timeを出す。 | references/channels-and-outcomes.md:36 | Kept, integrated: SKILL.md §Contract |
| 52 | RESIDUE-KEEP | Fallback を明示するか拒否し、理由/override を示す。 | references/channels-and-outcomes.md:37 | Kept, integrated: SKILL.md §Contract |
| 53 | UFP-DERIVED | Dependency exit で成功を証明できなければ handed-off/unknown とする。 | references/channels-and-outcomes.md:38 | Kept: SKILL.md §Contract |
| 54 | RESIDUE-KEEP | Normal-path warning threshold を通常変動より上にする。 | references/channels-and-outcomes.md:39 | Kept, integrated: SKILL.md §Contract |
| 55 | RESIDUE-CUT | Response-time windows を別skill §5 が所有するとする。 | references/channels-and-outcomes.md:41 | Removed |
| 56 | RESIDUE-CUT | Silence は documented fast default path に限る。 | references/channels-and-outcomes.md:42 | Removed |
| 57 | RESIDUE-CUT | Bun progress/spinners/prompts は writing-bun-scripts の方法に従う。 | references/channels-and-outcomes.md:43-44 | Removed |
| 58 | RESIDUE-CUT | Machine payload framing を維持し liveness はstderrか省略。 | references/channels-and-outcomes.md:45 | Removed |
| 59 | RESIDUE-KEEP | smart-open local corpus を liveness evidence とする。 | references/channels-and-outcomes.md:47 | Kept, integrated: SKILL.md §Contract |
| 60 | CLIG-SUPPORTED | stdout/stderr/exit を別 observable channel として扱う。 | references/channels-and-outcomes.md:49 | Kept: SKILL.md §Conditional defaults |
| 61 | CLIG-SUPPORTED | Stable machine route と framing/configuration dimensions を扱う。 | references/channels-and-outcomes.md:51 | Kept: SKILL.md §Conditional defaults |
| 62 | CLIG-SUPPORTED | Noninteractive/TTY-gated presentation を扱う。 | references/channels-and-outcomes.md:53 | Kept: SKILL.md §Conditional defaults |
| 63 | CLIG-SUPPORTED | Recovery outcomes と detailed diagnosis を分ける。 | references/channels-and-outcomes.md:55 | Kept: SKILL.md §Conditional defaults |
| 64 | RESIDUE-CUT | Effects を safety flags より先に書く。 | references/effects-and-recovery.md:3 | Removed |
| 65 | UFP-DERIVED | Relevant effects/partial state を列挙する。 | references/effects-and-recovery.md:5 | Kept: SKILL.md §Contract |
| 66 | UFP-DERIVED | Preview では抑制効果と予測忠実度を示す。 | references/effects-and-recovery.md:9 | Kept: SKILL.md §Contract |
| 67 | UFP-DERIVED | Force が bypass する保護と acknowledgement を示す。 | references/effects-and-recovery.md:10 | Kept: SKILL.md §Contract |
| 68 | UFP-DERIVED | Multi-item command の継続・集約・item reporting を示す。 | references/effects-and-recovery.md:11 | Kept: SKILL.md §Contract |
| 69 | UFP-DERIVED | Partial state の保持/cleanup/inspection/replay 前提を示す。 | references/effects-and-recovery.md:12 | Kept: SKILL.md §Contract |
| 70 | UFP-DERIVED | Wait/interruption の cancellation/cleanup/retry 条件を示す。 | references/effects-and-recovery.md:13 | Kept: SKILL.md §Contract |
| 71 | UFP-DERIVED | `dry-run`/`force` 名だけで安全性を推測しない。 | references/effects-and-recovery.md:15 | Kept: SKILL.md §Contract |
| 72 | UFP-DERIVED | Atomicity/idempotence claims need command-specific preconditions. | references/effects-and-recovery.md:17 | Kept: SKILL.md §Contract |
| 73 | RESIDUE-KEEP | Reversibility/interlocks を interactions へ送る。 | references/effects-and-recovery.md:19 | Kept, integrated: SKILL.md §Contract |
| 74 | RESIDUE-CUT | Reference が observable effects/recovery のみを扱うと宣言する。 | references/effects-and-recovery.md:21 | Removed |
| 75 | RESIDUE-CUT | Compatibility table で各 surface の promise を列挙する。 | references/evolution-and-verification.md:5 | Removed |
| 76 | UFP-DERIVED | Promise を stable/extensible/deprecated/absent に区別する。 | references/evolution-and-verification.md:7 | Kept: SKILL.md §Contract |
| 77 | UFP-DERIVED | Parsed machine route の versioning/unknown-field behavior を明示する。 | references/evolution-and-verification.md:9 | Kept: SKILL.md §Contract |
| 78 | RESIDUE-KEEP | Release identifier semantics を version-schemes へ送る。 | references/evolution-and-verification.md:11 | Removed (USECASE-UNPROVEN) |
| 79 | UFP-DERIVED | Positive receipt に exact input/output/exit/contract row を保持する。 | references/evolution-and-verification.md:17 | Kept: SKILL.md §Contract |
| 80 | UFP-DERIVED | Negative receipt に rejected input/output/exit/expected class を保持する。 | references/evolution-and-verification.md:18 | Kept: SKILL.md §Contract |
| 81 | RESIDUE-KEEP | Inventory relay に local locus を保持する。 | references/evolution-and-verification.md:19 | Removed (USECASE-UNPROVEN) |
| 82 | RESIDUE-KEEP | Structural checker の宣言範囲だけを認める。 | references/evolution-and-verification.md:21-23 | Removed (USECASE-UNPROVEN) |
| 83 | UFP-DERIVED | Final acceptance で named receipt と frozen contract を比較する。 | references/evolution-and-verification.md:25 | Kept: SKILL.md §Contract |
| 84 | RESIDUE-CUT | Authority policy を先に取得し CLI override surface を続けて指定する。 | references/evolution-and-verification.md:31-33 | Removed |
| 85 | UFP-DERIVED | Consumer regime ごとに help/TTY/input/result/recovery を契約化する。 | references/invocation-and-discovery.md:5-11 | Kept: SKILL.md §Contract |
| 86 | UFP-DERIVED | Generic “users” だけの契約を reject する。 | references/invocation-and-discovery.md:13 | Kept: SKILL.md §Contract |
| 87 | UFP-DERIVED | Parser profile/ecosystem を明示する。 | references/invocation-and-discovery.md:19 | Kept: SKILL.md §Contract |
| 88 | UFP-DERIVED | Order/repetition/abbreviation/`--` ambiguity cases を記録する。 | references/invocation-and-discovery.md:20 | Kept: SKILL.md §Contract |
| 89 | UFP-DERIVED | stdin semantics を admission 条件込みで定める。 | references/invocation-and-discovery.md:21 | Kept: SKILL.md §Contract |
| 90 | CLIG-SUPPORTED | Help と example で valid syntax を発見可能にする。 | references/invocation-and-discovery.md:22 | Kept: SKILL.md §Conditional defaults |
| 91 | CLIG-SUPPORTED | GNU conventions を POSIX portability に昇格しない。 | references/invocation-and-discovery.md:24 | Kept: SKILL.md §Conditional defaults |
| 92 | CLIG-SUPPORTED | `--` は declared parser profile が支持するときだけ使う。 | references/invocation-and-discovery.md:26 | Kept: SKILL.md §Conditional defaults |
| 93 | UFP-DERIVED | Long spelling だけで prefix abbreviations の安定性を約束しない。 | references/invocation-and-discovery.md:28 | Kept: SKILL.md §Contract |

## Live sibling rows

These rows preserve the CLI-relevant part; a live usecase does not prove every original procedural detail.

| Row | Decision | Disposition |
|---|---|---|
| Interactions 15. SKILL.md:117-127 | タスクごとに非対話経路、機械可読結果、失敗信号を記録し空欄を問題とする | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Interactions 23. SKILL.md:149-154 | CLI詳細契約をdelegability検査と区別し、コマンド用probeを実行する | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Interactions 24. SKILL.md:164-168 | 可逆ならundoを提供し、confirmationを省く | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Interactions 25. SKILL.md:167 | 実費用のある不可逆操作には型を特定したgateを置く | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Interactions 26. SKILL.md:168 | undoとconfirmationを同時に要求しない | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Interactions 29. SKILL.md:189-202 | 見た目・文章・図表・性能・構造変更・実装・OSS採用・文書構造の依頼を担当先へ送る | Moved: forging-skills |
| Interactions 30. SKILL.md:204-206 | name/descriptionを変えた後だけfire/no-fire例を再実行する | Moved: forging-skills |
| Interactions 65. references/delegability.md:30-44 | 成功時の未要求出力は抑え、待機・fallback・失敗は報告する | Kept: SKILL.md §Contract and §Conditional defaults |
| Interactions 67. references/delegability.md:90-97 | CLIの文法・出力channel・終了状態・互換性判断を別所有者へ渡す | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Interactions 70. references/delegability.md:122-133 | promptで止まるsubprocessを非対話化し、効果不明ならdry-runを提供する | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Interactions 74. references/reversibility.md:51-61 | undo機構を操作形状と費用に応じ選び、後付け費用を考える | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Diagnostics T-01 SKILL.md:4-6 | CLI・設定検証・compiler・build・tool の開発者診断を対象にする | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Diagnostics T-02 SKILL.md:7-8 | 開発者が失敗を見分け、次の行動を選ぶ場面で使う | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Diagnostics T-07 SKILL.md:44-45 | 一失敗クラスごとの診断カードを唯一の設計・検証成果物とする | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Diagnostics T-10 SKILL.md:55 | 回復モード exact/conditional/investigate/none を選ぶ | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Diagnostics T-13 SKILL.md:59 | 診断 card から始める | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Diagnostics T-14 SKILL.md:64 | D1時に diagnostic-design.md を読む | Kept in CLI diagnostic mode: SKILL.md §Contract and assets/diagnostic-card.md |
| Diagnostics T-24 SKILL.md:90 | silence/false success/wrong target は CLI C3/C4 先行 | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Diagnostics T-25 diagnostic-design.md:5-6 | 一失敗クラス一 card とする | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Diagnostics T-29 diagnostic-design.md:18 | 手動確認だけで case のない receipt を認めない | Kept for CLI: SKILL.md §Contract; general or procedural details remain outside CLI scope |
| Diagnostics T-38 diagnostic-design.md:57 | floor を先に実行する | Kept for CLI diagnostic mode: SKILL.md §Contract and scripts/diagnostic-card-check.ts |
| Diagnostics T-39 diagnostic-design.md:57 | floor checks fields and recovery consistency | Kept for CLI diagnostic mode: SKILL.md §Contract and scripts/diagnostic-card-check.ts |

## CLIG gaps

| Gap | Source | Disposition |
|---|---|---|
| help の具体的慣例 | G5.2 [help](https://clig.dev/#help) | SKILL.md §Conditional defaults |
| 引数と flag の具体的既定 | G5.6 [arguments](https://clig.dev/#arguments-and-flags) | SKILL.md §Conditional defaults |
| 非対話の具体的手段 | G5.7 [interactivity](https://clig.dev/#interactivity) | SKILL.md §Conditional defaults |
| 出力の装飾と quiet | G5.4 [output](https://clig.dev/#output) | SKILL.md §Conditional defaults |
| subcommand の一貫性 | G5.8 [subcommands](https://clig.dev/#subcommands) | SKILL.md §Conditional defaults |
| signal の具体動作 | G5.11 [signals](https://clig.dev/#signals) | SKILL.md §Conditional defaults |
| docs の提供面 | G5.3 [documentation](https://clig.dev/#documentation) | SKILL.md §Conditional defaults |

## Historical record (through 2026-10-05; superseded)

# Forge verification ledger — designing-command-line-interfaces

## 0. Function and placement

```text
proposed or observed command surface + named consumers
  -- design | audit --> CLI CONTRACT
  --> implementation-ready interface + positive/negative receipts
```

STOP: one act's meaning, hidden state, reversibility, or delegability → `designing-interactions`.
STOP: one failure's message/locus/recovery card → `designing-developer-diagnostics`.
STOP: effective declaration, authority, integrity, or precedence policy →
`governing-configuration-systems`.
STOP: release identifier comparator/range semantics → `designing-version-schemes`.
STOP: implementation or language runtime choice → `implementing-and-debugging` / `writing-*`.
STOP: using an existing vendor CLI → `driving-*`; launch/distribution → `growing-oss-adoption`.

This is the reusable command-wide protocol joint: invocation grammar, effects, channels, outcomes,
and compatibility in one contract. No sibling owns that complete artifact.

## 1. Source-grade table

The source position is draft `sok/command_line_interface_contracts`, request SHA-256
`d55ad832ab3f2ebdadb25e425d9dfa4e42115a8be29b66b3b92faee5e63a405c`. Its canonical SoK commit is
**PENDING**. Do not represent these rows as a committed corpus authority until it is admitted and committed.

| Rule / use | SoK grade | Skill disposition |
|---|---|---|
| Declare parser profile; reject universal grammar. | CLI-001, limited synthesis | C1 requires target ecosystem/profile. |
| Name `--`, synopsis, and parse-error behavior only in stated POSIX scope. | CLI-002, supported scope | C1 records parser-specific cases. |
| Treat help/version/discovery as profile guidance, not a universal requirement. | CLI-003, qualified | C1 records help/examples only when promised. |
| Allocate stdout, stderr, and exit as distinct observable channels. | CLI-004, limited synthesis | C3–C4 matrix is mandatory. |
| Separate mutable human presentation from stable machine routes. | CLI-005, limited synthesis | C3/C5 records route-specific promises. |
| Require framing, presentation/config independence, and compatibility beyond format name. | CLI-006, limited synthesis | Machine mode requires framing and compatibility. |
| Give prompt/dynamic presentation a noninteractive/TTY-gated path. | CLI-007, qualified | C0/C3 records supported regime behavior. |
| Keep recovery-oriented diagnostics distinct from normal result output. | CLI-008, qualified | C4 maps caller recovery; one card routes to diagnostics. |
| Classify outcomes only when recovery differs; keep numbers product-specific. | CLI-009, limited synthesis | C4 table names retry/next action. |
| State continuation and final aggregation for multi-item work. | CLI-010, limited synthesis | C2 names both behaviors. |
| Do not infer safety from `dry-run`/`force` names. | CLI-011, supported | C2 names fidelity, target protection, acknowledgement. |
| Separate retained partial state, replay precondition, and cleanup bound. | CLI-012, limited synthesis | C2 recovery table names each applicable dimension. |
| Treat subcommands, arguments, flags, overrides, and machine routes as possible compatibility surfaces. | CLI-013, qualified | C5 compatibility table and receipts. |
| Do not invent universal flag/environment/file/remote precedence. | CLI-014, unresolved | Route authority policy to configuration systems first. |
| Require one contract, headings, fields, tables, and red/green checker behavior. | skill-supplied | Structural checker; explicitly not semantic proof. |
| Use SOLO decisions and CITATION-RELAY inventory/receipt evidence. | skill-supplied | Execution model; relays carry locus or raw transcript. |

## 2. Calibration inversion

| Source-side error | Agent-side error | Corrective |
|---|---|---|
| Treating one product convention as a complete protocol. | Copying flags, `--json`, or exit numbers without consumers/effects. | C0–C5 force named contract fields and product-specific limits. |
| Under-specifying an automation route. | Treating a format label as a stable machine contract. | Require framing and compatibility only when a machine mode is promised. |
| Assuming a safety flag supplies safety. | Calling `dry-run`/`force` sufficient analysis. | Write effects, fidelity, bypass, partial state, and retry first. |

## 3. P0 and acceptance status

**P0 semantic battery: PENDING.** At dotfiles HEAD `369ce65a42166dd58702cc92aec2d4fca82fdc96`, the prior
semantic router returned `NO_INDEX` against watermark `f3b4881edee101fa52fe7662641addace38e10c0`.
A fresh index is queued. Ownership placement is a signed draft decision only; no final placement claim may ship until the battery is adjudicated.

Live installation is provisional under the user's immediate-completion direction; acceptance and commit still require the current semantic battery.

**Canonical SoK commit: PENDING.** The source position has not yet been admitted and committed. The
draft retains source IDs and bounded claims solely for forge traceability.

## 4. Verification record

| Check | Receipt |
|---|---|
| Contract behavior | `bun test tests/cli-contract-check.test.ts`: 13 pass, 0 fail, 31 expectations; exit 0. |
| Valid fixture | `bun scripts/cli-contract-check.ts tests/fixtures/valid-contract.md`: exit 0; `C0 PASS`; `CLI CONTRACT: FAIL=0`. |
| Proof of fire | Red tests observe exit 1 for missing C1–C5, visible `{{...}}` table placeholders, non-meaningful fields, and machine mode without framing/compatibility. |
| Script floor | `bun /home/fuyu/dotfiles/agents/skills/writing-bun-scripts/scripts/script-check.ts scripts/cli-contract-check.ts`: exit 0; `FAIL=0 WARN=0`. |
| Skill floor | `bun /home/fuyu/dotfiles/agents/skills/forging-skills/scripts/skill-check.ts .`: exit 0 with no prose-debt warnings. |
| Trigger desk-check | Seven fire and seven no-fire rows are recorded in `tests/triggers.md`; independent adjudication remains pending. |

## 5. Maintenance triggers

- P0 returns ownership evidence or a sibling changes a typed cut.
- The draft source position changes status, is rejected, or receives a canonical commit.
- A command incident exposes an unnamed invocation, effect, channel, outcome, or compatibility boundary.
- The checker accepts a missing/duplicate/placeholder field, an unknown regime, empty table, missing negative receipt, or machine mode without framing/compatibility.

## 2026-10-05 — v2610.1.0: liveness and outcome honesty (smart-open retro)

**F1 failure.** On r99 over ssh/herdr, smart-open sat silent 15 s on `explorer.exe` and then exited 0
(locked desktop). It fell back silently to the remote's unattended screen. `oo` sat about 2 s silent
while merely slow. The statusline marked `stale 12s` on nearly every render. The owner's retro asked
whether the skills were defective, unread, or misapplied. All three applied: the skill was not
loaded; the agent misapplied facts it had read; and the skill had no wait, fallback, or
untrusted-status rule. Its description also lacked symptom words, so a silence report could not
select it.

**F2 placement.** These rules extend C3/C4 in this skill. They do not justify a new skill.
`references/channels-and-outcomes.md` §Liveness and outcome honesty is the one home. The
response-time windows stay with `designing-interactions` `reversibility.md` §5 and are referenced
from there. The contract template and checker now require `Waits / liveness` and
`Fallbacks / handoffs`; an explicit `none` passes. Four smart-open rows were added to the local
failure corpus. Description: symptom vocabulary added, Workflow-native clause shortened (net within
the listing ceiling: collection 56,054 of 56,059).

**F3 receipts (2026-10-05).**

| Check | Result |
|---|---|
| Checker tests | `bun test tests`: 15 pass, 0 fail (new: missing liveness field, placeholder vs explicit `none` fallback) |
| Valid fixture | `CLI CONTRACT: FAIL=0` |
| Script floor | `script-check.ts scripts/cli-contract-check.ts`: FAIL=0 WARN=0 |
| Skill floor + listing budget | `skill-check.ts`: no WARN for this skill; collection 56,054 ≤ 56,059 |
| Blind selection, independent | 4 sonnet-high evaluators, desk routing over a frozen 7-skill listing; old (A) and new (B) unlabeled, 2 runs each, 10 asks. A scored 8/10 and 6/10, B scored 8/10 and 8/10. On the three retro asks (silent wait, false success, silent fallback), A routed here 3/6 times and B 6/6. Every evaluator in both arms routed “CLI hangs in CI on a prompt” here; that row is now a declared co-fire with `designing-interactions` U3. |
| Blind audit benefit, independent | 4 sonnet-high audits of pre-retro `smart-open.ts` (`1fa9fd5`), 2 per arm. Both arms found the silent fallback and the silent waits. Only B named `explorer.exe` always-success and the missing duration explicitly in both runs; A reached them partially. The benefit is modest and mostly in selection. |

**Limits.** These are desk routing judgments, not live host selection. All evaluators were one model
family, N=2 per arm. The audit target came from the incident itself, so it favours rules derived
from that incident.

