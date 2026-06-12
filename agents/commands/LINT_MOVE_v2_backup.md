# Sui Move Linter スタイルガイド v2.0

## 概要
- **対象バージョン**: Sui Move 2024.beta
- **用途**: コードレビュー、自動チェック、品質保証
- **重要度レベル**: ERROR（必須） | WARNING（推奨） | INFO（提案）

---

## Part I: 基礎編 - Move 2024エディション必須要件

### 1.1 コンパイル要件 [ERROR]

#### M2024-001: 構造体のpublic宣言
**なぜ重要**: Move 2024では全ての構造体に明示的な可視性宣言が必要。

- ❌ `struct Counter has key { ... }` （コンパイルエラー）
- ✅ `public struct Counter has key { ... }` （必須）
- **自動修正**: 可能

#### M2024-002: 変数のmutability宣言
**なぜ重要**: 明示的な可変性宣言により、意図しない変更を防ぐ。

- ❌ `let value = x; value = value + 1;` （エラー）
- ✅ `let mut value = x; value = value + 1;` （OK）
- **自動修正**: 可能

#### M2024-003: モジュール宣言形式
**なぜ重要**: セミコロン形式により、モジュール内容とモジュール宣言を明確に分離。

- ❌ `module counter_app::counter { ... }` （古い形式）
- ✅ `module counter_app::counter;` （Move 2024形式）

#### M2024-004: 予約語の使用禁止
**なぜ重要**: 将来の言語拡張での予約語を避け、将来互換性を保つ。

- ❌ `let enum = 5; let match = true;` （予約語使用）
- ✅ `let enum_type = 5; let match_result = true;` （代替名）

#### M2024-005: デフォルトエイリアスの重複宣言禁止 [WARNING]
**なぜ重要**: Move 2024では主要モジュール・型にデフォルトエイリアスが自動提供される。

**デフォルトで利用可能（import不要）**:
- 型: `UID`, `ID`, `TxContext`
- モジュール: `sui::object`, `sui::transfer`, `sui::tx_context`

**推奨される書き方**:
- ❌ `use sui::object::{Self, ID, UID};` （不要、警告発生）
- ❌ `use sui::transfer;` （不要）
- ✅ `UID`, `TxContext`, `object::new()` を直接使用
- ✅ 必要なものだけimport: `Coin<SUI>`, `event`, `clock::Clock`など

### 1.2 必須設定

#### Move.toml設定 [ERROR]
```toml
[package]
name = "CounterApp"        # PascalCase必須
version = "0.0.1"
edition = "2024"           # enum/match使用に必須

[addresses]
counter_app = "0x0"

[dependencies]
Sui = { git = "https://github.com/MystenLabs/sui.git", subdir = "crates/sui-framework/packages/sui-framework", rev = "framework/mainnet" }
```

---

## Part II: 命名規則

### 2.1 識別子の命名 [ERROR]

#### NAME-001: パッケージ名はPascalCase
- ❌ `name = "counter_app"` （snake_case）
- ✅ `name = "CounterApp"` （PascalCase）

#### NAME-002: エラー定数の命名とattribute
**なぜ重要**: 統一的なエラー処理により、デバッグが容易になる。

- ❌ `const ERROR_INVALID: u64 = 0;` （プレフィックス違反）
- ❌ `const EInvalidInput: vector<u8> = b"...";` （#[error]属性なし）
- ✅ `const EInvalidInput: u64 = 0;` （u64エラーコード）
- ✅ `#[error] const EInvalidInput: vector<u8> = b"...";` （カスタムメッセージ）

#### NAME-003: 通常定数はUPPER_SNAKE_CASE
- ❌ `const maxValue: u64 = 1000;` （camelCase）
- ✅ `const MAX_VALUE: u64 = 1000;` （UPPER_SNAKE_CASE）

### 2.2 関数命名パターン [ERROR/WARNING]

#### NAME-004: 関数名はsnake_case
- ❌ `public fun CreateCounter() {}` （PascalCase）
- ✅ `public fun create_counter() {}` （snake_case）

#### NAME-005: Getter関数のプレフィックス禁止
**なぜ重要**: Move 2024では簡潔性を重視し、冗長な`get_`を避ける。

- ❌ `public fun get_balance(self: &Account): u64` （get_プレフィックス）
- ✅ `public fun balance(self: &Account): u64` （直接的な名前）

#### NAME-006: Self型パラメータの命名 [ERROR]
**なぜ重要**: Method Syntax使用のための**必須要件**。第一引数が`&T`または`&mut T`の場合、必ず`self`という名前にする。

**適用対象**:
- ✅ `self: &Counter`, `self: &mut Account` （自身の構造体への参照）
- ❌ `ctx: &TxContext`, `coin: &mut Coin<SUI>` （他の型は除外）

**チェックポイント**:
1. 第一引数が`&YourStruct`または`&mut YourStruct` → `self`必須
2. 第一引数が`&TxContext`や`&Clock`などの外部型 → `self`不要
3. コンストラクタ（`new`など） → `self`不要

#### NAME-007: コンストラクタの命名パターン
**なぜ重要**: 一貫した命名により、オブジェクトのライフサイクル管理が明確になる。

- ✅ `new()` - オブジェクトを返すだけ
- ✅ `create_and_share()` - オブジェクト作成＋共有
- ✅ `create_for_user()` - オブジェクト作成＋転送

---

## Part III: 高度な型機能

### 3.1 Enum定義とパターンマッチング

#### ENUM-001: Enum基本構造 [ERROR]

**3つのバリアント形式**:
- **ユニット**: `Pending` （値なし）
- **タプル**: `Processing(u64)` （位置引数）
- **名前付きフィールド**: `Completed { amount: u64, timestamp: u64 }` （構造体風）

#### ENUM-002: Match式の完全性 [ERROR]

**なぜ重要**: コンパイル時に処理漏れを検出し、バリアント追加時の回帰を防ぐ

**要件**: 全バリアントを網羅する（`_` ワイルドカードは避ける）

#### ENUM-003: バリアント命名 [ERROR]

**ルール**: PascalCase必須
- ❌ `pending`, `PROCESSING`, `complete_success`
- ✅ `Pending`, `Processing`, `CompleteSuccess`

#### ENUM-004: バージョニング戦略 [WARNING]

**既存enumへのバリアント追加は破壊的変更**

**安全な拡張方法**:
1. 新バージョンのenumを定義（例: `OrderStatusV2`）
2. 移行関数を提供
3. 既存のV1は維持（後方互換性）

### 3.2 パターンマッチングのベストプラクティス

#### MATCH-001: ワイルドカード使用の制限 [WARNING]

**なぜ重要**: 新しいバリアント追加時の処理漏れを防ぐ

**推奨**: 全バリアントを明示的に列挙
**非推奨**: `_` ワイルドカードで残りをまとめる

#### MATCH-002: 複雑なガード条件の分離 [INFO]

**推奨**: 複雑な条件は関数に分離
- 可読性向上
- テスト容易性
- 再利用性

### 3.3 属性（Attributes）システム

#### 3.3.1 テスト関連属性 [ERROR/WARNING]

**ATTR-001: テスト関数には#[test]属性必須**
- ❌ `fun test_counter_creation() { ... }` （属性なし）
- ✅ `#[test] fun test_counter_creation() { ... }` （属性付き）

