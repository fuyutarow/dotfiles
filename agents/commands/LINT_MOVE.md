# Sui Move Linter スタイルガイド v3.0

## 概要
- **対象バージョン**: Sui Move 2024.beta
- **用途**: コードレビュー、自動チェック、品質保証
- **重要度レベル**: ERROR（必須） | WARNING（推奨） | INFO（提案）

---

## Part I: 言語仕様準拠

### 1.1 Move 2024必須要件 [ERROR]

Move 2024エディションでは、後方互換性を犠牲にしてでも型安全性と明示性を優先する設計方針が採用されています。これらの要件は**コンパイル時に強制**されるため、遵守しなければコードは動作しません。

#### M2024-001: 構造体のpublic宣言

構造体の可視性を明示することで、モジュール境界を越えたアクセス制御が明確になります。

- ❌ `struct Counter has key { ... }` （コンパイルエラー）
- ✅ `public struct Counter has key { ... }` （必須）
- **自動修正**: 可能

#### M2024-002: 変数のmutability宣言

再代入が必要な変数には明示的に`mut`を指定します。これにより、変更可能性が一目で分かり、意図しない変更を防げます。

- ❌ `let value = x; value = value + 1;` （エラー）
- ✅ `let mut value = x; value = value + 1;` （OK）
- **自動修正**: 可能

#### M2024-003: モジュール宣言形式

セミコロン形式により、モジュール宣言とモジュール本体を明確に分離します。

- ❌ `module counter_app::counter { ... }` （古い形式）
- ✅ `module counter_app::counter;` （Move 2024形式）

#### M2024-004: 予約語の使用禁止

将来の言語拡張で追加される可能性のある`enum`, `match`などの予約語は、変数名として使用できません。

- ❌ `let enum = 5; let match = true;` （予約語使用）
- ✅ `let enum_type = 5; let match_result = true;` （代替名）

#### M2024-005: デフォルトエイリアスの重複宣言禁止 [WARNING]

Move 2024では主要モジュール・型にデフォルトエイリアスが自動提供されるため、明示的なimportは不要です。

**デフォルトで利用可能（import不要）**:
- 型: `UID`, `ID`, `TxContext`
- モジュール: `sui::object`, `sui::transfer`, `sui::tx_context`

**推奨される書き方**:
- ❌ `use sui::object::{Self, ID, UID};` （不要、警告発生）
- ❌ `use sui::transfer;` （不要）
- ✅ `UID`, `TxContext`, `object::new()` を直接使用
- ✅ 必要なものだけimport: `Coin<SUI>`, `event`, `clock::Clock`など

### 1.2 Move.toml設定 [ERROR]

プロジェクトの基本設定は、Move 2024の機能を有効化するために必須です。

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

### 1.3 命名規則 [ERROR]

一貫した命名規則により、コードの可読性が向上し、チーム開発での混乱を防ぎます。

#### NAME-001: パッケージ名はPascalCase
- ❌ `name = "counter_app"` （snake_case）
- ✅ `name = "CounterApp"` （PascalCase）

#### NAME-002: エラー定数の命名とattribute

エラー定数は`E`で始まるPascalCaseを使用し、`#[error]`属性で自動採番します。

- ❌ `const ERROR_INVALID: u64 = 0;` （プレフィックス違反）
- ❌ `const EInvalidInput: vector<u8> = b"...";` （#[error]属性なし）
- ✅ `const EInvalidInput: u64 = 0;` （u64エラーコード）
- ✅ `#[error] const EInvalidInput: vector<u8> = b"...";` （カスタムメッセージ）

**エラー管理のベストプラクティス**:
- **宣言順序を保持**: エラー定数の宣言順序がエラーコードとなる
- **削除禁止**: 既存エラーの削除は後続のエラーコードを変えるため不可
- **非推奨化**: 使わなくなったエラーは`#[deprecated]`でマーク
- **グループ化**: コメントでエラーをカテゴリ分け

