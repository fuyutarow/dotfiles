<!-- Consumer repository names and historical path components below are anonymized; example-* labels are not live source locators. -->

# agx の設定 — 層と契約

この文書は、agx が読む設定の置き場所、書き手、解決の規則を定める。親文書は
[agx-separation.md](agx-separation.md) (§5.2、§5.4) である。

## 1. 要件

agx の設定は、次の要件を満たす。

- **R1 方針は共有する。** リポジトリで agx をどう動かすか (ticket の置き場、作業ツリーの準備の命令、毎回かける検査) は、
  そのリポジトリの持ち主が決める。この値は review を通し、そのリポジトリを使うすべての機械で同じにする。
- **R2 機械の値は共有しない。** 絶対 path や、残しておく作業ツリーの一覧は、その機械だけの値である。この値は commit しない。
- **R3 リポジトリに何も置かずに使える。** 利用側リポジトリが、追跡されたファイルの中身や名前に agx の名前を置くことを
  禁じている場合がある (`.gitignore` の行も追跡されたファイルである)。この場合でも、R1 と R2 のすべての値を表せなければならない。
- **R4 一つの値に一つの宣言。** 同じ問いに答える宣言を二か所に置かない。trunk の定義は jj の `trunk()` だけとする。
- **R5 読み手と解決の規則は一つ。** 同じ設定を、命令ごとに別の revision や別の parser で読まない。
- **R6 書き手は一つ。** 一つのファイルの書き手は一人に限る。agx は利用者の設定ファイルを書き換えない。
- **R7 壊れる変更は黙って通らない。** 読み手は、知らない schema の版や、層を取り違えた値を推測で解釈せず、exit 2 で止める。

## 2. 層

| 層 | ファイル | 書き手 | 効く範囲 | 置き場 |
| --- | --- | --- | --- | --- |
| L1 リポジトリの方針 | `agx.toml` (任意) | リポジトリの持ち主 | そのリポジトリを使う全機械 | リポジトリの root。commit し、`trunk()` の revision から読む |
| L2 機械ごとの上書き | `~/.config/agx/repos/<名前>.toml` | その機械の操作者 | その機械の一つのリポジトリ | リポジトリの外。`root` で対象を指す |
| L3 利用者の方針 | `~/.config/agx/agx.toml` | 操作者 (dotfiles が宣言を配る) | その機械の全リポジトリ | 利用者の設定ディレクトリ |
| 目録 (設定ではない) | `packages/roster/catalog.toml` | agx の持ち主 | agx の版 | agx が出荷する |

- L1 は任意である。L1 のないリポジトリは、既定値と L2 だけで動く (R3)。
- 合成の順番は、既定値 → L1 → L2 である。key ごとに後のものが置き換え、配列は連結しない。
- L3 と目録は、リポジトリごとの設定ではない。どのリポジトリでも同じ経路の方針とモデルの一覧を使う。

## 3. 各層の契約

### 3.1 L1 リポジトリの方針 — `agx.toml`

```toml
schema = 1
tickets = ".agents/tickets"          # 相対 path。リポジトリの root から解く

[ws]
ready = ["mise trust -q", "bun install --frozen-lockfile"]

[verify]
always = ["mise run gate:changed"]   # どの ticket の verify の後にも実行する検査
```

`[verify].always` は、worker の成果が主線の gate で落ちるのを、返す前に防ぐための宣言である。lint や型検査の中身は
リポジトリの方針なので、agx は決め打ちで持たない。agx-worker は次のように扱う。

- ticket の `verify` を実行した後、同じ作業ツリーで `always` を順に実行し、`kind = "repo"` として ticket の分と区別して記録する。
- worker に渡す brief にも、返す前に通す検査として同じ命令を書く。後から実行するだけでは、落ちたときに差し戻しが要るからである。
- 失敗しても run の exit は変えない。既存の verify と同じく、記録された事実として受け入れの判断に使う。
- 宣言がなければ何も足さない。

契約:

