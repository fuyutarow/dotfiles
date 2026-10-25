# tools/repo-retrieve — `rr` (= `repo-retrieve`)

Part of the [tools/ architecture](../spec/architecture.md).

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
For first registration, follow [Bringing a new root into retrieval](#bringing-a-new-root-into-retrieval).
For an already registered project, run `repo-retrieve index` to execute `ccc index` and record
the freshness watermark. The index command waits for progress from `ccc status` or child output;
`--timeout-ms` is the maximum time without observable progress. Use `repo-retrieve index --detach`
to leave a background worker running, then `repo-retrieve index --status` to inspect completion.
The worker records the watermark only after indexing succeeds and HEAD remains unchanged from the
request.

A successful foreground index also completes the prior request it captured, provided its
verified watermark still matches current HEAD. The request retains its original `head` and
records `completedHead`; a newer request survives completion of older work, even at the same
HEAD. New detached requests carry unique IDs. Request writes and identity checks share a short
exclusive lock beside `INDEX_REQUEST.json`; an interrupted lock is reported for operator
inspection rather than expired automatically.

`index --status` reports `complete` for a fulfilled request with a current index, or `idle`
for a current index without a request. Pending, stale and malformed requests remain visible;
`invalid` includes a remedy and never silently deletes the record. `reindex=running` requires
an observed indexing daemon or a live recorded worker PID. An idle daemon without a live
worker reports `not-running`; unavailable activity information reports `unknown`. Status is
read-only. Counts describe ccc's stored corpus, while `gap` counts commits since the build;
neither counts pending requests.

Every `rr index` first plans the current file set with ccc's installed matcher and walker,
including nested `.gitignore`, exclude pruning, and `max_file_size`. Run `rr index --plan`
to inspect it using only the read-only matcher, without starting `ccc index`, refreshing the
definition catalog, or contacting the daemon. This holds for both admitted (exit 0) and refused
(exit 4) plans; only a completed real index warms the catalog. Stdout contains one JSONL record
per matched file (`path`, `bytes`, `est_chunks`, `kind`), followed by a `type: "summary"` record.
Stderr shows the ten largest directory/extension/kind contributors. Source and prose contributors
are informational only; suggested exclude lines name exact files classified as data, and ccc's
matcher checks that excluding one will not prune an included descendant. If an over-budget plan has
no safe data contributor, it says so and points to `[index]` in `.cocoindex_code/rr.toml`.

Declare the repo's budget in `.cocoindex_code/rr.toml`:

```toml
[index]
max_est_chunks = 50000
max_data_share = 0.20
max_seconds = 600
est_chunks_per_second = 50

# Fictional canonical files; exact paths, never patterns or directories.
[index.file_byte_allowances]
"docs/contracts/example-spec.md" = 2097152
"specifications/example-schema.json" = 131072
```

An optional `index.file_byte_allowances` table replaces only the individual byte ceiling
for each exact, normalized repository-relative file. Values must be finite positive safe
integer bytes (at most 9007199254740991). Absolute paths, traversal, glob characters,
backslashes, drive prefixes, noncanonical spellings, directories and symlink aliases are
rejected before indexing. Omission preserves the ordinary 1 MiB file / 64 KiB data-file
ceilings. This permission never includes a file excluded by ccc's matcher, `.gitignore`,
exclude patterns or `max_file_size`; configure ccc separately if its size exclusion is too
small for the intended candidate. The planner and backend retain the same candidate set.
Allowed files retain all file, byte, directory and chunk accounting, data share, content/blob
checks, measured-time gates and existing resource-control integration. Aggregate byte
backstops follow the effective `[index]` budget: total candidate bytes are limited to
`max_est_chunks × 800`, and data bytes to that total multiplied by `max_data_share`. The
defaults therefore remain 40,000,000 total bytes and 8,000,000 data bytes
(`50,000 × 800`, then `× 0.20`). The ordinary 1 MiB file / 64 KiB data-file ceilings are
independent and unchanged. Reads remain bounded by the derived total-byte backstop.
The existing `--accept-plan` override and advisory fallback time estimate remain unchanged.
Project `.cocoindex_code/rr.toml` owns this setting; `retrieval.toml` configures definition
retrieval and is not an index-policy source.

## Bringing a new root into retrieval

Run this procedure from the new repository root. `ccc init` registers the project and creates
its ccc configuration directory. Before the first index, build an admission plan and save its
JSONL stdout so the exact candidate set can be reviewed; the contributor report is on stderr:

```sh
ccc init
rr index --plan > /tmp/<repo>-rr-plan.jsonl
```

An exit status of 4 means the current configuration is not designed for this content: the
candidate corpus violates one or more admission limits, and ccc has not started. Read the plan's
summary and the largest directory, extension, and kind contributors printed on stderr. The
suggested exclude lines identify exact data files; inspect them and apply only exclusions that
fit the intended corpus. Use `.cocoindex_code/settings.yml` for ccc's corpus matching and size
selection (`include_patterns`, `exclude_patterns`, and `max_file_size`). Use
`.cocoindex_code/rr.toml` for the retrieval admission budget (`max_est_chunks`,
`max_data_share`, `max_seconds`, and the fallback `est_chunks_per_second`) and narrowly scoped
`file_byte_allowances` for exact files that should exceed the ordinary byte ceiling. Do not use
`--accept-plan`: revise the configuration so the selected corpus itself satisfies the gate.

Keep `max_seconds` at the time budget the host can afford. Set `max_est_chunks` to cover the
curated corpus while keeping it at or below the measured indexing rate multiplied by
`max_seconds`; this bounds estimated full-rebuild work to that time. Re-run
`rr index --plan > /tmp/<repo>-rr-plan.jsonl` after each configuration change and review both
the saved plan and the contributor report. Repeat until it exits 0. Then run plain `rr index`
to perform the gated index and record its freshness watermark. Confirm the final line is
`RESULT: INDEXED` before relying on semantic retrieval.

Worked example — `research-record-v2`: `settings.yml` curation reduced the estimate from 13,381
to 5,794 chunks; `rr.toml` used `max_est_chunks = 6000`, `max_data_share = 0.32`, and
`max_seconds = 600`. Plain `rr index` completed in 122.8 seconds.

These are also the defaults when omitted. Chunks are estimates, `ceil(Unicode characters / 800)`
per nonblank UTF-8 file; undecodable files remain in the matched file count with zero chunks,
as ccc skips their content. Directory totals use non-overlapping buckets capped at three levels.
Data share is the fraction of estimated chunks classified as data. Classification uses machine
format extensions, notebook outputs, long lines, digit/punctuation density, and minification.
For valid UTF-8, `MAX_CONTROL_BYTE_DENSITY = 0.001` permits stray control bytes
at or below 0.1% of raw file bytes. Count C0 bytes (`0x00`–`0x1f`) except tab,
LF, FF and CR, plus DEL (`0x7f`); any NUL independently makes the file a blob.
On 2026-10-25, installed ccc 0.2.42 indexed a disposable 6,441-byte Markdown
fixture containing one `0x08` at offset 1845 as one file and seven chunks.
It also indexed the NUL variant. The planner is intentionally stricter than ccc
for NUL and high control-byte density to protect against binary content. The
0.1% admission threshold tolerates occasional corruption (including the measured
case) while requiring at least 1,000 bytes per tolerated control byte. UTF-8
decoding failures remain blobs; file and aggregate ceilings are unchanged.

The configured chunks/s is a fallback estimate for a full rebuild, including files an incremental
index might reuse. A completed index records ccc's persisted chunk count and elapsed time in the
per-host `$XDG_STATE_HOME/repo-retrieve/<host>/index-rates.jsonl` file (default
`~/.local/state/repo-retrieve/<host>/index-rates.jsonl`). Plans use the median of the latest nine
rates when available and print whether the rate is measured or fallback. The time budget refuses a
plan only when a measured historical rate is available; the fallback estimate is advisory.

Exceeding any bound exits 4 before ccc starts, including with `--plan`. Invalid configuration or
an unavailable matcher exits 2. `--accept-plan` permits a normal index despite the preflight
violations and records the override in `.cocoindex_code/RR_ACCEPTED_PLAN.json`; it cannot be
combined with `--plan`. While indexing, elapsed time over `max_seconds` exits 125 and repeats
the contributor report. The stored chunk count measures corpus size; its net increase cannot
measure incremental work remaining, so it never triggers a projected ETA cancellation.
Only the client stops; the daemon remains running. The final FATAL names the wrapper limit and
its bound. The existing no-progress guard exits 124. A nonzero ccc child exit is identified as
a child exit status, with the last 16,384 characters of its stderr included in the final FATAL
(escaped onto one line). A native ccc exit 124 or 125 is never labeled as a wrapper limit.

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

### Measurements (2026-10-01; benchmark case file kept outside this public repository)

12 primitive needs × EN/JA, phrased without the function name, plus 4 needs nothing
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

## Search while another project indexes

Semantic searches retain their configured child timeout while another project indexes.
`RESULT: BUSY` (exit 75) names the queried project and is reserved for its own reindex;
another project's indexing does not make a search BUSY. A search timeout (exit 124)
reports daemon-wide indexing projects and states observed before the search and at the
timeout boundary. These are observations, not proof of the cause; an unavailable second
status probe is labeled explicitly and does not replace the original search timeout.

An isolated ccc 0.2.42 CPU trial on 2026-10-25 observed a search on an idle project B
exceed 20 seconds while project A indexed, versus a 1.82-second baseline. The rr search
exceeded its 15-second child limit and returned exit 124. A subsequent small B reindex
also failed to complete within 30 seconds while A remained indexing. These bounded
observations do not establish an infinite hang or reproduce the production GPU setup.
The installed daemon uses project-local index locks but shares the embedder and its
batch runner queue across projects; rr cannot cancel one upstream job or guarantee
cross-project embedding latency. No daemon restart is performed by a timed-out search.

## Derived research-record-v1 text view

`views/research-record-v1.ts` builds a regenerable Markdown view outside the frozen
v1 store. Each `<full-hash>-<kind>.md` contains verbatim statement text and a short
header with hash, kind, mode, explicit status/closing_condition, source object path
and fragment id. Other metadata stays in the source store. The reader validates
FORMAT, each fragment MANIFEST and canonical hashes, stream-hashes raw payloads,
and never writes to the store. Run from any directory:

```sh
bun /path/to/dotfiles/tools/repo-retrieve/views/research-record-v1.ts \
  --store "$HOME/Workspace/research-record-v1" \
  --out "$HOME/.local/share/rr-views/research-record-v1-sharded-2" \
  --kinds statement --shards 2
```

Use a fresh dedicated output when changing kinds or shard count; nothing is deleted.
Repeated exports reuse byte-identical files. Optional `--shards N` (1–16) partitions
all selected objects by `floor(first_hash_hex_digit * N / 16)` into `shard-01`, etc.
Each shard is a separate ccc project: run `ccc init`, configure its own settings.yml
and rr.toml with `max_seconds = 600`, then save `rr index --plan` before indexing.
Include all statement files in each shard; no hash sampling or size exclusions are
needed. For a canonical statement over the planner's per-file byte ceiling, declare
its exact filename and byte size in `[index.file_byte_allowances]`; all chunk,
aggregate-byte and time gates still apply. Choose the smallest shard count whose
every plan fits. This preserves 100% coverage across the shard union.

Stdout reports physical object occurrences by top-level kind (raw payloads separately),
source bytes, selected occurrences, and output files/bytes. Nested run input kinds
are not separate objects. Duplicate hashes share a file; sorted traversal chooses the
last source path deterministically. Memory holds one fragment inventory and one record,
while payload bytes stream. The view is derived data, not a v1 authority. Re-plan after
regeneration. The measured 105.67 chunks/s rate came from a contended host; rate history
must remain untouched. On 2026-10-25, the slim full view contained 54,078 statements
(95,312,479 bytes). Two shards are the minimum at that measured rate: the exact
126,296-chunk union exceeds one 600-second job. Groups `0–7` and `8–f` contain
63,053 and 63,243 chunks. Use `max_est_chunks = 63399`, `max_data_share = 0.20`,
`max_seconds = 600` and fallback `est_chunks_per_second = 105` for each shard.
Register and plan each shard directory separately, then index sequentially when
host load permits. Earlier full-view and three-shard directories are superseded;
the final two-shard union retains every statement.
