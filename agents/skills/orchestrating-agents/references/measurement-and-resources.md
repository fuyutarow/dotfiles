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

P7 is a feasibility gate, never a scientific-value gate. Before P7 may inspect an envelope, a
research job must carry a current Section-owned admission locator/digest, Goal/mandate/charter and
Grounding Packet digest/revision/fence, satisfied dependency locators, declared run scale, and—when the run is an
escalated confirmation, full sweep, scale study, or port—the prior measurement-valid receipt plus
Director release. Missing or stale scientific admission returns to `directing-research-sections`;
P7 must not repair it by allocating a device.

Free CPU, RAM, or GPU capacity never creates a candidate, authorizes an objective/axis change,
releases dominated work, or upgrades a minimal run to a sweep. Low utilization is diagnostic only.
Unused capacity is the correct outcome when no scientifically admissible job is ready. Likewise,
`RESOURCE-CLASS(NONCOMPUTE)` and a passing resource envelope grant no SEARCH/LEARN credit.

pilot、smoke、benchmark、test、本走、resident service のどれも「小さいから」を免除理由に
しない。数値を生む subprocess、並列test、長走行、resident serviceを発射する前に、入力寸法から
導いたmemory boundと一つの資源envelopeを凍結し、`agent-resource-run` の admission を通す。
目的値や捕捉率に届かないことを理由に上限を実行中に上げない。上限で打ち切られた値は結果であり、
OOMやswap stormは結果ではない。

各Agent / Task / Workflow `agent()` dispatchは、prompt内に次のどちらかを**ちょうど一つ**持つ。

```text
RESOURCE-CLASS(NONCOMPUTE): <数値実験・benchmark・resident service・parallel test・nested fanoutを含まない理由>
RESOURCE-ENVELOPE(/absolute/path/to/job.resource.json): agent-resource-run only
```

`NONCOMPUTE` は単なるread、設計、通常の局所編集、直列の軽い検査に限る。数値計算を「調査」と
呼び替えたり、pilotを「計器」と呼んだりして使わない。envelopeを宣言した腕は、その計算を
raw `julia` / `python` / test runnerで発射せず、指定pathを `agent-resource-run --manifest ... --`
へ渡す。dispatch hookの実装は `agents/{claude,codex}/hooks/`、実行の正本は
`agents/resource-control/agent-resource-run.ts` である。

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
  "walltime_seconds": 1800,
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

`gpu_status` は `compatible | incompatible | not-beneficial`。`compatible` では必要VRAMを必須にし、
空いていて必要headroomを持つGPUが一台でもあればCPU admissionを拒否する。`incompatible` は
device実装が無いこと、`not-beneficial` は転送・起動費を含むpilotでCPUが速いことを、rationaleと
measurement locusで示す。つまり **GPU-firstは「全算術をGPUへ移す」ではなく、最速の適合する
vendor primitive / fused array operation / libraryを先に選ぶこと** である。手書きkernelの可否は
`optimizing-julia-gpu-kernels` のGK0が所有する。
別途、model stepにGPU性能目標がある場合、その段ごとの実行場所と転送の検収は
同skillのGKRが所有する。P7のdevice選択だけではGKRを課さない。

### pilot前の算術上限

`memory_bound` は「測ってみる」ではなく、入力寸法から最大値を式で出す。最低限、保持する長ベクトル
または基底の本数、dtype、複製数、疎/密行列、workspace、process複製、20%以上の実装余白を含む。
探索で次数・rank・batch・worker数を増やす場合、その変数へhard capを置く。capなしで「目標に届くまで
増やす」は発射しない。pilotはこの算術上限より小さいことを確認した後にだけ費用・失敗様式・保存形式を
測る。本走はpilotのwall time/RSS/VRAM/process高水位から外挿したETAとstop thresholdを持つ。

### system reserve と機械的な停止

Linux実装は、同じuserの実行器が作った予約をaggregateし、互いに重ならないCPU affinityを割り当てる。
agent自身が次のsystem reserveを下げる欄はない。

| 資源 | admission reserve / rule |
|---|---|
| CPU | allowed logical CPUのうち最低1個を予約外に残す。`-t auto`、`-n auto`、`n_jobs=-1`は禁止。 |
| host RAM | `max(4 GiB, MemTotalの10%)`をsystem用に残し、live reservationを差し引く。 |
| scratch | 1 GiBを残し、live reservationを差し引く。 |
| NVIDIA GPU | 512 MiBを残す。同一GPUのlive reservationの宣言VRAMを**合算**し、`total − max(宣言合算, nvidia-smiのused) − 512 MiB ≥ 必要VRAM` を「空き」とする。utilization 20%の門は、そのGPUにlive reservationが一つも無いとき、すなわち負荷が管理外のときだけ適用する。同一GPU上のlive reservationは4本を上限とする。 |

