# agx の設定ファイルをどう分けるか — 設定契約 (2026-10-23)

親文書: [agx-separation.md](agx-separation.md) §5.2、§5.4、§9 R1。この文書は、agx の設定の置き場所を決める。
実装はまだしない。

## 0. 結論

いま agx が読む設定ファイルは、少なくとも 4 種類ある。分け方の軸は tool 名で、読み手と書き手と効く範囲ではない。
そのために、同じ種類の値が二か所に分かれる一方で、性質の違う値が一つのファイルに混ざっている。

次の **3 層** に組み替える。軸は C1 (読み手) と C3 (書き手と効く範囲) である。

| 層 | ファイル | 書き手 | 効く範囲 | commit するか |
| --- | --- | --- | --- | --- |
| L1 リポジトリの方針 | `<repo>/.agx.toml` | そのリポジトリの持ち主 (review を通る) | そのリポジトリを使う全機械 | する。trunk の revision から読む |
| L2 機械ごとのリポジトリ上書き | `<repo>/.agx.local.toml` (gitignore) | その機械の操作者 | その機械のそのリポジトリ | しない。main checkout から読む |
| L3 機械全体の操作方針 | `~/.config/agx/roster.toml` | 操作者 (dotfiles が宣言を配る) | その機械の全リポジトリ | dotfiles に宣言。配備先は 1 か所 |

`.ws.toml` は L1 と L2 に吸収して廃止する。`trunk` の key はどこにも置かず、jj の `trunk()` を唯一の宣言にする。
`dispatch-roster.toml` は L3 に移す。schema、loader、契約は agx が持ち、中身 (どのモデルを使うか) は操作者が持つ。

## 1. いまの姿 (実測)

| ファイル | 置き場 | key | 読み手 (path:line) | 読む revision |
| --- | --- | --- | --- | --- |
| `.agx.toml` | 利用側リポジトリの root | `tickets`、`workspace_exclude` | agx-worker `tools/agx-worker/src/next/ticket-home.ts:51-86`、agx-ticket `tools/agx-ticket/src/tickets.ts:125-165`、未使用の `tools/shared/src/workspace-policy.ts:105` | worker は base_rev の commit。ticket は `jj file show -r @` (`tickets.ts:140`) で working copy |
| `.ws.toml` | 利用側リポジトリの root | `ready`、`trunk`、`keep` | agx-ws `tools/agx-ws/src/workspace.ts:69-75,134-174`、agx-ticket `tickets.ts:344` | ws の add は working file、rm、gc、doctor は `@-` の commit (`workspace.ts:134-161`) |
| `dispatch-roster.toml` | dotfiles の `agents/models/` | `[auto]`、`[auto.jev]`、`[[choice]]` ほか | `agents/models/roster.ts:11`、`tools/shared/src/dispatch-pricing.ts:67-68` (独自の reader)、agx-worker の 8 か所、render-home | ファイルそのもの。`DISPATCH_ROSTER_PATH` で差し替え |
| `model-floor.toml` | dotfiles の `agents/hooks/` | モデル系統ごとの下限 | hook `agents/hooks/enforce-model-floor.ts:31`、codex worker `tools/agx-worker/src/workers/codex.ts:57` | ファイルそのもの |

現物の中身 (2026-10-23):

- dotfiles `.ws.toml`: `ready = ["mise trust -q", "bun install --frozen-lockfile"]`、`trunk = "alpha"`。
- coralbase `.ws.toml`: dotfiles と同じ。owner のテストで **untracked であることが不変条件** になっている
  (coralbase `scripts/tests/repo-environment.test.ts:33`、`ws-config-one-source-1023` の調べによる)。
- firedancer `.ws.toml`: 上と同じ値に加えて `keep = ["/home/fuyu/Workspace/firedancer-arm-v4_dev"]`。
- firedancer `.agx.toml`: `tickets = "/home/fuyu/.local/state/firedancer-tickets/th"`。
- polysearch-v1 `.agx.toml`: `tickets = "/home/fuyu/Workspace/polysearch-v1/.agents/tickets"`。
- jj の `trunk()`: `jj/config.toml:21` の `latest(present(alpha@origin) | … | root())`。

### 1.1 何が不合理か

