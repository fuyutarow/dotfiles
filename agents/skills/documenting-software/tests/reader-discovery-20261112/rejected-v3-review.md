# Task A: 読者別の文書レビュー（抽出6ページ、読み取りのみ）

## 結論

入口（site-index.md）と目的表（spec-index.md）は、読者の問いから章へ誘導できている。一方、db を独立に使う開発者・host 運用者は、最初の一手（接続の作り方、plain-only の設定値、再起動時の扱い）に必要な答えを複数ページへ分散して探す必要がある。以下は抽出内のテキストで確認できた事項と、抽出外のため判定できない事項を分けて示す。

## 読者と問い

1. 独立採用の開発者: 「db で最小の plain Record を保存・読戻しできるか」
2. host 運用者: 「何を用意し、何が未決か」
3. PO・事業担当: 「文化継承版で何が納品対象か、閲覧記録の現行規則は何か」
4. 検収者: 「どの版・環境で何を確認したか」

## 確認された問題（テキストで確定）

- **db-guide.md §1 のコード例**: `connect(deployment, endpoints)` の例で `rpcUrl`、`sealKeyServers`、`sealThreshold`、`walrusEpochs` が定義されていない。直後の表で供給元は分かるが、例をコピーして動かす読者は初回で止まる。
- **db-guide.md §1 表（walrus 行）**: `connect` の型は publisher と aggregator の URL を必須とする。一方、plain-only の利用者が何を入れるべきかは示されず、「ダミー URL を blob 保存の設定例へ流用しない」とだけ書かれている。独立採用の最初の判断が本文で閉じていない。
- **db-guide.md §1 表（deployment 行）**: 既定 network が localnet であり公開網では明示せよ、という注意が表の一行に埋まっている。例には network が現れないため、公開網の利用者が見落とす読み方が生じ得る。
- **db-guide.md §3 冒頭と §5**: 「heritage の業務 UC を実装する必要はない」と述べつつ、検査の起動が `packages/heritage/localnet/with.ts` と `heritage/scripts/publish.ts` に依存する。依存は「host/tool の依存」と注記されているが、独立利用者は heritage の起動口を前提にすると読みやすい。
- **再起動後の非保証が分散**: db-guide.md の 87・89・98・121・136 行で同じ趣旨（通常の `connect().submit` は再起動後に自動回復しない）が繰り返される。一箇所の要約表がないため、読者は全体の結論を一度で確認できない。
- **architecture.md の host 判定（13・17 行）**: host は「独立した package 名ではない」とし、apps/web には UI と server 入口が同居すると書く。判定は「どんな知識と効果を持つ処理か」とだけ示され、運用者・開発者がどのファイルを host 責務と見るか、本文に手がかりがない。
- **heritage-overview.md の閲覧記録（48・62 行）と協力者（32・34 行）**: I-VIEWLOG は「後続決定で保存方式を変更」とされ、ROLE-07 や「協力者」の意味は 10/23 の追加決定に依る。PO が閲覧記録の現行規則を本ページだけで確定できない。同ページは「下書き不採用」など決定の経緯を概要へ混ぜており、目的の説明と記録が混在している。
- **編集上の記録が読者ページに露出**: 版ハッシュ（`84abe02edea1`、`04f88fce3a75`、`0f35029c6ee5`）、「再編前の仕様」、「確認基準は 2026-11-12」が各ページ末尾にある。読者向けの確認基準としての意味は説明されず、本文の要求・解説と区別された一覧もない。
- **章の呼称のずれ**: site-index.md の「問いの設計」と spec-index.md・architecture.md の「取得と検索」、site-index.md の「監査の読み方と確認範囲」と spec-index.md の「監査記録」が対応しない。読者が同じ章を別名で探す可能性がある。
- **narrow-reference.md の語彙**: `inspectReceipt` / `Receipt` / `ReceiptId` は、抽出内の db 説明（Record、`readRecord`、`openRecord`）と語が一致しない。同じ API か別の API かは抽出から判定できない。`NotFound` は「見える receipt が無い」と定義されるが、「見えない」の範囲（権限による不可視か不在か）が本文にない。

## 確認できないこと（不確実。欠落とは判定しない）

- db.md（S1〜S12、Q5、UC17 等の ID）、getting-started guide、decisions.md、schema-design.md、query-design.md、各 toml は抽出外。ID 参照の意味と、リンク先の内容は未確認。
- product.toml の「業務・PO」と「開発者」の二つの view の違いは、抽出からは見えない。
- infrastructure.md 52 行は、接続先・鍵サーバー・RPC 提供者などの運用者決定を本ページで確定しないと明記している。運用者向けの一覧が別にあるかは未確認。
- architecture.md 3 行の「別のアプリも… db の機構を利用できます」は、db-guide.md 121 行の「公開 testnet の保証なし」と並べると、どこまでを実証と読むべきかが読者に不明瞭になり得る。これは推測であり、抽出内で矛盾とは断定しない。

## 強み

- spec-index.md の「目的から選ぶ」表と architecture.md の「契約を確認する場所」表は、問いから章・契約へ直結している。
- db-guide.md §5 の表は、`CommitAlreadyAttempted` や `CommitCheckpointPending` などを、成功・失敗・結果不明に分けて具体的に示している。
