# agx を dotfiles から分離するか — 設計判断 (2026-10-23)

この文書は、agx を dotfiles から分離するかどうかの判断材料と、移行の計画である。実装は含まない。
計測はすべて dotfiles の作業コピー (2026-10-23, `alpha` = `bce015ad` の子孫) で行った。

## 0. 結論

**部分的に分離する。ただし、先に dotfiles 内で境界を直してから、リポジトリを分ける。**

0. 最初に段 S0 で名前を直す。状態ディレクトリは `~/.local/state/agx` にする。`agx-next` と
   `AGX_NEXT_*` はやめる。一つの変数に二つの意味を持たせない (§3.6)。`agx-next` ができたのは、
   dotfiles の land が `~/.local/state/agx` に書き込んでいるからである。その書き手をそこから出す。
1. 段 S1〜S4 (dotfiles 内の境界修正) は、分離するかどうかに関わらず価値がある。いまの agx は
   architecture の I12 (「tool は自分のディレクトリと `tools/shared/` だけを import する」) を
   破っている (§3.2)。statusline と hook も agx の内部ファイルを直接読んでいる (§3.3)。
   この段だけで、利用側との契約が CLI と JSON に集まる。
2. 段 S5〜S8 (新リポジトリ `agx` への移動) は、S1〜S4 の後で、§9 の再判断条件を満たすときに行う。
   S4 を終えると、移動は「コピーと固定版の取り込み」だけになる。
3. 分離しない (現状維持) は推奨しない。契約 (チケット形式、`records.jsonl`、`.agx.toml`) は
   dotfiles の外の利用側リポジトリも使っているのに (§3.4)、その定義が個人用リポジトリの内部 import に
   埋まっている。この状態は分離しなくても直す必要がある。
4. いきなり全部を分離することも推奨しない。いま切ると、roster、model floor、statusline、
   `land.ts` が agx のソースを直接 import したり読んだりしているため、二重実装か壊れたリンクが残る。

## 1. User story

- **U1 (利用側リポジトリの調整役):** dotfiles の外で agx を使うリポジトリのコーディネーターとして、
  dotfiles を読まずに、チケット形式、`.agx.toml`、`agx worker ls --json` の形を知りたい。
  そうすれば、dotfiles の変更で自分の lane が黙って壊れることがない。
- **U2 (agx の保守者):** agx を変えるとき、dotfiles の hook、render、land の gate を
  巻き込まずに `test:agx` 相当だけで検証したい。逆に、dotfiles の変更で agx が壊れないようにしたい。
- **U3 (dotfiles の保守者):** statusline と hook を、agx の内部状態ファイルの形ではなく、
  版の付いた CLI 出力だけに依存させたい。
- **U4 (操作者):** 機械全体で agx の版を一つだけ持ち、どの版が入っているかを `agx -V` で確かめたい
  (README の A 種の定義, `README.md:154-156`)。

## 2. Negative space と invariant

### 2.1 分離しても agx が持たないもの

| 持たないもの | 持ち主 | 根拠 |
| --- | --- | --- |
| statusline の描画、display cache | dotfiles `tools/statusline` | 依頼の合意 3。statusline は `agx status --json` だけを読む |
| 資源の割り当て | `agent-resource-run` (dotfiles) | `tools/agx-worker/docs/scope.md:58` |
| コード検索 | `rr` (dotfiles) | `tools/agx-worker/docs/scope.md:63` |
| hook の方針 (model floor、dispatch contract、background waits) | dotfiles `agents/hooks`, `agents/claude/hooks` | hook は「方針」、agx は「機構」。architecture §4 |
| dotfiles の land、deploy、render-home | dotfiles `scripts/` | `tools/agx-worker/docs/scope.md:59` |
| ticket の保管と履歴 | 各利用側リポジトリ (plain files + jj) | `tools/agx-worker/docs/scope.md:54` |
| 受け入れの判断 | 人またはコーディネーター | `tools/agx-worker/docs/scope.md:60` |
| systemd unit の宣言 (`agx-doctor.*`, `ws-gc.*`) | dotfiles `systemd/` | 機械の配備は dotfiles の役目 (`scripts/config-registry.ts:198-204`) |
| 新しい状態 | — | `agx status` は既存の状態を集約するだけ (§6.2) |

### 2.2 Invariant

- **SEP-1 (一方向依存):** dotfiles → agx の向きにだけ依存する。agx のソースは dotfiles のパスを
  import せず、名指しもしない。検査: S3 で追加する import 境界テスト (§7)。
- **SEP-2 (契約は CLI と schema だけ):** dotfiles と利用側リポジトリが agx に触れるのは、
  CLI の argv、終了コード、`--json` 出力、`.agx.toml`、チケット形式だけである。
  状態ディレクトリの中のファイルを直接読まない。
- **SEP-3 (状態の書き手は一つ):** agx の状態ディレクトリは `$AGX_STATE_DIR` →
  `$XDG_STATE_HOME/agx` → `~/.local/state/agx` の順で決まる一つだけで、書き手は agx だけである。
  `agx-next` という名前は S0 でやめる (§3.6)。`tools/agx-worker/contract.md:19-21` の
  「互換のため `agx-next` を残す」方針は、これで置き換える。
- **SEP-6 (一つの値に一つの名前):** 一つの環境変数は一つの意味だけを持つ。別名は置かない。
  廃止した名前が設定されていたら、黙って無視せず、新しい名前を示して exit 2 にする。
- **SEP-4 (版は一つ):** 機械に入る agx の版は一つで、dotfiles がその版を一か所で宣言する。
- **SEP-5 (fresh clone で動く):** agx リポジトリの gate は dotfiles なしで fresh clone から通る。
  dotfiles の gate も agx のチェックアウトなしで通る (README B 種の規則, `README.md:157-160`)。

## 3. 結合の実測

### 3.1 `tools/shared/src` の各モジュール

**計測方法:** 外部からの import は
`rr regex "shared/src/[a-z-]+(\.ts)?['\"]" --project ~/dotfiles` で取得した (417 行)。
shared 内部の import は `rr regex 'from "\./[a-z-]+\.ts"' -p tools/shared/src` で取得した。
行数は `wc -l tools/shared/src/*.ts` で数えた (合計 7,067 行)。
列「本番の import 元」には tests を含めない。tests だけから参照されるモジュールは、そのことを書いた。

分類は次のとおり。**agx 専用** は本番の import 元が agx 群 (`tools/agx*`) だけのもの。
**共用** は agx 群と dotfiles 側の両方から import されるもの。**汎用** は小さな基礎部品で、
どちらも自分の copy を持てるもの。**dotfiles 専用** は agx 群が import しないもの。

