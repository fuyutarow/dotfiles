"""Real ccc daemon whose embedder is slow and counts calls, so a build outlives a short budget.

Every embed call appends one line to the file named by RR_FIXTURE_EMBED_LOG; a test reads the
line count at two moments to prove whether the daemon is still building.
"""

import asyncio
import os
import sys
from pathlib import Path

import numpy as np
from cocoindex.resources.schema import VectorSchema
from cocoindex_code import daemon

LOG = Path(os.environ["RR_FIXTURE_EMBED_LOG"])
DELAY = float(os.environ.get("RR_FIXTURE_EMBED_DELAY", "0.25"))


class Embedder:
    def __init__(self):
        # Serialised so total build time is calls x DELAY however the indexer fans out.
        self.gate = asyncio.Lock()

    async def embed(self, text, **kwargs):
        async with self.gate:
            with LOG.open("a") as handle:
                handle.write("embed\n")
            await asyncio.sleep(DELAY)
        return np.ones(8, dtype=np.float32)

    async def __coco_vector_schema__(self):
        return VectorSchema(dtype=np.dtype(np.float32), size=8)


daemon.create_embedder = lambda *args, **kwargs: Embedder()
from cocoindex_code.cli import app

sys.argv = ["ccc", "run-daemon"]
app()
