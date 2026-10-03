"""Hard VRAM partition for a resident GPU service — the in-process half of the standing partitions
declared in resource-policy.toml (agent-resource-run subtracts the same numbers up front).

Owner ruling 2026-10-01: 「VRAM は ccc と分けて使うべきです。はじめから隔壁しておけよ」.

Call apply("<service>") BEFORE torch (or anything that imports it) is loaded. It reads
`gpu_partition_<service>_mib` and `gpu_partition_device` from the policy and then:
  - partition 0, or less than the partition free on the device right now → hides every GPU
    (CUDA_VISIBLE_DEVICES="") so the service runs on CPU instead of growing into job memory;
  - otherwise pins the service to that device and caps PyTorch's allocator at the partition minus
    CONTEXT_ALLOWANCE (the CUDA context and library workspaces live outside the allocator, so the
    process as a whole stays inside the partition).
A thread reports the allocator's peak to stderr whenever it rises, so the partition size can be
checked against reality (journalctl --user -u <unit>).

Used by cocoindex/ccc-daemon-launch.py (service "ccc") and agents/retrieval-control/
rerank_server.py (service "rerank"). Policy path: $AGENT_RESOURCE_POLICY or the file beside this one.
"""

import os
import shutil
import subprocess
import sys
import threading
import time
import tomllib
from pathlib import Path

MiB = 1024 * 1024
CONTEXT_ALLOWANCE = 512 * MiB
PEAK_REPORT_SECONDS = 300


def _policy() -> dict:
    path = os.environ.get("AGENT_RESOURCE_POLICY") or str(Path(__file__).resolve().with_name("resource-policy.toml"))
    with open(path, "rb") as f:
        return tomllib.load(f)


def _nvidia_smi() -> str | None:
    # On WSL the driver ships nvidia-smi in /usr/lib/wsl/lib, which a systemd user unit's PATH
    # does not include (measured 2026-10-01: the ccc daemon fell back to CPU on "0 MiB free").
    return shutil.which("nvidia-smi") or shutil.which("nvidia-smi", path="/usr/lib/wsl/lib")


def _free_bytes(device: int) -> int | None:
    smi = _nvidia_smi()
    if smi is None:
        return None
    try:
        out = subprocess.run(
            [smi, "-i", str(device), "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=15, check=True,
        ).stdout.strip()
        return int(out.splitlines()[0]) * MiB
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return None  # no GPU, no driver, or an unreadable answer: treated as "no room"


def _report_peak(service: str, torch) -> None:
    last = 0
    while True:
        time.sleep(PEAK_REPORT_SECONDS)
        peak = torch.cuda.max_memory_reserved(0)
        if peak > last:
            sys.stderr.write(f"gpu_partition[{service}]: allocator peak {peak / MiB:.0f} MiB\n")
            sys.stderr.flush()
            last = peak


def apply(service: str) -> str:
    policy = _policy()
    partition = int(policy[f"gpu_partition_{service}_mib"]) * MiB
    device = int(policy["gpu_partition_device"])
    free = _free_bytes(device) if partition > 0 else None
    if partition == 0 or free is None or free < partition:
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
        if partition == 0:
            why = "partition 0"
        elif free is None:
            why = "nvidia-smi unavailable or unreadable"
        else:
            why = f"{free / MiB:.0f} MiB free < {partition / MiB:.0f} MiB partition"
        sys.stderr.write(f"gpu_partition[{service}]: CPU ({why})\n")
        return "cpu"
    os.environ["CUDA_VISIBLE_DEVICES"] = str(device)
    import torch

    total = torch.cuda.get_device_properties(0).total_memory
    torch.cuda.set_per_process_memory_fraction((partition - CONTEXT_ALLOWANCE) / total, 0)
    sys.stderr.write(
        f"gpu_partition[{service}]: GPU {device}, partition {partition / MiB:.0f} MiB "
        f"(allocator cap {(partition - CONTEXT_ALLOWANCE) / MiB:.0f} MiB)\n"
    )
    threading.Thread(target=_report_peak, args=(service, torch), daemon=True).start()
    return "cuda"