| モジュール | 行 | 本番の import 元 (代表 path:line) | 分類 | 分離後の扱い |
| --- | ---: | --- | --- | --- |
| `agx-dispatch-binding.ts` | 10 | `tools/agx-worker/src/dispatch.ts:18` | agx 専用 | agx へ移す |
| `path-dispatch.ts` | 20 | `tools/agx/src/agx.ts:4` | agx 専用 | agx へ移す |
| `jj-read.ts` | 3 | `tools/agx-worker/src/dispatch.ts:19`, `tools/agx-ticket/src/tickets.ts:26` | agx 専用 | agx へ移す |
| `slug.ts` | 12 | `tools/agx-worker/src/dispatch.ts:14`, `tools/agx-ws/src/workspace.ts:33`, `tools/agx-ticket/src/tickets.ts:28` | agx 専用 (`agent-name.ts` に依存) | agx へ移す |
| `workspace-policy.ts` | 189 | 本番の import 元なし (`rr text 'workspace-policy'` は文書 3 件だけ) | agx 専用 (`.agx.toml` の reader)、未使用 | S2 で削除するか、§5.3 の schema reader に統合 |
| `run-result.ts` | 41 | 本番の import 元なし (`tools/shared/tests/run-result.test.ts:2` だけ) | agx 専用、未使用 | S2 で agx へ移すか削除 (I6 の検査が参照: `tools/spec/architecture.md:124`) |
| `jev-client.ts` | 124 | `tools/agx-worker/src/next/route.ts:2`, `tools/jex/src/classify.ts:3` | 共用 (agx と jex) | agx へ移し、jex も同居 (§6.3) |
| `typesafe-key.ts` | 63 | `jev-client.ts:7`, `agents/hooks/typesafe-key.ts:2` | 共用 | agx が copy を持つ。dotfiles は現行版を残す |
| `dispatch-state.ts` | 144 | `tools/agx-worker/src/state.ts:110`, `tools/agx-ws/src/workspace.ts:32`, `tools/agx-usehooks/src/conditions.ts:13`, `tools/statusline/src/dispatch-runs.ts:11`, `scripts/land.ts:40`, `scripts/land-queue.ts:9` | 共用 (agx の状態の形) | agx へ移す。dotfiles 側は `agx status --json` / `agx worker ls --json` を読む (S4) |
| `doctor-record.ts` | 33 | `tools/agx-worker/src/next/doctor.ts:1`, `tools/agx-ws/src/ws.ts:2`, `tools/agx-ticket/src/tkt.ts:2`, `scripts/agx-doctor.ts:9` | 共用 (doctor JSON Lines の形) | agx へ移し、`scripts/agx-doctor.ts` を agx の `agx doctor` サブコマンドにする (S4) |
| `dispatch-pricing.ts` | 84 | `tools/agx-worker/src/dispatch-cost.ts:1`, `tools/statusline/src/codex-rate.ts:7` | 共用 | agx へ移す。statusline の費用表示は `agx status --json` の値を使う |
| `subscription-usage.ts` | 84 | `tools/agx-worker/src/next/usage.ts:4`, `tools/statusline/src/usage-snapshot.ts:7` | 共用 | 未決 (§9 R3)。当面は両側に copy |
| `codex-subscription-usage.ts` | 280 | `tools/agx-worker/src/next/usage.ts:7`, `tools/statusline/src/codex-rate.ts:414` | 共用 | 同上 |
| `model-orders.ts` | 817 | `tools/agx-worker/src/workers/codex.ts:57`, `agents/hooks/enforce-model-floor.ts:31`, `agents/codex/hooks/enforce-dispatch-contract.ts:18` | 共用 (方針は `agents/hooks/model-floor.toml`, `model-orders.ts:19`) | dotfiles に残す。agx の codex worker は floor を自分で判定しない (§3.2 C3) |
| `worker-env.ts` | 2 | `tools/agx-worker/src/workers/environment.ts:4`, `agents/claude/hooks/enforce-background-waits.ts:50` | 共用 (環境変数名の契約 `AGX_WORKER=1`) | 契約として §5.2 に書き、両側が定数を持つ |
| `readonly-command.ts` | 20 | `tools/agx-worker/src/dispatch.ts:20`, `tools/agx-ticket/src/tickets.ts:27`, `agents/claude/hooks/enforce-official-execution.ts:38`, `tools/repo-retrieve/src/ccc-scope.ts:13` | 共用 (Landlock 読み取り境界) | 両側が copy を持つ (B 種と同じ扱い)。`readonly-exec.ts` を path で起動する (`readonly-command.ts` の `join(import.meta.dir, "readonly-exec.ts")`) |
| `readonly-exec.ts` | 111 | `readonly-command.ts` が path で起動 (import ではない) | 共用 | `readonly-command.ts` と一緒に動く |
| `ref-locks.ts` | 117 | `tools/agx-worker/src/next/preflight.ts:5`, `scripts/doctor.ts:66` | 共用 | agx へ移す。`scripts/doctor.ts` は `agx worker doctor` の出力を読む |
| `agent-name.ts` | 71 | `tools/agx-ws/src/workspace.ts:25`, `agents/claude/hooks/assign-lib.ts:22`, `agents/codex/hooks/herdr-identity.ts:5` | 共用 (セッション名の規則, `tools/spec/architecture.md:95`) | 名前の規則を §5.2 の契約に書き、両側が copy を持つ |
| `dir-lock.ts` | 110 | `tools/agx-ws/src/lock.ts:6`, `scripts/land-queue.ts:8`, `tools/disk-reclaim/src/receipt.ts:11` | 汎用 | 両側が copy を持つ |
| `jsonl.ts` | 234 | `tools/agx-usehooks/src/conditions.ts:8`, `tools/statusline/src/adapters/codex-rollout.ts:4` | 汎用 | 両側が copy を持つ |
| `gpu-samples.ts` | 233 | `tools/agx-usehooks/src/conditions.ts:14`, `tools/statusline/src/ccc-indexing.ts:23` | dotfiles の機械状態 (gpu-sampler の出力) | usehooks の `gpuUtil` は state file の形 (`README.md:224-228`) を読む契約にする |
| `attempt.ts` | 36 | agx 群と dotfiles の 20 以上のディレクトリ | 汎用 | 両側が copy を持つ |
| `cli.ts` | 121 | agx 群 5 個 (`tools/agx/src/agx.ts:2` ほか) と dotfiles 側 20 以上 | 汎用 | 両側が copy を持つ |
| `zod.ts` | 44 | agx 群と dotfiles 側の多数 | 汎用 | 両側が copy を持つ |
| `decode.ts` | 23 | tests だけ (`tools/agx-ticket/tests/lifecycle.test.ts:13` ほか) | 汎用 (test 用) | 両側が copy を持つ |
| `narrow.ts` | 67 | `model-orders.ts:29`, `agents/hooks/narrow.ts:2`, `scripts/render-source.ts:16` | dotfiles 専用 (agx からは model-orders 経由だけ) | dotfiles に残す |
| `test-tmp.ts` | 232 | `bunfig.toml:6` (preload), `scripts/lint-tmp-leaks.ts:23` | dotfiles 専用 (test 基盤) | agx リポジトリは自分の preload を持つ |
| `bash-cwd.ts`, `find-executable.ts`, `read-path.ts`, `shape.ts`, `shell-syntax.ts`, `no-new-bash.ts`, `sockets.ts`, `storage-headroom.ts`, `reclaim-plan-cache.ts`, `terminal-progress.ts`, `fleet-session.ts`, `codex-native-title.ts`, `gpu-sampler.ts`, `gpu-process-identity.ts`, `gpu-stall-notify.ts`, `gpu-visibility.ts` | 計 3,742 | `agents/hooks/lib.ts:18-19`, `scripts/doctor.ts:100`, `agents/hooks/enforce-storage-headroom.ts:5`, `tools/statusline/src/fleet-session.ts:6`, `tools/herdr-projector/tests/cpu.test.ts:5` など | dotfiles 専用 | 動かさない |

