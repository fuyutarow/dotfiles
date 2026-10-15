+++
schema = 2
name = "cccpart"
outcome = "ccc's standing GPU partition is 6144 MiB (allocator cap = partition minus the 512 MiB context allowance), so a full firedancer index fits on the 12 GiB GPU with the current fp32 model and batch 8; agent-resource-run's admission of research GPU jobs accounts for the larger partition"
writes = ["tools/agent-resource-run/resource-policy.toml", "tools/agent-resource-run/src/**", "tools/agent-resource-run/tests/**", "cocoindex/test_gpu_yield.py", "tools/*/.changes/*.md"]
verify = ["bun test tools/agent-resource-run", "uv run --with pytest pytest cocoindex/test_gpu_yield.py", "mise run gate:land"]
timeout_s = 900
premises = ["file:tools/agent-resource-run/resource-policy.toml", "rev:47f400ffaa0d"]

[proposition]
id = "CCC-PARTITION-6G"
claim = "with gpu_partition_ccc_mib = 6144, ccc's allocator cap is 5632 MiB and research admission reserves the remaining VRAM minus other partitions, with tests updated"
refuted_by = "a test or the policy still computes ccc's cap from 2048, or research admission can grant VRAM that overlaps the 6144 MiB partition"
+++

Owner's priority (relayed by firedancer, 2026-10-15): the ccc index must finish on the GPU. Live: the GPU is free
(nvidia-smi 1,539 of 12,288 MiB used, 0% util; only process is ccc-daemon); the firedancer re-index stalled at 13:07:53
with "ccc GPU batch still exceeds its partition after one pressure recovery" because the allocator cap is 1536 MiB
(gpu_partition_ccc_mib = 2048 minus 512 context) and the fp32 weights take ~1193 MiB.
Do: set gpu_partition_ccc_mib = 6144 and update the "Why these sizes" comment with the reason above (owner priority,
measured stall, fp32 ~1193 MiB). Make sure research admission in agent-resource-run subtracts it (show the line), and
update tests that pin 2048. Do not change cocoindex/ccc_gpu_yield.py (ticket cccoom is editing it; it will later make
the partition elastic). Add a patch changeset for agent-resource-run. Do not restart services. Do not commit or push.
