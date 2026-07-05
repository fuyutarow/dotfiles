# リファクタリング理論 SoK — 一般論の体系化

> **ジャンル**: Systematization of Knowledge（体系化サーベイ）。目的は「N冊がこう言う」の要約では
> なく、**分野が何を知っているかについての一つの擁護可能な立場**を、claim ledger と moderator と
> GRADE に紐付けて提示すること。
> **成果物の位置づけ**: `refactoring-code` skill の蒸留元（provenance corpus）。skill の各 gate は
> 本 doc の claim/debate に trace する。
> **手法**: 10 source-class の並列 harvest（Fowler 2e / catalog / smells / Beck *Tidy First?* /
> Feathers *WELC* / Opdyke+実証SE / large-scale patterns / rewrite-vs-refactor / TDD+Simple Design+
> Clean Code / LLM-agent lens）＋ 8 debate の adversarial 和解（moderator を必ず特定）＋ completeness
> critic。19 agent・約 691k tokens・101 tool use（risky attribution は web 検証済み）。
> **言語**: 日本語。ただし技術トークン（moderator, GRADE, two hats, oracle, connascence, 各 refactoring
> 名, characterization test 等）は標準識別子として英語のまま固定。

---

## 0. Research Question（目標規定文）

> **「リファクタリングという営みについて、分野は何を確実に知っており（不変条件・機械化された規律）、
> どこが未解決の賭け（rewrite 判断・経済性の実証）で、そしてそれが *テキストを編集する LLM coding
> agent* にとってどう操作規則に翻訳されるか。」**

単一の問いに絞る。カタログの網羅は目的ではない。**立場＋その根拠**が成果物。

**Genre-fit gate**: リフ ァクタリングは *established major area*（Opdyke 1992 の学位論文で命名、
Fowler 1999/2018 で正典化、20 年以上の蓄積、実在する対立＝rewrite 論争・test 前提論争・function
サイズ論争）。よって SoK が正しいジャンル（nascent なら position paper、狭い単問なら targeted SLR に
落とすところだが、そうではない）。

---

## 1. 中心命題（One defensible position）

分野の全体像は、**4 つの直交する問い**に分解でき、各問いに対する答えは *規律として確立している層* と
*経済的賭けとして未解決の層* に分かれる。

| 問い | 分野の答え（確立層） | 未解決／賭けの層 |
|---|---|---|
| **WHAT**（何を、どの方向に変換するか） | smell が trigger、変換は named catalog、方向は coupling↓/cohesion↑。過剰も smell（Speculative Generality / Middle Man） | どの smell を*先に*直すか（優先順位）は定量化が新しい（hotspot = churn×complexity） |
| **HOW-VERIFIED**（振る舞い保存をどう保証するか） | **oracle 無き変換は refactoring ではない**。oracle は3種＝engine の precondition / test suite / 小さければ人間の目 | tool 自身が behavior-changing bug を出す／test suite が偶然 green（mutation testing で検証）という二次問題 |
| **HOW-BIG**（大規模変更をどう統合するか） | 常時 green の小刻み commit on trunk（Strangler / Branch by Abstraction / Parallel Change / Mikado）が既定。long-lived branch が第一の risk object | cohabitation 不能な真の global invariant flip のみ big-bang が正当 |
| **WHETHER/WHEN**（そもそも/いつやるか） | two hats（構造変更と振る舞い変更を1 commit に混ぜない）、preparatory refactoring、Rule of Three | 「良い設計は速くする」（Design Stamina）と Beck の DCF/optionality は *仮説*。実証は薄い（GRADE **Low**） |

**最重要の統合命題（この分野の核）**:

> リファクタリングの定義的不変条件は **behavior preservation**。これは分析的真理（analytic）であって
> 経験的主張ではない。だが「保存されているか」を*機械的に検出できる arbiter*（precondition-checked
> engine か、ずれたら fail する oracle）が無ければ、その保存は folklore であって invariant ではない。
> 実証 SE（Murphy-Hill / Kim / Silva / Bavota）が「現実の refactoring は振る舞いを変える」と繰り返し
> 見出すのは定義への反証ではない — *定義の precondition を満たさない episode* を測っているだけ。
> **両者は矛盾せず、oracle の有無で分割（partition）される。**

この「oracle で分割する」視点が、分野の見かけ上の矛盾（§3 の debate のほとんど）を解消する鍵。

**二つ目の核（目的の極）**:

