# reference.md（getRun(id)）のスコープ付きレビュー

対象は `api.md — getRun(id)` の一ページのみ。提示文書の範囲で評価した。

**判定:** 宣言スコープは保たれている。文書は「Relay client を設定済みの呼び出し元」向けの正確な lookup として書かれており、システム全体の教育や初期化手順を求める必要はない。

**根拠（文言）:**
- 3行目 `Scope: ... Setup is in the host guide.` が、設定を別ページに委ねる境界を明示している。
- 7行目「makes no writes and starts no external operation」が副作用の有無を明確にしている。
- 9–10行目の NotFound / Unavailable の意味と、「Neither result establishes whether external work happened」が、失敗時に読み手が取るべき判断（外部作業の有無は確定しない）を支えている。

**残る不確かさ（文書内では判定できないもの）:**
- `NotFound` の「caller に visible でない」が、存在しない ID と権限外の ID を区別しないのか、文書からは読み取れない。
- `ReadError` の型が他のエラーを含むか不明。
- `revision` の意味と、`queued/running/completed` 以外の status の有無が書かれていない。
- 「payload is omitted」の取得方法が本ページにない。
- 「first-run page」への参照先は、このレビューでは検証していない。

**結論:** 修正の必要は見当たらない。上の不確かさは、本ページの範囲を広げずに参照先で埋まるかを確かめるべき点である。
