# Sui Move Linter スタイルガイド v2.0

## 概要
- **対象バージョン**: Sui Move 2024.beta
- **用途**: コードレビュー、自動チェック、品質保証
- **重要度レベル**: ERROR（必須） | WARNING（推奨） | INFO（提案）

---

## Part I: 基礎編 - Move 2024エディション必須要件

### 1.1 コンパイル要件 [ERROR]

#### M2024-001: 構造体のpublic宣言
**なぜ重要**: Move 2024では全ての構造体に明示的な可視性宣言が必要。これにより意図しない公開を防ぎ、モジュール境界を明確にする。

- **パターン**: `^struct\s+(\w+)`
- **正しい形**: `public struct $1`
- **自動修正**: 可能

```move
// ❌ 違反 - コンパイルエラーになる
struct Counter has key {
    id: UID,
    value: u64,
}

// ✅ 正しい - Move 2024では必須
public struct Counter has key {
    id: UID,
    value: u64,
}
```

#### M2024-002: 変数のmutability宣言
**なぜ重要**: 明示的な可変性宣言により、意図しない変更を防ぎ、コードの意図を明確にする。

- **パターン**: 再代入される変数の`mut`不足
- **自動修正**: 可能

```move
// ❌ 違反 - 再代入でコンパイルエラー
public fun increment_counter(counter: &mut Counter) {
    let value = counter.value;  // immutable
    value = value + 1;          // エラー
    counter.value = value;
}

// ✅ 正しい - mutで明示
public fun increment_counter(counter: &mut Counter) {
    let mut value = counter.value;  // mutable
    value = value + 1;              // OK
    counter.value = value;
}
```

#### M2024-003: モジュール宣言形式
**なぜ重要**: セミコロン形式により、モジュール内容とモジュール宣言を明確に分離する。

- **パターン**: `^module\s+([\w:]+)\s*\{`
- **正しい形**: `module $1;`

```move
// ❌ 違反 - 古い形式
module counter_app::counter {
    // content
}

// ✅ 正しい - Move 2024形式
module counter_app::counter;

// content here
```

#### M2024-004: 予約語の使用禁止
**なぜ重要**: 将来の言語拡張で追加される可能性のあるキーワードを避け、コードの将来互換性を保つ。

```move
// ❌ 違反 - 予約語を変数名に使用
let enum = 5;
let match = true;
let type = "string";

// ✅ 正しい - 明確な代替名
let enum_type = 5;
let match_result = true;
let value_type = "string";
```

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
```toml
# ❌ 違反
name = "counter_app"
name = "counterapp"

# ✅ 正しい
name = "CounterApp"
```

#### NAME-002: エラー定数の命名とattribute
**なぜ重要**: 統一的なエラー処理により、デバッグとエラー追跡が容易になる。

```move
// ❌ 違反 - 命名規則違反
const ERROR_INVALID: u64 = 0;
const EinvalidInput: u64 = 1;

// ❌ 違反 - vector<u8>に#[error]属性なし
const EInvalidInput: vector<u8> = b"Invalid input";

// ✅ 正しい - u64エラーコード
const EInvalidInput: u64 = 0;
const ENotAuthorized: u64 = 1;

// ✅ 正しい - カスタムエラーメッセージ
#[error]
const EInvalidInput: vector<u8> = b"Invalid input provided";

#[error]
const EInsufficientBalance: vector<u8> = b"Account balance too low";
```

#### NAME-003: 通常定数はUPPER_SNAKE_CASE
```move
// ❌ 違反
const maxValue: u64 = 1000;
const Max_Value: u64 = 1000;

// ✅ 正しい
const MAX_VALUE: u64 = 1000;
const DEFAULT_TIMEOUT: u64 = 30;
```

### 2.2 関数命名パターン [ERROR/WARNING]

#### NAME-004: 関数名はsnake_case
```move
// ❌ 違反
public fun CreateCounter() {}
public fun getBalance() {}

// ✅ 正しい
public fun create_counter() {}
public fun balance() {}
```

#### NAME-005: Getter関数のプレフィックス禁止
**なぜ重要**: Move 2024では関数名の簡潔性を重視し、冗長な`get_`プレフィックスを避ける。