- Consumer: agx-worker (check、run、dispatch、verify)、agx-ticket (new、ls、gc)、agx-ws (add の readiness)
- Authority / writer: そのリポジトリの持ち主。変更はそのリポジトリの review と commit を通る
- Effective configuration: main checkout の `trunk()` の revision にある `agx.toml` (`jj file show -r 'trunk()' agx.toml`)
- Source representation: TOML v1.0.0
- Trust regime: human-authored, gated-decision
- Signature / digest input: n/a
- Canonicalization profile: n/a
- Schema / version: `contract/agx-toml.schema.json` の schema 1 (agx リポジトリ)。読み手は一つの関数だけとする
- Duplicate-key policy: reject (TOML の parser が既定で拒む)。未知の key も reject する
- Number / Unicode policy: 数値の key はない。path は UTF-8 の文字列で、絶対 path は reject する (機械の値は L2 に書く)
- Precedence / merge: L1 は既定値を置き換え、L2 は key ごとに L1 を置き換える。配列は連結しない
- Decision record: none: そのリポジトリの commit の履歴と review が唯一の記録である
- Exception encoding: none: 機械ごとの例外は L2 の値として書き、L1 に例外の仕組みは持たない
- Verification command: 同じリポジトリで `agx worker check .agents/tickets/example.md --cd .` と `agx ws add --json example` が、同じ `tickets` と `ready` を報告する
- Positive case: `tickets` と `[ws].ready` を commit したリポジトリで、二つの命令が同じ値を報告する
- Negative case: 絶対 path の `tickets`、未知の key (たとえば `trunk`)、`schema` の欠落、旧名の `.agx.toml` は、exit 2 と直し方を示す 1 行で拒む

### 3.2 L2 機械ごとの上書き — `~/.config/agx/repos/<名前>.toml`

```toml
schema = 1
root = "/path/to/main-checkout"                  # 上書きの対象。main checkout の絶対 path
tickets = "/path/to/state/tickets"               # 絶対 path を許すのはこの層だけ

[ws]
ready = ["mise trust -q", "bun install --frozen-lockfile"]   # L1 がないリポジトリはここに書く
keep = ["/path/to/kept-workspace"]

[verify]
always = []
```

L2 をリポジトリの中に置かないのは R3 のためである。リポジトリの中に上書き用のファイルを置くと、それを無視させる
`.gitignore` の行が追跡されたファイルになる。置き場はリポジトリの外の 1 か所だけとし、同じ層の置き場を二つ作らない。

契約:

- Consumer: L1 と同じ読み手
- Authority / writer: その機械の操作者。リポジトリには何も置かない。dotfiles が宣言を配るかどうかは操作者が決める (`keep` のような機械の値は配らないのが既定)
- Effective configuration: `$XDG_CONFIG_HOME/agx/repos/*.toml` (未設定なら `~/.config/agx/repos/*.toml`) のうち、`root` が対象の main checkout の実 path に一致するもの 1 つ
- Source representation: TOML v1.0.0
- Trust regime: human-authored
- Signature / digest input: n/a
- Canonicalization profile: n/a
- Schema / version: `contract/repo-override.schema.json` の schema 1。許す key は `root` (必須)、`tickets`、`[ws].ready`、`[ws].keep`、`[verify].always`
- Duplicate-key policy: reject。未知の key も reject する。同じ `root` を名乗るファイルが二つあれば exit 2 で止める
- Number / Unicode policy: 数値の key はない。path は UTF-8 で、絶対 path を許す。`root` は実 path に解いて比べる
- Precedence / merge: 既定値 → L1 → L2 の順で、key ごとに後のものが置き換える。配列は連結しない。`keep` は L2 にだけ書ける
- Decision record: none: その機械の操作者が唯一の書き手で、gate の入力ではない
- Exception encoding: none: 上書きそのものが値であり、別の例外の仕組みはない
- Verification command: `agx ws gc --dry-run` と `agx ws add --json example` が、同じ `keep` と `ready` を報告する
- Positive case: L1 のないリポジトリで、L2 だけにある `ready`、`keep`、`tickets`、`verify.always` が、add、gc、rm、doctor、check、run のどれでも効く
- Negative case: L1 に書いた `keep`、`root` の欠落、同じ `root` の二つのファイルは exit 2 で拒む

### 3.3 L3 利用者の方針 — `~/.config/agx/agx.toml`

```toml
schema = 1

[route]
allow = ["codex"]
on_window_exhausted = { codex = "continue", claude = "stop" }
default = "luna-high"
exclude = []                    # 目録にあっても使わない行の id

[route.jev]
url = "https://api.typesafe.ai/v1/systemone"
model = "jev-latest"

[claude_run]
max_budget_usd = 2.0
max_turns = 60
```

L3 は、操作者が自分の契約と予算から決める値だけを持つ。モデルの一覧、点数、価格は持たない (それは目録の値である)。

契約:

