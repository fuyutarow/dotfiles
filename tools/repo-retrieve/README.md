# tools/repo-retrieve — `rr` (= `repo-retrieve`)

The search router. The caller says WHAT it is looking for; the router picks the engine. In an
operational ccc repo the `enforce-search-route` hook denies raw search and points here.

```text
rr text   '<exact>'          -> rg (fixed string)          old name: literal
rr regex  '<re>'             -> rg (regex)                 old name: exhaustive
rr files  '<glob>'           -> rg --files
rr about  '<meaning>'        -> ccc search (JA or EN)      old name: concept
rr absent -q a -q b -q c     -> ccc search, >=3 paraphrases, before claiming absence   (battery)
rr exists '<what it does>'   -> definition catalog + judge: "is it already written?"   (definition)
rr shape  '<code by example>'-> ccc grep                   old name: structural
rr symbol                    -> exit 2: known symbols belong to Serena
rr index                     -> ccc index, record the freshness watermark, warm the definition catalog
rr index --detach            -> request indexing in a background worker and return
rr index --status             -> inspect the detached request and its daemon state
```

Old names stay as aliases; a query may be given positionally or with `--query`/`-q`. The RESULT
lines keep the old internal labels (`route=literal` …) because other tools parse them.

| file                       | responsibility                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/repo-retrieve.ts`     | the CLI (Cleye) and the routes — the only entry point                                                                                                                                          |
| `src/ccc-index.ts`         | ccc index adapter: registration lookup, the `.cocoindex_code/INDEXED_AT` watermark, the NO_INDEX gate concept/battery run before serving, and the `index` action (the watermark's only writer) |
| `src/child.ts`             | bounded child-process helpers (exit 124 on timeout)                                                                                                                                            |
| `src/definitions.ts`       | the `definition` route: catalog freshness, recall, rerank, cards                                                                                                                               |
| `src/ccc_defs.py`          | definition extractor under ccc's interpreter (ccc's scope + tree-sitter patterns), per-file cache                                                                                              |
| `src/rerank_server.py`     | resident cross-encoder (Qwen3-Reranker-0.6B), socket-activated, inside its VRAM partition                                                                                                      |
| `src/bench-definitions.ts` | the yardstick: top-1/3/10 per language + absence, on a private case file                                                                                                                       |

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

## NO_INDEX and lexical NO_MATCH

`about`, `absent`, and `exists` refuse to answer when the selected repo has no fresh certified ccc
index. They exit 3 and write a NO_INDEX diagnostic to stderr with daemon status, the recovery
command, and the lexical routes that remain available. `--json` adds a stdout object with
`status: "NO_INDEX"` and `verdict: "UNVERIFIED"`; it never reports an unverified answer as PASS.
For a new project, from its root run `ccc init && repo-retrieve index`. For an already registered
project, run `repo-retrieve index` to execute `ccc index` and record the freshness watermark. The
index command waits for progress from `ccc status` or child output; `--timeout-ms` is the maximum
time without observable progress. Use `repo-retrieve index --detach` to leave a background worker
running, then `repo-retrieve index --status` to inspect completion. The worker records the
watermark only after indexing succeeds and HEAD remains unchanged from the request.

Every `rr index` first plans the current file set with ccc's installed matcher and walker,
including nested `.gitignore`, exclude pruning, and `max_file_size`. Run `rr index --plan`
to inspect it without starting ccc or contacting the daemon. Stdout contains one JSONL record
per matched file (`path`, `bytes`, `est_chunks`, `kind`), followed by a `type: "summary"` record.
Stderr shows the ten largest directory/extension contributors with exclude lines for
`.cocoindex_code/settings.yml`. Suggestions are checked with ccc's matcher; if a glob would
prune an included file's parent directory, exact file excludes replace it.

Declare the repo's budget in `.cocoindex_code/rr.toml`:

```toml
[index]
max_est_chunks = 50000
max_data_share = 0.20
max_seconds = 600
est_chunks_per_second = 50
```

These are also the defaults when omitted. Chunks are estimates, `ceil(Unicode characters / 800)`
per nonblank UTF-8 file; undecodable files remain in the matched file count with zero chunks,
as ccc skips their content. Directory totals use non-overlapping buckets capped at three levels.
Data share is the fraction of estimated chunks classified as data. Classification uses machine
format extensions, notebook outputs, long lines, digit/punctuation density, and minification.
The assumed chunks/s estimates GPU seconds for a full rebuild, including files an incremental
index might reuse; it is not a hardware benchmark.

Exceeding any bound exits 4 before ccc starts, including with `--plan`. Invalid configuration or
an unavailable matcher exits 2. `--accept-plan` permits a normal index despite the preflight
violations and records the override in `.cocoindex_code/RR_ACCEPTED_PLAN.json`; it cannot be
combined with `--plan`. The time bound still applies. While indexing, increases in ccc's reported
persisted chunk count provide a measured chunks/s and remaining ETA. An estimated total duration
over `max_seconds` exits 125 and repeats the contributor report. If replacement/deletion work
does not increase the chunk count, no embedding rate is claimed; elapsed time still enforces the
bound. Only the client stops; the daemon remains running. The existing no-progress guard exits 124.

Lexical NO_MATCH results from `text`, `regex`, and `files` name the repo root they searched and
state that paths outside it were not searched. For path-like patterns and scratch-looking queries,
they also point to `/tmp/claude-<uid>/` and `$TMPDIR`. The search hook permits plain `fd`/`rg` with
an explicit outside path when run outside any registered ccc project.

```sh
mise run test:retrieval-control   # fake ccc/rg executables; no real index needed
```

## `definition` — before writing a function

```sh
rr exists --query 'Int16 の加算を飽和させて折り返さないようにする'
```

Describe the behaviour (English or Japanese), not the name. The answer is a few cards — name,
signature, location, the first doc line — then one of:

| RESULT                 | exit | meaning                                                                  |
| ---------------------- | ---- | ------------------------------------------------------------------------ |
| `PASS strength=strong` | 0    | the top card is the same function (reranker log-odds ≥ 4)                |
| `PASS strength=likely` | 0    | read the top cards before writing a new one                              |
| `NO_DEFINITION`        | 1    | nothing in the catalog does this; the cards are the nearest, not matches |
| `UNRANKED`             | 0    | the reranker was unavailable: embedding order, no judgement              |

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
   `tools/agent-resource-run/resource-policy.toml`, hard-capped in-process by
   `tools/agent-resource-run/gpu_partition.py`; agent-resource-run reserves the same partition up
   front. Without its partition it refuses (CPU measured 80-90 s per query) and the route answers
   `UNRANKED`.

### Measurements (firedancer, 2026-10-01; case file kept outside this public repo)

12 FireOps primitive needs × EN/JA, phrased without the function name, plus 4 needs nothing
implements (× EN/JA):

| method                                                   | top-3     | top-10    | absence right |
| -------------------------------------------------------- | --------- | --------- | ------------- |
| `concept` (before)                                       | 13/24     | 16/24     | —             |
| `definition`, embeddings only                            | 15/24     | 19/24     | —             |
| `definition`, + helper folding + public prior + reranker | **21/24** | **23/24** | **8/8**       |

Median latency 1.5 s on a shared, busy GPU. Remaining misses: a builder wording no candidate's doc
shares ("pointer jumping" vs "compose function tables"), and an older copy of an implementation
outranking the canonical one.

```sh
mise run bench:definitions -- --cases ~/.local/share/repo-retrieve/bench/<name>.json
```
