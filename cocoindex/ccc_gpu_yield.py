"""Cooperative CUDA batches sharing agent-resource-run's admission lock.

Models stay on CPU between batches. The lock spans CUDA setup, encode, synchronize,
and return to CPU; a reservation can never be admitted during a CUDA batch.
Utilization is a duty-cycle ceiling, not an instantaneous SM-utilization cap.
"""

import json
import logging
import os
import tempfile
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class GpuUnavailable(RuntimeError):
    """Partition setup chose CPU; release the admission lock before CPU encoding."""


def state_directory() -> Path:
    runtime = os.environ.get("XDG_RUNTIME_DIR", "")
    if runtime and Path(runtime).is_absolute():
        return Path(runtime) / "agent-resource-control"
    return Path(tempfile.gettempdir()) / f"agent-resource-control-{os.getuid()}"


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def reservation_reason(
    directory: Path, alive: Callable[[int], bool] = pid_alive
) -> str | None:
    """Called under .lock. Unknown/corrupt state yields conservatively, without deleting it."""
    try:
        # iterdir propagates permission/I/O errors; glob can silently suppress them.
        for path in directory.iterdir():
            if not path.name.endswith(".reservation.json"):
                continue
            value = json.loads(path.read_text())
            if not isinstance(value, dict) or value.get("schema") != 1:
                return "reservation state unreadable"
            pid = value.get("controller_pid")
            device = value.get("device")
            if (
                type(pid) is not int
                or not 0 < pid <= 2_147_483_647
                or not isinstance(device, dict)
            ):
                return "reservation state unreadable"
            if device.get("kind") not in ("gpu", "cpu"):
                return "reservation state unreadable"
            if device["kind"] == "gpu" and alive(pid):
                return "GPU reservation live"
    except (OSError, ValueError):
        return "reservation state unreadable"
    return None


@dataclass(frozen=True, slots=True)
class Policy:
    utilization_percent: int = 20
    window: str = "00:00-00:00"
    batch_size: int = 4

    def __post_init__(self) -> None:
        if not 0 <= self.utilization_percent <= 100 or not 1 <= self.batch_size <= 4:
            raise ValueError(
                "ccc GPU utilization must be 0..100; batch size must be 1..4"
            )
        self.window_minutes()

    @classmethod
    def from_environment(cls) -> "Policy":
        return cls(
            int(os.environ.get("CCC_GPU_UTILIZATION_PERCENT", "20")),
            os.environ.get("CCC_GPU_WINDOW", "00:00-00:00"),
            int(os.environ.get("CCC_GPU_BATCH_SIZE", "4")),
        )

    def window_minutes(self) -> tuple[int, int]:
        bounds = self.window.split("-")
        if len(bounds) != 2:
            raise ValueError("CCC_GPU_WINDOW must be HH:MM-HH:MM (host local time)")
        minutes = []
        for bound in bounds:
            parts = bound.split(":")
            if len(parts) != 2 or any(
                len(part) != 2 or not part.isdigit() for part in parts
            ):
                raise ValueError("CCC_GPU_WINDOW must be HH:MM-HH:MM")
            hour, minute = map(int, parts)
            if not 0 <= hour <= 23 or not 0 <= minute <= 59:
                raise ValueError("invalid CCC_GPU_WINDOW time")
            minutes.append(hour * 60 + minute)
        return minutes[0], minutes[1]

    def permits(self, minute: int) -> bool:
        start, end = self.window_minutes()
        if start == end:
            return True
        if start < end:
            return start <= minute < end
        return minute >= start or minute < end