#### NAME-003: 通常定数はUPPER_SNAKE_CASE
- ❌ `const maxValue: u64 = 1000;` （camelCase）
- ✅ `const MAX_VALUE: u64 = 1000;` （UPPER_SNAKE_CASE）

#### NAME-004: 関数名はsnake_case
- ❌ `public fun CreateCounter() {}` （PascalCase）
- ✅ `public fun create_counter() {}` （snake_case）

#### NAME-005: Getter関数のプレフィックス禁止

Move 2024では簡潔性を重視し、冗長な`get_`プレフィックスを避けます。

- ❌ `public fun get_balance(self: &Account): u64` （get_プレフィックス）
- ✅ `public fun balance(self: &Account): u64` （直接的な名前）

#### NAME-006: コンストラクタの命名パターン

一貫した命名により、オブジェクトのライフサイクル管理が明確になります。

- ✅ `new()` - オブジェクトを返すだけ
- ✅ `create_and_share()` - オブジェクト作成＋共有
- ✅ `create_for_user()` - オブジェクト作成＋転送

---

## Part II: 型システムと構造

### 2.1 Method Syntax [WARNING]

Move 2024の最も重要な機能の一つがMethod Syntaxです。これにより、従来の`module::function(&obj)`形式から`obj.function()`形式への移行が可能になり、コードの可読性が大幅に向上します。

#### MS-001: Method Syntax必須化の原則

第一引数が`&T`または`&mut T`の関数は、必ずMethod Syntaxで呼び出します。ただし、**第一引数の名前が`self`である必要**があります。

**適用対象**:
- ✅ `self: &Counter`, `self: &mut Account` （自身の構造体への参照）
- ❌ `ctx: &TxContext`, `coin: &mut Coin<SUI>` （他の型は除外）

**チェックポイント**:
1. 第一引数が`&YourStruct`または`&mut YourStruct` → `self`必須
2. 第一引数が`&TxContext`や`&Clock`などの外部型 → `self`不要
3. コンストラクタ（`new`など） → `self`不要

#### MS-002: 標準ライブラリでの適用

Move 2024では、標準ライブラリの全ての関数がMethod Syntax対応になっています。積極的に活用しましょう。

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

```move
// ✅ Method Syntax対応の設計
public fun balance(self: &Account): u64 {
    self.balance_value
}

// 使用時
let bal = account.balance();  // 簡潔で読みやすい
```

#### MS-003: 例外規定

以下の場合は`module::function`形式を使用します：

- 静的関数（コンストラクタ、ファクトリ関数）: `Counter::new(0, ctx)`
- 型推論が困難な場合: `bcs::to_bytes(&data)`
- モジュール境界を明確化したい場合: `transfer::public_transfer(obj, addr)`

### 2.2 Enum定義とパターンマッチング

#### ENUM-001: Enum基本構造 [ERROR]

Enumは3つのバリアント形式をサポートします：

- **ユニット**: `Pending` （値なし）
- **タプル**: `Processing(u64)` （位置引数）
- **名前付きフィールド**: `Completed { amount: u64, timestamp: u64 }` （構造体風）

#### ENUM-002: Match式の完全性 [ERROR]

Match式では全バリアントを網羅する必要があります。これにより、コンパイル時に処理漏れを検出し、バリアント追加時の回帰を防ぎます。

**要件**: 全バリアントを網羅する（`_` ワイルドカードは避ける）

```move
// ✅ 全バリアント網羅
match status {
    OrderStatus::Pending => handle_pending(),
    OrderStatus::Processing(amount) => handle_processing(amount),
    OrderStatus::Completed { amount, timestamp } => handle_completed(amount, timestamp),
}

// ❌ ワイルドカード使用（新バリアント追加時に問題）
match status {
    OrderStatus::Pending => handle_pending(),
    _ => handle_other(),  // 処理漏れの可能性
}
```

