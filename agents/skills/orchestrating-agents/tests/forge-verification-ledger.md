# acting-as-director — forge verification ledger (F3 artifact)

Reforge: 2026-07-22. 旧名 `pacing-research-production` からの鍛え直し。編集者 = 監督(前線の
模型)。起草 = Sonnet。敵対監査 = 異種二社(codex: gpt-5.6-terra / agy: gemini-3.1-pro-high、
各 Sonnet が運転、盲検 — 監査者には草稿と三問のみを渡し、起草側の意図説明は渡していない)。

## 再定義(依頼主の言明)

「基本的な行動指針 — Fable 5 が指示役・監督としてどう振る舞うか」。旧版の欠陥 = 役名
(起草担当・査読担当・検収者)だけあって配役表が無く、監督自身の行動規範が無いまま、
事後検討の規則が平坦に堆積していた(P1〜P10 の目録化)。

## 監査の三問

1. 監督の行動を実際に変えない行はどれか(F1)
2. 検分・委任・検収は機械的に分類できるか
3. 委任する監督に固有の失敗様式で、見落としているものは何か

## 一致所見(二社が独立に同一の欠陥を指摘 — 確定として扱う)

検分・委任・検収は**事後の推定では機械分類できない**。同じコマンド(例: 試験の実行)が
文脈により検分にも検収にも実務にもなる。→ 採択1(宣言制)で解消: 行為の時点で監督が級を
宣言し、級ごとに許可・禁止を定義。宣言できない行為は違反。

## 採択(7 点、本文に反映済み)

| # | 出所 | 内容 |
|---|---|---|
| 1 | 二社一致 | LAW(2) を宣言制へ(検分=読み取り専用・1〜2 操作・養う裁定を名指し/委任=完成の定義+検収の試験つき指示書/検収=試験の実行と採否の記録・新規実装の禁止) |
| 2 | codex | P1 と LAW(2) の矛盾解消 — 試作は実務へ**発射**する(監督は回さない) |
| 3 | codex | 指示書に完成の定義と検収の試験を必須化(曖昧な仕様は並列委任で増幅する) |
| 4 | codex | P4 に往復の上限 — 同型の指摘 2 巡で仕様へ差し戻す |
| 5 | codex | P6 に不一致発見後の手続き(当該主張の出荷停止 → 裁定 → 再開) |
| 6 | codex | P10 に入力の指紋(元データの版・日付)— 古い束ねの再利用事故を防ぐ |
| 7 | codex | 異種監査の盲検化(実務側の結論を監査者に渡さない)— 本鍛え直し自身も盲検で実施 |

## 却下(理由つき)

- agy「出自・堆積の門・F3 節は実行時の行動を変えないから不要」→ **却下**。家訓ではこれらは
  保守の門と来歴の成果物(forging-skills の F1/F3 と staleness 規律)。実行時の規則と保守の
  規則は別層で、後者を削ると鍛え直しの判断材料が消える。
- agy「LAW(1) 末尾の『前進の無い応答は作らない』は標語」→ **部分却下**。原則(LAW)と門(P5)の
  対は家風(掟が精神、門が検査)。重複ではなく階層。

## 保留(codex 第三問より — 実害の観測を待って堆積の門の範囲で取り込む)

1. 同時作業数の上限(検収待ちの行列管理)
2. 依存関係つきの作業図(仕様確定前の並列発射の禁止条件)
3. 検収の標本化・束ね処理(監督自身が最遅の単線になる問題)
4. P7/P8 の判断語(「結論を左右する」「全ての軸」)の機械化
5. 担い手ごとの最小権限(入力の範囲・外部送信・書込みの境界)

保留の理由: 現時点で門は 12(堆積の門の上限)。上記を今入れると自らの規律に反する。
取り込みは観測された実害 1 件につき 1 門、統合を優先。

## 床検査

skill-check.ts: PASS(name=dir 一致、YAML 厳密解析 OK、説明文 492 字)。
発火の卓上試験: 既存 10 問+新 5 問すべて期待どおり(卓上試験の記録は F3 節)。既知の
共発火: 「定理・文書を起草・査読させて」は `proving-theorems` と競合し得る(委任の運転=
ここ、数学の中身=あちら)。

## 改名の記録

`pacing-research-production` → `acting-as-director`(依頼主の裁定 2026-07-22)。
拍子(pacing)は性質であって活動ではない — 活動は「監督として振る舞うこと」。

## 2026-07-22: 第3次ポストモーテム(委任の一枚岩)の取り込み

- 観測: 16委任中、読解・検証の並列7件と小実装の単一腕8件は全て着地。規模の大きい
  新規実装を単一腕へ丸投げした1件だけが44分無音(実務は界面の設計の往復に沈んだ)。
- 取り込み: 「委任の形の選択」の節を新設(形の対応表・界面の仕様は監督の設計物・
  救済の規則)。堆積の門の勘定は不変(門でなく本文の節として追加)。
- 出典: リポジトリ側 notes/postmortem-委任の一枚岩-2026-07-22.md。

## 2026-07-22(追記): 救済の規則の実地での不備と締め直し

- 観測: 「着地済み」を条件に未検証の納品物を検収の走行に載せ、崩壊させた。
- 修正: 救済の条件を「自己試験を通過済み」に変更。分解版の再発注では土台に自己試験の
  門を明記(通らない納品は不可)——同じ轍を機構で塞いだ。

## 2026-07-23: GB110 ポストモーテム(完成宣言4回棄却)の統合(第4次)

出自: firedancer GB110、5巡。「発射できる」という完成宣言が第三者監査に4回連続で棄却された
(5巡目で通過)。各巡で監督は煙テストの通過を根拠に完成と判断したが、監査は毎回、実物の
破れを保存物の照合で発見した。極めつけ: 煙の「主指標と min(best,final) が別値」という
観測を是正の実証と読んだが、その観測は**バグ(GPU cache の汚染)でも出る**ものだった。また、
両側 sign-flip の実装は凍結設計(片側)と食い違い、6種の最小 p=0.03125 が Holm 初段 0.0167 を
**算術的に**越えられない——成功条件が構造的に到達不能な実験を危うく発射するところだった
(監査が指摘)。一方、監査ブリーフの型(下記)は5巡を通じて毎回、修復可能な指摘を最小往復で
引き出した。

採択・統合先(4点、新 gate は追加せず既存行への統合のみ——堆積の門は 12 を維持):

| # | 内容 | 統合先 |
|---|---|---|
| 1 | 検収の試験は「主張が真なら出る観測」ではなく「主張が偽なら落ちる独立照合」でなければならない。各試験に「主張が偽でも出得るか」を自問し、出得るなら無効 | LAW(2) 検収の定義・artifact 行 |
| 2 | 高い賭け金の完成宣言(発射可・出荷可の級)は、独立監査の通過そのものを完成の定義に含める——自前の検収だけで宣言しない | 委任契約「生成者≠査読者≠検収者」行 |
| 3 | 凍結した判定基準を持つ実験は、走らせる前に成功条件が算術的に到達可能かを検算する(並べ替え検定の最小 p と有意閾値の比較など) | P8 FOOTING |
| 4 | 監査ブリーフの型(対象HEAD固定・主張の番号つき列挙・開示済み限界の明示・新たな欠けの検査依頼・修復経路の要求・判定語彙の指定)を明記 | P4 ROUND-TRIP ECONOMY |

fire/no-fire: FIRES に「検収の試験をどう設計するか」「完成宣言が監査に落ち続ける」を追加。

序数の訂正(仕様との差分): 発注仕様は「冒頭の出自の節に**第3次**ポストモーテムとして追記」と
指定していたが、「第3次ポストモーテム」は本ファイル上部の見出し(2026-07-22, 委任の一枚岩)
と SKILL.md「委任の形の選択」節の見出しに既に束縛済みの序数だった。同じ序数を別事象に
再利用すると grep 一致が二重化し F1 のいう artifact の一意性が壊れるため、本件は時系列で
次の**第4次**として記載した(出自の節・本見出しとも)。仕様の意図(冒頭への追記・実測1〜2行)
は満たしている——ずれは序数の数字のみ。

## 2026-07-23(査読による訂正): 生成者≠査読者≠検収者行とP6の二重定義を解消

上記採択#2(高い賭け金の完成宣言=独立監査の通過を完成の定義に含める)を委任契約
「生成者≠査読者≠検収者」行に書いたが、これは既存の P6 VERIFY-NOT-TRUST(達成・決着・合格の
宣言は異種監査人〈既定: sol〉の通過まで出荷しない)と対象語彙が違うだけの同一規則だった
(査読指摘)。実体は P6 側にのみ残し、生成者≠査読者≠検収者行の当該箇所は P6 へのポインタへ
縮退・artifact 列の判定条件も P6 側のみに一本化(SKILL.md 85行目付近)。

## 2026-07-23: P0 GROUNDING 三時点化 reforge (v2607.2.0)

Reforge record: P0 を計画言明前・新規性/不在主張の検収前・既知/未知/成熟度成果物の起草前へ拡張し、意味検索クエリ台帳を不在主張の分母にした。

F3 desk-check(name + description のみで判定):

