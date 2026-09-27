# retrieval-control — `repo-retrieve`

The declared query-shape router. A caller names the SHAPE of the lookup and the router picks the
engine; in an operational ccc repo the `enforce-search-route` hook denies raw search and points
here.

```text
concept/battery -> ccc search    literal/exhaustive/files -> rg
structural      -> ccc grep      symbol                   -> Serena (exit 2 with the route)
index           -> ccc index, then record the freshness watermark
```

| file | responsibility |
|---|---|
| `repo-retrieve.ts` | the CLI (Cleye) and the routes — the only entry point |
| `ccc-index.ts` | ccc index adapter: registration lookup, the `.cocoindex_code/INDEXED_AT` watermark, the NO_INDEX gate concept/battery run before serving, and the `index` action (the watermark's only writer) |
| `child.ts` | bounded child-process helpers (exit 124 on timeout) |

Entry points: `bun ~/.claude/hooks/repo-retrieve.ts` (guaranteed; a symlink in the linked hooks
dir) and the PATH command `repo-retrieve` (package `bin`, installed by `mise run deps`).
ccc's own configuration — global settings and the capped daemon unit — stays in `cocoindex/`.

Search another corpus from the current repository with `--project`. It selects one target
directory; `--path` (`-p`) narrows files inside that target. Semantic routes require the selected
directory to be a registered ccc project root and retain its own freshness gate. The `index`
command still operates on the current repository; enter the target first to index it.

```sh
repo-retrieve concept --project ~/Workspace/soks --path knowledge --query 'known reduction'
repo-retrieve literal --project ~/Workspace/soks --path knowledge --query 'exact phrase'
```

The search hook permits one stream-only display filter after a classified route, for example
`repo-retrieve literal --query 'phrase' | grep -F -- 'file.md'`. The filter accepts a pattern
only, with no file operand or second pipeline stage. Filtered output is not an absence check:
rerun the router without a filter before making an absence claim.
Likewise, `| head -3` intentionally truncates output; the router exits quietly when the reader
closes the pipe.

```sh
mise run test:retrieval-control   # fake ccc/rg executables; no real index needed
```
