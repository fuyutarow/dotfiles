# 査読結果 review3（Relay 文書抜粋）

## 結論

抜粋は、読者が「何が保証され、何が保証されないか」を判断する骨格を持つ。最も有用なのは api.md の getRun である。読み取りのみで外部作業を起こさないこと、NotFound と Unavailable のどちらでも外部作業の有無は分からないことを明記しており、読者は再試行や表示の判断に使える。一方、completed の意味、承認の強制境界、Result 型の表記に未定義が残り、誤用を招きうる。

## 有用な点

- **api.md「getRun(id)」**: 「makes no writes and starts no external operation」「Neither result establishes whether external work happened」は、各結果の意味を具体的に示している。
- **first-run.md**: 成功だけでなく失敗分岐（`submitted.ok` の else、`run.isOk()` の else）まで示し、「does not promise immediate completion」と即時完了を約束しないと明記している。
- **index.md**: 冒頭で Relay の役割を述べ、architecture / first-run / api の各ページに読者の用途を割り当てている。ページ責務が先に示されている。

## 主要な懸念

1. **completed の意味が二通りに読める（architecture.md 第3段落）。** 「completed records the completion command sent by an authorized operator」と「host receipt store records the external operation's receipt」が並ぶが、completed は外部作業の成功なのか、operator が完了を記録しただけなのかが区別されていない。読者は completed を外部成功と誤読し、first-run.md の `displayStatus` で完了と表示しうる。「completed は operator の記録であり、外部成功は receipt で確認する」の一文が必要。

2. **承認の強制境界が読み取れない（architecture.md 第2・3段落）。** Release Desk が承認を検証し、coordinator は payload を解釈しないとされる。SDK を直接使うクライアントが未承認の payload を送った場合に拒まれるかは、抜粋からは分からない。承認が保証なのか Release Desk の規約なのかを、読者は判断できない。抜粋外の文書に答えがある可能性はある。

3. **Result 型の表記が不統一（first-run.md 44–47行）。** submit は `submitted.ok` と `submitted.value`、getRun は `run.isOk()` と `run.value` / `run.error` を使う。同じ SDK に判定方法が二通りあるように見え、どちらを真似るべきか読者は判断できない。型が異なるなら、その理由を一文で示すべきである。

4. **submit 成功の意味が未定義（architecture.md 第3段落）。** 「SDK submission success returns a command receipt」とあるが、receipt が受理、永続化、キュー投入のいずれを示すかは書かれていない。first-run.md は jobId を得た後に getRun へ進むが、submit 成功直後に getRun が NotFound を返しうるかは不明である。

5. **revision 競合の扱い（architecture.md 第1段落）。** 「expected revision」の不一致が submit の error としてどう現れるか、`displaySubmitError` で利用者に何を伝えるかが書かれていない。revision を誰が指定するのかも不明である。

6. **decode 失敗の扱い（architecture.md 第4段落と api.md 62–66行の不一致）。** 他クライアントの Job は「decoding validates the expected application schema」とされるが、api.md の ReadError は NotFound と Unavailable しか挙げていない。不正な payload に当たったとき getRun が何を返すかは読めない。

7. **cross-org の読み取り規則（api.md 64行）。** 「visible to this caller」の基準が書かれていない。他組織の Job は NotFound になるのか、別の拒否になるのかが分からない。

8. **executor の所在（architecture.md 第3段落、first-run.md 52行）。** 「executor must be running」とあるが、Relay が executor を提供するのか、各 host が必ず作るのかは抜粋からは判断できない。executor reference は抜粋外である。

9. **保証と設計の混在（architecture.md 第4段落）。** 「Organization boundaries are checked at command admission」は保証だが、同じ段落で配置の自由（deploy 可能）という設計と並んでいる。保証として読むべき部分と、設計として変更しうる部分を分けると、読者は前提を誤らない。

## 不確かさ

抜粋は four pages に限られ、host guide、executor reference、component API contracts は含まれない。上の懸念の一部（承認の強制、ReadError の完全な型、admission の詳細）は、それらのリンク先に答えがあるかもしれない。本査読は、抜粋内の文言だけを根拠にした指摘である。