> リファクタリングは安全（振る舞い保存）を満たすだけの営みではない。その *目的* は **責務分界（各責務が
> 唯一の家を持つ）と局所化（起こりうる変更が一箇所に留まる）** という良いアーキテクチャの追求である
> （§2.4）。したがって **どの named architecture property も改善しない構造編集は refactoring ではなく
> 場当たり churn であり、禁止される**（§3.5 の deny-gate）。二つの失敗の極は同型 — *黙って振る舞いを
> 変える*（安全の counterfeit）と *動機なき churn*（設計の counterfeit）。前者は D7、後者は D9 が罰する。
> そして「良い設計を追う」ことと YAGNI は競合しない: 分界は *今 present な smell* に駆動される時だけ
> mandatory で、*想像上の未来* のための層は投機として却下される（同一の checkable cut）。

---

## 2. Taxonomy — refactoring の操作的分類

### 2.1 変換の共通形（あらゆる catalog refactoring が共有する shape）

Fowler catalog（Extract/Inline Function・Rename＝Change Function Declaration・Move・Encapsulate・
Replace Conditional with Polymorphism・Introduce Parameter Object・Replace Primitive with Object・
Decompose/Consolidate Conditional・Replace Nested Conditional with Guard Clauses・Remove Flag
Argument・Pull Up/Push Down 等 ~20）と Beck の tidyings（guard clauses・dead code・explaining
variable・cohesion order・reading order 等 ~15）は、**個々の名前より共通形が本質**:

1. **tiny・可逆・named** — 各ステップは名前のある変換で、compile+test が通り、独立に revert 可能。
2. **paired** — Extract⇄Inline のように対で、過剰抽出（over-extraction）自体が smell。
3. **precondition を持つ**（Opdyke）— 参照完全性・名前衝突・data flow・side-effect 順序が満たされて
   初めて振る舞い保存が保証される。IDE はこれを静的に検査する。**agent はテキスト編集なので検査され
   ない → 手で precondition を確認せねばならない。**

### 2.2 smell = coupling か cohesion の失敗

Fowler/Beck の ~24 smell（Duplicated Code・Long Function・Feature Envy・Shotgun Surgery・Divergent
Change・Data Clumps・Primitive Obsession・Repeated Switches・Message Chains・Middle Man・
Speculative Generality・Large Class・Comments-as-deodorant 等）は、深層では **過剰 coupling** か **欠落
cohesion** に還元される。決定的なのは:

- **Divergent Change（1箇所が多理由で変わる＝cohesion 欠落）と Shotgun Surgery（1変更が多箇所に散る＝
  過剰 coupling）は反対の失敗で、修正は反対方向に押す。** smell 名を1つの refactoring に短絡させると、
  逆問題を悪化させる。まず coupling か cohesion かを判定してから変換を選ぶ。
- **connascence**（Page-Jones: Name→Type→Meaning→Position→Algorithm、static vs dynamic）が「感触で
  coupled」を置き換える定量語彙。弱い/局所的な connascence を選ぶ（positional args→named object、
  magic value→named constant）。

### 2.3 extraction の判定 = module DEPTH（size ではない）

function サイズ論争（Clean Code「extract till you drop」 vs Ousterhout『A Philosophy of Software
Design』）の moderator は **module depth**＝隠す実装複雑度 / 露出する interface 複雑度。「名前＋signature
を見れば本体を読み飛ばせるか？」が唯一の判定。深い抽出は Clean Code 側が正しく、浅い抽出（単一
caller・本体を読まねば正しく使えない）は readability 批判側が正しく inline すべき。**行数で extract
してはならない。**

### 2.4 責務分界（responsibility demarcation）と局所化（change locality）— 良いアーキテクチャの *checkable* な定義

> 第2サーベイ（7 agent, Parnas 1972 逐語）。分野の *積極的目的* を、感触ではなく検証可能な述語に落とす。
> これは skill の脊椎 G3 の根拠。coupling/cohesion（§2.2）はこの層の一実装。

**A. Parnas（情報隠蔽・1972 CACM、逐語）— 局所化の falsifiable な定義**。分解は処理ステップ（flowchart）
でなく **変わりやすい設計決定（secret）を隠す**単位で行う。責務分界＝各 volatile decision（format /
representation / algorithm / ordering / calling convention）を *ちょうど1つのモジュール*に割り当てること。
局所化の **checkable signal**: 予期される変更 c について `|c が触るモジュール数| = 1`。Parnas はこれを
標語でなく判別式として実演 — flowchart 分解は storage-format 変更が「全モジュールを直撃（changes in
every module!）」、情報隠蔽分解は「1モジュールに封じ込め（confined to that module!）」。**良い構造は直交
する2軸**: (A) secret ごとに唯一の家＋安定面だけの interface（変更局所性）、(B) loop-free・後方参照のみの
uses-DAG（依存局所性）。両者は独立（片方だけ良い設計はあり得る）。データ構造は accessor/mutator と1つの
モジュールに束ねる（field access を callers に撒くのが anti-pattern）。**柔軟性は意図的・最小限**に —
過度な一般化も過度な露出も Parnas 自身が *design error* と呼ぶ（＝これが Parnas 版 YAGNI）。