集計 (本番 import 元による):

- **agx へ移すもの:** 10 モジュール、588 行 (`agx-dispatch-binding`, `path-dispatch`, `jj-read`,
  `slug`, `jev-client`, `dispatch-state`, `doctor-record`, `dispatch-pricing`, `ref-locks`,
  `run-result`)。`workspace-policy` (189 行) は使われていないので、移さずに削除するのが妥当である。
- **両側が copy を持つもの:** 汎用の 8 モジュール (`attempt`, `cli`, `zod`, `decode`, `dir-lock`,
  `jsonl`, `readonly-command`, `readonly-exec`, 計 699 行) と契約の定数 (`worker-env`, `agent-name`,
  `typesafe-key`, 計 136 行)。合計 835 行。
- **dotfiles に残すもの:** `model-orders` + `narrow` (884 行) と dotfiles 専用群。

### 3.2 agx が dotfiles の外側の path を import している箇所 (I12 違反)

**計測方法:**
`rr regex 'from "(\.\./)+(agents|scripts|presets)/|agents/models|dispatch-roster\.toml|from "(\.\./)+tools/' -p tools/agx -p tools/agx-worker/src -p tools/agx-ws/src -p tools/agx-ticket/src -p tools/xmsg/src -p tools/jex/src`

| ID | 箇所 | 依存先 | 影響 |
| --- | --- | --- | --- |
| C1 | `tools/agx-worker/src/next/route.ts:10`, `next/public.ts:4`, `next/capacity.ts:1`, `next/continue.ts:1`, `next/history.ts:3`, `next/preflight.ts:10`, `next/run.ts:27`, `workers/codex.ts:52` | `agents/models/roster.ts` (303 行) と `agents/models/dispatch-roster.toml` (570 行) | 経路選択の入力が dotfiles の agents/ にある。agx の中心の依存 |
| C2 | `tools/agx-worker/src/temp.ts:15` | `agents/hooks/zod.ts` (2 行) | 小さいが、hook ディレクトリへの依存 |
| C3 | `tools/agx-worker/src/workers/codex.ts:57` (`judge`, `ordersIn`, `parseFloorConfig`) | `tools/shared/src/model-orders.ts` と `agents/hooks/model-floor.toml` | worker が hook の方針ファイルを読む |

`tools/spec/architecture.md:130` は I12 の import 境界を「UNCHECKED」としている。C1〜C3 はその実例である。

### 3.3 dotfiles 側から agx を呼ぶ箇所、agx の内部を読む箇所

**計測方法:** `rr regex '\bagx[-a-z]*\b' -p scripts/... -p systemd -p mise.toml` と、hook ディレクトリへの
同じ検索。全数は `tools/agx-worker/docs/suite-callers.md` にある。ここでは分離で契約になる箇所だけを挙げる。

| 種類 | 箇所 | 触れ方 | 分離後 |
| --- | --- | --- | --- |
| statusline | `tools/statusline/src/agx-snapshot.ts:80-86` | 状態ディレクトリを自前で解決 (`AGX_NEXT_STATE_DIR`, `AGX_STATE_DIR`, 既定 `~/.local/state/agx-next`) | `agx status --json` を読む |
| statusline | `tools/statusline/src/agx-snapshot.ts:152-186` | `current-runs.json`, `workspace-verdicts.json`, `doctor.json`, `records.jsonl` を直接読み、mtime を比べる | 同上 |
| statusline | `tools/statusline/src/agx-snapshot.ts:298` | `records.jsonl` を直接畳み込む (自前の fold) | 同上。fold は agx の役目 (`scope.md:14`) |
| statusline | `tools/statusline/src/dispatch-runs.ts:11,15,56` | shared の `dispatch-state` / `dispatch-pricing` を import し、`<run>.progress.json` を直接読む | 同上 |
| hook | `agents/claude/hooks/log-agx-snapshot.ts:45-50` | agx の状態ディレクトリを自前で解決 (コメントに「Same owner path as `tools/agx-worker/src/next/store.ts`」) | `agx status --json` を読む |
| hook | `agents/hooks/remind-reply-language.ts:9` | `tools/agx-usehooks/src/index.ts` をソースのまま import | 固定版の `agx-usehooks` パッケージを import |
| hook | `agents/claude/hooks/enforce-dispatch-contract.ts:24,48-51`, `agents/claude/hooks/bash-durations.ts:49` | `agx worker run` などの argv 文字列 | 変更不要 (CLI 契約) |
| render-home | `scripts/render-home.ts:80-81,398-410` | `agents/models/roster.ts` を import し、roster を `~/.claude/CLAUDE.md` に描画 | `agx worker roster --json` (`tools/agx-worker/contract.md:13`) を読む |
| mise task | `mise.toml:29-31` (`accept`), `mise.toml:436-440` (`test:agx`), `mise.toml:508-512` (`usehooks:consumers`) | agx のソースのテストと script | `test:agx` は agx リポジトリへ移る。`accept` は CLI 経由のまま残せる |
| script | `scripts/agx-accept.ts:151` | `agx worker ls --json` を子プロセスで呼ぶ | 変更不要 (CLI 契約) |
| script | `scripts/agx-doctor.ts:5,16,94` | `tools/agx/package.json` を import、`agx-next` を名指し | agx の `agx doctor` に移す |
| script | `scripts/land.ts:129-142` | `tools/agx-worker/package.json` の bin を読み、ソースの CLI を直接起動 | インストール済みの `agx-worker` を起動 |
| script | `scripts/land.ts:496` | `tools/agx-usehooks/` の変更で利用側の型検査を走らせる | agx リポジトリの gate に移す |
| script | `scripts/doctor.ts:66,1982` | `ref-locks` を import、`scripts/agx-doctor.ts` を起動 | `agx doctor` を起動 |
| systemd | `systemd/agx-doctor.path:5-6` | `~/.local/state/agx-next/records.jsonl` と `workspace-verdicts.json` を監視 | 監視対象の path を契約として §5.2 に書く (SEP-3 で場所は不変) |
| systemd | `systemd/agx-doctor.service:13` | `%h/dotfiles/scripts/agx-doctor.ts` を起動 | `%h/.bun/bin/agx doctor --json` を起動 |
| systemd | `systemd/ws-gc.service:9` | `%h/.bun/bin/agx ws gc --all --legacy` | 変更不要 |
| registry | `scripts/config-registry.ts:534,546-556` (package.json 群), `:726-734` (roster), `:757-762` (`.ws.toml`), `:795-799` (usehooks consumers) | 構成面の登録 | agx へ移る行は registry から外し、利用側として「pinned agx 版」の 1 行を足す |
| skill / 文書 | `agents/skills/orchestrating-agents/SKILL.md:83,360`, `agents/skills/driving-antigravity/SKILL.md:24-25`, `agents/codex/AGENTS.md:11`, `agents/claude/CLAUDE.md:11-21` | CLI の使い方 | 変更不要 (CLI 契約)。文書の参照先 URL だけ直す |

