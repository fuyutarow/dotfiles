#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["huggingface_hub"]
# ///
"""Free huggingface_hub cache entries no ref points to anymore ("detached" revisions).

House reclaim:clean tier: tool-native gc, borrowed from huggingface_hub's own accounting of what
counts as safe to remove -- a revision with zero refs pointing to it (left behind after a repo's
default branch moved, or a specific commit was pulled once and never reused). A revision still
reachable by ANY ref (main, a tag, a pinned commit some project still requests) is never touched.
There is no bare `huggingface-cli` flag for "delete only detached revisions" -- only the Python
API (`scan_cache_dir().delete_revisions(...)`) exposes the per-revision `refs` set this needs.

PEP 723 single-file script: `uv run scripts/huggingface-gc.py` resolves huggingface_hub into an
ephemeral environment with no persistent install and no project pyproject.toml/uv.lock needed
(scripts/reclaim-clean.ts invokes it exactly this way).

Best-effort like every other reclaim:clean step: any failure here (huggingface_hub unimportable, a
malformed/corrupt cache) prints one line and exits 0 rather than aborting the rest of the pass.
"""

import sys


def main() -> int:
    try:
        from huggingface_hub import scan_cache_dir
    except ImportError as error:
        print(f"huggingface_hub not available: {error}")
        return 0

    try:
        cache_info = scan_cache_dir()
    except Exception as error:  # noqa: BLE001 - best-effort, see module docstring
        print(f"scan failed: {error}")
        return 0

    detached = [
        revision.commit_hash
        for repo in cache_info.repos
        for revision in repo.revisions
        if len(revision.refs) == 0
    ]
    if not detached:
        print("no detached revisions")
        return 0

    strategy = cache_info.delete_revisions(*detached)
    print(f"freeing {strategy.expected_freed_size_str} across {len(detached)} detached revision(s)")
    strategy.execute()
    return 0


if __name__ == "__main__":
    sys.exit(main())
