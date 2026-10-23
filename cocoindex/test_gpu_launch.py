"""Exercise ccc supervision and partitioned coexistence without CUDA."""

import fcntl
import os
import runpy
import select
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[1]


def line(process):
    assert select.select([process.stdout], [], [], 5)[0], "child did not acknowledge"
    return process.stdout.readline().strip()


def test_deployed_launcher_selects_gpu_supervisor(monkeypatch, tmp_path):
    handoff = ModuleType("gpu_handoff")
    calls = []
    handoff.supervise = lambda directory, command: (
        calls.append((directory, command)) or 0
    )
    partition = ModuleType("gpu_partition")
    partition.CONTEXT_ALLOWANCE = 512 * 1024**2
    partition.MiB = 1024**2
    partition._free_bytes = lambda _: 10 * 1024**3
    partition.apply = lambda _: "cuda"
    monkeypatch.setitem(sys.modules, "gpu_handoff", handoff)
    monkeypatch.setitem(sys.modules, "gpu_partition", partition)
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0")
    monkeypatch.setattr(sys, "argv", ["launcher"])
    with pytest.raises(SystemExit) as exc:
        runpy.run_path(str(ROOT / "cocoindex/ccc-daemon-launch.py"))
    assert exc.value.code == 0
    assert calls == [
        (
            tmp_path / "agent-resource",
            [
                sys.executable,
                str(ROOT / "cocoindex/ccc-daemon-launch.py"),
                "--gpu-worker",
            ],
        )
    ]
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0"


@pytest.mark.parametrize("free_bytes", [None, 10 * 1024**3])
def test_gpu_worker_installs_adapter_before_daemon(monkeypatch, tmp_path, free_bytes):
    import ccc_gpu_yield

    events = []
    partition = ModuleType("gpu_partition")
    partition.CONTEXT_ALLOWANCE = 512 * 1024**2
    partition.MiB = 1024**2
    partition._free_bytes = lambda _: free_bytes
    partition.apply = lambda _: events.append("cuda") or "cuda"
    monkeypatch.setitem(sys.modules, "gpu_partition", partition)
    monkeypatch.setattr(
        ccc_gpu_yield, "install", lambda *_args, **_kwargs: events.append("adapter")
    )
    cli = ModuleType("cocoindex_code.cli")
    cli.app = lambda: events.append("daemon") or 0
    monkeypatch.setitem(sys.modules, cli.__name__, cli)
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    monkeypatch.setattr(sys, "argv", ["launcher", "--gpu-worker"])
    with pytest.raises(SystemExit) as exc:
        runpy.run_path(str(ROOT / "cocoindex/ccc-daemon-launch.py"))
    assert exc.value.code == 0
    assert events == ["adapter", "daemon"]


@pytest.mark.parametrize("research_before_start", [False, True])
def test_research_want_and_held_slot_do_not_stop_or_withhold_daemon(
    tmp_path, research_before_start
):
    directory = tmp_path / "agent-resource"
    slots = directory / "slots"
    wants = directory / "gpu-wants"
    slots.mkdir(parents=True)
    wants.mkdir()
    with (slots / "gpu.0.0").open("a+") as research:
        if research_before_start:
            fcntl.flock(research, fcntl.LOCK_EX | fcntl.LOCK_NB)
            (wants / "research").write_text(str(os.getpid()))
        supervisor = subprocess.Popen(
            [
                sys.executable,
                "-u",
                "-c",
                "from pathlib import Path; import sys; from gpu_handoff import supervise; sys.exit(supervise(Path(sys.argv[1]),sys.argv[2:]))",
                str(directory),
                sys.executable,
                "-u",
                "-c",
                "import sys; print('serving',flush=True); [print('served:'+x.strip(),flush=True) for x in sys.stdin]",
            ],
            cwd=ROOT / "cocoindex",
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
        try:
            assert line(supervisor) == b"serving"
            fcntl.flock(research, fcntl.LOCK_EX | fcntl.LOCK_NB)
            (wants / "research").write_text(str(os.getpid()))
            supervisor.stdin.write(b"query\n")
            supervisor.stdin.flush()
            assert line(supervisor) == b"served:query"
            assert supervisor.poll() is None
            assert not (directory / "ccc-gpu.lock").exists()
            supervisor.terminate()
            assert supervisor.wait(timeout=5) == 0
        finally:
            if supervisor.poll() is None:
                supervisor.kill()
            supervisor.communicate(timeout=5)


def test_child_exit_status_returns_to_systemd(tmp_path):
    from gpu_handoff import supervise

    assert supervise(tmp_path, [sys.executable, "-c", "raise SystemExit(23)"]) == 23


def test_partition_keeps_1536_mib_allocator_cap(monkeypatch, tmp_path):
    import importlib.util
    from types import SimpleNamespace

    from test_gpu_yield import install_embedder

    path = ROOT / "tools/agent-resource-run/gpu_partition.py"
    spec = importlib.util.spec_from_file_location("partition_under_test", path)
    partition = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(partition)
    fractions = []
    torch = ModuleType("torch")
    torch.float16 = "float16"
    torch.cuda = SimpleNamespace(
        get_device_properties=lambda _: SimpleNamespace(total_memory=12288 * 1024**2),
        set_per_process_memory_fraction=lambda fraction, device: fractions.append(
            (fraction, device)
        ),
    )
    monkeypatch.setitem(sys.modules, "torch", torch)
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
    monkeypatch.setitem(sys.modules, "gpu_partition", partition)
    model = SimpleNamespace(
        to=lambda **_: None,
        encode=lambda texts, **_: [[text] for text in texts],
    )
    Embedder = install_embedder(monkeypatch, model)
    cli = ModuleType("cocoindex_code.cli")

    def serve():
        loaded = Embedder()._get_model()
        for headroom in (10000, 11000):
            free_mib[0] = headroom
            assert loaded.encode(["chunk"] * 17) == [["chunk"]] * 17
            assert all(fraction * 12288 <= 1536 for fraction, _ in fractions)
        return 0

    cli.app = serve
    monkeypatch.setitem(sys.modules, cli.__name__, cli)
    monkeypatch.setenv("XDG_RUNTIME_DIR", str(tmp_path))
    monkeypatch.setattr(sys, "argv", ["launcher", "--gpu-worker"])
    with pytest.raises(SystemExit) as exc:
        runpy.run_path(str(ROOT / "cocoindex/ccc-daemon-launch.py"))
    assert exc.value.code == 0
    assert fractions == [(1536 / 12288, 0)]
    assert os.environ["CUDA_VISIBLE_DEVICES"] == "0"