```move
public struct Account has key {
    id: UID,
    balance: u64,
    owner: address,
}

// ❌ 違反 - get_プレフィックス
public fun get_balance(self: &Account): u64 { self.balance }
public fun get_owner(self: &Account): address { self.owner }

// ✅ 正しい - 直接的な名前
public fun balance(self: &Account): u64 { self.balance }
public fun owner(self: &Account): address { self.owner }
```

#### NAME-006: Self型パラメータの命名 [ERROR]
**なぜ重要**: 統一された`self`により、メソッド呼び出しの意図が明確になり、コードの可読性が向上する。Method Syntaxを使用するための**必須要件**。

**【重要】第一引数が構造体への参照（&T または &mut T）の場合、必ず`self`という名前にする。**

この規則は以下に適用される：
- **適用対象**: `&Counter`, `&mut Counter`, `&Account`, `&mut Order` など、自身の構造体への参照
- **適用除外**: `&TxContext`, `&Clock`, `&mut Coin<SUI>` など、他の型や標準ライブラリ型

```move
// ❌ 違反 - 第一引数が構造体の参照だがselfでない
public fun get_id(counter: &Counter): &UID { &counter.id }
public fun increment(c: &mut Counter) { c.value = c.value + 1 }
public fun balance(acc: &Account): u64 { acc.balance }
public fun process(order: &mut Order) { /* ... */ }

// ✅ 正しい - 第一引数はself
public fun id(self: &Counter): &UID { &self.id }
public fun increment(self: &mut Counter) { self.value = self.value + 1 }
public fun balance(self: &Account): u64 { self.balance }
public fun process(self: &mut Order) { /* ... */ }

// ✅ 正しい使用例（Method Syntax）
let mut counter = Counter::new(0, ctx);
counter.increment();              // self: &mut Counter
let uid = counter.id();           // self: &Counter
assert!(counter.value() == 1, 0);

// ✅ 例外 - 第一引数が他の型の場合はselfを使わない
public fun create_with_coin(
    coin: &mut Coin<SUI>,        // 他の型 → coinのまま
    amount: u64,
    ctx: &mut TxContext          // 標準ライブラリ型 → ctxのまま
): Counter {
    let payment = coin.split(amount);
    // ...
}
```

**チェックポイント**:
1. 第一引数の型が`&YourStruct`または`&mut YourStruct`か？ → はい → `self`必須
2. 第一引数の型が`&TxContext`や`&Clock`などの外部型か？ → はい → `self`不要
3. 関数がコンストラクタ（`new`など）で構造体を返すだけか？ → はい → `self`不要

#### NAME-007: コンストラクタの命名パターン
**なぜ重要**: 一貫した命名により、オブジェクトのライフサイクル管理が明確になる。

```move
// ✅ オブジェクトを返すだけ → new()
public fun new(initial_value: u64, ctx: &mut TxContext): Counter {
    Counter {
        id: object::new(ctx),
        value: initial_value,
    }
}

// ✅ オブジェクトを作成してtransfer → create_*()
public fun create_and_share(initial_value: u64, ctx: &mut TxContext) {
    let counter = new(initial_value, ctx);
    transfer::share_object(counter);
}

// ✅ 所有権を移転 → create_*()
public fun create_for_user(initial_value: u64, recipient: address, ctx: &mut TxContext) {
    let counter = new(initial_value, ctx);
    transfer::transfer(counter, recipient);
}
```

---

## Part III: 高度な型機能

### 3.1 Enum定義とパターンマッチング

#### 3.1.1 Enum基本構造 [ERROR]

**ENUM-001: enum定義の基本ルール**
```move
// 3つのバリアント形式を組み合わせ可能
public enum OrderStatus {
    // ユニット（値なし）
    Pending,

    // タプル（位置引数）
    Processing(u64 /* start_time */),

    // 名前付きフィールド（構造体風）
    Completed {
        amount: u64,
        timestamp: u64,
        transaction_id: vector<u8>
    },

    Cancelled {
        reason: vector<u8>,
        refund_amount: u64
    },
}
```