**B. Constantine（Structured Design）— cohesion の one-sentence test**。モジュールを一文で説明し、その
*文法* から凝集度を読む（worst→best）: 説明に「and（無関係）」→ coincidental/logical、「〜の間に
（init/shutdown）」→ temporal、「まず〜次に」→ procedural、同じデータに触るだけ → communicational、
「Xの出力がYへ」→ sequential、**連結詞なしの単一動作（「請求額を計算する」）→ functional**（目標）。
anti-signal＝名前が `and / then / init/setup/cleanup / utils/misc/manager/helper` を含む。coupling は
edge を跨ぐ *もの* で読む（worst→best）: 他モジュール内部に手を伸ばす content → 可変 global 共有 common
→ 外部 format/device external → 挙動を操る flag を渡す **control** → record 丸ごと渡す stamp →
必要な scalar だけ渡す **data** → message。**法則: モジュール内 cohesion 最大化・モジュール間 coupling
最小化**。両者は相関するので **cohesion を先に上げる**（1つのことをするモジュールは入力が細る＝coupling
も自動的に下がる）。

**C. Martin — SRP-actor と CCP、そして structuring-documents との同型**。SRP は「1つのことをする」（審美的・
検証不能）ではなく **「変わる理由は1つ＝1 actor に責任を負う」**（検証可能: 各 method の actor を名指し
distinct actor を数える）。CCP（Common Closure）＝ **「同じ理由・同じ時に変わるクラスを1コンポーネントに
集める」＝ change-locality そのもの**（検証可能: 代表的変更を辿り touch するコンポーネント数を数える。
高 fan-out ＝局所化不良＝merge、別理由で共置＝分界不良＝split）。ADP＝no-cycle DAG。**この体系は本 repo の
`structuring-documents`（MECE「every fact one home」・single-source-of-truth・後方参照のみの DAG・
「散在→1 locus に局所化」）のコード版**。同じ 認識体系 を文書とコードに適用したもの。境界が曖昧なら
「max separation」より **"Fits In My Head"**（reader が全体を保持できる方）を選ぶ。

**D. DDD / Conway / vertical-slice — 統一テスト「次に来る変更は何箇所を触り、それらは寄っているか」**。
bounded context（1語が2意味を持てば境界欠落＝2モデル＋ACL）、aggregate（原子的 invariant が単位を決める）、
Conway（境界はチーム通信境界を写す）、vertical-slice / package-by-feature（層別 controller/service/
repository は1機能を全層に散らす＝anti-locality、feature-folder は寄せる＝locality）、Locality of
Behaviour > DRY（衝突時は「ここだけ読めば分かる」を優先し小さな重複を許容）。**全ソース共通の唯一の
agent テスト**: *「最も来そうな次の変更で、別々の何箇所を編集し、それらは寄っているか。少なく・寄って
いる＝良い分界/局所化。多く・散在＝各層が綺麗でも悪い」*。

**E. connascence の locality rule（Page-Jones / Weirich）**: 強い connascence（Position / Algorithm /
Value / Identity / Timing）は *局所*（同一 function/class）に留め、弱い connascence（Name / Type）だけ
がモジュール境界を跨いでよい。refactor が局所化を改善したと言えるのは、強い遠隔 connascence を弱め
（Rule of Degree）たか1つの家に引き込んだ（Rule of Locality）と名指せる時だけ。

---

## 3. Reconciliation engine — 8 つの live debate を moderator で和解

> SoK の核心。各対立は「N 人がこう言う」で片付けず、*どちらが正しいかを決める変数（moderator）* を
> 特定し、regime-aware に解き、flip 条件と GRADE を付す。★ は agent への操作規則。

