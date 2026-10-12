"""Start ccc with reservation-aware GPU batches; never load the resident model onto CUDA.

Run under ccc's own interpreter (the unit names it). The existing standing VRAM partition
still caps GPU batches, but their admission now yields to agent-resource-run's live ledger.
"""

import os
import sys
from pathlib import Path

DOTFILES = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DOTFILES / "tools" / "agent-resource-run"))

from ccc_gpu_yield import (
    Policy,
    YieldGuard,
    install,
    prepare_partition,
    state_directories,
)
from gpu_partition import apply

# The patched adapter and lock must stay in this process, including direct launcher use.
os.environ["COCOINDEX_RUN_GPU_IN_SUBPROCESS"] = "0"
directories = state_directories()
guard = YieldGuard(directories[0], Policy.from_environment(), directories[1:])
partition_mode = prepare_partition(guard, apply)
install(guard, lambda _service: partition_mode)

from cocoindex_code.cli import app

sys.argv = ["ccc", "run-daemon"]
sys.exit(app())
