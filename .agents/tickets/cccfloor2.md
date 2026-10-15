+++
schema = 2
name = "cccfloor2"
outcome = "ccc's standing GPU partition returns to 2048 MiB, because cccoom's elastic cap now grows ccc per batch into free VRAM minus live research reservations; research admission again reserves only 2048 MiB for ccc"
writes = ["tools/agent-resource-run/resource-policy.toml", "tools/agent-resource-run/tests/**", "cocoindex/test_gpu_yield.py", "tools/*/.changes/*.md"]
verify = ["bun test tools/agent-resource-run", "uv run --with pytest pytest cocoindex/test_gpu_yield.py", "mise run gate:land"]
timeout_s = 900
premises = ["file:tools/agent-resource-run/resource-policy.toml"]

[proposition]
id = "CCC-FLOOR-2G"
claim = "gpu_partition_ccc_mib = 2048 and the policy comment states that it is the floor of an elastic cap that grows from free VRAM minus research reservations"
refuted_by = "the policy or tests still pin 6144, or the comment still describes 6144 as a standing reservation"
+++

firedancer (2026-10-15 13:40) is restarting GPU research runs; with 6144 MiB standing for ccc, research admission gets
about 4 GiB, and ccc is idle when not indexing. cccoom (landing now) makes ccc's allocator cap elastic: per batch it is
free VRAM minus live reservations minus a safety margin, never below gpu_partition_ccc_mib.
Do: set gpu_partition_ccc_mib = 2048; rewrite the "Why these sizes" ccc paragraph: 2048 is the floor (fp16 weights
~597 MiB, 29-chunk bound at the floor per cccoom), the cap grows while VRAM is free (the 2026-10-15 firedancer re-index
needed more than the old fixed 1536 MiB cap), research reservations shrink it. Update tests pinning 6144. Patch
changeset for agent-resource-run, in the blank-line shape:
    ---
    bump: patch
    ---

    <one plain-text entry line>
Do not edit cocoindex/ccc_gpu_yield.py. Do not restart services. Do not commit or push.

## Current state (coordinator, 2026-10-15 14:55)
Run 5b105d7e correctly stopped: its workspace predated the elastic cap. cccoom's elastic cap is now on alpha
(e0cedf55). This workspace starts at that alpha; verify the elastic cap is present in cocoindex/ccc_gpu_yield.py, then
do the change above.