**ATTR-002: テスト専用関数には#[test_only]**
- ✅ `#[test_only] public fun create_test_scenario(...)` （ヘルパー関数）

**ATTR-003: 失敗テストには#[expected_failure]**
- ✅ `#[test] #[expected_failure(abort_code = E...)]` （失敗期待）

#### 3.3.2 エラー定義属性 [ERROR]

**ATTR-004: vector<u8>エラー定数には#[error]必須**
- ❌ `const EInvalidAmount: vector<u8> = b"...";` （属性なし）
- ✅ `#[error] const EInvalidAmount: vector<u8> = b"...";` （属性付き）

**ATTR-005: エラー定義は #[error] のみを使用 [WARNING]**
**なぜ推奨**: `#[error]`による自動採番により、エラー番号の管理負担を減らす。

- ✅ `#[error] const EInvalidInput: vector<u8> = b"...";` （自動採番）
- ❌ `#[error(code = 1)] const EInvalidAmount: vector<u8> = b"...";` （手動指定不要）

**エラー管理のベストプラクティス**:
- **宣言順序を保持**: エラー定数の宣言順序がエラーコードとなる
- **削除禁止**: 既存エラーの削除は後続のエラーコードを変えるため不可
- **非推奨化**: 使わなくなったエラーは`#[deprecated]`でマーク
- **グループ化**: コメントでエラーをカテゴリ分け

---

## Part IV: コード構造と品質

### 4.1 ファイル構造 [WARNING]

#### STRUCT-001: セクションコメントで構造化

**推奨セクション順序**:
```text
// === Imports ===
// === Constants ===
// === Errors ===
// === Structs ===
// === Events ===
// === Public Functions ===
// === Package Functions ===
// === Private Functions ===
// === Test Functions ===
```

#### STRUCT-002: 関数の可視性順序

| 順序 | 可視性 |
|-----|-------|
| 1 | entry functions |
| 2 | public functions |
| 3 | public(package) functions |
| 4 | private functions |
| 5 | test functions |

#### STRUCT-003: Ability順序の統一

**標準順序**: `key, copy, drop, store`
- ❌ `has store, key, drop` （バラバラ）
- ✅ `has key, drop, store` （統一）

### 4.2 Method Syntax徹底使用 [WARNING]

#### BEST-001: Method Syntax必須化
**なぜ重要**: Move 2024のMethod Syntaxにより、コードの可読性が大幅に向上し、チェーンメソッド呼び出しが可能になる。

**適用対象**: 第一引数が`&T`または`&mut T`の関数は必ずMethod Syntaxで記述する。
- ❌ `vector::push_back(&mut items, new_item)` （冗長）
- ✅ `items.push_back(new_item)` （簡潔）

#### BEST-002: Method Syntax適用パターン

**標準ライブラリでの変換表**:

| カテゴリ | 従来形式 → Method Syntax |
|---------|------------------------|
| Vector | `vector::length(&v)` → `v.length()` |
| | `vector::push_back(&mut v, item)` → `v.push_back(item)` |
| | `vector::pop_back(&mut v)` → `v.pop_back()` |
| Option | `option::is_some(&opt)` → `opt.is_some()` |
| | `option::borrow(&opt)` → `opt.borrow()` |
| String | `string::length(&s)` → `s.length()` |
| | `string::is_empty(&s)` → `s.is_empty()` |
| Coin | `coin::value(&c)` → `c.value()` |
| | `coin::split(&mut c, amount)` → `c.split(amount)` |
| Object | `object::id(&obj)` → `obj.id()` |
| | `object::id_address(&obj)` → `obj.id_address()` |

**カスタム構造体の設計**: 第一引数を`self: &T`または`self: &mut T`にすることでMethod Syntax対応。

#### BEST-003: Method Syntax例外規定

**例外ケース**: 以下の場合は`module::function`形式を使用:
- 静的関数（コンストラクタ、ファクトリ関数）: `Counter::new(0, ctx)`
- 型推論が困難な場合: `bcs::to_bytes(&data)`
- モジュール境界を明確化したい場合: `transfer::public_transfer(obj, addr)`

#### BEST-004: public(package)使用

- ❌ `friend module; public(friend) fun f()` （廃止予定）
- ✅ `public(package) fun f()` （推奨）

---

## Part V: セキュリティ

### 5.1 公開APIの設計 [ERROR]

#### SEC-001: 可変参照の公開制限
**なぜ重要**: 可変参照の公開は意図しない状態変更を許し、オブジェクトの整合性を破る可能性がある。

- ❌ `public fun borrow_mut(&mut self): &mut T` （外部から直接変更可能）
- ✅ `public fun update(&mut self, value: T)` （制御された変更）
- ✅ `public(package) fun borrow_mut_internal(&mut self): &mut T` （パッケージ内のみ許可）

#### SEC-002: 未使用公開関数の削除

- ❌ 未使用の`public`関数が残っている （攻撃面を拡大）
- ✅ 不要な公開関数は削除、または`fun`にダウングレード

---

## Part VI: パフォーマンスとコンテナ選択

### 6.1 コンテナ計算量一覧 [INFO]

**なぜ重要**: 適切なコンテナ選択により、ガスコストとトランザクション実行時間を大幅に削減できる。大規模データ処理では計算量の差が致命的なボトルネックとなる。

#### PERF-TABLE: Sui Moveコンテナの時間計算量

| コンテナ | 追加 | 削除 | 検索/参照 | 全件走査 | サイズ取得 |
|---------|------|------|-----------|----------|-----------|
| `std::vector<T>` | push_back: amortized O(1)<br>insert(i): O(n) | pop_back: O(1)<br>remove(i): O(n)<br>swap_remove(i): O(1) | インデックス参照: O(1)<br>contains/index_of: O(n) | O(n) | O(1) |
| `sui::table::Table<K,V>` | add: 期待値 O(1) | remove: 期待値 O(1) | borrow/contains: 期待値 O(1) | **API なし** | O(1) |
| `sui::bag::Bag` | add: 期待値 O(1) | remove: 期待値 O(1) | contains: 期待値 O(1) | **API なし** | O(1) |
| `sui::object_table::ObjectTable<K,V>` | add: 期待値 O(1) | remove: 期待値 O(1) | borrow/contains: 期待値 O(1) | **API なし** | O(1) |
| `sui::object_bag::ObjectBag` | add: 期待値 O(1) | remove: 期待値 O(1) | contains: 期待値 O(1) | **API なし** | O(1) |
| `sui::linked_table::LinkedTable<K,V>` | push_front/back: 期待値 O(1) | pop_front/back: 期待値 O(1)<br>remove(k): 期待値 O(1) | borrow/prev/next: 期待値 O(1) | O(n) (front→next) | O(1) |
| `sui::table_vec::TableVec<T>` | push_back: 期待値 O(1) | pop_back: 期待値 O(1)<br>swap_remove(i): O(1) | borrow(i): 期待値 O(1) | O(n) | O(1) |
| `sui::vec_map::VecMap<K,V>` | O(n) | O(n) | get/contains: O(n) | O(n) | O(1) |
| `sui::vec_set::VecSet<K>` | O(n) | O(n) | contains: O(n) | O(n) | O(1) |