#### ENUM-003: バリアント命名 [ERROR]

**ルール**: PascalCase必須
- ❌ `pending`, `PROCESSING`, `complete_success`
- ✅ `Pending`, `Processing`, `CompleteSuccess`

#### ENUM-004: バージョニング戦略 [WARNING]

既存enumへのバリアント追加は破壊的変更です。安全な拡張方法：

1. 新バージョンのenumを定義（例: `OrderStatusV2`）
2. 移行関数を提供
3. 既存のV1は維持（後方互換性）

### 2.3 属性（Attributes）システム

#### ATTR-001: テスト関連属性 [ERROR/WARNING]

- `#[test]` - テスト関数に必須
- `#[test_only]` - テスト専用ヘルパー関数に使用
- `#[expected_failure]` - 失敗が期待されるテストに使用

```move
#[test]
fun test_counter_creation() { ... }

#[test_only]
public fun create_test_scenario(...) { ... }

#[test]
#[expected_failure(abort_code = EInvalidInput)]
fun test_invalid_input() { ... }
```

#### ATTR-002: エラー定義属性 [WARNING]

`#[error]`による自動採番により、エラー番号の管理負担を減らします。

- ✅ `#[error] const EInvalidInput: vector<u8> = b"...";` （自動採番）
- ❌ `#[error(code = 1)] const EInvalidAmount: vector<u8> = b"...";` （手動指定不要）

---

## Part III: コード品質

### 3.1 ファイル構造 [WARNING]

#### STRUCT-001: セクションコメントで構造化

推奨セクション順序：

```move
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

### 3.2 public(package)使用 [INFO]

`friend`機能は廃止予定です。代わりに`public(package)`を使用します。

- ❌ `friend module; public(friend) fun f()` （廃止予定）
- ✅ `public(package) fun f()` （推奨）

---

## Part IV: 実行時最適化

### 4.1 コンテナ選択ガイドライン

適切なコンテナ選択は、ガスコストとトランザクション実行時間に直接影響します。以下のフローチャートに従って選択してください。

#### PERF-FLOW: 選択フローチャート

```text
あなたのユースケースは？
├─ キーによる検索・更新・削除が頻繁
│  ├─ 要素数 < 100 → VecMap<K,V>（シンプル、十分高速）
│  └─ 要素数 ≥ 100 → Table<K,V>（期待値O(1)、必須）
│
├─ 順序保持が必要
│  ├─ 順序 + キーアクセス → LinkedTable<K,V>
│  ├─ 順序 + 添字アクセス → TableVec<T> (要素数≥1000) または vector<T> (要素数<1000)
│  └─ 順序のみ → vector<T>
│
├─ 異なる型の値を保持
│  ├─ 値が`key` ability → ObjectBag
│  └─ 値が通常の型 → Bag
│
└─ 値がオブジェクト（`key` ability）
   ├─ キーアクセス必要 → ObjectTable<K,V>
   └─ 異種型も必要 → ObjectBag