実行器は `setsid` で新しいprocess groupを作り、user systemdの一時scopeへ
`CPUQuota=cpu_threads×100% / MemoryMax=host_ram_peak_bytes / MemorySwapMax=0 /
OOMPolicy=kill` を設定する。`TasksMax`はprocess数とCPU数からruntime thread余白を含む
coarseなkernel上限を算出し、別の200 ms monitorが宣言したexact process数を検査する。
`taskset` affinityと
`JULIA_NUM_THREADS / OMP_NUM_THREADS / OPENBLAS_NUM_THREADS / MKL_NUM_THREADS /
NUMEXPR_NUM_THREADS / RAYON_NUM_THREADS / POLARS_MAX_THREADS` をenvelopeのCPU数へ固定する。
monitorはgroup全体のRSSも測り、宣言上限またはwalltimeを越えたらgroupへTERM、猶予後に
KILLする。終了時はsystemd scopeもstopし、process groupを脱出した子孫を回収してから
予約を解放する。同じ `job_id` の二重起動も拒否する。user systemd managerまたは
必要なpropertyのprobeが失敗したらfail closedとし、monitor-onlyの直接実行へfallbackしない。

GPU予約は排他ではなく合算である（2026-08-06改定）。排他が正当なのは宣言VRAMが**どこでも強制されて
いない**ときだけで、その条件下では一台一本が唯一の安全な近似だった。実行器が予約VRAMをjobのruntimeへ
押し込むようになった以上、台帳の方が厳密に強い。宣言を守る腕は排他より多く通り、宣言を破る腕は排他でも
守られなかったからである。合算だけを入れて強制を入れない改変は、この理由により不可。

実行器はGPU予約に対し `CUDA_VISIBLE_DEVICES` に加えて
`JULIA_CUDA_HARD_MEMORY_LIMIT` / `JULIA_CUDA_SOFT_MEMORY_LIMIT` / `AGENT_RESOURCE_VRAM_BYTES`
を渡す。CUDA.jlは既定で「pool that uses all available device memory」を取るため、この変数が無い腕は
宣言と無関係に一台を飲み込む。

kernel hard limitはCPU、host memory、job swap、coarse task数に対するものである。VRAMとscratchは
admission/reservationでありkernel capではない。VRAMの上限は**runtime内の検査**であって
cgroup controllerではない。CUDA.jlは毎allocation前に確認するが、他のruntime（PyTorchは
in-processの `set_per_process_memory_fraction`）は `AGENT_RESOURCE_VRAM_BYTES` を自ら守る責任を負う。
WSL2では `nvidia-smi` がprocess別VRAMを返さないため、floorは遵守を実測で検収できない。
`TasksMax`はthreadも数えるため、宣言したexact process capの検収はsampled monitorが担う。
この強度の違いを隠さない。

### 発射と検収

```bash
agent-resource-run --manifest /absolute/path/job.resource.json --check-only
agent-resource-run --manifest /absolute/path/job.resource.json -- julia --project=. script.jl
```

発射表には
`job / dependency / envelope locus / device / CPU set / RAM / VRAM / process cap /
account / pilot cost / ETA / stop threshold` を置く。同じGPU、CPU set、host headroom、scratch、外部勘定を
競合する走行は直列化する。`ADMIT / DENY / BREACH / PASS` verdictと、pilot/本走の高水位を
measurement packetへ保存する。Linux floorでenforcementを用意できないplatformではfail closedとし、
unboundedな直接実行へfallbackしない。

runnerの終了前に、peak RSS/VRAM/process、実際の解放時刻、申告との差を永続receiptへ書く。
次の同型runのenvelopeは、この高水位に安全余白を足して校正する。申告過大で拒否が続く場合、
追加のticketを出す前に予約と同時枠のどちらが律速かを拒否理由で分ける。
実測値を理由に走行中のhard capを緩めず、新しい形のjobは別に上限を見積もる。
runnerが終了後の高水位を保存できない現行環境では、`RESOURCE_OBSERVABILITY_GAP`を記録し、
測っていない値を推定として明記する。receiptの実装はresource-controlの修理であり、
このskillの記述をもって実装済みと扱わない。

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