#### 計算量の根拠

**期待値 O(1) の理由**:
- `Table`系コンテナは**動的フィールド (dynamic fields)** を使用
- 内部で `(object_id, key, type)` のハッシュ計算により子オブジェクトを直接参照
- ハッシュ衝突がない限り、単一キーで O(1) アクセス可能

**O(n) 操作の理由**:
- `vector::remove(i)`: i以降の全要素をシフト（公式ドキュメント明記）
- `VecMap`/`VecSet`: 内部がvectorベースで線形探索（公式ドキュメント明記）
- イテレーション: 全要素を順次処理するため必然的に O(n)

**ガスコストとの関係**:
- 動的フィールドは**アクセス時にのみガスに影響**
- 実際のガスコストは読み書きバイト数にも依存
- O(1) でも大きなオブジェクトの読み書きは高コスト

### 6.2 コンテナ選択ガイドライン

#### PERF-001: ランダムアクセス重視の場合 [WARNING]

**要件**: キーによる高速な検索・更新・削除が必要

**選択基準**:
- 要素数が100以上 → `Table<K,V>` / `ObjectTable<K,V>` 必須（期待値 O(1)）
- 要素数が10〜100 → `VecMap<K,V>` も許容範囲（O(n) だが実用的）
- 要素数が10未満 → `VecMap<K,V>` で十分

**理由**: `VecMap` は線形探索（O(n)）のため、100要素以上では検索・更新・削除のコストが高くなる。`Table` はハッシュベースで期待値 O(1) のため、大規模データに対応可能。

#### PERF-002: 順序保持が必要な場合 [WARNING]

**要件**: 挿入順序の保持 + イテレーション + ランダムアクセス

**選択基準**:
- 順序 + ランダムアクセス必要 → `LinkedTable<K,V>`（各操作期待値 O(1)、イテレーション O(n)）
- 順序 + 添字アクセス必要 → `TableVec<T>`（添字アクセス期待値 O(1)）
- 順序のみ（ランダムアクセス不要） → `vector<T>`（push/pop O(1)）

**理由**: `LinkedTable` は双方向リンクリストで順序を保持しつつキーベースアクセスが可能。`TableVec` は添字による直接アクセスと順序保持を両立。

#### PERF-003: 添字アクセスが必要な場合 [WARNING]

**要件**: 配列ライクなアクセスパターン + 大規模データ

**選択基準**:
- 要素数 < 1000 → `vector<T>`（メモリ効率良好）
- 要素数 ≥ 1000 → `TableVec<T>`（動的フィールドで分散保存）
- 順序変更OK + 削除頻繁 → `swap_remove()` を活用（O(1) 削除）

**理由**: `vector` は全要素をメモリに保持するため、大規模データでは枯渇リスクがある。`TableVec` は動的フィールドで要素を分散保存し、無制限にスケール可能。

#### PERF-004: 異種型の保持が必要な場合 [WARNING]

**要件**: 異なる型の値を同一コンテナで管理

**選択基準**:
- 同一型のみ → `Table<K,V>`（型安全）
- 異種型必要 → `Bag`（キー単位で異なる値型を保持可能）
- 異種型 + オブジェクト値 → `ObjectBag`

**理由**: `Bag` は動的型付けにより、異なる型の値を同一コンテナに保存可能。ただし型安全性が低下するため、可能な限り `Table` を優先すべき。

#### PERF-005: 値がオブジェクトの場合 [INFO]

**要件**: 値が `key` ability を持つオブジェクト

**選択基準**:
- 値が `key` ability → `ObjectTable<K,V>` / `ObjectBag` 必須
- 値が通常の型（`store` ability） → `Table<K,V>` / `Bag`

**理由**: `key` ability を持つオブジェクトは `ObjectTable`/`ObjectBag` でのみ保存可能。これらはオブジェクトの所有権を管理し、正しいライフサイクルを保証する。

### 6.3 アンチパターンとパフォーマンス警告

#### PERF-ANTI-001: 大規模データでのVecMap/VecSet使用 [ERROR]

**なぜ危険**: すべての操作が O(n) のため、データ量に比例してガスコストが増大

**問題のパターン**:
- `VecMap<K,V>` / `VecSet<K>` を100要素以上で使用
- `contains()`, `get()`, `insert()`, `remove()` が毎回線形探索
- 1000要素で1操作あたり最悪1000回の比較が発生

**解決策**:
- 100要素以上 → `Table<K,V>` / `ObjectTable<K,V>` へ移行（期待値 O(1)）
- セカンダリインデックスが必要な場合 → 複数の `Table` を組み合わせる

**閾値の目安**:
- `VecMap`/`VecSet` は**最大100要素まで**
- それ以上は `Table` 系への移行必須

#### PERF-ANTI-002: 不要な線形探索 [WARNING]

**なぜ危険**: 毎回 O(n) の全要素走査により、頻繁な検索でガスコストが急増

**問題のパターン**:
- `vector<T>` を毎回ループで検索
- 特定フィールドによる検索が頻繁
- セカンダリキーによるアクセスが必要なのにインデックスがない

**解決策**:
- セカンダリインデックスを追加: `Table<SecondaryKey, PrimaryKey>`
- プライマリデータと組み合わせて使用
- 追加・削除時にインデックスも更新

**例**: ユーザー名検索用に `name_to_address: Table<vector<u8>, address>` を追加

#### PERF-ANTI-003: vector::remove の多用 [ERROR]

**なぜ危険**: `remove(i)` は O(n) で、i以降の全要素をシフトする。ループ内で使うと O(n²) になる

**問題のパターン**:
- `vector::remove(i)` をループ内で使用 → O(n²)
- 複数要素の削除で毎回シフトが発生
- 順序を保持する必要がないのに `remove` を使用

**解決策**:
- **順序不要の場合**: `swap_remove(i)` を使用（O(1)）
- **順序必要の場合**: フィルタして新しい vector を作成
- **頻繁な削除**: 論理削除（フラグ）+ 後でバッチ物理削除

**計算量比較**:
- `remove(i)` ループ: O(n²)
- `swap_remove(i)` ループ: O(n)
- フィルタ再構築: O(n)

#### PERF-ANTI-004: LinkedTable での逆順イテレーション [WARNING]

**なぜ非推奨**: `prev()` による逆順走査は動的フィールドアクセスが多く、順方向より非効率

**問題のパターン**:
- `back()` から `prev()` で逆順走査
- 結果の順序が逆になる
- 各ステップで動的フィールドを参照

**解決策**:
- 順方向（`front()` → `next()`）で走査
- 必要な部分だけをスキップして収集
- 逆順が必要なら最後に `vector::reverse()` を使用

### 6.4 大規模データ処理のベストプラクティス

#### PERF-BEST-001: バッチ処理パターン [INFO]

**目的**: 100万レコード以上の処理を複数トランザクションに分割し、ガスコスト超過を防ぐ

**実装戦略**:
1. **start_index** と **batch_size** パラメータで処理範囲を制御
2. 1トランザクションあたり100〜1000レコード程度に制限
3. クライアント側でループしながら複数トランザクション実行

