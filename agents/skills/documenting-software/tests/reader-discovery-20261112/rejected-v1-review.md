# doc-reader-candidate-1112 レビュー

読んだ入力は、assigned description（candidate-description.txt）と `input/` の7ファイルだけです。連結先（db.md、db.toml、product.toml、decisions.md、audit.md、`/spec/readme/` など）は extract に無く、確認していません。以下の「見つからない」は extract 内で見つからないという意味で、連結先の不在を断定しません。ソースと設定は変更していません。

## A. Coralbase 公開 extract 6 ページの構造と有用性

対象は site-index.md、spec-index.md、architecture.md、db-guide.md、infrastructure.md、heritage-overview.md です。

### 確認できた問題（本文の記述で確定）

1. **入口が二つあり、役割が曖昧**: site-index.md は「仕様の読取専用ビューの入口」、spec-index.md は「Coralbase の仕様と設計の案内」と名乗り、項目も重なります。site-index.md の「基盤」行は7トピックを一行に詰めています。db を直接使う読者の入口である db-guide.md は、site-index.md からリンクされていません。architecture.md 23行を経由するしかありません。
2. **冒頭が答えでなく、版管理**: heritage-overview.md は3行目で「文書の種類は解説」、5行目で確認基準と再編前の版ハッシュを述べます。PO が知りたい「何のための製品か」は9行目以降です。description が求める「技術的な答えから始める」に合っていません。
3. **能力の断定と検証の限定が食い違う**: architecture.md 3行目は「別のアプリも…db の機構を利用できます」と無条件に書きます。一方、architecture.md 65行は「独立利用での一連の経路の実証」を設計上の課題としています。db-guide.md 121行は公開 testnet の成功を保証しないと書きます。独立アプリの計画者が冒頭だけを読むと、検証済みだと誤読するおそれがあります。
4. **同じ境界の三重記述**: 「blob の保存成功」「Record の参照確定」「復号許可」は別だという説明が、architecture.md 11・47行、infrastructure.md 11・21行、db-guide.md 130–136行にあります。一箇所を変えると他が古くなります。
5. **Walrus 要件の矛盾に見える記述**: db-guide.md 26行は `connect` の型が Walrus の URL 二つを必要とすると書きます。同じ行で、plain Record の consumer は Walrus を使わないとも書きます。13–17行のコード例は walrus 設定を並べています。plain だけを使う読者は、dummy 値を入れてよいのか、実 endpoint が要るのか判断できません。
6. **手順と実施記録が混在**: db-guide.md 75行は「commit の code を読んだ補足」、89行は「localnet で検査しました」と書きます。93–98行の「確認した consumer の手順」は、読者が実装すべき規範か、一例の記録かを示していません。89行の「app/host が操作の記録を保存し」は義務のように読めます。独立利用者が署名前の保存を必要とするのかが判断できません。
7. **版・経緯が読者向け本文に入る**: architecture.md 81行の照合版ハッシュ、spec-index.md 75・77行の再編説明、heritage-overview.md 62行の「後続決定で保存方式を変更」(I-VIEWLOG) があります。I-VIEWLOG は現在の保存方式を本文に書いていません。現行規則を読者が確定できず、経緯は records 側に寄せるべきです。
8. **判断の答えが外部 ID に依存**: heritage-overview.md 40–48行の表は A01–A24、I-MULTI-GRANT、ROLE-01 などで答えを返し、定義は extract 外にあります。「閲覧者は修正履歴を読めるか」の答えは UC3 を経由して product.toml を読むことになります。
9. **層の説明が読者の判断に届かない**: architecture.md 17行は「インフラ・業務・表層」を論理区分とし、同じ段落で package 名では判定しないと書きます。77行の L-CORE-STORE などの追跡 ID と、31・77行の DPP 過去版（`36e9c754`）の参照は、PO の判断には使えません。契約側へ移すべきです。
10. **公開範囲に疑い**: spec-index.md 40行は「原資料を包括的に公開サイトへ複製しません」と書きます。一方、56–69行は財団提出 xlsx や「【提出】」を含む原資料 15 件へのリンクを並べています。公開対象として適切かは、extract からは確定できません。公開者の確認が必要です。
11. **運用詳細と採用の決定の不足**: infrastructure.md 39行のスポンサー禁止条件（GasCoin、Coin 型、FundsWithdrawal）は、PO には不要です。他方、52行は接続先（RPC、Seal 鍵サーバー、Walrus）を「このページだけで確定していない」とし、採用者が次に何を決めるか分かりません。

### 読者ごとの結果

- **PO**: heritage-overview.md の冒頭と権限表から、要件の現在地を一度で掴めません。
- **独立 db 利用者**: site-index.md から db-guide.md に直接たどれず、architecture.md 3行目を信じると、検証外の回復経路で詰まるおそれがあります（推定）。
- **開発者**: db-guide.md 第5節の手順の義務性が読めず、実装範囲を決めにくい状態です。

### 確認できないこと

- 連結先の内容と存在。`/spec/readme/` の内容と、narrow-reference.md からのリンクの有無。
- `Receipt` の語が db の公開名か、旧名か別名か。

## B. narrow-reference.md（exact API reference）

**確認済み**: 一回の読取で書込みがないことを明記しています。`NotFound` と `Unavailable` は書込み失敗の証明にならず、その読取から再送しないよう指示があります。例も基本的に十分です。

**確定した欠陥**: `Receipt` と `inspectReceipt` の語は、同じ extract の db-guide.md にありません。そこでは `readRecord`、`connection`、`Record` が使われています。呼出し側は、同じ読取か別の API かを判断できません。

**不確実な欠落（推定）**:
1. `ReceiptId` が「validated identifier」とされますが、検証の関数、生成元、import が書かれていません。
2. 「current receipt」が直前の submit 後にどう見えるか（NotFound がどの程度起きうるか）が書かれていません。
3. `LookupError` の型名と網羅性が不明です。
4. 例の `render`、`showLookupError` は未定義です。`Result` の import も示されていません。
