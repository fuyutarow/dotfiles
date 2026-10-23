"""Start ccc within its fixed GPU partition, independently of research jobs."""

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
    state_directory,
)
from gpu_handoff import supervise
from gpu_partition import CONTEXT_ALLOWANCE, MiB, _free_bytes, apply

# Keep the patched adapter and partition checks in this process, including direct launcher use.
os.environ["COCOINDEX_RUN_GPU_IN_SUBPROCESS"] = "0"
with (DOTFILES / "tools" / "agent-resource-run" / "resource-policy.toml").open(
    "rb"
) as policy_file:
    resource_policy = tomllib.load(policy_file)
ccc_partition_mib = int(resource_policy["gpu_partition_ccc_mib"])
gpu_device = int(resource_policy["gpu_partition_device"])
runtime_directory = state_directory()
if "--gpu-worker" not in sys.argv:
    sys.exit(
        supervise(
            runtime_directory,
            [sys.executable, str(Path(__file__).resolve()), "--gpu-worker"],
        )
    )

guard = YieldGuard(
    runtime_directory,
    Policy.from_environment(ccc_partition_mib, CONTEXT_ALLOWANCE // MiB),
)
# Start serving even if capacity data is temporarily unavailable. Only an embedding
# batch waits for partition setup; apply() retains the fixed allocator/context cap.
install(
    guard,
    lambda service: configure_partition(
        service, _free_bytes, apply, ccc_partition_mib, gpu_device
    ),
)

from cocoindex_code.cli import app

sys.argv = ["ccc", "run-daemon"]
sys.exit(app())