**ENUM-003: バリアント命名はPascalCase**
```move
// ❌ 違反
public enum PaymentState {
    pending,
    PROCESSING,
    complete_success,
}

// ✅ 正しい
public enum PaymentState {
    Pending,
    Processing,
    CompleteSuccess,
}
```

#### 3.1.2 Match式の完全性 [ERROR]

**ENUM-002: 全バリアントの網羅必須**
**なぜ重要**: コンパイル時に処理漏れを検出し、新しいバリアント追加時の回帰を防ぐ。

```move
// 実用的な状態処理関数の例
public fun process_order_status(status: &OrderStatus): u8 {
    match status {
        OrderStatus::Pending => {
            // ペンディング状態の処理
            0
        },
        OrderStatus::Processing(start_time) => {
            // 処理中の時間チェック
            if (*start_time + 3600 < tx_context::epoch_timestamp_ms()) {
                2 // タイムアウト
            } else {
                1 // 処理中
            }
        },
        OrderStatus::Completed { amount, timestamp, transaction_id } => {
            // 完了処理のログ記録
            event::emit(OrderCompleted {
                amount: *amount,
                timestamp: *timestamp,
                tx_id: transaction_id.clone(),
            });
            3
        },
        OrderStatus::Cancelled { reason, refund_amount } => {
            // キャンセル処理
            if (*refund_amount > 0) {
                process_refund(*refund_amount);
            }
            4
        },
    }
}
```

#### 3.1.3 バージョニング戦略 [WARNING]

**ENUM-004: 既存enumの拡張は新バージョンで**
**なぜ重要**: 既存のコードが新しいバリアントを処理できないため、後方互換性を保つ必要がある。

```move
// V1: 初期バージョン
public enum OrderStatusV1 {
    Pending,
    Completed { amount: u64 },
    Cancelled,
}

// V2: 新機能追加版
public enum OrderStatusV2 {
    Pending,
    Processing(u64), // 新バリアント
    Completed { amount: u64, timestamp: u64 }, // フィールド追加
    Cancelled { reason: vector<u8> }, // フィールド追加
    Refunded { original_amount: u64, refund_amount: u64 }, // 新バリアント
}

// 安全な移行関数
public fun migrate_status_v1_to_v2(old_status: OrderStatusV1): OrderStatusV2 {
    match old_status {
        OrderStatusV1::Pending => OrderStatusV2::Pending,
        OrderStatusV1::Completed { amount } =>
            OrderStatusV2::Completed {
                amount,
                timestamp: tx_context::epoch_timestamp_ms()
            },
        OrderStatusV1::Cancelled =>
            OrderStatusV2::Cancelled {
                reason: b"Legacy cancellation"
            },
    }
}
```

### 3.2 パターンマッチングの最良実践 [WARNING/INFO]

#### MATCH-001: ワイルドカード使用の制限
**なぜ重要**: 明示的なパターンマッチにより、新しいバリアント追加時の処理漏れを防ぐ。

```move
// ⚠️ 問題あり - 将来のバリアント追加で見逃しリスク
public fun is_final_state(status: &OrderStatus): bool {
    match status {
        OrderStatus::Completed { .. } => true,
        _ => false, // 新しいバリアントが追加されても気づかない
    }
}

// ✅ 推奨 - 明示的なマッチング
public fun is_final_state(status: &OrderStatus): bool {
    match status {
        OrderStatus::Pending => false,
        OrderStatus::Processing(_) => false,
        OrderStatus::Completed { .. } => true,
        OrderStatus::Cancelled { .. } => true,
    }
}
```

#### MATCH-002: 複雑なガード条件の分離
```move
// 💡 改善提案 - 複雑なガード条件
public fun can_process_order(order: &Order, ctx: &TxContext): bool {
    match order.status {
        OrderStatus::Pending if validate_user(ctx.sender())
                              && check_inventory(order.item_id)
                              && verify_payment(order.payment_method) => true,
        _ => false,
    }
}

// ✅ 推奨 - 条件を関数に分離
fun is_order_processable(order: &Order, sender: address): bool {
    validate_user(sender) &&
    check_inventory(order.item_id) &&
    verify_payment(order.payment_method)
}

public fun can_process_order(order: &Order, ctx: &TxContext): bool {
    match order.status {
        OrderStatus::Pending if is_order_processable(order, ctx.sender()) => true,
        _ => false,
    }
}
```