### 3.4 利用側リポジトリ

利用側リポジトリが agx と結合する形は、次の三つである。

- **チケットの置き場の宣言:** `.agx.toml` の `tickets`。宣言しない利用側は既定の `.agents/tickets` を使う (`scope.md:22`)。
  宣言する利用側の中には、機械の絶対 path (リポジトリの外の状態ディレクトリ) を commit しているものがある。
- **作業ツリーの設定:** `.ws.toml` の `ready`、`trunk`、`keep`。`keep` は機械の絶対 path を並べる。
- **hook のライブラリ:** `agx-usehooks` を `node_modules/agx-usehooks` に link して使う利用側がある (`tools/agx-usehooks/consumers.toml:1-8`)。

利用側によっては、追跡されたファイルの中身と名前に個人の道具の名前を置くことを、試験で禁じている。
この場合、利用側は agx の設定ファイルを commit できない ([agx-config.md](agx-config.md) の R3)。

`.agx.toml` の reader は二つある。`tools/agx-ticket/src/tickets.ts:131-156` と
`tools/agx-worker/src/next/ticket-home.ts:51-59` である。さらに、使われていない
`tools/shared/src/workspace-policy.ts:105` がある。契約の schema は一か所に書かれていない。
`agx ws` の設定は別ファイル `.ws.toml` にある (`scripts/config-registry.ts:757-762`)。

### 3.5 状態ディレクトリ `~/.local/state/agx-next`

`ls ~/.local/state/agx-next` の結果: `current-runs.json`, `doctor.json`, `locks/`,
`records.fold.json`, `records.jsonl`, `runs/`, `workspace-verdicts.json`, ほかに run が置いた
log ファイル。`du -sh` は 325M。

- 書き手は agx だけにする (SEP-3)。場所は S0 で `~/.local/state/agx` に移す (§3.6)。
- 外から読んでよいのは CLI 出力だけにする (SEP-2)。いま直接読んでいるのは §3.3 の statusline 2 ファイル、
  hook 1 ファイル、systemd path unit 1 個である。systemd の path 監視は内容を読まないので、
  監視する path を契約に書くことで残す。
- `agx-usehooks` は旧 ledger `$AGX_STATE_DIR/runs.jsonl` (既定 `~/.local/state/agx/runs.jsonl`) を読む
  (`tools/agx-usehooks/README.md:15`)。`agx-next/records.jsonl` ではない。分離の前に、
  これが意図した互換なのか、古いままなのかを持ち主が決める必要がある (§9 R4)。

### 3.6 状態ディレクトリの名前と環境変数の名前

**`agx-next` が生まれた理由:** `~/.local/state/agx` は、2026-10-14 の切り替えより前の ledger
(`runs-2026-10-1*.jsonl`, `lifecycle.jsonl`, `briefs/` ほか、603M) の置き場である。
現行の agx はそれを避けて `agx-next` を使った。ところが `~/.local/state/agx` は死んでいない。
`ls -lt ~/.local/state/agx` で見ると `runs.jsonl` は 2026-10-22 19:44 に、`land/<id>/queue.jsonl` は
2026-10-17 以降に更新されている。書き手は dotfiles の land である。

- `scripts/land.ts:348-353` が `landed` の行を `dispatchStateDir()/runs.jsonl` に追記している。
  `dispatchStateDir` (`tools/shared/src/dispatch-state.ts:120-128`) は `~/.local/state/agx` を返す。
- `scripts/land-queue.ts:9` も同じ関数で `~/.local/state/agx/land/` に queue を書く。

つまり今は、agx でない dotfiles の land が「agx」という名前のディレクトリの書き手になっていて、
agx 自身は `agx-next` に追い出されている。名前がおかしいのは、この書き手の取り違えの結果である。

**`AGX_STATE_DIR` には意味が二つある (欠陥):**

- 現行の状態: `tools/agx-worker/src/next/store.ts:125-134` (`AGX_NEXT_STATE_DIR` の次に読む)。
- 旧 ledger の読み元: 同じファイルの `store.ts:247-250` (`legacySourceDir`)、
  `tools/shared/src/dispatch-state.ts:121`、`tools/statusline/src/dispatch-state.ts:12`、
  `agents/claude/hooks/log-agx-snapshot.ts:49`。
- `AGX_STATE_DIR` だけを設定すると、現行と旧 ledger が同じディレクトリを指す。
  test の隔離 (`tools/shared/src/test-tmp.ts:187`) はこの形で動いている。

`XDG_STATE_HOME` の扱いも食い違っている。`store.ts:131-133` は従うが、
`tools/statusline/src/agx-snapshot.ts:84` と `agents/claude/hooks/log-agx-snapshot.ts:50` は従わない。

**環境変数の棚卸し:** `rr regex 'AGX_[A-Z0-9_]*'` (CHANGELOG と `.agents/` を除く) で 55 種類が見つかった。
本番コードで使われていて名前に問題があるものと、その置き換えを次に示す。

| 今の名前 | 使っている所 | 問題 | 新しい名前 |
| --- | --- | --- | --- |
| `AGX_NEXT_STATE_DIR` | `store.ts:127`, `tools/agx-ws/src/workspace.ts:2170`, `scripts/agx-doctor.ts:86`, `agx-snapshot.ts:82` | `next` は移行の残骸 | 廃止。`AGX_STATE_DIR` に一本化 |
| `AGX_STATE_DIR` | 上記の 2 つの意味 | 一つの名前に二つの意味 | 現行の状態だけを指す。旧 ledger は `$AGX_STATE_DIR/legacy-v1/` (導出であり変数を持たない) |
| 既定 `~/.local/state/agx-next` | `store.ts:134` ほか | 同上 | `~/.local/state/agx` |
| `AGX_NEXT_JEV_URL` | `tools/agx-worker/src/next/route.ts:48`, `tools/jex/src/classify.ts:156` | `next`。jex が agx の変数を読む | `JEV_URL`。Jev クライアント (`jev-client.ts`) が一か所で読む。`JEX_JEV_URL` も廃止 |
| `AGX_NEXT_WORKER` | `tools/agx-worker/src/next/run.ts:399,407` | `next`。中身は「worker 実行ファイルの差し替え」 | `AGX_WORKER_BIN` (`AGX_CODEX_BIN` と揃える) |
| `AGX_KIND`, `AGX_LABELS` | `tools/agx-usehooks/src/jobs.ts:96,103` | `AGX_JOB_KIND`, `AGX_JOB_LABELS` の別名 | 別名を廃止 |
| `AGX_DOCTOR_HOME`, `AGX_DOCTOR_WORKSPACE` | `tools/agx-ticket/src/tickets.ts:523-525`, `tools/agx-ws/src/workspace.ts:1955-1958` | doctor 以外でも使う。二つで一つの値 (リポジトリを探す根) を作る。`Workspace` は jj の workspace と紛らわしい | `AGX_REPOS_ROOT` 一つ (既定 `~/Workspace`) |
| `AGX_DOCTOR_QUIET` | `scripts/agx-doctor.ts:24` が子に渡し、`ws.ts:288`, `tkt.ts:149`, `tickets.ts:271`, `next/doctor.ts:21` が読む | 呼び出し側の指示を環境変数で渡している | 各 `doctor` の `--quiet` フラグ |

