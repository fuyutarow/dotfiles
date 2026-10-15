"""Start ccc on its standing GPU partition and wait instead of embedding on CPU.

Run under ccc's own interpreter (the unit names it). agent-resource-run reserves this
partition outside research reservations; its allocator cap bounds model and batch memory.
"""

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
    partition_has_room,
    prepare_partition,
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
guard = YieldGuard(
    state_directory(),
    Policy.from_environment(ccc_partition_mib, CONTEXT_ALLOWANCE // MiB),
)
prepare_partition(
    guard,
    lambda service: configure_partition(
        service, _free_bytes, apply, ccc_partition_mib, gpu_device
    ),
)
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
)

from cocoindex_code.cli import app

sys.argv = ["ccc", "run-daemon"]
sys.exit(app())
