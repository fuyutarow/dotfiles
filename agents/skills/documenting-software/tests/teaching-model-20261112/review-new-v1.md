# Relay ドキュメント レビュー（証拠範囲: 提供された4ページのみ）

## 結論

ページの役割分担（index → architecture → first-run → api）は明確で、api.md は exact lookup 用の狭い参照として機能している。一方、読者は `completed` と submit 成功の意味を判断できず、first-run の例を自力で完走できない。以下は重要度順。

## 主な指摘

1. **`completed` の意味が定まらない（architecture.md, 第3段落）**
   「completed は authorized operator が送った完了コマンドを記録する」「外部操作の receipt は host receipt store が記録する」とある。外部作業が失敗していた場合に、coordinator の completed と receipt store のどちらを「完了」として画面に出すべきか読み取れない。api.md（getRun）も「外部作業の有無は確定しない」と述べるが、completed が外部成功を意味するのかは説明しない。

2. **承認の保証の所在が曖昧（architecture.md, 第1〜2段落）**
   第1段落は coordinator が「reviewer roles や Release Desk approval states を解釈しない」と述べ、第2段落は Release Desk が「release が承認済みであることを検証してから SDK を呼ぶ」と述べる。つまり `approved: true` の検査は呼び出し側の規約であり、coordinator の強制ではない。読者は、Release Desk を経由しない client や SDK 直接利用者にとってどの検査が強制されるかを判断できない。保証（guarantee）と application の規約を分けて書く必要がある。

3. **submit の結果と再送の扱いが不明（first-run.md 43–45 行、architecture.md 第3段落）**
   example は `submitted.value.jobId` を読むが、architecture は成功が「command receipt」を返すとだけ書く。receipt に jobId が含まれるか、成功が Job 作成を意味するかは不明。ネットワーク断後の再 submit が重複 Job を作るかどうかの記述もなく、読者は再試行の判断ができない（抽出外の文書にあるかもしれないが、本文は言及しない）。

4. **最初の job を自力で完走できない（first-run.md 37–38, 51–54 行）**
   「local coordinator を起動する」と書くが方法は示されず、provisioning は「outside this example」とされる。executor は「running でなければ work は実行されない」が、起動方法は executor reference に委ねられる。`connect` と `releaseDesk.validate` の import 元も不明。最後の「immediate completion を約束しない」は正しく誠実だが、completed に至る手順は本ページ内で閉じていない。

5. **用語と結果型が揃わない**: api.md は「Job を読む」と書きつつ `Run` を返す。`Job` と `Run` の関係は未定義。例では submit は `submitted.ok` / `submitted.value`、読取は `run.isOk()` / `run.value` と書き分けられるが、Result 型の定義はない。`Operator` capability と `revision` 不一致時の挙動（architecture.md 第1段落）も説明されない。

6. **失敗状態の欠落**: status は queued / running / completed のみで、executor 失敗の表現がない。ReadError も NotFound / Unavailable しか示されず、網羅かどうか不明。

7. **index.md が problem を示さない**: 「なぜ job coordinator と署名済みコマンドが要るのか」が書かれず、機構より先に例へ進むことになる。cancel・retry・順序保証など「しないこと」も書かれていない。

## 良い点

- architecture.md 第4段落の依存方向（SDK → transport/codec、Release Desk → SDK、coordinator は Release Desk に依存しない）と、組織境界を admission で検査することの明示。
- api.md の Scope と「makes no writes and starts no external operation」は、narrow reference として正確で読みやすい。
- api.md の「NotFound / Unavailable のどちらも外部作業の有無を確定しない」は、誤読を防ぐ良い注記。
- index.md の読書経路（architecture / first-run / api）と、first-run.md の「即時完了を約束しない」。

## 不確実性

リンク先（host setup guide、executor reference）は抽出外であり、そこに provisioning や adapter protocol の詳細があるかは判断できない。指摘 3・4・6 は、抽出内の文書だけで読者が判断できるかに基づく。指摘 1 と 2 は、リンク先に定義があれば弱まる。
