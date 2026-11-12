# doc-reader-final-1112 レビュー

結論: 割当の説明文は、読者の洗い出し、ページの責務、保証・設計・コーディング規則・編集記録の区別という観点で、指定範囲内のレビューを導けた。確認したのは説明文・入力 7 ファイル・regression 3 ファイルの本文だけである。リンク先（db.md、product.toml、audit.md、data-schema.md など）は未読のため、そこに記載がないとは断定しない。

## A. 抜粋 6 ページの構造と有用性

想定読者（本文から読み取れる範囲）: 独立した db 利用者（開発者）、基盤の利用可否を判断する PO・事業担当、文化継承版の検収者、host 運用者、寄稿者。

### 確定できる問題

1. **読者宣言の位置が統一されていない。** `architecture.md` は 79–81 行目の「文書情報」、`infrastructure.md` は 54–56 行目に読者を書く。`heritage/overview` の相当箇所は 3 行目、`db-guide.md` には宣言がない。検索で着地した読者は、本文の末尾まで読まないと対象かどうかを判断できない。
2. **入口が二つあり、役割が重なる。** `site-index.md` は「仕様の読取専用ビューの入口」、`spec-index.md` は「仕様と設計の案内」で、どちらも基盤・文化継承・開発・記録への振り分けを持つ。両者の関係は書かれていない。`spec-index.md` の 77 行目は再編の変更記録（保存先・形式・consumer 接続）で、利用者の判断に寄与しない。
3. **入口に編集者向けの設定が混ざる。** `spec-index.md` の 36–40 行目は knip 例外、import 例外、Query gate 例外を、製品の業務条件と同じ「所在」の表に並べる。一方、52 行目の「spec:check は形式・相互参照を確認し、本文の理解は証明しない」は、確認範囲を正しく限定している。
4. **独立利用の主張と検証手順の依存先が合わない。** `architecture.md` 3 行目は「別のアプリも db の機構を利用できる」と述べ、25 行目は db が repo 内 package で `private: true` を外部導入の実績と読み替えないとする。`db-guide.md` 59 行目の検査起動は `packages/heritage/localnet/with.ts` と `packages/heritage/scripts/publish.ts` に依存する。db 単独で導入・起動できるかは、この抜粋からは判断できない。導入手順が別ページにある可能性は未確認である。
5. **読者が判断に使う語が定義されないまま使われる。** `architecture.md` 41 行目の「TxDraft」「Handle」、`db-guide.md` の表の「S3」「S4」「Q5」、`heritage-overview.md` 25–32 行目の「ROLE-01」〜「ROLE-07」「LiNK・UPDATER」「後続決定」。読者は別ページの番号を追う必要がある。
6. **監査者の作業状態が本文に残る。** `db-guide.md` 75 行目は「読んだ補足」、158 行目の表は「読んだ範囲」と書く。どこまでが保証で、どこからが作成者の読解かを、読者は判定できない。
7. **文化継承の判断材料が概要に出ない。** `heritage-overview.md` 19 行目はユーザーストーリー（T1–T10）を product.toml 参照で済ませ、製品の範囲を判断するには別ファイルが必要になる。62 行目「閲覧記録（後続決定で保存方式を変更）」は、変更の内容が本ページにない。

### 有用な点

- `db-guide.md` は冒頭で「接続先・配備・操作者を host が用意し」と技術的な答えから始め、第 5 節の表で `CommitCheckpointPending` が「後続の割込みや新規送信で解決しない」と明記する。
- `infrastructure.md` 47–53 行目の「blob の保存成功、参照の確定、整合性、復号許可は別の確認」は、読者の誤解を防ぐ。
- `architecture.md` 51 行目「定義の hash が一致していることは、読者の権限の証明ではありません」は保証と権限の区別として明確である。

### 不確かな疑義（確定ではない）

- `db-guide.md` 第 5 節は、通常の `connect().submit` の利用者が `CommitExecutionUnknown` を受けた後に何をするかを一行で示していない。「自動復元や再送防止を追加したものではない」と述べるに留まる。リンク先の API 参照に次の手順があるかは未確認である。
- `db-guide.md` 37 行目は、`beforeSign` を使うには `createSigningAndSubmit` を使うと示すが、その呼出し形は同ページの第 5 節（consumer の回復手順）で説明されず、読者は呼出し方を別に探す必要がある可能性がある。

## B. narrow-reference.md（exact API 参照）

確かな点: 「one read and makes no writes」と書き、`NotFound` と `Unavailable` が書込み失敗を証明しないと明記し、「Do not resend a write based on this read」と誤操作を防ぐ。

疑義（未確定）: (1) `ReceiptId` の検証失敗が `LookupError` に含まれないため、呼出し側がどう扱うか不明。(2) `NotFound` が「存在しない」と「読めない」の両方に使われるかが書かれていない。(3) `revision` の意味が未説明。(4) 判定は `result.isOk()` と `result.error` だが、regression の `api.md` は `result.ok` を使い、同じ Result 規約を二通りに示している。

## C. regression 3 ファイル（独立 SDK consumer の視点）

- **api.md**: 責務の分離は明確である。「It performs no writes and asks for no signature」「A protected body requires a read session supplied separately」は、読取と署名・セッションの境界を示す。ただし「a typed read failure」と言いながら列挙は `Unavailable` と `AccessDenied` の二つだけで、残りの失敗は読者に分からない。読取セッションの供給方法も書かれない。「callers already familiar with a record」は独立利用者が満たせるか判断できない。
- **architecture.md**: 「The SDK assembles and verifies the requests; the host supplies endpoints and signing capabilities; the application selects the content and its access policy.」は、`db-guide.md` の表と整合し、独立利用者に有用である。一方、「the table in this supplied extract」は抜粋作業の語で読者向けでない。L-STORE 等の層 ID は定義されない。「Retain the operation digest」は digest の出所を示さないが、`db-guide.md` 5 節は失敗 code に digest が付かず、保存済み bytes から求めると述べる。
- **schema.md**: 冒頭で読者と文書種別（developers、normative reference）を宣言するのは良い。しかし 8–12 行目の一段落に三種が混在する。保証（「return SchemaMismatch and perform no writes」）、設計（`LibraryZ.convertSchema` と `TypesFromSchema`）、コーディング規則（`as` の禁止と「our linter's restricted syntax rule」）である。独立 consumer は社内 linter を持たないため、規則の理由を再現できない。`LibraryZ` の解決先も示されず、`SchemaMismatch` をどの層が返すか（adapter か domain か）は 14–15 行目から断定できない。「This text adds no new requirements」と commit id `04f88fce` は、読者に不要な記録である。