**構造設計**:
```text
UserRegistry {
  users: Table<address, UserProfile>      // プライマリデータ (100万件対応)
  active_users: TableVec<address>         // 処理対象リスト (順次アクセス用)
  total_users: u64
}
```

**計算量**: O(batch_size) - 予測可能なガスコスト

#### PERF-BEST-002: セカンダリインデックス戦略 [INFO]

**目的**: 複数の検索条件に対応するため、プライマリキー以外のインデックスを維持

**実装パターン**:
- **プライマリデータ**: `ObjectTable<PrimaryKey, Entity>`
- **セカンダリインデックス**: `Table<SecondaryKey, TableVec<PrimaryKey>>`
- 追加・削除時に全インデックスを同期更新

**例: NFTマーケットプレイス**
```text
nfts: ObjectTable<u64, NFT>                          // token_id → NFT
nfts_by_owner: Table<address, TableVec<u64>>        // owner → token_ids
nfts_by_collection: Table<vector<u8>, TableVec<u64>> // collection → token_ids
```

**計算量**:
- オーナーのNFT数取得: O(1)
- オーナーのNFTリスト取得: O(m) （m = 所有NFT数）
- 追加時: 期待値 O(k) （k = インデックス数）

**トレードオフ**: インデックス増加で追加・削除コスト上昇 vs 検索性能向上

#### PERF-BEST-003: メモリ効率的なイテレーション [INFO]

**目的**: ストリーミング処理により、中間データ構造を作らずメモリ使用量を最小化

**原則**:
- 中間 `vector` を作成しない（O(n) メモリ回避）
- `TableVec` や `LinkedTable` を直接イテレート
- 集約処理（合計、カウントなど）に最適

**アンチパターン**: 全要素を一旦 `vector` に集めてから処理
- メモリ使用量: O(n)
- ガスコスト増大

**推奨パターン**: 直接イテレーション
- メモリ使用量: O(1)
- 時間計算量: O(n)（変わらず）

#### PERF-BEST-004: 段階的な削除戦略 [INFO]

**目的**: 削除操作を2段階に分割し、即座の応答性と後処理の分離

**実装フェーズ**:

**フェーズ1: 論理削除（即時実行）**
- フラグ設定: `is_deleted = true`
- 削除キューに追加: `deleted_users.push_back(user_addr)`
- 計算量: 期待値 O(1)（高速応答）

**フェーズ2: バッチ物理削除（オフピーク時実行）**
- 削除キューから取り出し
- プライマリデータとインデックスから完全削除
- バッチサイズで制御（例: 100件/トランザクション）
- 計算量: O(batch_size × k) （k = インデックス数）

**利点**:
- ユーザー操作の即座の応答
- ガスコストの分散
- システム負荷の時間的分散

---

## Part VII: Vectorマクロの活用

### 7.1 Vectorマクロ一覧 [INFO]

**なぜ重要**: Move 2024で導入されたvectorマクロにより、関数型プログラミングのパターンを簡潔に記述でき、コードの可読性と保守性が向上する。従来のループベースの実装と比較して、30-50%のコード削減が可能。

#### マクロ分類表（全26種類）

| カテゴリ | マクロ | 機能 | 計算量 |
|---------|-------|------|--------|
| **作成・変換** | `tabulate!(n, f)` | インデックスでvector生成 | O(n) |
| | `map!(v, f)` | 各要素を変換（所有権移動） | O(n) |
| | `map_ref!(v, f)` | 各要素を変換（参照渡し） | O(n) |
| **フィルタリング** | `filter!(v, f)` | 条件を満たす要素のみ抽出 | O(n) |
| | `partition!(v, f)` | 条件で2つに分割 | O(n) |
| | `take_while!(v, p)` | 条件を満たす間の要素を取得 | O(n) |
| | `skip_while!(v, p)` | 条件を満たす間の要素をスキップ | O(n) |
| **検索** | `find_index!(v, f)` | 最初の一致インデックス | O(n) 最良O(1) |
| | `find_indices!(v, f)` | 全ての一致インデックス | O(n) |
| **集約・計算** | `count!(v, f)` | 条件を満たす要素数 | O(n) |
| | `fold!(v, init, f)` | 畳み込み（reduce） | O(n) |
| | `flatten(v)` | ネストしたvectorを平坦化 | O(n×m) |
| **条件判定** | `any!(v, f)` | いずれか満たすか | O(n) 最良O(1) |
| | `all!(v, f)` | 全て満たすか | O(n) 最良O(1) |
| **反復処理** | `do!(v, f)` | 各要素に処理（順序保持） | O(n) |
| | `destroy!(v, f)` | 各要素に処理（逆順） | O(n) |
| | `do_ref!(v, f)` | 各要素の参照に処理 | O(n) |
| | `do_mut!(v, f)` | 各要素の可変参照に処理 | O(n) |
| **ソート** | `insertion_sort_by!(v, le)` | 挿入ソート（30要素以下推奨） | O(n²) |
| | `merge_sort_by!(v, le)` | マージソート（大規模向け） | O(n log n) |
| | `is_sorted_by!(v, le)` | ソート済みか判定 | O(n) |
| **複数vector** | `zip_do!(v1, v2, f)` | ペアで処理（順序保持） | O(n) |
| | `zip_do_reverse!(v1, v2, f)` | ペアで処理（逆順） | O(n) |
| | `zip_do_ref!(v1, v2, f)` | ペアの参照で処理 | O(n) |
| | `zip_do_mut!(v1, v2, f)` | ペアの可変参照で処理 | O(n) |
| | `zip_map!(v1, v2, f)` | ペアから新vectorを生成 | O(n) |
| | `zip_map_ref!(v1, v2, f)` | ペア参照から新vectorを生成 | O(n) |

#### マクロの基本原則

**所有権の扱い**:
- `map!`, `filter!`, `do!` → vectorを消費（所有権移動）
- `map_ref!`, `do_ref!` → vectorを借用（参照渡し）
- `do_mut!` → vectorを可変借用

**順序の保持**:
- `do!` → 順序保持（reverse後にpop_back）
- `destroy!` → 逆順（末尾からpop_back）
- `zip_do!` → 順序保持、`zip_do_reverse!` → 逆順

### 7.2 マクロ使用のベストプラクティス

#### MACRO-001: ループよりマクロを優先 [WARNING]

**要件**: vectorの走査・変換・集約処理

**理由**:
- **可読性**: 処理の意図が明確（"何をするか"が一目瞭然）
- **型安全性**: コンパイラが型チェックを厳密に実行
- **保守性**: ループ制御のバグ（オフバイワンエラーなど）を防ぐ
- **簡潔性**: 30-50%のコード削減

**選択基準**:
- 全要素の変換 → `map!` / `map_ref!`
- 条件付き抽出 → `filter!`
- 存在チェック → `any!` / `all!`
- 集計処理 → `fold!`
- 副作用のある処理 → `do!` / `do_mut!`

#### MACRO-002: do! vs destroy! の使い分け [INFO]

**順序の重要性で選択**:

**`do!` を使用する場合**:
- 処理順序が重要（先頭から順番に処理）
- 順序依存の副作用がある
- イベント発行の順序を保証したい

**`destroy!` を使用する場合**:
- 処理順序が無関係
- 単純な解放・クリーンアップ処理
- わずかにパフォーマンス優位（reverse不要）