ほかの本番の名前 (`AGX_WORKER`, `AGX_DISPATCHER_SESSION`, `AGX_READONLY_COMMAND_JOB`, `AGX_CODEX_BIN`,
`AGX_TMP_ROOT`, `AGX_WAIT_POLL_MS`, `AGX_DISPATCH_WAIT_MS`, `AGX_PROGRESS_EVERY_S`,
`AGX_CODEX_PROGRESS_FILE`, `AGX_INTERIM_REPORTS_FILE`, `AGX_LAST_MESSAGE_FILE`,
`AGX_WORKER_ACTIVITY_FILE`, `AGX_CODEX_HOST_FILE`, `AGX_JOB_KIND`, `AGX_JOB_LABELS`) は、
一つの意味を名前どおりに持つので残す。`AGX_AUDIT_*`, `AGX_TEST_*`, `*_FIXTURE` は tests の中だけで使う。

変数以外の `next` の残骸もなくす。対象は `tools/agx-worker/src/next/` と `tests/next/` (→ `src/`, `tests/`)、
`docs/next-records.md` (→ `contract/records.md`)、型 `NextEvent` (`store.ts:123`, → `RunEvent`)、
`dispatchStateDir` / `dispatchStateReadDirs` (`tools/shared/src/dispatch-state.ts:120-144`。
この中には、さらに古い `agent-router` を読む分岐も残っている。そのディレクトリはもう存在しない)。

## 4. 規模

**計測方法:** `rr files 'tools/{agx,...}/**/*.ts'` の各ファイルを `wc -l` で集計した。

| tool | src 行 | tests 行 | 分離後 |
| --- | ---: | ---: | --- |
| `tools/agx` | 62 | 130 | 移す |
| `tools/agx-worker` | 8,471 | 10,537 | 移す |
| `tools/agx-ws` | 2,962 | 2,425 | 移す |
| `tools/agx-ticket` | 876 | 349 | 移す |
| `tools/agx-usehooks` | 1,429 | 1,404 | 移す (利用側ライブラリ) |
| `tools/xmsg` | 1,357 | 1,631 | 移す (`agx msg`, §6.1) |
| `tools/jex` | 248 | 304 | 同居 (§6.3) |
| `agents/models/roster.ts` + `dispatch-roster.toml` + contract | 908 | (`agents/models/tests/`) | 移す (C1) |
| shared のうち agx へ移すもの | 588 | (`tools/shared/tests` の該当分) | 移す |
| shared のうち copy | 835 | — | 両側 |
| 合計 (移す src、copy を除く) | **16,903** | **16,780** (`agents/models/tests` と shared tests を除く) | |

dotfiles 側で残る統合コードの見積もり: statusline の agx 読み取り (`agx-snapshot.ts` 371 行のうち
fold と path 解決の約 250 行) を `agx status --json` の読み取り (約 60 行) に置き換える。
`log-agx-snapshot.ts` (151 行) は約 30 行減る。`render-home.ts` の roster 描画は import を
子プロセス呼び出しに替えて約 +20 行。`agx-doctor.ts` (142 行) は agx へ移る。
差し引きで、dotfiles 側の統合コードは **約 200〜250 行減る**。agx 側では `agx status` が新しく
約 150〜250 行増え、import 境界テストが約 50 行増える。この節の増減は設計からの見積もりで、実装はしていない。

## 5. 新リポジトリの構成と取り込み方

### 5.1 構成

場所は `~/Workspace/agx` (作業ディレクトリはすでにあり、空である)。jj を colocate する。

```text
agx/
├── package.json            # bun workspaces。bin: agx, agx-worker, agx-ws, agx-ticket, jex, xmsg(移行期の別名)
├── bunfig.toml             # 自前の test preload (dotfiles test-tmp.ts 相当の copy)
├── mise.toml               # setup / fmt / lint / test / check / gate:land / commit (wiring-mise-tasks の契約)
├── contract/               # 利用側との契約。ここだけが利用側に見える
│   ├── ticket.schema.json
│   ├── agx-toml.schema.json
│   ├── records.md          # tools/agx-worker/docs/next-records.md から移す
│   ├── cli.md              # tools/agx-worker/contract.md と agx-ws/agx-ticket の spec
│   └── env.md              # AGX_WORKER=1, AGX_DISPATCHER_SESSION, 状態ディレクトリ, 名前の規則
├── packages/
│   ├── agx/                # 入口 (process router)
│   ├── worker/  ws/  ticket/  msg/  status/
│   ├── roster/             # roster.ts と dispatch-roster.toml
│   ├── usehooks/           # 利用側の hook ライブラリ (npm 形式の package)
│   ├── jex/                # 非メンバー (§6.3)
│   └── core/               # §3.1 で agx へ移すモジュール + copy した汎用部品
└── docs/                   # scope.md, architecture の Suite 節, acpx-boundary.md と evidence
```

部品の import 規則は今と同じにする。各 package は自分と `packages/core` だけを import し、
部品同士は CLI でだけ組む (`tools/spec/architecture.md:54-55`)。

### 5.2 契約に書くもの

`contract/` に次を書き、版を付ける。破壊的な変更は major 版にする (agx-usehooks の semver 規則,
`tools/agx-usehooks/README.md:15` を全体に広げる)。

- CLI: 各サブコマンドの argv、終了コード (0/1/2/3/75)、`--json` の schema。
- チケット形式と `.agx.toml` の schema。reader は `packages/core` の一つだけにする (§3.4 の二重の reader を統合)。
- 状態ディレクトリの場所 (`AGX_STATE_DIR` → `$XDG_STATE_HOME/agx` → `~/.local/state/agx`) と、
  外から監視してよい path (`records.jsonl`, `workspace-verdicts.json`)。中身を読む契約ではない。
  `legacy-v1/` は読み取り専用で、書き手はいない。
- 環境変数: `AGX_WORKER=1` (`tools/shared/src/worker-env.ts`)、`AGX_READONLY_COMMAND_JOB`、
  `AGX_DISPATCHER_SESSION` (`tools/agx-worker/contract.md:35-36`)。
- 名前の規則: `<project-slug>-<role>_<id>`、`agt_<slug>`、`ws_<slug>` (`tools/spec/architecture.md:95-97`)。

### 5.3 dotfiles が agx を取り込む方法

| 方法 | 長所 | 短所 | 判定 |
| --- | --- | --- | --- |
| (a) `bun link` で `~/Workspace/agx` のチェックアウトを直接 PATH に出す | 速い。今と同じ使い心地 | 版がチェックアウトの状態に引きずられる。作業中の変更が機械全体に出る。SEP-4 に反する | 開発機の一時的な手段にとどめる |
| (b) dotfiles の root `package.json` の `dependencies` に git URL とタグで固定し、`mise run deps` で全体に入れる | 版の宣言が dotfiles の一か所 (+ `bun.lock`) にある。A 種の「pinned root package」と同じ形 (`README.md:154-156`) | 依存の bin が `bun link` で全体の PATH に出るかを確かめる必要がある (未検証) | **推奨** |
| (c) agx を `bun build --compile` の単体バイナリにして mise の github backend で入れる | bun 本体の版から独立する | `mise use -g` が禁止で、機械全体に出す経路がない (AGENTS.md の mise 規則)。リリース作業が増える | 採らない |
| (d) B 種として dotfiles にソースを copy する | fresh clone で動く | A 種の道具を B 種で配るのは README の区別に反する。版が二つになる | 採らない |