| Ask | 期待 | desk-check |
|---|---|---|
| 「監督として、このプローブを frontier 初の帰着と検収する前に、既知帰着がないか意味検索 battery で照合して」 | FIRE(`driving-cocoindex` と co-fire) | FIRE — 「監督」「検収」が本 skill、意味検索 battery が sibling を錨づける |
| 「委任体制で既知/未知と成熟度を述べる成果物を起草する。先に正史と既存裁定を照合して」 | FIRE | FIRE — 「委任体制」「起草」が description に直結 |
| 「新しい研究計画の目標台帳を作る前に、監督として既存の計画を確認して」 | FIRE | FIRE — 「研究」「計画」「監督」の中核 ask |
| 「この関数の最初の呼び出し箇所を全部列挙して」 | NO-FIRE(`rg` / `serena`) | NO-FIRE — 「最初」は新規性主張でなく exact-symbol enumeration |
| 「既知の定理を初学者向けに一文で説明して」 | NO-FIRE(domain skill / plain answer) | NO-FIRE — 監督・委任・検収の運転を求めていない |

## 2026-07-23: P0 answer-time denominator artifact + pre-acceptance reconciliation arm (v2607.3.0)

Reforge record: 能力・成熟度・不在を述べる応答本文へ、実行した recall/検索と hit の
`file:line`(no-hit を含む)を分母として強制した。fluency は問題選定時の crowdedness flag
(`directing-research` G1)とは切り分け、監督の即答時には正本の照合トリガとした。委任契約の
既存行へ、査読後・検収前の read-only 照合腕(corpus 再発明・既知帰着・資産不参照の専任)を
統合した。新 gate は追加せず、堆積の門は 12 のまま。

出自: 2026-07-23、能力・成熟度照会への回答で会話記憶から三回連続即答し、solver 決着・
Gale・whitening frame の正本を引き損ねた。同日中に P0 と意味検索の二 skill を改鍛した後も
行動が変わらず、検索の「痕跡」でなく答える瞬間の応答本文に分母を出す artifact が必要と判明。

F3 desk-check(name + description のみで判定):

| Ask | 期待 | desk-check |
|---|---|---|
| 「監督として、solver 実装の能力と成熟度を答えて。正本照合の分母も本文に出して」 | FIRE | FIRE — 「監督」が本 skill の中核、能力・成熟度は P0 の応答時 artifact を起動 |
| 「委任成果を検収する前に、既知帰着と既存資産を read-only の照合腕で確認して」 | FIRE | FIRE — 「委任」「検収」が description に直結し、受入前照合は委任契約の運転 |
| 「どんどん進めて。ただし『他に表現は無い』と答える前に普遍層と撤回台帳まで照合して」 | FIRE | FIRE — 「どんどん進めて」が trigger、否定主張は P0 の最低照会軸を要求 |
| 「この solver ライブラリは現在どの機能に対応していますか」 | NO-FIRE(project skill / plain answer) | NO-FIRE — 監督・委任体制の運転を求めない分野の能力質問。発火した project skill 側で現物照合する |
| 「このディレクトリで whitening を含む行を rg して」 | NO-FIRE(`rg` / `serena`) | NO-FIRE — 単一の検索操作であり、能力・成熟度・不在の主張も委任の運転も無い |

## 2026-07-23: 第5次ポストモーテム(workerへの判断の委任・一枚岩の発注)の統合

出自: firedancer、発注者の指摘「sonnetにworker以上の判断を委ねている・40分級の負荷」。
実測: 一枚岩の委任8回・workerの判断の漏れがsol監査1巡の往復を生成・監視待ちの空転6回以上・
出力上限での腕の死亡1回。

採択(4点、「委任の形の選択」節の下位規則として統合——新規 gate は追加せず、堆積の門は12を維持):

| # | 内容 | 統合先 |
|---|---|---|
| C1 | 300行超または20分超の新規実装の発注は、監督が界面の仕様と骨格を書き、200行以下の部品へ分解して並列の腕に渡す。統合はscriptか監督。指示書に分解の表が無い発注は違反 | 委任の形の選択(分解の強制) |
| C2 | 本走級の計算(10分超の実走)を腕の文脈内で走らせない。長い走行は監督が背面のBashで発射し(トークンを消費しない)、判定は成果物に対して新しい短い腕か監督が行う | 委任の形の選択(長走行の分離) |
| C3 | 全ての指示書に「判断の閉鎖」の節を義務化——定数の分類・witnessや評価の選び方・受け入れの解釈を監督が事前に列挙する。未列挙の判断に遭遇した腕は決めずに停止して裁定を求める | 委任の形の選択(判断の閉鎖) |
| C4 | 全ての腕に硬い時間予算と中間報告の義務、監視待ちの空転の禁止(「Monitorの通知を待たず自分で出力を確認して前進せよ」)を指示書に焼き込む | 委任の形の選択(時間予算の硬化) |

## 2026-07-24: v2607.6.0 配役の一次錨の蒸留(Director vs Expert Worker)

出自: 発注者が持ち込んだ AI 生成の合意要約(untrusted 格)——「Fable は Director 一択」論。
蒸留の前に一次照合の腕(sonnet、raw HTML 照合)で主張を格付けした:

| 主張 | 判定 | 一次資料 |
|---|---|---|
| 公式ガイドが並列 subagent 発射・長走行の非同期管理を Fable の強みと明記 | CONFIRMED(byte 一致) | platform.claude.com …/prompting-claude-fable-5 |
| 「Opus より速く枠を消費」 | 文言 REFUTED——公式は "faster than other Claude models"(Opus 比較は不在、grep 済み) | support.claude.com 15424964 "Claude Fable 5 on your plan" |
| 「Fable=Director / Sonnet=Executor」が公式推奨 | NOT-FOUND——公式は tier を名指ししない(一般論の cheaper-model と opus/haiku 例示のみ)。third-party 論評のみ | 4 URL 走査 |

採択(新 gate ゼロ・堆積の門 12 不変):
- 配役表に「配役の根拠」ブロック——verbatim 引用2件を載荷、Sonnet 束縛は家の裁定
  (hook 強制)として公式主張から分離。P2/C2 の外部錨を明記。
- LAW(2) に「全力実務の宣言(唯一の例外)」——発注者の名指し+札+復帰で閉じる宣言制の例外。
  artifact 行を「三級(または全力実務の札の下)」に更新。
- FIRES に2アンカー追補(「Fable に全部やらせていい？」「Fable を作業者にすると枠が溶ける」)。

F3 desk-check(name + description のみで判定):
| Ask | 期待 | 判定 |
|---|---|---|
| 「Fable に全部やらせていい？ Director とどっちが得？」 | FIRE | FIRE——モデルの配役は description の中核アンカー |
| 「この超難問だけは全力で直接解いて(全力実務)」 | FIRE | FIRE——例外の宣言と費用開示を要求する側で発火 |
| 「claude-fable-5 の API 価格は？」 | NO-FIRE(claude-api) | NO-FIRE——委任体制の運転を求めない事実照会 |

sol(codex, gpt-5.6-sol, effort=high, read-only)の敵対査読、2巡+機械閉鎖:

- 第1巡: FAIL——凍結4件(非同期引用の省略が verbatim を名乗る/C2 への錨の過大適用/
  「持続しない」の断定拡大/全力実務の起動・復帰境界の未閉鎖)+衛生2件。全件修復経路つき。
  6件全て採択し修理。
- 第2巡(再発射——初回は運転者が LONG-RUN レシピの `</dev/null` を脱落させ rc=124。
  driving-codex の Gotchas に症状行を追加済み): FAIL だが残件1件に収束——第2引用が
  指定ブロックの先頭文を欠く。修復経路どおり先頭文を追加。
- 閉鎖: 残件の性質が決定論的な文字列照合のため第3巡は立てず(P4 往復経済)、監督が機械照合で
  閉鎖——blockquote 剥離+空白正規化の下で全3引用が skill 本文と一次照合記録の両方に逐語一致
  (修正前は同照合が FAIL——偽なら落ちる性質を実地確認)。全面改鋳(次工程)で新たな監査が掛かる。

## 2026-07-24: 全面改鋳(v2607.7.0)+改名 acting-as-director → orchestrating-agents

発注者の指摘「テクニカルコミュニケーションとして破綻(3日6版の append-only 蒸留)」を受け、
sol を起草者とする全面改鋳を実施。拘束: 保全原則(12門・LAW・宣言制・C1〜C4・cuts の意味
不変、旧→新対応表を義務)・実測の物語は本文から台帳へ退去(本文は日付つき pointer のみ)・
機械の検収基準 = skill-check 散文床 WARN 0件(改鋳前: 長文9・長セル4・版見出し8行)。

- sol の納品: 新本文418行(全規則が一文+artifact+出自 pointer の表)・対応表(欠番なし・
  12門の数え上げ 10+2 不変・廃止/追加提案なし)・台帳移設リスト24行・命名メモ。
- 命名の裁定: sol は `orchestrating-work` を推奨(P0/P8/P9 の包摂を理由)。発注者は
  `orchestrating-agents` を追認済みで、"work" は家の命名慣行(具体名詞の対象)から浮くため
  **orchestrating-agents で確定**。P0/P8/P9 の包摂は description の趣旨行(研究開発の進捗を
  委任体制で productive に)が担う。可逆(git mv で復元可能)。
- 版見出しの v2607.4.0〜6.0 連鎖と規則セル内の実測物語は、git 700f55d の本文と本台帳の
  各日付節を正本として退去(移設リストどおり。本文には出自 pointer が残る)。
- 機械検収: 散文床 WARN 0件・引用3件の byte 照合 PASS・YAML/description 検査は下記。
- 査読(生成者≠査読者): sol が起草者のため、保全性の異種監査は terra へ発注(盲検・
  対応表と新旧本文の突き合わせ)— 判定はこの節へ追記する。