**実装の違い**:
- `do!(v, f)` → `v.reverse()` してから `pop_back()` → 順序保持
- `destroy!(v, f)` → 直接 `pop_back()` → 逆順（高速）

#### MACRO-003: map! vs map_ref! の選択基準 [WARNING]

**所有権の必要性で選択**:

**`map!(v, f)` を使用する場合**:
- 元のvectorを消費してよい
- 要素の所有権が必要（moveセマンティクス）
- 元のvectorが不要になる

**`map_ref!(v, f)` を使用する場合**:
- 元のvectorを保持したい
- 要素の参照のみで十分
- 元のvectorを後で再利用する

**パフォーマンス比較**:
- `map!`: 所有権移動（ゼロコピー可能）
- `map_ref!`: コピーが必要な場合あり

#### MACRO-004: fold! による集約処理の最適化 [INFO]

**目的**: 複数の集約処理を1パスで実行

**アンチパターン**: 複数回のループ
```text
// ❌ 非効率 - 3回のループ
let sum = v.fold!(0, |acc, x| acc + x);
let count = v.length();
let max = v.fold!(0, |acc, x| if (x > acc) x else acc);
// 問題: v を3回走査
```

**推奨パターン**: 1回のfoldで複数の値を計算
```text
// ✅ 効率的 - 1回のループ
let (sum, count, max) = v.fold!(
    (0, 0, 0),
    |(s, c, m), x| (s + x, c + 1, if (x > m) x else m)
);
// 利点: v を1回だけ走査
```

**計算量比較**:
- 複数ループ: O(k×n) （k=集約種類数）
- 単一fold: O(n)

#### MACRO-005: zip系マクロの使い分け [INFO]

**要件**: 2つのvectorの対応する要素をペアで処理

**使用シーン**:
- 2つのリストの同期更新
- 対応するデータのマージ・変換
- 並行データの検証

**マクロ選択基準**:

| 要件 | 推奨マクロ | 理由 |
|-----|----------|------|
| ペア処理のみ（順序保持） | `zip_do!` | 先頭から処理、vector消費 |
| ペア処理のみ（順序不要） | `zip_do_reverse!` | 末尾から処理（高速）、vector消費 |
| ペア処理（vector保持） | `zip_do_ref!` | 参照渡し、vector保持 |
| ペア処理（両方可変） | `zip_do_mut!` | 可変参照、両方更新可能 |
| ペアから新vector生成 | `zip_map!` | 新vector作成、元vector消費 |
| ペアから新vector生成（保持） | `zip_map_ref!` | 新vector作成、元vector保持 |

**共通の注意事項**:
- 長さが異なる場合は **abort** する（安全性保証）
- 長さチェックは自動で行われる（手動assert不要）

#### MACRO-006: ソートマクロの選択 [INFO]

**要件**: vectorの要素をソート

**マクロ選択基準**:

| 要素数 | 推奨マクロ | 計算量 | 理由 |
|-------|----------|--------|------|
| ≤ 30 | `insertion_sort_by!` | O(n²) | 小規模データで高速 |
| > 30 | `merge_sort_by!` | O(n log n) | 大規模データで効率的 |
| 判定のみ | `is_sorted_by!` | O(n) | ソート不要時 |

**比較関数の注意点**:
- 「以下」（`<=`）の関数を渡す必要がある
- 「未満」（`<`）ではない点に注意
- 例: `|a, b| a <= b`（正しい）vs `|a, b| a < b`（誤り）

**安定性**: `insertion_sort_by!` と `merge_sort_by!` は両方とも**安定ソート**

#### MACRO-007: take_while / skip_while パターン [INFO]

**要件**: 条件に基づいて先頭から要素を取得またはスキップ

**使用シーン**:
- ログファイルの先頭行スキップ
- 特定パターンまでの読み取り
- 条件付きデータ抽出

**選択基準**:
- 条件を満たす間の要素が必要 → `take_while!`
- 条件を満たす間の要素をスキップ → `skip_while!`

**filter! との違い**:
- `filter!` → 全要素をチェック（O(n)、条件を満たす要素を全て抽出）
- `take_while!` → 条件不成立で即終了（最良O(1)、先頭からのみ）
- `skip_while!` → 条件不成立以降を全取得（最良O(1)、先頭からのみ）

### 7.3 パフォーマンス比較

#### コード削減効果

| 処理内容 | 従来のループ実装 | マクロ実装 | 削減率 |
|---------|----------------|-----------|--------|
| 全要素変換 | 5-7行 | 1行 | 80-85% |
| 条件フィルタ | 6-8行 | 1行 | 85-87% |
| 存在チェック | 5-10行 | 1行 | 80-90% |
| 集約処理 | 4-6行 | 1-2行 | 60-75% |
| ペア処理 | 8-12行 | 1行 | 90-92% |

#### 実行時パフォーマンス

**時間計算量**: マクロとループは**同等** （両者ともO(n)）

**ガスコスト**:
- **基本操作**: 差異なし（同じMoveバイトコードにコンパイル）
- **早期リターン**: `any!`, `all!`, `find_index!` は条件成立時に即座に終了（最良O(1)）
- **メモリ使用**: マクロは中間変数が少なく、わずかに有利

**コンパイル時の最適化**:
- マクロはインライン展開されるため、関数呼び出しオーバーヘッドなし
- コンパイラが積極的に最適化

### 7.4 実用的なマクロ適用パターン

#### パターン選択フローチャート

```text
vectorの処理が必要？
├─ Yes → 何をする？
│   ├─ 全要素を変換 → map! / map_ref!
│   ├─ 条件で絞り込み → filter!
│   ├─ 要素を検索 → find_index! / any!
│   ├─ 集約・統計 → fold! / count!
│   ├─ ソート → insertion_sort_by! / merge_sort_by!
│   ├─ 2つのvectorを同期処理 → zip_do! / zip_map!
│   ├─ 先頭から条件付き取得 → take_while! / skip_while!
│   └─ 全要素に副作用 → do! / do_mut!
└─ No → 通常の処理
```

#### 主要な変換例

**線形探索 → find_index!**
- ループでインデックスを探す → `find_index!(|x| 条件)`
- 削減効果: 90%

**条件チェック → all! / any!**
- ループで全チェック → `all!(|x| 条件)` または `any!(|x| 条件)`
- 削減効果: 90%、早期リターンで高速化

**フィルタ＋変換 → filter! + map!**
- ループで条件判定と変換 → `filter!(条件).map!(変換)`
- 削減効果: 70-80%、チェーン記法で可読性向上

**複数集約 → fold!**
- 複数ループで個別集計 → `fold!(初期値, |(acc1, acc2, ...), x| ...)`
- 削減効果: 60-70%、1パス処理でガスコスト削減

**ペア処理 → zip系マクロ**
- 2つのループで同期処理 → `zip_do!(v1, v2, |x, y| ...)`
- 削減効果: 70%、長さチェック自動化

**インデックス生成 → tabulate!**
- ループでインデックスベース生成 → `n.tabulate!(|i| 式)`
- 削減効果: 85-90%

