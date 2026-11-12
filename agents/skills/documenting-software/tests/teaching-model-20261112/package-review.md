# 統合レビュー: documenting-software 教材モデル改訂 (2026-11-12)

判定: 条件付き不支持。命題「scope を保ち、主張が保存された証拠を超えない」は、ブロッカー 1・2 が解消されるまで支持できない。SKILL.md の source 参照と境界記述に整合性のブロッカーは見つからなかった。

## 確認済み

- SKILL.md の frontmatter は `tests/teaching-model-20261112/final-description.txt` と同一文面（sha256 b84b626…）。
- `references/` の 8 件はすべて存在し、読み分け表の対応も一致する。XS-S/D/P/C の定義も references の用法と合う。
- sok_id（01a1ce2b…, 01a1cb81…）は SKILL.md・revision・source-audit で一致。DPR-085 の欠陥は source-audit に記録され、本文はそれに依拠していない。
- 内部参照（tests/20261112-revision.md、teaching-model と reader-discovery の README、20261112-source-audit.md）は解決する。
- heldout-new（v4 の出力）の算術は正しい。0b0010 & 0b0110 は非ゼロで true、0b1000 は false、scope 不一致は false。自動強制・継承・AND・deny は導入されていない。heldout-old は worked example を持たず、README の記述と一致。
- README の run 表は 13 件で、「13 件すべて exit 0」の数とも合う。

## ブロッカー

1. **基準線の同定が誤記されている。** `teaching-model-20261112/README.md` の Conditions 節は baseline を dotfiles 37d43469 の maintained SKILL.md とする。しかし比較の old 側 description（`old-description.txt`、sha256 67ae829…）は brief の baseline-skill.txt と同一文面で、20261112-revision.md 自身が「parent 316ad41e の公開 description ではなく中間候補」と述べる。したがって Gatelet の「baseline より改善」と「entrypoint が baseline より短い」（SKILL.md 10286 字、baseline 10527 字、wc -m）は、インストール済み guidance ではなく中間候補に対するものである。受入条件: README の基準線記述を実際の比較対象（中間候補のハッシュ）に直す。インストール済み本文との比較を行うまでは「改善」と書かない。coordinator は `git show 37d43469:agents/skills/documenting-software/SKILL.md | sha256sum` と baseline-skill.txt の照合で確定できる（私は git を実行できない）。

2. **選択用 description から混在主張の分類 trigger が消えた。** 中間候補の description は「consumer guarantee / implementation / contributor rule / editorial record に分類する」を持ち、その版で responsibility の改善が観察された。最終 v4 の description にはこの語彙がなく、分類は本文の表にだけ残る。README はこの結果が最終 description を検証しないと認めている。よって「shorter entrypoint が責務境界を保つ」は本文に限れば成り立つが、選択段階では保証されていない。受入条件: (a) 分類の短い trigger を description に戻し、description-only の検査を再実行する、または (b) 最終 description は混在主張の分類について選択根拠を検証していないと README と SKILL に明記する。

## 限界（ブロッカーではない）

- 評価は synthetic な Gatelet 1 件。case の選択は同じ作成者による。Relay の最終 review（review-final.md）は worked operation を示さず、review 精度の改善は確認できない。README のこの扱いは正確。
- 本文の「explanatory or site review では walkthrough を含める」は本文全体として未評価（README も明記）。
- 20261112-inputs.sha256 の 7 件は `.agents/doc-model-eval/` 配下で、本パッケージに存在せず再計算できない。README はこの再現限界を認めている。
- reference-final.md は全 ReadError の列挙と再試行の回数・待ち方を求めており、narrow reference の境界をやや超える。README の「範囲内」という判定は強すぎる。
- teaching-model README 末尾は package check の結果を「appended before handoff」とするが、結果は 20261112-revision.md にあり README にはない（相互参照の不備。軽微）。
- package check（skill-check、rumdl、gate:land）の終了コードと run の exit 0 は自己申告で、raw receipt が無い。私は再実行していない。

## 判定

命題は現時点では条件付き不支持。ブロッカー 1 は記述の修正で、ブロッカー 2 は description の再検査か限定表記で解消できる。どちらも本文の source 参照や境界記述を変更する必要はない。
