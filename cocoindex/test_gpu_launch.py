"""Exercise the deployed GPU entrypoint and real flock/inotify handoff without CUDA."""

import fcntl
import os
import runpy
import select
import subprocess
import sys
import threading
from pathlib import Path
from types import ModuleType

import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_legacy_slot_close_wakes_inotify_and_wants_prevent_resume(tmp_path):
    from gpu_handoff import Changes, research_pending

    slots = tmp_path / "slots"
    slots.mkdir()
    research = (slots / "gpu.9").open("a+")
    fcntl.flock(research, fcntl.LOCK_EX)
    changes = Changes(tmp_path)
    probes = {}
    try:
        assert research_pending(tmp_path, probes)
        # Probes retain their descriptors; they must not wake their own watcher.
        assert not changes.read()
        research.close()
        assert select.select([changes.fd], [], [], 5)[0]
        changes.wait()
        assert not research_pending(tmp_path, probes)
        want = tmp_path / "gpu-wants" / "another-research-job"
        want.touch()
        assert research_pending(tmp_path, probes)
        want.unlink()
        assert not research_pending(tmp_path, probes)
    finally:
        research.close()
        changes.close()
        for handle in probes.values():
            handle.close()


def line(process):
    assert select.select([process.stdout], [], [], 5)[0], "child did not acknowledge"
    return process.stdout.readline().strip()


def test_deployed_launcher_selects_gpu_supervisor(monkeypatch, tmp_path):
    handoff = ModuleType("gpu_handoff")
    handoff.install_release_handler = lambda _: None
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


def test_gpu_worker_installs_adapter_before_daemon(monkeypatch, tmp_path):
    import ccc_gpu_yield
    import gpu_handoff

    events = []
    partition = ModuleType("gpu_partition")
    partition.CONTEXT_ALLOWANCE = 512 * 1024**2
    partition.MiB = 1024**2
    partition._free_bytes = lambda _: 10 * 1024**3
    partition.apply = lambda _: events.append("cuda") or "cuda"
    monkeypatch.setitem(sys.modules, "gpu_partition", partition)
    monkeypatch.setattr(
        gpu_handoff,
        "install_release_handler",
        lambda _: events.append("handler") or threading.Event(),
    )
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
    assert events == ["handler", "cuda", "adapter", "daemon"]


def test_research_waits_for_process_exit_then_ccc_resumes(tmp_path):
    worker = tmp_path / "worker.py"
    worker.write_text("""
import os, signal, sys, threading
sys.path.insert(0, sys.argv[1])
from gpu_handoff import install_release_handler
serial = threading.Lock()
with serial:
    requested = install_release_handler(serial)
    original = signal.getsignal(signal.SIGUSR1)
    def request(*args):
        print("yield-requested", flush=True)
        original(*args)
    signal.signal(signal.SIGUSR1, request)
    print("batch-started", flush=True)
    sys.stdin.readline()
requested.wait()
threading.Event().wait()
""")
    directory = tmp_path / "agent-resource"
    supervisor = subprocess.Popen(
        [
            sys.executable,
            "-u",
            "-c",
            "from pathlib import Path; import sys; from gpu_handoff import supervise; sys.exit(supervise(Path(sys.argv[1]),sys.argv[2:]))",
            str(directory),
            sys.executable,
            "-u",
            str(worker),
            str(ROOT / "cocoindex"),
        ],
        cwd=ROOT / "cocoindex",
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        bufsize=0,
    )
    research = None
    try:
        assert line(supervisor) == b"batch-started"
        want = directory / "gpu-wants" / "fake-research"
        want.touch()
        assert line(supervisor) == b"yield-requested"
        # Use the exact runner wrapper, including bounded flock -w, without systemd or CUDA.
        command = [
            sys.executable,
            "-u",
            "-c",
            "import sys; print('admitted',flush=True); sys.stdin.read()",
        ]
        import json

        argv = subprocess.check_output(
            [
                "bun",
                "-e",
                "import {cccHandoffLock} from './tools/agent-resource-run/src/agent-resource-run.ts'; console.log(JSON.stringify(cccHandoffLock(process.argv[1],5,JSON.parse(process.argv[2]))))",
                str(directory),
                json.dumps(
                    ["flock", "-F", "-w", "5", str(directory / "slots/gpu.0"), *command]
                ),
            ],
            cwd=ROOT,
            text=True,
        )
        research = subprocess.Popen(
            json.loads(argv),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
        assert supervisor.poll() is None, supervisor.stderr.read().decode()
        with (
            (directory / "ccc-gpu.lock").open("rb") as handle,
            pytest.raises(BlockingIOError),
        ):
            fcntl.flock(handle, fcntl.LOCK_SH | fcntl.LOCK_NB)
        assert (
            research.poll() is None
        )  # Release is gated by the batch, never by a timer.
        supervisor.stdin.write(b"finish batch\n")
        supervisor.stdin.flush()
        assert line(research) == b"admitted"
        with (
            (directory / "ccc-gpu.lock").open("rb") as handle,
            pytest.raises(BlockingIOError),
        ):
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with (
            (directory / "slots/gpu.0").open("rb") as handle,
            pytest.raises(BlockingIOError),
        ):
            fcntl.flock(handle, fcntl.LOCK_SH | fcntl.LOCK_NB)
        research.communicate(timeout=5)
        assert research.returncode == 0
        want.unlink()
        assert line(supervisor) == b"batch-started"
    finally:
        if research is not None and research.poll() is None:
            research.kill()
            research.communicate(timeout=5)
        supervisor.terminate()
        supervisor.communicate(timeout=5)
