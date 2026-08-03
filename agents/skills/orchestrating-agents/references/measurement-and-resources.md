# Measurement and resources — 比較・交絡・再利用

> **Ownership — SOLE home**: `P7 DEVICE-BUDGET`、`P8 FOOTING`、
> `P9 CONFOUND-TABLE`、`P10 ARTIFACT-REUSE` の詳細手続き・schema・thresholdは
> このファイルだけが所有する。`SKILL.md` はprecedence要約とpointerを持てる。

**Read when**: 計算資源を割り当てるとき、費用未測定の本走を始める前、数値を比較するとき、
一変数の効果や機構の効果を主張するとき、既存の中間生成物を再利用または再構築するとき。

**Ledger pointer**: `tests/forge-verification-ledger.md` の
`§第2次ポストモーテム`、`§GB110`、`§長走行の消失`、
`§規則の不適用の反復`、`§数値の接合`、`§PoCの無効化`。
事例、数値、変更履歴は ledger が正本であり、ここには再実行可能な規則だけを置く。

測定の PASS は散文の印象でも腕の自己申告でもない。raw artifact、実行log、入力指紋、
独立な参照量との一致を一つの measurement packet として残す。

```yaml
measurement:
  claim_id: stable-id
  input_fingerprint: digest
  code_revision: revision
  command_or_call: exact-invocation
  environment: versions-and-resource
  conditions: all-comparison-axes
  raw_artifacts: [path-or-id]
  artifact_digests: [digest]
  tests: [independent-check-and-result]
  result: value-with-unit
```

schema validation とdigest再計算が共通の floor test である。意味上の合否は各gateの
`artifact/test` で別に判定する。

## P7 DEVICE-BUDGET — 資源と費用

### RESOURCE-ADMISSION BEFORE PILOT

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
| NVIDIA GPU | 512 MiBを残す。利用率20%以下、必要VRAMあり、同GPUのlive reservationなしを「空き」とする。GPU予約は排他的。 |

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

kernel hard limitはCPU、host memory、job swap、coarse task数に対するものである。VRAMとscratchは
admission/reservationでありkernel capではない。`TasksMax`はthreadも数えるため、宣言した
exact process capの検収はsampled monitorが担う。この強度の違いを隠さない。

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

## P8 FOOTING — 同じ土俵

数値は、比較を左右する全軸が一致したときだけ差として読む。最低限、次の軸を比較表へ置く。

| 軸 | 記録するもの |
|---|---|
| 入力 | データ、分割、前処理、入力版、input fingerprint |
| 実行体 | code revision、設定、依存版、実行コマンド |
| 確率性 | 乱数seed、sampling規則、反復回数 |
| 判定 | 指標、単位、しきい値、停止規則、多重比較の扱い |
| 資源 | 装置、並列度、精度、時間/使用量の上限 |
| 範囲 | 対象集合、除外、測定窓、欠測の扱い |

比較表の脚注に土俵を逐語で書く。一軸でも違えば、同条件で再測するか、条件差を主張文に含めて
因果比較を撤回する。artifact/test は全軸の差分表と、差分ゼロまたは再測記録である。

凍結した成功条件を持つ実験は、本走前に到達可能性を算術で検算する。有限標本で得られる
最小値としきい値、探索空間の上限と要求値、反復数と検出力など、構造上の上下限を先に比べる。
到達不能なら仕様と実装の不一致として発射を止める。artifact/test は計算式、代入値、判定、
独立な再計算である。

条件の違う数値を同じ表へ載せる場合、セルまたは脚注に異なる軸を明示する。異なる測定から
分子と分母を接合しない。測定されなかった量を、推定であるとの表示なしに数値へしない。

## P9 CONFOUND-TABLE — 交絡と対照

一変数を動かす前に、変数と同時に動く量を表へ出す。

| 操作変数 | 同時に動く量 | 結果への経路 | 固定方法 | 正規化/対照 | 残る限界 |
|---|---|---|---|---|---|
| named-variable | coupled-quantity | causal-path | hold-constant | control-arm | disclosed-limit |

交絡表を実験設計より先に保存し、各連動量について固定・層別・正規化・対応する対照のいずれかを
選ぶ。打ち消せない交絡は限界として主張文に載せる。artifact/test は、実行時設定を表へ逆写像し、
表にない連動量がないことを独立に再点検すること。

**機構が効果を生んだと主張する実験には、その機構を外した対照を同一の条件で置く。**
この対照は任意でない。データ、乱数、反復、しきい値、資源、評価を `P8` と同じ土俵に固定し、
対象機構だけを外す。artifact/test は比較表の「機構なし」行と、全条件の差分が対象機構だけで
あること。機構ありだけが自己検定を通っても、効果の証拠にはならない。

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

## 再現性と昇格

探索段階の数値を設計・報告・正本へ昇格させる前に、次を満たす。

1. exact invocation、入力、設定、環境、raw artifactが保存されている。
2. digestを独立に再計算できる。
3. 数値実行体に二つ以上の異なる自己検定があり、結果が保存されている。
4. 主張を偽にする独立oracleまたは再計算がある。
5. `P8` の土俵と `P9` の交絡/対照が記録されている。

artifact/test はmeasurement packetの再実行で同じ離散結果、または宣言した許容差内の数値を
得ること。再現不能な値は探索artifactに留め、完成・実証・確定の根拠へ昇格させない。