| # | Debate | Moderator（決定変数） | 和解（regime） | Flip 条件 | GRADE |
|---|---|---|---|---|---|
| D1 | refactor に test は必須か | **保存保証の provenance × blast radius**。oracle は engine の precondition / test / 人間の目 の3種、人間 oracle は変換規模で信頼性が急落 | Regime1 tool-verified atomic（Rename/Extract via 正しい engine）→ test は任意の多重防御。Regime2 manual & local（1画面に収まる）→ 目で足りる。Regime3 manual & non-local or reflection/serialization/DI/public-API/concurrency 交差 → **Feathers 絶対、characterization test 先**。Regime0 目的が testability 確保 → 循環なので最小 seam move | tool が静的証明できない coupling を跨ぐ／manual で非局所／同 commit で振る舞いを変える瞬間に「test 必須」へ。**agent は tool を実際に呼ばぬ限り常に Regime2/3、Regime1 になれない → 既定は厳しい枝** | Moderate |
| D2 | tidy first / after / never | **planning horizon 内の coupled payback**＝(tidy と当該編集の結合) ×(近く再び触る確率) ×(理解度) | coupled かつ理解済みかつ変更が生き残る → **first**（Beck の in-the-money option）。理解が低い/spike/critical path 外 → **after**（変更が本当の構造を教えてから別 commit で）。再訪 ~0 or 保留中変更と decoupled → **never**（big-bang rewrite は論外） | 理解低下 or spike 化で first→after。再訪頻度 ~0 で both→never。hot code で never→first。tidy が rewrite に育ったら常に never | Low |
| D3 | rewrite vs incremental | **target architecture の到達可能性**＝behavior-preserving 小刻みステップで現状から目標へ連続経路が在るか＋embedded knowledge が capturable か | 到達可能なら Spolsky「never rewrite」が既定で勝つ（Strangler + characterization + 「make the change easy」が strictly dominate）。到達不能（死語/runtime 死・data-model 不連続）**かつ** 特性化不能 **かつ** 埋め込み知識が cruft の3条件全部で初めて rewrite。それでも facade 越し strangler、big-bang にはしない | 3条件のうち1つでも崩れれば incremental。rewrite でも小規模でない限り big-bang→strangler | Moderate |
| D4 | 「refactor mercilessly」vs YAGNI | **変更の motive-direction（present-grounded vs future-speculative）、volume ではない** | 直交する2軸。今触る code の摩擦返済（behavior-preserving・test 有）→ mercilessly、ただし当該変更の surface 内。将来要件のための generality（現 caller ゼロ）→ YAGNI で N=1 で「too much」。**Rule of Three が両 regime の境界標**（1–2 は証拠でない・inline、3で抽出） | present 重複が Rule-of-Three 閾値を越えたら YAGNI→抽出必須。merciless が変更 surface を超える/safety net 無しなら「stop」。throwaway/spike では present 軸でも負 EV | Moderate |
| D5 | tiny functions dogma vs readability | **module DEPTH**（隠す実装/露出 interface、Ousterhout） | 深い抽出（名前が本体を代替・重複除去・test seam・leak 隠蔽）→ extract 勝ち。浅い抽出（単一 caller・本体を読まねば使えない・abstraction が leak）→ inline 勝ち。size は depth の症状であって原因でない | interface 複雑度が実装複雑度に迫る/超えたら extract→inline。短い block でも重複/独立 test seam/名前で読み飛ばせるなら inline→extract | Moderate |
| D6 | DRY vs AHA/WET | **変化の真の軸が既知か**＝knowledge-duplication（1事実1 owner・lockstep で変わる）か coincidental（似て見えるが独立進化） | 証明された knowledge 重複（business rule・invariant・protocol 定数）→ DRY で即座に統合。軸が未知（caller 少・divergence 履歴短・見た目だけ似）→ AHA で重複を残す（wrong abstraction の exit cost は非対称）。Rule of Three が「どちらか」を見る sampling 手続き | 統合後に新 caller が flag/branch を要求→coincidental だった、inline し戻す。放置した copy が lockstep 修正を要求→knowledge だった、今抽出。safety-critical（crypto/tax/auth/wire）は3未満でも DRY へ | Moderate |
| D7 | 現実の refactoring は behavior-preserving か | **execution-and-bracket regime**＝(1) precondition-checked engine による catalogued 変換か (2) ずれたら fail する oracle（test/type/characterization）が固定 surface を覆うか | 両方成立 → 保存は verified invariant（実証反例は届かない）。manual multi-hunk / floss / oracle 無き legacy → 「保存」は aspiration で drift が起きる。定義は field data に反証されない（precondition 未達 episode を測っているだけ）。**信頼性の源は label でも intent でもなく mechanical arbiter** | どちらの arbiter も欠けたら behavior-changing 扱いで feature 同様に gate。reflection/dynamic dispatch/serialization/public-API は tool の precondition すら壊す | High |
| D8 | big-bang vs 常時-green 小刻み | **cohabitation feasibility × integration horizon**＝old/new が seam 越しに併存できるか × trunk 変化率に対しどれだけ長く未統合か | 既定は常時-green（seam + Parallel Change で大半の「atomic」変更は cohabitation 可能＝format は dual-write/read、type は adapter shim、schema は expand→migrate→contract）。big-bang は cohabitation 真に不能 **かつ** horizon 短い時のみ | 安定 seam が作れる or 変更が長く未統合のまま trunk が動くなら常時-green へ。team size は cost 曲線の傾きを決めるだけで決定変数ではない | Moderate |
| **D9** | **良いアーキテクチャの追求 vs YAGNI**（責務分界・局所化 を追うことは反・投機的一般化と矛盾するか） | **motive-direction × 分界軸の provenance**＝その分界が押し戻す coupling/cohesion の失敗は *今触るコードに present な変更軸* か *まだ現れぬ future の変更軸* か。二次変数: present 側の実 occurrence 数（Rule of Three）・生まれる interface の depth・oracle bracket の有無。**volume（行数・抽象数・「綺麗さ」）では断じてない** | 矛盾しない。直交2軸の別投影。**Regime A（MANDATORY/merciless）**: present に named smell が実在（Shotgun Surgery / Divergent Change / Feature Envy / lockstep 要求の knowledge-dup）× occurrence ≥3 × behavior-preserving で oracle bracket → Parnas/Martin が勝ち、掃除しないことが負債（ただし *当該変更の surface 内*）。**Regime B（YAGNI STOP）**: 現 caller ゼロ / N=1 / 浅い interface（depth 不合格）→ Fowler/Beck/Metz/Ousterhout が勝ち inline して待つ。**Regime C**: safety-critical（crypto/tax/auth/wire）は3未満でも局所化へ | B→A: 放置 dup が lockstep 修正を要求 or 3度目到達で future 軸が present 軸に転じる。A→B: 抽出後に新 caller が flag/branch を要求（coincidental だった→inline 戻す）or surface 超過 or oracle 欠如。A→STOP: 同一 diff で振る舞いも変える（two hats 違反）or edit surface が検証能力超過。throwaway/spike は present でも掃除は負 EV | Moderate |

