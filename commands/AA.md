* 理解を助ける効果的な箇条書き, makdowwテーブル, Ascii Art, Mermaid(クオーテーションを忘れないこと)を挿入して、議論を適切に構造化すること
* むやみにやたらに mermaidを濫用しないこと、効果的なものにしぼって視覚効果を追加

| 目的・問い         | 最適図式         | キーワード                | 刺さるケース         | NG/落とし穴     |
| ------------- | ------------ | -------------------- | -------------- | ----------- |
| 手順・分岐を見せたい    | Flowchart    | `flowchart`/`graph`  | オンボーディング、承認フロー | ノード名が抽象的すぎる |
| 会話/API呼び出しの順番 | Sequence     | `sequenceDiagram`    | マイクロサービス間呼び出し  | 並列・ループの表現ミス |
| データ構造/型の関係    | Class        | `classDiagram`       | ドメインモデリング      | 実装と設計が混線    |
| 状態の変化と遷移条件    | State        | `stateDiagram(-v2)`  | UIステート、バッチ     | イベント未定義で死   |
| データ間のリレーション   | ERD          | `erDiagram`          | スキーマ設計         | 多対多の解像度不足   |
| 顧客体験の段階/感情    | Journey      | `journey`            | CS改善、NPS分析     | 粒度がバラバラ     |
| スケジュール/依存     | Gantt        | `gantt`              | リリース計画         | 変更に弱い・過密    |
| 比率・内訳         | Pie          | `pie`                | ざっくり割合共有       | 細かすぎるスライス   |
| 4象限でポジション     | Quadrant     | `quadrantChart`      | 技術選定/市場マップ     | 軸定義が主観的     |
| 要件・検証トレース     | Requirement  | `requirementDiagram` | 規格・監査          | 定義が曖昧       |
| ブランチ履歴/戦略     | GitGraph     | `gitGraph`           | リリース振り返り       | 大規模に不向き     |
| システム階層化（C4）   | C4*          | `C4Context`他         | アーキ設計共有        | 1枚に詰め込み     |
| アイデアの発散・整理    | Mindmap      | `mindmap`            | 企画初期           | 階層無限増殖      |
| 出来事の時系列       | Timeline     | `timeline`           | 障害年表           | 時系列混在       |
| 別系譜のシーケンス     | ZenUML       | `zenuml`             | “コードっぽい”会話     | チーム非馴染み     |
| フロー量の配分       | Sankey       | `sankey`             | トラフィック分析       | データ更新が手間    |
| XY座標・系列比較     | XY Chart     | `xychart`            | KPI推移          | 軸/単位の未明記    |
| 入出力ブロック図      | Block        | `block`              | ETL/信号処理       | 粒度過剰        |
| パケット構造可視化     | Packet       | `packet`             | ネットワーク教育       | バイト境界ミス     |
| 進捗の見える化       | Kanban       | `kanban`             | チーム運用          | WIP制限なし地獄   |
| クラウド構成の俯瞰     | Architecture | `architecture-beta`  | 絵で魅せる          | 記号乱立        |
| 能力のレーダー比較     | Radar        | `radar`              | 技術評価           | 軸の意味が曖昧     |
| 階層の面積配分       | Treemap      | `treemap`            | 予算/容量内訳        | 面積読み誤り      |
