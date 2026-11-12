# 文書レビュー: Relay 抜粋 (review2)

対象は index.md / architecture.md / first-run.md / api.md の4ページのみ。host setup guide、executor reference、component API contracts は抜粋になく、内容は不明である。以下で「無い」と言う箇所は抜粋の中に無いという意味に限り、別ページに書かれている可能性を残す。

## 有用な点

- index.md (L10-11) は各ページの役割を振り分けている（architecture=構成、first-run=最初のジョブ、api=exact lookup）。読み手は次に読むページを迷わない。
- architecture.md (L27-29) は「coordinator の completed」「host の receipt store」「SDK の command receipt」を分けている。何が何を証明するかを区別している点は、この文書の最も価値のある部分である。
- api.md (L62-66) は getRun が読み取り専用で外部作業を始めないと明記し、NotFound と Unavailable のどちらも外部作業の有無を確定しないと書く。再試行できる条件も示している。副作用の境界を読み手が誤らない書き方になっている。
- first-run.md (L54) は「提出と一回の参照では完了を約束しない」と境界を示している。

## 主要な問題

1. **「completed」を誰が付けるかが読めない**（architecture.md L27）。「completed は authorized operator が送った completion command を記録する」とあるが、executor の実行結果がどのように completed へ反映されるかは抜粋に無い。読み手は、外部作業が失敗しても operator が completed を送れるのか、executor が自動で completed にするのかを判断できない。運用上の判断（完了を信じてよいか）に直結する。

2. **「Operator」と「operator」が衝突している**（index.md L11、architecture.md L18、L27）。大文字の Operator capability（権限）と小文字の運用者が同じ語で指されている。first-run.md (L37) では host provisioning が作るとあるが、Operator が何で、誰がどの段階で作るのかは抜粋内で定義されない。

3. **first-run.md の例は、そのままでは動かせない**。L37 の「local coordinator から始める」に起動手順が無く、executor の起動方法も示されない（L52 は「running であること」だけ）。connect / submit / getRun の import も無い。`releaseDesk.validate` の戻り値（例外か Result か）も不明なため、L42 は error 処理なしで submit に渡している。さらに L44 は `submitted.ok`、L46 は `run.isOk()` と二種類の判定が混在し、読み手は両者が同じ Result 型かを判断できない。

4. **提出後に何を観測すれば成否が分かるかが無い**（first-run.md L44-48, L54）。submit 直後の status（queued などか）、どれくらい待つか、どう完了を確認するかが示されない。読み手は「queued のまま」が正常な待機なのか停止なのか区別できない。

5. **what-if が一つも無い**。executor 停止、revision 不一致、権限不足、submit のタイムアウト後に再提出してよいか（二重実行の可否）は、どのページの抜粋にも無い。architecture.md L29 は「exact admission behavior は component API contracts が正本」と言うが、その本文は抜粋に無い。api.md は getRun だけを扱い（L58-60）、submit のエラー型も示さない。ただし first-run の例は `submitted.error` を表示しているのに、その型が示されないため、読み手は分類ごとの対処を決められない。

6. **Release Desk への依存が初回経路に入っている**。index.md は「Release Desk なしでも使える」（L10）と言うが、first-run.md の例は Release Desk の validate を前提にし、自分のアプリのスキーマへ置き換える説明は L51 まで出てこない。一般の SDK 利用者は、例のどの部分を差し替えるかを例から導けない。

7. **保証と設計が一つの段に混ざっている**（architecture.md L15-33）。「admission は expected revision と organization 境界を確認する」（保証）、「adapter は差し替え可能」「components は別々にデプロイできる」（設計）が同じ段落にある。何が破られると契約違反になるかを読み手が区別しにくい。

8. **payload の取得経路が書かれていない**（api.md L63 "The payload is omitted"）。読み取りで payload が必要な場合に、別 API を使うのか、architecture.md L22-23 の decode 経路を使うのかが分からない。

## 不確実性

抜粋は4ページだけなので、上記 1、4、5、8 の一部は、リンク先の host setup guide、executor reference、component API contracts に書かれている可能性がある。本レビューは「抜粋内に無い」ことまでしか確定できない。

## 総評

入口のルーティング、副作用の境界、receipt の区別は読み手の判断を助けている。一方で、「誰が完了を決めるか」「提出後に何を見れば成否が分かるか」「失敗時にどうするか」は、抜粋の範囲では読み手が自力で行動を決められない。まず first-run.md に最小の起動手順と一つの what-if（executor 停止時の status）を足し、architecture.md に completed の決定者を一文で書くことを勧める。
