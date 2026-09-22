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

```sh
mise run test:retrieval-control   # fake ccc/rg executables; no real index needed
```