- Consumer: agx-worker の router (route、continue、preflight、各 worker)、`agx worker roster --json` を読む dotfiles の render-home と hook
- Authority / writer: 操作者。宣言の正本は dotfiles に置き、`mise run link:dots` が配備先 1 か所に書く
- Effective configuration: `$AGX_CONFIG` が空でなければその path、なければ `$XDG_CONFIG_HOME/agx/agx.toml`、なければ `~/.config/agx/agx.toml`
- Source representation: TOML v1.0.0
- Trust regime: human-authored, gated-decision
- Signature / digest input: n/a
- Canonicalization profile: n/a
- Schema / version: `contract/user-config.schema.json` の schema 1 (agx リポジトリ)
- Duplicate-key policy: reject。未知の key も reject する
- Number / Unicode policy: 予算と時間は IEEE 754 binary64 で、負の値は reject する。`exclude` と `default` の id が目録にない値なら reject する
- Precedence / merge: 一つのファイルだけを読む。目録と合わせるとき、目録が行を与え、L3 が `allow` と `exclude` で絞り、`default` を選ぶ。L3 は目録の値を上書きできない
- Decision record: none: dotfiles の commit の履歴が、方針の変更の記録である
- Exception encoding: encoded: `on_window_exhausted` のように、経路ごとの例外を方針の値として宣言する
- Verification command: `agx worker roster --json` が exit 0 で、目録と方針を合わせた結果を出し、`agx worker check .agents/tickets/example.md` がその結果で経路を選べる
- Positive case: `exclude` に入れた行が `agx worker roster --json` の結果から消え、`default` の行が選ばれる
- Negative case: 目録にない `default`、未知の key、`schema` の欠落は exit 2。廃止した `DISPATCH_ROSTER_PATH` が設定されていたら、`AGX_CONFIG` を示して exit 2

### 3.4 目録 — `packages/roster/catalog.toml`

目録は、モデルの行 (`id`、`model`、`effort`)、benchmark の値、価格、`use_for`、出典を持つ。どれも vendor や評価機関の
公開値を写した事実で、利用者によって変わらない。したがって設定ではなく、agx が版を付けて出荷するデータとする。

契約:

- Consumer: agx-worker の router、`agx worker roster --json`、agx リポジトリのモデル監査
- Authority / writer: agx の持ち主。変更は agx リポジトリの review と commit を通る。利用者は編集しない
- Effective configuration: インストールされた agx の版に含まれる `packages/roster/catalog.toml`
- Source representation: TOML v1.0.0
- Trust regime: human-authored, gated-decision
- Signature / digest input: n/a
- Canonicalization profile: n/a
- Schema / version: `contract/roster-catalog.schema.json` の schema 1。行ごとに出典と `as_of` の日付を持つ
- Duplicate-key policy: reject。行の `id` が重複したら reject する
- Number / Unicode policy: 価格と benchmark の値は IEEE 754 binary64。欠けている値は欠けたままにし、推定しない
- Precedence / merge: 一つのファイルで、上書きの層を持たない。L3 は行を絞るだけで、値を変えない
- Decision record: none: agx リポジトリの commit の履歴と、各行の出典の URL と日付が記録である
- Exception encoding: none: 目録に例外はない。使わない行は L3 の `exclude` で外す
- Verification command: agx リポジトリの `mise run check` (schema の検査とモデル監査を含む)。dotfiles では `agx worker roster --json` が exit 0
- Positive case: 出典と日付のある行を足すと、`agx worker roster --json` にその行が現れる
- Negative case: 出典のない行、`id` の重複、未知の `route` は、agx リポジトリの `mise run check` で落ちる

### 3.5 層に入れないもの

- モデル系統の下限 (dotfiles の `agents/hooks/model-floor.toml`) は、shell の命令を検査する hook の方針で、agx の設定ではない。
  agx にとっての下限は「目録に載り、L3 で外されていない行だけを使える」で足りる。
- モデルの公開情報の監査に使うデータ (dotfiles の `agents/models/releases.toml`) は、目録と一緒に agx へ移す。

## 4. schema の版と壊れる変更

L1、L2、L3、目録は、どれも先頭に `schema = <整数>` を必須で持つ。

- **読み手は、自分の知っている版だけを受け付ける。** 新しすぎる版も古い版も、推測で読み替えずに exit 2 で止め、
  次の手を 1 行で示す (古い版なら `agx config migrate --from <版> <file>`、新しい版なら agx の更新)。
- **版を上げるのは、壊れる変更のときだけとする。** 既定値のある任意の key を足すのは壊れる変更ではない (版は変えず、agx の minor release)。
  key の意味を変える、key を消す、key を必須にする、のいずれかが壊れる変更で、版を 1 上げ、agx の major release にする。
- **移行は filter とする。** `agx config migrate` は新しい版の中身を stdout に出すだけで、ファイルを書き換えない (R6)。
  各ファイルの書き手が出力を確かめて置き換える。