### 3.5 D9 の harsh test — 場当たりを機械的に弾く2つの gate（skill G3 の核）

分野の *積極的目的*（責務分界・局所化）を追いつつ、その **counterfeit（場当たり churn）を厳罰**する
checkable な関門。二つは同一 gate の別表現:

- **3スロット MANDATORY test**（触る前に一文で言い切れ）: 「この分界が押し戻す **present の named smell**
  は ___（Shotgun Surgery/Divergent Change/Feature Envy/lockstep 要求の knowledge-dup のいずれか実在）、
  それを要求する **実 occurrence** は今 ___ 箇所（**≥3** or safety-critical）、この編集は behavior-
  preserving で **oracle** は ___（green test/engine precondition/characterization）が bracket する」。
  3スロット全部埋まる → merciless（surface 内）。**1つでも「将来 ___ かも」「綺麗になる」「N=1 だが良い
  設計」で埋まる or depth test（名前+signature で本体を読み飛ばせるか）に落ちる → 場当たり/投機 → YAGNI
  STOP、inline して3度目を待て。**
- **two-line DENY-GATE**（触る前に2行を emit、両方 concrete でなければ Edit しない）:
  1. **MOTIVE 行** — `smell removed: <named>` ∨ `imminent change enabled: <具体変更>` ∨ `Rule-of-Three:
     <3つ目の重複を指す>`。
  2. **PROPERTY-DELTA 行** — 次の少なくとも1つ: `cohesion raised: <module> <level>→<level>` ∨
     `coupling lowered: <edge> <level>→<level>` ∨ `connascence lowered/localized: <強い形>→<弱い形> /
     <1つの家>へ` ∨ `responsibility relocated to one home: <責務> now lives only in <place>, localizing
     <the multi-file change>`。
  両行を concrete に書けなければ **その Edit は 場当たり churn。行わない**（working code を残し理由を言う）。

**補助則**: (1) **SMELL ≠ EDIT** — smell 検出時の次の tool call は *Read/調査であって Edit ではない*。
確認して問題なければ「investigated, left as-is」と記録し編集しない。smell 単独では MOTIVE 行を埋められない。
(2) **over-refactoring check** — 抽象/層/pattern/param を *足す* 前に present consumer の存在を確認。
現 caller ゼロ＝Speculative Generality（YAGNI 違反）。**pattern/抽象の *除去* は gate を通る**（`smell
removed: Speculative Generality/Middle Man` + `connascence lowered`）。(3) **wrong-abstraction reversal**
は合法 — 共有抽象が param/conditional を増やして分岐に対応し始めたら、param を足すのでなく各 caller へ
inline 戻す（Metz）。(4) **no "while I'm here"** — 構造変更を behavior-change diff に相乗りさせない。

### D1–D9 の ★ agent 操作規則（要約）

