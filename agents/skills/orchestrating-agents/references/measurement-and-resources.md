# Resources and reuse — admission and intermediate artifacts

> **Ownership — SOLE home**: `P7 DEVICE-BUDGET` と `P10 ARTIFACT-REUSE` の詳細手続きは
> このファイルだけが所有する。`SKILL.md` はprecedence要約とpointerを持てる。

**Read when**: 計算資源を割り当てるとき、費用未測定の本走を始める前、既存の中間生成物を
再利用または再構築するとき。数値比較と交絡の意味判断は`validating-experimental-evidence`。

**Ledger pointer**: `tests/forge-verification-ledger.md` の
`§第2次ポストモーテム`、`§GB110`、`§長走行の消失`、
`§規則の不適用の反復`、`§数値の接合`、`§PoCの無効化`。
事例、数値、変更履歴は ledger が正本であり、ここには再実行可能な規則だけを置く。

数値claimの検収は`validating-experimental-evidence`の意味判定を正本findingで使う。
ここに残るresource receiptやP10 manifestを科学的な結果のPASSと数えない。

## P7 DEVICE-BUDGET — 資源と費用

### RESOURCE-ADMISSION BEFORE PILOT

P7 is a feasibility gate, never a scientific-value gate. Under a formal section mandate, a
research job carries a current Section-owned admission locator/digest, Goal/mandate/charter and
Grounding Packet digest/revision/fence, satisfied dependency locators, declared run scale, and—when the run is an
escalated confirmation, full sweep, scale study, or port—the prior measurement-valid receipt plus
Director release. Missing or stale scientific admission returns to `directing-research-sections`;
P7 must not repair it by allocating a device.
Outside that profile, use the authorized task's current question, budget and dependency records; do not create a section.

Free CPU, RAM, or GPU capacity never creates a candidate, authorizes an objective/axis change,
releases dominated work, or upgrades a minimal run to a sweep. Low utilization is diagnostic only.
Unused capacity is the correct outcome when no scientifically admissible job is ready. Likewise,
`RESOURCE-CLASS(NONCOMPUTE)` and a passing resource envelope grant no SEARCH/LEARN credit.

Within the authorized work set, use `driving-bibifi-cycles`' work-selection loop for both spare capacity and contention.
Return the binding resource constraint per proposed slice, not a blanket “GPU busy” or “integration waiting” verdict.
Reserve headroom for priority work and check CPU, host RAM, VRAM, device compute and shared-state contention together.
If no job is ready, return the actual constraint so the driver can split, reuse or repair work.
Do not invent capacity or accept an empty ready queue as proof that no useful work exists.
The six-minute planning/report window does not replace a job's admitted stop conditions or finite worker lifetime.

BIBIFI内の数値runは、同じ有効上限を実行器へ渡す。公式測定・確認・GPU test・profilingも含む。
BIBIFIの上限と例外は`driving-bibifi-cycles`が所有する。他の仕事はそのdomain/user上限を使う。
分類名は例外の根拠にならない。
発射前に有効なwalltimeと停止経路を確認し、job idと実行器のreceiptへ結び付ける。
promptの期限、agentの寿命、queueの期限はprocessの強制停止を代替しない。
下のwalltime値は例示であり、各jobでは現在のdomain/user上限以下に設定する。
発射前に既存ticketで仕事の実体、予算の出典、明示例外の有無を照合する。
その有効上限、envelope walltime、queue deadlineの値も照合する。
envelopeのwalltimeが上位の上限を超えたら、resource admissionへ進めず設計を差し戻す。
ETAが収まらないこと、予約が空いたこと、上限内で終わらなかったことは上限変更の根拠にならない。
同じ実験の再試行・再開も残予算を引き継ぐ。run idの変更で予算を更新しない。
実行器が申告walltimeしか検査しない環境では、上位予算との照合を機械的に強制したとは報告しない。
その制約を記録し、照合済みの短いenvelopeだけを発射する。照合や停止経路を確認できなければ発射しない。
停止猶予はcleanup専用であり、その間の追加計算を予算内の結果として数えない。
超過を観測したら、同じ停止設定を使う次の発射より先に停止経路を修復する。
raw結果は保持し、運転違反と科学的妥当性を分ける。無関係な正常jobまで一律に止めない。
大きなsuiteを流す前に変更testsetと必要な依存・負例へ絞る。広い検査には別の有用性と有限予算が要る。

pilot、smoke、benchmark、test、本走、resident service のどれも「小さいから」を免除理由に
しない。数値を生む subprocess、並列test、長走行、resident serviceを発射する前に、入力寸法から
導いたmemory boundと一つの資源envelopeを凍結し、`agent-resource-run` の admission を通す。
目的値や捕捉率に届かないことを理由に上限を実行中に上げない。上限で打ち切られた値は結果であり、
OOMやswap stormは結果ではない。

各Agent / Task dispatchは、prompt内に次のどちらかを**ちょうど一つ**持つ。

