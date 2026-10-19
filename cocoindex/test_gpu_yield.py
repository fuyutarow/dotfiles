"""GPU-only ccc admission tests; partition/NVML and CUDA surfaces are mocked."""

import fcntl
import json
import os
import subprocess
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
    elastic_allocator_cap_bytes,
    install,
    partition_has_room,
    prepare_partition,
    resize_allocator_cap,
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
    torch.cuda = SimpleNamespace(
        OutOfMemoryError=FakeOutOfMemory,
        synchronize=lambda: events.append("sync"),
        empty_cache=lambda: events.append("empty-cache"),
    )
    torch.float16 = "float16"
    monkeypatch.setitem(sys.modules, "torch", torch)
    return events


def test_runtime_path_matches_runner(monkeypatch):
    monkeypatch.setenv("XDG_RUNTIME_DIR", "/run/user/fixture")
    assert state_directory() == Path("/run/user/fixture/agent-resource")
    monkeypatch.setenv("XDG_RUNTIME_DIR", "relative")
    with pytest.raises(ValueError, match="XDG_RUNTIME_DIR"):
        state_directory()
    monkeypatch.delenv("XDG_RUNTIME_DIR")
    with pytest.raises(ValueError, match="XDG_RUNTIME_DIR"):
        state_directory()


def test_batch_default_and_override_are_bounded_by_partition(monkeypatch):
    monkeypatch.delenv("CCC_GPU_BATCH_SIZE", raising=False)
    monkeypatch.delenv("CCC_GPU_UTILIZATION_PERCENT", raising=False)
    policy = Policy.from_environment(2048, 512)
    assert policy.batch_size == 8 and policy.utilization_percent == 100
    assert batch_limit_for_partition(2048, 512) == 29
    larger_partition = Policy.from_environment(4096, 512)
    assert larger_partition.batch_size == 8
    assert larger_partition.max_batch_size == 93
    assert batch_limit_for_partition(4096, 512) == 93

    monkeypatch.setenv("CCC_GPU_BATCH_SIZE", "29")
    assert Policy.from_environment(2048, 512).batch_size == 29
    monkeypatch.setenv("CCC_GPU_BATCH_SIZE", "30")
    with pytest.raises(ValueError, match="1..29"):
        Policy.from_environment(2048, 512)
    assert batch_limit_for_partition(1109, 512) == 0