1. **同じ範囲・同じ書き手の値が二つのファイルに分かれている。** `.agx.toml` と `.ws.toml` は、どちらも
   「このリポジトリで agx をどう動かすか」を、リポジトリの持ち主が書く。分ける理由は、読む tool が違うことだけである。
2. **性質の違う値が一つのファイルに混ざっている。** `.ws.toml` の `ready` は、全機械で同じであるべき方針である。
   一方 `keep` は、その機械の絶対 path を並べた、機械ごとの値である。`.agx.toml` の `tickets` も、
   firedancer と polysearch-v1 では機械の絶対 path になっている。coralbase が `.ws.toml` を untracked にしたのは、
   この混在への対処だと読める。
3. **同じファイルを読む revision が、読み手ごとに違う。** `.agx.toml` は、worker が commit 済みを、ticket が working copy を読む。
   `.ws.toml` は、ws の add が working file を、gc が commit 済みを読む。gc は workspace を消すので、
   `keep` が見えないと失われる (`ws-config-one-source-1023` が直している最中)。
4. **一つの値に宣言が二つある。** `.ws.toml` の `trunk = "alpha"` と jj の `trunk()` は、同じ問い
   (どこに着地すれば landed か) への二つの答えで、意味も違う (`alpha` と `latest(alpha@origin | …)`)。
5. **roster の読み手が二つある。** `agents/models/roster.ts` の loader とは別に、
   `tools/shared/src/dispatch-pricing.ts:67-68` が同じ TOML を独自に parse している。
6. **agx が dotfiles のファイルを読む。** roster (`agents/models/`) と model-floor (`agents/hooks/`) は、
   分離の SEP-1 (`agx-separation.md` §2.2) に反する。

## 2. 3 層の設定契約

### 2.1 L1 リポジトリの方針 — `<repo>/.agx.toml`

```toml
schema = 1
tickets = ".agents/tickets"          # 相対 path。リポジトリの root から解く
workspace_exclude = ["target/"]      # 使う読み手がなければ、key ごと消す (§4 の E3)

[ws]
ready = ["mise trust -q", "bun install --frozen-lockfile"]
```

- Consumer: agx-worker (check、run、dispatch)、agx-ticket (new、ls、gc)、agx-ws (add の readiness)
- Authority / writer: そのリポジトリの持ち主。変更はそのリポジトリの review と commit を通る
- Effective configuration: main checkout の `trunk()` の revision にある `.agx.toml` (`jj file show -r 'trunk()' .agx.toml`)
- Source representation: TOML v1.0.0
- Trust regime: human-authored, gated-decision
- Signature / digest input: n/a
- Canonicalization profile: n/a
- Schema / version: `contract/agx-toml.schema.json` の schema 1 (agx リポジトリ)。読み手は `packages/core` の一つの関数だけ
- Duplicate-key policy: reject (TOML の parser が既定で拒む)。未知の key も reject (strict object)
- Number / Unicode policy: 数値の key はない。path は UTF-8 の文字列で、絶対 path は reject する (機械ごとの値は L2 に書く)
- Precedence / merge: L1 は既定値を上書きし、L2 は key ごとに L1 を置き換える (§2.2)。配列は連結せず置き換える
- Decision record: none: そのリポジトリの commit の履歴と review が唯一の記録である
- Exception encoding: none: 例外は L2 の値として書き、L1 に例外の仕組みは持たない
- Verification command: `agx worker check .agents/tickets/sep-roster-view-1023.md --cd ~/dotfiles` (worker の経路) と `agx ws add --json cfg-probe` (ws の経路) が、同じ解決結果を JSON で出す
- Positive case: `tickets = ".agents/tickets"` と `[ws] ready = [...]` を commit したリポジトリで、両方の命令が同じ `tickets` と `ready` を報告する
- Negative case: `tickets = "/home/…"` (絶対 path)、未知の key `trunk = "alpha"`、`schema` の欠落は、どれも exit 2 と、直し方を示す 1 行で拒む

### 2.2 L2 機械ごとのリポジトリ上書き — `<repo>/.agx.local.toml`

```toml
schema = 1
tickets = "/home/fuyu/.local/state/firedancer-tickets/th"   # 絶対 path を許すのはこの層だけ

[ws]
keep = ["/home/fuyu/Workspace/firedancer-arm-v4_dev"]
```