class YieldGuard:
    def __init__(
        self, directory: Path, policy: Policy
    ) -> None:
        self.directory = directory
        self.policy = policy
        self.serial = threading.Lock()
        self.next_gpu_at = 0.0

    def status(self, reason: str | None) -> None:
        # One runtime writer, atomic rename; badges expire instead of treating old state as live.
        value = json.dumps(
            {
                "at": int(time.time() * 1000),
                "pid": os.getpid(),
                "deferring": reason is not None,
                "reason": reason,
            }
        )
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        target = self.directory / "ccc-gpu-status.json"
        temporary = target.with_suffix(f".{os.getpid()}.tmp")
        temporary.write_text(value)
        temporary.replace(target)

    def run[T](
        self,
        cpu: Callable[[], T],
        gpu: Callable[[], T],
        release_gpu: Callable[[], None],
        *,
        partition_setup: bool = False,
    ) -> T:
        """Never wait on an admission lock or clean another actor's stale state."""
        with self.serial:
            now = datetime.now().astimezone()
            reason = None
            if self.policy.utilization_percent == 0:
                reason = "GPU disabled"
            elif not partition_setup and not self.policy.permits(
                now.hour * 60 + now.minute
            ):
                reason = "outside GPU window"
            elif not partition_setup and time.monotonic() < self.next_gpu_at:
                reason = "GPU duty-cycle ceiling"
            acquired = []
            try:
                if reason is None:
                    directory = self.directory
                    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
                    lock = directory / ".lock"
                    try:
                        lock.mkdir(mode=0o700)
                    except FileExistsError:
                        reason = "reservation admission busy"
                    else:
                        acquired.append(lock)
                        (lock / "owner.json").write_text(
                            json.dumps({"pid": os.getpid()})
                        )
                        reason = reservation_reason(directory)
                if reason is not None:
                    self.status(reason)
                else:
                    self.status(None)
                    start = time.monotonic()
                    try:
                        result = gpu()
                    except GpuUnavailable:
                        self.status("GPU partition unavailable")
                    else:
                        return result
                    finally:
                        # Cleanup failure must not expose an unlocked, still-computing daemon.
                        try:
                            release_gpu()
                        except BaseException:
                            logger.exception(
                                "ccc GPU cleanup failed; exiting before admission lock release"
                            )
                            os._exit(1)
                        elapsed = time.monotonic() - start
                        if not partition_setup:
                            self.next_gpu_at = time.monotonic() + elapsed * (
                                100 / self.policy.utilization_percent - 1
                            )
            finally:
                for lock in reversed(acquired):
                    (lock / "owner.json").unlink(missing_ok=True)
                    lock.rmdir()
            # CPU embedding must not hold the lock and delay research admission/release.
            return cpu()


def prepare_partition(guard: YieldGuard, apply_partition: Callable[[str], str]) -> str:
    """Choose/cap CUDA before importing Torch, under the same reservation locks as batches.

    As in the original launcher, a CPU selection lasts for this daemon's lifetime.
    Every CUDA encode still rechecks reservations; residency alone is not GPU admission.
    """

    def cpu() -> str:
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
        return "cpu"

    # Context/allocator setup is not indexing: a daemon started outside the window
    # can still index on CUDA once that window opens. Reservations and GPU-disable
    # still block setup. Never pass partition_setup for an encode or model load.
    return guard.run(
        cpu, lambda: apply_partition("ccc"), lambda: None, partition_setup=True
    )


def install(guard: YieldGuard, apply_partition: Callable[[str], str]) -> None:
    """Adapt the installed CocoIndex embedder without editing its package or index identity."""
    from cocoindex.ops.sentence_transformers import SentenceTransformerEmbedder

    original_get_model = SentenceTransformerEmbedder._get_model
    initialized = False
    gpu_available = False

    def get_model(embedder):
        nonlocal initialized, gpu_available
        with guard.serial:
            # Preserve the configured device/memo identity while loading on CPU,
            # including dimension probes. Serialize model loading and encoding.
            configured_device = embedder._device
            embedder._device = "cpu"
            try:
                model = original_get_model(embedder)
            finally:
                embedder._device = configured_device
            if getattr(model, "_ccc_yield_installed", False):
                return model
            original_encode = model.encode

            def encode(texts, **kwargs):
                import numpy as np
                import torch

                def release():
                    if gpu_available:
                        torch.cuda.synchronize()
                        model.to("cpu")
                        torch.cuda.synchronize()
                        torch.cuda.empty_cache()

                def gpu(batch):
                    nonlocal initialized, gpu_available
                    if not initialized:
                        gpu_available = apply_partition("ccc") == "cuda"
                        initialized = True
                    if not gpu_available:
                        raise GpuUnavailable
                    return original_encode(batch, **(kwargs | {"device": "cuda:0"}))

                outputs = []
                for offset in range(0, len(texts), guard.policy.batch_size):
                    batch = texts[offset : offset + guard.policy.batch_size]
                    outputs.append(
                        guard.run(
                            lambda batch=batch: original_encode(
                                batch, **(kwargs | {"device": "cpu"})
                            ),
                            lambda batch=batch: gpu(batch),
                            release,
                        )
                    )
                return np.concatenate(outputs) if outputs else np.empty((0,))

            model.encode = encode
            model._ccc_yield_installed = True
        return model

    SentenceTransformerEmbedder._get_model = get_model