## 2026-07-24: 全面改鋳の移設台帳(対応表の指し先の実在化; terra 監査の欠番12行への修理)

以下の各節は、v2607.7.0 で本文から退去した物語の正本である。中身は 700f55d の本文からの
逐語(長文のままで良い — 台帳は散文床の対象外)。対応表(scratch の mapping.md)の指す
`ledger.md` は本ファイル tests/forge-verification-ledger.md を指す(衛生指摘の統一)。

### 全面改鋳前の版履歴と出自(700f55d 逐語)

> **Version**: v2607.6.0 (2026-07-24 — 配役の一次錨の蒸留: 公式の並列subagent適性と枠消費の verbatim 引用を配役表へ(「Fable=Director/Sonnet=Executor」は公式推奨でなく third-party 格と裁定)+LAW(2)に全力実務の宣言(唯一の例外)。新規 P-gate・委任契約項目ゼロ(数え上げ12不変)。sol 査読2巡の記録は台帳。v2607.5.0=健全化の窓の蒸留: 実測値の体制の併記の義務+全数宣言の3層検査(P6)・worker停止の再開の定型(委任契約)。v2607.4.0=2026-07-23 進捗ストールのポストモーテム蒸留: 監査の欠け2級分類(P4)・終了条項と理論の消費者条項(委任契約)・覆せる既定(LAW(2))・達成級の語の土俵の名指し(P6))

> 改名の記録: 旧名 `pacing-research-production`(2026-07-22 鍛え直しで改名 — 拍子は性質で
> あって活動ではない。主題は監督の行動指針)。

> 出自: 2026-07-22 のポストモーテム(依頼主の指摘「なぜここまで遅い」)。
> 同日の実測: 最初の計算が着手から約 2 時間遅れ・応答の約 2 割が文章検査による再送。
> 同日深夜の第2次ポストモーテム(速度の注意4回)で P7〜P9 を追加。実測: 判定に関わらない
> 走行を遅い装置に置いて2時間浪費・測定条件の不一致で比較実験を1周再走・補助変数の
> 連動を見落として判別実験が1回無効化。同日さらに P10 を追加(2026-07-22、実測: 同一の
> 束ねを 1 日に 3 回再構築)。firedancer GB110(2026-07-23)の第4次ポストモーテムで LAW(2)
> の検収定義・P4・P8 を強化: 実測、「発射できる」の完成宣言が第三者監査に4回連続棄却
> (5巡目で通過) ── 主因は検収の試験設計(主張が偽でも出得る観測を採択の根拠にしていた)。
> 2026-07-23 P0 実測: プローブ検収で帰着照合を怠り、既知帰着を発注者が検出・照合一発で判明した事故と、逆に六クエリ battery が降格二件を一時間で決めた成功。
> 本 skill は分野の固有名を含めない ── どの領域の委任作業にも
> 適用する。各 gate は機械で確認できる artifact を要求する。
> 2026-07-23 第5次: workerへの判断の委任と一枚岩の発注をC1〜C4で機構化(発注者の指摘「sonnetにworker以上の判断を委ねている・40分級の負荷」)。


### 初回ポストモーテム(移設)

> 出自: 2026-07-22 のポストモーテム(依頼主の指摘「なぜここまで遅い」)。
> 同日の実測: 最初の計算が着手から約 2 時間遅れ・応答の約 2 割が文章検査による再送。

### 第2次ポストモーテム(移設)

> 同日深夜の第2次ポストモーテム(速度の注意4回)で P7〜P9 を追加。実測: 判定に関わらない
> 走行を遅い装置に置いて2時間浪費・測定条件の不一致で比較実験を1周再走・補助変数の

### 進捗ストール(移設)

> **Version**: v2607.6.0 (2026-07-24 — 配役の一次錨の蒸留: 公式の並列subagent適性と枠消費の verbatim 引用を配役表へ(「Fable=Director/Sonnet=Executor」は公式推奨でなく third-party 格と裁定)+LAW(2)に全力実務の宣言(唯一の例外)。新規 P-gate・委任契約項目ゼロ(数え上げ12不変)。sol 査読2巡の記録は台帳。v2607.5.0=健全化の窓の蒸留: 実測値の体制の併記の義務+全数宣言の3層検査(P6)・worker停止の再開の定型(委任契約)。v2607.4.0=2026-07-23 進捗ストールのポストモーテム蒸留: 監査の欠け2級分類(P4)・終了条項と理論の消費者条項(委任契約)・覆せる既定(LAW(2))・達成級の語の土俵の名指し(P6))
>   ボトルネック化し「進捗ストール」の指摘——うち2件は既定で進められる種類だった)
| P4 ROUND-TRIP ECONOMY | 査読担当への指示に「全指摘に修復経路を明示せよ」を必ず含める。二巡目以降の起草指示書には、前巡で繰り返された指摘の型を事前に焼き込む。**同じ型の指摘が 2 巡続いたら往復をやめ、指示書(仕様)へ差し戻す**。異種監査への指示書には**監査ブリーフの型**を使う: {対象 HEAD の固定・主張の番号つき列挙(各主張に証拠の所在)・開示済み限界の明示(FAIL の理由に数えない事項の事前裁定)・「新たな欠けの検査」の依頼は**欠けの2級分類を義務化して**行う(『凍結した問いを脅かす欠け』=発射を止める/『台帳の衛生』=開示つきで発射後の修理を許す——止める権限は前者のみ。無限定の欠け探しの依頼は禁止)・全指摘への修復経路の要求・判定語彙の指定(PASS / FAIL / SCOPE-LIMITED PASS+許される文言の逐語)}(2026-07-23実測: GB110の5巡で毎回、修復可能な指摘を最小往復で引き出した型。同日GB113で無限定の欠け探しが監査6巡を招き、4巡目以降は判定の答えを変えない台帳の衛生に往復を浪費——発注者が進捗ストールを検出) | 指示書内の該当文言/3 巡目の同型指摘が存在しないこと/異種監査への指示書に監査ブリーフの6要素+欠けの2級分類の指定が明記されていること |
| 指示書の自己完結 | 起草担当へ自己完結の指示書を渡す。指示書には目標・根拠資料・数値や事実の錨・**完成の定義(何が出来たら完了か)と検収の試験(検収者が実行する判定手続き)**・「証明や確認ができない箇所はごまかさず明記せよ」を含める。**成果物に載る数値を生む実行体には、独立の自己検定を2つ以上内蔵させる**(別法の再計算・極限や次元の検査・既測との突き合わせ。2026-07-22 実測: 目視と注釈を生き延びた係数の誤りを異種の監査だけが発見、同夜の自己検定は4件の誤りを機械で捕獲)。**規模の大きい新規実装は一枚岩で渡さず、共通の土台を固定して並列の腕に分解する。時間予算(超えたら中間の報告か中断)も指示書に書く**(2026-07-22 実測: 分解を怠った実装委任1件だけが44分無音、他の委任は全て速く着地)。独立な起草は並列に発射する(独立 = 互いの出力・結論を渡さない)。**長い走行を発射する腕の指示書には終了条項を必ず含める: 発射後は切り離しの確認と PID の報告をもって退出、子守り(完了までのポーリング常駐)の禁止**(2026-07-23実測: 終了条項なしの腕が走行の子守りで1h13m・38万トークンを消費)。**理論・相談の発注書には「消費する建造の名前と着地予定」の欄を必須とする——2つの建造以内に実験が消費できない理論は発注しない**(2026-07-23実測: 消費者の遠い理論発注が並走し、決定的経路の実装が痩せて発注者が進捗ストールを検出)。**workerが通知待ちや無進捗で停止したら、SendMessageの定型(「出力を自分でpoll/tailし、プロセスの終了はBashのループで待ち、最終報告まで完走。停止は報告の提出時のみ」)で即座に再開する——散文の禁止では再発する(2026-07-23〜24実測: 指示書に明記しても4例再発。恒久の是正はハーネス側の機構であり、蒸留でなく鍛錬の課題として記録)** | 指示書内にこれらの要素(終了条項・消費者の欄を含む)が明記されている/停止の再開はSendMessageの記録 |

### grok の配役制限(移設)

| 異種検証 | codex(GPT)・agy(Gemini ほか多社) | 独立の監査・第二意見。監査の指示書は盲検 ── 実務側の結論・推論を渡さず、問題文と成果物だけを渡す(先入観の防止)。担当間の不一致は最初に引く糸(P6 と同文)。grok(xAI)は情報流出の前科(2026-07)があるため既定では外す ── 秘密を含まぬ repo に限り明示指示で使う |
呼び出しの機構は `driving-codex` / `driving-antigravity` / `driving-grok`(pointer; 再論しない)。

### 実装への出口(移設)

| P1 PROBE-FIRST | 新しいテーマに着手した turn の内に、最小の具体的な計算または試作を 1 本、**実務へ発射する**(監督が自分で回すのは LAW(2) 違反 ── 発射と検収が監督の仕事)。相談・調査の完了を待たない。**逆の出口も同じ門である: 独立の確認が二度そろった知見は、その巡の内に実装の委任を発射し、実装の台帳へ載せる**(記録済み≠完了。2026-07-22 実測: 確認済み10件・実装の委任0件の堆積を発注者が検出——判別の発射だけが回り、実装への出口が無かった) | 同 turn の実行出力(具体的な結果が出ていること)/確認済みの知見に対応する台帳の行と委任の発射 |

