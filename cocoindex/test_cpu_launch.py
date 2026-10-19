"""Exercise the launcher without importing torch or opening GPU devices."""

import os
import runpy
import sys
from dataclasses import dataclass, field
from pathlib import Path
from types import ModuleType

import pytest


@dataclass
class Embedding:
    device: str = "cuda"


@dataclass
class Settings:
    embedding: Embedding = field(default_factory=Embedding)
    envs: dict[str, str] = field(
        default_factory=lambda: {
            "CUDA_VISIBLE_DEVICES": "0",
            "COCOINDEX_RUN_GPU_IN_SUBPROCESS": "1",
            "OMP_NUM_THREADS": "4",
        }
    )


def test_launcher_overrides_global_cuda_policy(monkeypatch):
    original = Settings()
    package = ModuleType("cocoindex_code")
    daemon = ModuleType("cocoindex_code.daemon")
    daemon.load_user_settings = lambda: original
    package.daemon = daemon
    cli = ModuleType("cocoindex_code.cli")

    def app():
        assert os.environ["CUDA_VISIBLE_DEVICES"] == ""
        assert os.environ["COCOINDEX_RUN_GPU_IN_SUBPROCESS"] == "0"
        settings = daemon.load_user_settings()
        assert settings.embedding.device == "cpu"
        assert settings.envs["CUDA_VISIBLE_DEVICES"] == ""
        assert settings.envs["COCOINDEX_RUN_GPU_IN_SUBPROCESS"] == "0"
        assert settings.envs["OMP_NUM_THREADS"] == "4"
        assert original.embedding.device == "cuda"
        assert original.envs["CUDA_VISIBLE_DEVICES"] == "0"
        assert sys.argv == ["ccc", "run-daemon"]
        return 0

    cli.app = app
    for module in (package, daemon, cli):
        monkeypatch.setitem(sys.modules, module.__name__, module)
    monkeypatch.setenv("CUDA_VISIBLE_DEVICES", "0")
    monkeypatch.setenv("COCOINDEX_RUN_GPU_IN_SUBPROCESS", "1")
    monkeypatch.setattr(sys, "argv", ["launcher"])
    with pytest.raises(SystemExit) as exc:
        runpy.run_path(str(Path(__file__).with_name("ccc-daemon-launch.py")))
    assert exc.value.code == 0