**ソート → insertion_sort_by! / merge_sort_by!**
- 手動バブルソート → `insertion_sort_by!(|a, b| a <= b)` (≤30要素)
- 手動クイックソート → `merge_sort_by!(|a, b| a <= b)` (>30要素)
- 削減効果: 95%以上

**先頭から条件付き → take_while! / skip_while!**
- ループで先頭から処理 → `take_while!(|x| 条件)` または `skip_while!(|x| 条件)`
- 削減効果: 80-85%、早期終了で高速化

---

## 付録A: クイックリファレンス

### A.1 チェックリスト

```yaml
Move2024Compliance:
  - [ ] M2024-001: 全ての構造体にpublicキーワード
  - [ ] M2024-002: 再代入変数にmutキーワード
  - [ ] M2024-003: モジュール宣言でセミコロン
  - [ ] M2024-004: 予約語の変数名使用禁止
  - [ ] M2024-005: デフォルトエイリアスの重複宣言禁止（UID, ID, TxContext等）

NamingConventions:
  - [ ] NAME-001: パッケージ名がPascalCase
  - [ ] NAME-002: エラー定数がEPascalCase + #[error]
  - [ ] NAME-003: 通常定数がUPPER_SNAKE_CASE
  - [ ] NAME-004: 関数名がsnake_case
  - [ ] NAME-005: Getter関数のget_プレフィックス禁止
  - [ ] NAME-006: Self型第一引数はself
  - [ ] NAME-007: コンストラクタ命名規則

EnumMatch:
  - [ ] ENUM-001: enum名がPascalCase
  - [ ] ENUM-002: match式の全バリアント網羅
  - [ ] ENUM-003: バリアント名がPascalCase
  - [ ] ENUM-004: バージョニング戦略採用
  - [ ] MATCH-001: ワイルドカード使用制限
  - [ ] MATCH-002: 複雑なガード条件分離

Attributes:
  - [ ] ATTR-001: テスト関数に#[test]
  - [ ] ATTR-002: テストヘルパーに#[test_only]
  - [ ] ATTR-003: 失敗テストに#[expected_failure]
  - [ ] ATTR-004: vector<u8>エラーに#[error]
  - [ ] ATTR-005: #[error]のみ使用（code手動指定は非推奨）

CodeStructure:
  - [ ] STRUCT-001: セクションコメント使用
  - [ ] STRUCT-002: 関数順序の統一
  - [ ] STRUCT-003: Ability順序の統一

MethodSyntax:
  - [ ] BEST-001: Method Syntax必須化（&T, &mut T関数）
  - [ ] BEST-002: 標準ライブラリでのMethod Syntax適用
  - [ ] BEST-003: カスタム構造体のMethod Syntax対応設計
  - [ ] BEST-004: 例外規定の適切な適用

Security:
  - [ ] SEC-001: 公開可変参照の回避
  - [ ] SEC-002: 未使用公開関数の削除

Performance:
  - [ ] PERF-001: ランダムアクセス重視時のコンテナ選択（100要素以上でTable使用）
  - [ ] PERF-002: 順序保持が必要な場合のLinkedTable/TableVec使用
  - [ ] PERF-003: 大規模データ（1000要素以上）でTableVec使用
  - [ ] PERF-004: 異種型保持時のBag使用
  - [ ] PERF-005: オブジェクト値にはObjectTable/ObjectBag使用
  - [ ] PERF-ANTI-001: VecMap/VecSetは100要素まで（ERROR）
  - [ ] PERF-ANTI-002: 不要な線形探索の回避（インデックス活用）
  - [ ] PERF-ANTI-003: vector::removeの多用禁止（swap_remove使用）
  - [ ] PERF-ANTI-004: LinkedTableの逆順イテレーション回避
  - [ ] PERF-BEST-001: 大規模処理のバッチ化
  - [ ] PERF-BEST-002: セカンダリインデックス戦略の実装
  - [ ] PERF-BEST-003: メモリ効率的なイテレーション
  - [ ] PERF-BEST-004: 論理削除+バッチ物理削除パターン

VectorMacros:
  - [ ] MACRO-001: ループよりマクロを優先（可読性・型安全性・保守性）
  - [ ] MACRO-002: do! vs destroy! の使い分け（順序保持の必要性）
  - [ ] MACRO-003: map! vs map_ref! の選択（所有権の扱い）
  - [ ] MACRO-004: fold! による複数集約の1パス化
  - [ ] MACRO-005: zip系マクロ6種の適切な選択
  - [ ] MACRO-006: ソートはサイズで選択（≤30: insertion_sort_by!, >30: merge_sort_by!）
  - [ ] MACRO-007: take_while! / skip_while! の適切な使用

BCS:
  - [ ] BCS-001: BCSの特性理解（決定的・コンパクト・型安全・検証可能）
  - [ ] BCS-002: 段階的パースパターン（bcs::new → peel_* → into_remainder_bytes）
  - [ ] BCS-003: peel関数の正しい使用（型とバイトサイズの対応）
  - [ ] BCS-004: ベクター処理（peel_vec_length + ループ）
  - [ ] BCS-005: Rust側でのBCS取得（with_bcs()オプション）
  - [ ] BCS-006: 型安全なデシリアライズ（Move型定義と厳密に一致）
  - [ ] BCS-007: CLIでのBCS活用（--bcsフラグ）
  - [ ] BCS-008: GraphQLでのBCS取得（bcsフィールド）
  - [ ] BCS-009: エラーハンドリング（長さ確認・型一致・順序一致）
  - [ ] BCS-BEST-001: バージョニング戦略（バージョンフィールド先頭配置）
  - [ ] BCS-BEST-002: 可変長データの効率的処理（ULEB活用）
  - [ ] BCS-BEST-003: ガスコスト最適化（適切な型選択・Option活用）
  - [ ] BCS-BEST-004: ラウンドトリップテスト実施
```

### A.2 VS Code設定テンプレート