- **D1/D7 →** どの refactoring step も *触る前に oracle を名指す*。実 tool（gopls/Roslyn/rope/LSP）が
  行うならそれが oracle。さもなくば手編集＝precondition 証明ゼロ → 既存 test を先に走らせ、覆って
  いなければ characterization test で現状を pin してから触る。唯一の例外は「最初の test を置くための
  seam 作り」（循環）で、その時は最小の目視可能 move に留め直後に test を pin。
- **D2 →** その *具体的な次の編集* を安くするなら tidy first、理解済みが条件。さもなくば振る舞い変更を
  先にして生存確認後、理解した部分を*別の* behavior-preserving commit で tidy。二度と触らぬ code は
  tidy しない。tidy を rewrite に育てない。
- **D3 →** 既定は incremental（Strangler + characterization）。from-scratch rewrite を出す前に「到達
  不能」かつ「特性化不能」を*証明*せよ。証明できねば incremental。rewrite でも facade 越し・旧系を
  live fallback に。
- **D4 →** 触る前に1軸に分類。今の変更のための掃除（test 有）→ mercilessly だが surface 内。将来の
  ための抽象（現 caller ゼロ）→ STOP、inline して待つ。共有抽象の抽出は *3 度目の実 occurrence* から。
- **D5 →** extract 前に depth test。名前＋signature で本体を読み飛ばせる or 重複/独立 test seam の時
  だけ extract。単一 caller で本体内部を知らねば使えないなら inline。**行数目標で extract しない。**
- **D6 →** 抽出前に「同じ knowledge（1 owner・lockstep）か、ただ似ているだけか」。証明された knowledge
  重複か safety-critical 定数だけ dedup。さもなくば3 度目の caller が軸を証明するまで重複を残す。
- **D8 →** 大 refactor はまず old/new 併存の seam を探し（Parallel Change / Branch by Abstraction）、
  leaf-first の常時-green commit で。「正しい互換 shim が存在しない」ことを証明できる時のみ big-bang。
  理解しきっていない code の long-lived rewrite branch は禁忌。
- **D9 →** 構造編集の前に motive-direction を1軸に分類 → §3.5 の deny-gate（MOTIVE 行＋PROPERTY-DELTA
  行）を両方 concrete に埋められねば触らない。責務分界/局所化 の追求と YAGNI は *同一の checkable cut*
  （present consumer が居るか）であって競合しない。「良い設計だから」「綺麗だから」は動機にならない。

---

## 4. 蒸留された agent 操作規則（10 source の高収束コア → skill の 5 gates）

10 source-class 全てが独立に収束した規則群。skill の gate へ蒸留される（provenance: 全 source で反復）。

1. **behavior preservation は定義**。'refactor' diff は構造のみ変える。bug/feature を見つけたら STOP して
   別 diff に。**edited test assertion は振る舞いを混入した tell**（refactor commit で期待値が変わったら
   それは refactor ではない）。
2. **oracle を名指してから触る**。tool transform か green test bracket か（legacy なら characterization
   test 先）。手編集は precondition 証明ゼロ。
3. **small・可逆ステップ、Write ではなく Edit**。named refactoring を1つずつ、間で test、green で commit、
   red で hand-off しない。ref を全更新する LSP/ast-grep/codemod を freehand より優先。
4. **named smell から、present need に向けて**。aimless churn 禁止。YAGNI（speculative abstraction 禁止）。
   Rule of Three。extraction は depth test。tiny-function dogma を過剰適用しない。**WHY-comment と
   load-bearing な「奇妙さ」（＝過去の bug fix）を保存**。
5. **大変更は trunk 上で incremental**（Strangler/BbA/Parallel Change/Mikado）。long-lived rewrite
   branch 禁止。rewrite は *ラベル付き高 risk 賭け* であって黙って 'refactor' と呼ばない。

### 4.1 agent 固有の calibration（このコアが *なぜ* LLM に効くか）

completeness critic の最重要指摘: **LLM は IDE tool より遥かに高頻度で behavior-preservation を破る
—— テキストを編集し AST を編集しないから**。よって「two hats + green bracket + 別 diff」は任意の衛生
ではなく *agent 自身の失敗モードに対する第一防御*。具体的 default failure（agent-era lens が列挙）:

