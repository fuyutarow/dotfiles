# Relay 公開ドキュメント抽出のレビュー（証拠範囲: 4 ページ抽出のみ）

## 主要な指摘

1. **`architecture.md` の「completed」の主体が文面上あいまい（最重要）。** 27 行目は「completed 状態は、認可された operator が送った completion command を記録する」と述べる。一方 28 行目は、外部操作の receipt は host の receipt store が記録するとする。読み手は、外部作業が終わった後に誰が completed へ進めるのかを判断できない。executor が終えても operator の操作が要るのか、executor 自身が完了を送るのかで、運用手順も障害時の対応も変わる。主体と順序を一文で示すべきである。

2. **成功の意味が三か所で分散し、読み手が誤読しやすい。** `architecture.md` 28–29 行目は「SDK submission success は command receipt を返す」とだけ述べる。`first-run.md` 54 行目は「完了を約束しない」とする。`api.md` 62–66 行目は、`getRun` が外部操作の有無を確定しないと明記する。最後の記述は良い。ただし、submit の成功が「受理」なのか「実行」なのかを、`first-run.md` の冒頭で一語で示していない。submit 直後に完了を期待するコードを書く読み手が出る可能性がある。

3. **`first-run.md` のコード例で Result の書き方が揃っていない。** 44 行目は `submitted.ok` と `submitted.value` を使い、45 行目は `run.isOk()` と `run.value`、`run.error` を使う。同じ SDK の戻り値なのに判定方法が違う。読み手はどちらが正式な API か判断できない。`connect` と `releaseDesk` の import も示されていない。コピーして動かすには、もう一段の参照が要る。

4. **`first-run.md` は「最初のジョブ」として実行できる段取りを示していない。** 37–38 行目は local coordinator と host が作る organization Operator を前提にし、provisioning は範囲外とする。その後 53 行目で host setup guide に送る。executor の起動も 52 行目で必要と書かれるが、どう起動するかは示されない。抽出内では、読み手が例を動かす最初の手順が分からない。リンク先に詳細がある可能性は否定しないが、このページ単体では完結しない。

5. **アプリ非依存の使い方が、どこに差し込むかを示していない。** `index.md` 9–10 行目は「Release Desk なしでも使える」と述べる。`first-run.md` 51 行目は別アプリが独自の schema と validation 関数を供給すると述べる。しかし、その関数を SDK のどの設定点に渡すかは抽出内にない。`architecture.md` 20 行目の「SDK がアプリの payload を validate する」と合わせると、読み手は自分のアプリで何を実装すべきか推定するしかない。

6. **承認の所在が二か所で読める。** `architecture.md` 17–18 行目は coordinator が reviewer role や Release Desk の承認状態を解釈しないと明記する。これは良い保証である。一方 22 行目は Release Desk が「承認済み」を確認してから SDK を呼ぶとする。両方の文を読むと、承認の強制は application 側にあると分かる。ただし、coordinator が承認を検証しないことを、保証として独立の段落で示すとより安全である。

## 評価できる点

- `index.md` 冒頭の 11 行目は、本番設定の所有者が host operator であると明示し、ページの範囲を定めている。
- `api.md` 58 行目は「既に設定済みの client を持つ呼び出し側向け」と scope を宣言し、設定は host guide に送る。この宣言は、API 参照の範囲を守っている。
- `api.md` 62–66 行目は、読み取りだけで書き込みを行わないこと、NotFound と Unavailable の意味、再試行が可能なことを明記する。読み手が例外処理を決める根拠になる。
- `architecture.md` 31–33 行目は、組織境界の検査が command admission で行われ、coordinator が Release Desk に依存しないと、依存方向を示す。

## 不確実性

- 抽出は四ページだけであり、host setup guide、executor reference、component API contracts は範囲外である。これらが上の指摘 1、4、5 を解消している可能性はある。本レビューは、それらが存在しないとは仮定しない。ただし、抽出内の文だけでは、読み手は該当する判断を下せない。
- `revision` と `expected revision` の意味、`queued`/`running`/`completed` の遷移条件は抽出内に定義がない。読み手が競合や再実行を扱う場合に、追加の説明が要る可能性がある。