@pytest.mark.parametrize("slot", [0, 1, 2, 9])
def test_held_research_slot_yields_and_all_free_slots_resume(tmp_path, slot):
    slots = tmp_path / "slots"
    slots.mkdir()
    with subprocess.Popen(
        [
            "flock",
            "-F",
            "-n",
            str(slots / f"gpu.{slot}"),
            sys.executable,
            "-u",
            "-c",
            "import sys; print('held', flush=True); sys.stdin.read()",
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ) as research:
        try:
            assert research.stdout.readline() == b"held\n"
            calls = []
            waits = []

            def wait(seconds):
                waits.append(seconds)
                assert calls == []
                status = json.loads((tmp_path / "ccc-gpu-status.json").read_text())
                assert status["deferring"] is True
                assert "research GPU slot" in status["reason"]
                research.communicate(timeout=5)
                assert research.returncode == 0

            guard = YieldGuard(tmp_path, Policy(), wait=wait, gpu_slots=3)
            assert guard.run(lambda: calls.append("cuda") or "result") == "result"
            assert calls == ["cuda"]
            assert waits == [1.0]
            assert guard.run(lambda: "resumed") == "resumed"
            assert waits == [1.0]
        finally:
            if research.poll() is None:
                research.kill()
                research.communicate(timeout=5)


def test_gpu_batch_holds_shared_slots_until_return(tmp_path):
    guard = YieldGuard(tmp_path, Policy(), gpu_slots=3)

    def gpu():
        for n in range(3):
            with (
                (tmp_path / "slots" / f"gpu.{n}").open("a+") as research,
                pytest.raises(BlockingIOError),
            ):
                fcntl.flock(research, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return "cuda"

    assert guard.run(gpu) == "cuda"
    for n in range(3):
        with (tmp_path / "slots" / f"gpu.{n}").open("a+") as research:
            fcntl.flock(research, fcntl.LOCK_EX | fcntl.LOCK_NB)


def test_elastic_allocator_cap_tracks_free_space():
    mib = 1024**2
    gib = 1024**3
    assert (
        elastic_allocator_cap_bytes(10 * gib, 1 * gib, 2048, 512)
        == 11 * gib - 512 * mib
    )
    for free in (None, -1, 100 * mib):
        assert elastic_allocator_cap_bytes(free, 0, 2048, 512) is None


def test_allocator_cap_is_resized_from_mocked_free_vram():
    mib = 1024**2
    gib = 1024**3
    fractions = []
    free_samples = iter([10 * gib, 3 * gib, 0])
    torch = SimpleNamespace(
        cuda=SimpleNamespace(
            empty_cache=lambda: None,
            memory_reserved=lambda _device: 1 * gib,
            get_device_properties=lambda _device: SimpleNamespace(
                total_memory=12 * gib
            ),
            set_per_process_memory_fraction=lambda fraction, _device: fractions.append(
                fraction
            ),
        )
    )
    caps = [
        resize_allocator_cap(torch, lambda _device: next(free_samples), 0, 2048, 512)
        for _ in range(3)
    ]
    assert caps == [11 * gib - 512 * mib, 4 * gib - 512 * mib, None]
    assert fractions == [caps[0] / (12 * gib), caps[1] / (12 * gib)]


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
    model_moves = []
    model = SimpleNamespace()

    def encode(texts, **kwargs):
        assert kwargs["device"] == "cuda:0"
        events.append((len(texts), kwargs["prompt_name"]))
        return [[text] for text in texts]

    model.encode = encode
    model.max_seq_length = 512
    model.to = lambda **kwargs: model_moves.append(kwargs)
    Embedder = install_embedder(monkeypatch, model)
    install_torch(monkeypatch)
    partition_calls = []

    def available(service):
        partition_calls.append(service)
        return "cuda"

    guard = YieldGuard(tmp_path, Policy(batch_size=8, max_batch_size=10))
    refreshes = []
    install(guard, available, lambda: refreshes.append("checked") is None)
    embedder = Embedder()
    loaded = embedder._get_model()
    assert embedder._device is None

    values = list(range(9))
    assert loaded.encode(values, prompt_name="document") == [[i] for i in values]
    assert events == [(8, "document"), (1, "document")]
    assert model_moves == [{"device": "cuda:0", "dtype": "float16"}]
    assert partition_calls == ["ccc"]
    assert refreshes == ["checked", "checked"]


def test_embedder_waits_for_research_then_embeds_only_on_cuda(tmp_path, monkeypatch):
    slots = tmp_path / "slots"
    slots.mkdir()
    devices = []
    moves = []
    waits = []
    model = SimpleNamespace(
        max_seq_length=512,
        to=lambda **kwargs: moves.append(kwargs),
    )

    def encode(texts, **kwargs):
        devices.append(kwargs["device"])
        return [[text] for text in texts]

    model.encode = encode
    Embedder = install_embedder(monkeypatch, model)
    install_torch(monkeypatch)
    with (slots / "gpu.0").open("a+") as research:
        fcntl.flock(research, fcntl.LOCK_EX | fcntl.LOCK_NB)

        def wait(seconds):
            assert devices == [] and moves == []
            waits.append(seconds)
            fcntl.flock(research, fcntl.LOCK_UN)

        guard = YieldGuard(tmp_path, Policy(), wait=wait)
        install(guard, lambda _service: "cuda")
        assert Embedder()._get_model().encode(["chunk"]) == [["chunk"]]
        assert waits == [1.0]
        assert devices == ["cuda:0"]
        assert moves == [{"device": "cuda:0", "dtype": "float16"}]


def test_cuda_oom_retries_transient_single_chunk_on_gpu(tmp_path, monkeypatch):
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
    model.max_seq_length = 512
    model.to = lambda **kwargs: events.append(("model.to", kwargs))
    Embedder = install_embedder(monkeypatch, model)
    waits = []
    guard = YieldGuard(tmp_path, Policy(), wait=waits.append)
    install(guard, lambda _service: "cuda")

    assert Embedder()._get_model().encode(["chunk"]) == [["chunk"]]
    assert devices == ["cuda:0", "cuda:0"]
    assert ("model.to", {"device": "cuda:0", "dtype": "float16"}) in events
    assert "empty-cache" in events
    assert waits == []


def test_cuda_oom_splits_batch_recursively_and_keeps_output_order(
    tmp_path, monkeypatch
):
    install_torch(monkeypatch)
    devices = []
    batch_sizes = []
    model = SimpleNamespace()

    def encode(texts, **kwargs):
        devices.append(kwargs["device"])
        batch_sizes.append(len(texts))
        if len(texts) > 2:
            raise sys.modules["torch"].cuda.OutOfMemoryError("fixture pressure")
        return [[text] for text in texts]

    model.encode = encode
    model.max_seq_length = 512
    model.to = lambda **_kwargs: None
    Embedder = install_embedder(monkeypatch, model)
    guard = YieldGuard(tmp_path, Policy(batch_size=8, max_batch_size=29))
    install(guard, lambda _service: "cuda")

    values = list(range(8))
    assert Embedder()._get_model().encode(values) == [[value] for value in values]
    assert batch_sizes == [8, 4, 2, 2, 4, 2, 2]
    assert set(devices) == {"cuda:0"}


def test_single_chunk_oom_retries_then_surfaces_file_error_without_cpu(
    tmp_path, monkeypatch, caplog
):
    install_torch(monkeypatch)
    devices = []
    model = SimpleNamespace()

    def encode(_texts, **kwargs):
        devices.append(kwargs["device"])
        raise sys.modules["torch"].cuda.OutOfMemoryError("fixture pressure")

    model.encode = encode
    model.max_seq_length = 512
    model.to = lambda **_kwargs: None
    Embedder = install_embedder(monkeypatch, model)
    guard = YieldGuard(tmp_path, Policy())
    install(guard, lambda _service: "cuda")

    with pytest.raises(sys.modules["torch"].cuda.OutOfMemoryError):
        Embedder()._get_model().encode(["oversized chunk"])
    assert devices == ["cuda:0", "cuda:0"]
    assert "SentenceTransformer truncation" in caplog.text
    assert "cannot embed one chunk after retry at max_seq_length=512" in caplog.text