| # | agent の default 失敗 | 矯正する gate |
|---|---|---|
| 1 | 'refactor' と言いつつ endpoint 改名・off-by-one 修正・default 変更を同 diff に混入 | G1 two hats |
| 2 | 小刻みでなく file 丸ごと Write で再生成（comment/edge-case/blame 消失、bisect 不能） | G3 |
| 3 | test を一度も走らせず「done」と宣言 | G2 |
| 4 | feature/bugfix を 'refactor' diff に混ぜ review 不能に | G1 |
| 5 | 「clean だから」speculative abstraction を発明（YAGNI 違反） | G4 |
| 6 | Clean-Code tiny-function dogma を過剰適用、可読な30行を12個の1行 helper に粉砕 | G4 depth test |
| 7 | test 無き code を pin せず refactor（characterization 無し） | G2 |
| 8 | 検証能力を超える巨大 edit surface を選ぶ | G3 scope |
| 9 | 広域 reformat/rename で diff を膨張させ実変更を隠す | G3 |
| 10 | green test 実行の証拠なく「振る舞い不変」と主張 | G2 final |
| 11 | text 検索置換 rename が reflection/string/config/serialization 参照を取り逃す | safety-net: non-static ref hunt |
| 12 | tool の 'safe' 出力を test bracket 無しで盲信（tool も bug を出す） | safety-net: tool-still-brackets |

---

## 5. Gap analysis / research agenda（completeness critic の15 指摘、重要度順）

skill に取り込む（★＝operating skill にとって load-bearing、○＝reference で言及、△＝academic で軽く）:

- ★ **AST-vs-text gap（agent-era）**: LLM は token stream を編集、IDE は検証済み AST + precondition。
  → LSP rename / ast-grep / comby / jscodeshift / codemod を freehand より優先する *mechanism*。skill の
  agent-era 中核。
- ★ **tool も behavior-changing bug を出す**（Eclipse/IntelliJ の Rename 変数捕獲、Extract Method の
  aliasing/副作用順序変更; Schäfer & de Moor）。→「prefer the tool」は near-axiom だが *test bracket
  抜きの盲信は tool の bug を継承*。D1/D7 の反重り。
- ★ **oracle 構築の近代化**: characterization test に加え golden-master/approval testing（ApprovalTests、
  Gilded Rose kata）、record-replay、property-based/metamorphic testing。test が薄い時の bracket 手段。
- ★ **mutation testing（PIT/Stryker）で safety net の強度を検証**: 偶然 green な suite は false safety。
  refactor 前に「net が本当に締まっているか」を測る agent-era gate。
- ★ **dynamic 言語（Python/Ruby/JS）では automated refactoring が本質的に弱い** → tool が最も助けない
  場所でこそ agent の手動 preservation 規律が *より* 重要。gradual typing（mypy/TS）が安全な自動
  refactoring を再有効化する理由。「prefer the tool」doctrine の言語依存性という重要 caveat。
- ★ **observable contract は functional output だけではない**: 分散/可観測系では log・metric・error
  code・latency・iteration order・serialization も契約。'pure' functional refactor が SLO/alert を壊す。
  observable-equivalence 境界に operational signal を含める。
- ○ **hotspot prioritization（Tornhill『Your Code as a Crime Scene』/『Software Design X-Rays』）**:
  churn × complexity で「どの smell を先に直すか」。全部は直せぬ agent の優先順位付け framework。
  McCabe cyclomatic / Cognitive Complexity（SonarSource）も定量層。
- ○ **Kerievsky『Refactoring to Patterns』(2004)**: smell が正当化する時のみ pattern *へ* refactor、
  過剰適用 pattern *から* も refactor（pattern-cargo-culting 回避）。Compose Method＝Long Function の正典解。
- ○ **codemods at scale**: jscodeshift、OpenRewrite（recipe-based・semantic・cross-repo）、Google LSC/
  ClangMR。「1 refactoring を数百万行/数千 repo に安全適用」＝ agent に増えつつある依頼。large-scale へ。
- ○ **refactoring vs rewrite の定量境界**: coupling 閾値を超えると stable seam 越し strangler-rewrite が
  *安い*。「refactoring は常に安い」bias ではなく決定規則を。
- ○ **Feathers の Scratch Refactoring（理解のための使い捨て refactor→revert）と Effect Sketching
  （編集前の blast-radius 分析）**: agent の「理解してから書き換える」gate を Feathers の実手法で接地。
- △ **RefactoringMiner（Tsantalis, TSE 2018/2020, >99% precision）**: commit message は unreliable
  （Murphy-Hill）を置換した近代 detection。agent の two-hats 自己検査の verify 手段。
- △ **形式的 equivalence 機構**: observational/contextual equivalence、bisimulation、alpha-renaming/
  capture-avoidance。「equivalence up to a model」を厳密化。decision boundary の理論的基盤。
- △ **test-preservation の再帰問題**: refactor は test も編集させる（Fowler「code を動かすため変えざるを
  得なかった test だけ変える」）。net を壊さぬ規律。

### 5.1 epistemic honesty（GRADE 較正）

- **Design Stamina Hypothesis（良い設計は長期で速くする）と Beck の DCF/optionality 論** は *仮説/
  概念モデル* であって measured fact ではない。実証は薄い（GRADE **Low**）。skill は「速くなる」を
  *事実として* 引用してはならない — 動機の中心命題ほど epistemic status を明示。
