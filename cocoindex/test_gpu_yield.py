"""No CUDA/service/benchmark work: exercise the real guard with fake embedding callbacks."""

import json
import os
import subprocess
import sys
import threading
from pathlib import Path
from types import ModuleType, SimpleNamespace

import pytest
from ccc_gpu_yield import (
    GpuUnavailable,
    Policy,
    YieldGuard,
    install,
    prepare_partition,
    reservation_reason,
    state_directory,
)


def reservation(directory: Path, kind="gpu", pid=None) -> Path:
    path = directory / "fixture.reservation.json"
    path.write_text(
        json.dumps(
            {
                "schema": 1,
                "controller_pid": os.getpid() if pid is None else pid,
                "device": {"kind": kind},
            }
        )
    )
    return path


def test_runtime_path_matches_runner(monkeypatch):
    monkeypatch.setenv("XDG_RUNTIME_DIR", "/run/user/fixture")
    assert state_directory() == Path("/run/user/fixture/agent-resource-control")
    monkeypatch.setenv("XDG_RUNTIME_DIR", "relative")
    assert state_directory().name == f"agent-resource-control-{os.getuid()}"


def test_single_canonical_ledger_yields_and_owns_one_lock(tmp_path):
    guard = YieldGuard(tmp_path, Policy(utilization_percent=100))
    reservation(tmp_path)

    def cpu():
        assert not (tmp_path / ".lock").exists()
        return "cpu"

    assert (
        guard.run(cpu, lambda: pytest.fail("live reservation was ignored"), lambda: None)
        == "cpu"
    )
    assert (tmp_path / "ccc-gpu-status.json").exists()
    (tmp_path / "fixture.reservation.json").unlink()

    def gpu():
        lock = tmp_path / ".lock"
        assert lock.exists()
        assert json.loads((lock / "owner.json").read_text())["pid"] == os.getpid()
        return "gpu"

    assert guard.run(cpu, gpu, lambda: None) == "gpu"
    (tmp_path / ".lock").mkdir()
    assert (
        guard.run(cpu=lambda: "busy-cpu", gpu=gpu, release_gpu=lambda: None)
        == "busy-cpu"
    )
    assert (tmp_path / ".lock").exists()


def test_startup_partition_is_guarded_and_cpu_selection_hides_cuda(
    tmp_path, monkeypatch
):
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "fixture-original")
    guard = YieldGuard(tmp_path, Policy(utilization_percent=100))
    calls = []

    def apply(service):
        assert (tmp_path / ".lock" / "owner.json").exists()
        calls.append(service)
        return "cuda"

    pending = reservation(tmp_path)
    assert prepare_partition(guard, apply) == "cpu"
    assert calls == [] and os.environ["CUDA_VISIBLE_DEVICES"] == ""
    assert not (tmp_path / ".lock").exists()
    pending.unlink()
    assert prepare_partition(guard, apply) == "cuda"
    assert calls == ["ccc"] and not (tmp_path / ".lock").exists()


def test_partition_setup_does_not_disable_a_later_indexing_window(
    tmp_path, monkeypatch
):
    guard = YieldGuard(tmp_path, Policy())
    monkeypatch.setattr(Policy, "permits", lambda _self, _minute: False)
    assert prepare_partition(guard, lambda _service: "cuda") == "cuda"
    assert (
        guard.run(
            lambda: "cpu", lambda: pytest.fail("index outside window"), lambda: None
        )
        == "cpu"
    )
    monkeypatch.setattr(Policy, "permits", lambda _self, _minute: True)
    assert guard.run(lambda: "cpu", lambda: "gpu", lambda: None) == "gpu"
    disabled = YieldGuard(tmp_path, Policy(utilization_percent=0))
    assert (
        prepare_partition(disabled, lambda _service: pytest.fail("disabled CUDA setup"))
        == "cpu"
    )


