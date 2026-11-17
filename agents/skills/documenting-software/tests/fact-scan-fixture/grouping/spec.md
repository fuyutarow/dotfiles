# Spec

要求の署名は、用途、body の全体、期限（最大 10 分）に結び付きます。

導出 ID は、キーを知っている object を 1 件引く仕組みです。

Record の本文は 16,348 bytes までです。

OwnerCap は root ごとに 1 つです。Grant の holder は、発行後に差し替えられます。

mainnet の Worker の設定はありません。公開後の変更は upgrade で行う方針ですが、実装済みなのは古い版の拒否と、データの移行です。

| 項目 | 状態 |
| --- | --- |
| mainnet での運用 | 未確認 |
| Grant の保有者 | 発行後は変更できない |
