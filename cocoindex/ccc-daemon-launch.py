"""Start the ccc daemon inside its standing VRAM partition (ExecStart of ccc-daemon.service.wsl).

Exactly `ccc run-daemon`, after agents/resource-control/gpu_partition.py has capped this process to
`gpu_partition_ccc_mib` (resource-policy.toml) — or hidden the GPU when that much is not free, so the
embedder runs on CPU instead of growing into research jobs' memory. Run under ccc's own
interpreter (the unit names it), so cocoindex_code imports from the same environment `ccc` uses.
"""

import sys
from pathlib import Path

DOTFILES = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DOTFILES / "agents" / "resource-control"))

from gpu_partition import apply  # noqa: E402 — must run before torch is imported

apply("ccc")

from cocoindex_code.cli import app  # noqa: E402

sys.argv = ["ccc", "run-daemon"]
sys.exit(app())