(b) の未検証点は次の命令で確かめる。`bun add` で入れた依存の bin が `bun link` で出るかどうか
である。出ないときは、`mise run deps` に `bun install -g <git URL>#<tag>` を足し、その版を
`mise.toml` の一か所で宣言する。

`agx-usehooks` は利用側ライブラリなので別に扱う。これを使う利用側リポジトリと dotfiles の hook
(`agents/hooks/remind-reply-language.ts:9`) は、それぞれの `package.json` に git URL とタグで固定する。
hook は「依存なしで動く」規則 (root `package.json` の description) があるので、
`remind-reply-language.ts` が usehooks を使い続けるかは dotfiles の持ち主が決める (§9 R5)。

### 5.4 利用側リポジトリの契約の新しい置き場所

- 正本は agx リポジトリの `contract/` に置く。利用側の調整役が読むのはここだけにする (U1)。
- 利用側の `.agx.toml` とチケット置き場は今の場所のままにする (`scope.md:22-29` の規則を変えない)。
  `.agx.toml` に任意の `schema = 1` を足せるようにし、未知の版は `agx worker check` が exit 2 で拒む。
- dotfiles 自身は利用側の一つになる。今は `.agx.toml` がない (既定のチケット置き場を使う)。

## 6. スイートの加入条件と個別の判断

### 6.1 加入条件の文言

> agx スイートの部品は、ローカルのエージェントのセッションまたは実行を、操作するか観測する。
> 部品は自分の状態を一つだけ持つか、状態を持たない。部品同士はソースを import せず、
> 互いの CLI と `--json` 出力だけで組み合わせる。エージェントでない入力にもそのまま使える
> フィルタや、機械全体の資源・表示・検索を扱う道具は加えない。

### 6.2 `agx msg` と `agx status`

- **`agx msg` (いまの `xmsg`) — 加える。** 既存のセッションへメッセージを一度送る道具で、
  セッションの「操作」に当たる (`tools/xmsg/README.md:3-5`)。状態を持たず、shared の依存は
  `attempt`, `cli`, `zod` だけで (`tools/xmsg/src/inventory.ts:1`, `xmsg.ts:5`, `claude-receipt.ts:1`)、
  移しやすい。移行期は `xmsg` の bin を別名として残す。
  なお、xmsg の README 自身が、ハーネスの中では既存の経路 (Claude の `SendMessage`、`codex queue`、
  `herdr agent prompt`) を優先するよう書いている。`agx msg` は、それらがない shell からの経路として位置づける。
- **`agx status --json` — 加える。ただし新しい状態を持たない。** run (`agx worker ls --json`)、
  ws (`workspace-verdicts.json` の集計)、ticket (`agx ticket ls`)、doctor の件数をまとめるだけの fold
  にする。§3.3 の直接読み取りを全部これに置き換えることが目的である。statusline は描画が速くなければ
  ならないので、`agx status` は既存の発行ファイル (`current-runs.json` など) を読むだけにし、jj を呼ばない。
  性能の上限 (例: 50 ms) は S1 の受け入れ条件で決める。

### 6.3 jex の位置付け

jex は「質問の TOML と UTF-8 ファイル群 → yes/no の JSON と終了コード」のフィルタである
(`tools/jex/README.md:3-4`)。入力はエージェントの report に限らない。任意のファイルを分類できる。
コマンドを実行せず、記録も書かない。`agx worker judge --evidence` の入力として使えるが、
judge は evidence の中身を解釈しない (`tools/jex/README.md:64-68`)。

| 候補 | 加入条件との関係 | Jev クライアントの持ち主 | 判定 |
| --- | --- | --- | --- |
| (1) `agx <name>` にする | 満たさない。セッションも実行も扱わず、エージェントでない入力に使えるフィルタである | agx | 採らない |
| (2) 新リポジトリに同居させ、`jex` の名前のまま残す | スイートには入らない。同じリポジトリに置く非メンバーの bin とする | agx (`packages/core`)。jex はそれを import する | **推奨** |
| (3a) dotfiles に残し、Jev クライアントを copy する | 加入条件と整合する | 二か所 | 採らない。同じ transport を二度書いて食い違った過去がある (`tools/shared/src/jev-client.ts:3-4`) |
| (3b) jex と Jev クライアントで別の小さなリポジトリにする | 加入条件と整合する | 新リポジトリ。agx はそれに依存する | 今は採らない。187 行 (`jev-client.ts` 124 + `typesafe-key.ts` 63) のためにリポジトリと CI を一つ増やすことになる |

Jev クライアントの持ち主は agx が妥当である。主な利用者は router で
(`tools/agx-worker/src/next/route.ts:2`)、Jev の trace は run の記録に入る
(`jev-client.ts:10-19`)。正しさが一番問われるのは agx の側である。
(2) では、リポジトリの範囲が「スイート」より少し広くなる。そのことを README に
「同居する非メンバー: jex (Jev クライアントを共有するため)」と書く。
Jev クライアントに agx 以外の利用者がさらに一つ増えたら (3b) を考え直す。

## 7. 移行手順

各段の検証命令は、いまある mise task かテストを指す。S3 と S5 以降で新しくできるテストは「新規」と書く。
戻し方は、各段を 1 つの commit にして、`jj` で戻すことを前提にする (段ごとに land する)。

