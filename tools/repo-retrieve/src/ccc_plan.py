"""Read-only plan using the installed ccc walk and matcher; never imports its indexer.

Run under ccc's interpreter (as ccc_scope.py is). stdout is JSONL, one file per line.
Unreadable files abort the plan rather than silently undercounting the workload.
"""

import json
import math
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
    if path.suffix.lower() == ".ipynb":
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
        safe = []
        for pattern in request["patterns"]:
            candidate = build_matcher(
                root,
                settings.include_patterns,
                [*settings.exclude_patterns, pattern],
                settings.max_file_size,
            )
            safe.append(
                all(candidate.is_dir_included(directory) for directory in directories)
            )
        print(json.dumps(safe))
        return
    matcher = build_matcher(
        root,
        settings.include_patterns,
        settings.exclude_patterns,
        settings.max_file_size,
    )
    for absolute, relative in iter_included_files(root, root, matcher):
        raw = absolute.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            # ccc process_file skips undecodable content. Keep it in the exact file set.
            text = ""
            category = "data"
        else:
            category = kind(absolute, text)
        print(
            json.dumps(
                {
                    "path": relative.as_posix(),
                    "bytes": len(raw),
                    "est_chunks": math.ceil(len(text) / 800) if text.strip() else 0,
                    "kind": category,
                }
            ),
            flush=True,
        )


main()
