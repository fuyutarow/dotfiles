"""Keep daemon reads from starting index work before rr admission."""

from pathlib import Path

from cocoindex_code import daemon
from cocoindex_code.project import Project
from cocoindex_code.protocol import (
    ErrorResponse,
    ProjectStatusRequest,
    ProjectStatusResponse,
    SearchRequest,
)
from cocoindex_code.settings import target_sqlite_db_path


def install() -> None:
    original_dispatch = daemon._dispatch

    async def dispatch(req, *args, **kwargs):
        if isinstance(req, (ProjectStatusRequest, SearchRequest)) and not target_sqlite_db_path(
            Path(req.project_root)
        ).is_file():
            if isinstance(req, ProjectStatusRequest):
                return ProjectStatusResponse(
                    indexing=False,
                    total_chunks=0,
                    total_files=0,
                    languages={},
                    progress=None,
                    index_exists=False,
                )
            return ErrorResponse(message="Index not created; run rr index after admission.")
        return await original_dispatch(req, *args, **kwargs)

    async def no_implicit_start(self):
        # An explicit IndexRequest may already hold the lock; search then waits
        # for that request. Existing indexes are served as-is after restart.
        if not self._index_lock.locked():
            self._initial_index_done.set()

    daemon._dispatch = dispatch
    Project.ensure_indexing_started = no_implicit_start