@pytest.mark.parametrize(
    "kind,live,expected",
    [
        ("gpu", True, "GPU reservation live"),
        ("gpu", False, None),
        ("cpu", True, None),
        ("unknown", True, "reservation state unreadable"),
    ],
)
def test_reservations(tmp_path, kind, live, expected):
    path = reservation(tmp_path, kind)
    assert reservation_reason(tmp_path, lambda _: live) == expected
    assert path.exists()  # The guard never mutates runner-owned reservations.


@pytest.mark.parametrize("value", ["{", "[]", '{"schema":1}', '{"schema":2}'])
def test_bad_ledger_fails_closed(tmp_path, value):
    (tmp_path / "bad.reservation.json").write_text(value)
    assert reservation_reason(tmp_path) == "reservation state unreadable"


def test_windows_and_validation():
    day = Policy(window="09:00-17:00")
    night = Policy(window="23:00-02:00")
    assert day.permits(540) and not day.permits(1020)
    assert night.permits(1380) and night.permits(60) and not night.permits(120)
    assert Policy().permits(123)
    for window in ["24:00-01:00", "00:60-01:00", "1:00-02:00", "bad"]:
        with pytest.raises(ValueError):
            Policy(window=window)
    with pytest.raises(ValueError):
        Policy(utilization_percent=101)
    with pytest.raises(ValueError):
        Policy(batch_size=5)


def test_yield_and_lock_lifetime(tmp_path):
    guard = YieldGuard(tmp_path, Policy(utilization_percent=100))
    calls = []
    lock = tmp_path / ".lock"

    def cpu():
        assert not lock.exists()
        calls.append("cpu")
        return "cpu"

    def gpu():
        assert json.loads((lock / "owner.json").read_text())["pid"] == os.getpid()
        assert reservation_reason(tmp_path) is None
        child_probe = subprocess.run(
            [
                sys.executable,
                "-c",
                "import os, pathlib, sys; root=sys.argv[1]; "
                "fds=pathlib.Path('/proc/self/fd'); "
                "targets=[os.readlink(fd) for fd in fds.iterdir() "
                "if fd.is_symlink() and os.path.exists(fd)]; "
                "sys.exit(any(target == root or target.startswith(root + '/') "
                "for target in targets))",
                str(lock.resolve()),
            ],
            close_fds=False,
            capture_output=True,
            check=False,
            timeout=5,
        )
        assert child_probe.returncode == 0, child_probe.stderr.decode()
        calls.append("gpu")
        return "gpu"

    def release():
        assert lock.exists()
        calls.append("release")

    path = reservation(tmp_path)
    assert guard.run(cpu, gpu, release) == "cpu"
    assert calls == ["cpu"]
    assert json.loads((tmp_path / "ccc-gpu-status.json").read_text())["deferring"]
    path.unlink()
    assert guard.run(cpu, gpu, release) == "gpu"
    assert calls == ["cpu", "gpu", "release"] and not lock.exists()
    lock.mkdir()
    assert guard.run(lambda: "busy-cpu", gpu, release) == "busy-cpu"
    assert lock.exists()  # A busy/stale foreign lock is never stolen.


def test_admission_cannot_overlap_batch(tmp_path):
    guard = YieldGuard(tmp_path, Policy(utilization_percent=100))
    outcomes = []

    def admit():
        try:
            (tmp_path / ".lock").mkdir()
        except FileExistsError:
            outcomes.append("blocked")

    def gpu():
        thread = threading.Thread(target=admit)
        thread.start()
        thread.join()
        assert outcomes == ["blocked"]

    guard.run(lambda: pytest.fail("unexpected CPU"), gpu, lambda: None)
    (tmp_path / ".lock").mkdir()  # Admission can proceed after cleanup.


def test_unavailable_gpu_and_outside_window_do_not_lock_cpu(tmp_path, monkeypatch):
    guard = YieldGuard(tmp_path, Policy())

    def cpu():
        assert not (tmp_path / ".lock").exists()
        return "cpu"

    def unavailable():
        raise GpuUnavailable

    assert guard.run(cpu, unavailable, lambda: None) == "cpu"
    assert (
        json.loads((tmp_path / "ccc-gpu-status.json").read_text())["reason"]
        == "GPU partition unavailable"
    )
    monkeypatch.setattr(Policy, "permits", lambda _self, _minute: False)
    guard.next_gpu_at = 0
    assert guard.run(cpu, lambda: pytest.fail("outside window"), lambda: None) == "cpu"


