"""Run the supervised support daemon on CPU, without GPU admission code.

EmbeddingSettings.device is CocoIndex's SentenceTransformers device option.
Apply host policy in memory so shared macOS settings stay unchanged.
"""

import os
import sys
from dataclasses import replace

# Set before importing CocoIndex/PyTorch, including direct launcher use.
os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["COCOINDEX_RUN_GPU_IN_SUBPROCESS"] = "0"

from cocoindex_code import daemon
from cocoindex_code.cli import app

load_settings = daemon.load_user_settings


def load_cpu_settings():
    """Override global CUDA settings through the native device option."""
    settings = load_settings()
    return replace(
        settings,
        embedding=replace(settings.embedding, device="cpu"),
        envs=settings.envs
        | {"CUDA_VISIBLE_DEVICES": "", "COCOINDEX_RUN_GPU_IN_SUBPROCESS": "0"},
    )


daemon.load_user_settings = load_cpu_settings
sys.argv = ["ccc", "run-daemon"]
sys.exit(app())
