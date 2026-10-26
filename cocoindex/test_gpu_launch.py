"""Exercise ccc's fixed GPU reservation and direct systemd launch path."""

import importlib.util
import os
import runpy
import select
import signal
import subprocess
import sys
import time
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parents[1]


def _prepare_launcher(monkeypatch, tmp_path, daemon_result):
    import ccc_gpu_only

    events = []
    partition_calls = []
    partition = ModuleType("gpu_partition")
    partition._free_bytes = lambda _: 10 * 1024**3
    partition.apply = lambda service: partition_calls.append(service) or "cuda"
    monkeypatch.setitem(sys.modules, "gpu_partition", partition)

    def install_adapter(admission, apply_partition):
        events.append("adapter")
        assert admission.directory == tmp_path / "agent-resource"
        assert os.environ["COCOINDEX_RUN_GPU_IN_SUBPROCESS"] == "0"
        assert apply_partition("ccc") == "cuda"

    monkeypatch.setattr(ccc_gpu_only, "install", install_adapter)
    monkeypatch.setattr(
        ccc_gpu_only,
        "ignore_research_signal",
        lambda: events.append("ignore-research-signal"),
    )

    cli = ModuleType("cocoindex_code.cli")
    cli.app = lambda: events.append("daemon") or daemon_result
    package = ModuleType("cocoindex_code")
    package.__path__ = []
    package.cli = cli
    monkeypatch.setitem(sys.modules, package.__name__, package)
    monkeypatch.setitem(sys.modules, cli.__name__, cli)
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    monkeypatch.setattr(sys, "argv", ["launcher"])
    return events, partition_calls


def test_deployed_launcher_installs_gpu_adapter_before_daemon(
    monkeypatch, tmp_path
):
    events, partition_calls = _prepare_launcher(monkeypatch, tmp_path, 0)

    with pytest.raises(SystemExit) as exc:
        runpy.run_path(str(ROOT / "cocoindex/ccc-daemon-launch.py"))

    assert exc.value.code == 0
    assert events == ["adapter", "ignore-research-signal", "daemon"]
    assert partition_calls == ["ccc"]


def test_launcher_returns_daemon_exit_status_to_systemd(monkeypatch, tmp_path):
    events, _ = _prepare_launcher(monkeypatch, tmp_path, 23)

    with pytest.raises(SystemExit) as exc:
        runpy.run_path(str(ROOT / "cocoindex/ccc-daemon-launch.py"))

    assert exc.value.code == 23
    assert events == ["adapter", "ignore-research-signal", "daemon"]


def test_embedder_waits_for_full_reservation_without_cpu_encode(
    monkeypatch, tmp_path
):
    import ccc_gpu_only
    from test_gpu_yield import install_embedder, install_torch

    devices = []
    model = SimpleNamespace(max_seq_length=512)
    model.encode = lambda texts, **kwargs: (
        devices.append(kwargs["device"]) or [[text] for text in texts]
    )
    Embedder = install_embedder(monkeypatch, model)
    install_torch(monkeypatch)

    free_bytes = [2047 * 1024**2]
    apply_calls = []
    waits = []

    def wait(seconds):
        waits.append(seconds)
        free_bytes[0] = 2048 * 1024**2

    admission = ccc_gpu_only.GpuAdmission(
        tmp_path, ccc_gpu_only.Policy(), wait=wait
    )
    ccc_gpu_only.install(
        admission,
        lambda service: ccc_gpu_only.configure_partition(
            service,
            lambda _: free_bytes[0],
            lambda name: apply_calls.append(name) or "cuda",
            2048,
            0,
        ),
    )

    loaded = Embedder()._get_model()
    assert loaded.encode(["chunk"]) == [["chunk"]]
    assert loaded.device == "cuda:0"
    assert devices == ["cuda:0"]
    assert waits == [1.0]
    assert apply_calls == ["ccc", "ccc"]


def test_ccc_ignores_research_yield_signal():
    process = subprocess.Popen(
        [
            sys.executable,
            "-u",
            "-c",
            "import time; from ccc_gpu_only import ignore_research_signal; "
            "ignore_research_signal(); print('serving', flush=True); time.sleep(30)",
        ],
        cwd=ROOT / "cocoindex",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
    )
    try:
        assert select.select([process.stdout], [], [], 5)[0]
        assert process.stdout.readline().strip() == "serving"
        process.send_signal(signal.SIGUSR1)
        time.sleep(0.05)
        assert process.poll() is None
    finally:
        if process.poll() is None:
            process.terminate()
        process.communicate(timeout=5)


def test_partition_keeps_1536_mib_allocator_cap(monkeypatch, tmp_path):
    import ccc_gpu_only
    from test_gpu_yield import install_embedder

    path = ROOT / "tools/agent-resource-run/gpu_partition.py"
    spec = importlib.util.spec_from_file_location("partition_under_test", path)
    partition = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(partition)

    fractions = []
    torch = ModuleType("torch")
    torch.float16 = "float16"
    torch.cuda = SimpleNamespace(
        OutOfMemoryError=type("FakeOutOfMemory", (RuntimeError,), {}),
        is_available=lambda: True,
        get_device_properties=lambda _: SimpleNamespace(
            total_memory=12288 * 1024**2
        ),
        set_per_process_memory_fraction=lambda fraction, device: fractions.append(
            (fraction, device)
        ),
    )
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "3")
    monkeypatch.setattr(
        partition,
        "_policy",
        lambda: {"gpu_partition_ccc_mib": 2048, "gpu_partition_device": 0},
    )
    free_mib = [10000]
    monkeypatch.setattr(partition, "_free_bytes", lambda _: free_mib[0] * 1024**2)
    monkeypatch.setattr(
        partition.threading, "Thread", lambda **_: SimpleNamespace(start=lambda: None)
    )

    model = SimpleNamespace(max_seq_length=512)
    model.encode = lambda texts, **_: [[text] for text in texts]
    Embedder = install_embedder(monkeypatch, model)
    admission = ccc_gpu_only.GpuAdmission(tmp_path, ccc_gpu_only.Policy())
    partition_configured = False

    def grant_partition(service):
        nonlocal partition_configured
        if partition_configured:
            return "cuda"
        result = ccc_gpu_only.configure_partition(
            service,
            partition._free_bytes,
            partition.apply,
            2048,
            0,
        )
        partition_configured = result == "cuda"
        return result

    ccc_gpu_only.install(admission, grant_partition)
    loaded = Embedder()._get_model()
    for headroom in (10000, 11000):
        free_mib[0] = headroom
        assert loaded.encode(["chunk"] * 17) == [["chunk"]] * 17
        assert all(fraction * 12288 <= 1536 for fraction, _ in fractions)

    assert fractions == [(1536 / 12288, 0)]
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0"