def test_duty_limit_disable_and_failure_cleanup(tmp_path, monkeypatch):
    ticks = [10.0]
    monkeypatch.setattr("ccc_gpu_yield.time.monotonic", lambda: ticks[0])
    guard = YieldGuard(tmp_path, Policy(utilization_percent=20))

    def gpu():
        ticks[0] += 1
        return "gpu"

    assert guard.run(lambda: "cpu", gpu, lambda: None) == "gpu"
    assert guard.next_gpu_at == 15
    assert guard.run(lambda: "cpu", gpu, lambda: None) == "cpu"
    ticks[0] = 15
    assert guard.run(lambda: "cpu", gpu, lambda: None) == "gpu"
    disabled = YieldGuard(tmp_path, Policy(utilization_percent=0))
    assert disabled.run(lambda: "cpu", gpu, lambda: None) == "cpu"
    failing = YieldGuard(tmp_path, Policy(utilization_percent=100))
    released = []
    with pytest.raises(ValueError):
        failing.run(
            lambda: None,
            lambda: (_ for _ in ()).throw(ValueError()),
            lambda: released.append(True),
        )
    assert released == [True] and not (tmp_path / ".lock").exists()


def test_embedder_integration_cpu_load_batching_and_gpu_cleanup(tmp_path, monkeypatch):
    events = []
    model = SimpleNamespace()

    def encode(texts, **kwargs):
        device = kwargs["device"]
        if device.startswith("cuda"):
            assert (tmp_path / ".lock").exists()
        events.append((device, len(texts), kwargs["prompt_name"]))
        return [[text] for text in texts]

    model.encode = encode
    model.to = lambda device: events.append(("move", device))

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
    torch = ModuleType("torch")
    torch.cuda = SimpleNamespace(
        synchronize=lambda: events.append(("sync",)),
        empty_cache=lambda: events.append(("empty",)),
    )
    monkeypatch.setitem(sys.modules, "torch", torch)
    partition_calls = []

    def partition(service):
        assert (tmp_path / ".lock").exists()
        partition_calls.append(service)
        return "cuda"

    guard = YieldGuard(tmp_path, Policy(utilization_percent=100))
    install(guard, partition)
    embedder = Embedder()
    loaded = embedder._get_model()
    assert embedder._device is None  # Keep memo/index identity.
    pending = reservation(tmp_path)
    assert loaded.encode([1], prompt_name="query") == [[1]]
    assert (
        partition_calls == []
    )  # Even CUDA initialization waits for reservations to end.
    pending.unlink()
    events.clear()
    assert loaded.encode(list(range(9)), prompt_name="query") == [[i] for i in range(9)]
    assert [e[1] for e in events if e[0] == "cuda:0"] == [4, 4, 1]
    assert partition_calls == ["ccc"]
    assert events.count(("empty",)) == 3
    events.clear()
    reservation(tmp_path)
    assert loaded.encode([1], prompt_name="query") == [[1]]
    assert events == [("cpu", 1, "query")]


def test_cleanup_failure_exits_without_unlocking(tmp_path):
    # A separate fixture process is required to prove os._exit, with no real GPU work.
    source = Path(__file__).parent
    script = f"""
import sys
from pathlib import Path
sys.path.insert(0, {str(source)!r})
from ccc_gpu_yield import Policy, YieldGuard
def broken_cleanup():
    raise AssertionError("fixture cleanup failure")
YieldGuard(Path({str(tmp_path)!r}), Policy()).run(lambda: None, lambda: None, broken_cleanup)
"""
    result = subprocess.run(
        [sys.executable, "-B", "-c", script],
        capture_output=True,
        timeout=10,
        check=False,
    )
    assert result.returncode == 1
    assert b"exiting before admission lock release" in result.stderr
    assert (tmp_path / ".lock" / "owner.json").exists()
