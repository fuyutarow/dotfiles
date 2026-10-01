# retrieval-control — `repo-retrieve`

The declared query-shape router. A caller names the SHAPE of the lookup and the router picks the
engine; in an operational ccc repo the `enforce-search-route` hook denies raw search and points
here.

```text
concept/battery -> ccc search    literal/exhaustive/files -> rg
structural      -> ccc grep      symbol                   -> Serena (exit 2 with the route)
definition      -> definition catalog + reranker: "does something that does X already exist?"
index           -> ccc index, then record the freshness watermark (and warm the definition catalog)
```

| file | responsibility |
|---|---|
| `repo-retrieve.ts` | the CLI (Cleye) and the routes — the only entry point |
| `ccc-index.ts` | ccc index adapter: registration lookup, the `.cocoindex_code/INDEXED_AT` watermark, the NO_INDEX gate concept/battery run before serving, and the `index` action (the watermark's only writer) |
| `child.ts` | bounded child-process helpers (exit 124 on timeout) |
| `definitions.ts` | the `definition` route: catalog freshness, recall, rerank, cards |
| `ccc_defs.py` | definition extractor under ccc's interpreter (ccc's scope + tree-sitter patterns), per-file cache |
| `rerank_server.py` | resident cross-encoder (Qwen3-Reranker-0.6B), socket-activated, inside its VRAM partition |
| `bench-definitions.ts` | the yardstick: top-1/3/10 per language + absence, on a private case file |

Entry points: `bun ~/.claude/hooks/repo-retrieve.ts` (guaranteed; a symlink in the linked hooks
dir) and the PATH command `repo-retrieve` (package `bin`, installed by `mise run deps`).
ccc's own configuration — global settings and the capped daemon unit — stays in `cocoindex/`.

Search another corpus from the current repository with `--project`. It selects one target
directory; `--path` (`-p`) narrows files inside that target. Semantic routes require the selected
directory to be a registered ccc project root and retain its own freshness gate. The `index`
command still operates on the current repository; enter the target first to index it.

```sh
rr about --project ~/Workspace/soks --path knowledge --query 'known reduction'
rr text --project ~/Workspace/soks --path knowledge --query 'exact phrase'
```

The search hook permits one stream-only display filter after a classified route, for example
`rr text --query 'phrase' | grep -F -- 'file.md'`. The filter accepts a pattern
only, with no file operand or second pipeline stage. Filtered output is not an absence check:
rerun the router without a filter before making an absence claim.
Likewise, `| head -3` intentionally truncates output; the router exits quietly when the reader
closes the pipe.

```sh
mise run test:retrieval-control   # fake ccc/rg executables; no real index needed
```

## `definition` — before writing a function

```sh
rr exists --query 'Int16 の加算を飽和させて折り返さないようにする'
```

Describe the behaviour (English or Japanese), not the name. The answer is a few cards — name,
signature, location, the first doc line — then one of:

| RESULT | exit | meaning |
|---|---|---|
| `PASS strength=strong` | 0 | the top card is the same function (reranker log-odds ≥ 4) |
| `PASS strength=likely` | 0 | read the top cards before writing a new one |
| `NO_DEFINITION` | 1 | nothing in the catalog does this; the cards are the nearest, not matches |
| `UNRANKED` | 0 | the reranker was unavailable: embedding order, no judgement |

Covered: functions and types the extractor recognises (Julia, Python, TypeScript/JavaScript,
Rust). Not covered: inline code inside a script body — use `concept` for that.

The same check runs by itself: `agents/claude/hooks/suggest-existing-definition.ts` (PostToolUse on
Write/Edit) reports a STRONG match for a newly written definition to the model, within an 8 s budget,
reading the catalog as it stands.

### Pipeline and GPU

1. **Catalog** (`~/.cache/repo-retrieve/catalog/<hash>/`): one markdown entry per definition,
   indexed as its own ccc project by the shared daemon. Freshness: same HEAD and unchanged known
   files → reuse (a few ms); otherwise only the changed files are re-parsed; a full git check at
   most once a minute, so a brand-new file joins within 60 s.
2. **Recall**: 40 hits from the catalog; an internal helper (`_x`, `x_kernel!`, `_impl`…) nominates
   the public definition in its file that calls it.
3. **Rerank**: `rerank_server.py`, enabled by `mise run wsl:rerank` (systemd socket activation,
   idle exit after 5 min). It lives in a FIXED VRAM partition, `gpu_partition_rerank_mib` in
   `agents/resource-control/resource-policy.toml`, hard-capped in-process by
   `agents/resource-control/gpu_partition.py`; agent-resource-run reserves the same partition up
   front. Without its partition it refuses (CPU measured 80-90 s per query) and the route answers
   `UNRANKED`.

### Measurements (firedancer, 2026-10-01; case file kept outside this public repo)

12 FireOps primitive needs × EN/JA, phrased without the function name, plus 4 needs nothing
implements (× EN/JA):

| method | top-3 | top-10 | absence right |
|---|---|---|---|
| `concept` (before) | 13/24 | 16/24 | — |
| `definition`, embeddings only | 15/24 | 19/24 | — |
| `definition`, + helper folding + public prior + reranker | **21/24** | **23/24** | **8/8** |

Median latency 1.5 s on a shared, busy GPU. Remaining misses: a builder wording no candidate's doc
shares ("pointer jumping" vs "compose function tables"), and an older copy of an implementation
outranking the canonical one.

```sh
mise run bench:definitions -- --cases ~/.local/share/repo-retrieve/bench/<name>.json
```