### 健全化の窓(移設)

> **Version**: v2607.6.0 (2026-07-24 — 配役の一次錨の蒸留: 公式の並列subagent適性と枠消費の verbatim 引用を配役表へ(「Fable=Director/Sonnet=Executor」は公式推奨でなく third-party 格と裁定)+LAW(2)に全力実務の宣言(唯一の例外)。新規 P-gate・委任契約項目ゼロ(数え上げ12不変)。sol 査読2巡の記録は台帳。v2607.5.0=健全化の窓の蒸留: 実測値の体制の併記の義務+全数宣言の3層検査(P6)・worker停止の再開の定型(委任契約)。v2607.4.0=2026-07-23 進捗ストールのポストモーテム蒸留: 監査の欠け2級分類(P4)・終了条項と理論の消費者条項(委任契約)・覆せる既定(LAW(2))・達成級の語の土俵の名指し(P6))
| P6 VERIFY-NOT-TRUST | 相談・文献に由来する載荷主張は、(a) 自前の計算、(b) 一次資料の本文、(c) 独立の再計算、のいずれかで確定するまで成果物に書かない。**「達成・決着・合格・実証・確定」の宣言も載荷主張である**: 宣言には元の目標の原文と判定条件の逐語の引用を併記し、**異種の監査人(既定: sol)による照合を通過するまで達成の語で出荷しない**(通過前は「前進の報告」と呼ぶ。2026-07-22 実測: 目標をずらした達成宣言を発注者が検出——監査人の常設で機構化)。**達成級の語は土俵(玩具か本機か・規模)の名指しを主張の文言そのものに含める——土俵を跨ぐ一般化は前進の報告と呼ぶ**(2026-07-23実測: 玩具の基板の構成的実証を「確定」と報告し、発注者が「PoCの無いproof」を検出)。**実測値を設計へ引用するときは、測定の体制(適用の条件)の併記を義務とする——体制なしの経験値は変装したヒューリスティックである**(2026-07-24実測: 学習済みの網で測った局所性2.5%を未学習の網の設計へ流用し、費用の見積りが168倍狂った——設計の起草と検収の両方がすり抜けた)。**「全数・網羅」の宣言の検収は多重の検査を要する: 既知の事例の照合表への全件照合+独立の敵対の再掃引+統合者による主張と実データの裏取り、の3層**(2026-07-24実測: 抽出10腕の「全数」から2機構が丸ごと欠落し、既知の照合が12穴・敵対の掃引が13穴を検出、統合者の裏取りが偽の穴4件を除外した)。異なる担当・模型の間の不一致は、最初に引く糸として扱う ── 不一致を見つけたら当該主張の出荷を止め、一次資料か自前の計算で裁定してから進める | 成果物内で主張ごとに検証手段が名指しされている/実測値の引用に体制の条件の併記/全数の宣言に3層の検査の記録/不一致時は裁定の記録/達成の宣言に原文の引用と監査の通過の記録 |

### terra 保全監査の判定と閉鎖(2026-07-24)

terra(盲検・旧新+対応表)の判定: FAIL——移設先の欠番12行・意味の弱化5件
(機械で/不在/役割分離の4者性/自分で通す/F3の鍛え直し義務)・混入3件・衛生1件。
処置: 弱化5件は全て復元(機械閉鎖 grep 5/5)。欠番は上の移設台帳の実在化で修理。
混入3件は承認済み差分と裁定——description の Workflow-native 句と言語指令は forging-skills
の description 解剖学が全 skill に義務づける部品、F3 の「履歴は台帳だけ」は本改鋳の任務
そのもの(散文債務の再発防止)。監査ブリーフの既知差分宣言が狭すぎた(改名+版のみ)のは
監督の不備として記録。閉鎖後の床: skill-check 完全 clean。

## §配役の更新 — v2607.8.0 (2026-07-25)

**発端**: 発注者の指示 —「Opus5 を基本的には director にして、Fable5 でさえ expert worker に
降格するべきじゃないの?」。前版(2026-07-24)は「公式資料は委任先の tier を名指ししていない」と
記録しており、その前提が覆ったかを検める必要があった。

**照合の分母**: 監督自身が WebFetch で一次資料を2ページ取得し、逐語を確認した(要約腕の
報告は採らない — 過去に省略記号入りの引用を逐語と偽った事故がある)。

| 軸 | 出典 | 得た逐語 |
|---|---|---|
| 選択順序 | platform.claude.com `/docs/en/about-claude/models/overview` §Choosing a model | "If you're unsure which model to use, start with Claude Opus 5 for complex agentic coding and enterprise work. For workloads that need the highest available capability, use Claude Fable 5." |
| tier の分割 | 同 `/choosing-a-model` §Model selection matrix | 行「The highest available capability → Claude Fable 5」/「Complex agentic coding and enterprise work → Claude Opus 5」 |
| 費用 | 同 overview 比較表 | Fable 5 = $10/$50・Opus 5 = $5/$25・Sonnet 5 = $3/$15(2026-08-31 まで導入価格 $2/$10) |
| 保持義務 | 別腕の調査(official-primary、敵対検証で CONFIRMED) | Fable/Mythos は Covered Model で 30 日保持、ZDR では利用不可 |

背面の survey は 8 腕(4 面 × 調査+敵対検証)。REFUTED はゼロ。三次ブログ由来の数値主張
(「ultra は4エージェント」等)は unverified として採らなかった。

**是正**: 前版の「公式資料は委任先の tier を名指ししていない」は 2026-07-25 に覆った。
ただし公式が名指しするのは**模型選択の順序**であって委任先 tier ではない。SKILL.md には
その区別を明記し、Sonnet 束縛と宣言制は家の裁定のままだと保存した(過剰な一般化の防止)。

**配役の移動**(役は不変・担い手セルのみ):

| 役 | 旧担い手 | 新担い手 |
|---|---|---|
| 監督 | 前線の模型(Fable/Opus) | Opus 5 |
| 実務 | Sonnet | Sonnet 5 |
| 実務(上位) | — (存在しなかった) | Fable 5、宣言制、単発の Agent 呼び出しに限る |

**機構の同時改修**(散文だけでは再発するため):

1. `enforce-sonnet-agents.ts` — 非 sonnet を一律 deny する分岐に昇格条項を追加。`fable` は
   prompt に `ESCALATION(fable): <対象> | <sonnet で届かない理由> | <費用の見込み>` の三欄が
   揃うときだけ通す。Workflow の fan-out には条項を設けない(艦隊は「名指しの単発」ではない)。
   試験6本追加、hook 全体で 54 pass / 0 fail。
2. `settings.json` の `env.CLAUDE_CODE_SUBAGENT_MODEL` を削除。公式の解決順序
   (code.claude.com `/docs/en/sub-agents`)では env が per-invocation の model より**上位**であり、
   置いたままなら hook が許可した昇格を env が黙って踏み潰す。これで政策の家は hook 一つになった。
3. user-global `CLAUDE.md` の「no exceptions」行を宣言制の文言へ差し替え、配役を覆せる既定として記載。

**裁定の級**: 覆せる既定(可逆・開示つき)。統治の変更にあたるため発注者の追認待ち。
戻し方は env キーの復活と hook の昇格条項の削除の二手のみ。

### 昇格経路の実機検証(2026-07-25)

単体試験(6本)は hook の分岐しか証明しない。実機の経路は harness を通さないと分からないので、
主 loop から Agent を2回発射して両経路を実測した。

| 経路 | 発射 | 観測 | 判定 |
|---|---|---|---|
| 宣言なしの `model:'fable'` | `Reply with exactly: OK` | deny。理由文に修復手順(三欄の書式)が載った | PASS |
| 宣言ありの `model:'fable'` | 同上+`ESCALATION(fable):` 三欄 | hook は通過。ただし**起動したのは Sonnet 5** | 経路は開通、発火は次 session から |

二例目は自己申告(「私は claude-sonnet-5 である」)だけでは根拠にならないため、機械で裁定した:
`env | grep` で `CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-5` が**走行中のプロセスに残存**する一方、
`jq` で読んだディスク上の settings.json には `env` キーが**存在しない**ことを同時に確認した。
原因は settings.json の `env` が session 開始時に一度だけ読まれる仕様であり、削除は当該 session を
遡及しない。公式の解決順序(env > per-invocation)がそのまま観測された形であり、
**この env が per-invocation を踏み潰すという今回の設計前提そのものの実証**でもある。

したがって現時点の正しい報告は「昇格経路は配線済み・deny 側は実機で発火・allow 側は次 session
から有効」であって、「昇格が動く」ではない。次 session の最初の宣言つき発射で allow 側を確定させる。

## §外部艦隊の配役 — v2607.8.1 (2026-07-25)

**発端**: 発注者の指摘 —「実務(上位) に sol ultra とかが来るんじゃないの? それは違うの」。
v2607.8.0 は上位の実務を Fable 5 だけで埋めており、同日 `driving-codex` に焼いた ULTRA
(外部で艦隊を組む発注法)が配役表のどこにも現れていなかった。**指摘は正当**であり、
新設した行が旧版の穴を塞ぐ。

**なぜ穴が空いたか**: v2607.8.0 は Anthropic の模型系列の更新だけを見ており、同じターンで
codex 側に追加した能力を配役表へ還流させなかった。skill を跨ぐ更新の取りこぼしであって、
設計上の裁定ではない。

**採った設計と、その理由**:

