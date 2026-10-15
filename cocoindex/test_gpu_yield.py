"""GPU-only ccc admission tests; partition/NVML and CUDA surfaces are mocked."""

import json
import os
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
from ccc_gpu_yield import (
    GpuUnavailable,
    Policy,
    YieldGuard,
    batch_limit_for_partition,
    configure_partition,
    install,
    partition_has_room,
    prepare_partition,
    state_directory,
)


def install_embedder(monkeypatch, model):
    class Embedder:
        _device = None

        def _get_model(self):
            assert self._device == "cpu"
            return model

    module = ModuleType("cocoindex.ops.sentence_transformers")
    module.SentenceTransformerEmbedder = Embedder
    monkeypatch.setitem(sys.modules, module.__name__, module)
    numpy = ModuleType("numpy")
    numpy.concatenate = lambda arrays: [row for array in arrays for row in array]
    numpy.empty = lambda _: []
    monkeypatch.setitem(sys.modules, "numpy", numpy)
    return Embedder


def install_torch(monkeypatch):
    class FakeOutOfMemory(RuntimeError):
        pass

    events = []
    torch = ModuleType("torch")
    torch.cuda = SimpleNamespace(
        OutOfMemoryError=FakeOutOfMemory,
        synchronize=lambda: events.append("sync"),
        empty_cache=lambda: events.append("empty-cache"),
    )
    monkeypatch.setitem(sys.modules, "torch", torch)
    return events


def test_runtime_path_matches_runner(monkeypatch):
    monkeypatch.setenv("XDG_RUNTIME_DIR", "/run/user/fixture")
    assert state_directory() == Path("/run/user/fixture/agent-resource-control")
    monkeypatch.setenv("XDG_RUNTIME_DIR", "relative")
    assert state_directory().name == f"agent-resource-control-{os.getuid()}"


def test_batch_default_and_override_are_bounded_by_partition(monkeypatch):
    monkeypatch.delenv("CCC_GPU_BATCH_SIZE", raising=False)
    monkeypatch.delenv("CCC_GPU_UTILIZATION_PERCENT", raising=False)
    policy = Policy.from_environment(2048, 512)
    assert policy.batch_size == 8 and policy.utilization_percent == 100
    assert batch_limit_for_partition(2048, 512) == 10

    monkeypatch.setenv("CCC_GPU_BATCH_SIZE", "10")
    assert Policy.from_environment(2048, 512).batch_size == 10
    monkeypatch.setenv("CCC_GPU_BATCH_SIZE", "11")
    with pytest.raises(ValueError, match="1..10"):
        Policy.from_environment(2048, 512)
    assert batch_limit_for_partition(1704, 512) == 0


def test_live_research_reservation_does_not_defer_ccc(tmp_path):
    (tmp_path / "research.reservation.json").write_text(
        json.dumps(
            {
                "schema": 1,
                "controller_pid": os.getpid(),
                "device": {"kind": "gpu"},
            }
        )
    )
    guard = YieldGuard(tmp_path, Policy())
    assert guard.run(lambda: "cuda batch") == "cuda batch"
    status = json.loads((tmp_path / "ccc-gpu-status.json").read_text())
    assert status["deferring"] is False


def test_unavailable_gpu_waits_then_runs_gpu_only(tmp_path):
    waits = []
    attempts = iter([GpuUnavailable(), "gpu result"])
    guard = YieldGuard(tmp_path, Policy(), wait=waits.append)

    def gpu():
        result = next(attempts)
        if isinstance(result, BaseException):
            raise result
        return result

    assert guard.run(gpu) == "gpu result"
    assert waits == [1.0]
    status = json.loads((tmp_path / "ccc-gpu-status.json").read_text())
    assert status["deferring"] is False


def test_partition_setup_waits_without_selecting_cpu(tmp_path, monkeypatch):
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0")
    waits = []
    results = iter(["unavailable", "cuda"])
    guard = YieldGuard(tmp_path, Policy(), wait=waits.append)
    assert prepare_partition(guard, lambda _service: next(results)) == "cuda"
    assert waits == [1.0]
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0"

    with pytest.raises(RuntimeError, match="requires CUDA"):
        prepare_partition(guard, lambda _service: "cpu")


def test_partition_probe_waits_without_selecting_cpu(monkeypatch):
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0")
    apply_calls = []
    probe_calls = []

    def probe(device):
        probe_calls.append(device)

    def apply(service):
        apply_calls.append(service)
        return "cuda"

    assert configure_partition("ccc", probe, apply, 2048, 0) == "unavailable"
    assert probe_calls == [0] and apply_calls == []
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0"

    assert not partition_has_room(lambda _device: None, 2048, 0)
    assert not partition_has_room(lambda _device: 1535 * 1024**2, 2048, 0)
    assert partition_has_room(lambda _device: 1536 * 1024**2, 2048, 0)


def test_partition_probe_success_and_apply_race_preserve_cuda_visibility(monkeypatch):
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0")

    def race_to_cpu(_service):
        os.environ["CUDA_VISIBLE_DEVICES"] = ""
        return "cpu"

    assert (
        configure_partition("ccc", lambda _device: 2048 * 1024**2, race_to_cpu, 2048, 0)
        == "unavailable"
    )
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0"

    assert (
        configure_partition(
            "ccc",
            lambda _device: 2048 * 1024**2,
            lambda _service: "cuda",
            2048,
            0,
        )
        == "cuda"
    )


