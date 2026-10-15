"""Start ccc on its elastic GPU partition and wait instead of embedding on CPU.

Run under ccc's own interpreter (the unit names it). agent-resource-run reserves this
standing partition outside research reservations; idle VRAM can be borrowed between live
research reservations, and the allocator cap is refreshed before every batch.
"""

import logging
import os
import sys
import tomllib
from pathlib import Path

DOTFILES = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DOTFILES / "tools" / "agent-resource-run"))

from ccc_gpu_yield import (
    Policy,
    YieldGuard,
    configure_partition,
    install,
    live_gpu_reservation_bytes,
    partition_has_room,
    prepare_partition,
    resize_allocator_cap,
    state_directory,
)
from gpu_partition import CONTEXT_ALLOWANCE, MiB, _free_bytes, apply

# Keep the patched adapter and partition checks in this process, including direct launcher use.
os.environ["COCOINDEX_RUN_GPU_IN_SUBPROCESS"] = "0"
with (DOTFILES / "tools" / "agent-resource-run" / "resource-policy.toml").open(
    "rb"
) as policy_file:
    resource_policy = tomllib.load(policy_file)
ccc_partition_mib = int(resource_policy["gpu_partition_ccc_mib"])
gpu_device = int(resource_policy["gpu_partition_device"])
gpu_safety_mib = int(resource_policy["gpu_safety_mib"])
runtime_directory = state_directory()
guard = YieldGuard(
    runtime_directory,
    Policy.from_environment(ccc_partition_mib, CONTEXT_ALLOWANCE // MiB),
)
prepare_partition(
    guard,
    lambda service: configure_partition(
        service, _free_bytes, apply, ccc_partition_mib, gpu_device
    ),
)

logger = logging.getLogger(__name__)
last_cap_bytes: int | None = None
capacity_blocked = False


def refresh_allocator_cap() -> bool:
    """Resize ccc's allocator from free VRAM and the live research reservation ledger."""
    import torch

    global capacity_blocked, last_cap_bytes
    reserved_bytes = live_gpu_reservation_bytes(runtime_directory, gpu_device)
    cap_bytes = resize_allocator_cap(
        torch,
        _free_bytes,
        reserved_bytes,
        gpu_device,
        ccc_partition_mib,
        gpu_safety_mib,
    )
    if cap_bytes is None:
        if not capacity_blocked:
            logger.warning(
                "ccc GPU headroom is below its %d MiB standing partition; waiting",
                ccc_partition_mib,
            )
        capacity_blocked = True
        return False

    if capacity_blocked or cap_bytes != last_cap_bytes:
        logger.info("ccc elastic GPU allocator cap: %.0f MiB", cap_bytes / MiB)
    capacity_blocked = False
    last_cap_bytes = cap_bytes
    return True


install(
    guard,
    lambda _service: (
        "cuda"
        if partition_has_room(
            _free_bytes,
            ccc_partition_mib,
            gpu_device,
            CONTEXT_ALLOWANCE // MiB,
        )
        else "unavailable"
    ),
    refresh_allocator=refresh_allocator_cap,
)

from cocoindex_code.cli import app

sys.argv = ["ccc", "run-daemon"]
sys.exit(app())
