# doc-reader-baseline-1112 レビュー

範囲: `baseline-description.txt` と `input/` の7ファイルのみを読んだ。リポジトリ検索、他のスキル、未提供のリンク先は使っていない。変更したのはこのファイルだけ。

## A. 文書構造と有用性（抜粋6ページ）

### A-1 確認できた問題（本文の記述に基づく）

1. **答えが遅い。** `heritage-overview.md` は1〜8行目が読者・確認基準・再編前版IDの説明で、「何のための製品か」（9〜11行）に届くのは冒頭から約10行後。納品範囲を判断する読者は、先に製品の目的を読めない。
2. **作業記録が本文に混ざる。** `spec-index.md` 77行「今回の再編は本文と機械 source の保存先・形式・consumer 接続を変更します」は、公開読者が判断に使う情報ではない。`architecture.md` 81行の照合版 `84abe02edea1` も同様で、変更履歴の置き場所として分けるべきもの。
3. **入口の説明と導線が合わない。** `site-index.md` 9行は「基盤」に「汎用 db・Move API、問いの設計、公開操作の命名、スキーマ設計」を並べるが、リンクは `architecture.md` の1つだけ。読者は各項目への経路をこの抜粋からたどれない。
4. **独立利用の手順に検査用コマンドが入る。** `db-guide.md` 59〜63行は heritage の localnet と publish に依存するコマンドで、同じ節の59行自身が「db の package だけで完結する」ことを否定している。独立利用者が「接続から読戻し」まで自力で通せるかは、この文書では判断できない。
5. **接続設定の要件が矛盾して読める。** `db-guide.md` 26行は「`connect` の型では URL 二つを必要とし」、同じ行で「plain/sealed consumer は Walrus を使わない」とも書く。平文 Record だけを使う読者が Walrus 設定を省けるかは確定できない。
6. **結果不明の次の行動が書かれていない。** `db-guide.md` 83行は `CommitExecutionUnknown` を「失敗確定や再送可能へ変換しない」とだけ述べる。98行は「通常の db submit を直接呼ぶ別経路は、再起動後に自動で閉鎖されない」と書くが、再起動後に通常の submit を再び呼んでよいかの結論は無い。その判断は93〜96行の consumer 例に隠れている。
7. **第5節と第7節が過密。** `db-guide.md` 第5節は表・段落・手順・検査範囲・コマンドが連続する。第7節の表は4列で、`heritage_usecase_ids` や rule `one-transaction` など文化継承固有の語を、独立利用の手引きに含む。
8. **PO 向けの ID が説明なしで並ぶ。** `heritage-overview.md` 32〜48行の A01–A24、A-COLLAB-1–4、I-MULTI-GRANT、「10/23 の追加決定」「後続決定」は、この文書の中では内容が分からない。62行「I-VIEWLOG（後続決定で保存方式を変更）」は現在の方式も示さない。

### A-2 読者の誤認を防いでいる点

- `architecture.md` の責務表と「読む・組む・保存する・確定する」の段階表は、各段階で「成立していないこと」を明示している（37〜45行）。
- `infrastructure.md` 17行と45行は、保存成功・参照確定・復号許可を別の確認として区別している。
- `heritage-overview.md` 52行は、要件表が19ページの原子化ではないと限定している。

### A-3 疑い（確定はしない）

- `spec-index.md` 40行は「原資料を包括的に公開サイトへ複製しません」とするが、54〜69行は財団提出 xlsx、財団向け設計書、MIL-J-8279G 原資料などへのリンクを並べる。公開可否は抜粋からは判断できない。
- `architecture.md` 3行「別のアプリも…db の機構を利用できます」は断定が強い。`db-guide.md` 121行の localnet 限定、`infrastructure.md` 52行の未決事項と比べると、範囲が揃っていない。
- `infrastructure.md` 39行の mainnet 費用負担の未決と、他文書の「本番」記述との関係は確定できない。

### A-4 抜粋では確定できないこと

`db.md`、`db.toml`、`product.toml`、`audit.md`、`design-questions.md`、`acceptance.md`、`layers.toml` などの存在と内容、`spec-index.md` 9行の「問いの設計」「スキーマ設計」の参照先、`sources/` の実在、`spec:check` の結果。いずれも存在しないとは仮定しない。

## B. `narrow-reference.md`（既設定の caller 向け API 参照）

確認できた点: 戻り値、`NotFound` と `Unavailable` の意味、読取だけで書込を行わないこと、読取結果で write を再送しないこと、の注意が明記されている。

疑い:
1. 「visible receipt」の visible が未定義。権限が無い caller に `NotFound` が返るのか、存在しない場合と区別できないのかが読めない（行10）。
2. `ReceiptId` の「validated identifier」の取得方法と、検証失敗時に `Err` か例外かが書かれていない（行6, 8）。
3. `LookupError` が `NotFound` と `Unavailable` だけで網羅されるかが不明（行10）。
4. `Unavailable` 後に同じ読取を再試行してよいかが書かれていない（行10）。
