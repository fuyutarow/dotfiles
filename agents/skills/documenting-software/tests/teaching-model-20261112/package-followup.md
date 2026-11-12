# 追跡レビュー: documenting-software 教材モデル改訂 (2026-11-12)

前回の review.md は保存したまま変更していない。今回は、変更された conditional-source 注記と teaching-model README、baseline のバイト比較、および前回の 2 件のブロッカーを確認した。

判定: 前回のブロッカー 1 は取り下げる。ブロッカー 2 は明示的な限界記述として収まり、ブロッカーとしては解消。残る修正は 1 件（存在しない成果物への参照）である。

## 再確認

1. **基準線（前回ブロッカー 1）: 取り下げ。**
   - `.agents/doc-teaching/baseline-skill.txt` と `committed-baseline-skill.txt` は `cmp` で完全一致（exit 0、sha256 a71a94ba…）。
   - `teaching-model-20261112/old-description.txt`（sha256 67ae829…）は、コミット版 SKILL.md の frontmatter と語の並びが一致する。差は折り返し位置だけ。
   - `responsibility-input/old-description.txt`（sha256 91f46313…）は別の文面（操作トレースを重視する reader-discovery 系）で、別 fixture である README の区別は正しい。
   - 限界: 私は `jj file show -r 37d43469` を実行できなかった（サンドボックスでは jj の import ロックが読み取り専用で失敗）。コミット版のバイト照合は作成者の readback に依存する。

2. **分類 trigger（前回ブロッカー 2）: 限界として明示され、解消。**
   - SKILL.md の conditional-source 注記は「description-only の結果は記録された task を覆うだけで、本文の全手順は覆わない。短い description は、以前の混在主張の分類の挙動をまだ再検証していない」と述べる。前回求めた (b) の趣旨に当たる。
   - 残る限界: 最終 description は依然として分類を選択の trigger に持たない。混在主張の task で本スキルが選ばれないリスクは残る。これは本文の不備ではなく、採用判断として coordinator が受け入れるかを決める事項である。

3. **reference の評価の絞り込み: 正しく反映。**
   - README の記述（initialization や全 lesson を要求しない、ReadError の列挙と再試行の回数・待ち方は task 次第で、運用ガイドに属しうる）は `reference-final.md` と一致する。

4. **改訂で増えた問題: 存在しない成果物への参照。**
   - README は「`gate-land-output.txt` retains the aggregate's output」と書くが、`.agents/doc-teaching/` にそのファイルはない（`gate-land.log` と `gate-land-final.log` のみ）。`results/` は空。これは「dangling reference」に当たるが、影響は小さい。修正: `gate-land-final.log` を指すように直す。
   - README の「results are appended before handoff」も、実際の結果は 20261112-revision.md にある。README 側に相互参照を置くか、文言を直す。

5. **長さの主張: 成立するが余裕はわずか。**
   - SKILL.md は 10456 字、baseline は 10527 字で、差は 71 字（約 0.7%）。「shorter」は文字通りには正しいが、実質的な差ではない。「ほぼ同じ長さ」と書けば誤解がない。

## 未確認

- コミット版のバイト readback（jj）。
- package check の終了コードと worker の exit 0 の記録（自己申告のみ。logs は読んでいない）。

## 結論

命題は条件付きで支持される。前回の 2 件のブロッカーは、前者は取り下げ、後者は限界記述として解消。上記 4 の参照修正と、5 の長さの表現の調整を行えば、残る整合性の問題はない。
