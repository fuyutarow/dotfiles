+++
schema = 2
name = "cccgpu"
outcome = "ccc embeds on the GPU inside its own VRAM partition while research GPU reservations are live; when the GPU is momentarily unavailable it waits and never embeds on CPU; the model stays resident on the GPU between batches; batch size and duty ceiling are raised so that a full firedancer index (~37k code chunks once firedancer excludes its JSON data) completes"
writes = ["cocoindex/**", "tools/agent-resource-run/resource-policy.toml", "tools/agent-resource-run/src/**", "tools/agent-resource-run/tests/**", "tools/*/.changes/*.md", "README.md"]
verify = ["uv run --with pytest pytest cocoindex/test_gpu_yield.py", "mise run gate:land"]
timeout_s = 2400
premises = ["file:cocoindex/ccc_gpu_yield.py", "file:cocoindex/ccc-daemon.service.wsl", "file:tools/agent-resource-run/resource-policy.toml"]

[proposition]
id = "CCC-GPU-ONLY"
claim = "with a live research GPU reservation, ccc batches run on the GPU within gpu_partition_ccc_mib; with the GPU unavailable they wait; no code path embeds on CPU"
refuted_by = "a test with a live non-ccc reservation sends a batch to CPU, or any test observes a CPU embedding call"
+++

Owner's instruction, relayed by firedancer (2026-10-15): "ccc index は最優先でしょ" (the ccc index is top priority);
"ccc index で CPUを利用することはやめてください。終わりません" (stop using the CPU for the ccc index; it never finishes);
"ccc index が異常に時間かかるなら ccc configの誤りでしょ" (if it takes abnormally long, the ccc config is wrong).

Observed: `repo-retrieve index` on firedancer printed "NOTE: ccc GPU work deferred: GPU reservation live; waiting for
CPU indexing progress", then "FATAL: ccc index made no observable progress for 600000ms" (exit 124).
ccc-daemon.service is active with CPUQuota 900% and MemoryMax 6 GiB.

firedancer's reading. Verify each point before changing anything; do not take these as fact.
1. In cocoindex/ccc_gpu_yield.py (~43-69, 152-210), ANY live agent-resource-run GPU reservation makes it answer "GPU
   reservation live", so every batch goes to CPU, even though ccc has its own partition (gpu_partition_ccc_mib = 2048
   in resource-policy.toml).
2. release() (~259-264) moves the model CPU→GPU→CPU on every batch; CCC_GPU_BATCH_SIZE=4, capped at 4.
3. The duty ceiling is CCC_GPU_UTILIZATION_PERCENT=20 (ccc-daemon.service.wsl ~70-78).
Do:
- Admission: ccc's partition is reserved for ccc, so other reservations do not defer it. It defers only when free
  VRAM inside its partition is insufficient, and then it WAITS. Remove the CPU fallback path entirely; a missing GPU
  is a loud wait or error, never CPU.
- Keep the model resident on the GPU. Release it only on daemon stop or a real VRAM-pressure signal.
- Raise the batch size and duty ceiling to values justified by a measurement on this 12 GB GPU. Bound them by the
  partition; report the numbers.
- Tests in cocoindex/test_gpu_yield.py for each of the above.
- Measurement is NOT your job: the sandbox has no NVML and no user bus, and that is expected. Choose the batch size and
  duty ceiling from the partition bound (gpu_partition_ccc_mib) and the model's documented memory per item, make them
  overridable by env, and state the derivation. The coordinator measures on the live GPU after land and tunes the
  values. Tests must mock the GPU/NVML layer; none of them may need a real GPU.

## Current state (coordinator, 2026-10-15 12:30)
Review of run 28afb9e8: the GPU-only path is accepted in substance (no CPU embedding call; OOM evicts and waits;
model loads on CPU only to be moved to cuda:0 at encode; batch 8 / cap 10 / duty 100 derived from the partition).
One defect blocks land: version facts are edited by hand. Revert tools/agent-resource-run/CHANGELOG.md and
package.json to alpha, and replace .changes/1.4.2.md with tools/agent-resource-run/.changes/ccc-gpu-only.md in exactly
this shape (land applies the bump and writes CHANGELOG):
    ---
    bump: patch
    ---
    <one plain-text entry line, no leading "-" or "#">
Change nothing else. Re-run the verify commands.