- Consumer: L1 と同じ読み手
- Authority / writer: その機械の操作者。commit しない (agx が `.gitignore` に入れるよう `agx ws doctor` で促す)
- Effective configuration: main checkout の working file (例: `~/Workspace/firedancer/.agx.local.toml`)。workspace 側にあっても読まない
- Source representation: TOML v1.0.0
- Trust regime: human-authored
- Signature / digest input: n/a
- Canonicalization profile: n/a
- Schema / version: `contract/agx-local-toml.schema.json` の schema 1。許す key は `tickets`、`[ws].ready`、`[ws].keep` だけ
- Duplicate-key policy: reject。未知の key も reject
- Number / Unicode policy: 数値の key はない。path は UTF-8 で、絶対 path を許す
- Precedence / merge: 既定値 → L1 → L2 の順で、key ごとに後のものが置き換える。`keep` は L2 にしか書けない
- Decision record: none: その機械の操作者が唯一の書き手で、gate の入力ではない
- Exception encoding: none: 上書きそのものが値であり、別の例外の仕組みはない
- Verification command: `agx ws gc --dry-run` と `agx ws add --json cfg-probe` が、同じ `keep` を報告する (一つの解決規則)
- Positive case: L2 だけにある `keep` が、add でも gc でも rm でも doctor でも効く
- Negative case: L1 に書いた `keep`、L2 に書いた `workspace_exclude` は exit 2 で拒む (層を取り違えた値を黙って使わない)

coralbase が `.ws.toml` を untracked にした理由は、L2 がその受け皿になる。coralbase の持ち主には、
`ready` を L1 に戻すかどうかを確かめる必要がある (§4 の E5)。

### 2.3 L3 機械全体の操作方針 — `~/.config/agx/roster.toml`

- Consumer: agx-worker の router (route、continue、preflight、codex の worker)、`agx worker roster --json` を読む dotfiles の render-home と hook
- Authority / writer: 操作者。宣言の正本は dotfiles (`agents/models/dispatch-roster.toml` から移す先は dotfiles のまま)。配備は `mise run link:dots` が 1 か所に書く (one writer)
- Effective configuration: `$AGX_ROSTER` が空でなければそれ、なければ `$XDG_CONFIG_HOME/agx/roster.toml`、なければ `~/.config/agx/roster.toml`
- Source representation: TOML v1.0.0
- Trust regime: human-authored, gated-decision
- Signature / digest input: n/a
- Canonicalization profile: n/a
- Schema / version: `contract/roster.schema.json` の schema 1 (いまの `agents/models/dispatch-roster.contract.md` と `roster.ts` の zod の schema を移す)
- Duplicate-key policy: reject。行の `id` が重複したら reject
- Number / Unicode policy: 価格と benchmark の値は IEEE 754 binary64。欠けている値は欠けたままにし、推定しない (いまの contract を引き継ぐ)
- Precedence / merge: 一つのファイルだけを読む。層の重ね合わせはしない。`$AGX_ROSTER` は test と一時的な差し替えのための入口である
- Decision record: none: dotfiles の commit の履歴が、roster の変更の記録である
- Exception encoding: encoded: `[auto].on_window_exhausted` のように、経路ごとの例外を roster の値として宣言する (2026-10-23 の eb21f1a9 の形)
- Verification command: `agx worker roster --json` が exit 0 で、全体を出す。`agx worker check .agents/tickets/sep-roster-view-1023.md` が、その roster で経路を選べる
- Positive case: 配備した `roster.toml` で、`agx worker roster --json` が `objective` と全行を出す
- Negative case: `id` の重複、未知の `route`、`schema` の欠落は exit 2。`DISPATCH_ROSTER_PATH` が設定されていたら、`AGX_ROSTER` を示して exit 2 (SEP-6)

L3 に入れないもの: `model-floor.toml` (hook の方針。dotfiles に残す) と `releases.toml` (dotfiles のモデル監査のデータ)。
codex の worker が model-floor を読むのはやめる。agx にとっての下限は「roster に載っている行だけを使える」で足りる (§4 の E4)。

## 3. 層を分ける理由 (C1・C3)