```text
RESOURCE-CLASS(NONCOMPUTE): <数値実験・benchmark・resident service・parallel test・nested fanoutを含まない理由>
RESOURCE-ENVELOPE(/absolute/path/to/job.resource.json): agent-resource-run only
```

`NONCOMPUTE` は単なるread、設計、通常の局所編集、直列の軽い検査に限る。数値計算を「調査」と
呼び替えたり、pilotを「計器」と呼んだりして使わない。envelopeを宣言した腕は、その計算を
raw `julia` / `python` / test runnerで発射せず、指定pathを `agent-resource-run --manifest ... --`
へ渡す。dispatch hookの実装は `agents/{claude,codex}/hooks/`、実行の正本は
`tools/agent-resource-run/src/agent-resource-run.ts` である。

### Julia compile admission

Julia package compilation uses the host-wide `julia-compile` slot pool. A manifest that may
precompile packages declares `"compile_slots": ["julia-compile"]`; a direct Julia command uses
`agent-resource-run --manifest <envelope> --slot julia-compile -- julia …`. The host declaration
is `~/.config/agent-resource/slots.toml` (`schema = 1`, `julia_compile = <positive count>`); absent
that file, capacity is `max(1, floor(available host CPUs / 6))`. Slots are flock files under `$XDG_RUNTIME_DIR/agent-resource/slots/julia-compile.<n>`.
`flock -w min(900, walltime_seconds)` bounds each acquisition; timeout exits 75.
The kernel releases a lock when its last descriptor closes; FIFO ordering is not promised.

All Julia workers on one host use the same canonical project path and `JULIA_DEPOT_PATH`, including
test runs launched from separate jj workspaces. This shares precompile caches and avoids repeating
package compilation just because a worker has a different checkout path. Do not place worker-local
workspace paths in the depot or project selection when the test targets are identical.

### 資源envelope schema

次のJSONを全欄必須とする。`child_fanout` は現在 `0` だけを受理する。nested agentは親の見込みに
埋め込まず、別dispatchと別envelopeで予約する。上限不明のvendor-side fanoutは、このhostでは
admission不能である。

```json
{
  "schema": 1,
  "job_id": "stable-unique-id",
  "run_class": "pilot",
  "cpu_threads": 2,
  "processes": 4,
  "host_ram_peak_bytes": 2147483648,
  "memory_bound": "2 retained bases × k × R × sizeof(T) + sparse matrix + 20% margin; k <= 120",
  "device": {
    "kind": "gpu",
    "gpu_id": 0,
    "vram_peak_bytes": 4294967296
  },
  "scratch_bytes": 1073741824,
  "child_fanout": 0,
  "walltime_seconds": 120,
  "cleanup": { "mode": "term-then-kill", "grace_seconds": 10 }
}
```

`run_class` は `pilot | full | test | service`。CPUを選ぶ場合の `device` は次の形にする。

```json
{
  "kind": "cpu",
  "gpu_status": "compatible",
  "gpu_vram_peak_bytes": 4294967296,
  "rationale": "GPUに必要VRAMの空きがない場合だけCPUへfallbackする"
}
```

`gpu_status` は `compatible | incompatible | not-beneficial`。`compatible` では必要VRAMを必須にする。
これらは呼出側がdevice選択の理由を記録する互換schemaである。実行器はGPU性能や空きVRAMを判定しない。
GPU primitiveと実行場所の判断は `optimizing-julia-gpu-kernels` が所有する。

### pilot前の算術上限

`memory_bound` は「測ってみる」ではなく、入力寸法から最大値を式で出す。最低限、保持する長ベクトル
または基底の本数、dtype、複製数、疎/密行列、workspace、process複製、20%以上の実装余白を含む。
探索で次数・rank・batch・worker数を増やす場合、その変数へhard capを置く。capなしで「目標に届くまで
増やす」は発射しない。pilotはこの算術上限より小さいことを確認した後にだけ費用・失敗様式・保存形式を
測る。本走はpilotのwall time/RSS/VRAM/process高水位から外挿したETAとstop thresholdを持つ。

### flock と systemd による実行

Linux実行器はGPU slotの排他と、全jobのRAM ceilingを担う。
GPU slotは `$XDG_RUNTIME_DIR/agent-resource/slots/gpu.<n>`（0始まり）であり、
本数は `resource-policy.toml` の `gpu_max_concurrent_jobs` で決める。
空いているslotを候補にし、競合時はflock自身が待つ。各待機は
`flock -w min(900, walltime_seconds)` によって有限とし、timeoutはexit 75である。
独自FIFO、CPU集合の予約、RAM/VRAM/scratchの合算台帳は持たない。
同じjob_idの同時実行は別のflockで拒否する（DENY 69）。

コマンドは `systemd-run --user --scope --collect` により毎回固有のscopeで実行する。
次のpropertyを設定する。

| property | manifestからの値 |
|---|---|
| MemoryMax / MemoryHigh | host_ram_peak_bytes（両方とも同じ値） |
| MemorySwapMax | 0 |
| CPUQuota | cpu_threads × 100% |
| TasksMax | min(65535, max(32, processes × (cpu_threads + 16))) |
| RuntimeMaxSec | walltime_seconds |
| OOMPolicy | kill |
| TimeoutStopSec | cleanup.grace_seconds |