| 判断 | 採否 | 理由 |
|---|---|---|
| sol ultra を Fable と同じ行に並べる | 却下 | 級は同じでも形が違う。harness 内(文脈と作業木を共有)と harness 外(指示書で渡し成果物で回収)は選択の軸が別であり、同一行に置くと選択を誤らせる |
| 上位実務を harness 内/外の二行に割る | 採択 | 発注時に答えられる問い(「文脈の中で着地させるか、成果物で回収するか」)で分岐できる |
| sol を実務に降ろすとき P6 の既定監査人を外す | 採択 | 生成者≠査読者。同一担い手の自己監査は検収ではなく自己申告になる。この排他がないと配役表が自己矛盾する |
| 費用の非対称を選択規則に含める | 採択 | sol ultra は codex 契約に載り Anthropic 週次上限を消費しない。遊休capacityがあるとき harness 外を先に当てるのが合理 |

**同時改修**: P6 の「異種監査人の既定は sol とする」行に、実務利用時に既定を外す一行を隣接させた。
排他規則を離れた場所に置くと読まれないため、衝突する行の直下に置いている。

**床**: skill-check exit 0、WARN ゼロを維持。

## §外界の観測の配役 — v2607.9.0 (2026-07-25)

**発端**: 発注者の指摘 —「grok は最新情報にも詳しいし、ネットなどの個人の所感にも詳しい。
かなりバランスが良い。特に社会との接点を必要とする場所だとか」。

**私の誤り**: 直前の回答で grok を異種検証の枠に押し込み、その枠の中で「sol と agy がいるなら
第三の腕の限界価値は小さい」と判定した。**軸の取り違え**である。発注者が述べたのは監査の代替
ではなく、配役表に存在しなかった役だった。除外条件だけを記録し発火条件を書かなかった前版の
形が、この誤りを誘導している(同じ形の穴を同日 sol ultra でも指摘されている)。

**設計の反転(採択の根拠)**: grok を実質使用不能にしていた EXFIL の制約は、この用途では
**構造的に発火しない**。前科は「repo を丸ごとアップロードした」ことであり、監査は成果物と
コードを渡す仕事だから直撃する。世評の観測は問いだけを送るので、渡す対象が存在しない。
よって「秘密を含む repo に向けない」は監査用途に固有の制限であり、全域の禁止ではない。

**制限の scope 明確化(意図的な意味変更)**: 配役表の「grok は既定の配役から外す」を
「grok は**異種検証の**既定から外す」に改めた。弱化ではなく scope の明示である。根拠は
上記のとおり制限の理由(repo 内容の流出)が観測用途に及ばないこと。旧行の artifact 列
(秘密を含まない repo だけで明示指示がある)と出自(2026-07、台帳 §grok の配役制限)は保存した。

**同時に置いた規律**: 観測の産物は「何が言われているか」であって「何が正しいか」ではない。
社会的な問い(受容・不満・話題の所在)に対してはそれ自体が求める事実だが、技術的主張の根拠へ
転用すると P6 が壊れる。配役表と本文の両方に、真偽の根拠に使わないことと、成果物へ載せる際に
観測の日付と範囲を併記することを artifact つきで焼いた。

**証拠の格**: 発注者は「印象を持っている」と述べており、grok の当該能力は本 repo で未実測である。
担い手の束縛は家の裁定であり発注者の権限に属するため採択したが、**実測ではない**ことを記録する。
実測が要るのは能力の順位づけであって配役ではない(P6 の RANK-BY-MEASUREMENT は promotion に係る)。

**床**: skill-check exit 0、WARN ゼロを維持。

## §腕の版の束縛 — 2026-07-25(実測の事故から)

**発端**: 発注者が実走の transcript を提示 —「opus46 なんか使ってるぞ」。異種検証パネルの4腕目に
`claude-opus-4-6-thinking` が「Anthropic(異系統の版)」として採用されていた。

**三重の違反**(いずれも既存の規則で止まるはずだった):

| # | 違反 | 破られた規則 | 所在 |
|---|---|---|---|
| 1 | 同一ベンダの別版を「異系統」と数えた | 異種検証の目的は誤りの非相関。同一ベンダの別版は訓練系統を共有し、独立性が最も弱い | 配役表(本件で明文化) |
| 2 | legacy 模型を腕に採った | Opus 4.6 は公式の legacy 表(2026-07-25 取得の overview)にある | 公式資料 |
| 3 | 未 probe の slug を腕に採った | driving-antigravity の LAW = CATALOG-BY-PROBE。当該 slug の catalog 記録は "listed by `agy models`; **not individually probed**"、可用性は "inferred by grammar symmetry — NOT probed" | driving-antigravity/references/model-catalog.md |

**#3 は蒸留の欠落ではなく到達の欠落である**: 規則は既に存在し、catalog にも未probeと明記されて
いたのに、実行側は catalog を在庫表として読んで拾った。今日 sol ultra・grok でも同じ形が出ている
——**「何が使えるか」は台帳にあるが「いま何を選ぶか」がどこにも束縛されていない**。本件では
配役表に選択の束縛を2行置いて塞いだが、根治は catalog 側に「現行の推奨腕」の欄を置くことであり、
driving-* 系の鍛え直し課題として記録する。

**堆積の門の発火**: SKILL.md body が 500 行の床に張り付いており、本件の追記は既存節の圧縮
(測定設計を本台帳へ移送・重複行の統合)で相殺してようやく通した。skill 自身の堆積の門の趣旨に
照らせば、次は追記ではなく鍛え直しである。

## §外界の観測の配役 — C4 比較の設計(SKILL.md から移送、2026-07-25)

測る量は賢さではない。他の腕が出さない社会的信号を、所在つきで出せるかである。

比較の腕には家の baseline(sonnet + web 検索)を必ず含める(C4 の要求)。

判定軸: (a) 他の腕が出さなかった主張の件数、(b) 各主張に所在が付くか、(c) 直近性、
(d) 検証可能な具体の誤り率。(a) が baseline 以下、または (b) が満たせないなら昇格しない。

## §長走行の消失(2026-07-25、firedancer)

### 事象

外部の理論の担当(codex の sol)へ、単一の巨大な成果物を求める発注を最上位の層で出した。
2回とも失敗し、合計41万トークン(303,318 と 107,504)の推論が、成果物を1行も残さずに消えた。
誤りの符号は 503 / `biscuit_baker_service_me_circuit_open`。直後に軽い層で試すと成功したため、
サービスの完全な停止ではない。

### 原因の3層と、蒸留の判定

| 層 | 内容 | 規則は既に有ったか | 処置 |
|---|---|---|---|
| (a) 直列化の不徹底 | sol と terra を同じ勘定で同時に最上位の層で走らせた | **有った**(P7)。ただし「資源」に外部の勘定が読めていなかった | P7 の当該行を、資源に外部の勘定を含む形へ**置換** |
| (b) 分解の欠落 | K1〜K4 を1本の成果物として要求し、全損になった | **有った**(C1)。ただし発火条件が実装に限られていた | C1 の発火条件を「単一の成果物を求める委任」へ**置換** |
| (c) 途中の保存の不在 | 外部の一度きりの呼び出しは状態を持たず、落ちれば全消 | **無かった** | 終了条項の行を一般化して**置換**し、逐次保存の行を1本だけ足す |

**3件中2件は蒸留の欠落ではなく適用の欠落である。** 規則は存在していました。監督が「外部の勘定も資源に当たる」「理論の起草も単一の成果物に当たる」と
読まなかったのが原因です。

### 蒸留の形(追記ではなく置換)

門は12が上限であり、本件では新しい門も新しい節も作らない。既存の3行を一般化して置換し、
正味の追加は1行に留めた。原理は1つに畳める。

> **委任は、途中で落ちても完成した分が残る形で出す。**

直列化は失敗の確率を下げる手当て、分解と逐次保存は失敗の損害を下げる手当てであり、
いずれもこの原理の系である。

### 未処置(次の鍛え直しの課題)

誤りの符号 `biscuit_baker_service_me_circuit_open` が何を意味するか、そして遮断が開いた後に
どう待つかは `driving-codex` の持ち場である(sibling cut: 一回の呼び出しの正しさはあちら)。
本台帳には事象のみ記録し、当該 skill への蒸留は未実施として残す。

## §規則の不適用の反復(2026-07-25、firedancer)

### 観測

本日1日で、**既に存在する規則を監督が適用しなかった事例が5件**出た。いずれも新設の必要はない。

| 規則 | 出所 | 不適用の回数 | 症状 |
|---|---|---|---|
| C2 長走行の分離 | 台帳 §第5次ポストモーテム | **3回** | 腕が自分の文脈で本走を発射し、待機して停止する |
| P7 直列化 | 台帳 §第2次ポストモーテム | 1回 | 同一の勘定で重い走行を2本並行させ、41万トークンを失った |
| P9 交絡の表 | 台帳 §第2次ポストモーテム | 1回 | 掃引の前に交絡を書かず、測定を1巡やり直した |
| P6 記録 | 台帳 §採択 | 1回 | 確定した成果物4件を正本へ置かず scratchpad に留めた |
| 意味検索の先行 | 家の規約 | 1回 | 仕様の凍結前に検索せず、退役済みの定数を再導入した |

### 判定

**5件とも蒸留の欠落ではなく、適用の欠落だった。** 規則を新設しても直らない。
本日は既に一度、規則を追加せず既存の3行を一般化する形で蒸留した(§長走行の消失)。
それでも同日中に C2 の不適用が3回起きている。

