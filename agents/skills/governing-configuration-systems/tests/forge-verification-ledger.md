# Distillation verification ledger

## 2026-10-30 — held edition decisions

The 26 numbered rows below refer to the frozen `triage-u26-wip-1030.md` hunks, not
individual rules. LIVE means a named current consumer makes the stated decision relevant;
it does not establish that the proposed rule has been exercised or improved outcomes. A hunk
with both labels has live and unproven parts. Paths are relative to the repository root.

| Row | Held decision | Usecase and disposition |
|---:|---|---|
| 1 | Route interpretation evolution | LIVE: semlint configuration selects `edition = 1` and refuses the old files, `README.md:145-148`; trigger added. |
| 2 | Selector, admission, migration and activation | LIVE: model-floor consumes `schema = 1` (`agents/hooks/model-floor.toml:27`) and denies schema 2 (`agents/hooks/tests/enforce-model-floor.test.ts:145-155`); semlint transition at `README.md:147-148`. Added bounded admission and change guidance. Mandatory first-edition selector and fixed legacy semantics are USECASE-UNPROVEN. |
| 3 | Interpretation admission and acceptance | LIVE: model-floor rejection above; target acceptance guidance added. Signed layers and rollback are USECASE-UNPROVEN. |
| 4 | Load a special reference for persisted changes | USECASE-UNPROVEN: no consumer establishes that a separate reference is needed; guidance stays in Decisions. |
| 5 | Separate interpretation from release comparator | LIVE: semlint edition and binary floor coexist at `README.md:145-148`; routing case added. |
| 6 | Reference index | USECASE-UNPROVEN: no demonstrated need for the separate reference. |
| 7 | Contract record edition distinct from target edition | USECASE-UNPROVEN: no live caller of this skill's contract record was found. |
| 8 | Template migration fields | USECASE-UNPROVEN: no live template consumer was found. |
| 9 | Full edition and migration reference | LIVE in part: model-floor admission and semlint selector above; distilled in Decisions. Layer normalization, signed selector, lossy conversion and rollback have no demonstrated consumer and are USECASE-UNPROVEN. |
| 10 | Checker record and target edition fields | USECASE-UNPROVEN: no live checker caller was found. |
| 11 | Checker record admission | USECASE-UNPROVEN: no live checker caller was found. |
| 12 | Reader matrix and receipts | LIVE in part: model-floor rejection test at `agents/hooks/tests/enforce-model-floor.test.ts:145-155`; actual consumer accepted/rejected paths retained. Tamper and rollback receipts are USECASE-UNPROVEN. |
| 13 | Checker evolution fields | USECASE-UNPROVEN: no live checker caller was found. |
| 14 | Checker edition-dependent fields | USECASE-UNPROVEN: no live checker caller was found. |
| 15 | Checker field set | USECASE-UNPROVEN: no live checker caller was found. |
| 16 | Checker record selector before payload | USECASE-UNPROVEN: no live checker caller was found. |
| 17 | Checker legacy and unsupported admission | USECASE-UNPROVEN: no live checker caller was found; model-floor evidence supports target admission, not this checker. |
| 18 | Checker edition 1 fields | USECASE-UNPROVEN: no live checker caller was found. |
| 19 | Checker disposition and none validation | USECASE-UNPROVEN: no live checker caller was found. |
| 20 | Checker positive test | USECASE-UNPROVEN: no live checker caller was found. |
| 21 | Checker boundary tests | USECASE-UNPROVEN: no live checker caller was found. |
| 22 | Checker record edition fixture | USECASE-UNPROVEN: no live checker caller was found. |
| 23 | Checker migration fixture | USECASE-UNPROVEN: no live checker caller was found. |
| 24 | Held evidence ledger | LIVE: this table records the semlint and model-floor consumers and bounded dispositions. |
| 25 | Failure corpus | USECASE-UNPROVEN: held examples are hypothetical; no matching recorded incident was established. |
| 26 | Edition trigger and release boundary | LIVE: `README.md:145-148` distinguishes semlint binary floor and configuration edition; desk cases added. |

