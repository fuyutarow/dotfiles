"""GPU reservation, batch admission, and OOM handling tests."""

import fcntl
import json
import os
import sys
import threading
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

from ccc_gpu_only import (
    GpuAdmission,
    Policy,
    configure_partition,
    install,
    state_directory,
)


def install_embedder(monkeypatch, model):
    constructor_calls = []

    class Parameter:
        def __init__(self, dtype):
            self.dtype = dtype

    def sentence_transformer(model_name, **kwargs):
        constructor_calls.append({"model_name": model_name, **kwargs})
        model.device = kwargs["device"]
        dtype = kwargs["model_kwargs"]["torch_dtype"]
        model.parameters = lambda: iter([Parameter(dtype)])
        return model

    sentence_transformers = ModuleType("sentence_transformers")
    sentence_transformers.SentenceTransformer = sentence_transformer
    monkeypatch.setitem(sys.modules, "sentence_transformers", sentence_transformers)

    class Embedder:
        constructed_calls = constructor_calls

        def __init__(self):
            self._device = None
            self._model_name_or_path = "fixture/model"
            self._trust_remote_code = False
            self._model = None
            self._lock = threading.Lock()

        def _get_model(self):
            raise AssertionError("ccc GPU-only adapter was not installed")

    module = ModuleType("cocoindex.ops.sentence_transformers")
    module.SentenceTransformerEmbedder = Embedder
    monkeypatch.setitem(sys.modules, module.__name__, module)

    numpy = ModuleType("numpy")
    numpy.concatenate = lambda arrays, axis=0: [
        row for array in arrays for row in array
    ]
    numpy.empty = lambda _: []
    monkeypatch.setitem(sys.modules, "numpy", numpy)
    return Embedder


def install_torch(monkeypatch):
    class FakeOutOfMemory(RuntimeError):
        pass

    events = []
    torch = ModuleType("torch")
    torch.float16 = "float16"
    torch.cuda = SimpleNamespace(
        OutOfMemoryError=FakeOutOfMemory,
        is_available=lambda: True,
        empty_cache=lambda: events.append("empty-cache"),
    )
    monkeypatch.setitem(sys.modules, "torch", torch)
    return events


def test_runtime_path_matches_runner(monkeypatch, tmp_path):
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    assert state_directory() == tmp_path / "agent-resource"
    monkeypatch.setenv("XDG_RUNTIME_DIR", "relative")
    with pytest.raises(ValueError, match="XDG_RUNTIME_DIR"):
        state_directory()
    monkeypatch.delenv("XDG_RUNTIME_DIR")
    with pytest.raises(ValueError, match="XDG_RUNTIME_DIR"):
        state_directory()


def test_fixed_batch_limit_is_the_measured_batch(monkeypatch):
    monkeypatch.delenv("CCC_GPU_BATCH_SIZE", raising=False)
    monkeypatch.delenv("CCC_GPU_WAIT_SECONDS", raising=False)
    assert Policy.from_environment() == Policy(batch_size=8, wait_seconds=1.0)
    monkeypatch.setenv("CCC_GPU_BATCH_SIZE", "9")
    with pytest.raises(ValueError, match="1..8"):
        Policy.from_environment()


def test_partition_probe_requires_full_reservation_and_preserves_visibility(
    monkeypatch,
):
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0")
    apply_calls = []
    unavailable = configure_partition(
        "ccc",
        lambda _: 2047 * 1024**2,
        lambda name: apply_calls.append(name) or "cuda",
        2048,
        0,
    )
    assert unavailable == "unavailable"
    assert apply_calls == []
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0"

    available = configure_partition(
        "ccc",
        lambda _: 2048 * 1024**2,
        lambda name: apply_calls.append(name) or "cuda",
        2048,
        0,
    )
    assert available == "cuda"
    assert apply_calls == ["ccc"]


def test_gpu_batch_runs_while_research_holds_its_maximum_grant(
    tmp_path, monkeypatch
):
    directory = tmp_path / "agent-resource"
    slots = directory / "slots"
    slots.mkdir(parents=True)
    wants = directory / "gpu-wants"
    wants.mkdir()
    (wants / "research").write_text(str(9728 * 1024**2))
    slot = slots / "gpu.0.0"
    slot.touch()
    waits = []
    calls = []
    model = SimpleNamespace(max_seq_length=512)

    def encode(texts, **kwargs):
        calls.append((kwargs["device"], len(texts)))
        return [[text] for text in texts]

    model.encode = encode
    Embedder = install_embedder(monkeypatch, model)
    install_torch(monkeypatch)
    admission = GpuAdmission(directory, Policy(), wait=waits.append)
    partition_calls = []
    install(admission, lambda service: partition_calls.append(service) or "cuda")

    with slot.open("a+") as research:
        fcntl.flock(research, fcntl.LOCK_EX | fcntl.LOCK_NB)
        loaded = Embedder()._get_model()
        assert loaded.encode(["index chunk"]) == [["index chunk"]]

    status = json.loads((directory / "ccc-gpu-status.json").read_text())
    assert status["deferring"] is False
    assert status["model_device"] == "cuda:0"
    assert status["model_dtype"] == "float16"
    assert calls == [("cuda:0", 1)]
    assert partition_calls == ["ccc", "ccc"]
    assert waits == []


def test_model_construction_passes_cuda_and_fp16_explicitly(tmp_path, monkeypatch):
    model = SimpleNamespace(encode=lambda texts, **_: [[text] for text in texts])
    Embedder = install_embedder(monkeypatch, model)
    install_torch(monkeypatch)
    admission = GpuAdmission(tmp_path, Policy())
    install(admission, lambda _service: "cuda")

    loaded = Embedder()._get_model()

    assert loaded.device == "cuda:0"
    assert Embedder.constructed_calls == [
        {
            "model_name": "fixture/model",
            "device": "cuda:0",
            "trust_remote_code": False,
            "model_kwargs": {"torch_dtype": "float16"},
        }
    ]
    assert admission.model_device == "cuda:0"
    assert admission.model_dtype == "float16"


def test_cuda_oom_splits_batch_and_keeps_output_order(tmp_path, monkeypatch):
    install_torch(monkeypatch)
    batch_sizes = []
    devices = []
    model = SimpleNamespace(max_seq_length=512)

    def encode(texts, **kwargs):
        devices.append(kwargs["device"])
        batch_sizes.append(len(texts))
        if len(texts) > 2:
            raise sys.modules["torch"].cuda.OutOfMemoryError("fixture pressure")
        return [[text] for text in texts]

    model.encode = encode
    Embedder = install_embedder(monkeypatch, model)
    admission = GpuAdmission(tmp_path, Policy())
    install(admission, lambda _service: "cuda")

    values = list(range(8))
    assert Embedder()._get_model().encode(values) == [[value] for value in values]
    assert batch_sizes == [8, 4, 2, 2, 4, 2, 2]
    assert set(devices) == {"cuda:0"}