### 3.3 属性（Attributes）システム

#### 3.3.1 テスト関連属性 [ERROR/WARNING]

**ATTR-001: テスト関数には#[test]属性必須**
```move
// ❌ 違反 - test_で始まるがattributeなし
fun test_counter_creation() {
    // テストコード
}

// ✅ 正しい - #[test]属性付き
#[test]
fun test_counter_creation() {
    let mut scenario = test_scenario::begin(@0xA);
    let counter = counter::new(0, scenario.ctx());
    assert!(counter.value() == 0, 0);
    scenario.end();
}
```

**ATTR-002: テスト専用関数には#[test_only]**
```move
// テスト用ヘルパー関数の例
#[test_only]
public fun create_test_scenario(sender: address): test_scenario::Scenario {
    test_scenario::begin(sender)
}

#[test_only]
public fun mint_test_coin(amount: u64, ctx: &mut TxContext): Coin<SUI> {
    coin::mint_for_testing<SUI>(amount, ctx)
}
```

**ATTR-003: 失敗テストには#[expected_failure]**
```move
#[test]
#[expected_failure(abort_code = ENotAuthorized)]
fun test_unauthorized_increment() {
    let mut scenario = test_scenario::begin(@0xA);
    let mut counter = counter::new(0, scenario.ctx());

    // 権限のないユーザーでインクリメント試行
    scenario.next_tx(@0xB); // 異なるユーザー
    counter.increment_authorized(scenario.ctx()); // should abort

    scenario.end();
}
```

#### 3.3.2 エラー定義属性 [ERROR]

**ATTR-004: vector<u8>エラー定数には#[error]必須**
```move
// ❌ 違反 - #[error]属性なし
const EInvalidAmount: vector<u8> = b"Amount must be positive";

// ✅ 正しい - #[error]属性付き
#[error]
const EInvalidAmount: vector<u8> = b"Amount must be positive";

#[error]
const EInsufficientPermissions: vector<u8> = b"Sender lacks required permissions";

// 使用例
public fun increment_by(self: &mut Counter, amount: u64, ctx: &TxContext) {
    assert!(amount > 0, EInvalidAmount);
    assert!(self.owner == ctx.sender(), EInsufficientPermissions);
    self.value = self.value + amount;
}
```

**ATTR-005: エラーコードの明示的な指定 [WARNING]**
**なぜ重要**: 明示的なエラーコード指定により、GraphQL APIでのエラー追跡が容易になり、エラー番号の安定性が保たれる。コード番号の衝突を防ぎ、後方互換性のあるエラー管理が可能になる。

```move
// ⚠️ 改善の余地 - コード番号なし（自動採番されるが管理が困難）
#[error]
const EInvalidInput: vector<u8> = b"Invalid input";

#[error]
const EInsufficientBalance: vector<u8> = b"Account balance too low";

// ✅ 推奨 - 明示的なコード番号で管理
#[error(code = 1)]
const EInvalidInput: vector<u8> = b"Invalid input provided";

#[error(code = 2)]
const EInsufficientBalance: vector<u8> = b"Account balance too low";

#[error(code = 3)]
const ENotAuthorized: vector<u8> = b"Sender lacks required permissions";

#[error(code = 4)]
const EInvalidState: vector<u8> = b"Operation not allowed in current state";
```

**エラーコード管理のベストプラクティス**:
- **連番管理**: モジュール内でエラーコードは1から始まる連番で管理（コード0は予約済み）
- **追加のみ**: 新しいエラーは末尾に追加し、既存コードの番号変更は避ける
- **ドキュメント化**: 削除されたエラーコードはコメントで記録し、番号の再利用を避ける
- **範囲分割**: 大規模モジュールでは機能ごとに範囲を分ける（例: 1-99: 入力検証, 100-199: 権限チェック）