```json
{
  "claude.linter.rules": {
    "move-style": {
      "enabled": true,
      "severity": {
        "M2024-001": "error",   // public struct必須
        "M2024-002": "error",   // mut宣言必須
        "M2024-003": "error",   // セミコロンモジュール宣言
        "M2024-004": "error",   // 予約語禁止
        "M2024-005": "warning", // デフォルトエイリアス重複禁止
        "NAME-*": "error",
        "ENUM-*": "error",
        "ATTR-001": "error",    // #[test]属性
        "ATTR-002": "warning",  // #[test_only]属性
        "ATTR-003": "warning",  // #[expected_failure]属性
        "ATTR-004": "error",    // #[error]属性必須
        "ATTR-005": "warning",  // #[error]のみ使用
        "STRUCT-*": "warning",
        "MATCH-*": "warning",
        "BEST-001": "warning",  // Method Syntax徹底
        "BEST-002": "warning",  // Method Syntax適用パターン
        "BEST-003": "info",     // カスタム構造体設計
        "BEST-004": "info",     // public(package)使用
        "SEC-*": "error",
        "PERF-001": "warning",  // ランダムアクセスコンテナ選択
        "PERF-002": "warning",  // 順序保持コンテナ選択
        "PERF-003": "warning",  // 大規模データコンテナ選択
        "PERF-004": "warning",  // 異種型コンテナ選択
        "PERF-005": "info",     // オブジェクトコンテナ選択
        "PERF-ANTI-001": "error",    // VecMap/VecSet大規模使用禁止
        "PERF-ANTI-002": "warning",  // 線形探索回避
        "PERF-ANTI-003": "error",    // vector::remove多用禁止
        "PERF-ANTI-004": "warning",  // LinkedTable逆順イテレーション
        "PERF-BEST-*": "info",       // ベストプラクティス
        "MACRO-001": "warning",      // ループよりマクロ優先
        "MACRO-002": "info",         // do! vs destroy!
        "MACRO-003": "warning",      // map! vs map_ref!
        "MACRO-004": "info",         // fold!による最適化
        "MACRO-005": "info",         // zip系マクロ選択
        "MACRO-006": "info",         // ソートマクロ選択
        "MACRO-007": "info",         // take_while/skip_while
        "BCS-001": "info",           // BCS特性理解
        "BCS-002": "warning",        // 段階的パースパターン
        "BCS-003": "error",          // peel関数の正しい使用
        "BCS-004": "warning",        // ベクター処理
        "BCS-005": "info",           // Rust側BCS取得
        "BCS-006": "error",          // 型安全デシリアライズ
        "BCS-007": "info",           // CLI活用
        "BCS-008": "info",           // GraphQL活用
        "BCS-009": "error",          // エラーハンドリング
        "BCS-BEST-001": "warning",   // バージョニング戦略
        "BCS-BEST-002": "info",      // 可変長データ処理
        "BCS-BEST-003": "info",      // ガスコスト最適化
        "BCS-BEST-004": "warning"    // ラウンドトリップテスト
      }
    }
  }
}
```

### A.3 Move.toml設定例

```toml
[package]
name = "CounterApp"
version = "0.0.1"
edition = "2024"

[addresses]
counter_app = "0x0"

[dependencies]
Sui = {
  git = "https://github.com/MystenLabs/sui.git",
  subdir = "crates/sui-framework/packages/sui-framework",
  rev = "framework/mainnet"
}
```

---

## Part VIII: BCS (Binary Canonical Serialization)

### 8.1 BCSの基礎知識 [INFO]

**なぜ重要**: BCSはSui Moveの標準シリアライゼーション形式で、オブジェクトデータの保存・通信・検証に使用される。効率的で決定的なバイナリ形式により、データの一貫性とガスコスト削減を実現。

#### BCS-001: BCSの特性

**主要な特性**:
- **決定的**: 同じデータは常に同じバイト列にシリアライズされる
- **コンパクト**: 可変長エンコーディングで効率的
- **型安全**: Move型システムとの完全な統合
- **検証可能**: クリプトグラフィックハッシュやシグネチャとの親和性

**サポートされる型**:
- プリミティブ: `u8`, `u16`, `u32`, `u64`, `u128`, `u256`, `bool`, `address`
- コンテナ: `vector<T>`, `option<T>`
- 構造体: `has store` または `has copy` を持つもの

### 8.2 Move言語でのBCSパース [WARNING]

#### BCS-002: 段階的パースパターン

**基本パターン**: `bcs::new()` → `peel_*()` → `into_remainder_bytes()`

```move
use sui::bcs::{Self, BCS};

fun deserialize_user_action(bytes: vector<u8>): (u8, u64, address, vector<u8>) {
    let prepared: BCS = bcs::new(bytes);

    // 順番に読み取る
    let action_type = prepared.peel_u8();
    let amount = prepared.peel_u64();
    let user = prepared.peel_address();

    // 残りのバイト列を取得
    let remaining = prepared.into_remainder_bytes();

    (action_type, amount, user, remaining)
}
```

**重要な注意点**:
- ❌ `peel_*()` の順序を間違えると不正なデータを読み取る
- ❌ 型サイズの不一致はabortを引き起こす
- ✅ 読み取り順序は書き込み順序と厳密に一致させる
- ✅ エラーハンドリングで`into_remainder_bytes()`の長さを確認

#### BCS-003: 利用可能なpeel関数一覧

**プリミティブ型**:
- `peel_bool()` - 1バイト（0x00 = false, 0x01 = true）
- `peel_u8()` - 1バイト
- `peel_u16()` - 2バイト（リトルエンディアン）
- `peel_u32()` - 4バイト（リトルエンディアン）
- `peel_u64()` - 8バイト（リトルエンディアン）
- `peel_u128()` - 16バイト（リトルエンディアン）
- `peel_u256()` - 32バイト（リトルエンディアン）
- `peel_address()` - 32バイト

**ベクター型**:
- `peel_vec_length()` - ULEBベクター長の読み取り
- `peel_vec_u8()` - `vector<u8>` の読み取り
- `peel_vec_bool()` - `vector<bool>` の読み取り
- `peel_vec_address()` - `vector<address>` の読み取り

#### BCS-004: ベクター処理の実践パターン [WARNING]

**基本パターン**: 長さ読み取り → ループでpeel

```move
fun deserialize_vec_u64(bytes: vector<u8>): vector<u64> {
    let prepared = bcs::new(bytes);
    let len = prepared.peel_vec_length();

    let result = vector::empty<u64>();
    let i = 0;
    while (i < len) {
        result.push_back(prepared.peel_u64());
        i = i + 1;
    };

    result
}
```

**文字列処理（vector<u8>から）**:
```move
use std::string::{Self, String};

fun parse_string_field(bcs: &mut BCS): String {
    let bytes = bcs.peel_vec_u8();
    string::utf8(bytes)  // UTF-8検証付き変換
}
```

**注意点**:
- `peel_vec_length()` は実際のベクター長を返す（バイト数ではない）
- ❌ 固定長と仮定してループを回すとabort
- ✅ 常に`peel_vec_length()`で動的に長さを取得

### 8.3 Rust側でのBCS処理 [INFO]

#### BCS-005: オブジェクトBCSデータの取得

**Sui SDKを使用した取得**:
```rust
use sui_sdk::SuiClient;
use sui_types::base_types::ObjectID;

async fn get_object_bcs(client: &SuiClient, object_id: ObjectID) -> Result<Vec<u8>, Error> {
    let resp = client
        .read_api()
        .get_object_with_options(
            object_id,
            SuiObjectDataOptions::default().with_bcs()
        )
        .await?
        .into_object()?;

    let move_object = resp.bcs.ok_or(Error::NoBcsData)?;
    let raw_obj = move_object.try_into_move()?;
    Ok(raw_obj.bcs_bytes)
}
```

#### BCS-006: BCSからRust構造体へのデシリアライズ

**型レイアウトを使用した安全な変換**:
```rust
use move_core_types::language_storage::TypeTag;
use serde::Deserialize;

#[derive(Deserialize)]
struct Counter {
    id: UID,
    value: u64,
    owner: address,
}

impl SuiRawMoveObject {
    pub fn deserialize<'a, T: Deserialize<'a>>(&'a self) -> Result<T, anyhow::Error> {
        Ok(bcs::from_bytes(self.bcs_bytes.as_slice())?)
    }
}

// 使用例
let counter: Counter = raw_object.deserialize()?;
```

