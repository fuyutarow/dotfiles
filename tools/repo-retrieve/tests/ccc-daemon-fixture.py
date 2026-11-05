"""Real ccc daemon with only its embedding model replaced for the integration test."""

import sys
from pathlib import Path

import numpy as np
from cocoindex.resources.schema import VectorSchema
from cocoindex_code import daemon

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "cocoindex"))
from ccc_no_implicit_index import install


class Embedder:
    async def embed(self, text, **kwargs):
        return np.ones(8, dtype=np.float32)

    async def __coco_vector_schema__(self):
        return VectorSchema(dtype=np.dtype(np.float32), size=8)


daemon.create_embedder = lambda *args, **kwargs: Embedder()
install()
from cocoindex_code.cli import app

sys.argv = ["ccc", "run-daemon"]
app()
