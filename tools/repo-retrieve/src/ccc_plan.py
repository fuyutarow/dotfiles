"""Read-only plan using the installed ccc walk and matcher; never imports its indexer.

Run under ccc's interpreter (as ccc_scope.py is). stdout is JSONL, one file per line.
Unreadable files abort the plan rather than silently undercounting the workload.
"""

import json
import math
import re
import stat
import sys
from pathlib import Path, PurePath

from cocoindex_code.file_walk import build_matcher, iter_included_files
from cocoindex_code.settings import load_project_settings

DATA_EXTENSIONS = {
    ".json",
    ".jsonl",
    ".csv",
    ".tsv",
    ".parquet",
    ".ndjson",
    ".log",
    ".lock",
    ".svg",
}


def kind(path: Path, text: str) -> str:
    if path.suffix.lower() in DATA_EXTENSIONS or path.name.lower().endswith(".min.js"):
        return "data"
    if path.suffix.lower() == ".ipynb" and text:
        notebook = json.loads(text)
        if any(cell.get("outputs") for cell in notebook.get("cells", [])):
            return "data"
    if not text:
        return "text"
    # Content rules also catch machine output with a code/prose extension.
    lines = text.splitlines()
    longest = max(map(len, lines), default=0)
    nonspace = [c for c in text if not c.isspace()]
    numeric_punctuation = sum(c.isdigit() or not c.isalnum() for c in nonspace)
    if longest > 4000 or (
        len(nonspace) > 200 and numeric_punctuation / len(nonspace) > 0.60
    ):
        return "data"
    if len(text) > 2000 and len(lines) < len(text) / 1000:
        return "data"
    return "text"


def main() -> None:
    root = Path(sys.argv[1]).resolve()
    settings = load_project_settings(root)
    if len(sys.argv) > 2 and sys.argv[2] == "--validate-excludes":
        request = json.load(sys.stdin)
        directories = {
            parent
            for path in request["paths"]
            for parent in PurePath(path).parents
            if parent != PurePath(".")
        }
        patterns = request["patterns"]
        # The caller supplies escaped exact paths, never general globs or
        # negations. Enforce that contract before using a single union matcher.
        literals = [re.sub(r"\\(.)", r"\1", pattern) for pattern in patterns]
        for literal, pattern in zip(literals, patterns, strict=True):
            escaped = "".join(
                f"\\{char}" if char in "\\*?[]{}!" else char for char in literal
            )
            if escaped != pattern:
                raise ValueError(
                    f"exclude suggestion must be an escaped exact path: {pattern}"
                )
        candidate = build_matcher(
            root,
            settings.include_patterns,
            [*settings.exclude_patterns, *patterns],
            settings.max_file_size,
        )
        pruned = {
            directory.as_posix()
            for directory in directories
            if not candidate.is_dir_included(directory)
        }
        # An exact exclusion can prune only its own directory and descendants.
        # Every ancestor is present, so its own path must appear in pruned.
        # Preserve independent answers, including directory names like x.json.
        safe = [literal not in pruned for literal in literals]
        print(json.dumps(safe))
        return
    matcher = build_matcher(
        root,
        settings.include_patterns,
        settings.exclude_patterns,
        settings.max_file_size,
    )
    # Policy lives in index-plan.ts. Metadata for every effective candidate is
    # retained, but rejected workloads never require unbounded content reads.
    limits = json.loads(sys.argv[3]) if sys.argv[2:3] == ["--limits"] else None
    if limits is None:
        raise ValueError("planner requires content limits from index-plan.ts")
    allowances = limits.get("file_byte_allowances", {})
    for name in allowances:
        candidate = root / name
        if candidate.resolve() != candidate or candidate.is_dir():
            raise ValueError(f"noncanonical file byte allowance: {name}")
    total_bytes = 0
    for absolute, relative in iter_included_files(root, root, matcher):
        if relative.as_posix() in allowances and absolute.resolve() != root / relative:
            raise ValueError(f"noncanonical candidate: {relative}")
        file_limit = allowances.get(relative.as_posix(), limits["max_file_bytes"])
        metadata = absolute.stat()
        size = metadata.st_size
        total_bytes += size
        blob = not stat.S_ISREG(metadata.st_mode)
        category = kind(absolute, "")
        chunks = math.ceil(size / 800)
        if not blob and size <= file_limit and total_bytes <= limits["max_total_bytes"]:
            with absolute.open("rb") as stream:
                # One extra byte detects growth after stat without reading a
                # concurrently growing file to EOF. Oversized files aren't opened.
                raw = stream.read(min(file_limit, limits["max_total_bytes"]) + 1)
            size = max(size, len(raw))
            total_bytes += size - metadata.st_size
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                blob = True
                text = ""
            # UTF-8 decoding alone accepts NULs and other binary control bytes.
            blob = (
                blob
                or any(byte < 32 and byte not in (9, 10, 12, 13) for byte in raw)
                or b"\x7f" in raw
            )
            category = "data" if blob else kind(absolute, text)
            chunks = math.ceil(len(text) / 800) if text.strip() else 0
        if blob:
            category = "data"
        print(
            json.dumps(
                {
                    "path": relative.as_posix(),
                    "bytes": size,
                    "est_chunks": chunks,
                    "kind": category,
                    "blob": blob,
                }
            ),
            flush=True,
        )


main()
