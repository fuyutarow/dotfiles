# Coralbase の仕様と設計の案内

Coralbase の基盤は Move core と汎用 TypeScript SDK の db です。現在の主な利用アプリは文化継承版で、heritage が業務を、web が画面と host 接続を持ちます。利用する基盤と、その上のアプリの契約を分けて読みます。

## 目的から選ぶ

| 読者の目的                             | 入口と次に読むもの                                                                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基盤が何をするかを理解する             | [基盤とアプリの設計](platform/architecture.md) → [採用インフラ](platform/infrastructure.md)。責務の詳細は [基盤の層契約](platform/layers.toml) と [取得契約](platform/query-design.toml)                                                        |
| db を直接使う                          | [接続・保存・読戻しの手順](platform/db-guide.md) → [db API 参照](platform/db.md)。[画像保存](platform/image-storage.md) と [スキーマ](platform/schema.md) は汎用保証。関数の条件は [Move API](platform/core.toml) / [db 契約](platform/db.toml) |
| Move の業務拡張を判断する              | [外部 package と witness](platform/extensions.md)。Node kind の現行機構と、必要な demo_plugin の未完了要件を区別する                                                                                                                            |
| 取得・検索や schema の仕組みを判断する | [取得と検索](platform/query-design.md)、[スキーマの保証](platform/schema.md)、[検証器と型生成の実装選択](platform/schema-design.md)                                                                                                             |
| 文化継承版の対象と納品を判断する       | [アプリの概要](heritage/overview.md) → [製品仕様](heritage/product.toml)（業務・PO / 開発者の二つの view）→ [操作と効果](heritage/effects.md) → [検収](heritage/acceptance.md)                                                                  |
| 文化継承版のデータや変更理由を調べる   | [業務データのスキーマ契約](heritage/data-schema.md)、[業務上の決定と出典](heritage/decisions.md)                                                                                                                                                |
| 公開 API を設計し、repo に寄稿する     | [公開操作の命名と実行境界](platform/usecase-naming.md)、[開発規約](development/contributing.md)                                                                                                                                                 |
| 過去の所見や未決の判断を調べる         | [監査記録](records/audit.md)、[設計上の疑問](records/design-questions.md)                                                                                                                                                                       |

上流の仕組みから学ぶ場合は、[Sui Derived object](mysten/sui/derived-objects.md)、[Seal](mysten/seal.md)、[zkLogin](mysten/zklogin.md) を参照してください。住所の導出、復号鍵の取得、取引の署名者を区別し、それぞれの採用と接続は基盤の説明へ進みます。

権限と業務規則の強制場所を設計する場合は、[architecture の配置判断](platform/architecture.md) から [アクセス制御と scope](platform/access-control.md) へ進みます。SDK を省略した直接取引の境界も確認します。文化継承版への具体的な接続は [アプリの設計](heritage/architecture.md) です。

db の公開操作と、heritage の UC1〜UC19 は別の集合です。業務 UC・hook・factory・export の件数から、別アプリで使える能力の網羅性は決まりません。

## 契約の正本

| 定義するもの                                | 唯一の home                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Move 公開関数の前提・結果・abort・不変条件  | [platform/core.toml](platform/core.toml) の units                                                      |
| db の型・操作・組立 part・factory・実行規則 | [platform/db.toml](platform/db.toml) の types / usecases / factories / rules                           |
| 基盤の担当と責務                            | [platform/layers.toml](platform/layers.toml)。取得の L-CORE-QUERY は次の取得契約だけが定義する         |
| db の画像保存・参照・部分失敗               | [platform/image-storage.md](platform/image-storage.md)。どの保存経路を必須にするかは利用アプリが決める |
| db の JSON Schema 読込み・検証・identity    | [platform/schema.md](platform/schema.md)。業務項目・承認・release は利用アプリが決める                 |
| 外部 Move package と witness demo の境界    | [platform/extensions.md](platform/extensions.md)。未選定の機構と、受入れが必要な成果を区別する         |
| 取得の要求・方式・key の対応                | [platform/query-design.toml](platform/query-design.toml) の requirements / patterns / key_patterns     |
| 文化継承の目的・役割・権限・UC・不変条件    | [heritage/product.toml](heritage/product.toml) の既存の各表                                            |
| 同アプリの層・取得座標・取引数・db 利用関係 | product の allocations / lookups / execution_rules / db_bindings / platform_bindings / constraints     |
| 業務データの受理・版・供給・release         | [heritage/data-schema.md](heritage/data-schema.md)。具体的な項目は承認済み JSON Schema                 |
| 公開操作の命名と実行境界                    | [platform/usecase-naming.md](platform/usecase-naming.md)                                               |
| 画面入口と操作の対応                        | [heritage/web-routes.toml](heritage/web-routes.toml)                                                   |

規範契約は、入力・結果・効果・拒否を変更するときの判断場所です。解説・要約・例は理解を助けるために残しますが、別の条件を定義する場所にはしません。例えば UC6 の未確定時の再送禁止は product の I-IMPORT-RECONCILIATION が定め、effects はその経路を説明し、検収はその観察手順を示します。

## 設計・開発設定・記録の所在