| 段 | 入力 | 出力 | 検証命令 | 戻し方 |
| --- | --- | --- | --- | --- |
| **S0a** land の状態を agx から出す | §3.6 | `scripts/land.ts` と `scripts/land-queue.ts` の状態を `$XDG_STATE_HOME/dotfiles/land/` に移す。`land.ts:348` の `landed` 追記をやめ、着地は jj の祖先関係から導く (architecture I2)。やめる前に、`landed` 行を読む箇所を `rr text '"landed"'` で全数確かめる | `bun test scripts/tests/land.test.ts`、`mise run gate:land` | commit を戻す。queue のファイルは元の場所へ `mv` |
| **S0b** 名前を直し、状態を移す | S0a。`agx worker ls` で running が 0。`agx-doctor.path` と `statusline-sampler.timer` を止める | §3.6 の表のとおり変数と `next` を改名する。旧い名前が設定されていたら exit 2。`agx-next` が残っていたら移行の命令を示して exit 2。データは同じファイルシステム上の rename 3 回で移す: `agx` → `agx.legacy-v1.tmp`、`agx-next` → `agx`、`agx.legacy-v1.tmp` → `agx/legacy-v1`。`agx worker stats --import-legacy` と usehooks の旧 ledger 読み取りは `legacy-v1/` を読む。`systemd/agx-doctor.path:5-6`、`render-home` の文言 (`scripts/tests/render-home.test.ts:287`)、`tools/agx-worker/contract.md:19-21` を更新 | `mise run test:agx`、`bun test tools/agx-ws tools/agx-ticket tools/agx-usehooks tools/statusline`、`mise run test:hooks`、`bun test scripts/tests/statusline-owners.test.ts scripts/tests/render-home.test.ts`、移行後に `agx worker ls --json` の件数が移行前と一致すること | rename を逆順に 3 回行い、commit を戻す |
| **S1** `agx status --json` を作る | §6.2 の仕様。`tools/statusline/src/agx-snapshot.ts` の読み取り内容 | `agx-worker` (または新しい `tools/agx-status/`) に `status --json` を追加。新しい状態ファイルは作らない | `mise run test:agx`、`bun test tools/statusline` | commit を戻す。statusline はまだ切り替えていないので影響なし |
| **S2** statusline と hook を `agx status --json` に切り替える | S1 | `tools/statusline/src/agx-snapshot.ts`, `dispatch-runs.ts`, `agents/claude/hooks/log-agx-snapshot.ts` が状態ディレクトリを直接読まなくなる。`workspace-policy.ts` を削除 | `bun test tools/statusline`、`mise run test:hooks`、`bun test scripts/tests/statusline-owners.test.ts` | commit を戻す (S1 は残してよい) |
| **S3** I12 の import 境界を直し、テストで固める | §3.2 C1〜C3 | roster (`agents/models/roster.ts`, `dispatch-roster.toml`) を `tools/agx-worker` 配下へ移す。`render-home.ts` は `agx worker roster --json` を読む。`temp.ts:15` は shared の zod を使う。codex worker の model floor 判定は hook に任せるか、agx 側の設定に移す (§9 R2)。import 境界テストを追加 (新規、architecture の spec-check-i12) | `mise run test:agx`、`bun test agents/models/tests`、`bun test scripts/tests/render-home.test.ts`、`mise run lint:config-map`、`mise run gate:land` | commit を戻す。roster の path が変わるので `mise run link:dots` を再実行する |
| **S4** shared を分ける | §3.1 の表 | `tools/shared/src` のうち agx へ移すものを `tools/agx-core/` に移す。dotfiles 側 (`scripts/land.ts:40`, `land-queue.ts:9`, `agx-doctor.ts`, `doctor.ts:66`) は CLI の `--json` を読む。`scripts/agx-doctor.ts` を `agx doctor` にする。汎用部品は両側の copy にする | `mise run test:agx`、`bun test tools/agx-ws tools/agx-ticket`、`bun test scripts/tests/land.test.ts scripts/tests/agx-doctor.test.ts scripts/tests/doctor.test.ts`、`mise run usehooks:consumers`、`mise run gate:land` | commit を戻す。データは触らないので状態の戻しは不要 |
| (判断点) | S1〜S4 の結果、§9 の条件 | 分離を続けるかを決める | — | 続けない場合はここで止める。S1〜S4 は単独で価値がある |
| **S5** 新リポジトリを作る | S4 後の `tools/agx*`, `tools/xmsg`, `tools/jex`, `tools/agx-core`, 文書, `bunfig` 相当 | `~/Workspace/agx` に §5.1 の構成で copy する。初回 commit に元の dotfiles revision を書く。agx 自身の `mise.toml` と CI | (新規) agx リポジトリで `mise run check`。dotfiles 側で `mise run test:agx` が同じ件数で通る (両方に同じコードがある期間) | 新リポジトリを使わないだけで済む。dotfiles は変わっていない |
| **S6** dotfiles を利用側に切り替える | S5 のタグ | root `package.json` に固定版を追加 (§5.3 b)。`bin` から `agx`, `agx-worker`, `agx-ws`, `agx-ticket`, `jex`, `xmsg` を外す。`systemd/agx-doctor.service:13` を `agx doctor` に替える | `mise run deps` 後に `agx -V`、`mise run doctor`、`bun test scripts/tests/render-home.test.ts scripts/tests/land.test.ts`、`mise run gate:land` | `package.json` を戻して `mise run deps`。ソースは S7 まで dotfiles に残っている |
| **S7** dotfiles からソースを消す | S6 の後で、次の三つを観測したこと (暦の日数ではなく、確かめた事実を条件にする): 固定版の agx を通して、dotfiles と agx を使う各利用側リポジトリで受け入れ済みの run が少なくとも 1 件ずつある / `agx worker doctor` が新しい finding を出さない / 戻す手順 (固定版を外して dotfiles のソースに戻す) を一度実際に通した | `tools/agx*`, `tools/xmsg`, `tools/jex` を削除。`mise.toml` の `test:agx`, `usehooks:consumers` を外す。`scripts/config-registry.ts:534-556,726-734,757-762,795-799` を更新。`tools/spec/architecture.md` の Suite 節を agx の文書への参照に替える | `mise run lint:config-map`、`mise run test`、`mise run gate:land`、`mise run doctor` | commit を戻す (S6 の固定版はそのまま動く) |
| **S8** 利用側の取り込みを切り替える | S5 のタグ | `agx-usehooks` を使う利用側リポジトリで、link をやめて git URL の固定版にする (`tools/agx-usehooks/consumers.toml` の link の宣言を消す) | その利用側で `bunx tsc --noEmit -p .` (いまの `usehooks:consumers` と同じ命令, `consumers.toml:8`) | その利用側の `package.json` を戻す |

S1〜S4 はそれぞれ dotfiles の 1 つの issue にできる。S5〜S8 は agx リポジトリに 2 つ
(S5、S8 の受け側)、dotfiles に 2 つ (S6、S7) の issue にできる。

## 8. 費用と危険

### 8.1 費用

- **移す行数:** src 16,903 行、tests 16,780 行以上 (§4)。
- **統合コード:** dotfiles 側は約 200〜250 行減る。agx 側は `agx status` と import 境界テストで約 200〜300 行増える (§4、見積もり)。
- **二重化するもの:**
  - CI と gate: agx リポジトリに `fmt:check`、`lint` (oxlint、oxfmt、rumdl)、`test`、`gate:land`、
    `lint:changesets` 相当、`commit` が要る。dotfiles の `presets/` (oxlint の方針) を B 種として copy する
    (`presets/consumers.toml` の仕組みに乗る)。
  - 汎用部品の copy 約 830 行 (§3.1)。食い違いは起きうるが、どれも小さく、契約ではない。
  - changeset と land の仕組み: dotfiles の `scripts/land.ts` (1,486 行) は agx リポジトリでは使えない。
    agx は `jj-commit` / `jj-push` (B 種) で足りるかを S5 で決める。
- **得るもの:** 契約の正本が一か所になる (U1)。agx の変更が dotfiles の gate を通らなくてよくなる (U2)。
  statusline が agx の内部の形の変更で壊れなくなる (U3)。

### 8.2 危険

| ID | 危険 | 対策 |
| --- | --- | --- |
| K1 | 切り替えの途中で、機械に agx が二つ入る (link と固定版) | S6 で `bin` を外すのと固定版の導入を同じ commit にする。`mise run doctor` で `which -a agx` を確かめる |
| K2 | 状態ディレクトリの形が版の間で食い違い、古い版の statusline が新しい records を読めない | S2 の後は statusline が CLI 出力だけを読むので、版は agx 一つに閉じる (SEP-2) |
| K3 | 動いている worker unit が、切り替えの途中で古いソースの path を参照する | `agx worker ls` で running が 0 のときに S6 と S7 を land する |
| K4 | roster の移動で `~/.claude/CLAUDE.md` の描画が壊れ、全セッションの指示が変わる | S3 の検証に `scripts/tests/render-home.test.ts` を入れ、`mise run link:dots` の前に差分を見る |
| K5 | `agx-usehooks` を使う利用側の hook が、固定版に切り替える前に dotfiles のソースを失う | S8 を S7 より前に終える |
| K6 | 二つのリポジトリで同じ設計の議論が二度起き、文書が食い違う | architecture の Suite 節と `scope.md` は agx 側だけに置き、dotfiles 側は参照だけにする |