```

#### PERF-001: ランダムアクセス重視の場合 [WARNING]

ランダムアクセスが頻繁な場合、データ構造の選択はパフォーマンスに直結します。要素数が100を超える場合、VecMapの線形探索O(n)は実用的でなくなるため、ハッシュベースのTableへの移行が必須となります。一方、要素数が10程度であれば、線形探索でも十分高速であり、VecMapのシンプルさがメリットとなります。10〜100要素の中間領域では、アクセスパターンと更新頻度を考慮して選択します。

**選択基準**:
- 要素数 < 100 → `VecMap<K,V>` も許容範囲（O(n) だが実用的）
- 要素数 ≥ 100 → `Table<K,V>` / `ObjectTable<K,V>` 必須（期待値 O(1)*）

*「期待値 O(1)」はハッシュテーブルの負荷率が適切な範囲に維持される限り成立します。Sui Moveの動的フィールド実装では、ハッシュ衝突が稀であるため、ほとんどの場合でO(1)アクセスが実現されます。

#### PERF-002: 順序保持が必要な場合 [WARNING]

挿入順序の保持とランダムアクセスの両方が必要な場合、LinkedTableまたはTableVecを選択します。LinkedTableは双方向リンクリストで順序を保持しつつキーベースアクセスが可能です。TableVecは添字による直接アクセスと順序保持を両立します。

**選択基準**:
- 順序 + ランダムアクセス必要 → `LinkedTable<K,V>`
- 順序 + 添字アクセス必要 → `TableVec<T>`（要素数≥1000） または `vector<T>`（要素数<1000）
- 順序のみ（ランダムアクセス不要） → `vector<T>`

#### PERF-003: 添字アクセスが必要な場合 [WARNING]

配列ライクなアクセスパターンでは、データ規模に応じて選択します。vectorは全要素をメモリに保持するため、大規模データでは枯渇リスクがあります。TableVecは動的フィールドで要素を分散保存し、無制限にスケール可能です。

**選択基準**:
- 要素数 < 1000 → `vector<T>`（メモリ効率良好）
- 要素数 ≥ 1000 → `TableVec<T>`（動的フィールドで分散保存）
- 順序変更OK + 削除頻繁 → `swap_remove()` を活用（O(1) 削除）

### 4.2 コンテナ計算量リファレンス [INFO]

実装の詳細を理解したい場合の参考資料として、各コンテナの時間計算量を示します。

| コンテナ | 追加 | 削除 | 検索/参照 | 全件走査 | サイズ取得 |
|---------|------|------|-----------|----------|-----------|
| `std::vector<T>` | push_back: O(1)*<br>insert(i): O(n) | pop_back: O(1)<br>remove(i): O(n)<br>swap_remove(i): O(1) | インデックス参照: O(1)<br>contains/index_of: O(n) | O(n) | O(1) |
| `sui::table::Table<K,V>` | add: O(1)** | remove: O(1)** | borrow/contains: O(1)** | **API なし** | O(1) |
| `sui::bag::Bag` | add: O(1)** | remove: O(1)** | contains: O(1)** | **API なし** | O(1) |
| `sui::object_table::ObjectTable<K,V>` | add: O(1)** | remove: O(1)** | borrow/contains: O(1)** | **API なし** | O(1) |
| `sui::object_bag::ObjectBag` | add: O(1)** | remove: O(1)** | contains: O(1)** | **API なし** | O(1) |
| `sui::linked_table::LinkedTable<K,V>` | push_front/back: O(1)** | pop_front/back: O(1)**<br>remove(k): O(1)** | borrow/prev/next: O(1)** | O(n) | O(1) |
| `sui::table_vec::TableVec<T>` | push_back: O(1)** | pop_back: O(1)**<br>swap_remove(i): O(1) | borrow(i): O(1)** | O(n) | O(1) |
| `sui::vec_map::VecMap<K,V>` | O(n) | O(n) | get/contains: O(n) | O(n) | O(1) |
| `sui::vec_set::VecSet<K>` | O(n) | O(n) | contains: O(n) | O(n) | O(1) |

*amortized O(1): 容量再確保が発生しない限りO(1)、発生時はO(n)だが平均するとO(1)
**期待値 O(1): ハッシュテーブルの負荷率が適切な範囲に維持される限り成立

**ガスコストとの関係**:
- 動的フィールドは**アクセス時にのみガスに影響**
- 実際のガスコストは読み書きバイト数にも依存
- O(1) でも大きなオブジェクトの読み書きは高コスト

### 4.3 アンチパターン [ERROR/WARNING]

#### PERF-ANTI-001: 大規模データでのVecMap/VecSet使用 [ERROR]

VecMap/VecSetは全ての操作がO(n)のため、データ量に比例してガスコストが増大します。100要素を超える場合、毎回の線形探索が実用的でなくなります。

**問題のパターン**:
- `VecMap<K,V>` / `VecSet<K>` を100要素以上で使用
- `contains()`, `get()`, `insert()`, `remove()` が毎回線形探索

**解決策**:
- 100要素以上 → `Table<K,V>` / `ObjectTable<K,V>` へ移行

#### PERF-ANTI-002: vector::remove の多用 [ERROR]

`remove(i)`はO(n)で、i以降の全要素をシフトします。ループ内で使うとO(n²)になります。

**解決策**:
- **順序不要の場合**: `swap_remove(i)` を使用（O(1)）
- **順序必要の場合**: フィルタして新しい vector を作成
- **頻繁な削除**: 論理削除（フラグ）+ 後でバッチ物理削除

### 4.4 大規模データ処理のベストプラクティス

#### PERF-BEST-001: バッチ処理パターン [INFO]

大規模データ（数十万〜数百万レコード†）の処理を複数トランザクションに分割し、ガスコスト超過を防ぎます。

†実際の上限はSuiネットワークのガス制限設定に依存します。記載の数値は一般的なネットワーク設定における目安です。

**実装戦略**:
1. **start_index** と **batch_size** パラメータで処理範囲を制御
2. 1トランザクションあたり100〜1000レコード程度に制限‡
3. クライアント側でループしながら複数トランザクション実行

‡バッチサイズは処理内容により調整が必要です。記載の数値は一般的なCRUD操作での経験値です。

**構造設計**:
```move
public struct UserRegistry has key {
    id: UID,
    users: Table<address, UserProfile>,      // プライマリデータ
    active_users: TableVec<address>,         // 処理対象リスト
    total_users: u64
}
```

#### PERF-BEST-002: セカンダリインデックス戦略 [INFO]

複数の検索条件に対応するため、プライマリキー以外のインデックスを維持します。

**実装パターン**:
- **プライマリデータ**: `ObjectTable<PrimaryKey, Entity>`
- **セカンダリインデックス**: `Table<SecondaryKey, TableVec<PrimaryKey>>`
- 追加・削除時に全インデックスを同期更新

**例: NFTマーケットプレイス**
```move
public struct NFTMarketplace has key {
    nfts: ObjectTable<u64, NFT>,                          // token_id → NFT
    nfts_by_owner: Table<address, TableVec<u64>>,        // owner → token_ids
    nfts_by_collection: Table<vector<u8>, TableVec<u64>> // collection → token_ids
}
```

**トレードオフ**: インデックス増加で追加・削除コスト上昇 vs 検索性能向上

### 4.5 Vectorマクロ活用

Move 2024で導入されたvectorマクロにより、関数型プログラミングのパターンを簡潔に記述できます。従来のループベースの実装と比較して、コード量を大幅に削減できます§。

§削減率は処理内容により変動します。以下の数値は一般的なケースでの経験値です。

#### 必須マクロ（90%のケースをカバー）

| マクロ | 用途 | 従来のループ実装 | マクロ実装 | 削減効果 |
|-------|------|----------------|-----------|---------|
| `map!` / `map_ref!` | 全要素を変換 | 5-7行 | 1行 | 約80% |
| `filter!` | 条件で絞り込み | 6-8行 | 1行 | 約85% |
| `fold!` | 集約・統計 | 4-6行 | 1-2行 | 約65% |
| `do!` / `do_mut!` | 副作用のある処理 | 3-5行 | 1行 | 約70% |

#### 状況別マクロ

| マクロ | 用途 | 計算量 | 特徴 |
|-------|------|--------|------|
| `any!` / `all!` | 条件判定 | O(n) 最良O(1) | 早期リターンで高速化 |
| `find_index!` | 検索 | O(n) 最良O(1) | 最初の一致インデックス |
| `zip_do!` / `zip_map!` | ペア処理 | O(n) | 2つのvectorを同期処理 |

#### 上級マクロ（特殊ケース）

- `tabulate!` - インデックスでvector生成
- `partition!` - 条件で2つに分割
- `take_while!` / `skip_while!` - 条件付き先頭処理
- `insertion_sort_by!` - 小規模ソート（≤30要素）
- `merge_sort_by!` - 大規模ソート（>30要素）

#### MACRO-001: ループよりマクロを優先 [WARNING]

vectorの走査・変換・集約処理では、マクロを優先的に使用します。

**理由**:
- **可読性**: 処理の意図が明確（"何をするか"が一目瞭然）
- **型安全性**: コンパイラが型チェックを厳密に実行
- **保守性**: ループ制御のバグ（オフバイワンエラーなど）を防ぐ

**選択基準**:
- 全要素の変換 → `map!` / `map_ref!`
- 条件付き抽出 → `filter!`
- 存在チェック → `any!` / `all!`
- 集計処理 → `fold!`
- 副作用のある処理 → `do!` / `do_mut!`

#### MACRO-002: map! vs map_ref! の選択基準 [WARNING]

所有権の必要性で選択します：

**`map!(v, f)` を使用する場合**:
- 元のvectorを消費してよい
- 要素の所有権が必要（moveセマンティクス）

**`map_ref!(v, f)` を使用する場合**:
- 元のvectorを保持したい
- 要素の参照のみで十分

#### MACRO-003: fold! による集約処理の最適化 [INFO]

複数の集約処理を1パスで実行することで、ガスコストを削減できます。

```move
// ❌ 非効率 - 3回のループ
let sum = v.fold!(0, |acc, x| acc + x);
let count = v.length();
let max = v.fold!(0, |acc, x| if (x > acc) x else acc);