| 値 | 読み手 | 書き手 | 効く範囲 | 層 |
| --- | --- | --- | --- | --- |
| ticket の置き場 (相対) | worker、ticket | リポジトリの持ち主 | 全機械 | L1 |
| ticket の置き場 (絶対、state の下) | worker、ticket | 操作者 | その機械 | L2 |
| `ready` の命令 | ws | リポジトリの持ち主 | 全機械 | L1 (例外があれば L2) |
| `keep` の workspace | ws (gc、rm、doctor) | 操作者 | その機械 | L2 |
| trunk | ws、ticket、worker | jj の設定 | jj の範囲 | どこにも置かない。`trunk()` を読む |
| モデルの行、価格、経路の方針 | router | 操作者 | その機械の全リポジトリ | L3 |
| モデル系統の下限 | hook | dotfiles | その機械の shell | dotfiles (agx の外) |

ファイルの数は 3 のままである。ただし各ファイルが一つの書き手と一つの範囲を持ち、読み手も解決規則も一つになる。
「ファイルを 1 つにまとめる」案は採らない。リポジトリの方針 (review を通る) と、機械の値 (絶対 path、untracked) と、
機械全体の方針 (全リポジトリに効く) を一つにすると、C3 の書き手が 3 人になるからである。

## 4. 移行 (issue に切る粒度)

| 段 | 内容 | 依存 | 検証 |
| --- | --- | --- | --- |
| E1 | 設定の reader を一つにする: L1 と L2 を読む関数を agx-worker に作り (S5 で `packages/core` に移す)、ticket-home.ts、tickets.ts、workspace.ts の 3 か所から使う。読む revision は L1 が `trunk()`、L2 が main checkout の working file | `ws-config-one-source-1023` (dotfiles のコーディネーター) の着地 | `bun test tools/agx-worker/tests/next/ticket-home.test.ts tools/agx-ticket/tests/lifecycle.test.ts tools/agx-ws/tests/workspace.test.ts` |
| E2 | `.ws.toml` の廃止: `ready` を `.agx.toml` の `[ws]` へ、`keep` を `.agx.local.toml` へ。`.ws.toml` があったら exit 2 で移し方を示す。`trunk` の key は読まず、`trunk()` を使う | E1 | 同上と `bun test tools/agx-ws/tests/doctor.test.ts` |
| E3 | `workspace_exclude` の扱い: 読み手がない (`tools/shared/src/workspace-policy.ts` に本番の import 元がない) ので、key ごと削除する | なし | `rr text 'workspace_exclude'` が spec 以外で NO_MATCH |
| E4 | codex の worker が model-floor.toml を読むのをやめる | なし | `bun test tools/agx-worker/tests/codex.test.ts` |
| E5 | 利用側の移行: dotfiles、coralbase、firedancer、polysearch-v1 の `.agx.toml`、`.ws.toml` を新しい形に書き換える。各リポジトリの持ち主の commit。coralbase の untracked の不変条件は、持ち主と決め直す | E2 | 各リポジトリで `agx worker check` と `agx ws gc --dry-run` |
| E6 | roster を L3 へ: `dispatch-roster.toml` を `~/.config/agx/roster.toml` に配備する (link:dots の表に 1 行)。loader は `AGX_ROSTER` → XDG の順で読み、`DISPATCH_ROSTER_PATH` を廃止する。`dispatch-pricing.ts` の独自の reader を消す | roster の consumer の切り替え (render と hook は済み) | `bun test tools/agx-worker/tests/public.test.ts tools/agx-worker/tests/selection.test.ts` と `mise run lint:config-map` |

E1〜E4 は互いに独立していて、並べて出せる (E2 だけは E1 の後)。E5 は外の持ち主の作業である。E6 は S3 の roster の移動と一緒に行う。

## 5. 未決事項

- **F1:** L2 のファイル名。`.agx.local.toml` は「main checkout にだけ置く untracked のファイル」で、mise の `mise.local.toml` と同じ慣習である。
  別案は `~/.config/agx/repos/<repo の key>.toml` で、リポジトリの外に置く。前者を推す。理由は、どのリポジトリへの上書きかが置き場で分かり、
  coralbase の現状 (root の untracked のファイル) とも合うからである。
- **F2:** coralbase の `.ws.toml` を untracked にした理由が、`ready` も機械ごとに変えたいということなのか、`keep` だけなのか。
  coralbase の持ち主に確かめる。