- **behavior preservation の定義的性質（D7）** は GRADE **High**（analytic）。
- **oracle で分割する和解構造（D1/D7）** は最も頑健。debate の GRADE 分布: High×1, Moderate×5, Low×2。

---

## 6. 一枚図（systematization figure）— 立場を単独で運ぶ

```
                    「refactor して」と言われたら
                              │
              ┌───────────────┴───────────────┐
        観測可能な振る舞いは変わる?（Beck の two hats）
              │yes（feature/bugfix）        │no（構造のみ）
              ▼                              ▼
     implementing-and-debugging      ┌─ refactoring ─┐
     （別 skill・別 diff）           │  不変条件 = behavior preservation
                                     │
     ①WHETHER/WHEN ─ 触る価値があるか（Rule of 3 / preparatory / tidy first-after-never
     │              / rewrite は到達不能を証明した時だけ / Design-Stamina は仮説）
     ▼
     ②HOW-VERIFIED ─ 触る前に oracle を名指す ★核心
     │   engine の precondition ∨ green test bracket ∨（legacy）characterization test 先
     │   agent は AST でなく text を編集 → precondition 証明ゼロ → 常に厳しい枝
     │   tool も bug を出す・偶然 green は mutation で疑う・log/metric も観測契約
     ▼
     ③WHAT ─ named smell から / coupling↓cohesion↑ / connascence を弱く / depth で extract
     │   （行数で extract しない・YAGNI・WHY-comment と load-bearing な奇妙さを保存）
     ▼
     ④HOW-BIG ─ 小刻み可逆 Edit（Write でない）/ green で commit / LSP・codemod を優先
                 大変更は trunk 上で Strangler/BbA/Parallel Change/Mikado、long-lived branch 禁止
```

**この分野を一文で**: リファクタリングとは *振る舞いを保存する構造変更* であり、その保存は「名前だけ」
では成立しない — ずれたら fail する oracle を触る前に持て。AST でなくテキストを編集する agent にとって、
これは任意の衛生ではなく自身の第一失敗モードに対する防御である。

---

## 7. 主要 provenance

Fowler *Refactoring* 2e (2018) ・ Fowler bliki（DefinitionOfRefactoring / 各 workflow, web 検証）・
Kent Beck *Tidy First?* (2023) ＋ XP ・ Michael Feathers *Working Effectively with Legacy Code* (2004)・
Opdyke PhD thesis (1992, refactoring 命名・precondition)・Roberts/Griswold（Refactoring Browser）・
Murphy-Hill/Parnin/Black "How We Refactor…" (2009)・Kim et al. (Microsoft field studies)・Silva et al.
"Why We Refactor" (2016)・Bavota et al.（refactoring induces bugs）・Spolsky "Things You Should Never
Do" (2000)・Brooks（second-system effect）・Cunningham（technical debt, 1992 OOPSLA）・Hunt & Thomas
*Pragmatic Programmer*（DRY）・Sandi Metz（wrong abstraction）・Kent C. Dodds（AHA）・Ousterhout
*A Philosophy of Software Design*（module depth）・Page-Jones（connascence）・Kerievsky *Refactoring
to Patterns* (2004)・Tornhill *Your Code as a Crime Scene* / *Software Design X-Rays*（hotspots）・
Tsantalis et al. RefactoringMiner (TSE 2018/2020)・Humble/Farley（Branch by Abstraction, CD）・
Ellnestam/Brolund（Mikado Method）・*Software Engineering at Google*（LSC/ClangMR）・OpenRewrite。

**アーキテクチャ軸（第2サーベイ）**: Parnas "On the Criteria To Be Used in Decomposing Systems into
Modules" (CACM 1972, 逐語) ＋ "Designing Software for Ease of Extension and Contraction" (TSE 1979)・
Constantine & Yourdon *Structured Design* (1979) / Myers *Composite/Structured Design*（cohesion/
coupling 分類の起源）・Robert C. Martin（SRP-actor・SOLID・component 原則 REP/CCP/CRP/ADP/SDP/SAP・
*Clean Architecture*）＋その批判・Evans / Vernon（DDD: bounded context / aggregate / ACL）・Conway's
Law（inverse Conway maneuver）・vertical-slice / package-by-feature / Locality of Behaviour・Beck
*Tidy First?*（cohesion order / proximity）。

> **living-SoK note**: risky attribution（章番号・逐語引用）は harvest 時に web 検証済み。Design
> Stamina / DCF は仮説として GRADE Low で明示。新たな実証（RefactoringMiner 系の追試、LLM-refactor
> の behavior-preservation 実測）が出れば §5 と GRADE を更新すること。