// ✅ 効率的 - 1回のループ
let (sum, count, max) = v.fold!(
    (0, 0, 0),
    |(s, c, m), x| (s + x, c + 1, if (x > m) x else m)
);
```

### 4.6 BCS (Binary Canonical Serialization)

BCSはSui Moveの標準シリアライゼーション形式で、オブジェクトデータの保存・通信・検証に使用されます。効率的で決定的なバイナリ形式により、データの一貫性とガスコスト削減を実現します。

#### BCS-001: BCSの特性 [INFO]

**主要な特性**:
- **決定的**: 同じデータは常に同じバイト列にシリアライズされる
- **コンパクト**: 可変長エンコーディング（ULEB128）で効率的
- **型安全**: Move型システムとの完全な統合
- **検証可能**: クリプトグラフィックハッシュやシグネチャとの親和性

#### BCS-002: Move言語でのBCSパース [WARNING]

**基本パターン**: `bcs::new()` → `peel_*()` → `into_remainder_bytes()`

```move
use sui::bcs::{Self, BCS};

fun deserialize_user_action(bytes: vector<u8>): (u8, u64, address) {
    let prepared: BCS = bcs::new(bytes);
    let action_type = prepared.peel_u8();
    let amount = prepared.peel_u64();
    let user = prepared.peel_address();
    (action_type, amount, user)
}
```

**重要な注意点**:
- ❌ `peel_*()` の順序を間違えると不正なデータを読み取る
- ❌ 型サイズの不一致はabortを引き起こす
- ✅ 読み取り順序は書き込み順序と厳密に一致させる

#### BCS-003: peel関数一覧 [ERROR]

**プリミティブ型**:
- `peel_bool()` - 1バイト
- `peel_u8()` - 1バイト
- `peel_u16()` - 2バイト（リトルエンディアン）
- `peel_u32()` - 4バイト
- `peel_u64()` - 8バイト
- `peel_u128()` - 16バイト
- `peel_u256()` - 32バイト
- `peel_address()` - 32バイト

**ベクター型**:
- `peel_vec_length()` - ULEBベクター長の読み取り
- `peel_vec_u8()` - `vector<u8>` の読み取り
- `peel_vec_bool()` - `vector<bool>` の読み取り
- `peel_vec_address()` - `vector<address>` の読み取り

#### BCS-004: エラーハンドリング [ERROR]

BCSパース時の一般的なエラーパターンと対策：

**エラーパターン1: データ長不足**
```move
// ✅ 対策: 長さ確認
fun parse_with_validation(bytes: vector<u8>): Option<u64> {
    if (bytes.length() < 8) {
        return option::none()
    };
    let bcs = bcs::new(bytes);
    option::some(bcs.peel_u64())
}
```

**エラーパターン2: 順序エラー**
```move
// Move側のシリアライズ順序
public struct Event has copy, drop {
    timestamp: u64,
    event_type: u8,
    data: vector<u8>
}