scope内で実効memory.max、memory.high、memory.swap.maxとpids.peakの可読性を確認してから
コマンドを起動する。ceilingを確認できなければDENY 69とし、直接実行にはfallbackしない。
OOMとwalltimeの停止はsystemd/kernelが行い、子の終了コードをそのまま返す。
独自monitor、process-group killer、RAM peakファイルへの永続化はない。
`TasksMax` はthreadも数えるcoarseな上限であり、exact process数の監視はしない。
終了時はscope全体の停止を待ってからslotを解放する。

GPU固有の拒否は `~/.local/state/gpu-owner.json`（`XDG_STATE_HOME`対応）に
`unresponsiveSince` が記録されている場合だけである。DENY行は記録のpath、stallEvidence、
GPUを保持するPIDとそのcommandを示す。欠落・古いsample・utilization・VRAM量では拒否しない。
`status` はflockのslot holderとGPU owner stateを読み出す。

### 発射とconsumer互換

`--manifest <json>`、`--check-only`、`--job-id`、`--slot julia-compile`、`status` を保つ。
manifestは上記schema 1のままである。`compile_slots: ["julia-compile"]` も引き続き受け付ける。

```bash
agent-resource-run --manifest /absolute/path/job.resource.json --check-only
agent-resource-run --manifest /absolute/path/job.resource.json --job-id unique-run -- command args
```

予約をgrantできない場合はDENY 69、fresh recovery HOLDは70、flock timeoutは75。
usage errorは2（Cleyeのunknown flagは1）、実行したcommandの終了コードはそのまま返す。
ADMIT / RELEASE / PASSの行は呼出側のtiming collector向けに維持する。

子には `AGENT_RESOURCE_ADMISSION_RECEIPT` とそのSHA-256、`AGENT_RESOURCE_ENFORCEMENT=cgroup`、
`AGENT_RESOURCE_CPU_IDS`、`AGENT_RESOURCE_MAX_PROCESSES`、`AGENT_RESOURCE_HOST_RAM_BYTES`、
`AGENT_RESOURCE_SCRATCH_BYTES` を渡す。CPU_IDSは互換の論理CPUリストであり、排他的予約ではない。
thread環境変数はcpu_threadsに固定する。GPU jobはCUDA_VISIBLE_DEVICESでdeviceを選ぶ。
VRAM budget環境変数はcaller互換のため維持する（AGENT_RESOURCE_VRAM_BYTES、JULIA_CUDA_HARD_MEMORY_LIMIT、JULIA_CUDA_SOFT_MEMORY_LIMIT）。VRAM合算・監視とRAM peak永続化は廃止した。
receiptを継承した子からのnested予約はDENY 69。既存receiptを検証して再利用する呼出側はそのまま動く。
`/sys/fs/cgroup<own cgroup>/pids.peak` は各run固有のscopeにあり、他runの高水位を混ぜない。

## Retired P8/P9 — one semantic home

P8 FOOTINGとP9 CONFOUND-TABLEの番号は予約し、ここでは定義しない。両規則の詳細は
`validating-experimental-evidence`のEV0–EV4へ移した。旧pointerから入った実行者は
同skillを読み、ここから比較や因果の合否を再構築しない。

## P10 ARTIFACT-REUSE — 保存・指紋・失効

分単位以上かかる中間生成物は最初の生成時に保存し、同じ作業系列では再構築しない。
保存物には次のmanifestを添える。

```yaml
artifact:
  locus: path-or-id
  digest: content-digest
  created_at: date-time
  input_fingerprint: input-version-and-digest
  code_revision: revision
  command_or_call: exact-invocation
  environment: relevant-versions
  specification: spec-id-or-digest
  self_tests: [test-and-result]
  consumers: [job-or-deliverable]
```

再利用前にmanifestと現在の入力・仕様・実行体を照合する。fingerprintが一致し、必要なself-testが
通る場合だけ再利用する。入力更新、仕様変更、実行体の意味変更、digest不一致のいずれかで失効する。
artifact/test は照合結果と、再利用側が保存先とdigestを名指ししていることである。

再構築時は、`data update / specification change / implementation change / corrupted artifact`
のいずれかを一行で申告する。理由のない再構築はしない。同じ委任一巡で再利用できる保存物を
作り直した場合は FAIL とする。

途中artifactもchunk単位でdigestと指紋を持たせる。長走行の保存・再開契約は
`delegation-contracts.md` の `C2` が SOLE owner、指紋と失効判定はここが SOLE owner である。
両者は内容を重複させず、保存時に同じmanifestを参照する。

## 数値claimの昇格はここで判定しない

保存物の再利用と、実験結果を知識へ昇格させることは別の遷移である。
後者の再現性、土俵、対照、漏れ、claim scopeは
`validating-experimental-evidence`のEV0–EV4が唯一の判断元である。
本skillのP10 manifestだけで数値claimを昇格させない。