```move
// 実践的な例: 範囲分割による管理
// === Input Validation Errors (1-99) ===
#[error(code = 1)]
const EInvalidAmount: vector<u8> = b"Amount must be positive";

#[error(code = 2)]
const EAmountTooLarge: vector<u8> = b"Amount exceeds maximum allowed";

// === Authorization Errors (100-199) ===
#[error(code = 100)]
const ENotOwner: vector<u8> = b"Caller is not the owner";

#[error(code = 101)]
const EInsufficientPermissions: vector<u8> = b"Caller lacks required permissions";

// === State Errors (200-299) ===
#[error(code = 200)]
const EInvalidState: vector<u8> = b"Operation not allowed in current state";

#[error(code = 201)]
const EAlreadyInitialized: vector<u8> = b"Object already initialized";
```

---

## Part IV: コード構造と品質

### 4.1 ファイル構造 [WARNING]

#### STRUCT-001: セクションコメントによる構造化
```move
module counter_app::advanced_counter;

// === Imports ===
use sui::object::{Self, UID};
use sui::tx_context::{Self, TxContext};
use sui::transfer;
use sui::event;

// === Constants ===
const MAX_INCREMENT: u64 = 1000;

#[error]
const EIncrementTooLarge: vector<u8> = b"Increment exceeds maximum allowed";

// === Structs ===
public struct Counter has key {
    id: UID,
    value: u64,
    owner: address,
}

// === Events ===
public struct Incremented has copy, drop {
    counter_id: address,
    old_value: u64,
    new_value: u64,
}

// === Public Functions ===
public fun new(initial_value: u64, ctx: &mut TxContext): Counter {
    Counter {
        id: object::new(ctx),
        value: initial_value,
        owner: ctx.sender(),
    }
}

// === Package Functions ===
public(package) fun internal_reset(self: &mut Counter) {
    self.value = 0;
}

// === Private Functions ===
fun validate_increment(amount: u64): bool {
    amount <= MAX_INCREMENT
}

// === Test Functions ===
#[test_only]
use sui::test_scenario;

#[test]
fun test_counter_creation() {
    // テストコード
}
```

#### STRUCT-002: 関数の順序
1. entry functions
2. public functions
3. public(package) functions
4. private functions
5. test functions

#### STRUCT-003: Ability順序の統一
```move
// ❌ 違反 - 順序が不統一
public struct Counter has store, key, drop {}
public struct Event has drop, copy {}

// ✅ 正しい - key, copy, drop, store順
public struct Counter has key, drop, store {}
public struct Event has copy, drop {}
```

### 4.2 Method Syntax徹底使用 [WARNING]

#### BEST-001: Method Syntax必須化
**なぜ重要**: Move 2024のMethod Syntaxにより、コードの可読性が大幅に向上し、チェーンメソッド呼び出しが可能になる。一貫性のあるコードベースの維持に必須。

**適用対象**: 第一引数が`&T`または`&mut T`の関数は必ずMethod Syntaxで記述する。

```move
// ❌ 違反 - 従来の関数呼び出し（冗長）
vector::push_back(&mut items, new_item);
vector::pop_back(&mut items);
option::is_some(&maybe_value);
coin::value(&payment_coin);
object::id(&counter);
string::length(&text);

// ✅ 正しい - Method Syntax（簡潔で読みやすい）
items.push_back(new_item);
items.pop_back();
maybe_value.is_some();
payment_coin.value();
counter.id();
text.length();

// ✅ チェーンメソッド呼び出しの活用
let result = items
    .get(index)
    .map(|item| item.process())
    .unwrap_or_default();
```

#### BEST-002: Method Syntax適用パターン

**標準ライブラリでの適用例**:
```move
// Vector操作
vector::length(&v) → v.length()
vector::is_empty(&v) → v.is_empty()
vector::push_back(&mut v, item) → v.push_back(item)
vector::pop_back(&mut v) → v.pop_back()
vector::borrow(&v, i) → v.borrow(i)
vector::borrow_mut(&mut v, i) → v.borrow_mut(i)

// Option操作
option::is_some(&opt) → opt.is_some()
option::is_none(&opt) → opt.is_none()
option::contains(&opt, &value) → opt.contains(&value)
option::borrow(&opt) → opt.borrow()
option::borrow_mut(&mut opt) → opt.borrow_mut()

// String操作
string::length(&s) → s.length()
string::is_empty(&s) → s.is_empty()
string::bytes(&s) → s.bytes()

// Coin操作
coin::value(&c) → c.value()
coin::split(&mut c, amount) → c.split(amount)
coin::join(&mut c1, c2) → c1.join(c2)

// Object操作
object::id(&obj) → obj.id()
object::id_address(&obj) → obj.id_address()
```

