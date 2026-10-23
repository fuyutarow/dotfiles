"""Supervise ccc independently of research GPU reservations."""

import signal
import subprocess
from pathlib import Path


def supervise(directory: Path, command: list[str]) -> int:
    """Forward operator stops; return child exit status to systemd for restart."""
    child = None
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True
        if child is not None and child.poll() is None:
            child.terminate()

    old = {sig: signal.signal(sig, stop) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        if stopped:
            return 0
        child = subprocess.Popen(command)
        # A signal may arrive while Popen returns, before child is assigned.
        if stopped and child.poll() is None:
            child.terminate()
        code = child.wait()
        return 0 if stopped else code
    finally:
        if child is not None and child.poll() is None:
            child.terminate()
            child.wait()
        for sig, handler in old.items():
            signal.signal(sig, handler)
