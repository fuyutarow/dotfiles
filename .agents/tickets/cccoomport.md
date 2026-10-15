+++
schema = 2
name = "cccoomport"
outcome = "a full firedancer index completes on the GPU inside ccc's partition: a batch that hits CUDA OOM is split (halving down to one chunk) instead of failing, the model is held in half precision so weights leave room for batches, and a chunk that cannot fit even alone is truncated to the model's max sequence length and logged, never embedded on CPU and never left as a silent stall"
writes = ["cocoindex/**", "tools/*/.changes/*.md"]
verify = ["uv run --with pytest pytest cocoindex/test_gpu_yield.py", "mise run gate:land"]
timeout_s = 2400
premises = ["file:cocoindex/ccc_gpu_yield.py", "rev:47f400ffaa0d"]

[proposition]
id = "CCC-GPU-NO-STALL"
claim = "under a partition too small for the configured batch, indexing still completes on the GPU by splitting batches; no CPU embedding call occurs; a failure is surfaced to the client instead of a stalled index"
refuted_by = "a test where a batch of N OOMs at N but fits at N/2 raises instead of completing, or any test observes a CPU embedding, or a permanent failure leaves the index 'in progress' without an error the client sees"
+++

Live result after landing 47f400ff and restarting ccc-daemon (coordinator, 2026-10-15):
- Daemon log at start: `gpu_partition[ccc]: GPU 0, partition 2048 MiB (allocator cap 1536 MiB)`; at 13:07:40
  `gpu_partition[ccc]: allocator peak 954 MiB`; at 13:07:53:
      File "/home/fuyu/dotfiles/cocoindex/ccc_gpu_yield.py", line 280, in gpu
      RuntimeError: ccc GPU batch still exceeds its partition after one pressure recovery; refusing CPU embedding
- firedancer `ccc status` since then, unchanged for >2 min: "Indexing in progress: 1527 files listed | 254 added,
  0 deleted, 21 reprocessed, 1122 unchanged, error: 2", Chunks 170291. Daemon CPU (from /proc) 97-196% of one core
  during that stall; ccc-gpu-status.json says deferring=false. What the daemon does after the RuntimeError is unknown.
- The GPU-only guarantee held (it refused CPU). The budget did not: the 1536 MiB cap holds fp32 weights (~1193 MiB)
  plus batches of up to 8 chunks; firedancer has long JSON/TOML/Julia chunks.
Do:
1. On CUDA OOM, split the batch (halve, recursively, down to 1) and continue; only a single chunk that OOMs alone is a
   per-chunk failure: truncate it to the model's max_seq_length (verify that sentence-transformers' truncation is in
   effect; if inputs exceed it, that is the bug) and retry once; if it still fails, record an error for that file
   and continue the index. Never CPU.
2. Load the model in fp16 (or bf16 if supported on this RTX 3060) on CUDA; check that embeddings stay within a stated
   tolerance of fp32 on a fixed sample (cosine >= 0.999) in a test that runs only when CUDA exists, plus a mocked test.
3. Find out (from code and logs, read-only on the live daemon) what consumes ~100-200% CPU after the RuntimeError and
   whether the index can ever finish in that state; make a fatal batch error reach the indexing client as an error.
4. Recompute the batch limit with fp16 weights and state it.
5. Elastic partition (owner priority: the index must finish on the GPU; ~10.7 GiB VRAM sat idle during the stall):
   size ccc's allocator cap at batch time from free VRAM minus live research reservations in agent-resource-run's
   ledger, never below gpu_partition_ccc_mib and never above free VRAM minus a safety margin; shrink back when a
   research reservation appears. Ticket cccpart is raising the standing partition to 6144 MiB in
   resource-policy.toml in parallel; do not edit that file; read the value from it.
Tests mock CUDA OOM at given batch sizes and mock free VRAM / ledger states. Do not restart the live daemon; the coordinator does after land. Do not
commit or push.

## Current state (coordinator, 2026-10-15 14:30) — port onto current alpha
The accepted change lives in /home/fuyu/dotfiles-ws-cccoom (read it there; do not write it). Landing it failed at
rebase: conflicts in cocoindex/test_gpu_yield.py and tools/agent-resource-run/resource-policy.toml, because alpha moved (cccpart 3a51ac46, skillsbare fbd80d97, agxroute 015ffb9e).
This fresh workspace starts at current alpha. Re-apply the same change here: read `jj diff -r @` in the old
workspace (or diff its files against alpha), reproduce it on top of alpha, and merge by meaning in the conflicting
files (keep alpha's newer content, e.g. gpu_partition_ccc_mib and its comment from alpha). No hand-edited CHANGELOG or
package.json versions; changesets in the blank-line shape. Re-run verify. Do not run jj rebase (the shared store is
read-only to you). Do not commit or push.