### 含意(次の鍛え直しの課題として記録。本日は規則を足さない)

門は12個で上限に達しており、規則の総数は既に監督が発射のたびに参照できる量を超えている。
**規則を読む契機が、発射の直前に無い**ことが原因の候補である。

考えられる形は2つ。(a) 発射の直前に機械が検査する。前回のポストモーテムで同種の実行体を
作ろうとし、カウンセリングにより破棄した経緯がある。
(b) 規則を減らす。12個の門と C1〜C4 と非番号の2項目を、実際に発射時に効く数へ削る。

**(a) は一度破棄されている。** 破棄の理由は「失敗した計画に手続きを足すのは逃避である」だった。
その裁定は計画の側については正しかったが、**委任の運転の側にも同じ判断が適用できるかは未検討**である。
本台帳に課題として記録し、本日は判断しない。

## §数値の接合(2026-07-25)

**事象**: 監督が発注者へ返した4主張が、2系統の敵対的な査読で全て崩れた。
比の6桁の誤り(2億倍→約201倍)、異なる実験の数値の接合(GB117のfixed32を逆伝播として提示)、
自分の計画の事前登録判定(PARTIAL、容量は届かない)との矛盾、
台帳に存在する本物の逆伝播の対照(3.1284〜3.1426)の見落とし。
分子に置いた「85億9千万回の更新」には、対応する測定が存在しなかった(打ち切られた走行)。

**既存の門の不適用(3件、いずれも独立に捕捉できた)**: P8 FOOTING(4軸の不一致)、
P0 GROUNDING(意味検索の先行)、P6(測定の体制の併記)。
本日3度目の同型の所見である。GB118の判定文書は腕Aの土俵の弱さを脚注で自ら開示しており、
監督はその文書を読んだ上で開示された弱い数値を使った。

**門の穴(2件、本ポストモーテムで埋めた。門は12のまま)**:

1. **P3 に数値の床が無かった。** 監督は報告をファイルへ書き correo を error 0 まで通した。
   **通ったのは散文であって数値ではない。** 比の誤りも実験の接合も文章検査は検出しない。
   委任した成果物には検収の試験が付くため、この穴は
   **監督が発注者へ直接返す会話の応答に固有**である。
   → P3 へ3行を追加(出所と体制の付与、条件の異なる軸の明示、散文の通過を数値の通過と読まない)。

2. **P0 の発火条件が狭かった。** 「自分の計画が何を測ったか」への回答は不在の主張である
   (「他の実測は無い」を暗に主張する)。監督はそう分類しなかった。
   実測=本セッションの意味検索6回に対し Bash 1867回、**311分の1**。
   発注者の指摘後も回数は増えていない。
   → P0 へ1行を追加(測定の有無・値を述べる前に発火)。

**検証**: 門の数は編集前後とも12(番号つき10 + 非番号2)。行の追加のみで門を新設していない。

**出自**: notes/postmortem/数値の接合-2026-07-25.md(firedancer)。

## §接地の強制 — 2026-07-25(罰点方式を却下した記録)

**発端**: 発注者「subagent についても ccc を使わせたい。ペナルティや罰金点数の積み上げ方式の
ようなものを考えるべき?」。

**まず実測**: hook が subagent に届いているかを、census ファイルの実物で確認した。届いていた。
ただし各 subagent は固有の session_id を持つため census は毎回まっさらから始まり、
stride=8 は 215 呼び出しの主 loop 向けの較正で、10〜30 呼び出しで死ぬ腕には高すぎた。
実例: `{"searches":7,"ccc":0,"lastNudge":0}` — 7回検索して一度も nudge されずに終了した腕。
FIRST_NUDGE_AT=3 を導入し、初回だけ早く、以後は stride 8 に戻す形へ較正した。

**罰点方式の却下(三つの理由、いずれも本 repo の失敗史から)**:

| # | 理由 |
|---|---|
| 1 | 罰を受ける主体が存在しない。subagent は task 終了で消え、次の腕は前の腕の点数を知らない |
| 2 | 発火点が最も弱い。JG4→JG5 の教訓は「行為の瞬間に発火し artifact を要求する規則だけが載荷する」。事後の採点はその逆で、JG4 と同じ運命をたどる |
| 3 | Goodhart が確実に起きる。減点回避のための儀式的 `ccc search` が3本走り、**接地の偽の証拠**を製造する。firedancer の V1〜V4 が購入0件を0件と照合して全 PASS した形と同型で、ccc を使わないより悪い |

**採った機構**: 助言ではなく**返り値 schema の必須欄**。ccc 登録 repo の腕には
`cccQueries: {query, hits:[file:line]}[]` を required で置く。腕は battery を回さない限り
妥当な返り値を作れず、harness が拒否して再試行させる。これは JG5 の形(行為＝返却の瞬間に
発火・artifact を要求)を委任へ適用したものであり、監督の裁量だけで即座に効く。

**堆積の門**: 本追記で body が 507 行に達し、既存節の圧縮で 500 未満へ戻した。門は本日
複数回鳴っている。次は追記ではなく鍛え直しであり、これ以上の追記は債務の先送りである。

## §PoCの無効化(2026-07-26)

**事象**: 「勾配法によらない信用割当は学習を生むか」を測る PoC が、組み込んだ敵対的検査3本のうち
2本で無効化された。**設計の誤り3件はいずれも監督に帰属する。**

1. **標的が相関免疫でなかった**。指示書は「定理 I2-A により単一成分では到達できない」と書いたが、
   源を代数的に解くと x_t = m_t XOR m_{t-1}(m は独立な Bernoulli(0.9))で、入力が偏っており
   相関免疫の条件を満たさない。実測で直前1記号だけでエントロピーが 0.6798→0.5890 へ落ちる。
   I2-A の反例は別の機械(3ビットの W 行列 + reset の雑音、30近傍で I(Y;Z)=0 を有理数演算で厳密証明)
   であり、保証が最初から接続していなかった。
2. **機構なしの対照が無かった(決定打)**。同一データ・同一の KT 機構で、分裂も融合もしない
   固定深さの表が d=6 で 0.48032、d=7 で 0.48029。適応機械は 0.48304 で**負けている**。
   信用・門・受理の機構全体が何も追加していなかった。
3. **融合が構造的に発火し得ない設計**。merge_gain = −split_gain のため直近の分裂を同一時点で
   融合評価すると必ず負。かつチェックポイントが単調増加のみで分布の漂流が無い。
   受理0件、腕Sと腕SMがバイト同一。GB119 と同型。

**攻撃できなかった箇所**: 浮動小数点0件(判断へ戻る経路がコード上に存在しない)、受理の門は選択的
(候補2件に対し受理0件を計装で確認)、中核の自己検定4件が独立再実行で通過。**機構は健全で、
無価値だったのは実験の設計である。**

**是正(門は増やさない。P9 へ1行)**:

> 機構が効果を生んだと主張する実験には、その機構を外した対照を同一の条件で置く。
> artifact: 比較表に機構なしの行がある。

**本日3度目の同型**(GB118 の購入0件の対照の不在への査読の指摘、GB119 の空虚な通過、本件)。
2件目の指摘を受けた直後に3件目を作った。門の数は編集前後とも12。

**出自**: notes/postmortem/PoCの無効化-2026-07-26.md(firedancer)。

## 2026-07-27 — v2607.10.0 cognitive-heterogeneity reforge

### Source

本鍛え直しのdurable baselineは
`tests/baselines/v2607.9.0-dirty.patch`。forge開始時のHEADは
`c27f011e85ce9e36e09fccd349f9c1b573b6092b`、HEAD側の旧`SKILL.md` blobは
`d4a4a6969d965d7ec49c531e77666e92808c3901`、既存dirtyを含むbaseline blobは
`b77c60390dd5fb09dcaf525469023a1648015fdd`、dirty baseline本文のSHA256は
`a5e835ec09ab05df65f49df950ee852b1a345282416f759dc5182f53ff58900c`。
`/tmp/orchestrating-reforge.TCgtBC/orchestrating-agents` は監査中の作業copyに過ぎず、
durable baselineの正本ではない。

| Source | 取得・検査の形 | この鍛え直しで使う範囲 |
|---|---|---|
| durable dirty baseline | 上記HEAD blobからdirty baseline blobへのpatch、本文SHA256 | forge前から存在したP9一行を改鋳差分と混同せず、forward testの比較面を再構成する |
| live-session semantic bloat audit | 現行 `SKILL.md` と ledger の read-only 監査 | 詳細規則がruntime coreへ堆積し、同じ概念の発火点が分散しているという観測 |
| live-session self-contradiction audit | frontmatter、LAW、配役、委任形、統合規則の read-only 交差監査 | 監督の担い手、実務禁止の範囲、control plane、merge/synthesis/acceptance の意味が同居して衝突するという観測 |
| PoTRE: Test-Time Reasoning Inspired by Cognitive Heterogeneity | TMLR paper の一次資料: https://arxiv.org/abs/2607.20268 | 研究内の設定での異質な推論topology、候補統合、同質反復との比較、leave-one-out |
| ccc meaning-search battery | 下記三queryの意味検索と正史索引の read-only 照合 | 既存の直接home、近接sibling、撤回対象の有無 |
| harness docs | `operating-the-harness/references/commands-and-skills.md` の read-only 照合 | disclosure、skill body/referenceの読み込み契約 |
| craft refs | `forging-skills/references/{architecture,distilling,execution-models,verifying}.md` の read-only 照合 | one home、source grade、calibration inversion、execution model、検証床 |

