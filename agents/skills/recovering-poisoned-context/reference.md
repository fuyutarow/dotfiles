# malformed tool-call の context 混入を防ぐ ベストプラクティス

> 本報告は、敵対的検証済み findings（全 verdict 付き）と gaps **のみ**を根拠とする。出典のない主張は書かない。検証で `partial` だったものは partial と明記する。

---

## 0. 結論（3行）

1. **本丸は P1（そもそも出力させない）と P2（出力されても history に入れない）であり、P3（入った後に除去）は事後対応にすぎない。** 「emission を防げば transcript に append されず、few-shot 手本にもならない」という因果は機構上自明で、検証でも各 P1 手法の核（source で断つ）は支持された。
2. **ただし検証された P1 手法はすべて `partial`**：(a) GBNF/Outlines/XGrammar/lm-format-enforcer/guidance は **logit アクセス前提＝self-host/open-weight 限定**でクローズド API のエージェント基盤では使えない、(b) lazy/trigger 文法では tool-call 開始前の地のテキスト区間が無防備で、まさに `<invoke>` 漏れの混入経路が残る、(c) 構文妥当性しか保証せず、alignment tax（分布歪曲による推論劣化）と経験的な保証破れ（フォールバックで unconstrained 復帰）がある。
3. **Claude Code 現状で実際に効くのは、Anthropic 側 strict tool-use API による server-side P1（ハーネスは「壊れた生テキストを受け取る機会自体がない」）。** ハーネス内で自前 P1 は不可（logit 不可視）。P2/P3 をハーネスで担えるかは本データセットに一次情報がなく **gap**（§5）。

---

## 1. 介入点フレーム（P1/P2/P3 と、なぜ P3 だけでは不十分か）

| 介入点 | 定義 | 「混入を本当に防ぐ」か |
|---|---|---|
| **P1 出力させない** | constrained/grammar-constrained decoding, FSM token masking, JSON schema/strict tool-use API, stop sequences。デコード段階で malformed トークン列を選べなくする。 | **本丸（source で断つ）。** 出力されない＝assistant turn として append されない＝手本にもならない。 |
| **P2 context に入れない** | 生成後にパース→malformed を検出し、history に append しない／strip／repair してから差し替え、poisoning せず retry、**エラーをそのまま echo しない**。 | **本丸（流入を堰き止める）。** 出力は起きるが transcript には残さない。 |
| **P3 入った後に除去/回復** | poisoned turn の prune/rewrite、compaction による要約除去、rewind、fresh context への退避。 | **事後対応。** 既に混入した後の損害限定であり、混入そのものは防げない。 |

**なぜ P3 だけでは不十分か**：self-poisoning は「壊れた出力が context に存在する時点」で発火しうる（手本化）。P3 は混入を検知してから除去するため、(1) 検知漏れがあれば残存、(2) 除去前の同一 context で次ターンが既に汚染を参照しうる、(3) 除去/rewrite 自体が新たな編集コストと整合性リスクを生む。**混入を「本当に」防ぐのは P1（emission を止める）と P2（append を止める）であり、P3 は最終防壁**。

---

## 2. P1: 出力させない（constrained/structured decoding, strict tool-use API）

各デコードステップで文法/スキーマ外トークンの logit をマスクし、malformed を「選べなく」する。**制約が効く区間に限れば真正の P1**だが、検証された 6 手法はいずれも `partial`（適用範囲・スコープの過大、副作用）。