// ✅ 対策: 構造体定義の順序と一致
fun parse_correct_order(bytes: vector<u8>): Event {
    let bcs = bcs::new(bytes);
    Event {
        timestamp: bcs.peel_u64(),      // 構造体定義の順序通り
        event_type: bcs.peel_u8(),
        data: bcs.peel_vec_u8()
    }
}
```

#### BCS-005: バージョニング戦略 [WARNING]

構造体の変更でBCS互換性が壊れることを防ぐため、バージョンフィールドを先頭に配置します。

```move
public struct VersionedData has store {
    version: u8,  // 必ず最初のフィールド
    value: u64,
    metadata: Option<vector<u8>>  // Option型で後方互換性
}

fun deserialize_versioned(bytes: vector<u8>): VersionedData {
    let bcs = bcs::new(bytes);
    let version = bcs.peel_u8();

    if (version == 1) {
        VersionedData {
            version: 1,
            value: bcs.peel_u64(),
            metadata: option::none()
        }
    } else if (version == 2) {
        VersionedData {
            version: 2,
            value: bcs.peel_u64(),
            metadata: option::some(bcs.peel_vec_u8())
        }
    } else {
        abort EUnsupportedVersion
    }
}
```

#### BCS-006: ガスコスト最適化 [INFO]

BCSサイズを最小化してストレージコストを削減します。

**最適化手法**:
1. **小さい整数型を使用**: `u8` < `u16` < `u32` < `u64`
2. **Option型の活用**: 存在しないデータは1バイト（0x00）
3. **ベクター長のULEB**: 127以下なら1バイト、16383以下なら2バイト

```move
// ❌ 非効率: すべてu64を使用
public struct Inefficient has store {
    small_counter: u64,      // 実際は0-255の範囲なのに8バイト
    flags: u64,              // ブール値配列なのに8バイト
    optional_data: u64       // 大抵は0なのに8バイト
}