### Source grades

| Claim/source | Grade | 許される使い方 |
|---|---|---|
| 現在のrepoの形と、このsessionで観測したsemantic bloat・自己矛盾 | **live session — highest** | 現物を指す観測として、構造の改鋳理由に使う |
| PoTREの精度・異質性・leave-one-outに関する主張 | **author-confirmed paper** | 論文が調べた模型・課題・計算条件の範囲だけで述べる。普遍則へ昇格しない |
| normalized candidate packet、証拠によるsynthesis、腕のpruningをこのskillへ移す規則 | **skill-supplied / constructed** | agent向けの運転規則として明記する。論文著者の提案や実測結果として帰属させない |

constructed規則は engineered, not measured。本skill自身のpilotを通るまでは、有効性の達成主張に
使わない。

### Calibration inversion

| | Paper's target | This skill's agent consumer |
|---|---|---|
| dominant error | 同じ推論topologyの反復に計算を足し、誤りまで相関させる | 固定役を毎回起動し、低費用の仕事まで儀式化する overfiring |
| corrective bias | 異なる失敗様式を持つ推論topologyへ探索を分散する | **DEFAULT single executor**。pilotが限界利益を示す腕だけを足す |
| prominent guard | homogeneous repetitionをdiversifyする | **MUST NOT fixed four**。四役常設や役名だけのpersona分割を禁止する |

論文の「異質にせよ」を、そのまま「常に多腕にせよ」へ写すとagent consumerでは逆向きの失敗を
作る。このinversionをruntimeの既定とdeny-listへ置く。

### Adopted

1. **failure-mode/topology diversification**: 腕を人物名でなく、Direct、
   Plan–Execute–Verify、Adversarial Refinement、Breadth Searchなどの探索topologyと、
   狙う失敗様式で区別する。必要なtopologyだけを選ぶ。
2. **normalized candidate packet**: 各腕の返却を
   `topology / failure_mode_attacked / candidate / evidence_or_tests / assumptions /
   known_weakness / cost` へ正規化し、長いtranscriptを統合入力にしない。
3. **evidence-based synthesis**: 票数でなく、検査可能な証拠、反例、制約適合、独立oracleで
   候補を裁定する。
4. **pilot + leave-one-out**: 常設前に小さいpilotを行い、独自正解、候補包含、synthesis回収、
   費用、腕を外したときの最終差で限界貢献を測る。貢献せず判断を濁らせる腕は外す。

### Rejected

| Rejected | 理由 |
|---|---|
| 四つの役を常に全て走らせる | 論文自身のleave-one-outとcalibration inversionに反し、固定役のceremonyを作る |
| persona名またはmodel identityを独立性と数える | 独立性は探索topologyと失敗様式の差であり、名前や担い手の違いだけでは誤り相関を切れない |
| majority voteを既定の統合にする | 検証済みの少数候補を、相関した多数の誤答が潰し得る |
| universal token efficiency | 研究内でも比較相手と条件に依存する。全ての予算・課題で安いとは主張できない |
| synthesis interferenceを著者が証明した原因として書く | 情報量、候補品質、誤り相関が同時に変わる。干渉は妥当な仮説だが、因果として分離実証されていない |

### Architecture decisions

| Decision | One home / seam |
|---|---|
| runtime bodyをmodel-freeにする | 時点依存の担い手、能力、provider policyはdated `references/model-roster.md`だけが所有する |
| 発注・分解・長走行・役割分離を分離する | `references/delegation-contracts.md`が詳細のSOLE home |
| 資源・比較・交絡・再利用を分離する | `references/measurement-and-resources.md`がP7〜P10のSOLE home |
| 認知的異質性・candidate packet・synthesis・pruningを分離する | `references/reasoning-portfolios.md`が詳細のSOLE home |
| 統合という語を三分する | deterministic merge → script、judgmental synthesis → reasoning portfolio、acceptance → 監督 |
| 新しい行為級 `運転` を置く | launch / interrupt / resume / status / 資源割当というcontrol planeを、deliverable実務から分ける |
| LAWの絶対表現のscopeを固定する | 「監督は実務をしない」は監督役を宣言した期間のdeliverable実務に限る。通常のsingle-executor仕事への普遍的禁止にしない |
| 12-gate countを退役させる | 数え上げは詳細規則の堆積を隠した。runtime coreは少数の発火点、詳細はSOLE references、堆積防止はone-homeとF1で検査する |

既存 `§PoCの無効化` のP9規則はdirty historyとして一字も変えず保持する。runtimeの規則は
`references/measurement-and-resources.md` のP9「機構なし・同一条件対照」へのpointerで接続し、
ledgerの事象とruntime manualを二重の arguing home にしない。

### P0 search denominator

実行したmeaning-search queryは次の三つ。文字列はverbatimで記録する。

```text
heterogeneous reasoning topology candidate synthesis error correlation
task adaptive agent portfolio pruning marginal contribution leave one out
dated model roster capability binding provider policy
```

| Query | Hit / no-hit |
|---|---|
| `heterogeneous reasoning topology candidate synthesis error correlation` | orchestrating bodyには直接のruntime homeなし。ledgerと一般的なportfolio siblingに近接記述はあるが、candidate packetの契約はない |
| `task adaptive agent portfolio pruning marginal contribution leave one out` | orchestrating bodyには直接のruntime homeなし。leave-one-outで腕を削る運転規則は未設置 |
| `dated model roster capability binding provider policy` | `driving-antigravity` / `driving-codex` のmodel-catalog precedentと、`forging-skills` architectureのdurability contractがhit |

最低照会軸の分母:

| Axis | Result |
|---|---|
| solver / implementation | cognitive-heterogeneityを直接実装するruntime homeはno-hit |
| representation | delegationの返り値schemaはhit。ただしcandidate packetはno-hit |
| universal layer | `forging-skills`のdurability contractとone-home architectureがhit |
| withdrawal ledger | prior fixed-four adoptionはno-hit。退役させる既存の四役常設規則はない |

### Verification

**Verdict: SCOPE-LIMITED PASS**。skill reforge / ship の構造・意味・発火・論文忠実性は合格。
portfolioが実タスクで精度またはtoken効率を改善したという達成主張はしない。

| Command / audit | Result | Scope |
|---|---|---|
| `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/orchestrating-agents` | **PASS** | target skillのfrontmatter、reference、構造floor |
| `git diff --check -- agents/skills/orchestrating-agents` | **PASS** | target差分のwhitespace / patch整合 |
| Ruby `YAML.safe_load` とdescription長検査 | **PASS — 853 / 1024 chars** | frontmatterの安全なparseと発火面の長さ |
| atomic reference gate | **PASS** | 正常directoryはexit 0。空fixtureは全5件のmissingを列挙してexit 1 |
| durable baselineの `git apply --check --cached`、blob / SHA照合 | **PASS** | old blob `b77c60390dd5fb09dcaf525469023a1648015fdd`、本文SHA256 `a5e835ec09ab05df65f49df950ee852b1a345282416f759dc5182f53ff58900c` が一致 |
| ledger先頭603行のSHA256 | **PASS — `cadd4b77bf3033c9fb951e3975c05aef1a841350538cae535424e015a98bced7`** | 既存historyのbyte保全 |
| collection sweep | **SCOPE-LIMITED PASS** | targetはclean。repo全体の非0は既存・範囲外の `turnstile-spin` orphan reference 6件だけで、今回の回帰ではない |
| architecture / content semantic audits | **PASS** | major 6件とminor findingsを修正後、再監査clean |
| PoTRE fidelity audit | **PASS** | fixed-four、普遍的な効率改善、未分離の因果を論文へ過剰帰属していない |
| trigger desk-check | **PASS — 10 / 10** | fire / no-fireとsibling cut |
| old-vs-new forward test | **cases 1–5: NEW** | case 4はfailure-routing後、case 5はledger closure + live-link後の再試験でPASS |
| `mise run link:skills` とlive resolve | **PASS** | Codex rootとClaudeの `orchestrating-agents` symlinkが `/home/fuyu/dotfiles/agents/skills/orchestrating-agents` へ解決し、live descriptionも確認 |
| runtime core縮約 | **516 → 310 lines（39.9%減）** | runtime body。詳細規則は四つのSOLE referenceへ移管 |
| forge前dirty history | **PASS** | P9の「機構なし・同一条件」一文と `§PoCの無効化` を保持 |
| portfolioのruntime pilot / leave-one-out | **DEFERRED — activation-time gate** | task distributionと閾値が未固定。portfolio常設を決める時点で `references/reasoning-portfolios.md` §7 のpilotを必須とする |

Allowed claim:

> v2607.10.0 は構造・発火・出典忠実性・出荷配線について検収済み。実タスクでの精度・token改善は未実証であり、portfolio起動時のpilotに委ねる。

## 2026-07-28: P0/P3の発火点拡張とP6吸収(蒸留、追記ではない)

### 出自

firedancerで実測した7例。定理の引用0本、T38の引用0件、親目標6日FAILで後継0件、
裁定文書が4日前の記録を再導出、GB31の実測が10日間本線へ渡らず、GB96の是正が4日で失効、
系譜の正本が14世代空白。

### 判定の分岐

2本の独立な判定が割れた(2件の欠落 対 6件の欠落)。監督が一次資料で裁定した結果、
争点は新しい門の要否ではなく**既存P0の発火点の狭さ**だと判明した。P0のartifactは既に
「最低軸は実装・既存資産、別表現、普遍層、撤回台帳」を要求しており、理論の未引用も、
FAILした親目標の未継承も、規則としては既に射程内だった。しかしP0の発火条件は
「述べる前に」であり発言の前だけを縛る。**登録(建造を建てると決める書き込み)には
届いていなかった。**