**フォールバック戦略**: パースに失敗した場合は生バイト配列として扱う
```rust
use serde_json::{json, Number, Value as JsonValue};

fn bcs_to_json_fallback(bytes: &[u8]) -> JsonValue {
    JsonValue::Array(
        bytes.iter()
            .map(|b| JsonValue::Number(Number::from(*b)))
            .collect()
    )
}
```

### 8.4 CLIとGraphQLでのBCS活用 [INFO]

#### BCS-007: Sui CLIでのBCS取得

**基本コマンド**:
```bash
# BCSデータを取得（Base64エンコード）
sui client object <OBJECT_ID> --bcs

# JSONとBCSの両方を取得
sui client object <OBJECT_ID> --json --bcs
```

**活用シーン**:
- オブジェクトの生データ検証
- オフチェーンでのデータ処理
- カスタムデシリアライゼーションのテスト

#### BCS-008: GraphQLでのBCS取得

**基本クエリ**:
```graphql
query GetObjectBcs($id: SuiAddress!) {
  object(address: $id) {
    address
    version
    digest
    bcs  # Base64エンコードされたBCSデータ
  }
}
```

**TypeScript/JavaScriptでのデコード**:
```typescript
import { bcs } from '@mysten/sui.js/bcs';

// Base64 → バイト配列
const bcsBytes = Buffer.from(response.data.object.bcs, 'base64');

// BCS → 構造体
const counter = bcs.struct('Counter', {
  id: bcs.Address,
  value: bcs.u64(),
  owner: bcs.Address
}).parse(new Uint8Array(bcsBytes));
```

### 8.5 BCSエラーハンドリング [WARNING]

#### BCS-009: 一般的なエラーパターンと対策

**エラーパターン1: データ長不足**
```move
// ❌ 問題: バイト列が短すぎる
fun parse_insufficient_data(bytes: vector<u8>): u64 {
    let bcs = bcs::new(bytes);  // 4バイトしかない
    bcs.peel_u64()  // 8バイト必要 → abort!
}

// ✅ 対策: 長さ確認
fun parse_with_validation(bytes: vector<u8>): Option<u64> {
    if (bytes.length() < 8) {
        return option::none()
    };
    let bcs = bcs::new(bytes);
    option::some(bcs.peel_u64())
}
```

**エラーパターン2: 型不一致**
```rust
// ❌ 問題: Move側の型と一致しない
#[derive(Deserialize)]
struct MismatchedCounter {
    id: UID,
    value: u32,  // Move側はu64！
}

// ✅ 対策: Move型定義と厳密に一致させる
#[derive(Deserialize)]
struct CorrectCounter {
    id: UID,
    value: u64,  // Move側と一致
}
```

**エラーパターン3: 順序エラー**
```move
// Move側のシリアライズ順序
public struct Event has copy, drop {
    timestamp: u64,
    event_type: u8,
    data: vector<u8>
}

// ❌ 問題: 読み取り順序が違う
fun parse_wrong_order(bytes: vector<u8>): Event {
    let bcs = bcs::new(bytes);
    Event {
        event_type: bcs.peel_u8(),      // 間違い！
        timestamp: bcs.peel_u64(),      // 間違い！
        data: bcs.peel_vec_u8()
    }
}

// ✅ 対策: 構造体定義の順序と一致
fun parse_correct_order(bytes: vector<u8>): Event {
    let bcs = bcs::new(bytes);
    Event {
        timestamp: bcs.peel_u64(),      // 正しい順序
        event_type: bcs.peel_u8(),
        data: bcs.peel_vec_u8()
    }
}
```

### 8.6 BCSベストプラクティス [INFO]

#### BCS-BEST-001: バージョニング戦略

**問題**: 構造体の変更でBCS互換性が壊れる

**解決策**: バージョンフィールドを先頭に配置
```move
public struct VersionedData has store {
    version: u8,  // 必ず最初のフィールド
    // V1フィールド
    value: u64,
    // V2で追加されたフィールド（Option型で後方互換性）
    metadata: Option<vector<u8>>
}

fun deserialize_versioned(bytes: vector<u8>): VersionedData {
    let bcs = bcs::new(bytes);
    let version = bcs.peel_u8();

    if (version == 1) {
        // V1形式のパース
        VersionedData {
            version: 1,
            value: bcs.peel_u64(),
            metadata: option::none()
        }
    } else if (version == 2) {
        // V2形式のパース
        VersionedData {
            version: 2,
            value: bcs.peel_u64(),
            metadata: deserialize_option(&mut bcs)
        }
    } else {
        abort EUnsupportedVersion
    }
}
```

#### BCS-BEST-002: 可変長データの効率的な処理

**推奨パターン**: 長さプレフィックス + データ
```move
// ✅ BCS標準の可変長エンコーディングを活用
fun serialize_dynamic_data(data: vector<vector<u8>>): vector<u8> {
    // BCSは自動的に長さをULEBエンコード
    bcs::to_bytes(&data)
}

// ✅ デシリアライズも対応
fun deserialize_dynamic_data(bytes: vector<u8>): vector<vector<u8>> {
    let bcs = bcs::new(bytes);
    let outer_len = bcs.peel_vec_length();

    let result = vector::empty();
    let i = 0;
    while (i < outer_len) {
        result.push_back(bcs.peel_vec_u8());
        i = i + 1;
    };
    result
}
```

#### BCS-BEST-003: ガスコスト最適化

**原則**: BCSサイズを最小化してストレージコストを削減

**最適化手法**:
1. **小さい整数型を使用**: `u8` < `u16` < `u32` < `u64`
2. **Option型の活用**: 存在しないデータは1バイト（0x00）
3. **ベクター長のULEB**: 127以下なら1バイト、16383以下なら2バイト
4. **不要なフィールドの削除**: `has drop`でクリーンアップ

```move
// ❌ 非効率: すべてu64を使用（120バイト）
public struct Inefficient has store {
    small_counter: u64,      // 実際は0-255の範囲なのに8バイト
    flags: u64,              // ブール値配列なのに8バイト
    optional_data: u64       // 大抵は0なのに8バイト
}

// ✅ 効率的: 適切な型を選択（3バイト + α）
public struct Efficient has store {
    small_counter: u8,           // 1バイト
    flags: u8,                   // 1バイト（ビットフラグ）
    optional_data: Option<u64>   // 存在しなければ1バイト
}
```

#### BCS-BEST-004: テストでのBCS検証

**推奨パターン**: ラウンドトリップテスト
```move
#[test]
fun test_bcs_roundtrip() {
    let original = TestData {
        id: object::id_from_address(@0x123),
        value: 42,
        metadata: vector[1, 2, 3]
    };

    // シリアライズ
    let bytes = bcs::to_bytes(&original);

    // デシリアライズ
    let deserialized = deserialize_test_data(bytes);

    // 検証
    assert!(deserialized.value == original.value, 0);
    assert!(deserialized.metadata == original.metadata, 1);
}
```

---

## 使用例

### コマンドライン
```bash
# 全ルールチェック
claude "Review my Move code against LINT_MOVE.md"

# 特定レベルのみ
claude "Check ERROR level rules only"

# 特定カテゴリのみ
claude "Check ENUM-* and MATCH-* rules"

# BCS関連のチェック
claude "Check BCS-* rules for serialization safety"
```

**このガイドは Sui Move 2024.beta エディション対応の包括的なスタイルガイドです。**