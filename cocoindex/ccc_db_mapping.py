"""The daemon's COCOINDEX_CODE_DB_PATH_MAPPING, derived from the one declaration.

cocoindex/db-root holds the index DB root relative to $HOME. zsh/zshenv builds the client's
mapping from the same file, so client and daemon cannot name different directories.
"""

import os
from pathlib import Path, PurePosixPath

DECLARATION = Path(__file__).resolve().parent / "db-root"
ENV = "COCOINDEX_CODE_DB_PATH_MAPPING"


def mapping(home: str, declaration: Path = DECLARATION) -> str:
    relative = declaration.read_text(encoding="utf-8").strip()
    path = PurePosixPath(relative)
    if relative == "" or path.is_absolute() or ".." in path.parts:
        raise ValueError(f"{declaration}: expected a non-empty path relative to $HOME")
    return f"{home}={home}/{relative}"


def install(home: str | None = None) -> str:
    value = mapping(home if home is not None else str(Path.home()))
    os.environ[ENV] = value
    return value
