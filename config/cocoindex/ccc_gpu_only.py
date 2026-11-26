"""Keep ccc embeddings on its fixed CUDA reservation, without research handoff."""

import json
import logging
import os
import signal
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

MIB = 1024 * 1024
MAX_BATCH_SIZE = 8
DEFAULT_WAIT_SECONDS = 1.0


def state_directory() -> Path:
    """Use the runner runtime root for ccc status reporting."""
    runtime = os.environ.get("XDG_RUNTIME_DIR")
    if runtime is None or not Path(runtime).is_absolute():
        raise ValueError("XDG_RUNTIME_DIR must name the user runtime directory")
    return Path(runtime) / "agent-resource"


def configure_partition(
    service: str,
    probe_free_bytes: Callable[[int], int | None],
    apply_partition: Callable[[str], str],
    partition_mib: int,
    device: int,
) -> str:
    """Apply a standing partition only when its full reservation is available."""
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


@dataclass(frozen=True, slots=True)
class Policy:
    batch_size: int = MAX_BATCH_SIZE
    wait_seconds: float = DEFAULT_WAIT_SECONDS

    def __post_init__(self) -> None:
        if not 1 <= self.batch_size <= MAX_BATCH_SIZE:
            raise ValueError(f"ccc GPU batch size must be 1..{MAX_BATCH_SIZE}")
        if self.wait_seconds <= 0:
            raise ValueError("ccc GPU wait interval must be positive")

    @classmethod
    def from_environment(cls) -> "Policy":
        return cls(
            int(os.environ.get("CCC_GPU_BATCH_SIZE", str(MAX_BATCH_SIZE))),
            float(os.environ.get("CCC_GPU_WAIT_SECONDS", str(DEFAULT_WAIT_SECONDS))),
        )


class GpuUnavailable(RuntimeError):
    """CUDA or ccc's fixed GPU reservation is temporarily unavailable."""


class GpuAdmission:
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
        self.model_device: str | None = None
        self.model_dtype: str | None = None

    def status(self, reason: str | None) -> None:
        value = json.dumps(
            {
                "at": int(time.time() * 1000),
                "pid": os.getpid(),
                "deferring": reason is not None,
                "reason": reason,
                "model_device": self.model_device,
                "model_dtype": self.model_dtype,
            }
        )
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        target = self.directory / "ccc-gpu-status.json"
        temporary = target.with_suffix(f".{os.getpid()}.tmp")
        temporary.write_text(value)
        temporary.replace(target)

    def run[T](self, gpu: Callable[[], T]) -> T:
        """Retry only named CUDA admission failures; never choose a CPU path."""
        with self.serial:
            while True:
                try:
                    result = gpu()
                except GpuUnavailable as error:
                    self.status(str(error))
                    self.wait(self.policy.wait_seconds)
                    continue
                self.status(None)
                return result


def ignore_research_signal() -> None:
    """Keep a stale research-yield signal from stopping the reserved ccc daemon."""
    signal.signal(signal.SIGUSR1, signal.SIG_IGN)


def _model_device(model) -> str:
    return str(model.device)


def _validate_model(model, torch) -> None:
    device = _model_device(model)
    if device != "cuda:0":
        raise RuntimeError(
            f"ccc SentenceTransformer loaded on {device}; refusing non-CUDA embeddings"
        )
    parameter = next(model.parameters(), None)
    if parameter is None or parameter.dtype != torch.float16:
        raise RuntimeError(
            "ccc SentenceTransformer must be loaded with float16 CUDA weights"
        )


def install(
    admission: GpuAdmission,
    apply_partition: Callable[[str], str],
) -> None:
    """Load the embedder explicitly on cuda:0 and wrap every encode call."""
    from cocoindex.ops.sentence_transformers import SentenceTransformerEmbedder

    def get_model(embedder):
        def load_on_cuda():
            import torch

            if not torch.cuda.is_available():
                raise GpuUnavailable(
                    "CUDA unavailable; waiting for GPU-only indexing"
                )
            partition = apply_partition("ccc")
            if partition != "cuda":
                reason = (
                    "ccc GPU partition unavailable"
                    if partition == "unavailable"
                    else str(partition)
                )
                raise GpuUnavailable(
                    f"{reason}; waiting for GPU-only indexing"
                )
            with embedder._lock:
                if embedder._model is None:
                    from sentence_transformers import SentenceTransformer

                    try:
                        embedder._model = SentenceTransformer(
                            embedder._model_name_or_path,
                            device="cuda:0",
                            trust_remote_code=embedder._trust_remote_code,
                            model_kwargs={"torch_dtype": torch.float16},
                        )
                    except RuntimeError as error:
                        raise RuntimeError(
                            "ccc CUDA model initialization failed on cuda:0; "
                            "CPU fallback is disabled"
                        ) from error
                model = embedder._model
            _validate_model(model, torch)
            admission.model_device = _model_device(model)
            admission.model_dtype = str(next(model.parameters()).dtype)
            return model

        model = admission.run(load_on_cuda)
        with admission.serial:
            if getattr(model, "_ccc_gpu_only_installed", False):
                return model
            original_encode = model.encode

            def encode(texts, **kwargs):
                import numpy as np
                import torch

                def gpu(batch: list[str]) -> object:
                    if not torch.cuda.is_available():
                        raise GpuUnavailable(
                            "CUDA unavailable; waiting for GPU-only indexing"
                        )
                    partition = apply_partition("ccc")
                    if partition != "cuda":
                        reason = (
                            "ccc GPU partition unavailable"
                            if partition == "unavailable"
                            else str(partition)
                        )
                        raise GpuUnavailable(
                            f"{reason}; waiting for GPU-only indexing"
                        )
                    _validate_model(model, torch)
                    try:
                        return original_encode(
                            batch, **(kwargs | {"device": "cuda:0"})
                        )
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
                        logger.warning(
                            "ccc single chunk OOM at max_seq_length=%d; "
                            "retrying once on GPU",
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
                            raise

                outputs = []
                for offset in range(0, len(texts), admission.policy.batch_size):
                    batch = texts[offset : offset + admission.policy.batch_size]
                    outputs.append(admission.run(lambda batch=batch: gpu(batch)))
                return np.concatenate(outputs, axis=0) if outputs else np.empty((0,))

            model.encode = encode
            model._ccc_gpu_only_installed = True
        return model

    SentenceTransformerEmbedder._get_model = get_model