def test_window_waits_instead_of_using_cpu(tmp_path, monkeypatch):
    waits = []
    guard = YieldGuard(tmp_path, Policy(), wait=waits.append)
    permits = iter([False, True])
    monkeypatch.setattr(Policy, "permits", lambda _self, _minute: next(permits))
    assert guard.run(lambda: "cuda") == "cuda"
    assert waits == [1.0]


def test_duty_ceiling_delays_gpu_batch_without_cpu_fallback(tmp_path, monkeypatch):
    ticks = [10.0]
    waits = []
    monkeypatch.setattr("ccc_gpu_yield.time.monotonic", lambda: ticks[0])

    def wait(seconds):
        waits.append(seconds)
        ticks[0] += seconds

    guard = YieldGuard(
        tmp_path,
        Policy(utilization_percent=20, wait_seconds=5),
        wait=wait,
    )
    calls = []

    def gpu():
        calls.append(ticks[0])
        ticks[0] += 1
        return "cuda"

    assert guard.run(gpu) == "cuda"
    assert guard.run(gpu) == "cuda"
    assert waits == [5]
    assert calls == [10.0, 16.0]


def test_embedder_batches_on_gpu_and_keeps_model_resident(tmp_path, monkeypatch):
    events = []
    model = SimpleNamespace()

    def encode(texts, **kwargs):
        assert kwargs["device"] == "cuda:0"
        events.append((len(texts), kwargs["prompt_name"]))
        return [[text] for text in texts]

    model.encode = encode
    model.to = lambda device: pytest.fail(f"model unexpectedly moved to {device}")
    Embedder = install_embedder(monkeypatch, model)
    install_torch(monkeypatch)
    partition_calls = []

    def available(service):
        partition_calls.append(service)
        return "cuda"

    guard = YieldGuard(tmp_path, Policy(batch_size=8, max_batch_size=10))
    install(guard, available)
    embedder = Embedder()
    loaded = embedder._get_model()
    assert embedder._device is None

    values = list(range(9))
    assert loaded.encode(values, prompt_name="document") == [[i] for i in values]
    assert events == [(8, "document"), (1, "document")]
    assert partition_calls == ["ccc"]


def test_cpu_embedding_callback_does_not_exist_even_after_reservation(
    tmp_path, monkeypatch
):
    reservation = tmp_path / "research.reservation.json"
    reservation.write_text(
        json.dumps(
            {"schema": 1, "controller_pid": os.getpid(), "device": {"kind": "gpu"}}
        )
    )
    model = SimpleNamespace()
    devices = []

    def encode(texts, **kwargs):
        devices.append(kwargs["device"])
        return [[text] for text in texts]

    model.encode = encode
    model.to = lambda _device: None
    Embedder = install_embedder(monkeypatch, model)
    install_torch(monkeypatch)
    guard = YieldGuard(tmp_path, Policy())
    install(guard, lambda _service: "cuda")
    assert Embedder()._get_model().encode(["chunk"]) == [["chunk"]]
    assert devices == ["cuda:0"]


def test_cuda_oom_evicts_model_then_retries_same_batch_on_gpu(tmp_path, monkeypatch):
    events = install_torch(monkeypatch)
    devices = []
    model = SimpleNamespace()
    fail_once = True

    def encode(texts, **kwargs):
        nonlocal fail_once
        devices.append(kwargs["device"])
        if fail_once:
            fail_once = False
            raise sys.modules["torch"].cuda.OutOfMemoryError("fixture pressure")
        return [[text] for text in texts]

    model.encode = encode
    model.to = lambda device: events.append(("model.to", device))
    Embedder = install_embedder(monkeypatch, model)
    waits = []
    availability = iter(["cuda", "unavailable", "cuda"])
    guard = YieldGuard(tmp_path, Policy(), wait=waits.append)
    install(guard, lambda _service: next(availability))

    assert Embedder()._get_model().encode(["chunk"]) == [["chunk"]]
    assert devices == ["cuda:0", "cuda:0"]
    assert ("model.to", "cpu") in events
    assert "empty-cache" in events
    assert waits == [1.0, 1.0]


def test_persistent_cuda_oom_fails_loudly_without_cpu_embedding(tmp_path, monkeypatch):
    install_torch(monkeypatch)
    devices = []
    model = SimpleNamespace()

    def encode(_texts, **kwargs):
        devices.append(kwargs["device"])
        raise sys.modules["torch"].cuda.OutOfMemoryError("fixture pressure")

    model.encode = encode
    model.to = lambda _device: None
    Embedder = install_embedder(monkeypatch, model)
    availability = iter(["cuda", "cuda"])
    guard = YieldGuard(tmp_path, Policy(), wait=lambda _seconds: None)
    install(guard, lambda _service: next(availability))

    with pytest.raises(RuntimeError, match="refusing CPU embedding"):
        Embedder()._get_model().encode(["oversized chunk"])
    assert devices == ["cuda:0", "cuda:0"]