| 手法 | 機構 | 適用 | 成熟度 | 検証結果（verdict） | 出典 |
|---|---|---|---|---|---|
| **Grammar-constrained decoding (GBNF / llama.cpp)** | GBNF(CFG) パーサが部分生成列から「次に許すトークン集合」を計算、違反トークンの logit を実質 -∞ にマスク。文法有効区間では崩れた `<invoke>`/stray token/JSON 崩れを出力「できない」。 | self-host (llama.cpp/vLLM)。これを叩く agent-framework | production | **partial** — 核（P1 で source 断ち）は妥当。だが (1) **lazy grammar**：`tool_choice=auto` 時はトリガ語（`[TOOL_CALLS]`/`<\|tool_call>` 等）まで自由テキストを許し、preamble で「トリガに近いが一致しない」崩れマーカーを吐くと文法が発火せず content に漏れる＝**主張する混入経路がまさに残る**。全 turn 被覆には forced/non-lazy(`required`) が必要。(2) 構文のみ保証、意味誤りは防げない。(3) 素朴な境界マスクは subword 不整合で分布歪曲（GSM8K Mistral-7B 41.5%→30.8%）。(4) **logit 前提＝open-weight 限定**、クローズド API 不可。 | [llama.cpp grammars README](https://github.com/ggerganov/llama.cpp/blob/master/grammars/README.md) / [arXiv 2403.06988](https://arxiv.org/html/2403.06988v1) / [arXiv 2502.05111](https://arxiv.org/pdf/2502.05111) / [DeepWiki](https://deepwiki.com/ggml-org/llama.cpp/7.3-grammar-and-structured-output) |
| **FSM/token-masking 構造化生成 (Outlines)** | schema→regex/CFG→FSM にコンパイル。各状態の有効遷移表で外れるトークンを -∞、O(1) 参照。「統計的にそれっぽい」でなく「数学的に有効パスのみ」。 | self-host / agent-framework (vLLM・SGLang・transformers 統合) | production | **partial** — 有効スコープ内では真に P1。だが「malformed=0／数学的保証」は過大：(1) **経験的に破れる**——JSONSchemaBench(arXiv:2501.10868) で Outlines は under-constrained failure 8件・compilation error 42件（OSS 中最多）、宣言/実測カバレッジ乖離（0.95 vs 0.36）。失敗時 unconstrained フォールバックで malformed 経路再開。(2) 引数 JSON だけ制約する部分適用ではラッパー/地のテキストは無防備。(3) 全面制約は推論を 10–30% 劣化（CRANE Prop 3.1：制約のみで TC⁰ 縮退）。実務は unconstrained 推論／constrained 出力を交互化し、その unconstrained 区間で emission 経路が再開。 | [Outlines](https://github.com/dottxt-ai/outlines) / [arXiv 2501.10868](https://arxiv.org/html/2501.10868v1) / [arXiv 2502.09061](https://arxiv.org/html/2502.09061v3) / [LMSYS compressed FSM](https://www.lmsys.org/blog/2024-02-05-compressed-fsm/) |
| **XGrammar（高速 CFG 実行エンジン）** | 語彙を context-independent/dependent に二分、永続スタック＋GPU オーバーラップで最大 100x 高速化・near-zero overhead。「遅いから制約を切る」抜け穴を消し常時 ON を現実化。 | self-host / agent-framework (MLC/vLLM/SGLang 統合) | production | **partial** — 制約 span 内の syntactic malformation を source で断つ核は妥当。だが (1) **論文(arXiv 2411.15100/MLSys2025) は速度と構造妥当性のみ立証、contamination/self-poisoning に一切言及なし**——「高速化で混入経路を恒常封鎖」は無出典の運用ナラティブ。(2) 構文 valid だが引数 hallucination の tool call は well-formed として mask 通過＝「構造的正しさ 100%」≠「混入なし」。(3) 文法は trigger 以降の tool-call span のみに適用し前段 reasoning/地のテキストは unconstrained＝`<invoke>` 漏れ経路を封じない。near-zero は TPOT の話で compile/cache 前処理・token 境界バグは残る。 | [arXiv 2411.15100](https://arxiv.org/abs/2411.15100) / [MLSys 2025](https://mlsys.org/virtual/2025/poster/3235) / [ACL2025 industry](https://aclanthology.org/2025.acl-industry.34.pdf) / [ToolDec arXiv 2310.07075](https://arxiv.org/html/2310.07075v3) |
| **lm-format-enforcer（文字レベルパーサ × tokenizer prefix tree）** | CharacterLevelParser の「次に許す文字集合」を TokenizerPrefixTree と集合積し、有効文字列に繋がるトークンのみ許可。空白/順序/任意性をモデルに委ね分布歪曲を最小化。README:「output will match the format」。 | self-host / agent-framework (transformers, llama.cpp, vLLM, LangChain, LlamaIndex, TensorRT-LLM 統合) | production | **partial** — README 一次情報で機構確認、制約 span 内の P1 は支持。だが (1) **logit/decode 介入前提＝self-host 限定**、クローズド API 不可。(2) 保証は「指した 1 span が一致」のみ。tool-call の境界判断（どこで始めるか）は決めず、引数 span だけ制約する一般用法では envelope/stray token が制約外で漏れる。(3) 歪曲最小化は設計目標で保証でない——同 README Diagnostics:「conform させると hallucination が増えうる」。(4) RegexParser は Python 正規表現を 100% カバーせず。 | [lm-format-enforcer README](https://github.com/noamgat/lm-format-enforcer/blob/main/README.md) / [vLLM structured output](https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html) |
| **guidance + token healing** | constrained decoding のマスクに加え、プロンプト末尾と生成開始の境界 tokenization artifact（部分/stray トークン）を 1+ トークン巻き戻して prefix 一致で除去。 | self-host (guidance ローカル経路) | production | **partial** — P1 段である点と、バンドルとしての guidance(grammar 制約) が構造的 malformed を防ぐ点は支持。だが **token healing 単体は別の崩れを直すだけ**：(1) healing が直すのは subword 境界の符号化バイアス（不可視な品質劣化）であって、`<invoke>` 漏れ/JSON 構造崩れとは**崩れの種類が違う**。(2) 構造正しさを生むのは grammar 制約であり、その功績を healing に付け替えるのは**誤帰属**（DOMINO arXiv:2403.06988 は healing 系を「制約の品質劣化対策」と位置づけ）。(3) healing 自体「valid prefix・invalid suffix の長トークンを誤受理しうる」既知の限界。 | [guidance token healing](https://guidance.readthedocs.io/en/latest/example_notebooks/tutorials/token_healing.html) / [arXiv 2403.06988](https://arxiv.org/html/2403.06988) |
| **OpenAI strict function calling / Structured Outputs (`strict:true`)** | サーバ側で schema を grammar にコンパイルし constrained decoding で毎トークン schema 違反確率を 0 に。gpt-4o-2024-08-06 で eval 100% 一致（学習のみ 93%→制約で 100%）。**API 境界の内側で起きるためクライアント/agent framework は「malformed tool call を受け取る機会自体がない」**＝壊れた生テキストが app の history に append される経路が存在しない。malformed 用 try/except 不要。 | **hosted-API (OpenAI)**。これを使う agent-framework/Claude Code 的ハーネス全般 | production | **verdict 未記載（提供データ切れ）。** 機構上は「API 境界内 P1」で、ハーネスが malformed を受け取らない＝混入経路を断つという主張は本データセットで唯一 hosted 経路の P1。**ただし strict は JSON Schema のサブセットのみ文法化**（`additionalProperties:false` 必須、`minimum`/`maxLength` 等は非対応で description に退避）＝サポート外制約に依存する tool では保証に穴（§6 gap）。 | [OpenAI Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/) / [Constrained decoding (Cooper)](https://www.aidancooper.co.uk/constrained-decoding/) |

**P1 横断の含意**：
- **クローズド API のエージェント基盤で自前 P1 はできない**（logit 不可視）。唯一の hosted P1 は**プロバイダ提供の strict tool-use API**（OpenAI strict / Anthropic 相当）であり、これは server-side で混入経路を断つ。
- **lazy/trigger 文法の前段（reasoning/preamble）は unconstrained**＝`<invoke>` 漏れ・stray token の混入はこの区間で起きうる。全 turn 被覆には forced grammar が要るが、エージェントが「呼ぶか否かを自分で決める」現実設定では保証は部分的 → **P2 併用が前提**。

---

## 3. P2: context に入れない（parse-then-decide, repair-before-append, error を echo しない）

> **データ上の制約（重要）**：本データセットの**検証済み findings は全て P1**であり、P2 を正面から検証した finding は提供されていない。以下は **gaps に記録された P2 関連の所見**であり、フル URL が gaps に付与されていない行は出典を「—（gaps 記載・URL 未確定）」とし、verdict は `gap`（要追検証）とする。捏造を避けるため、各機構は「主張」レベルで提示する。

| 手法 | 機構 | 混入防止の性質 | 検証結果 | 出典 |
|---|---|---|---|---|
| **隔離 repair（LangChain `OutputFixingParser` 系）** | パース失敗時、壊れた出力を**別経路で修復してから差し替え**、壊れた原文を history に残さない。 | **prevents（本データ範囲で P2 唯一の真の混入防止）** — 壊れた出力を文脈から完全に除く。 | **gap** — gaps が「本調査範囲（生成後 P2）で真の prevents はこれのみ」と記録。効果量（A/B で malformed/混入率が下がったか）の比較計測は未出典。 | —（gaps 記載・URL 未確定） |
| **保持＋中和（instructor / LangGraph / Pydantic AI / AutoGen / OpenAI Agents SDK / guardrails）** | パース失敗を検出し reask/validation するが、**壊れた出力を文脈から完全には除かない**（保持したまま中和）。 | **mitigate（防止ではない）** — 構造上、混入は残しつつ影響を抑えるのみ。 | **gap** — gaps が「これら全フレームワークは構造上すべて mitigate」と記録。完全な prevention は P1 依存と明記。 | —（gaps 記載・URL 未確定） |
| **reask 入力最小化（guardrails `FieldReAsk` 剪定）** | 次回 reask の**入力**を最小化（壊れたフィールドのみ再生成）。 | **P2（流入抑制）だが、既存 transcript の事後除去ではない** — P3 と混同しない点に注意。 | **gap** — gaps が明示的に「FieldReAsk は次回 reask の入力最小化＝P2 であって既存 transcript の事後除去ではない」と分類。 | —（gaps 記載・URL 未確定） |
| **壊れた JSON の error 変換 reask（OpenAI Agents SDK）** | tool 引数の壊れた JSON を error 結果に変換して安全に reask する想定。 | **未達（既知の穴）** | **gap/未解決** — Agents SDK は壊れた JSON を `ModelBehaviorError` で run 中断し `failure_error_function` でも救えない既知の穴（python #280/#2061・js #723/#664）。公式に「error 結果へ変換して安全 reask」する対応の着地点は issue 上で未解決。 | OpenAI Agents SDK issues: python #280/#2061・js #723/#664（gaps 記載・URL 未確定） |

**P2 の原則（MECE な処理分岐）**：生成後に必ず**パース→分岐**する。
1. **parse 成功** → そのまま append。
2. **parse 失敗** → ① 隔離 repair して**修復済みを差し替え append**（壊れた原文は残さない＝prevents）、または ② 壊れた原文を append せず **clean な error メッセージで reask**（poisoning しない）。
3. **禁止**：壊れた生出力やスタックトレース/バリデーションエラーを**そのまま echo して history に残す**こと（＝few-shot 手本化の最大要因）。

> **注意**：上表は本データセットの gaps を根拠とした暫定マップであり、P2 を正面から検証した一次研究・効果量は **§6 gap** の通り未充足。

---

## 4. P3: 入った後に除去/回復（prune/rewrite, compaction, rewind, fresh context）

> **データ上の制約（重要）**：gaps は明示的に「**角度2の対象フレームワークに poisoned turn を事後 prune/rewrite/compaction する P3 機構は確認できず、P3 は別角度の調査が必要**」と記録している。したがって以下のカテゴリは**課題フレームが想定する手段の列挙**であり、本データセットには裏付ける一次 finding が存在しない（全行 `未検証/要調査`）。

| 手法 | 想定機構 | 性質 | 検証結果 | 出典 |
|---|---|---|---|---|
| **poisoned turn の prune / rewrite** | 混入ターンを history から削除/書き換え。 | 事後（混入後の損害限定）。 | **未検証** — 本データに確認 finding なし。 | —（gap） |
| **compaction による要約除去** | history 要約時に malformed を落とす。 | 事後。要約が混入を確実に除く保証は未確認。 | **未検証** — 本データに確認 finding なし。 | —（gap） |
| **rewind** | 汚染前の状態へ巻き戻す。 | 事後。巻き戻し境界の選定が課題。 | **未検証** — 本データに確認 finding なし。 | —（gap） |
| **fresh context への退避** | 汚染 context を捨て新規 context で再開。 | 事後。最も確実だが状態継承コスト大。 | **未検証** — 本データに確認 finding なし。 | —（gap） |

**結論**：P3 は概念的に最終防壁だが、**本データセットでは一次情報による裏付けが皆無**。P3 を実運用機構として推奨するには別調査が必須（§6）。

---

## 5. Claude Code への当てはめ（ハーネスでできること/できないこと）

> **一次情報の境界**：本データセットには **Claude Code の hook 発火セマンティクスに関する一次情報が含まれていない**。以下は P1/P2/P3 フレームと提供 findings から導かれる**論理的含意**であり、hook の具体挙動に関する断定は **gap（要一次検証）**として明示する。

**できること（findings から確実に言えること）**
- **P1 はプロバイダ依存（server-side）**：Claude Code はクローズド API 上のハーネスであり、**ハーネス自身は logit にアクセスできない**＝GBNF/Outlines/XGrammar/lm-format-enforcer/guidance のような自前 constrained decoding は**原理的に使えない**（§2 横断含意）。混入を source で断つ P1 は、**Anthropic 側 strict tool-use API**（OpenAI strict と同型：API 境界内で schema をマスク）に委ねるのが唯一の経路。これが効けば、ハーネスは「malformed tool call を受け取る機会自体がない」（finding 6 と同型の論理）。
- **P1 の残余穴**：strict 系は JSON Schema のサブセットのみ文法化（§6 gap）。サポート外制約に依存する tool では server-side P1 に穴が残り、**P2 併用が前提**。

**できないこと／境界（論理的含意＋gap 明示）**
- **hook は P2 を担えるか？** — 課題フレームが提示する制約：
  - **`PreToolUse` は「構造化された tool call」が成立して初めて発火する**ため、**tool call が地のテキストに leak した（malformed で構造化されなかった）ケースでは発火しない**＝leak 経路を P2 として堰き止められない、という含意がある。
  - **`Stop` hook は生成完了後の検知**であり、検知＝事後（**P3 寄り**）。append を未然に止める P2 ではない。
- **上記 hook 挙動は本データセットに一次出典がなく、断定不可（gap）**。「hook が P2 を担えるか／PreToolUse が leak 時に発火しないか／Stop が P3 寄りか」は、Claude Code の一次ドキュメント/実装で別途検証する必要がある。
- **P3（`/compact`・rewind 等）**：概念的には Claude Code 側に対応機能が想定されるが、**§4 の通り本データに裏付け finding なし**＝推奨は保留。

**当てはめの結論**：Claude Code で「混入を本当に防ぐ」中心は **Anthropic strict tool-use API による server-side P1**。ハーネス内 P2（パース→非 append/repair）と P3（prune/compaction/rewind）の**具体的可否は本データでは未確定**であり、§6 の gap として残る。

---

## 6. 推奨スタック（多層防御の順序）と残る gaps

### 推奨スタック（現実的な多層防御）

```
混入リスクの高い順に「上流で断つ」を優先。各層は前層の取りこぼしを受ける前提。

┌─ P1a server-side strict tool-use API（Anthropic/OpenAI strict）  ← hosted の本丸・最優先
│     ・API 境界内でマスク → ハーネスは malformed を受け取らない
│     ・穴：JSON Schema サブセット限定（数値/長さ制約は description 退避）
│
├─ P1b self-host なら constrained/grammar decoding（GBNF/Outlines/XGrammar/LMFE）
│     ・open-weight 限定。tool-call envelope 全体を forced(非 lazy) grammar 下に置く
│     ・前段 reasoning が unconstrained な区間は P2 で受ける
│
├─ P2  parse-then-decide（必ず生成後パース）
│     ・成功→append / 失敗→隔離 repair で差し替え（壊れた原文を残さない＝prevents）
│     ・壊れた出力・スタックトレース・バリデーションエラーを echo しない
│     ・poisoning せず clean error で reask
│
└─ P3  最終防壁（prune/rewrite・compaction・rewind・fresh context）
      ・本データでは裏付け未確認。検知漏れ時の損害限定としてのみ位置づけ
```

**順序の根拠**：混入を「本当に」防ぐのは P1（source で断つ）と P2（流入を堰き止める）。P1 は適用範囲（logit/API 境界）とスコープ（制約 span のみ）で必ず穴が残る（§2 全 partial）ため、**P2 は常に必須**。P3 は P1+P2 を抜けた残余の事後回収。

### 残る gaps（未解決・要検証）

1. **中核命題の直接実証が欠落**：「constrained decoding → malformed が transcript に乗らない → few-shot self-poisoning（手本化→再生産）が抑止」の**因果リンクを正面から測定した一次研究が見つからない**。各ソースは emission 防止は保証するが、下流の self-poisoning 率低下を定量化していない。self-poisoning の発生率・閾値の実測が必要。
2. **alignment tax / 構造劣化の境界**：強制マスクが分布を歪め reasoning が劣化（baseline 50.0%→制約下 38.0%）し、**structure snowballing（一度崩れた構造が制約で固定化し伝播）**も報告。出典は 2026 年付 arXiv（2604.06066, 2604.03616, 2604.02155）で**追試・査読状況を確認しきれていない**。どの構造/モデルで副作用が許容範囲かの境界が未確定。
3. **lm-format-enforcer / token healing の効果量**：歪曲最小化・境界 stray token 除去の機構は一次資料で確認したが、**実際に malformed 率/混入率を下げた A/B 比較が未出典**。
4. **P1 で防げない残余 malformed**：地のテキスト中の `<invoke>` 様文字列、複数 tool call の区切り崩れ、ストリーミング途中切断——これらをエンジンが全て拘束できるかは**実装依存で取りこぼし率の一次データ不足**。P2 併用が必須となる境界が定量化できていない。
5. **strict 系の網羅性穴**：OpenAI/Anthropic strict は JSON Schema サブセットのみ文法化。**サポート外制約に依存する tool が実運用でどれだけ影響を受けるかの調査が見当たらない**。
6. **P2 の正面検証欠如**：本データの検証済み findings は全て P1。P2 は gaps 由来の暫定マップのみで、**LangChain OutputFixingParser 系（唯一の prevents）含め効果量と一次 URL が未充足**。instructor/LangGraph/Pydantic AI/AutoGen/OpenAI Agents SDK/guardrails は構造上すべて mitigate。
7. **P3 機構の不在**：対象フレームワークに poisoned turn を事後 prune/rewrite/compaction する明示的 P3 機構を**確認できず（別角度の調査が必要）**。
8. **OpenAI Agents SDK の未解決穴**：壊れた tool 引数 JSON を `ModelBehaviorError` で run 中断し `failure_error_function` でも救えない（python #280/#2061・js #723/#664）。error 結果へ変換し安全 reask する公式対応の着地点が未解決。
9. **Claude Code hook の一次検証**：§5 の hook 挙動（PreToolUse は leak 時に発火しない／Stop は P3 寄り検知／hook が P2 を担えるか）は**本データに一次出典がなく未確定**。Claude Code 一次ドキュメント/実装での検証が必要。

---

*作成物パス（本報告は文章として返却。ファイル不要）。根拠は提供済み findings（全 verdict `partial`、finding 6 のみ verdict 未記載＝データ切れ）と gaps のみ。*