## 9. 再判断の条件と未決事項

S5 (新リポジトリ) に進む条件は、次のどれかが起きたときとする。

- agx の変更が dotfiles の gate (agx と無関係な lint や test) で止められたことが、1 週間に 2 回以上ある。
- 利用側リポジトリの調整役が、契約を知るために dotfiles を読む必要があったと報告する (U1 の実害)。
- agx を公開すると決める。

S1〜S4 だけで止める場合も、§2.2 の SEP-1〜SEP-3 は dotfiles の中で成り立つ。

未決事項 (持ち主の判断が要るもの):

- **R1 (決定済み):** roster は、agx が出荷する目録と、利用者の方針 (`~/.config/agx/agx.toml`) に分ける ([agx-config.md](agx-config.md) §3.3、§3.4)。
- **R2 (決定済み):** codex の worker は `model-floor.toml` を読まない。agx にとっての下限は目録と方針で決まる ([agx-config.md](agx-config.md) §3.5)。
- **R3:** subscription usage (`subscription-usage.ts`, `codex-subscription-usage.ts`) を、agx が
  `agx status` で出すか、statusline と agx がそれぞれ読むか。
- **R4:** `agx-usehooks` の `launcherRunsToday` と `minutesSinceLastResult` は旧 ledger の
  `runs.jsonl` を読む (§3.5)。旧 ledger に worker の run が書かれなくなってからは、その値は worker の
  run を数えていない可能性が高い (未検証)。いまそのファイルに追記しているのは land の `landed` 行
  (§3.6) だけである。S0b で `legacy-v1/` へ向けるか、`records.jsonl` (`agx worker ls --json`) を
  読むように直すかを、`agx-usehooks` を使う利用側の持ち主が決める。
- **R5:** dotfiles の hook (`remind-reply-language.ts`) が、外部 package になった usehooks に依存してよいか。
- **R6:** §5.3 (b) で、依存 package の bin が `bun link` で PATH に出るか (未検証)。

## 10. なぜ agx なのか — 層ごとの整理

「実証」は `tools/agx-worker/docs/acpx-boundary.md` と
`tools/agx-worker/evidence/acpx-native-comparison-20261022.json` で実際に試したもの。
「文書」はこのリポジトリの文書や README だけから判断したもの。「未評価」はどの記録にも比較がないもの。
未評価の候補は、推測では却下しない。

| 層 | 使える既存ツール | agx の実装 (行) | OSS に任せられるか | 根拠の種類 |
| --- | --- | --- | --- | --- |
| セッションの通信 | acpx 0.20.0 + codex-acp 2.2.2 / claude-agent-acp 0.94.0。native の `codex exec` / `claude -p` | `workers/codex.ts` 811、`codex-progress.ts` 343、`run-claude.ts` 607、`claude-progress.ts` 157 (計 1,918。削除できる行数の上限であり、確かめた削除数ではない) | いまは任せられない。stock の組み合わせは capacity の契約 (overload → `capacity`/75) を 2 件とも満たさない。Codex は独自の proxy で直せるが、Claude は HTTP 529 と 500 を区別できない | **実証** (14 件中 12 件合格、2 件不合格: `acpx-boundary.md:47-60`) |
| 作業ツリーの隔離 | jj workspaces (agx ws の下で使用中)。git worktree。container-use、claude-squad | `tools/agx-ws` src 2,962 | jj 自体はすでに OSS に任せている。agx ws が足しているのは readiness、gc の安全分類、lock である。container-use と claude-squad で置き換えられるかは未評価 | jj: 実運用。container-use / claude-squad: **未評価** |
| 持続実行 | systemd (`systemd-run --user`) | dispatch の unit 起動部分。`src/dispatch.ts` 454 (ws の取得と unit の起動を含む) | すでに OSS (systemd) に任せている。agx は unit 名と環境の受け渡しだけを持つ (`scope.md:57`) | 実運用 (文書: `scope.md:57`) |
| 資源の割り当て | `agent-resource-run` (dotfiles、agx の外) | 0 (agx の外。`agent-resource-run` の src は 1,481) | agx の範囲ではない。cgroup / systemd の上に dotfiles が作っている | 文書 (`scope.md:58`, architecture I15) |
| モデル選択 | Jev (TypeSafe の外部サービス) + roster | `next/route.ts` 169、`selection.ts` 109、`next/usage.ts` 150、`next/capacity.ts` 33、`next/history.ts` 72、roster 303 | 選択の判断は Jev (外部) に任せている。roster と quota と cooldown の方針は agx が持つ。ほかの router (RouteLLM など) との比較は未評価 | Jev: 実運用。ほかの router: **未評価** |
| 記録と判定 | 比べたものはない (vibe-kanban などのタスクボードは未評価) | `next/store.ts` 909、`next/run.ts` 857、`next/verify.ts` 81、`next/outcome.ts` 85、`next/lease.ts` 89、`ticket.ts` 498、`premises.ts` 270、`next/preflight.ts` 343 | acpx は持たない (`acpx-boundary.md:27-31`)。vibe-kanban で置き換えられるかは未評価 | acpx について: **実証** (責任分界)。vibe-kanban: **未評価** |
| メッセージ | Claude `SendMessage`、`codex queue`、`herdr agent prompt` | `tools/xmsg` src 1,357 | ハーネスの中では既存の経路を使い、xmsg はその外 (shell) からの統一の宛先指定だけを持つ (`tools/xmsg/README.md:3-5`) | 文書 |
| 観測 | statusline (dotfiles)。claude-squad、vibe-kanban | `agx worker ls` / `doctor` / `wait` (`next/listing.ts` 42、`next/doctor.ts` 41、`next/wait.ts` 167)、新設の `agx status` | 描画は dotfiles に残す。fold は records の持ち主の agx がする。claude-squad と vibe-kanban で置き換えられるかは未評価 | 文書。claude-squad / vibe-kanban: **未評価** |

表から言えること:

- 実証で OSS に置き換えられないと分かっているのは「セッションの通信」だけで、それも版と契約を限った結論である
  (再判断の条件: `acpx-boundary.md:143-149`)。
- 「作業ツリーの隔離」「持続実行」は、すでに jj と systemd に任せている。agx が持つのは薄い方針だけである。
- 「記録と判定」「モデル選択の方針」は、比べた OSS がない。agx の行数の大半 (worker の約 4,000 行) はここにある。
  分離の価値もここにある。利用側リポジトリが頼っているのは、この記録と契約だからである。
- claude-squad、vibe-kanban、container-use、ほかの router は未評価である。評価するなら、
  acpx と同じく、受け入れ条件の表を先に作り、実際に動かして比べる。
