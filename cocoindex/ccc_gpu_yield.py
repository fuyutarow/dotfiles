"""Run every ccc embedding batch on its standing GPU partition.

The partition is reserved in agent-resource-run's ledger, so unrelated live reservations do
not block ccc. A transiently unavailable partition, window, or duty slot delays the batch;
there is deliberately no CPU embedding path. The model remains on CUDA between batches.
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

MODEL_WEIGHTS_MIB = 1193  # 1.25 GB safetensors checkpoint, rounded up to MiB.
CHUNK_WORKSPACE_MIB = 32  # Conservative budget per <=512-token ccc code chunk.
DEFAULT_PARTITION_MIB = 2048
DEFAULT_CONTEXT_ALLOWANCE_MIB = 512
MIB = 1024 * 1024


def state_directory() -> Path:
    runtime = os.environ.get("XDG_RUNTIME_DIR", "")
    if runtime and Path(runtime).is_absolute():
        return Path(runtime) / "agent-resource-control"
    return Path(tempfile.gettempdir()) / f"agent-resource-control-{os.getuid()}"


def batch_limit_for_partition(
    partition_mib: int,
    context_allowance_mib: int = DEFAULT_CONTEXT_ALLOWANCE_MIB,
) -> int:
    """Bound batches by model weights, CUDA context, and per-chunk workspace."""
    remaining_mib = partition_mib - context_allowance_mib - MODEL_WEIGHTS_MIB
    return max(0, remaining_mib // CHUNK_WORKSPACE_MIB)


def configure_partition(
    service: str,
    probe_free_bytes: Callable[[int], int | None],
    apply_partition: Callable[[str], str],
    partition_mib: int,
    device: int,
) -> str:
    """Apply the existing partition only after its full standing budget is available.

    The existing shared helper has a CPU mode for reranking. Preserve CUDA visibility and
    report "unavailable" to ccc if its probe races with another allocation.
    """
    if partition_mib <= 0:
        return "unavailable"
    free = probe_free_bytes(device)
    if free is None or free < partition_mib * MIB:
        return "unavailable"
    previous_visibility = os.environ.get("CUDA_VISIBLE_DEVICES")
    result = apply_partition(service)
    if result == "cuda":
        return result
    if previous_visibility is None:
        os.environ.pop("CUDA_VISIBLE_DEVICES", None)
    else:
        os.environ["CUDA_VISIBLE_DEVICES"] = previous_visibility
    return "unavailable"


def partition_has_room(
    probe_free_bytes: Callable[[int], int | None],
    partition_mib: int,
    device: int,
    context_allowance_mib: int = DEFAULT_CONTEXT_ALLOWANCE_MIB,
) -> bool:
    """Check the allocator share after the CUDA context has already been created."""
    if partition_mib <= context_allowance_mib:
        return False
    free = probe_free_bytes(device)
    return free is not None and free >= (partition_mib - context_allowance_mib) * MIB


@dataclass(frozen=True, slots=True)
class Policy:
    utilization_percent: int = 100
    window: str = "00:00-00:00"
    batch_size: int = 8
    max_batch_size: int = 10
    wait_seconds: float = 1.0

    def __post_init__(self) -> None:
        if not 0 <= self.utilization_percent <= 100:
            raise ValueError("ccc GPU utilization must be 0..100")
        if not 1 <= self.batch_size <= self.max_batch_size:
            raise ValueError(
                f"ccc GPU batch size must be 1..{self.max_batch_size} for this partition"
            )
        if self.wait_seconds <= 0:
            raise ValueError("ccc GPU wait interval must be positive")
        self.window_minutes()

    @classmethod
    def from_environment(
        cls,
        partition_mib: int = DEFAULT_PARTITION_MIB,
        context_allowance_mib: int = DEFAULT_CONTEXT_ALLOWANCE_MIB,
    ) -> "Policy":
        limit = batch_limit_for_partition(partition_mib, context_allowance_mib)
        if limit < 1:
            raise ValueError(
                "ccc GPU partition cannot fit model weights and one batch item"
            )
        return cls(
            int(os.environ.get("CCC_GPU_UTILIZATION_PERCENT", "100")),
            os.environ.get("CCC_GPU_WINDOW", "00:00-00:00"),
            int(os.environ.get("CCC_GPU_BATCH_SIZE", "8")),
            limit,
            float(os.environ.get("CCC_GPU_WAIT_SECONDS", "1")),
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
        self,
        directory: Path,
        policy: Policy,
        wait: Callable[[float], None] = time.sleep,
    ) -> None:
        self.directory = directory
        self.policy = policy
        self.wait = wait
        self.serial = threading.Lock()
        self.next_gpu_at = 0.0

    def status(self, reason: str | None) -> None:
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

    def _wait_reason(self) -> str | None:
        now = datetime.now().astimezone()
        if self.policy.utilization_percent == 0:
            return "GPU disabled; waiting for GPU-only indexing"
        if not self.policy.permits(now.hour * 60 + now.minute):
            return "outside GPU window; waiting"
        if time.monotonic() < self.next_gpu_at:
            return "GPU duty-cycle ceiling; waiting"
        return None

    def run[T](self, gpu: Callable[[], T]) -> T:
        """Serialize GPU calls and wait on every admission failure; never fall back to CPU."""
        with self.serial:
            while True:
                reason = self._wait_reason()
                if reason is not None:
                    self.status(reason)
                    self.wait(self.policy.wait_seconds)
                    continue
                self.status(None)
                start = time.monotonic()
                try:
                    result = gpu()
                except GpuUnavailable:
                    elapsed = time.monotonic() - start
                    self._record_duty(elapsed)
                    self.status("GPU partition unavailable; waiting")
                    self.wait(self.policy.wait_seconds)
                    continue
                self._record_duty(time.monotonic() - start)
                return result

    def _record_duty(self, elapsed: float) -> None:
        if self.policy.utilization_percent:
            self.next_gpu_at = time.monotonic() + elapsed * (
                100 / self.policy.utilization_percent - 1
            )


class GpuUnavailable(RuntimeError):
    """The ccc partition is temporarily unavailable; retry on GPU later."""


def prepare_partition(guard: YieldGuard, apply_partition: Callable[[str], str]) -> str:
    """Wait for the ccc partition before importing Torch or starting the daemon."""
    while True:
        result = apply_partition("ccc")
        if result == "cuda":
            return result
        if result != "unavailable":
            raise RuntimeError(
                f"ccc requires CUDA; partition setup returned {result!r}"
            )
        guard.status("GPU partition unavailable; waiting to start ccc")
        guard.wait(guard.policy.wait_seconds)


def install(guard: YieldGuard, apply_partition: Callable[[str], str]) -> None:
    """Adapt CocoIndex's embedder while preserving its configured memo identity."""
    from cocoindex.ops.sentence_transformers import SentenceTransformerEmbedder

    original_get_model = SentenceTransformerEmbedder._get_model

    def get_model(embedder):
        with guard.serial:
            configured_device = embedder._device
            embedder._device = "cpu"
            try:
                model = original_get_model(embedder)
            finally:
                embedder._device = configured_device
            if getattr(model, "_ccc_yield_installed", False):
                return model
            original_encode = model.encode
            partition_ready = False

            def encode(texts, **kwargs):
                import numpy as np
                import torch

                outputs = []
                for offset in range(0, len(texts), guard.policy.batch_size):
                    batch = texts[offset : offset + guard.policy.batch_size]
                    pressure_retries = 0

                    def gpu(batch=batch) -> object:
                        nonlocal partition_ready, pressure_retries
                        if not partition_ready:
                            if apply_partition("ccc") != "cuda":
                                raise GpuUnavailable
                            partition_ready = True
                        try:
                            return original_encode(
                                batch, **(kwargs | {"device": "cuda:0"})
                            )
                        except torch.cuda.OutOfMemoryError as error:
                            # CUDA OOM is the sole in-process signal that permits eviction.
                            model.to("cpu")
                            torch.cuda.synchronize()
                            torch.cuda.empty_cache()
                            partition_ready = False
                            pressure_retries += 1
                            if pressure_retries > 1:
                                raise RuntimeError(
                                    "ccc GPU batch still exceeds its partition after one "
                                    "pressure recovery; refusing CPU embedding"
                                ) from error
                            raise GpuUnavailable

                    outputs.append(guard.run(gpu))
                return np.concatenate(outputs) if outputs else np.empty((0,))

            model.encode = encode
            model._ccc_yield_installed = True
        return model

    SentenceTransformerEmbedder._get_model = get_model
