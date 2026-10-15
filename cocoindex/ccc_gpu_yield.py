"""Run every ccc embedding batch on an elastic, GPU-only allocator partition.

The standing partition is the floor; ccc borrows currently free VRAM and shrinks its allocator
cap when live research reservations appear. A transiently unavailable partition, window, duty
slot, or headroom budget delays the batch; there is deliberately no CPU embedding path. The model
remains on CUDA between batches.
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

MODEL_WEIGHTS_MIB = 597  # fp16 resident weights: half of the 1.25 GB checkpoint.
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


def live_gpu_reservation_bytes(directory: Path, device: int) -> int | None:
    """Read live agent-resource-run GPU reservations for one physical device.

    Return None when a ledger entry cannot be trusted, so callers can retain only the
    standing partition instead of expanding the ccc allocator cap on incomplete data.
    Stale records are ignored but left for the ledger owner to clean up.
    """
    try:
        entries = tuple(directory.glob("*.reservation.json"))
    except OSError:
        return None

    reserved_bytes = 0
    for entry in entries:
        try:
            record = json.loads(entry.read_text())
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(record, dict):
            return None
        if record.get("schema") != 1:
            return None
        pid = record.get("controller_pid")
        gpu = record.get("device")
        if type(pid) is not int or pid < 1 or not isinstance(gpu, dict):
            return None
        if gpu.get("kind") != "gpu" or gpu.get("gpu_id") != device:
            continue
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            continue
        except PermissionError:
            pass
        except OverflowError:
            return None
        except OSError:
            return None
        vram_peak_bytes = gpu.get("vram_peak_bytes")
        if type(vram_peak_bytes) is not int or vram_peak_bytes < 0:
            return None
        reserved_bytes += vram_peak_bytes
    return reserved_bytes


def elastic_allocator_cap_bytes(
    free_bytes: int | None,
    live_reserved_bytes: int | None,
    allocator_reserved_bytes: int,
    standing_partition_mib: int,
    safety_margin_mib: int,
) -> int | None:
    """Return a safe allocator cap or None when even the standing floor is unavailable.

    ``free_bytes + allocator_reserved_bytes`` is the ccc process's current allocation plus
    device headroom. Live reservations and the configured device safety margin are removed
    before expanding above the standing partition. Unknown ledger data falls back to the
    standing floor only; unknown device headroom denies the batch.
    """
    floor = standing_partition_mib * MIB
    if free_bytes is None or free_bytes < 0 or allocator_reserved_bytes < 0:
        return None
    safe_upper_bound = free_bytes + allocator_reserved_bytes - safety_margin_mib * MIB
    if live_reserved_bytes is None:
        return floor if safe_upper_bound >= floor else None
    cap = safe_upper_bound - live_reserved_bytes
    return cap if cap >= floor else None


def resize_allocator_cap(
    torch,
    probe_free_bytes: Callable[[int], int | None],
    live_reserved_bytes: int | None,
    device: int,
    standing_partition_mib: int,
    safety_margin_mib: int,
) -> int | None:
    """Apply the current elastic cap and return it, or None when the standing floor is unsafe."""
    torch.cuda.empty_cache()
    free_bytes = probe_free_bytes(device)
    allocator_reserved_bytes = int(torch.cuda.memory_reserved(0))
    cap_bytes = elastic_allocator_cap_bytes(
        free_bytes,
        live_reserved_bytes,
        allocator_reserved_bytes,
        standing_partition_mib,
        safety_margin_mib,
    )
    if cap_bytes is None:
        return None
    total_bytes = int(torch.cuda.get_device_properties(0).total_memory)
    torch.cuda.set_per_process_memory_fraction(cap_bytes / total_bytes, 0)
    return cap_bytes


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


def install(
    guard: YieldGuard,
    apply_partition: Callable[[str], str],
    refresh_allocator: Callable[[], bool] | None = None,
) -> None:
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
            model_on_gpu = False

            def encode(texts, **kwargs):
                import numpy as np
                import torch

                def gpu(batch: list[str]) -> object:
                    nonlocal partition_ready, model_on_gpu
                    if not partition_ready:
                        if apply_partition("ccc") != "cuda":
                            raise GpuUnavailable
                        partition_ready = True
                    if refresh_allocator is not None and not refresh_allocator():
                        raise GpuUnavailable
                    if not model_on_gpu:
                        model.to(device="cuda:0", dtype=torch.float16)
                        model_on_gpu = True

                    try:
                        return original_encode(batch, **(kwargs | {"device": "cuda:0"}))
                    except torch.cuda.OutOfMemoryError as error:
                        torch.cuda.empty_cache()
                        if len(batch) > 1:
                            midpoint = len(batch) // 2
                            logger.warning(
                                "ccc CUDA OOM for %d chunks; retrying GPU halves (%d + %d)",
                                len(batch),
                                midpoint,
                                len(batch) - midpoint,
                            )
                            left = gpu(batch[:midpoint])
                            right = gpu(batch[midpoint:])
                            return np.concatenate((left, right), axis=0)

                        max_seq_length = getattr(model, "max_seq_length", None)
                        if not isinstance(max_seq_length, int) or max_seq_length < 1:
                            raise RuntimeError(
                                "ccc cannot retry a single GPU chunk because the model "
                                "has no valid max_seq_length; refusing CPU embedding"
                            ) from error

                        # SentenceTransformer's Transformer module tokenizes with truncation
                        # at model.max_seq_length. Re-encode once after clearing cached blocks.
                        logger.warning(
                            "ccc single chunk OOM at max_seq_length=%d; "
                            "retrying once on GPU with SentenceTransformer truncation",
                            max_seq_length,
                        )
                        try:
                            return original_encode(
                                batch, **(kwargs | {"device": "cuda:0"})
                            )
                        except torch.cuda.OutOfMemoryError:
                            logger.error(
                                "ccc GPU cannot embed one chunk after retry at "
                                "max_seq_length=%d; refusing CPU embedding",
                                max_seq_length,
                            )
                            # Preserve the CUDA OOM type. CocoIndex's batch runner consumes it
                            # as RetryWithSmallerBatch, isolates this chunk, and keeps siblings.
                            raise

                outputs = []
                for offset in range(0, len(texts), guard.policy.batch_size):
                    batch = texts[offset : offset + guard.policy.batch_size]
                    outputs.append(guard.run(lambda batch=batch: gpu(batch)))
                return np.concatenate(outputs) if outputs else np.empty((0,))

            model.encode = encode
            model._ccc_yield_installed = True
        return model

    SentenceTransformerEmbedder._get_model = get_model