- 採用した schema 変換器・型生成器と置換条件は [実装設計](platform/schema-design.md) にあります。一般の構文と lint の規約は [寄稿者向け](development/contributing.md) です。
- [旧 DPP からのアクセス制御の一般化](inhouse/access-control-generalization.md) は、社内の PO・設計者が採用理由・代案・費用を確認する公開の設計比較です。現行のアクセス制御の規範や、非公開の文書区分ではありません。
- [Derived による住所設計の採用と代案](inhouse/derived-address-design.md) は、現在の座標と一意性の契約で何を簡単にし、どんな索引・競合・信頼境界が残るかを比較します。
- [閲覧履歴の置き場所](inhouse/view-log-placement.md) は、読むだけなら取引が要らないのに閲覧ごとの署名と手数料が生じている理由と、オンチェーンで続ける設計・オフチェーンへ移す設計を比較します。現行の要求を変える文書ではありません。
- [package graph](development/package-graph.toml)、[knip 例外](development/knip-exceptions.toml)、[import 例外](development/relative-import-exceptions.toml)、[Query gate の既存例外](development/query-gates.toml)、[型生成の設定](development/schema-types.toml) は、それぞれの道具が読む開発設定です。製品の業務条件とは分けます。
- [セキュリティ所見](records/security.toml) と [取得・責務の旧所見](records/retrieval-audit.toml) は、観測した版と根拠を持つ記録です。未検証の現在欠陥や追加要求へ変換しません。
- [schema/](schema/) は機械 source の形式を、sources/ は保全する原資料を持ちます。原資料を包括的に公開サイトへ複製しません。

### 閲覧記録の規則を読む・変える

閲覧記録は product の I-VIEWLOG が定義します。[利用目的](heritage/overview.md)、[検収手順の第3・6節](heritage/acceptance.md)、[採用の経緯](heritage/decisions.md) は、その規則に結び付く説明・手順・記録です。本人向けと財団向けのどちらかを、説明ページだけで対象外にしません。

## 確認と更新

1. 読者が必要とする判断と、その条件を定義する home を選びます。
2. 要求・実装選択・開発規約・観測・未決を区別し、変更する home と派生説明を接続します。
3. コードと同じ履歴・レビュー経路で、形式・参照・引用・対応の既存検査を通して統合します。

spec:check は形式・相互参照・試験引用・公開コードとの対応を、db import の検査は公開 specifier と named export を、docs build は表示とリンクの接続を確認します。本文の理解、全 API の保証、実配備の合格は、これらだけでは証明できません。検収では対象版・環境・資料・資格と結果を対応させます。

## 出典資料

以下は文化継承アプリの原本資料です。元のファイル名・内容のまま保存し、汎用 Move/db の公開契約の適用範囲とは分けて参照します。

- [spec/sources/文化継承DPPユーザー権限.pdf](sources/%E6%96%87%E5%8C%96%E7%B6%99%E6%89%BFDPP%E3%83%A6%E3%83%BC%E3%82%B6%E3%83%BC%E6%A8%A9%E9%99%90.pdf): 主体ごとの閲覧権限表。
- [spec/sources/2026-10-14-文化継承DPP修正資料.pdf](sources/2026-10-14-%E6%96%87%E5%8C%96%E7%B6%99%E6%89%BFDPP%E4%BF%AE%E6%AD%A3%E8%B3%87%E6%96%99.pdf): 財団の修正要件と技術上の補足。
- [spec/sources/2026-09-29-heritage-MIL-J-8279G.pdf](sources/2026-09-29-heritage-MIL-J-8279G.pdf): 衣服資料 MIL-J-8279G の原資料。
- [spec/sources/要件定義服飾財団.html](sources/%E8%A6%81%E4%BB%B6%E5%AE%9A%E7%BE%A9%E6%9C%8D%E9%A3%BE%E8%B2%A1%E5%9B%A3.html): 財団の要件定義。
- [spec/sources/設計書服飾財団.html](sources/%E8%A8%AD%E8%A8%88%E6%9B%B8%E6%9C%8D%E9%A3%BE%E8%B2%A1%E5%9B%A3.html): 財団向けシステム設計。
- [spec/sources/デモ説明書.html](sources/%E3%83%87%E3%83%A2%E8%AA%AC%E6%98%8E%E6%9B%B8.html): デモの層・立場別の閲覧範囲と画面説明。
- [spec/sources/2026-09-29-heritage-passport-demo.html](sources/2026-09-29-heritage-passport-demo.html): 2026-09-29時点のパスポートデモ。
- [spec/sources/日本服飾文化振興財団様DPP資料.pptx](sources/%E6%97%A5%E6%9C%AC%E6%9C%8D%E9%A3%BE%E6%96%87%E5%8C%96%E6%8C%AF%E8%88%88%E8%B2%A1%E5%9B%A3%E6%A7%98DPP%E8%B3%87%E6%96%99.pptx): 財団向けDPP資料。
- [spec/sources/2026-10-14-fukuda-heritage-share.pptx](sources/2026-10-14-fukuda-heritage-share.pptx): 2026-10-14の共有資料。

- [spec/sources/【提出】日本服飾文化振興財団.xlsx](sources/%E3%80%90%E6%8F%90%E5%87%BA%E3%80%91%E6%97%A5%E6%9C%AC%E6%9C%8D%E9%A3%BE%E6%96%87%E5%8C%96%E6%8C%AF%E8%88%88%E8%B2%A1%E5%9B%A3.xlsx): 財団提出の項目定義・原資料。
- [spec/sources/2026-09-29-heritage-data-registration-share.xlsx](sources/2026-09-29-heritage-data-registration-share.xlsx): 2026-09-29のデータ登録共有資料。

## 文書情報

読者は、Coralbase の基盤を使う開発者・拡張する開発者と、適用アプリを判断する PO・事業担当・検収者です。文書の種類は参照と案内です。この入口は要求を追加しません。

確認基準は 2026-11-12、基盤とアプリの位置付けを照合した版は `84abe02edea1` です。再編前の版 `04f88fce3a75` から要求 ID と意味を保ち、対象範囲と読む目的を分けています。

今回の再編は本文と機械 source の保存先・形式・consumer 接続を変更します。既存の ID、要求の意味、試験引用、業務の対応関係と原資料は保ちます。本文と機械検査・生成表示を同じ版で接続して確認します。