**カスタム構造体での実装例**:
```move
public struct Counter has key {
    id: UID,
    value: u64,
    owner: address,
}

// ✅ Method Syntaxに対応した設計
impl Counter {
    // Getter methods
    public fun value(self: &Counter): u64 { self.value }
    public fun owner(self: &Counter): address { self.owner }
    public fun id(self: &Counter): &UID { &self.id }

    // Mutating methods
    public fun increment(self: &mut Counter) {
        self.value = self.value + 1
    }

    public fun increment_by(self: &mut Counter, amount: u64) {
        self.value = self.value + amount
    }
}

// 使用例
let mut counter = Counter::new(0, ctx);
counter.increment();                    // Method Syntax
assert!(counter.value() == 1, 0);      // Method Syntax
counter.increment_by(5);                // Method Syntax
assert!(counter.owner() == @0xA, 1);   // Method Syntax
```

#### BEST-003: Method Syntax例外規定
**例外: module::function形式が必要な場合**
```move
// ✅ 例外 - 静的関数（第一引数が&selfでない）
let counter = Counter::new(0, ctx);      // コンストラクタ
let coin = coin::zero<SUI>();           // ゼロ値作成
let option = option::none<u64>();       // None値作成

// ✅ 例外 - 型推論が困難な場合
bcs::to_bytes(&data)                    // 型パラメータが必要
debug::print(&value)                    // デバッグ関数

// ✅ 例外 - モジュール境界を明確にしたい場合
transfer::public_transfer(object, recipient);  // 転送操作の明確化
event::emit(MyEvent { ... });                  // イベント発行の明確化
```

#### BEST-004: public(package)使用
```move
// ⚠️ 非推奨 - friendは廃止予定
friend counter_app::admin;
public(friend) fun privileged_function() {}

// ✅ 推奨 - public(package)
public(package) fun privileged_function() {}
```

---

## Part V: セキュリティ

### 5.1 公開APIの設計 [ERROR]

#### SEC-001: 可変参照の公開制限
**なぜ重要**: 可変参照の公開は意図しない状態変更を許し、オブジェクトの整合性を破る可能性がある。

```move
// ❌ 危険 - 可変参照を直接公開
public fun borrow_mut_value(self: &mut Counter): &mut u64 {
    &mut self.value // 外部から直接変更可能
}

// ✅ 安全 - 制御された変更のみ許可
public fun increment(self: &mut Counter) {
    self.value = self.value + 1;
}

public fun increment_by(self: &mut Counter, amount: u64) {
    assert!(amount <= MAX_INCREMENT, EIncrementTooLarge);
    self.value = self.value + amount;
}

// パッケージ内でのみ可変参照許可（必要な場合）
public(package) fun borrow_mut_value_internal(self: &mut Counter): &mut u64 {
    &mut self.value
}
```

#### SEC-002: 未使用公開関数の削除
```move
// ❌ 問題 - 未使用でも公開されている
public fun unused_dangerous_function(self: &mut Counter) {
    self.value = 0; // 使われていないが攻撃面を拡大
}

// ✅ 対策 - 不要な公開関数は削除
// または必要に応じてprivateに変更
fun internal_reset(self: &mut Counter) {
    self.value = 0;
}
```

---

## 付録A: クイックリファレンス

### A.1 チェックリスト

