"""Start ccc under its fixed GPU reservation, independent of research jobs."""

import os
import sys
import tomllib
from pathlib import Path

DOTFILES = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DOTFILES / "tools" / "agent-resource-run"))

from ccc_gpu_only import (  # noqa: E402
    GpuAdmission,
    Policy,
    configure_partition,
    ignore_research_signal,
    install,
    state_directory,
)
from gpu_partition import _free_bytes, apply  # noqa: E402

os.environ["COCOINDEX_RUN_GPU_IN_SUBPROCESS"] = "0"
with (DOTFILES / "tools" / "agent-resource-run" / "resource-policy.toml").open(
    "rb"
) as policy_file:
    resource_policy = tomllib.load(policy_file)
ccc_partition_mib = int(resource_policy["gpu_partition_ccc_mib"])
gpu_device = int(resource_policy["gpu_partition_device"])
runtime_directory = state_directory()
admission = GpuAdmission(runtime_directory, Policy.from_environment())

partition_configured = False


def grant_ccc_partition(service: str) -> str:
    global partition_configured
    if partition_configured:
        return "cuda"
    result = configure_partition(
        service,
        _free_bytes,
        apply,
        ccc_partition_mib,
        gpu_device,
    )
    partition_configured = result == "cuda"
    return result


install(admission, grant_ccc_partition)
ignore_research_signal()

from cocoindex_code.cli import app  # noqa: E402

sys.argv = ["ccc", "run-daemon"]
sys.exit(app())
