"""Which of these project-relative paths would ccc index? Run by ccc-scope.ts under ccc's OWN
interpreter (the `ccc` script's shebang), so the answer comes from ccc's matcher itself —
include/exclude globs plus nested .gitignore — not from a reimplementation that could drift.

stdin: JSON list of paths relative to the project root. argv[1]: project root.
stdout: JSON list of the paths that are in scope.

Every approximation errs toward IN scope, because in scope means "the index may be stale":
- the size limit is not applied (a too-large file would only have been dropped);
- a changed .gitignore or .cocoindex_code/settings.yml changes the scope itself, so it counts.
"""

import json
import sys
from pathlib import Path, PurePath

from cocoindex_code.file_walk import build_matcher
from cocoindex_code.settings import load_project_settings


def main() -> None:
    root = Path(sys.argv[1])
    paths = json.load(sys.stdin)
    settings = load_project_settings(root)
    matcher = build_matcher(root, settings.include_patterns, settings.exclude_patterns)

    def in_scope(path: str) -> bool:
        pure = PurePath(path)
        if pure.name == ".gitignore" or path == ".cocoindex_code/settings.yml":
            return True
        # ccc prunes an excluded directory before it ever looks at the files inside.
        for depth in range(1, len(pure.parts)):
            if not matcher.is_dir_included(PurePath(*pure.parts[:depth])):
                return False
        return matcher.is_file_included(pure)

    json.dump([p for p in paths if in_scope(p)], sys.stdout)


main()