// ✅ 効率的: 適切な型を選択
public struct Efficient has store {
    small_counter: u8,           // 1バイト
    flags: u8,                   // 1バイト（ビットフラグ）
    optional_data: Option<u64>   // 存在しなければ1バイト
}
```

---

## Part V: セキュリティとベストプラクティス

### 5.1 公開APIの設計 [ERROR]

#### SEC-001: 可変参照の公開制限

可変参照の公開は意図しない状態変更を許し、オブジェクトの整合性を破る可能性があります。制御された変更のみを許可するAPIを設計します。

- ❌ `public fun borrow_mut(&mut self): &mut T` （外部から直接変更可能）
- ✅ `public fun update(&mut self, value: T)` （制御された変更）
- ✅ `public(package) fun borrow_mut_internal(&mut self): &mut T` （パッケージ内のみ許可）

#### SEC-002: 未使用公開関数の削除

未使用の`public`関数は攻撃面を拡大します。不要な公開関数は削除、または`fun`にダウングレードします。

---

## 付録A: クイックリファレンス

### A.1 チェックリスト

```yaml
Move2024Compliance:
  - [ ] M2024-001: 全ての構造体にpublicキーワード
  - [ ] M2024-002: 再代入変数にmutキーワード
  - [ ] M2024-003: モジュール宣言でセミコロン
  - [ ] M2024-004: 予約語の変数名使用禁止
  - [ ] M2024-005: デフォルトエイリアスの重複宣言禁止

