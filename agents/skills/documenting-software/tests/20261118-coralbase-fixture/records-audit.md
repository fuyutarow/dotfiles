# 監査記録の読み方

監査は、対象版で観測したことと、その根拠・処置・未確認を残す記録です。新しい利用者保証の正本や、現在の実装不在を断定する一覧ではありません。

## 観測の出典と名前空間

- [取得と責務の旧所見](retrieval-audit.toml) は、旧 layers の G 所見を元の ID と文面で保存します。現在のコードへの再検証は別に必要です。
- [セキュリティ監査](security.toml) は、それぞれの reviewed・status・severity と evidence を保持します。記録の移動だけでレビュー日を更新しません。
- 例えば retrieval/G1 と security/G1 は別の記録です。同じ G1 という文字列を理由に統合しません。
- G6/G6-MVP に含まれた発行・失効・スポンサーの業務上の義務は、[文化継承の製品契約](../heritage/product.toml) の constraints に残します。監査へ移したことで義務を弱めません。

## db の再起動回復 consumer の確認記録（2026-11-12）

公開 db API を組み合わせた consumer の検査記録です。利用手順と、新しい送信を許可・拒否する責任の境界は [db 利用手順](../platform/db-guide.md) 第5節を参照してください。ここでの合格は、通常の connect().submit の自動復元や、全アプリの再起動回復を保証するものではありません。

| 記録すること   | 内容                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 実行           | unknown 検査 run 2938d109-2913-46c0-9837-47e323a4f4b6 の候補 workspace。実 Sui/Seal の localnet で、plain/sealed と restart-recovery の2試験fileを同じ起動で実行  |
| 結果           | 15 pass / 0 fail、92 expect。localnet 全体 68.60秒。db の通常 submit へ永続回復を追加したという意味ではない                                                       |
| コードの統合先 | main e82c18ae9ad353ef68778344d9b1f72586dfcfda。この結果は主線上で再実行した値ではない                                                                             |
| 確認したケース | 署名前保存→子プロセス送信後終了→別プロセス照合・読戻し、保存intentの不一致/欠落/不正、not found、RPC障害、保存失敗、実chain失敗とfinality照合、送信可能な正常対照 |
| 帰属           | 判定根拠を返したdb read、保存失敗を効果前に止めるdb admission、新しい要求を塞ぐconsumer gateを分けて記録                                                          |
| 根拠           | 実行環境の agx run 内 verify-round-1-02.log と report.json、repository の db-outsider-recovery.test.ts と consumer helper。raw log は本repositoryに保存していない |

保存intentの書換えを拒否したことと、別identityのeffectsを注入して拒否したことは別で、後者の注入検査は実施済みとはしません。公開testnet、媒体の電源断耐久性、複数端末・並行プロセスの調停、全アプリの永続queueも、この結果の保証範囲には含めません。

## db ガイドから分けた未確認

以下は `8183526568e1:spec/db.md` に記録されていた確認範囲です。後続の試験結果を、この版の記録へ遡って足したものではありません。現在利用する際は [db 利用手順](../platform/db-guide.md) と、その版の consumer/検査の結果を合わせて確認します。

以下は、本文の契約として固定していない点です。読んでいない範囲の不在の証明ではありません。

- `createOpen`（scope）の効果は、本文で未読です。
- `recoverSerially` の保持範囲は §7 のコード観測であり、別プロセスでの回復・二重送信防止や、独立 consumer からの実 chain 回復の通し実証ではありません。
- `connect(...)` の `sealAuthorization.createSessionKey` は `Unsupported` を返し、`buildApprovalTransaction` は空 bytes を返す placeholder です（`packages/db/src/sdk/connect.ts:123-137`）。動作する認証入口として使用する例にはしません。`openSession` / `openRecord` とは区別します。この公開面を整理する判断は未実施です。
- independent consumer の localnet 起動・publish は heritage の道具を使用します。testnet の設定取得から通す独立 consumer の受入れは、本文の localnet 検査とは別で未実証です。
- `./tests/wire-fixtures` は `packages/db/package.json` の `exports` にあります。用途の契約は本文にありません。