Searches used `rr text` for `edition = 1`, `schema = 2`, `schema = `,
`semlint.toml`, `migration`, `configuration-contract-check`, and `contract-check.ts`.
No checker caller was shown; this is a bounded search result, not proof of absence, so the
deleted checker remains unrestored. The Bun pin transition at `mise.toml:13-15` and
`README.md:90-94` is a separate live migration, not evidence of an edition migration.
No independent reader evaluation or semantic migration execution was performed.

Frozen inputs: `ufp-triage-governing-configuration-systems-1030.md` and `usecase-triage-governing-configuration-systems-1030.md` in the 2026-10-30 clig-1030 scratchpad. Locators identify the frozen revision, not current line numbers. Each table row is counted separately; the frozen aggregate understates RESIDUE-KEEP. LIVE is caller evidence, not observed benefit.

| Frozen row | Statement | Class / usecase | Disposition |
|---|---|---|---|
| `SKILL.md:2-8` | 設定面・形式・署名・digest・gate等の網羅語で発火させる | RESIDUE-CUT | Removed |
| `SKILL.md:8-12` | consumer/trust、effective declaration、integrity contract は本スキルへ振り分ける | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `SKILL.md:12` | 英語スキルで利用者の言語に応答する | RESIDUE-CUT | Removed |
| `SKILL.md:29-30` | format選択前にconsumerとtrust regimeを名指す | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `SKILL.md:31` | 有効宣言・権威・表現・検証境界・verifierを示す | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `SKILL.md:33-34` | byte digestはbyte、semantic digestは名前付きprofileと制約データモデルに結び付ける | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `SKILL.md:36` | このスキルを configuration contract の唯一の所有者とする | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `SKILL.md:38-40` | authored source、generated artifact、signature、gate input、decision recordを区別する | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `SKILL.md:42` | repo layers と target parser はここで選ばない | RESIDUE-KEEP / live | Moved to wiring-repositories; routing in SKILL.md |
| `SKILL.md:44` | commentをapprovalにしない | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:46` | strict JSONはcanonical bytesを意味しない | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `SKILL.md:48` | JSON grammar単体はcanonical profileではない | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `SKILL.md:50` | JCSは名前付きJSON profileで、普遍的義務ではない | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:52` | TOMLの複数表記はparsed valueを曖昧にしない | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:54` | 根拠とskill独自規則はledgerに置く | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:57-65` | 各gateにdecisionとartifact/stop条件を対応させる | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:67` | contract templateから始める | UFP-DERIVED | Removed template; general contract design in base-usecase-first |
| `SKILL.md:69` | 解釈前にcontract checkerを実行する | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:71` | checkerはfield presenceとconditional obligationsを確認する | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:73` | semantic acceptanceはtarget validatorで確認する | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `SKILL.md:77-78` | workflowで各regimeを選び、同じsurfaceの複数regimeを考慮する | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:79` | format選択前にboundaryを決める | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `SKILL.md:80-82` | workflow中に参照文書を順番に読む | RESIDUE-CUT | Removed |
| `SKILL.md:83` | executable stateとattributable reasonを読者別に分ける | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `SKILL.md:84-86` | mechanical floor後、effective declarationを消費するtarget pathを走らせる | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `SKILL.md:92-98` | contract上の判断を一人で保持し、合意を検証結果とみなさない | UFP-DERIVED | Removed execution model; acceptance evidence in base-usecase-first |
| `SKILL.md:100` | 自動化がなければ同じ地図を逐次使う | RESIDUE-CUT | Removed |
| `SKILL.md:105` | type/parser/state invariantの問いは旧契約スキルと連携する | RESIDUE-KEEP / live | Moved to base-usecase-first; routing in SKILL.md |
| `SKILL.md:106` | CLI parserのflag追加は言語ownerへ渡す | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:107` | Claude hooks/permissions/MCPは宣言済み設定と実行checkを調べる | RESIDUE-KEEP / live | Moved to local configuration declarations; routing in SKILL.md |
| `SKILL.md:108` | repository layers/tasksは wiring-repositories へ渡す | RESIDUE-KEEP / live | Moved to wiring-repositories; routing in SKILL.md |
| `SKILL.md:109` | 言語manifest/parser APIは該当 writing skillへ渡す | RESIDUE-KEEP / live | Moved to writing-*; routing in SKILL.md |
| `SKILL.md:110` | SKILL作成は forging-skills へ渡す | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:111` | high-risk release boundsは practicing-tiger-style へ渡す | RESIDUE-KEEP / unproven | Removed |
| `SKILL.md:112` | 構文説明のみなら直接回答する | RESIDUE-CUT | Removed |
| `SKILL.md:116-124` | reference indexの読取り案内 | RESIDUE-CUT | Removed |
| `consumer-and-trust-regimes.md:3` | consumer classificationとregime selectionは本書の所有範囲 | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `consumer-and-trust-regimes.md:5` | format syntaxはtarget language/toolの所有 | RESIDUE-KEEP / live | Moved to writing-*; routing in SKILL.md |
| `consumer-and-trust-regimes.md:7-20` | surfaceに複数regimeがあり得る | RESIDUE-KEEP / unproven | Removed |
| `consumer-and-trust-regimes.md:10` | 人が編集するならformat/schema/comment policy/writerを名指す | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `consumer-and-trust-regimes.md:11` | generated outputならgenerator/input/regeneration/hand-edit ruleを名指す | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `consumer-and-trust-regimes.md:12` | signed raw bytesならencoding等を明示する | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `consumer-and-trust-regimes.md:13` | signed canonical valuesならprofile/admission/serializerを明示する | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `consumer-and-trust-regimes.md:14` | gated decisionならschema/authority/exceptions/verifierを名指す | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `consumer-and-trust-regimes.md:22` | regimesは成熟度順ではない | RESIDUE-CUT | Removed |
| `consumer-and-trust-regimes.md:24` | signed rendered artifactは複数regimeを合成し得る | RESIDUE-KEEP / unproven | Removed |
| `consumer-and-trust-regimes.md:30` | 実際のprecedence/parser behaviorはtarget docsまたはmeasured receiptで確認する | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `consumer-and-trust-regimes.md:32-37` | classifierで人編集・生成・integrity・exception・複数sourceを判定する | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `consumer-and-trust-regimes.md:34,36,38` | 「No」側で不要物を作らないという一般助言 | RESIDUE-CUT | Removed |
| `canonicalization-and-representation.md:3` | raw/canonical boundaryは本書の所有範囲 | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `canonicalization-and-representation.md:5` | schemaとverifierはtargetが所有する | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:10` | raw-byte integrityならencoding/line endings/BOM/scope/signer/verifierを指定する | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `canonicalization-and-representation.md:11` | canonical value integrityならgrammar/schema/duplicate/numeric/Unicode/profile/inputを指定する | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `canonicalization-and-representation.md:14` | serializerを名指さずparsed dataをcanonicalと呼ばない | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `canonicalization-and-representation.md:16` | 未検証dataをcanonicalizeしてaccepted policyと呼ばない | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:18` | digestだけでauthorizationやgate acceptanceを主張しない | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:20-22` | JSON whitespace/escape formsは異なり、member orderも観測可能な場合がある | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:24` | strict JSONはsemantic integrity profileとして不足 | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `canonicalization-and-representation.md:26` | JCS選択時にversionとinput constraintsを名指す | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:29-34` | JCS境界でduplicate reject、number/Unicode policy、object sort、array orderを定める | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:36` | JCSはsignature protocolやapplication schemaではない | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:38` | JWSは定義されたencoded inputに署名する | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:40` | signature acceptanceはapplication decision | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:44` | TOML v1.0.0 value mappingは一意 | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:46` | TOML source表記の違いはparsed valuesを曖昧にしない | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:48` | semantic TOML digestにはparse mappingとserializerが必要 | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:50` | TOML v1.0.0は本書のsemantic profileを提供しない | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:52` | TOMLをediting model/ecosystemがconsumerに合う場合に選ぶ | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:54` | JSON plus named profileはcanonical JSON bytesが必要な場合に限る | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:56-66` | profile selectionで各scenarioのrepresentation detailsを名指す | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:70-72` | X.509/DER analogyはspecified bytesの必要性に限る | RESIDUE-KEEP / unproven | Removed |
| `canonicalization-and-representation.md:74` | analogyからJCS/JSON configをX.509 certificateとしない | RESIDUE-CUT | Removed |
| `authority-events-and-lifecycle.md:3` | effective declarationとdecision recordの区別は本書の所有 | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `authority-events-and-lifecycle.md:5` | この参照はskill-supplied guidance | RESIDUE-KEEP / unproven | Removed |
| `authority-events-and-lifecycle.md:7` | JSON/TOML/JWS/JCSはevent sourcingを要求しない | RESIDUE-KEEP / unproven | Removed |
| `authority-events-and-lifecycle.md:9-21` | 実行状態、理由、例外の読者が違えばartifactを分ける | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `authority-events-and-lifecycle.md:23` | small human-authored configは説明commentを保てる | RESIDUE-KEEP / unproven | Removed |
| `authority-events-and-lifecycle.md:25` | commentがgateをoverride/authorizationを証明すれば境界を越える | RESIDUE-KEEP / unproven | Removed |
| `authority-events-and-lifecycle.md:27` | gated inputにはrecord locatorまたはnoneを指定する | RESIDUE-KEEP / unproven | Removed |
| `authority-events-and-lifecycle.md:29` | exception非対応targetではencoded locatorまたはnoneを指定する | RESIDUE-KEEP / unproven | Removed |
| `authority-events-and-lifecycle.md:31-44` | decision recordにauthority/change/rationale/scope/expiry/integrityを記録する | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `authority-events-and-lifecycle.md:46` | reviewed commit/signed record/append-only storeは契約を満たし得る | RESIDUE-KEEP / unproven | Removed |
| `authority-events-and-lifecycle.md:48` | target verifierは宣言したeffective inputを使用する | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `authority-events-and-lifecycle.md:52` | raw rollbackは保護byteを復元する | RESIDUE-KEEP / unproven | Removed |
| `authority-events-and-lifecycle.md:54` | canonical rollbackはaccepted artifact/profile/verifierを復元する | RESIDUE-KEEP / unproven | Removed |
| `authority-events-and-lifecycle.md:56` | rationale replay前にeffective stateを戻す | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:3` | contract fieldsとacceptance receiptsは本書の所有 | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:5` | target parser/schema/crypto verifierを本書は創作しない | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:9-10` | consumer/authority/writer/effective configuration/representationを記録する | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `verification-and-profiles.md:11` | trust regime/signature inputを区別する | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `verification-and-profiles.md:12` | canonical profileにalgorithm/versionを記録する | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:13` | schema/duplicate/number-Unicode policyを記録する | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:14-15` | precedence/mergeとdecision/exception recordを記録する | UFP-DERIVED | Moved to designing-command-line-interfaces (sourcing) and base-usecase-first (records); effective input in SKILL.md, Decisions |
| `verification-and-profiles.md:16` | verifier commandとpositive/negative casesを記録する | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `verification-and-profiles.md:20` | checkerを contract pathに対して実行する | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:22` | checkerはabsent fieldsとunknown regimesをrejectする | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:24` | checkerはraw/canonical/gated conditional fieldsを検査する | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:26-28` | gated inputsはrecord/noneとencoded/noneを使う | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:30` | checkerはsignature/schema/merge behaviorを検証できない | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:32` | representation choicesはcanonicalization referenceに属する | RESIDUE-KEEP / unproven | Removed |
| `verification-and-profiles.md:34-45` | acceptance receiptにcontract digest、validator、profile/schema、positive/negative evidence、residualを含める | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `verification-and-profiles.md:47` | signature boundaryではprotected bytesとsigner/key trust evidenceを含める | RESIDUE-KEEP / live | Kept: SKILL.md, Decisions |
| `verification-and-profiles.md:49` | layered configではresolved output等のprecedence observableを出す | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `verification-and-profiles.md:51` | validatorはauthored sourceでなくnamed effective declarationを消費する | UFP-DERIVED | Partly kept where applicable: SKILL.md, Decisions; general rule in base-usecase-first |
| `verification-and-profiles.md:53` | green contract floorだけではacceptance receiptにならない | RESIDUE-KEEP / unproven | Removed |

The package no longer prescribes the unproven contract checker, template or profile-specific examples. CLI sourcing defaults are owned by designing-command-line-interfaces. The prior source position was bounded; this rewrite has not been tested with independent readers under an attention budget.
