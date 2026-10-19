"""Event-driven ownership of the entire ccc CUDA process, including idle contexts.

Research announces wants before waiting for a shared ccc-gpu.lock. The supervisor
owns that lock exclusively through child exit. No grace timer acknowledges release.
Embeddings are deferred while research owns the device; restarting the daemon keeps
CUDA out of its supervisor and avoids pretending empty_cache destroys a context.
"""

import ctypes
import fcntl
import os
import select
import signal
import struct
import subprocess
import threading
from pathlib import Path
from typing import BinaryIO


class Changes:
    """Watch before inspecting state, so a transition cannot be lost before wait."""

    def __init__(self, directory: Path):
        self.libc = ctypes.CDLL(None, use_errno=True)
        self.fd = self.libc.inotify_init1(os.O_CLOEXEC | os.O_NONBLOCK)
        if self.fd < 0:
            raise OSError(ctypes.get_errno(), "inotify_init1")
        try:
            for name in ("gpu-wants", "slots"):
                path = directory / name
                path.mkdir(mode=0o700, parents=True, exist_ok=True)
                # create/delete/move/close: slot existence alone is not ownership.
                if self.libc.inotify_add_watch(self.fd, os.fsencode(path), 0x3D8) < 0:
                    raise OSError(ctypes.get_errno(), "inotify_add_watch")
        except BaseException:
            self.close()
            raise

    def wait(self):
        while True:
            select.select([self.fd], [], [])
            if self.read():
                return

    def read(self) -> bool:
        """Ignore directory-close events produced by our own state enumeration."""
        try:
            events = os.read(self.fd, 65536)
        except BlockingIOError:
            return False
        changed = False
        offset = 0
        while offset < len(events):
            _watch, mask, _cookie, name_length = struct.unpack_from(
                "iIII", events, offset
            )
            changed |= bool(name_length and not mask & 0x40000000) or bool(
                mask & 0x4000
            )
            offset += 16 + name_length
        return changed

    def close(self):
        os.close(self.fd)


def research_pending(directory: Path, handles: dict[Path, BinaryIO]) -> bool:
    if any((directory / "gpu-wants").iterdir()):
        return True
    for path in (directory / "slots").glob("gpu.*"):
        # Keep probe descriptors open: our own closes must not wake the watcher.
        if path not in handles:
            handles[path] = path.open("rb")
        handle = handles[path]
        try:
            fcntl.flock(handle, fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
    return False


def install_release_handler(serial: threading.Lock):
    """SIGUSR1 closes the GPU process only after its current batch returns."""
    requested = threading.Event()

    def release():
        requested.wait()
        with serial:
            os._exit(0)  # Process exit, rather than allocator cleanup, destroys CUDA.

    signal.signal(signal.SIGUSR1, lambda *_: requested.set())
    threading.Thread(target=release, daemon=True).start()
    return requested


def supervise(directory: Path, command: list[str]) -> int:
    """Hold exclusive ownership through child death; resume only on filesystem events."""
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    changes = Changes(directory)
    child = None
    stopped = False
    handles: dict[Path, BinaryIO] = {}

    def pending():
        return research_pending(directory, handles)

    def stop(*_):
        nonlocal stopped
        stopped = True
        if child is not None:
            child.terminate()
        # Wake the inotify wait for an operator stop too.
        (directory / "gpu-wants" / f"supervisor-stop-{os.getpid()}").touch()

    old = {sig: signal.signal(sig, stop) for sig in (signal.SIGTERM, signal.SIGINT)}
    try:
        with (directory / "ccc-gpu.lock").open("a+") as ownership:
            while not stopped:
                if pending():
                    changes.wait()
                    continue
                try:
                    fcntl.flock(ownership, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    changes.wait()
                    continue
                try:
                    # A want may have arrived between the first check and acquisition.
                    if pending():
                        continue
                    child = subprocess.Popen(command, pass_fds=(ownership.fileno(),))
                    # pidfd is an event source for child exit, not a polling interval.
                    pidfd = os.pidfd_open(child.pid)
                    release_sent = False
                    try:
                        while child.poll() is None:
                            ready, _, _ = select.select([changes.fd, pidfd], [], [])
                            if (
                                changes.fd in ready
                                and changes.read()
                                and not release_sent
                                and pending()
                            ):
                                release_sent = True
                                child.send_signal(signal.SIGUSR1)
                        code = child.wait()
                    finally:
                        os.close(pidfd)
                    child = None
                    if not pending() and not stopped:
                        return code  # Unexpected exit: systemd owns restart policy.
                finally:
                    # Never acknowledge release until the CUDA process is dead.
                    if child is not None:
                        child.terminate()
                        child.wait()
                        child = None
                    fcntl.flock(ownership, fcntl.LOCK_UN)
    finally:
        for handle in handles.values():
            handle.close()
        changes.close()
        (directory / "gpu-wants" / f"supervisor-stop-{os.getpid()}").unlink(
            missing_ok=True
        )
        for sig, handler in old.items():
            signal.signal(sig, handler)
    return 0