### 裁定

新しい門は置かない。発火点を拡張し、重複行を吸収する。

### 編集(3件)

1. **P0の発火点を拡張。** 「述べる前に」→「述べる前と、新しい建造を登録する前に」。
   artifactへ「登録では、その分母を登録の文書に書く」を追加。
2. **P3の射程を拡張し、P6の2行分の義務を先取り。** 「報告」→「報告・設計・登録の
   いずれでも」。「体制のない値を設計根拠にしない」を追加。
3. **P6の重複2行を削除。** 「実測値を設計へ引用するときは、測定条件と適用範囲を値に
   併記する」「体制のない経験値を設計根拠へ昇格させない」——編集2でP3へ吸収済みであり、
   同じ義務を二箇所に置かない。

### 検証

番号つきの門は編集前後とも10、P5は不在のまま(既にP2へ吸収済み)。行数は
310 → 306(-4行、編集3の2文とその前後の空行の畳みによる)。`references/`への
参照4件は全て実在を確認した。

## 2026-07-28: §effort の役への束縛(蒸留、追記ではない)

### 発端

発注者の問い —「sonnet 5 と opus5 どのように使い分けるべきだと考えられている? 特に grok に
この辺りを伺うように。effort の議論も極めて重要です」。配役表は担い手を役へ束縛していたが、
effort の列を持っていなかった。

### 照合の分母

外界の観測は grok を一腕(投げ捨てdir + `--sandbox read-only`、問いのみ送付、$0.87 /
567k tokens)。一次資料は監督自身が 5 ページ取得して逐語確認した(要約腕の報告は採らない)。

| 軸 | 出典 | 逐語 |
|---|---|---|
| 梃子の優劣 | platform `choosing-a-model` | "Tuning effort is often a better lever than switching models." |
| 較正 | code.claude.com `model-config` §Choose an effort level | "The effort scale is calibrated per model, so the same level name does not represent the same underlying value across models." |
| 優先順序 | 同 §Set the effort level | "The environment variable takes precedence over all other methods, then your configured level, then the model default. Frontmatter effort applies when that skill or subagent is active, overriding the session level but not the environment variable." |
| ultracode の実体 | 同 §Adjust effort level | "Ultracode is a Claude Code setting rather than a model effort level: it sends `xhigh` to the model" |
| 持ち越しの罠 | 同 | "Opus 5 has no such hold: a level you previously set carries over." |
| 継承の非対称 | code.claude.com `agent-teams` | "Teammates inherit the lead's effort level." / "Teammates don't inherit the lead's `/model` selection by default." |
| Opus 5 の低 effort | platform `effort` §Opus 5 / `whats-new-opus-5` | "use `low` and `medium` liberally as your primary control for token cost and response time wherever your evals show quality holds" / 査読は "staying accurate at lower effort levels" |
| Sonnet 5 の低 effort | platform `prompting-claude-sonnet-5` | "`low`: Reserve for short, scoped tasks and latency-sensitive workloads that are not intelligence-sensitive" / "on moderately complex tasks running at `low` effort there is some risk of under-thinking" |
| subagent 用途 | platform `effort` 級表 | `low` の典型用途に "such as subagents" |

自前の実測 2 件。(a) `env` で `CLAUDE_EFFORT=xhigh` を観測。`settings.json` は
`effortLevel: "low"` と `ultracode: true` を同時に持つ ——**設定は効いていない**。
(b) `agents/claude/agents/` は不在であり、subagent 定義の家が無い。

### grok の扱い(外界の観測として)

公式の逐語引用は、監督が重ねられた範囲で**全て一致**した。独立に検めた 2 件
(`opusplan` の記述、teammate の effort 継承)は CONFIRMED。三者測定(Stet n=24、
SWE-Bench Pro、Terminal-Bench、Vals.ai)は**未検証**であり、かつ相手が Opus 4.8 で
Opus 5 ではない。grok は `Opus 5 @ low` と `Sonnet 5 @ xhigh` について
「測定は見つからない」と明示的に返した ——**この升目は世界に存在しない**。

### 裁定

新しい門は置かない。既存の SOLE home 宣言を effort まで広げ、腐らない不変だけを core に置く。
番号つきの門は編集前後とも 10(P0〜P4・P6〜P10)で不変。

値は folklore で埋めない。全部を documented default に置き、**下げる向きだけ**に門を置く。
向きを非対称にした根拠は徳目でなく損の非対称である —— 上げすぎの損はトークンのみ、
下げすぎの損は腕の失敗・巡の再走・監督の裁定まで含む(2026-07-27 の mise 移送で
第1巡が 3/3 FAIL した実測が同型)。

### 編集(4件)

1. **`SKILL.md` Language。** stable token に `LOW-EFFORT(<段>)` を追加。
2. **`SKILL.md` Durable role topology。** SOLE home の列挙へ「effort の束縛」を追加し、
   不変を 3 文で置いた ——「役に属し session に属さない」「単一の全域値を置かない」
   「既定は documented default、下げる dispatch だけが `LOW-EFFORT()` 宣言を要する」。
   artifact は effort の出所と宣言行。
3. **`references/model-roster.md` §effort の束縛。** 発射面 × 役 × home × 現在の束縛の表。
   `Agent tool` の行は**未配線**と明記(引数が存在せず subagent 定義も不在)。
   測定の空白も明記。header の照合日を軸ごとに分離した。
4. **`operating-the-harness/references/workflow-and-context.md`。** 機構の腐りを修理:
   alias 解決(`opus`→Opus 5、v2.1.219+)、既定の規則(Opus 4.7 を除き `high`)、
   ultracode 行、較正の一文、優先順序と frontmatter の梃子、Opus 5 の持ち越しの罠、
   実効値の確認法(`CLAUDE_EFFORT` / statusline `effort.level`)。

### 機構化(同日中に実行、覆せる既定)

1. **`settings.json` の `effortLevel` を削除。** 値の変更ではなく鍵ごとの削除である。
   実測で死んでおり(ultracode が `xhigh` を送る)、かつ `~/.claude/settings.json` は
   この repo への symlink なので、この鍵は `/effort` の永続化先そのものだった ——
   つまり Opus 5 の持ち越しの罠が通る経路でもある。削除で監督は documented default に座る。
   戻し方は鍵の再追加一手。
2. **hook に `LOW-EFFORT()` 条項を追加し、hook を改名した。**
   `enforce-sonnet-agents.ts` → **`enforce-dispatch-contract.ts`**、政策ラベルも
   `sonnet-agent policy:` → `dispatch-contract:`。発注者の指摘「名前がおかしいのでは」は
   正当だった —— この hook は二軸(担い手と effort)を強制するのに、名前は片方しか名乗って
   いなかった。旧名は 2026-07-25 の節に歴史として残る。
   条項は Workflow の `agent()` 限定で、literal な `effort:'low'` が同一 span 内に
   `LOW-EFFORT(<段>): <理由>` を持たなければ deny する。Agent tool 側は引数が存在しないため
   不変。既存の span 走査を再利用し、第二の parser を書いていない。

**開示済みの限界**(隠さず記録する。いずれも fail-open 方向であり、設計どおり):

- literal でない `effort`(変数・計算式)は通る。この門は obfuscation ではなく不注意を狙う。
- 大小文字を区別するため `effort:'Low'` は通る。ただし Workflow tool の schema が
  小文字の enum なので、この経路で安く走ることはできない。
- 宣言 marker を code と同じ行に置くと、理由欄が後続の code を巻き込んで非空と判定され得る。
  `hasEscalationDeclaration` から継承した行単位一致の性質であり、未試験の隅である。

**検収**(監督が凍結してから成果物を見た):

試験は成果物を見る前に凍結し、負の対照を先に取った —— 変更前の hook に対して
T1/T5/T6 が落ち、T2/T3/T4/T7 が通ることを確認してから発射した。**T5 が要点である**:
`script.includes("LOW-EFFORT(")` で済ませた誤実装は T1〜T4 を全て通し、T5 だけ落とす。
T5 が無ければこの試験は偽の主張の上でも PASS した。改名の後も同じ7本を再走させ、
判定が不変であることを確かめた(試験は文言でなく判定だけを見るので改名の oracle になる)。

- 凍結した検収 7/7 PASS(改名の前後とも)
- hook 全体 95 pass / 1 skip / 0 fail —— 監督が独立に走らせた数。腕の自己申告と一致した
- `mise run fmt:ts:check` clean

腕は二つの隅を自己申告した(大小文字・同一行 marker)。黙って埋めなかったので上に記録できた。

### 未解決(発注者の裁定待ち)

1. **subagent 定義の家。** `Agent tool` の穴を塞ぐ唯一の恒久手段。新しい topic 階層と
   linking を伴うため別件として切った。
2. **教義の衝突(effort とは別問題)。** `prompting-claude-opus-5` は
   "do not use subagents to verify or double-check your own work" と
   "The same applies to legacy harness scaffolding that adds separate verification steps" を
   書く。監督の読みは「狙いは同一文脈の自己検証であり、別担い手による委任成果物の盲検は
   同ページが writer-verifier pattern として肯定している」だが、ultracode の既定姿勢と
   "keep spawn counts low" の衝突は本物であり、発注者の裁定を要する。