```yaml
Move2024Compliance:
  - [ ] M2024-001: 全ての構造体にpublicキーワード
  - [ ] M2024-002: 再代入変数にmutキーワード
  - [ ] M2024-003: モジュール宣言でセミコロン
  - [ ] M2024-004: 予約語の変数名使用禁止

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
  - [ ] ATTR-005: エラーコードの明示的な指定（code = N）

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
        "ENUM-*": "error",
        "ATTR-001": "error",    // #[test]属性
        "ATTR-002": "warning",  // #[test_only]属性
        "ATTR-003": "warning",  // #[expected_failure]属性
        "ATTR-004": "error",    // #[error]属性必須
        "ATTR-005": "warning",  // エラーコード明示
        "STRUCT-*": "warning",
        "MATCH-*": "warning",
        "BEST-001": "warning",  // Method Syntax徹底
        "BEST-002": "warning",  // Method Syntax適用パターン
        "BEST-003": "info",     // カスタム構造体設計
        "BEST-004": "info",     // public(package)使用
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

## 付録B: 実践的コード例

### B.1 完全なEnumステートマシン実装

```move
module marketplace::order_system;

use sui::object::{Self, UID};
use sui::tx_context::{Self, TxContext};
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::transfer;
use sui::event;
use sui::clock::{Self, Clock};

// === Constants ===
const ORDER_TIMEOUT_MS: u64 = 3600000; // 1 hour

// === Errors ===
#[error]
const EInvalidTransition: vector<u8> = b"Invalid state transition";

#[error]
const EOrderTimeout: vector<u8> = b"Order has timed out";

#[error]
const EInsufficientPayment: vector<u8> = b"Payment amount insufficient";

// === Structs ===
public enum OrderStatus {
    Created {
        timestamp: u64,
        timeout_ms: u64
    },
    PaymentPending {
        required_amount: u64,
        created_at: u64
    },
    Confirmed {
        payment_amount: u64,
        confirmed_at: u64
    },
    Shipped {
        tracking_number: vector<u8>,
        shipped_at: u64
    },
    Delivered {
        delivered_at: u64,
        signature: vector<u8>
    },
    Cancelled {
        reason: vector<u8>,
        cancelled_at: u64
    },
}

public struct Order has key {
    id: UID,
    buyer: address,
    seller: address,
    item_id: vector<u8>,
    status: OrderStatus,
}

// === Events ===
public struct OrderStatusChanged has copy, drop {
    order_id: address,
    from_status: u8,
    to_status: u8,
    timestamp: u64,
}

// === Public Functions ===
public fun create_order(
    buyer: address,
    seller: address,
    item_id: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext
): Order {
    let timestamp = clock::timestamp_ms(clock);
    Order {
        id: object::new(ctx),
        buyer,
        seller,
        item_id,
        status: OrderStatus::Created {
            timestamp,
            timeout_ms: ORDER_TIMEOUT_MS
        },
    }
}

public fun request_payment(
    self: &mut Order,
    amount: u64,
    clock: &Clock
) {
    let current_time = clock::timestamp_ms(clock);

    match self.status {
        OrderStatus::Created { timestamp, timeout_ms } => {
            assert!(current_time < timestamp + timeout_ms, EOrderTimeout);

            let old_status = status_code(&self.status);
            self.status = OrderStatus::PaymentPending {
                required_amount: amount,
                created_at: current_time,
            };
            let new_status = status_code(&self.status);

            event::emit(OrderStatusChanged {
                order_id: object::id_address(&self.id),
                from_status: old_status,
                to_status: new_status,
                timestamp: current_time,
            });
        },
        _ => abort(EInvalidTransition),
    }
}

public fun confirm_payment(
    self: &mut Order,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext
) {
    let current_time = clock::timestamp_ms(clock);
    let payment_amount = payment.value();

    match self.status {
        OrderStatus::PaymentPending { required_amount, created_at } => {
            assert!(payment_amount >= required_amount, EInsufficientPayment);

            // Transfer payment to seller
            transfer::public_transfer(payment, self.seller);

            let old_status = status_code(&self.status);
            self.status = OrderStatus::Confirmed {
                payment_amount,
                confirmed_at: current_time,
            };
            let new_status = status_code(&self.status);

            event::emit(OrderStatusChanged {
                order_id: object::id_address(&self.id),
                from_status: old_status,
                to_status: new_status,
                timestamp: current_time,
            });
        },
        _ => {
            // Return payment if invalid state
            transfer::public_transfer(payment, ctx.sender());
            abort(EInvalidTransition);
        },
    }
}