- **版ごとの fixture を残す。** agx リポジトリの `tests/fixtures/config/v<版>/` に、出荷した版ごとの例を置く。
  test は「一つ前の版の例は exit 2 で拒まれ、message が migrate の命令を示す」と
  「migrate の出力が、いまの版として受け付けられ、同じ解決結果になる」を固定する。
- **利用側に届く経路は一つ。** 壊れる変更は、dotfiles が固定する agx の版を上げるときにだけ利用側に届く
  ([agx-separation.md](agx-separation.md) §5.3)。版を上げる issue は、利用側の持ち主への移行の依頼を含める。

## 5. 現状との差分

この節は、いま dotfiles の中にある agx の設定と、§1 の要件との食い違いを示す。

| ファイル | key | 読み手 (path:line) | 要件との食い違い |
| --- | --- | --- | --- |
| `.agx.toml` (利用側の root) | `tickets`、`workspace_exclude` | `tools/agx-worker/src/next/ticket-home.ts:51-86`、`tools/agx-ticket/src/tickets.ts:125-165` | R5: worker は base_rev の commit を、ticket は working copy (`tickets.ts:140`) を読む。R2: 絶対 path の `tickets` を commit している利用側がある |
| `.ws.toml` (利用側の root) | `ready`、`trunk`、`keep` | `tools/agx-ws/src/workspace.ts:69-75,134-174`、`tools/agx-ticket/src/tickets.ts:344` | R1/R2: 全機械で同じ `ready` と、機械の絶対 path の `keep` が同居する。R4: `trunk` が jj の `trunk()` と重なる。R3: 名前を出せない利用側では commit できない |
| `agents/models/dispatch-roster.toml` (dotfiles) | 目録と方針の両方 | `agents/models/roster.ts:11`、`tools/shared/src/dispatch-pricing.ts:67-68`、agx-worker の 8 か所 | R5: 読み手が二つある (loader と、価格だけを読む独自の parser)。R6: 目録 (公開値) と方針 (操作者の値) で書き手が二人になる |

## 6. 移行

| 段 | 内容 | 依存 | 検証 |
| --- | --- | --- | --- |
| E1 | 一つの reader を `tools/shared` に作り (S5 で agx の core に移す)、L1 (`agx.toml`、`trunk()` から) と L2 (`~/.config/agx/repos/*.toml`) を解く。agx-worker と agx-ticket の ticket home をこれに置き換える。旧名の `.agx.toml` は exit 2 | なし | `bun test tools/shared/tests/agx-config.test.ts tools/agx-worker/tests/next/ticket-home.test.ts tools/agx-ticket/tests/lifecycle.test.ts` |
| E2 | `.ws.toml` を廃止する。`ready` は L1 の `[ws]`、`keep` は L2 から読む。`.ws.toml` があれば exit 2 で移し方を示す。trunk は `trunk()` を読む | E1 | `bun test tools/agx-ws/tests/workspace.test.ts tools/agx-ws/tests/doctor.test.ts` |
| E3 | 読み手のない `workspace_exclude` の reader を消す | なし | `rr text 'workspace_exclude'` が spec の外で NO_MATCH |
| E4 | codex の worker が model-floor を読むのをやめる | なし | `bun test tools/agx-worker/tests/codex.test.ts` |
| E5 | 利用側の移行。`.agx.toml` を持つリポジトリは、E1 の着地の直後に削除して commit する。機械の値 (絶対 path、`keep`) は L2 に移す。名前を出せないリポジトリは、L1 を置かず全部を L2 に書く。順番は、L2 の用意 → E1 の着地 → 間を空けずに旧ファイルの削除とする (逆の順番では、旧い agx が黙って既定の ticket home を使う) | E1、E2 | 各リポジトリで `agx worker check` と `agx ws gc --dry-run` |
| E6 | roster を目録と L3 に分ける。目録は agx が出荷し (S5 までは `tools/agx-worker` の中)、L3 は dotfiles の宣言から `~/.config/agx/agx.toml` に配備する。`DISPATCH_ROSTER_PATH` と価格だけを読む独自の parser を消す。モデル監査は目録と一緒に agx へ移す | roster の consumer の CLI への切り替え | `bun test tools/agx-worker/tests/public.test.ts tools/agx-worker/tests/selection.test.ts` と `mise run lint:config-map` |
| E7 | `[verify].always` を実装する。dotfiles の L1 に `always = ["mise run gate:changed"]` を宣言する | E1、`mise run gate:changed` の task | `bun test tools/agx-worker/tests/next/run.test.ts` と、宣言したリポジトリでの `agx worker run` の記録 |

E1、E3、E4 は互いに独立していて、並べて出せる。E2 と E7 は E1 の後に出す。E5 は利用側の持ち主の作業である。