NamingConventions:
  - [ ] NAME-001: パッケージ名がPascalCase
  - [ ] NAME-002: エラー定数がEPascalCase + #[error]
  - [ ] NAME-003: 通常定数がUPPER_SNAKE_CASE
  - [ ] NAME-004: 関数名がsnake_case
  - [ ] NAME-005: Getter関数のget_プレフィックス禁止
  - [ ] NAME-006: コンストラクタ命名規則

MethodSyntax:
  - [ ] MS-001: Method Syntax必須化（第一引数がselfの場合）
  - [ ] MS-002: 標準ライブラリでのMethod Syntax適用
  - [ ] MS-003: 例外規定の適切な適用

EnumMatch:
  - [ ] ENUM-001: 3つのバリアント形式の理解
  - [ ] ENUM-002: match式の全バリアント網羅
  - [ ] ENUM-003: バリアント名がPascalCase
  - [ ] ENUM-004: バージョニング戦略採用

Attributes:
  - [ ] ATTR-001: テスト関数に#[test]
  - [ ] ATTR-002: #[error]による自動採番

CodeStructure:
  - [ ] STRUCT-001: セクションコメント使用
  - [ ] STRUCT-002: 関数順序の統一
  - [ ] STRUCT-003: Ability順序の統一

Performance:
  - [ ] PERF-FLOW: コンテナ選択フローチャートの活用
  - [ ] PERF-001: ランダムアクセス時の適切なコンテナ選択
  - [ ] PERF-002: 順序保持時の適切なコンテナ選択
  - [ ] PERF-003: 添字アクセス時の適切なコンテナ選択
  - [ ] PERF-ANTI-001: VecMap/VecSetは100要素まで
  - [ ] PERF-ANTI-002: vector::removeの多用禁止
  - [ ] PERF-BEST-001: 大規模処理のバッチ化
  - [ ] PERF-BEST-002: セカンダリインデックス戦略

VectorMacros:
  - [ ] MACRO-001: ループよりマクロを優先
  - [ ] MACRO-002: map! vs map_ref! の選択
  - [ ] MACRO-003: fold! による複数集約の1パス化

BCS:
  - [ ] BCS-001: BCSの特性理解
  - [ ] BCS-002: 段階的パースパターン
  - [ ] BCS-003: peel関数の正しい使用
  - [ ] BCS-004: エラーハンドリング
  - [ ] BCS-005: バージョニング戦略
  - [ ] BCS-006: ガスコスト最適化

Security:
  - [ ] SEC-001: 公開可変参照の回避
  - [ ] SEC-002: 未使用公開関数の削除
```

### A.2 VS Code設定テンプレート

```json
{
  "claude.linter.rules": {
    "move-style": {
      "enabled": true,
      "severity": {
        "M2024-*": "error",
        "NAME-*": "error",
        "MS-001": "warning",
        "MS-002": "warning",
        "MS-003": "info",
        "ENUM-*": "error",
        "ATTR-*": "warning",
        "STRUCT-*": "warning",
        "PERF-ANTI-*": "error",
        "PERF-*": "warning",
        "MACRO-*": "warning",
        "BCS-003": "error",
        "BCS-004": "error",
        "BCS-*": "warning",
        "SEC-*": "error"
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

## 使用例

### コマンドライン
```bash
# 全ルールチェック
claude "Review my Move code against LINT_MOVE.md"

# 特定レベルのみ
claude "Check ERROR level rules only"

# 特定カテゴリのみ
claude "Check Method Syntax rules"
```

**このガイドは Sui Move 2024.beta エディション対応の包括的なスタイルガイドです。**