// === Private Functions ===
fun status_code(status: &OrderStatus): u8 {
    match status {
        OrderStatus::Created { .. } => 0,
        OrderStatus::PaymentPending { .. } => 1,
        OrderStatus::Confirmed { .. } => 2,
        OrderStatus::Shipped { .. } => 3,
        OrderStatus::Delivered { .. } => 4,
        OrderStatus::Cancelled { .. } => 5,
    }
}

// === View Functions ===
public fun is_active(self: &Order): bool {
    match self.status {
        OrderStatus::Cancelled { .. } => false,
        OrderStatus::Delivered { .. } => false,
        _ => true,
    }
}

public fun get_status_info(self: &Order): (u8, bool) {
    (status_code(&self.status), is_active(self))
}

// === Test Functions ===
#[test_only]
use sui::test_scenario::{Self, Scenario};
#[test_only]
use sui::coin;

#[test_only]
public fun create_test_order(
    buyer: address,
    seller: address,
    scenario: &mut Scenario
): Order {
    let clock = clock::create_for_testing(scenario.ctx());
    let order = create_order(buyer, seller, b"item123", &clock, scenario.ctx());
    clock::destroy_for_testing(clock);
    order
}

#[test]
fun test_order_lifecycle() {
    let buyer = @0xA;
    let seller = @0xB;
    let mut scenario = test_scenario::begin(buyer);

    // Create order
    let mut order = create_test_order(buyer, seller, &mut scenario);
    assert!(is_active(&order), 0);

    // Request payment
    let clock = clock::create_for_testing(scenario.ctx());
    request_payment(&mut order, 1000, &clock);

    // Confirm payment
    let payment = coin::mint_for_testing<SUI>(1000, scenario.ctx());
    confirm_payment(&mut order, payment, &clock, scenario.ctx());

    let (status, active) = get_status_info(&order);
    assert!(status == 2, 1); // Confirmed
    assert!(active, 2);

    // Cleanup
    transfer::transfer(order, buyer);
    clock::destroy_for_testing(clock);
    scenario.end();
}
```

### B.2 テスト駆動開発の例

```move
#[test_only]
module counter_app::counter_tests;

use counter_app::counter::{Self, Counter};
use sui::test_scenario::{Self, Scenario};

// テストヘルパー関数
#[test_only]
fun setup_test_scenario(user: address): Scenario {
    test_scenario::begin(user)
}

#[test_only]
fun create_counter_for_test(value: u64, scenario: &mut Scenario): Counter {
    counter::new(value, scenario.ctx())
}

// 正常系テスト
#[test]
fun test_counter_creation() {
    let user = @0xA;
    let mut scenario = setup_test_scenario(user);

    let counter = create_counter_for_test(42, &mut scenario);
    assert!(counter.value() == 42, 0);
    assert!(counter.owner() == user, 1);

    transfer::transfer(counter, user);
    scenario.end();
}

#[test]
fun test_counter_increment() {
    let user = @0xA;
    let mut scenario = setup_test_scenario(user);

    let mut counter = create_counter_for_test(0, &mut scenario);
    counter.increment();
    assert!(counter.value() == 1, 0);

    counter.increment_by(5);
    assert!(counter.value() == 6, 1);

    transfer::transfer(counter, user);
    scenario.end();
}

// 異常系テスト
#[test]
#[expected_failure(abort_code = counter::EIncrementTooLarge)]
fun test_increment_too_large() {
    let user = @0xA;
    let mut scenario = setup_test_scenario(user);

    let mut counter = create_counter_for_test(0, &mut scenario);
    counter.increment_by(2000); // MAX_INCREMENT = 1000を超過

    transfer::transfer(counter, user);
    scenario.end();
}

#[test]
#[expected_failure(abort_code = counter::ENotAuthorized)]
fun test_unauthorized_increment() {
    let owner = @0xA;
    let attacker = @0xB;
    let mut scenario = setup_test_scenario(owner);

    let mut counter = create_counter_for_test(0, &mut scenario);

    // 異なるユーザーでインクリメント試行
    scenario.next_tx(attacker);
    counter.increment_authorized(scenario.ctx()); // should fail

    transfer::transfer(counter, owner);
    scenario.end();
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
```

**このガイドは Sui Move 2024.beta エディション対応の包括的なスタイルガイドです。**