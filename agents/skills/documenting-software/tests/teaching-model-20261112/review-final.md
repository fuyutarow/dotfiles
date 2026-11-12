# Relay 文書抜粋の独立レビュー（読み取り専用）

対象は index.md、architecture.md、first-run.md、api.md の四ページだけである。リンク先の文書は抜粋に含まれないため、それらの不足を欠落とは断定しない。

## 有用な点

- index.md は「何であるか」「Release Desk との関係」「どのページへ進むか」を一段落で振り分けており、読者が次に開くページを迷わない。
- api.md は「Scope」で、設定は host guide にあると先に示している。検索の入口として機能する。
- api.md の getRun は「書き込みをせず、外部作業も開始しない」と明記し、NotFound と Unavailable のどちらも外部作業の有無を示さないと書く。読み直しの可否も示している。読者が副作用を誤解しにくい。
- first-run.md は「実行には executor と外部資格情報が必要」「完了は約束しない」と条件を書いている。

## 主要な懸念

1. **receipt の語が二つの意味で使われている（architecture.md 第3段落）。** 「SDK submission success returns a command receipt」と「host receipt store records the external operation's receipt」が並ぶ。読者は、どの receipt が外部作業の成立を示すのかを判断できない。レビューとしては、どちらが何を証明するかを一文ずつ分けるべきと考える。

2. **completed の意味が外部作業の成否と分離されていない（architecture.md 第3段落）。** completed は「authorized operator が送った completion command」を記録する、とある。一方で外部作業の受領は receipt store にある。読者は、completed が外部作業の成功を意味するのか、人の承認を意味するのかを、抜粋からは決められない。運用判断に直結するため、重大な欠落と考える。

3. **承認の検査場所が読者に伝わらない（architecture.md 第1・2段落、first-run.md の例）。** coordinator は「Release Desk approval states を解釈しない」とあり、承認の検査は Release Desk が SDK 呼び出し前に行う。first-run.md の例では `approved: true` を呼び出し側が渡している。Relay を Release Desk なしで使う読者は、SDK 直接利用なら承認が検査されないと推論しうる。これは文書から導かれる推論であり、抜粋に反証はない。どの層が承認の責任を持つかを一文で明記すべきである。

4. **用語の揺れ。** 同じ対象を Job（architecture.md）と Run（api.md、first-run.md）で呼んでいる。API の戻り値型名と概念名を一致させるか、対応を一度示すべきである。

5. **API 記法の不統一（first-run.md 40–49行目）。** `submitted.ok` は真偽プロパティ、`run.isOk()` はメソッドとして書かれている。`releaseDesk.validate` が例外を投げるのか Result を返すのかも書かれていない。読者は例をそのままコピーすると誤る可能性がある。

6. **失敗の実例が不足している。** first-run.md は submit の失敗分岐を `displaySubmitError` で示すが、submit のエラー型や意味は抜粋にない。api.md は getRun の ReadError のみを説明する。読者は、submit が失敗したときに何が起きたか、再試行してよいかを判断できない。

7. **起動手順の欠落。** first-run.md は「Begin with a local coordinator」と書くが、起動方法は示されない。`connect` の定義も抜粋にない。host setup guide にあると推定されるが、この抜粋だけでは初回実行を完了できない。

8. **正確な認可規則の所在が保留されている（architecture.md 第2段落）。** 「The component API contracts are the authority for exact admission behavior」とあるが、その文書は抜粋にない。revision 不一致時の挙動も抜粋からは分からない。レビューとしては未確認と扱う。

## 不確実性

本レビューは抜粋の文言だけに基づく。host setup guide、executor reference、component API contracts の内容を確認していないため、上記 2、5、7、8 はそれらで解消される可能性がある。

## 総評

構造の入口と「何をしないか」の明示は良い。一方、receipt と completed の意味が文書内で閉じておらず、読者が外部作業の成否を誤読する危険が最も大きい。
